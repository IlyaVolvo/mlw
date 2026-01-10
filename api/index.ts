import type { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import cors from 'cors';

// Import routes from built server
// These will be available after server build completes
import authRoutes from '../server/dist/routes/auth.js';
import gamesRoutes from '../server/dist/routes/games.js';
import { query } from '../server/dist/db/database.js';
import { logger } from '../server/dist/utils/logger.js';

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
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
app.use('/auth', authRoutes);
app.use('/games', gamesRoutes);

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error in request', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return app(req, res);
}

