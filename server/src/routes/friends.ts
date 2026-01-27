import express from 'express';
import { query } from '../db/database.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * Normalizes user IDs to canonical order (smaller ID first)
 * This ensures friendships are stored consistently regardless of who initiated
 * @returns [smallerId, largerId]
 */
function normalizeFriendshipIds(userId1: number, userId2: number): [number, number] {
  return userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];
}

// Send friend invitation
router.post('/invite', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Find the user to invite
    const userResult = await query('SELECT id, email FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User with this email not found' });
    }

    const friendUser = userResult.rows[0];
    const friendId = friendUser.id;

    if (friendId === userId) {
      return res.status(400).json({ error: 'Cannot invite yourself' });
    }

    // Normalize to canonical order (smaller ID first)
    const [canonicalUserId, canonicalFriendId] = normalizeFriendshipIds(userId, friendId);

    // Check if friendship already exists (using canonical order)
    const existingFriendship = await query(
      `SELECT * FROM friends 
       WHERE user_id = $1 AND friend_id = $2`,
      [canonicalUserId, canonicalFriendId]
    );

    // Check if there was a previous rejection
    let wasRejected = false;
    if (existingFriendship.rows.length > 0) {
      const friendship = existingFriendship.rows[0];
      if (friendship.status === 'accepted') {
        return res.status(400).json({ error: 'Already friends with this user' });
      } else if (friendship.status === 'pending' && friendship.invited_by === userId) {
        return res.status(400).json({ error: 'Invitation already sent' });
      } else if (friendship.status === 'pending' && friendship.invited_by === friendId) {
        // Auto-accept if the other user already invited you
        await query(
          `UPDATE friends SET status = 'accepted', updated_at = CURRENT_TIMESTAMP 
           WHERE user_id = $1 AND friend_id = $2`,
          [canonicalUserId, canonicalFriendId]
        );
        return res.json({ message: 'Friendship accepted automatically', friendId });
      } else if (friendship.status === 'rejected') {
        // Allow re-inviting after rejection, but indicate it was previously rejected
        wasRejected = true;
      }
    }

    // Create pending invitation (using canonical order)
    // If previously rejected, update to pending and reset invited_by
    await query(
      `INSERT INTO friends (user_id, friend_id, status, invited_by) 
       VALUES ($1, $2, 'pending', $3)
       ON CONFLICT (user_id, friend_id) DO UPDATE SET status = 'pending', invited_by = $3, updated_at = CURRENT_TIMESTAMP`,
      [canonicalUserId, canonicalFriendId, userId]
    );

    res.json({ 
      message: wasRejected ? 'Friend invitation sent (previously rejected)' : 'Friend invitation sent', 
      friendId,
      wasRejected 
    });
  } catch (error) {
    logger.error('Friend invitation error', error);
    res.status(500).json({ error: 'Failed to send friend invitation' });
  }
});

// Get friend invitations (pending)
router.get('/invitations', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Check both directions since friendships are stored in canonical order
    const result = await query(
      `SELECT f.id, f.user_id, f.friend_id, f.invited_by, f.created_at, 
              CASE 
                WHEN f.user_id = $1 THEN u2.email
                ELSE u1.email
              END as friend_email,
              CASE 
                WHEN f.user_id = $1 THEN f.friend_id
                ELSE f.user_id
              END as friend_id_normalized
       FROM friends f
       LEFT JOIN users u1 ON f.user_id = u1.id
       LEFT JOIN users u2 ON f.friend_id = u2.id
       WHERE (f.user_id = $1 OR f.friend_id = $1) 
         AND f.status = 'pending' 
         AND f.invited_by != $1
       ORDER BY f.created_at DESC`,
      [userId]
    );

    const invitations = result.rows.map(row => ({
      id: row.id,
      friendId: row.friend_id_normalized,
      friendEmail: row.friend_email,
      invitedBy: row.invited_by,
      createdAt: row.created_at,
    }));

    res.json({ invitations });
  } catch (error) {
    logger.error('Get invitations error', error);
    res.status(500).json({ error: 'Failed to get invitations' });
  }
});

