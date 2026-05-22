import express from 'express';
import { getSqliteDb } from '../db/sqlite.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// POST /api/analytics/event — receive anonymous game events
router.post('/event', (req, res) => {
  try {
    const db = getSqliteDb();
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const { type, language, wordLength, isWon, guessesCount, ...rest } = req.body;

    if (!type) {
      return res.status(400).json({ error: 'Missing event type' });
    }

    const stmt = db.prepare(
      `INSERT INTO events (ip, type, language, word_length, is_won, guesses_count, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(
      ip,
      type,
      language || null,
      wordLength || null,
      isWon !== undefined ? (isWon ? 1 : 0) : null,
      guessesCount || null,
      Object.keys(rest).length > 0 ? JSON.stringify(rest) : null
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Analytics event error', error);
    res.status(500).json({ error: 'Failed to record event' });
  }
});

// GET /api/analytics/stats — aggregated event stats
router.get('/stats', (req, res) => {
  try {
    const db = getSqliteDb();
    const apiKey = process.env.ANALYTICS_API_KEY;
    if (apiKey && req.query.key !== apiKey) {
      return res.status(403).json({ error: 'Invalid API key' });
    }

    const days = parseInt(req.query.days as string) || 30;

    const eventStats = db.prepare(`
      SELECT 
        date(timestamp) as date,
        type,
        COUNT(*) as count
      FROM events
      WHERE timestamp >= datetime('now', '-' || ? || ' days')
      GROUP BY date(timestamp), type
      ORDER BY date DESC
    `).all(days);

    const gamesCompleted = db.prepare(`
      SELECT 
        date(timestamp) as date,
        language,
        word_length,
        SUM(CASE WHEN is_won = 1 THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN is_won = 0 THEN 1 ELSE 0 END) as losses,
        COUNT(*) as total,
        ROUND(AVG(guesses_count), 1) as avg_guesses
      FROM events
      WHERE type = 'game_complete' AND timestamp >= datetime('now', '-' || ? || ' days')
      GROUP BY date(timestamp), language, word_length
      ORDER BY date DESC
    `).all(days);

    res.json({ eventStats, gamesCompleted });
  } catch (error) {
    logger.error('Analytics stats error', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// GET /api/analytics/access — access log stats
router.get('/access', (req, res) => {
  try {
    const db = getSqliteDb();
    const apiKey = process.env.ANALYTICS_API_KEY;
    if (apiKey && req.query.key !== apiKey) {
      return res.status(403).json({ error: 'Invalid API key' });
    }

    const days = parseInt(req.query.days as string) || 30;
    const groupBy = (req.query.groupBy as string) || 'day';

    let dateExpr: string;
    if (groupBy === 'hour') {
      dateExpr = "strftime('%Y-%m-%d %H:00', timestamp)";
    } else {
      dateExpr = "date(timestamp)";
    }

    const accessStats = db.prepare(`
      SELECT 
        ${dateExpr} as period,
        COUNT(DISTINCT ip) as unique_ips,
        COUNT(*) as total_requests
      FROM access_log
      WHERE timestamp >= datetime('now', '-' || ? || ' days')
      GROUP BY ${dateExpr}
      ORDER BY period DESC
    `).all(days);

    res.json({ accessStats });
  } catch (error) {
    logger.error('Analytics access error', error);
    res.status(500).json({ error: 'Failed to get access stats' });
  }
});

export default router;
