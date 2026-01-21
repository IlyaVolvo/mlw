import React from 'react';
import type { Guess, LetterEvaluation } from '../types';

interface GameBoardProps {
  guesses: Guess[];
  currentGuess: string;
  wordLength: number;
  maxGuesses: number;
  targetWord?: string;
  isComplete?: boolean;
  isWon?: boolean;
  shakeRowIndex?: number | null;
}

export const GameBoard: React.FC<GameBoardProps> = ({
  guesses,
  currentGuess,
  wordLength,
  maxGuesses,
  targetWord,
  isComplete,
  isWon,
  shakeRowIndex,
}) => {
  const getCellState = (row: number, col: number): LetterEvaluation | null => {
    // Show completed guesses
    if (row < guesses.length) {
      return guesses[row].evaluations[col] || null;
    }
    
    // If game is complete and lost, show target word in the row immediately after the last guess
    // Only show target word if the game was lost (not won), since winning games already show the solution as the last guess
    if (isComplete && !isWon && targetWord && row === guesses.length) {
      if (col < targetWord.length) {
        return { letter: targetWord[col], state: 'correct' };
      }
      return null;
    }
    
    // Show current guess being typed (only if game is not complete)
    if (!isComplete && row === guesses.length && col < currentGuess.length) {
      return { letter: currentGuess[col], state: 'absent' };
    }
    
    return null;
  };

  const getCellClass = (state: LetterEvaluation | null): string => {
    if (!state) return 'cell empty';
    return `cell ${state.state}`;
  };

  const rows: React.ReactNode[] = [];
  for (let row = 0; row < maxGuesses; row++) {
    const cells: React.ReactNode[] = [];
    for (let col = 0; col < wordLength; col++) {
      const cellState = getCellState(row, col);
      cells.push(
        <div key={col} className={getCellClass(cellState)}>
          {cellState?.letter.toUpperCase() || ''}
        </div>
      );
    }
    const isShaking = shakeRowIndex !== null && row === shakeRowIndex;
    rows.push(
      <div key={row} className={`row ${isShaking ? 'shake' : ''}`}>
        {cells}
      </div>
    );
  }

  return <div className="game-board">{rows}</div>;
};