// Accept friend invitation
router.post('/accept', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { friendId } = req.body;

    if (!friendId) {
      return res.status(400).json({ error: 'Friend ID is required' });
    }

    // Normalize to canonical order
    const [canonicalUserId, canonicalFriendId] = normalizeFriendshipIds(userId, friendId);

    // Find pending invitation (check both directions since stored in canonical order)
    const invitationResult = await query(
      `SELECT * FROM friends 
       WHERE user_id = $1 AND friend_id = $2 AND status = 'pending'`,
      [canonicalUserId, canonicalFriendId]
    );

    if (invitationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    // Accept the invitation (using canonical order)
    await query(
      `UPDATE friends SET status = 'accepted', updated_at = CURRENT_TIMESTAMP 
       WHERE user_id = $1 AND friend_id = $2`,
      [canonicalUserId, canonicalFriendId]
    );

    res.json({ message: 'Friend invitation accepted' });
  } catch (error) {
    logger.error('Accept invitation error', error);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

// Reject friend invitation
router.post('/reject', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { friendId } = req.body;

    if (!friendId) {
      return res.status(400).json({ error: 'Friend ID is required' });
    }

    // Normalize to canonical order
    const [canonicalUserId, canonicalFriendId] = normalizeFriendshipIds(userId, friendId);

    // Update status to rejected instead of deleting
    await query(
      `UPDATE friends SET status = 'rejected', updated_at = CURRENT_TIMESTAMP 
       WHERE user_id = $1 AND friend_id = $2`,
      [canonicalUserId, canonicalFriendId]
    );

    // If no row was updated, create a rejected entry
    const updateResult = await query(
      `SELECT * FROM friends WHERE user_id = $1 AND friend_id = $2`,
      [canonicalUserId, canonicalFriendId]
    );

    if (updateResult.rows.length === 0) {
      await query(
        `INSERT INTO friends (user_id, friend_id, status, invited_by) 
         VALUES ($1, $2, 'rejected', $3)`,
        [canonicalUserId, canonicalFriendId, friendId]
      );
    }

    res.json({ message: 'Friend invitation rejected' });
  } catch (error) {
    logger.error('Reject invitation error', error);
    res.status(500).json({ error: 'Failed to reject invitation' });
  }
});

// Get all friends
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Check both directions since friendships are stored in canonical order
    // If user_id = current user, friend is friend_id
    // If friend_id = current user, friend is user_id
    const result = await query(
      `SELECT 
         CASE 
           WHEN f.user_id = $1 THEN f.friend_id
           ELSE f.user_id
         END as friend_id,
         CASE 
           WHEN f.user_id = $1 THEN u2.email
           ELSE u1.email
         END as email,
         f.created_at,
         f.updated_at,
         f.invited_by
       FROM friends f
       LEFT JOIN users u1 ON f.user_id = u1.id
       LEFT JOIN users u2 ON f.friend_id = u2.id
      WHERE (f.user_id = $1 OR f.friend_id = $1) 
        AND f.status = 'accepted'
      ORDER BY email`,
      [userId]
    );

    const friends = result.rows.map(row => ({
      id: row.friend_id,
      email: row.email,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      invitedBy: row.invited_by,
    }));

    // Check if there are newly accepted friendships where current user was the inviter
    // A friendship is "new" if it was accepted within the last hour and user was the inviter
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const hasNewFriend = friends.some(friend => 
      friend.invitedBy === userId && 
      friend.updatedAt && 
      new Date(friend.updatedAt) > new Date(oneHourAgo)
    );

    res.json({ friends, hasNewFriend });
  } catch (error) {
    logger.error('Get friends error', error);
    res.status(500).json({ error: 'Failed to get friends' });
  }
});

