import type { LetterEvaluation, DictionaryEntry } from '../types';

/**
 * Evaluates a guess against the target word
 */
export function evaluateGuess(guess: string, target: string): LetterEvaluation[] {
  const evaluations: LetterEvaluation[] = [];
  const targetChars = target.split('');
  const guessChars = guess.split('');
  const targetLetterCounts: Map<string, number> = new Map();
  const usedIndices = new Set<number>();

  // Count letters in target word
  for (const char of targetChars) {
    targetLetterCounts.set(char, (targetLetterCounts.get(char) || 0) + 1);
  }

  // First pass: mark correct letters
  for (let i = 0; i < guessChars.length; i++) {
    if (guessChars[i] === targetChars[i]) {
      evaluations[i] = { letter: guessChars[i], state: 'correct' };
      usedIndices.add(i);
      targetLetterCounts.set(guessChars[i], (targetLetterCounts.get(guessChars[i]) || 0) - 1);
    }
  }

  // Second pass: mark present and absent letters
  for (let i = 0; i < guessChars.length; i++) {
    if (!usedIndices.has(i)) {
      const count = targetLetterCounts.get(guessChars[i]) || 0;
      if (count > 0) {
        evaluations[i] = { letter: guessChars[i], state: 'present' };
        targetLetterCounts.set(guessChars[i], count - 1);
      } else {
        evaluations[i] = { letter: guessChars[i], state: 'absent' };
      }
    }
  }

  return evaluations;
}

/**
 * Checks if a word is valid in the dictionary
 */
export function isValidWord(word: string, dictionary: DictionaryEntry | null): boolean {
  if (!dictionary) return false;
  const normalized = word.toLowerCase().trim();
  return dictionary.words.includes(normalized);
}

