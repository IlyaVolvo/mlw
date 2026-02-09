import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({
  connectionString: connectionString,
  ssl: connectionString ? {
    rejectUnauthorized: false
  } : false
});

const query = (text: string, params?: any[]) => pool.query(text, params);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
    const resetToken = tokenResult.rows[0];

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
    console.error('Reset password error', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
}
