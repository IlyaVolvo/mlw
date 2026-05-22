import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { logger } from './utils/logger.js';

dotenv.config();

const OFFLINE_MODE = process.env.OFFLINE_MODE === 'true';
const app = express();
const PORT = process.env.PORT || 3101;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Request and response logging middleware - logs all incoming requests and responses
app.use((req, res, next) => {
  // Log request
  logger.info('Request received', {
    environment: 'local',
    method: req.method,
    path: req.path,
    url: req.url,
    query: req.query,
    ip: req.ip || req.socket.remoteAddress
  });
  
  // Override res.send to log response
  const originalSend = res.send;
  res.send = function(data) {
    logger.info('Response sent', {
      environment: 'local',
      method: req.method,
      path: req.path,
      statusCode: res.statusCode
    });
    return originalSend.call(this, data);
  };
  
  next();
});

app.use(cors());
app.use(express.json());

if (OFFLINE_MODE) {
  // Offline mode: analytics + static file serving, no PostgreSQL
  const { accessLogMiddleware } = await import('./middleware/accessLog.js');
  const analyticsRoutes = (await import('./routes/analytics.js')).default;

  app.use(accessLogMiddleware);
  app.use('/api/analytics', analyticsRoutes);

  // Health check (no DB)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', mode: 'offline' });
  });

  // Serve static frontend build
  const distPath = path.resolve(__dirname, '../../dist');
  app.use(express.static(distPath));
  // SPA fallback
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  // Online mode: PostgreSQL + auth + games
  const { default: pool, query } = await import('./db/database.js');
  const authRoutes = (await import('./routes/auth.js')).default;
  const gamesRoutes = (await import('./routes/games.js')).default;

  // Health check
  app.get('/health', async (_req, res) => {
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

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Shutting down gracefully...');
    await pool.end();
    process.exit(0);
  });
}


// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error in request', err);
  res.status(500).json({ error: 'Internal server error' });
});

try {
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} (mode: ${OFFLINE_MODE ? 'offline' : 'online'})`);
    if (!OFFLINE_MODE) {
      logger.info(`Database: PostgreSQL (${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'mlw'})`);
    }
  });
} catch (error) {
  logger.error('Failed to start server', error);
  process.exit(1);
}

// Graceful shutdown for SQLite in offline mode
if (OFFLINE_MODE) {
  process.on('SIGINT', async () => {
    logger.info('Shutting down gracefully...');
    const { closeSqliteDb } = await import('./db/sqlite.js');
    closeSqliteDb();
    process.exit(0);
  });
}

