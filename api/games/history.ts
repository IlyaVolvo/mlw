import type { VercelRequest, VercelResponse } from '@vercel/node';
import pg from 'pg';
import jwt from 'jsonwebtoken';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

const query = (text: string, params?: any[]) => pool.query(text, params);

const authenticateToken = (req: VercelRequest): { userId: number; email: string } | null => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production') as { userId: number; email: string };
    return decoded;
  } catch {
    return null;
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = authenticateToken(req);
  if (!auth) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const userId = auth.userId;
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
        };
      }),
    });
  } catch (error) {
    console.error('Get history error', error);
    res.status(500).json({ error: 'Failed to get history' });
  }
}
