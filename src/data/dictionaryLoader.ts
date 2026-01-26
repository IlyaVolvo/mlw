import type { DictionaryEntry, LanguageConfig } from '../types';

// Cache for loaded dictionaries
const dictionaryCache = new Map<string, DictionaryEntry>();

// Cache for detected supported lengths per language
const supportedLengthsCache = new Map<string, number[]>();

// Cache for language configurations (discovered from directory structure)
const languageConfigsCache = new Map<string, LanguageConfig>();

// Cache for keyboard layouts
const keyboardCache = new Map<string, string[][]>();

// Cache for keyboard action buttons
export interface KeyboardActions {
  enter?: {
    label: string;
    position?: 'start' | 'end' | 'none';
  };
  backspace?: {
    label: string;
    position?: 'start' | 'end' | 'none';
  };
}

interface KeyboardConfig {
  layout: string[][];
  actions?: KeyboardActions;
}

const keyboardActionsCache = new Map<string, KeyboardActions>();

/**
 * Structure to map locale codes to language names
 * Format: { [locale]: { language: string, name: string } }
 */
const LOCALE_TO_LANGUAGE: Record<string, { language: string; name: string; locale: string }> = {
  'en': { language: 'English', name: 'English', locale: 'en' },
  'ru': { language: 'Russian', name: 'Русский', locale: 'ru' },
  'fr': { language: 'French', name: 'Français', locale: 'fr' },
  'es': { language: 'Spanish', name: 'Español', locale: 'es' },
  'de': { language: 'German', name: 'Deutsch', locale: 'de' },
};

/**
 * Loads a dictionary file as text with support for comments (#) and empty lines
 */
async function loadDictionaryFile(path: string): Promise<string[]> {
  try {
    const response = await fetch(path);
    
    // Check if file exists (404 means file doesn't exist)
    if (response.status === 404) {
      return [];
    }
    
    // Check if response is OK
    if (!response.ok) {
      return [];
    }
    
    // Check Content-Type to ensure it's a text file, not HTML
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      // File doesn't exist (server returned HTML error page) - silently return empty
      return [];
    }
    
    // If it's a text file, read it
    const text = await response.text();
    const words = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => {
        // Ignore empty lines
        if (!line) return false;
        // Ignore lines starting with #
        if (line.startsWith('#')) return false;
        return true;
      })
      .map(line => {
        // Extract only the first word (up to first whitespace)
        // The rest is considered a comment and not used
        const firstWord = line.split(/\s+/)[0];
        return firstWord.toLowerCase();
      })
      .filter(word => word.length > 0);
    
    console.log(`Loaded ${path}: ${words.length} words`);
    return words;
  } catch (error) {
    // File doesn't exist or error occurred - silently return empty
    return [];
  }
}

/**
 * Detects available languages by scanning the directory structure
 * Looks for Language/Locale directories with answer files
 */
async function discoverLanguages(): Promise<LanguageConfig[]> {
  // Check cache first
  if (languageConfigsCache.size > 0) {
    return Array.from(languageConfigsCache.values());
  }

  const configs: LanguageConfig[] = [];

  console.log('Processing language directories:');
  // Try each known locale
  for (const [locale, info] of Object.entries(LOCALE_TO_LANGUAGE)) {
    // Check if this language/locale has answer files
    const languageDir = `${info.language}/${locale}`;
    console.log(`  - Checking directory: ${languageDir}`);
    
    // Check for answer files (answers-4.txt, answers-5.txt, etc.)
    const possibleLengths = [4, 5, 6, 7, 8, 9, 10];
    const supportedLengths: number[] = [];
    
    for (const length of possibleLengths) {
      const answerPath = `/dict/${languageDir}/answers-${length}.txt`;
      try {
        const response = await fetch(answerPath, { method: 'HEAD' });
        if (response.ok && !response.headers.get('content-type')?.includes('text/html')) {
          supportedLengths.push(length);
        }
      } catch (error) {
        // File doesn't exist
      }
    }
    
    // Only include languages that have at least one answer file
    if (supportedLengths.length > 0) {
      console.log(`    ✓ Found ${languageDir}: word lengths [${supportedLengths.join(', ')}]`);
      // Format language name: if there's only one locale for this language, use language name
      // Otherwise use language-locale format
      const name = info.name; // For now, just use the provided name
      
      const config: LanguageConfig = {
        code: locale,
        name,
        supportedLengths,
      };
      
      configs.push(config);
      languageConfigsCache.set(locale, config);
    } else {
      console.log(`    ✗ No answer files found in ${languageDir}`);
    }
  }

  console.log(`Loaded ${configs.length} language(s) with answer files:`, configs.map(c => `${c.name} (${c.code}): [${c.supportedLengths.join(', ')}]`));
  return configs;
}

