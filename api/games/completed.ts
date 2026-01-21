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
    console.error('Get completed game error', error);
    res.status(500).json({ error: 'Failed to get completed game' });
  }
}
