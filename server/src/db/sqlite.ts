import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger.js';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'analytics.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db: Database.Database | null = null;

export function getSqliteDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initializeTables(db);
    logger.info(`SQLite database initialized at ${DB_PATH}`);
  }
  return db;
}

function initializeTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS access_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      ip TEXT NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      user_agent TEXT,
      status_code INTEGER
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      ip TEXT,
      type TEXT NOT NULL,
      language TEXT,
      word_length INTEGER,
      is_won INTEGER,
      guesses_count INTEGER,
      payload TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_access_log_timestamp ON access_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_access_log_ip ON access_log(ip);
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
  `);
}

export function closeSqliteDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