/**
 * Gets the directory path for a language/locale
 */
export function getLanguageDir(locale: string): string | null {
  const info = LOCALE_TO_LANGUAGE[locale];
  if (!info) return null;
  return `${info.language}/${info.locale}`;
}

/**
 * Loads the help tip text for a language
 * Returns null if the file doesn't exist
 */
export async function loadHelpTip(language: string): Promise<string | null> {
  const languageDir = getLanguageDir(language);
  if (!languageDir) {
    console.log(`[loadHelpTip] Unknown language: ${language}`);
    return null;
  }

  const helpTipPath = `/dict/${languageDir}/HelpTip.txt`;
  console.log(`[loadHelpTip] Loading help tip from: ${helpTipPath}`);
  
  try {
    const response = await fetch(helpTipPath);
    console.log(`[loadHelpTip] Response status: ${response.status} for ${helpTipPath}`);
    
    // Check if file exists (404 means file doesn't exist)
    if (response.status === 404) {
      console.log(`[loadHelpTip] File not found: ${helpTipPath}`);
      return null;
    }
    
    // Check if response is OK
    if (!response.ok) {
      console.log(`[loadHelpTip] Response not OK: ${response.status} for ${helpTipPath}`);
      return null;
    }
    
    // Check Content-Type to ensure it's a text file, not HTML
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      // File doesn't exist (server returned HTML error page)
      console.log(`[loadHelpTip] Got HTML instead of text for ${helpTipPath}`);
      return null;
    }
    
    // Read the text content
    const text = await response.text();
    const trimmedText = text.trim() || null;
    console.log(`[loadHelpTip] Loaded help tip text:`, trimmedText ? `"${trimmedText.substring(0, 50)}..."` : 'null');
    return trimmedText;
  } catch (error) {
    // File doesn't exist or error occurred
    console.error(`[loadHelpTip] Error loading ${helpTipPath}:`, error);
    return null;
  }
}

/**
 * Loads a dictionary for a specific language and word length
 * Uses the new directory structure: Language/Locale/answers-<len>.txt
 */
export async function loadDictionary(
  language: string,
  wordLength: number
): Promise<DictionaryEntry | null> {
  const cacheKey = `${language}-${wordLength}`;
  
  // Check cache first
  if (dictionaryCache.has(cacheKey)) {
    return dictionaryCache.get(cacheKey)!;
  }

  const languageDir = getLanguageDir(language);
  if (!languageDir) {
    console.warn(`Unknown language code: ${language}`);
    return null;
  }

  // Load answer words and dictionary words from new structure
  const answersPath = `/dict/${languageDir}/answers-${wordLength}.txt`;
  const dictionaryPath = `/dict/${languageDir}/dictionary-${wordLength}.txt`;

  const [answerWords, allWords] = await Promise.all([
    loadDictionaryFile(answersPath),
    loadDictionaryFile(dictionaryPath),
  ]);

  if (answerWords.length === 0) {
    console.warn(`No answer words found for ${language}-${wordLength}`);
    return null;
  }

  // If dictionary file doesn't exist, use answer words as dictionary
  const combinedWords = allWords.length > 0 
    ? (() => {
        const wordSet = new Set<string>();
        answerWords.forEach(word => wordSet.add(word));
        allWords.forEach(word => wordSet.add(word));
        return Array.from(wordSet).sort();
      })()
    : [...answerWords].sort();

  const sortedAnswerWords = [...answerWords].sort();

  const dictionary: DictionaryEntry = {
    language,
    wordLength,
    words: combinedWords, // All words for validation
    answerWords: sortedAnswerWords, // Only answer words for daily word selection
  };

  // Cache the dictionary
  dictionaryCache.set(cacheKey, dictionary);

  return dictionary;
}

/**
 * Detects available word lengths for a language by checking for answer files
 * Uses the new directory structure
 */
