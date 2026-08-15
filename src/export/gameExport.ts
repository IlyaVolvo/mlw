import { apiClient } from '../api/client';
import { loadKeyboard } from '../data/languageLoader';
import { isWinningGuessForLanguage } from '../utils/characterNormalization';

export const FORMAT_VERSION = 2;
export const GAME_ID = 'polywordlot';
const MAX_GUESSES = 6;
const HISTORY_LIMIT = 10000;

export type ExportRecord = {
  language: string;
  word_length: number;
  target_word: string;
  game_date: string;
  guesses: string[];
  won: boolean;
  updated_at?: string;
  completed_at?: string;
};

export type GameExportFile = {
  formatVersion: number;
  polywordlot: {
    general: { gameId: typeof GAME_ID };
    records: ExportRecord[];
  };
};

type HistoryRow = Record<string, unknown>;

export function asWords(values: unknown): string[] {
  if (typeof values === 'string') {
    const raw = values;
    try {
      values = JSON.parse(raw);
    } catch {
      return raw ? [raw] : [];
    }
  }
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => {
      if (typeof value === 'string') return value;
      if (!value || typeof value !== 'object') return '';
      const row = value as { word?: unknown; guess?: unknown; evaluations?: unknown };
      if (row.word) return String(row.word);
      if (row.guess) return String(row.guess);
      const letters = Array.isArray(row.evaluations) ? row.evaluations : [];
      return letters
        .map((item) => (typeof item === 'string' ? item : (item as { letter?: string })?.letter || ''))
        .join('');
    })
    .filter(Boolean);
}

export function asGameDate(value: unknown): string {
  const raw = String(value || '').trim();
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  return match ? match[1] : raw;
}

function isPractice(row: HistoryRow): boolean {
  return row.isRandomMode === true || Number(row.is_random_mode) === 1;
}

function asIso(value: unknown): string {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString();
  const raw = String(value);
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
}

function recordIdentity(record: ExportRecord): string {
  return `${record.language}|${record.word_length}|${record.game_date}`;
}

function pickWorse(local: ExportRecord, incoming: ExportRecord): ExportRecord {
  if (local.won !== incoming.won) return incoming.won ? local : incoming;
  if (incoming.guesses.length !== local.guesses.length) {
    return incoming.guesses.length > local.guesses.length ? incoming : local;
  }
  return local;
}

export async function toExportRecord(row: HistoryRow): Promise<ExportRecord | null> {
  if (!row || typeof row !== 'object' || isPractice(row)) return null;

  const language = String(row.language || '').trim();
  const guesses = asWords(row.guesses);
  const target = String(row.target_word || row.targetWord || '').trim();
  const stated = Number(row.word_length ?? row.wordLength);
  const wordLength =
    Number.isFinite(stated) && stated > 0 ? stated : guesses[0]?.length || target.length || 0;
  const gameDate = asGameDate(row.game_date || row.gameDate);
  if (!language || !wordLength || !gameDate) return null;

  await loadKeyboard(language);
  const last = guesses[guesses.length - 1];
  const won = Boolean(last && target && isWinningGuessForLanguage(last, target, language));
  const storedComplete = Number(row.is_complete) === 1 || row.isComplete === true;
  if (!won && guesses.length < MAX_GUESSES && !storedComplete) return null;

  const completedAt = asIso(row.completed_at || row.completedAt || row.gameEnded);
  const updatedAt = asIso(row.updated_at || row.updatedAt || completedAt || row.gameStarted);
  const record: ExportRecord = {
    language,
    word_length: wordLength,
    target_word: target,
    game_date: gameDate,
    guesses,
    won,
  };
  if (updatedAt) record.updated_at = updatedAt;
  if (completedAt) record.completed_at = completedAt;
  return record;
}

export async function buildGameExport(rows: unknown[]): Promise<GameExportFile> {
  const byId = new Map<string, ExportRecord>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = await toExportRecord(row as HistoryRow);
    if (!record) continue;
    const id = recordIdentity(record);
    const existing = byId.get(id);
    byId.set(id, existing ? pickWorse(existing, record) : record);
  }
  return {
    formatVersion: FORMAT_VERSION,
    polywordlot: {
      general: { gameId: GAME_ID },
      records: Array.from(byId.values()),
    },
  };
}

export function downloadGameExport(payload: GameExportFile): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `polywordlot-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportCompletedDailies(): Promise<GameExportFile> {
  const response = await apiClient.getHistory(undefined, undefined, HISTORY_LIMIT);
  const payload = await buildGameExport(response.games || []);
  downloadGameExport(payload);
  return payload;
}
