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
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

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
    console.error('Login error', error);
    res.status(500).json({ error: 'Failed to login' });
  }
}