async function detectSupportedLengths(language: string): Promise<number[]> {
  // Check cache first
  if (supportedLengthsCache.has(language)) {
    return supportedLengthsCache.get(language)!;
  }

  const languageDir = getLanguageDir(language);
  if (!languageDir) {
    return [];
  }

  const possibleLengths = [4, 5, 6, 7, 8, 9, 10]; // Check common lengths

  // Check for answer files directly (faster than loading full dictionaries)
  const checkPromises = possibleLengths.map(async (length) => {
    const answerPath = `/dict/${languageDir}/answers-${length}.txt`;
    try {
      const response = await fetch(answerPath, { method: 'HEAD' });
      if (response.ok && !response.headers.get('content-type')?.includes('text/html')) {
        return length;
      }
    } catch (error) {
      // File doesn't exist
    }
    return null;
  });

  const results = await Promise.all(checkPromises);
  const lengths = results.filter((length): length is number => length !== null).sort((a, b) => a - b);

  // Cache the result
  supportedLengthsCache.set(language, lengths);

  return lengths;
}

/**
 * Gets all available language configurations with dynamically detected lengths
 * Only returns languages that have at least one answer file
 */
export async function getLanguageConfigs(): Promise<LanguageConfig[]> {
  // Discover languages from directory structure
  const configs = await discoverLanguages();
  
  // Detect supported lengths for each discovered language
  const configsWithLengths = await Promise.all(
    configs.map(async (config) => {
      const supportedLengths = await detectSupportedLengths(config.code);
      return {
        ...config,
        supportedLengths,
      };
    })
  );

  // Filter out languages that don't have any answer files
  return configsWithLengths.filter(config => config.supportedLengths.length > 0);
}

/**
 * Gets a language config by code (synchronous version that may return cached data)
 * For immediate use, call getLanguageConfigs() first to ensure detection is complete
 */
export async function getLanguageConfig(code: string): Promise<LanguageConfig | undefined> {
  const configs = await getLanguageConfigs();
  return configs.find(lang => lang.code === code);
}

/**
 * Loads keyboard layout for a language
 * Supports both old format (2D array) and new format (object with layout and actions)
 */
export async function loadKeyboard(language: string): Promise<string[][] | null> {
  // Check cache first
  if (keyboardCache.has(language)) {
    return keyboardCache.get(language)!;
  }

  const languageDir = getLanguageDir(language);
  if (!languageDir) {
    return null;
  }

  const keyboardPath = `/dict/${languageDir}/keyboard.json`;

  try {
    const response = await fetch(keyboardPath);
    
    if (response.status === 404 || !response.ok) {
      // Keyboard not found - return null to use default English keyboard
      return null;
    }
    
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      // File doesn't exist
      return null;
    }
    
    const keyboardData = await response.json();
    
    // Handle new format: { layout: [...], actions: {...} }
    if (keyboardData && typeof keyboardData === 'object' && 'layout' in keyboardData) {
      const config = keyboardData as KeyboardConfig;
      if (Array.isArray(config.layout) && config.layout.every(row => Array.isArray(row))) {
        keyboardCache.set(language, config.layout);
        // Cache actions if provided
        if (config.actions) {
          keyboardActionsCache.set(language, config.actions);
        }
        return config.layout;
      }
    }
    
    // Handle old format: 2D array
    if (Array.isArray(keyboardData) && keyboardData.every(row => Array.isArray(row))) {
      keyboardCache.set(language, keyboardData);
      return keyboardData;
    }
    
    return null;
  } catch (error) {
    // File doesn't exist or error occurred - return null to use default
    return null;
  }
}

/**
 * Loads keyboard action buttons configuration for a language
 */
export async function loadKeyboardActions(language: string): Promise<KeyboardActions | null> {
  // Check cache first
  if (keyboardActionsCache.has(language)) {
    return keyboardActionsCache.get(language)!;
  }

  // Try to load keyboard (which will also cache actions if present)
  await loadKeyboard(language);
  
  // Return cached actions or null
  return keyboardActionsCache.get(language) || null;
}

/**
 * Preloads all dictionaries (useful for initial load)
 */
export async function preloadAllDictionaries(): Promise<void> {
  const loadPromises: Promise<void>[] = [];
  
  const configs = await getLanguageConfigs();
  for (const langConfig of configs) {
    for (const length of langConfig.supportedLengths) {
      console.log(`Detected lengths for ${langConfig.code}:`, length);
      loadPromises.push(
        loadDictionary(langConfig.code, length).then(() => {})
      );
    }
  }

  await Promise.all(loadPromises);
}

