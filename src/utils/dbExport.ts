import {
  getAllGames,
  getPreferences,
  clearGamesStore,
  clearPreferencesStore,
  addGame,
  putPreferences,
} from './indexedDb';
import type { GameRecord, PreferencesRecord } from './indexedDb';

interface ExportData {
  version: number;
  exportedAt: string;
  games: GameRecord[];
  preferences: PreferencesRecord | null;
}

export async function exportDatabase(): Promise<void> {
  try {
    const games = await getAllGames();
    const prefs = await getPreferences(0) ?? null;

    const data: ExportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      games,
      preferences: prefs,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `polywordlot-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export database:', error);
    alert('Failed to export data.');
  }
}

export async function importDatabase(file: File): Promise<boolean> {
  try {
    const text = await file.text();
    const data: ExportData = JSON.parse(text);

    if (!data || data.version !== 1 || !Array.isArray(data.games)) {
      alert('Invalid export file format.');
      return false;
    }

    const confirmed = window.confirm(
      `This will overwrite all local game data with ${data.games.length} game(s) from the export (${data.exportedAt?.slice(0, 10) || 'unknown date'}). Continue?`
    );
    if (!confirmed) return false;

    // Clear existing data
    await clearGamesStore();
    await clearPreferencesStore();

    // Import games (strip id so IndexedDB auto-generates new ones)
    for (const game of data.games) {
      const { id: _id, ...rest } = game;
      await addGame(rest);
    }

    // Import preferences
    if (data.preferences) {
      await putPreferences(data.preferences);
    }

    alert('Import successful! The page will reload.');
    return true;
  } catch (error) {
    console.error('Failed to import database:', error);
    alert('Failed to import data. The file may be corrupted.');
    return false;
  }
}
