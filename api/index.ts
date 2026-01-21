import type { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const { Pool } = pg;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

const query = (text: string, params?: any[]) => pool.query(text, params);

// Logger
const logger = {
  info: (msg: string, meta?: any) => console.log(JSON.stringify({ level: 'info', msg, ...meta })),
  error: (msg: string, err?: any) => console.error(JSON.stringify({ level: 'error', msg, error: err }))
};

// JWT utilities
const generateToken = (userId: number, email: string) => {
  return jwt.sign({ userId, email }, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
};

const app = express();

// Request and response logging middleware - logs all incoming requests and responses
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const environment = process.env.VERCEL ? 'vercel' : 'local';
  
  // Log request
  logger.info('Request received', {
    environment,
    timestamp,
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
      environment,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode
    });
    return originalSend.call(this, data);
  };
  
  next();
});

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());

// Health check
app.get('/api/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

// Auth routes
const authRoutes = express.Router();

// Register
authRoutes.post('/register', async (req, res) => {
  try {
    logger.info('Register request received', { email: req.body.email });
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
    logger.error('Registration error', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Login
authRoutes.post('/login', async (req, res) => {
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
      },
    });
  } catch (error) {
    logger.error('Login error', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// Get current user
authRoutes.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production') as { userId: number; email: string };
      
      const result = await query('SELECT id, email, created_at FROM users WHERE id = $1', [decoded.userId]);
      const user = result.rows[0];

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ user });
    } catch (jwtError) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (error) {
    logger.error('Get user error', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Games routes (simplified)
const gamesRoutes = express.Router();

gamesRoutes.get('/daily', async (_req, res) => {
  try {
    const result = await query('SELECT * FROM games WHERE date = CURRENT_DATE ORDER BY created_at DESC LIMIT 1');
    const game = result.rows[0];
    
    if (!game) {
      return res.status(404).json({ error: 'No daily game found' });
    }
    
    res.json({ game });
  } catch (error) {
    logger.error('Get daily game error', error);
    res.status(500).json({ error: 'Failed to get daily game' });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/games', gamesRoutes);

// Log all registered routes at startup
const logRegisteredRoutes = () => {
  const environment = process.env.VERCEL ? 'vercel' : 'local';
  const routes: Array<{ method: string; path: string }> = [];
  
  // Health check
  routes.push({ method: 'GET', path: '/api/health' });
  
  // Auth routes
  routes.push({ method: 'POST', path: '/api/auth/register' });
  routes.push({ method: 'POST', path: '/api/auth/login' });
  routes.push({ method: 'GET', path: '/api/auth/me' });
  
  // Games routes
  routes.push({ method: 'GET', path: '/api/games/daily' });
  
  logger.info('Registered routes', {
    environment,
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
    environment,
    grouped
  });
};

// Log routes when module loads
logRegisteredRoutes();

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error in request', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return app(req, res);
}

