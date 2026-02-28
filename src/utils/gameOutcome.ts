import { loadKeyboard } from '../data/languageLoader';
import { normalizeForLanguage } from './characterNormalization';

type GuessLike = { word: string } | string;

const toGuessWords = (guesses: GuessLike[] | undefined): string[] => {
  if (!Array.isArray(guesses)) return [];
  return guesses
    .map((g) => (typeof g === 'string' ? g : g?.word))
    .filter((word): word is string => typeof word === 'string' && word.length > 0);
};

export async function deriveGameOutcome(input: {
  language: string;
  isComplete: boolean;
  targetWord: string;
  guesses: GuessLike[] | undefined;
}): Promise<{ isWon: boolean; guessesCount: number }> {
  await loadKeyboard(input.language);
  const guessWords = toGuessWords(input.guesses);
  const guessesCount = guessWords.length;

  if (!input.isComplete || guessesCount === 0) {
    return { isWon: false, guessesCount };
  }

  const normalizedTarget = normalizeForLanguage(input.targetWord, input.language);
  const normalizedLastGuess = normalizeForLanguage(guessWords[guessesCount - 1], input.language);
  return { isWon: normalizedLastGuess === normalizedTarget, guessesCount };
}

