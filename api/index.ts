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

// Authentication middleware
interface AuthRequest extends express.Request {
  userId?: number;
  email?: string;
}

const authenticateToken = (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production', (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    const payload = decoded as { userId: number; email: string };
    req.userId = payload.userId;
    req.email = payload.email;
    next();
  });
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

// Get preferences
authRoutes.get('/preferences', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const result = await query(
      'SELECT selected_languages FROM user_preferences WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({ selectedLanguages: null });
    }

    res.json({ selectedLanguages: result.rows[0].selected_languages || [] });
  } catch (error) {
    logger.error('Get preferences error', error);
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

// Save preferences
authRoutes.post('/preferences', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { selectedLanguages } = req.body;

    const languagesArray = Array.isArray(selectedLanguages) ? selectedLanguages : [];

    await query(
      `INSERT INTO user_preferences (user_id, selected_languages, updated_at) 
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) 
       DO UPDATE SET selected_languages = $2, updated_at = CURRENT_TIMESTAMP`,
      [userId, languagesArray || []]
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Save preferences error', error);
    res.status(500).json({ error: 'Failed to save preferences' });
  }
});

// Games routes
const gamesRoutes = express.Router();

// Get current game state
gamesRoutes.get('/current', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { language, wordLength, gameDate, isRandomMode, wordSeed } = req.query;

    let queryText = 'SELECT * FROM games WHERE user_id = $1 AND is_complete = 0';
    const params: any[] = [userId];
    let paramIndex = 2;

    if (language) {
      queryText += ` AND language = $${paramIndex}`;
      params.push(language);
      paramIndex++;
    }
    if (wordLength) {
      queryText += ` AND word_length = $${paramIndex}`;
      params.push(parseInt(wordLength as string));
      paramIndex++;
    }
    if (gameDate) {
      queryText += ` AND game_date = $${paramIndex}`;
      params.push(gameDate);
      paramIndex++;
    }
    if (isRandomMode !== undefined) {
      queryText += ` AND is_random_mode = $${paramIndex}`;
      params.push(isRandomMode === 'true' ? 1 : 0);
      paramIndex++;
    }
    if (wordSeed) {
      queryText += ` AND word_seed = $${paramIndex}`;
      params.push(parseInt(wordSeed as string));
      paramIndex++;
    }

    queryText += ' ORDER BY created_at DESC LIMIT 1';

    const result = await query(queryText, params);
    const game = result.rows[0] as any;

    if (!game) {
      return res.json({ game: null });
    }

    // Handle PostgreSQL array - ensure it's a proper array
    const guessesArray = Array.isArray(game.guesses) ? game.guesses : (game.guesses ? [game.guesses] : []);
    res.json({
      game: {
        id: game.id,
        user_id: game.user_id,
        language: game.language,
        word_length: game.word_length,
        target_word: game.target_word,
        game_date: game.game_date,
        is_random_mode: game.is_random_mode,
        word_seed: game.word_seed,
        is_complete: game.is_complete,
        created_at: game.created_at ? new Date(game.created_at).toISOString() : null,
        completed_at: game.completed_at ? new Date(game.completed_at).toISOString() : null,
        guesses: guessesArray.map((word: string) => ({ word, evaluations: [] })),
        isWon: guessesArray.includes(game.target_word),
        guessesCount: guessesArray.length,
      },
    });
  } catch (error) {
    logger.error('Get current game error', error);
    res.status(500).json({ error: 'Failed to get current game' });
  }
});

// Get completed game
gamesRoutes.get('/completed', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { language, wordLength, gameDate, isRandomMode, wordSeed } = req.query;

    let queryText = 'SELECT * FROM games WHERE user_id = $1 AND is_complete = 1';
    const params: any[] = [userId];
    let paramIndex = 2;

    if (language) {
      queryText += ` AND language = $${paramIndex}`;
      params.push(language);
      paramIndex++;
    }
    if (wordLength) {
      queryText += ` AND word_length = $${paramIndex}`;
      params.push(parseInt(wordLength as string));
      paramIndex++;
    }
    if (gameDate) {
      queryText += ` AND game_date = $${paramIndex}`;
      params.push(gameDate);
      paramIndex++;
    }
    if (isRandomMode !== undefined) {
      queryText += ` AND is_random_mode = $${paramIndex}`;
      params.push(isRandomMode === 'true' ? 1 : 0);
      paramIndex++;
    }
    if (wordSeed) {
      queryText += ` AND word_seed = $${paramIndex}`;
      params.push(parseInt(wordSeed as string));
      paramIndex++;
    }

    queryText += ' ORDER BY created_at DESC LIMIT 1';

    const result = await query(queryText, params);
    const game = result.rows[0] as any;

    if (!game) {
      return res.json({ game: null });
    }

    const guessesArray = Array.isArray(game.guesses) ? game.guesses : (game.guesses ? [game.guesses] : []);
    res.json({
      game: {
        id: game.id,
        user_id: game.user_id,
        language: game.language,
        word_length: game.word_length,
        target_word: game.target_word,
        game_date: game.game_date,
        is_random_mode: game.is_random_mode,
        word_seed: game.word_seed,
        is_complete: game.is_complete,
        created_at: game.created_at ? new Date(game.created_at).toISOString() : null,
        completed_at: game.completed_at ? new Date(game.completed_at).toISOString() : null,
        guesses: guessesArray.map((word: string) => ({ word, evaluations: [] })),
        isWon: guessesArray.includes(game.target_word),
        guessesCount: guessesArray.length,
      },
    });
  } catch (error) {
    logger.error('Get completed game error', error);
    res.status(500).json({ error: 'Failed to get completed game' });
  }
});

