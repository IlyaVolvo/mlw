import express from 'express';
import { query } from '../db/database.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Get game by criteria (current in-progress or completed). Query param: isComplete=0|1
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
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
        isWon: guessesArray.includes(game.target_word), // Derived: check if guesses contains target word
        guessesCount: guessesArray.length, // Derived: length of guesses array
      },
    });
  } catch (error) {
    logger.error('Get game error', error);
    res.status(500).json({ error: 'Failed to get game' });
  }
});

// Save game state
router.post('/save', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { language, wordLength, targetWord, gameDate, isRandomMode, wordSeed, guesses, isComplete } = req.body;

    if (!language || !wordLength || !targetWord || !gameDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if game already exists - check both incomplete and complete games
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
          (guesses || []).map((g: any) => typeof g === 'string' ? g : g.word), // Extract words from guesses array
          isComplete ? new Date().toISOString() : null,
          existingGame.id
        ]
      );

      res.json({ success: true, gameId: existingGame.id });
    } else {
      // Use INSERT ... ON CONFLICT to prevent duplicates in case of race conditions
      // First, try to insert
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
            (guesses || []).map((g: any) => typeof g === 'string' ? g : g.word), // Extract words from guesses array
            isComplete ? new Date().toISOString() : null
          ]
        );

        res.json({ success: true, gameId: result.rows[0].id });
      } catch (insertError: any) {
        // If insert fails (e.g., unique constraint violation), try to find and update existing game
        if (insertError.code === '23505') { // Unique violation
          // Race condition: game was created between our check and insert, find it and update
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

// Get all games history
router.get('/history', authenticateToken, async (req: AuthRequest, res) => {
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
      WHERE user_id = $1
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
        // Handle PostgreSQL array - ensure it's a proper array
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
          guesses: guessesArray.map((word: string) => ({ word, evaluations: [] })), // Array of words, evaluations can be computed client-side if needed
          isComplete: game.is_complete === 1,
          isWon: guessesArray.includes(game.target_word), // Derived: check if guesses array contains target word
          guessesCount: guessesArray.length, // Derived: length of guesses array
        };
      }),
    });
  } catch (error) {
    logger.error('Get history error', error);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

export default router;
