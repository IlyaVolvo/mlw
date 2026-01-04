import pg from 'pg';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

// Create connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'mlw',
  user: process.env.DB_USER || process.env.USER || 'postgres', // Use system user as default on macOS
  password: process.env.DB_PASSWORD || '',
});

// Initialize database schema
async function initializeSchema() {
  const client = await pool.connect();
  try {
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        verified INTEGER DEFAULT 0
      )
    `);

    // Create password_reset_tokens table
    await client.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create games table
    await client.query(`
      CREATE TABLE IF NOT EXISTS games (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        language VARCHAR(10) NOT NULL,
        word_length INTEGER NOT NULL,
        target_word VARCHAR(50) NOT NULL,
        game_date VARCHAR(50) NOT NULL,
        is_random_mode INTEGER DEFAULT 0,
        word_seed BIGINT,
        is_complete INTEGER DEFAULT 0,
        guesses TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_games_user_date ON games(user_id, game_date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_games_user_lang ON games(user_id, language, word_length)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_reset_tokens_token ON password_reset_tokens(token)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id)');

    logger.info('Database schema initialized');
  } catch (error) {
    logger.error('Failed to initialize database schema', error);
    throw error;
  } finally {
    client.release();
  }
}

// Initialize schema (don't block on import, will happen async)
initializeSchema().catch((error) => {
  logger.error('Failed to initialize database schema on startup', error);
  // Don't exit - let the app start and handle connection errors when queries are made
});

// Export query helper function
export async function query(text: string, params?: any[]) {
  return pool.query(text, params);
}

// Export pool for transactions if needed
export default pool;
