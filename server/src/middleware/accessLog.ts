import { Request, Response, NextFunction } from 'express';
import { getSqliteDb } from '../db/sqlite.js';

export function accessLogMiddleware(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const method = req.method;
  const path = req.path;
  const userAgent = req.headers['user-agent'] || null;

  // Log after response is sent so we capture the status code
  res.on('finish', () => {
    try {
      const db = getSqliteDb();
      const stmt = db.prepare(
        `INSERT INTO access_log (ip, method, path, user_agent, status_code) VALUES (?, ?, ?, ?, ?)`
      );
      stmt.run(ip, method, path, userAgent, res.statusCode);
    } catch {
      // Don't let logging failures break the app
    }
  });

  next();
}
