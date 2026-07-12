import express from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { query } from '../db/database.js';
import { generateToken, authenticateToken, AuthRequest } from '../middleware/auth.js';
import { sendPasswordResetEmail, sendFeedbackEmail } from '../utils/email.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    logger.info('Register request received', { email: req.body.email });
    const { email, password, lastReleaseIndex } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Check if user exists
    const existingUserResult = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUserResult.rows.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    const verifiedIndex = typeof lastReleaseIndex === 'number' && lastReleaseIndex >= 0 ? lastReleaseIndex : 0;
    try {
      const result = await query(
        'INSERT INTO users (email, password_hash, verified) VALUES ($1, $2, $3) RETURNING id',
        [email, passwordHash, verifiedIndex]
      );

      const userId = result.rows[0].id;
      const token = generateToken(userId, email);

      res.json({
        token,
        user: {
          id: userId,
          email,
          verified: verifiedIndex,
        },
      });
    } catch (dbError: any) {
      // Handle database constraint violations (e.g., UNIQUE constraint)
      if (dbError.code === '23505' || dbError.message?.includes('UNIQUE constraint') || dbError.message?.includes('unique_violation')) {
        return res.status(400).json({ error: 'Email already exists' });
      }
      throw dbError; // Re-throw other errors
    }
  } catch (error) {
    logger.error('Registration error', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0] as {
      id: number;
      email: string;
      password_hash: string;
      verified: number | null;
    } | undefined;

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user.id, user.email);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        verified: user.verified ?? 0,
      },
    });
  } catch (error) {
    logger.error('Login error', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email, baseUrl } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Find user
    const result = await query('SELECT id FROM users WHERE email = $1', [email]);
    const user = result.rows[0] as {
      id: number;
    } | undefined;

    // Don't reveal if user exists for security
    if (user) {
      // Generate reset token
      const resetToken = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 6 * 3600000); // 6 hours from now

      // Delete old tokens for this user
      await query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND used = 0', [user.id]);

      // Store new token
      await query(
        'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
        [user.id, resetToken, expiresAt.toISOString()]
      );

      // Send email
      try {
        await sendPasswordResetEmail(email, resetToken, baseUrl || 'http://localhost:3100');
        logger.info('Password reset email sent successfully', { email });
      } catch (emailError: any) {
        logger.error('Failed to send password reset email', {
          email,
          error: emailError?.message || emailError,
          code: emailError?.code,
          response: emailError?.response,
          stack: emailError?.stack,
        });
        // Still return success to not reveal if email exists
        // But log the error for debugging
      }
    }

    // Always return success (security: don't reveal if email exists)
    res.json({ message: 'If the email exists, a password reset link has been sent' });
  } catch (error) {
    logger.error('Forgot password error', error);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Find token
    const tokenResult = await query(
      'SELECT * FROM password_reset_tokens WHERE token = $1 AND used = 0',
      [token]
    );
    const resetToken = tokenResult.rows[0] as {
      id: number;
      user_id: number;
      expires_at: Date;
    } | undefined;

    if (!resetToken) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    // Check if expired
    if (new Date(resetToken.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Token has expired' });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 10);

    // Update password
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, resetToken.user_id]);

    // Mark token as used
    await query('UPDATE password_reset_tokens SET used = 1 WHERE id = $1', [resetToken.id]);

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    logger.error('Reset password error', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const jwt = await import('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

    try {
      const decoded = jwt.default.verify(token, JWT_SECRET) as { userId: number; email: string };
      const payload = decoded;
      
      const result = await query('SELECT id, email, created_at, verified FROM users WHERE id = $1', [payload.userId]);
      const user = result.rows[0] as {
        id: number;
        email: string;
        created_at: Date;
        verified: number | null;
      } | undefined;

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ user: { id: user.id, email: user.email, created_at: user.created_at, verified: user.verified ?? 0 } });
    } catch (jwtError) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (error) {
    logger.error('Get user error', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Get user preferences
router.get('/preferences', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const result = await query(
      'SELECT selected_languages FROM user_preferences WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      // No preferences yet, return null (means all languages)
      return res.json({ selectedLanguages: null });
    }

    const prefs = result.rows[0];
    // If selected_languages is empty array, return null (means all languages)
    const selectedLanguages = (prefs.selected_languages || []).length > 0 
      ? prefs.selected_languages 
      : null;

    res.json({ selectedLanguages });
  } catch (error) {
    logger.error('Get preferences error', error);
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

// Send feedback (requires auth)
router.post('/send-feedback', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userEmail = req.email!;
    const { comments } = req.body;

    if (!comments || typeof comments !== 'string' || !comments.trim()) {
      return res.status(400).json({ error: 'Comments are required' });
    }

    await sendFeedbackEmail(userEmail, comments.trim());
    res.json({ success: true, message: 'Feedback sent successfully' });
  } catch (error) {
    logger.error('Send feedback error', error);
    res.status(500).json({ error: 'Failed to send feedback' });
  }
});

// Save user preferences (also accepts lastSeenReleaseIndex to update users.verified)
router.post('/preferences', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { selectedLanguages, lastSeenReleaseIndex } = req.body;

    if (typeof lastSeenReleaseIndex === 'number' && lastSeenReleaseIndex >= 0) {
      await query('UPDATE users SET verified = $1 WHERE id = $2', [lastSeenReleaseIndex, userId]);
    }

    if (selectedLanguages !== undefined) {
      const languagesArray = selectedLanguages && Array.isArray(selectedLanguages) 
        ? selectedLanguages 
        : null;

      await query(
        `INSERT INTO user_preferences (user_id, selected_languages, updated_at) 
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id) 
         DO UPDATE SET selected_languages = $2, updated_at = CURRENT_TIMESTAMP`,
        [userId, languagesArray || []]
      );
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Save preferences error', error);
    res.status(500).json({ error: 'Failed to save preferences' });
  }
});

export default router;
