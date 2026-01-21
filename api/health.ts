import type { VercelRequest, VercelResponse } from '@vercel/node';
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Health check - DATABASE_URL configured:', !!process.env.DATABASE_URL);
    console.log('Health check - Connection string starts with:', process.env.DATABASE_URL?.substring(0, 20) || 'NOT SET');
    
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error: any) {
    console.error('Health check error:', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      syscall: error.syscall,
      address: error.address,
      port: error.port
    });
    res.status(500).json({ 
      status: 'error', 
      database: 'disconnected',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
