import { getLanguageDir } from '../data/dictionaryLoader';

// Cache for loaded normalization mappings
const normalizationCache = new Map<string, Record<string, string>>();

/**
 * Loads character normalization mappings for a language from its directory
 * Looks for normalization.json in Language/Locale/ directory
 */
export async function loadNormalization(language: string): Promise<Record<string, string> | null> {
  // Check cache first
  if (normalizationCache.has(language)) {
    return normalizationCache.get(language)!;
  }

  const languageDir = getLanguageDir(language);
  if (!languageDir) {
    return null;
  }

  const normalizationPath = `/dict/${languageDir}/normalization.json`;

  try {
    const response = await fetch(normalizationPath);
    
    if (response.status === 404 || !response.ok) {
      // Normalization file not found - return null (no normalization for this language)
      normalizationCache.set(language, {});
      return null;
    }
    
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      // File doesn't exist
      normalizationCache.set(language, {});
      return null;
    }
    
    const normalization = await response.json();
    
    // Validate normalization structure (should be object with string keys and string values)
    if (typeof normalization === 'object' && normalization !== null && !Array.isArray(normalization)) {
      const isValid = Object.entries(normalization).every(
        ([key, value]) => typeof key === 'string' && typeof value === 'string'
      );
      
      if (isValid) {
        normalizationCache.set(language, normalization);
        return normalization;
      }
    }
    
    return null;
  } catch (error) {
    // File doesn't exist or error occurred - return null (no normalization)
    normalizationCache.set(language, {});
    return null;
  }
}

/**
 * Normalizes characters for a given language
 * Replaces variant characters with their base equivalents according to language-specific rules
 * Uses cached normalization mappings loaded from language directories
 * 
 * @param word - The word to normalize
 * @param language - Language code (e.g., 'ru', 'fr', 'de')
 * @returns Normalized word with variant characters replaced
 */
export function normalizeForLanguage(word: string, language: string): string {
  const mappings = normalizationCache.get(language);
  
  // If no mappings exist for this language, return word as-is
  if (!mappings || Object.keys(mappings).length === 0) {
    return word;
  }
  
  // Apply all character replacements
  // Process multi-character replacements first to avoid conflicts
  let normalized = word;
  const singleCharReplacements: [string, string][] = [];
  const multiCharReplacements: [string, string][] = [];
  
  for (const [variant, base] of Object.entries(mappings)) {
    if (base.length > 1) {
      multiCharReplacements.push([variant, base]);
    } else {
      singleCharReplacements.push([variant, base]);
    }
  }
  
  // Apply multi-character replacements first (e.g., ß -> ss)
  for (const [variant, base] of multiCharReplacements) {
    normalized = normalized.replace(new RegExp(escapeRegex(variant), 'g'), base);
  }
  
  // Then apply single-character replacements
  for (const [variant, base] of singleCharReplacements) {
    normalized = normalized.replace(new RegExp(escapeRegex(variant), 'g'), base);
  }
  
  return normalized;
}

/**
 * Escapes special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