// Save game state
gamesRoutes.post('/save', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { language, wordLength, targetWord, gameDate, isRandomMode, wordSeed, guesses, isComplete } = req.body;

    if (!language || !wordLength || !targetWord || !gameDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if game already exists
    let queryText = 'SELECT * FROM games WHERE user_id = $1 AND language = $2 AND word_length = $3 AND game_date = $4 AND is_random_mode = $5';
    const queryParams: any[] = [userId, language, wordLength, gameDate, isRandomMode ? 1 : 0];
    let paramIndex = 6;
    
    if (wordSeed !== undefined && wordSeed !== null) {
      queryText += ` AND word_seed = $${paramIndex}`;
      queryParams.push(wordSeed);
      paramIndex++;
    } else {
      queryText += ' AND word_seed IS NULL';
    }

    queryText += ' ORDER BY created_at DESC LIMIT 1';

    const existingResult = await query(queryText, queryParams);
    const existingGame = existingResult.rows[0] as any;

    if (existingGame) {
      // Update existing game
      await query(
        'UPDATE games SET target_word = $1, is_complete = $2, guesses = $3, completed_at = $4 WHERE id = $5',
        [
          targetWord,
          isComplete ? 1 : 0,
          (guesses || []).map((g: any) => typeof g === 'string' ? g : g.word),
          isComplete ? new Date().toISOString() : null,
          existingGame.id
        ]
      );

      res.json({ success: true, gameId: existingGame.id });
    } else {
      // Insert new game
      try {
        const result = await query(
          'INSERT INTO games (user_id, language, word_length, target_word, game_date, is_random_mode, word_seed, is_complete, guesses, completed_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
          [
            userId,
            language,
            wordLength,
            targetWord,
            gameDate,
            isRandomMode ? 1 : 0,
            wordSeed || null,
            isComplete ? 1 : 0,
            (guesses || []).map((g: any) => typeof g === 'string' ? g : g.word),
            isComplete ? new Date().toISOString() : null
          ]
        );

        res.json({ success: true, gameId: result.rows[0].id });
      } catch (insertError: any) {
        if (insertError.code === '23505') { // Unique violation
          const retryResult = await query(queryText, queryParams);
          const retryGame = retryResult.rows[0] as any;
          
          if (retryGame) {
            await query(
              'UPDATE games SET target_word = $1, is_complete = $2, guesses = $3, completed_at = $4 WHERE id = $5',
              [
                targetWord,
                isComplete ? 1 : 0,
                (guesses || []).map((g: any) => typeof g === 'string' ? g : g.word),
                isComplete ? new Date().toISOString() : null,
                retryGame.id
              ]
            );
            res.json({ success: true, gameId: retryGame.id });
          } else {
            throw insertError;
          }
        } else {
          throw insertError;
        }
      }
    }
  } catch (error) {
    logger.error('Save game error', error);
    res.status(500).json({ error: 'Failed to save game' });
  }
});

// Get game history
gamesRoutes.get('/history', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { language, wordLength, limit = 100 } = req.query;

    let queryText = `
      SELECT 
        id,
        user_id,
        is_random_mode,
        created_at,
        completed_at,
        language,
        word_length,
        target_word,
        game_date,
        guesses,
        is_complete
      FROM games 
      WHERE user_id = $1 AND is_random_mode = 0
    `;
    const params: any[] = [userId];
    let paramIndex = 2;

    if (language) {
      queryText += ` AND language = $${paramIndex}`;
      params.push(language);
      paramIndex++;
    }
    if (wordLength) {
      queryText += ` AND word_length = $${paramIndex}`;
      params.push(parseInt(wordLength as string));
      paramIndex++;
    }

    queryText += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit as string));

    const result = await query(queryText, params);
    const games = result.rows as any[];

    res.json({
      games: games.map((game) => {
        const guessesArray = Array.isArray(game.guesses) ? game.guesses : (game.guesses ? [game.guesses] : []);
        return {
          id: game.id,
          userId: game.user_id,
          isRandomMode: game.is_random_mode === 1,
          gameStarted: game.created_at ? new Date(game.created_at).toISOString() : null,
          gameEnded: game.completed_at ? new Date(game.completed_at).toISOString() : null,
          game_date: game.game_date || null,
          language: game.language,
          wordLength: game.word_length,
          targetWord: game.target_word,
          guesses: guessesArray.map((word: string) => ({ word, evaluations: [] })),
          isComplete: game.is_complete === 1,
          isWon: guessesArray.includes(game.target_word),
          guessesCount: guessesArray.length,
        };
      }),
    });
  } catch (error) {
    logger.error('Get history error', error);
    res.status(500).json({ error: 'Failed to get history' });
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
  routes.push({ method: 'GET', path: '/api/auth/preferences' });
  routes.push({ method: 'POST', path: '/api/auth/preferences' });
  
  // Games routes
  routes.push({ method: 'GET', path: '/api/games/current' });
  routes.push({ method: 'GET', path: '/api/games/completed' });
  routes.push({ method: 'POST', path: '/api/games/save' });
  routes.push({ method: 'GET', path: '/api/games/history' });
  
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

