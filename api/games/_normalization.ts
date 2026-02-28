const MAX_GUESSES = 6;

function normalize(word: string, mappings: Record<string, string> | undefined): string {
  if (!mappings) return word;

  let result = word;
  for (const [variant, base] of Object.entries(mappings)) {
    result = result.split(variant).join(base);
  }
  return result;
}

/**
 * Derives isWon from game data using normalization-aware comparison.
 *
 * Rules:
 *  1. Game must be complete.
 *  2. Won if the last guess matches target_word after normalization.
 *  3. Lost only when all MAX_GUESSES are used and the last one doesn't match.
 *  If none of these hold, logs an error (should not happen in a well-behaved client).
 */
export function deriveIsWon(
  isComplete: number,
  guesses: string[],
  targetWord: string,
  mappings: Record<string, string> | undefined,
  gameId?: number,
): boolean {
  if (isComplete !== 1) return false;

  if (guesses.length === 0) {
    console.error(`[deriveIsWon] Game ${gameId ?? '?'}: complete with 0 guesses — unexpected state`);
    return false;
  }

  const lastGuess = guesses[guesses.length - 1];
  const normalizedLast = normalize(lastGuess, mappings);
  const normalizedTarget = normalize(targetWord, mappings);

  if (normalizedLast === normalizedTarget) return true;

  if (guesses.length >= MAX_GUESSES) return false;

  console.error(
    `[deriveIsWon] Game ${gameId ?? '?'}: complete with ${guesses.length} guesses ` +
    `but last guess "${lastGuess}" ≠ target "${targetWord}" (normalized: "${normalizedLast}" vs "${normalizedTarget}") — unexpected state`
  );
  return false;
}
