import type { LetterEvaluation, DictionaryEntry } from '../types';
import { normalize } from './characterNormalization';
import { getNormalization } from '../data/languageLoader';

/**
 * Evaluates a guess against the target word
 */
export function evaluateGuess(guess: string, target: string, language: string): LetterEvaluation[] {
  const evaluations: LetterEvaluation[] = [];
  const mappings = getNormalization(language);

  const normalizedTarget = normalize(target, mappings);
  const normalizedGuess = normalize(guess, mappings);

  const targetChars = normalizedTarget.split('');
  const guessChars = normalizedGuess.split('');
  const originalGuessChars = guess.split('');
  const targetLetterCounts: Map<string, number> = new Map();
  const usedIndices = new Set<number>();

  for (const char of targetChars) {
    targetLetterCounts.set(char, (targetLetterCounts.get(char) || 0) + 1);
  }

  // First pass: mark correct letters (compare normalized, display original)
  for (let i = 0; i < guessChars.length; i++) {
    if (guessChars[i] === targetChars[i]) {
      evaluations[i] = { letter: originalGuessChars[i], state: 'correct' };
      usedIndices.add(i);
      targetLetterCounts.set(guessChars[i], (targetLetterCounts.get(guessChars[i]) || 0) - 1);
    }
  }

  // Second pass: mark present and absent letters
  for (let i = 0; i < guessChars.length; i++) {
    if (!usedIndices.has(i)) {
      const count = targetLetterCounts.get(guessChars[i]) || 0;
      if (count > 0) {
        evaluations[i] = { letter: originalGuessChars[i], state: 'present' };
        targetLetterCounts.set(guessChars[i], count - 1);
      } else {
        evaluations[i] = { letter: originalGuessChars[i], state: 'absent' };
      }
    }
  }

  return evaluations;
}

/**
 * Checks whether a guess matches the target word after normalization.
 * Used both during live gameplay (Enter pressed) and when restoring from history.
 */
export function checkWin(guess: string, targetWord: string, language: string): boolean {
  const mappings = getNormalization(language);
  return normalize(guess, mappings) === normalize(targetWord, mappings);
}

/**
 * Checks if a word is valid in the dictionary
 */
export function isValidWord(word: string, dictionary: DictionaryEntry | null): boolean {
  if (!dictionary) return false;
  const mappings = getNormalization(dictionary.language);
  const normalized = normalize(word.toLowerCase().trim(), mappings);

  return dictionary.words.some(dictWord => {
    return normalize(dictWord.toLowerCase(), mappings) === normalized;
  });
}
