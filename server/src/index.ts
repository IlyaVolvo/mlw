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

// Log all registered routes at startup
const logRegisteredRoutes = () => {
  const routes: Array<{ method: string; path: string }> = [];
  
  // Health check
  routes.push({ method: 'GET', path: '/health' });
  
  // Auth routes
  routes.push({ method: 'POST', path: '/api/auth/register' });
  routes.push({ method: 'POST', path: '/api/auth/login' });
  routes.push({ method: 'POST', path: '/api/auth/forgot-password' });
  routes.push({ method: 'POST', path: '/api/auth/reset-password' });
  routes.push({ method: 'GET', path: '/api/auth/me' });
  routes.push({ method: 'GET', path: '/api/auth/preferences' });
  routes.push({ method: 'POST', path: '/api/auth/preferences' });
  
  // Games routes
  routes.push({ method: 'GET', path: '/api/games/current' });
  routes.push({ method: 'GET', path: '/api/games/completed' });
  routes.push({ method: 'POST', path: '/api/games/save' });
  routes.push({ method: 'GET', path: '/api/games/history' });
  
  logger.info('Registered routes', {
    environment: 'local',
    totalRoutes: routes.length,
    routes: routes.map(r => `${r.method} ${r.path}`).sort()
  });
  
  // Log grouped by prefix
  const grouped: Record<string, string[]> = {};
  routes.forEach(route => {
    const prefix = route.path.split('/').slice(0, 3).join('/');
    if (!grouped[prefix]) {
      grouped[prefix] = [];
    }
    grouped[prefix].push(`${route.method} ${route.path}`);
  });
  
  logger.info('Routes by prefix', {
    environment: 'local',
    grouped
  });
};

// Log routes after routes are registered
logRegisteredRoutes();

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
    logger.info('All routes logged above');
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

