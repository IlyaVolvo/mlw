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
  const auth = authenticateToken(req);
  if (!auth) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const userId = auth.userId;

    if (req.method === 'GET') {
      const result = await query(
        'SELECT selected_languages FROM user_preferences WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        return res.json({ selectedLanguages: null });
      }

      const prefs = result.rows[0];
      const selectedLanguages = (prefs.selected_languages || []).length > 0 
        ? prefs.selected_languages 
        : null;

      res.json({ selectedLanguages });
    } else if (req.method === 'POST') {
      const { selectedLanguages } = req.body;

      const languagesArray = selectedLanguages && Array.isArray(selectedLanguages) 
        ? selectedLanguages 
        : null;

      await query(
        `INSERT INTO user_preferences (user_id, selected_languages, updated_at) 
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id) 
         DO UPDATE SET selected_languages = $2, updated_at = CURRENT_TIMESTAMP`,
        [userId, languagesArray || []]
      );

      res.json({ success: true });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Preferences error', error);
    res.status(500).json({ error: 'Failed to process preferences' });
  }
}
