import type { VercelRequest, VercelResponse } from '@vercel/node';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { deriveIsWon } from '../_lib/normalization';
import { getNormalization } from '../../src/data/languageLoader';

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
    const { language, wordLength, startDate, endDate } = req.query;

    if (!language || !wordLength || !startDate || !endDate) {
      return res.status(400).json({ error: 'Missing required parameters: language, wordLength, startDate, endDate' });
    }

    // Query for all games in the date range for this language/wordLength combination
    // Cast game_date to DATE for proper date comparison (even though YYYY-MM-DD format works lexicographically)
    let queryText = `
      SELECT 
        id,
        user_id,
        language,
        word_length,
        target_word,
        game_date,
        is_random_mode,
        word_seed,
        is_complete,
        guesses,
        created_at,
        completed_at
      FROM games 
      WHERE user_id = $1 
        AND language = $2 
        AND word_length = $3 
        AND is_random_mode = 0
        AND game_date::DATE >= $4::DATE 
        AND game_date::DATE <= $5::DATE
      ORDER BY game_date DESC
    `;
    
    const params: any[] = [
      userId,
      language,
      parseInt(wordLength as string),
      startDate,
      endDate
    ];

    const result = await query(queryText, params);
    const games = result.rows as any[];

    // Create a map of game_date -> game for easy lookup
    const gamesByDate: Record<string, any> = {};
    
    games.forEach((game) => {
      const guessesArray = Array.isArray(game.guesses) ? game.guesses : (game.guesses ? [game.guesses] : []);
      const gameDate = game.game_date;
      
      // If multiple games exist for the same date, prefer completed ones, then most recent
      if (!gamesByDate[gameDate] || 
          (game.is_complete === 1 && gamesByDate[gameDate].is_complete !== 1) ||
          (game.created_at > gamesByDate[gameDate].created_at && 
           game.is_complete === gamesByDate[gameDate].is_complete)) {
        gamesByDate[gameDate] = {
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
          isWon: deriveIsWon(game.is_complete, guessesArray, game.target_word, getNormalization(game.language), game.id),
          guessesCount: guessesArray.length,
        };
      }
    });

    res.json({
      games: gamesByDate,
    });
  } catch (error) {
    console.error('Get bulk games error', error);
    res.status(500).json({ error: 'Failed to get bulk games' });
  }
}
