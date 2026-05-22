import { deriveGameOutcome } from '../utils/gameOutcome';
import {
  addGame,
  putGame,
  getAllGames,
  getGamesByUserAndDate,
  getGamesByUserLangLength,
  getPreferences,
  putPreferences,
} from '../utils/indexedDb';
import type { GameRecord } from '../utils/indexedDb';
import type { ApiClientInterface, AuthResponse, GameResponse, User } from './types';

const FEEDBACK_EMAIL = (import.meta as any).env?.VITE_FEEDBACK_EMAIL || 'polywordlot@example.com';
const ANALYTICS_URL = (import.meta as any).env?.VITE_ANALYTICS_URL || '';
const LOCAL_USER_ID = 0;

// Fire-and-forget analytics beacon
function sendAnalyticsEvent(payload: Record<string, unknown>): void {
  if (!ANALYTICS_URL) return;
  try {
    fetch(`${ANALYTICS_URL}/api/analytics/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => { /* best-effort */ });
  } catch { /* ignore */ }
}

function gameRecordToResponse(game: GameRecord): NonNullable<GameResponse['game']> {
  return {
    id: game.id ?? 0,
    language: game.language,
    word_length: game.wordLength,
    target_word: game.targetWord,
    game_date: game.gameDate,
    is_random_mode: game.isRandomMode,
    word_seed: game.wordSeed,
    is_complete: game.isComplete,
    isWon: false, // will be derived
    guessesCount: game.guesses.length,
    guesses: game.guesses.map((word) => ({ word, evaluations: [] })),
  };
}

export class LocalApiClient implements ApiClientInterface {
  // Token methods are no-ops in offline mode
  setToken(_token: string | null): void { /* no-op */ }
  getToken(): string | null { return 'offline'; }

  // ---- Auth (all stubs) ----

  async register(_email: string, _password: string, _lastReleaseIndex?: number): Promise<AuthResponse> {
    return { token: 'offline', user: await this._getLocalUser() };
  }

  async login(_email: string, _password: string): Promise<AuthResponse> {
    return { token: 'offline', user: await this._getLocalUser() };
  }

  async getCurrentUser(): Promise<{ user: User }> {
    return { user: await this._getLocalUser() };
  }

  async forgotPassword(_email: string, _baseUrl: string): Promise<{ message: string }> {
    return { message: 'Not available in offline mode' };
  }

  async resetPassword(_token: string, _password: string): Promise<{ message: string }> {
    return { message: 'Not available in offline mode' };
  }

  async sendFeedback(comments: string): Promise<{ success: boolean; message: string }> {
    const subject = encodeURIComponent('Polywordlot Feedback');
    const body = encodeURIComponent(comments);
    window.open(`mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`, '_self');
    return { success: true, message: 'Email client opened' };
  }

  // ---- Games ----

  async getCurrentGame(params: {
    language?: string;
    wordLength?: number;
    gameDate?: string;
    isRandomMode?: boolean;
    wordSeed?: number;
  }): Promise<GameResponse> {
    const game = await this._findGame(params, 0); // isComplete = 0
    if (!game) return { game: null };
    const resp = gameRecordToResponse(game);
    const outcome = await deriveGameOutcome({
      language: resp.language,
      isComplete: resp.is_complete === 1,
      targetWord: resp.target_word,
      guesses: resp.guesses,
    });
    return { game: { ...resp, isWon: outcome.isWon, guessesCount: outcome.guessesCount } };
  }

  async getCompletedGame(params: {
    language?: string;
    wordLength?: number;
    gameDate?: string;
    isRandomMode?: boolean;
    wordSeed?: number;
  }): Promise<GameResponse> {
    const game = await this._findGame(params, 1); // isComplete = 1
    if (!game) return { game: null };
    const resp = gameRecordToResponse(game);
    const outcome = await deriveGameOutcome({
      language: resp.language,
      isComplete: resp.is_complete === 1,
      targetWord: resp.target_word,
      guesses: resp.guesses,
    });
    return { game: { ...resp, isWon: outcome.isWon, guessesCount: outcome.guessesCount } };
  }

  async saveGame(gameData: {
    language: string;
    wordLength: number;
    targetWord: string;
    gameDate: string;
    isRandomMode?: boolean;
    wordSeed?: number;
    guesses?: Array<{ word: string; evaluations: any[] }>;
    isComplete: boolean;
    isWon: boolean;
  }): Promise<{ success: boolean; gameId: number }> {
    const guessWords = (gameData.guesses || []).map((g) => (typeof g === 'string' ? g : g.word));
    const isRandomMode = gameData.isRandomMode ? 1 : 0;
    const wordSeed = gameData.wordSeed ?? null;

    // Try to find existing game
    const existing = await this._findExistingForSave(
      gameData.language, gameData.wordLength, gameData.gameDate, isRandomMode, wordSeed
    );

    if (existing) {
      existing.targetWord = gameData.targetWord;
      existing.isComplete = gameData.isComplete ? 1 : 0;
      existing.guesses = guessWords;
      existing.completedAt = gameData.isComplete ? new Date().toISOString() : null;
      await putGame(existing);

      if (gameData.isComplete) {
        sendAnalyticsEvent({
          type: 'game_complete',
          language: gameData.language,
          wordLength: gameData.wordLength,
          isWon: gameData.isWon,
          guessesCount: guessWords.length,
        });
      }
      return { success: true, gameId: existing.id! };
    }

    // Insert new
    const id = await addGame({
      userId: LOCAL_USER_ID,
      language: gameData.language,
      wordLength: gameData.wordLength,
      targetWord: gameData.targetWord,
      gameDate: gameData.gameDate,
      isRandomMode,
      wordSeed,
      isComplete: gameData.isComplete ? 1 : 0,
      guesses: guessWords,
      createdAt: new Date().toISOString(),
      completedAt: gameData.isComplete ? new Date().toISOString() : null,
    });

    if (gameData.isComplete) {
      sendAnalyticsEvent({
        type: 'game_complete',
        language: gameData.language,
        wordLength: gameData.wordLength,
        isWon: gameData.isWon,
        guessesCount: guessWords.length,
      });
    }

    return { success: true, gameId: id };
  }

  async getHistory(language?: string, wordLength?: number, limit?: number): Promise<{ games: any[] }> {
    let games: GameRecord[];

    if (language && wordLength) {
      games = await getGamesByUserLangLength(LOCAL_USER_ID, language, wordLength);
    } else {
      games = await getAllGames();
      games = games.filter((g) => g.userId === LOCAL_USER_ID);
      if (language) games = games.filter((g) => g.language === language);
      if (wordLength) games = games.filter((g) => g.wordLength === wordLength);
    }

    // Sort by createdAt desc
    games.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    if (limit) games = games.slice(0, limit);

    const mapped = await Promise.all(
      games.map(async (game) => {
        const outcome = await deriveGameOutcome({
          language: game.language,
          isComplete: game.isComplete === 1,
          targetWord: game.targetWord,
          guesses: game.guesses.map((w) => ({ word: w, evaluations: [] })),
        });
        return {
          id: game.id,
          userId: game.userId,
          isRandomMode: game.isRandomMode === 1,
          gameStarted: game.createdAt,
          gameEnded: game.completedAt,
          game_date: game.gameDate,
          language: game.language,
          wordLength: game.wordLength,
          targetWord: game.targetWord,
          guesses: game.guesses.map((w) => ({ word: w, evaluations: [] })),
          isComplete: game.isComplete === 1,
          isWon: outcome.isWon,
          guessesCount: outcome.guessesCount,
        };
      })
    );

    return { games: mapped };
  }

  async getBulkGames(params: {
    language: string;
    wordLength: number;
    startDate: string;
    endDate: string;
  }): Promise<{ games: Record<string, any> }> {
    const allForLang = await getGamesByUserLangLength(LOCAL_USER_ID, params.language, params.wordLength);
    const filtered = allForLang.filter(
      (g) => g.isRandomMode === 0 && g.gameDate >= params.startDate && g.gameDate <= params.endDate
    );

    const gamesByDate: Record<string, any> = {};

    for (const game of filtered) {
      const existing = gamesByDate[game.gameDate];
      if (
        !existing ||
        (game.isComplete === 1 && existing.is_complete !== 1) ||
        (game.createdAt > existing.created_at && game.isComplete === existing.is_complete)
      ) {
        const outcome = await deriveGameOutcome({
          language: game.language,
          isComplete: game.isComplete === 1,
          targetWord: game.targetWord,
          guesses: game.guesses.map((w) => ({ word: w, evaluations: [] })),
        });
        gamesByDate[game.gameDate] = {
          id: game.id,
          user_id: game.userId,
          language: game.language,
          word_length: game.wordLength,
          target_word: game.targetWord,
          game_date: game.gameDate,
          is_random_mode: game.isRandomMode,
          word_seed: game.wordSeed,
          is_complete: game.isComplete,
          created_at: game.createdAt,
          completed_at: game.completedAt,
          guesses: game.guesses.map((w) => ({ word: w, evaluations: [] })),
          isWon: outcome.isWon,
          guessesCount: outcome.guessesCount,
        };
      }
    }

    return { games: gamesByDate };
  }

  // ---- Preferences ----

  async getPreferences(): Promise<{ selectedLanguages: string[] | null }> {
    const prefs = await getPreferences(LOCAL_USER_ID);
    if (!prefs || !prefs.selectedLanguages || prefs.selectedLanguages.length === 0) {
      return { selectedLanguages: null };
    }
    return { selectedLanguages: prefs.selectedLanguages };
  }

  async savePreferences(selectedLanguages: string[] | null): Promise<{ success: boolean }> {
    const existing = await getPreferences(LOCAL_USER_ID);
    const now = new Date().toISOString();
    await putPreferences({
      userId: LOCAL_USER_ID,
      selectedLanguages: selectedLanguages || [],
      lastSeenReleaseIndex: existing?.lastSeenReleaseIndex ?? 0,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    sendAnalyticsEvent({ type: 'config_switch', selectedLanguages });
    return { success: true };
  }

  async updateReleaseSeen(index: number): Promise<{ success: boolean }> {
    const existing = await getPreferences(LOCAL_USER_ID);
    const now = new Date().toISOString();
    await putPreferences({
      userId: LOCAL_USER_ID,
      selectedLanguages: existing?.selectedLanguages ?? [],
      lastSeenReleaseIndex: index,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    return { success: true };
  }

  // ---- Private helpers ----

  private async _getLocalUser(): Promise<User> {
    const prefs = await getPreferences(LOCAL_USER_ID);
    return { id: LOCAL_USER_ID, email: 'local', verified: prefs?.lastSeenReleaseIndex ?? 0 };
  }

  private async _findGame(
    params: {
      language?: string;
      wordLength?: number;
      gameDate?: string;
      isRandomMode?: boolean;
      wordSeed?: number;
    },
    isComplete: number
  ): Promise<GameRecord | null> {
    let candidates: GameRecord[];

    if (params.language && params.wordLength) {
      candidates = await getGamesByUserLangLength(LOCAL_USER_ID, params.language, params.wordLength);
    } else if (params.gameDate) {
      candidates = await getGamesByUserAndDate(LOCAL_USER_ID, params.gameDate);
    } else {
      candidates = await getAllGames();
      candidates = candidates.filter((g) => g.userId === LOCAL_USER_ID);
    }

    // Apply filters
    candidates = candidates.filter((g) => g.isComplete === isComplete);
    if (params.language) candidates = candidates.filter((g) => g.language === params.language);
    if (params.wordLength) candidates = candidates.filter((g) => g.wordLength === params.wordLength);
    if (params.gameDate) candidates = candidates.filter((g) => g.gameDate === params.gameDate);
    if (params.isRandomMode !== undefined) {
      const rm = params.isRandomMode ? 1 : 0;
      candidates = candidates.filter((g) => g.isRandomMode === rm);
    }
    if (params.wordSeed !== undefined && params.wordSeed !== null) {
      candidates = candidates.filter((g) => g.wordSeed === params.wordSeed);
    }

    if (candidates.length === 0) return null;

    // Sort: completed → by completedAt desc, in-progress → by createdAt desc
    if (isComplete === 1) {
      candidates.sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
    } else {
      candidates.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    }

    return candidates[0];
  }

  private async _findExistingForSave(
    language: string,
    wordLength: number,
    gameDate: string,
    isRandomMode: number,
    wordSeed: number | null
  ): Promise<GameRecord | null> {
    const candidates = await getGamesByUserLangLength(LOCAL_USER_ID, language, wordLength);
    const filtered = candidates.filter(
      (g) =>
        g.gameDate === gameDate &&
        g.isRandomMode === isRandomMode &&
        (wordSeed !== null ? g.wordSeed === wordSeed : g.wordSeed === null)
    );
    if (filtered.length === 0) return null;
    filtered.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return filtered[0];
  }
}