// Remove friend
router.delete('/:friendId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const friendId = parseInt(req.params.friendId);

    if (isNaN(friendId)) {
      return res.status(400).json({ error: 'Invalid friend ID' });
    }

    // Normalize to canonical order
    const [canonicalUserId, canonicalFriendId] = normalizeFriendshipIds(userId, friendId);

    // Delete friendship (using canonical order)
    await query(
      `DELETE FROM friends 
       WHERE user_id = $1 AND friend_id = $2`,
      [canonicalUserId, canonicalFriendId]
    );

    res.json({ message: 'Friend removed' });
  } catch (error) {
    logger.error('Remove friend error', error);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

// Get friend's game data for today
router.get('/:friendId/today', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const friendId = parseInt(req.params.friendId);
    const { language, wordLength } = req.query;

    if (isNaN(friendId)) {
      return res.status(400).json({ error: 'Invalid friend ID' });
    }

    // Verify friendship (check both directions to handle any existing entries)
    const friendshipResult = await query(
      `SELECT * FROM friends 
       WHERE ((user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)) 
       AND status = 'accepted'`,
      [userId, friendId]
    );

    if (friendshipResult.rows.length === 0) {
      return res.status(403).json({ error: 'Not friends with this user' });
    }

    // Get today's date
    const today = new Date().toISOString().split('T')[0];

    // Build query for today's game
    let queryText = `
      SELECT id, user_id, language, word_length, target_word, game_date, 
             guesses, is_complete, completed_at, created_at
      FROM games 
      WHERE user_id = $1 AND game_date = $2 AND is_random_mode = 0
    `;
    const params: any[] = [friendId, today];
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

    queryText += ` ORDER BY created_at DESC LIMIT 1`;

    const gameResult = await query(queryText, params);

    if (gameResult.rows.length === 0) {
      return res.json({ game: null, attempts: null });
    }

    const game = gameResult.rows[0];
    const guesses = Array.isArray(game.guesses) ? game.guesses : [];
    const attempts = game.is_complete ? guesses.length : null;
    const isWon = game.is_complete && guesses.length > 0;

    res.json({
      game: {
        id: game.id,
        language: game.language,
        wordLength: game.word_length,
        targetWord: game.target_word,
        gameDate: game.game_date,
        guesses,
        isComplete: game.is_complete === 1,
        isWon,
        attempts: attempts || null,
      },
      attempts: attempts,
    });
  } catch (error) {
    logger.error('Get friend today error', error);
    res.status(500).json({ error: 'Failed to get friend data' });
  }
});

// Get friend's game history for statistics
router.get('/:friendId/history', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const friendId = parseInt(req.params.friendId);
    const { language, wordLength, limit = 10000 } = req.query;

    if (isNaN(friendId)) {
      return res.status(400).json({ error: 'Invalid friend ID' });
    }

    // Verify friendship (check both directions to handle any existing entries)
    const friendshipResult = await query(
      `SELECT * FROM friends 
       WHERE ((user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)) 
       AND status = 'accepted'`,
      [userId, friendId]
    );

    if (friendshipResult.rows.length === 0) {
      return res.status(403).json({ error: 'Not friends with this user' });
    }

    // Build query
    let queryText = `
      SELECT id, user_id, language, word_length, target_word, game_date, 
             guesses, is_complete, completed_at, created_at
      FROM games 
      WHERE user_id = $1 AND is_random_mode = 0 AND is_complete = 1
    `;
    const params: any[] = [friendId];
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

    const games = result.rows.map(row => {
      const guesses = Array.isArray(row.guesses) ? row.guesses : [];
      const isWon = row.is_complete === 1 && guesses.length > 0 && guesses.length <= 6;
      
      return {
        id: row.id,
        userId: row.user_id,
        isRandomMode: false,
        gameStarted: row.created_at,
        gameEnded: row.completed_at || row.created_at,
        language: row.language,
        wordLength: row.word_length,
        targetWord: row.target_word,
        guesses: guesses.map((g: any) => 
          typeof g === 'string' ? { word: g, evaluations: [] } : g
        ),
        isComplete: row.is_complete === 1,
        isWon,
        guessesCount: guesses.length,
      };
    });

    res.json({ games });
  } catch (error) {
    logger.error('Get friend history error', error);
    res.status(500).json({ error: 'Failed to get friend history' });
  }
});

export default router;
