import type { DictionaryEntry, LanguageConfig } from '../types';

// Language metadata (names only, lengths will be detected)
const LANGUAGE_METADATA: Array<{ code: string; name: string }> = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
  { code: 'it', name: 'Italiano' },
  { code: 'ru', name: 'Русский' },
];

// Cache for loaded dictionaries
const dictionaryCache = new Map<string, DictionaryEntry>();

// Cache for detected supported lengths per language
const supportedLengthsCache = new Map<string, number[]>();

/**
 * Loads a dictionary file as text
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
      .map(line => {
        // Extract only the first word (up to first whitespace)
        const firstWord = line.trim().split(/\s+/)[0];
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
 * Loads a dictionary for a specific language and word length
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

  // Load answer words and dictionary words
  const answersPath = `/dict/wordle-wordlists/${language}-${wordLength}-answers.txt`;
  const dictionaryPath = `/dict/wordle-wordlists/${language}-${wordLength}-dictionary.txt`;

  const [answerWords, allWords] = await Promise.all([
    loadDictionaryFile(answersPath),
    loadDictionaryFile(dictionaryPath),
  ]);

  if (answerWords.length === 0) {
    console.warn(`No answer words found for ${language}-${wordLength}`);
    return null;
  }

  // Combine answer words with dictionary words, removing duplicates
  const wordSet = new Set<string>();
  answerWords.forEach(word => wordSet.add(word));
  allWords.forEach(word => wordSet.add(word));
  
  const combinedWords = Array.from(wordSet).sort();
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
 * Detects available word lengths for a language by trying to load each dictionary
 * This uses the actual dictionary loading mechanism, so it's reliable
 */
async function detectSupportedLengths(language: string): Promise<number[]> {
  // Check cache first
  if (supportedLengthsCache.has(language)) {
    return supportedLengthsCache.get(language)!;
  }

  const possibleLengths = [4, 5, 6, 7, 8, 9, 10]; // Check common lengths

  // Try to load each dictionary - if it succeeds (returns non-null), the length is available
  const checkPromises = possibleLengths.map(async (length) => {
      try {
        const dictionary = await loadDictionary(language, length);
        // Log detection result
        console.log(`Language: ${language}, Length: ${length}, Dictionary size: ${dictionary ? dictionary.words.length : null}`);
        // If dictionary loaded successfully (not null), this length is available
        return dictionary !== null ? length : null;
    } catch (error) {
      // Dictionary doesn't exist or failed to load
      return null;
    }
  });

  const results = await Promise.all(checkPromises);
  const detectedLengths = results.filter((length): length is number => length !== null).sort((a, b) => a - b);

  // Cache the result
  supportedLengthsCache.set(language, detectedLengths);

  return detectedLengths;
}

/**
 * Gets all available language configurations with dynamically detected lengths
 * Only returns languages that have at least one dictionary
 */
export async function getLanguageConfigs(): Promise<LanguageConfig[]> {
  const configPromises = LANGUAGE_METADATA.map(async (lang) => {
    const supportedLengths = await detectSupportedLengths(lang.code);
    return {
      code: lang.code,
      name: lang.name,
      supportedLengths,
    };
  });

  const allConfigs = await Promise.all(configPromises);
  // Filter out languages that don't have any dictionaries
  return allConfigs.filter(config => config.supportedLengths.length > 0);
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

