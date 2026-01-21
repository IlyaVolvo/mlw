import type { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const { Pool } = pg;

// Debug: Log DATABASE_URL status (don't log the actual URL for security)
const hasDatabaseUrl = !!process.env.DATABASE_URL;
console.log('DATABASE_URL configured:', hasDatabaseUrl);
if (!hasDatabaseUrl) {
  console.error('ERROR: DATABASE_URL environment variable is not set!');
}

// Parse connection string and ensure SSL is properly configured for Supabase
const connectionString = process.env.DATABASE_URL;
if (connectionString) {
  // Extract hostname for debugging (without password)
  const urlMatch = connectionString.match(/@([^:]+)/);
  const hostname = urlMatch ? urlMatch[1] : 'unknown';
  console.log('Database connection string hostname:', hostname);
}

const pool = new Pool({
  connectionString: connectionString,
  // Supabase requires SSL, so enable it if connection string is provided
  ssl: connectionString ? {
    rejectUnauthorized: false // Required for Supabase
  } : false
});

const query = (text: string, params?: any[]) => pool.query(text, params);

const generateToken = (userId: number, email: string) => {
  return jwt.sign({ userId, email }, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Register request received', { email: req.body.email });
    const { email, password } = req.body;

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

    // Create user
    try {
      const result = await query(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
        [email, passwordHash]
      );

      const userId = result.rows[0].id;
      const token = generateToken(userId, email);

      res.json({
        token,
        user: {
          id: userId,
          email,
        },
      });
    } catch (dbError: any) {
      if (dbError.code === '23505' || dbError.message?.includes('UNIQUE constraint') || dbError.message?.includes('unique_violation')) {
        return res.status(400).json({ error: 'Email already exists' });
      }
      throw dbError;
    }
  } catch (error) {
    console.error('Registration error', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
}
