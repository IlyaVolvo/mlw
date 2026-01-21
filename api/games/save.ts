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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = authenticateToken(req);
  if (!auth) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const userId = auth.userId;
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
    console.error('Save game error', error);
    res.status(500).json({ error: 'Failed to save game' });
  }
}
