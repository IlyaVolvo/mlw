const DB_NAME = 'polywordlot';
const DB_VERSION = 1;

export interface GameRecord {
  id?: number;
  userId: number;
  language: string;
  wordLength: number;
  targetWord: string;
  gameDate: string;
  isRandomMode: number;
  wordSeed: number | null;
  isComplete: number;
  guesses: string[];
  createdAt: string;
  completedAt: string | null;
}

export interface PreferencesRecord {
  userId: number;
  selectedLanguages: string[];
  lastSeenReleaseIndex: number;
  createdAt: string;
  updatedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('games')) {
        const gamesStore = db.createObjectStore('games', { keyPath: 'id', autoIncrement: true });
        gamesStore.createIndex('userId_gameDate', ['userId', 'gameDate'], { unique: false });
        gamesStore.createIndex('userId_language_wordLength', ['userId', 'language', 'wordLength'], { unique: false });
        gamesStore.createIndex('userId_isComplete', ['userId', 'isComplete'], { unique: false });
      }

      if (!db.objectStoreNames.contains('preferences')) {
        db.createObjectStore('preferences', { keyPath: 'userId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openDb();
  }
  return dbPromise;
}

// Generic transaction helper
async function withTransaction<T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  fn: (tx: IDBTransaction) => IDBRequest | IDBRequest[]
): Promise<T> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    const result = fn(tx);
    const req = Array.isArray(result) ? result[result.length - 1] : result;
    req.onsuccess = () => resolve(req.result as T);
    tx.onerror = () => reject(tx.error);
  });
}

// ---- Games CRUD ----

export async function addGame(game: Omit<GameRecord, 'id'>): Promise<number> {
  return withTransaction<number>('games', 'readwrite', (tx) => {
    const store = tx.objectStore('games');
    return store.add(game);
  });
}

export async function putGame(game: GameRecord): Promise<number> {
  return withTransaction<number>('games', 'readwrite', (tx) => {
    const store = tx.objectStore('games');
    return store.put(game);
  });
}

export async function getAllGames(): Promise<GameRecord[]> {
  return withTransaction<GameRecord[]>('games', 'readonly', (tx) => {
    const store = tx.objectStore('games');
    return store.getAll();
  });
}

export async function getGamesByUserAndDate(userId: number, gameDate: string): Promise<GameRecord[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('games', 'readonly');
    const store = tx.objectStore('games');
    const index = store.index('userId_gameDate');
    const request = index.getAll([userId, gameDate]);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getGamesByUserLangLength(userId: number, language: string, wordLength: number): Promise<GameRecord[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('games', 'readonly');
    const store = tx.objectStore('games');
    const index = store.index('userId_language_wordLength');
    const request = index.getAll([userId, language, wordLength]);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function clearGamesStore(): Promise<void> {
  return withTransaction<void>('games', 'readwrite', (tx) => {
    const store = tx.objectStore('games');
    return store.clear();
  });
}

// ---- Preferences CRUD ----

export async function getPreferences(userId: number): Promise<PreferencesRecord | undefined> {
  return withTransaction<PreferencesRecord | undefined>('preferences', 'readonly', (tx) => {
    const store = tx.objectStore('preferences');
    return store.get(userId);
  });
}

export async function putPreferences(prefs: PreferencesRecord): Promise<void> {
  return withTransaction<void>('preferences', 'readwrite', (tx) => {
    const store = tx.objectStore('preferences');
    return store.put(prefs) as unknown as IDBRequest<void>;
  });
}

export async function clearPreferencesStore(): Promise<void> {
  return withTransaction<void>('preferences', 'readwrite', (tx) => {
    const store = tx.objectStore('preferences');
    return store.clear();
  });
}
