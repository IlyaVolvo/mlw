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

export interface ApiClientInterface {
  setToken(token: string | null): void;
  getToken(): string | null;

  // Auth
  register(email: string, password: string, lastReleaseIndex?: number): Promise<AuthResponse>;
  login(email: string, password: string): Promise<AuthResponse>;
  getCurrentUser(): Promise<{ user: User }>;
  forgotPassword(email: string, baseUrl: string): Promise<{ message: string }>;
  resetPassword(token: string, password: string): Promise<{ message: string }>;
  sendFeedback(comments: string): Promise<{ success: boolean; message: string }>;

  // Games
  getCurrentGame(params: {
    language?: string;
    wordLength?: number;
    gameDate?: string;
    isRandomMode?: boolean;
    wordSeed?: number;
  }): Promise<GameResponse>;

  getCompletedGame(params: {
    language?: string;
    wordLength?: number;
    gameDate?: string;
    isRandomMode?: boolean;
    wordSeed?: number;
  }): Promise<GameResponse>;

  saveGame(gameData: {
    language: string;
    wordLength: number;
    targetWord: string;
    gameDate: string;
    isRandomMode?: boolean;
    wordSeed?: number;
    guesses?: Array<{ word: string; evaluations: any[] }>;
    isComplete: boolean;
    isWon: boolean;
  }): Promise<{ success: boolean; gameId: number }>;

  getHistory(language?: string, wordLength?: number, limit?: number): Promise<{ games: any[] }>;

  getBulkGames(params: {
    language: string;
    wordLength: number;
    startDate: string;
    endDate: string;
  }): Promise<{ games: Record<string, any> }>;

  // Preferences
  getPreferences(): Promise<{ selectedLanguages: string[] | null }>;
  savePreferences(selectedLanguages: string[] | null): Promise<{ success: boolean }>;
  updateReleaseSeen(index: number): Promise<{ success: boolean }>;
}
