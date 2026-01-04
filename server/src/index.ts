import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import gamesRoutes from './routes/games.js';
import pool from './db/database.js';
import { query } from './db/database.js';
import { logger } from './utils/logger.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3101;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/games', gamesRoutes);

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error in request', err);
  res.status(500).json({ error: 'Internal server error' });
});

try {
  app.listen(PORT, () => {
    const message = `Server running on port ${PORT}`;
    const dbMessage = `Database: PostgreSQL (${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'mlw'})`;
    logger.info(message);
    logger.info(dbMessage);
  });
} catch (error) {
  logger.error('Failed to start server', error);
  process.exit(1);
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

