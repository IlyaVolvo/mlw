import { deriveGameOutcome } from '../utils/gameOutcome';
const API_BASE = (import.meta as any).env?.VITE_API_URL || '/api';

export interface User {
  id: number;
  email: string;
  verified?: number;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface GameResponse {
  game: {
    id: number;
    language: string;
    word_length: number;
    target_word: string;
    game_date: string;
    is_random_mode: number;
    word_seed: number | null;
    is_complete: number;
    isWon: boolean;
    guessesCount: number;
    guesses: Array<{
      word: string;
      evaluations: any[];
    }>;
  } | null;
}

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('auth_token');
    }
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Auth endpoints
  async register(email: string, password: string, lastReleaseIndex?: number): Promise<AuthResponse> {
    const body: { email: string; password: string; lastReleaseIndex?: number } = { email, password };
    if (typeof lastReleaseIndex === 'number' && lastReleaseIndex >= 0) body.lastReleaseIndex = lastReleaseIndex;
    const response = await this.request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    this.setToken(response.token);
    return response;
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(response.token);
    return response;
  }

  async getCurrentUser(): Promise<{ user: User }> {
    return this.request<{ user: User }>('/auth/me');
  }

  async forgotPassword(email: string, baseUrl: string): Promise<{ message: string }> {
    return this.request<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email, baseUrl }),
    });
  }

  async resetPassword(token: string, password: string): Promise<{ message: string }> {
    return this.request<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
  }

  async sendFeedback(comments: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>('/auth/send-feedback', {
      method: 'POST',
      body: JSON.stringify({ comments }),
    });
  }

  // Game endpoints
  async getCurrentGame(params: {
    language?: string;
    wordLength?: number;
    gameDate?: string;
    isRandomMode?: boolean;
    wordSeed?: number;
  }): Promise<GameResponse> {
    const queryParams = new URLSearchParams();
    queryParams.append('isComplete', '0');
    if (params.language) queryParams.append('language', params.language);
    if (params.wordLength) queryParams.append('wordLength', params.wordLength.toString());
    if (params.gameDate) queryParams.append('gameDate', params.gameDate);
    if (params.isRandomMode !== undefined) queryParams.append('isRandomMode', params.isRandomMode.toString());
    if (params.wordSeed) queryParams.append('wordSeed', params.wordSeed.toString());

    const response = await this.request<GameResponse>(`/games?${queryParams.toString()}`);
    if (!response.game) return response;
    const outcome = await deriveGameOutcome({
      language: response.game.language,
      isComplete: response.game.is_complete === 1,
      targetWord: response.game.target_word,
      guesses: response.game.guesses,
    });
    return {
      game: {
        ...response.game,
        isWon: outcome.isWon,
        guessesCount: outcome.guessesCount,
      },
    };
  }

  async getCompletedGame(params: {
    language?: string;
    wordLength?: number;
    gameDate?: string;
    isRandomMode?: boolean;
    wordSeed?: number;
  }): Promise<GameResponse> {
    const queryParams = new URLSearchParams();
    queryParams.append('isComplete', '1');
    if (params.language) queryParams.append('language', params.language);
    if (params.wordLength) queryParams.append('wordLength', params.wordLength.toString());
    if (params.gameDate) queryParams.append('gameDate', params.gameDate);
    if (params.isRandomMode !== undefined) queryParams.append('isRandomMode', params.isRandomMode.toString());
    if (params.wordSeed) queryParams.append('wordSeed', params.wordSeed.toString());

    const response = await this.request<GameResponse>(`/games?${queryParams.toString()}`);
    if (!response.game) return response;
    const outcome = await deriveGameOutcome({
      language: response.game.language,
      isComplete: response.game.is_complete === 1,
      targetWord: response.game.target_word,
      guesses: response.game.guesses,
    });
    return {
      game: {
        ...response.game,
        isWon: outcome.isWon,
        guessesCount: outcome.guessesCount,
      },
    };
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
    return this.request<{ success: boolean; gameId: number }>('/games/save', {
      method: 'POST',
      body: JSON.stringify(gameData),
    });
  }

  async getHistory(language?: string, wordLength?: number, limit?: number): Promise<{ games: any[] }> {
    const queryParams = new URLSearchParams();
    if (language) queryParams.append('language', language);
    if (wordLength) queryParams.append('wordLength', wordLength.toString());
    if (limit) queryParams.append('limit', limit.toString());

    const response = await this.request<{ games: any[] }>(`/games/history?${queryParams.toString()}`);
    const games = await Promise.all(
      (response.games || []).map(async (game: any) => {
        const outcome = await deriveGameOutcome({
          language: game.language,
          isComplete: game.isComplete === true,
          targetWord: game.targetWord,
          guesses: game.guesses,
        });
        return {
          ...game,
          isWon: outcome.isWon,
          guessesCount: outcome.guessesCount,
        };
      })
    );
    return { games };
  }

  async getBulkGames(params: {
    language: string;
    wordLength: number;
    startDate: string;
    endDate: string;
  }): Promise<{ games: Record<string, any> }> {
    const queryParams = new URLSearchParams();
    queryParams.append('language', params.language);
    queryParams.append('wordLength', params.wordLength.toString());
    queryParams.append('startDate', params.startDate);
    queryParams.append('endDate', params.endDate);

    const response = await this.request<{ games: Record<string, any> }>(`/games/bulk?${queryParams.toString()}`);
    const entries = await Promise.all(
      Object.entries(response.games || {}).map(async ([date, game]) => {
        const typedGame = game as any;
        const outcome = await deriveGameOutcome({
          language: typedGame.language,
          isComplete: typedGame.is_complete === 1,
          targetWord: typedGame.target_word,
          guesses: typedGame.guesses,
        });
        return [
          date,
          {
            ...typedGame,
            isWon: outcome.isWon,
            guessesCount: outcome.guessesCount,
          },
        ] as const;
      })
    );
    return { games: Object.fromEntries(entries) };
  }

  // Preferences endpoints
  async getPreferences(): Promise<{ selectedLanguages: string[] | null }> {
    return this.request<{ selectedLanguages: string[] | null }>('/auth/preferences');
  }

  async savePreferences(selectedLanguages: string[] | null): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>('/auth/preferences', {
      method: 'POST',
      body: JSON.stringify({ selectedLanguages }),
    });
  }

  async updateReleaseSeen(index: number): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>('/auth/preferences', {
      method: 'POST',
      body: JSON.stringify({ lastSeenReleaseIndex: index }),
    });
  }
}

export const apiClient = new ApiClient();

