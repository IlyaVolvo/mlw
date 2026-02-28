import type { VercelRequest, VercelResponse } from '@vercel/node';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { getNormalization } from '../../src/data/languageLoader.js';

const MAX_GUESSES = 6;

function normalize(word: string, mappings: Record<string, string> | undefined): string {
  if (!mappings) return word;
  let result = word;
  for (const [variant, base] of Object.entries(mappings)) {
    result = result.split(variant).join(base);
  }
  return result;
}

function deriveIsWon(
  isComplete: number, guesses: string[], targetWord: string,
  mappings: Record<string, string> | undefined, gameId?: number,
): boolean {
  if (isComplete !== 1) return false;
  if (guesses.length === 0) {
    console.error(`[deriveIsWon] Game ${gameId ?? '?'}: complete with 0 guesses`);
    return false;
  }
  const normalizedLast = normalize(guesses[guesses.length - 1], mappings);
  const normalizedTarget = normalize(targetWord, mappings);
  if (normalizedLast === normalizedTarget) return true;
  if (guesses.length >= MAX_GUESSES) return false;
  console.error(`[deriveIsWon] Game ${gameId ?? '?'}: complete with ${guesses.length} guesses but last guess ≠ target`);
  return false;
}

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
    const { language, wordLength, gameDate, isRandomMode, wordSeed, isComplete } = req.query;

    const isCompleteVal = isComplete === '1' || isComplete === 'true' ? 1 : 0;
    let queryText = 'SELECT * FROM games WHERE user_id = $1 AND is_complete = $2';
    const params: any[] = [userId, isCompleteVal];
    let paramIndex = 3;

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

    queryText += isCompleteVal === 1 ? ' ORDER BY completed_at DESC LIMIT 1' : ' ORDER BY created_at DESC LIMIT 1';

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
        isWon: deriveIsWon(game.is_complete, guessesArray, game.target_word, getNormalization(game.language), game.id),
        guessesCount: guessesArray.length,
      },
    });
  } catch (error) {
    console.error('Get game error', error);
    res.status(500).json({ error: 'Failed to get game' });
  }
}
