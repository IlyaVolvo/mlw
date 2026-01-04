const PREFERENCES_KEY = 'wordle-multi-preferences';

export interface UserPreferences {
  randomMode: boolean; // If true, new word every game
}

const DEFAULT_PREFERENCES: UserPreferences = {
  randomMode: false,
};

/**
 * Loads user preferences from localStorage
 */
export function loadPreferences(): UserPreferences {
  try {
    const stored = localStorage.getItem(PREFERENCES_KEY);
    if (!stored) return DEFAULT_PREFERENCES;
    
    const prefs = JSON.parse(stored);
    return { ...DEFAULT_PREFERENCES, ...prefs };
  } catch (error) {
    console.error('Failed to load preferences:', error);
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Saves user preferences to localStorage
 */
export function savePreferences(preferences: UserPreferences): void {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.error('Failed to save preferences:', error);
  }
}

