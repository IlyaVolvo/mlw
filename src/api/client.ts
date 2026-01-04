const API_BASE = (import.meta as any).env?.VITE_API_URL || '/api';

export interface User {
  id: number;
  email: string;
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
  async register(email: string, password: string): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
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

  // Game endpoints
  async getCurrentGame(params: {
    language?: string;
    wordLength?: number;
    gameDate?: string;
    isRandomMode?: boolean;
    wordSeed?: number;
  }): Promise<GameResponse> {
    const queryParams = new URLSearchParams();
    if (params.language) queryParams.append('language', params.language);
    if (params.wordLength) queryParams.append('wordLength', params.wordLength.toString());
    if (params.gameDate) queryParams.append('gameDate', params.gameDate);
    if (params.isRandomMode !== undefined) queryParams.append('isRandomMode', params.isRandomMode.toString());
    if (params.wordSeed) queryParams.append('wordSeed', params.wordSeed.toString());

    return this.request<GameResponse>(`/games/current?${queryParams.toString()}`);
  }

  async getCompletedGame(params: {
    language?: string;
    wordLength?: number;
    gameDate?: string;
    isRandomMode?: boolean;
    wordSeed?: number;
  }): Promise<GameResponse> {
    const queryParams = new URLSearchParams();
    if (params.language) queryParams.append('language', params.language);
    if (params.wordLength) queryParams.append('wordLength', params.wordLength.toString());
    if (params.gameDate) queryParams.append('gameDate', params.gameDate);
    if (params.isRandomMode !== undefined) queryParams.append('isRandomMode', params.isRandomMode.toString());
    if (params.wordSeed) queryParams.append('wordSeed', params.wordSeed.toString());

    return this.request<GameResponse>(`/games/completed?${queryParams.toString()}`);
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

    return this.request<{ games: any[] }>(`/games/history?${queryParams.toString()}`);
  }
}

export const apiClient = new ApiClient();

