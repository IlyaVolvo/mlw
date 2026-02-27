/**
 * Normalizes characters in a word using the provided mappings.
 * Pure function — knows nothing about languages; the caller supplies the right map.
 *
 * Multi-character replacements (e.g. ß → ss) are applied before single-character
 * ones to avoid partial-match conflicts.
 */
export function normalize(word: string, mappings: Record<string, string> | null | undefined): string {
  if (!mappings || Object.keys(mappings).length === 0) return word;

  let result = word;
  const singleChar: [string, string][] = [];
  const multiChar: [string, string][] = [];

  for (const [variant, base] of Object.entries(mappings)) {
    (base.length > 1 ? multiChar : singleChar).push([variant, base]);
  }

  for (const [variant, base] of multiChar) {
    result = result.replace(new RegExp(escapeRegex(variant), 'g'), base);
  }
  for (const [variant, base] of singleChar) {
    result = result.replace(new RegExp(escapeRegex(variant), 'g'), base);
  }

  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
