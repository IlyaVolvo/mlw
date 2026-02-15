import React, { useState } from 'react';
import type { LetterEvaluation } from '../types';

interface TutorialProps {
  onComplete: () => void;
}

// The secret word for the tutorial
const WORD_LENGTH = 5;

// Pre-scripted guesses with their evaluations
const TUTORIAL_GUESSES: { word: string; evaluations: LetterEvaluation[] }[] = [
  {
    word: 'STARE',
    evaluations: [
      { letter: 'S', state: 'absent' },
      { letter: 'T', state: 'absent' },
      { letter: 'A', state: 'present' },
      { letter: 'R', state: 'present' },
      { letter: 'E', state: 'correct' },
    ],
  },
  {
    word: 'BRAIN',
    evaluations: [
      { letter: 'B', state: 'absent' },
      { letter: 'R', state: 'present' },
      { letter: 'A', state: 'present' },
      { letter: 'I', state: 'absent' },
      { letter: 'N', state: 'present' },
    ],
  },
  {
    word: 'NEARS',
    evaluations: [
      { letter: 'N', state: 'present' },
      { letter: 'E', state: 'present' },
      { letter: 'A', state: 'present' },
      { letter: 'R', state: 'present' },
      { letter: 'S', state: 'absent' },
    ],
  },
  {
    word: 'CRANE',
    evaluations: [
      { letter: 'C', state: 'correct' },
      { letter: 'R', state: 'correct' },
      { letter: 'A', state: 'correct' },
      { letter: 'N', state: 'correct' },
      { letter: 'E', state: 'correct' },
    ],
  },
];

// Step-by-step tutorial content
interface TutorialStep {
  title: string;
  description: string;
  guessesShown: number; // How many guesses to reveal (0 = empty board)
  highlightRow?: number; // Which row to highlight for explanation
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: 'Welcome to PolyWordlot!',
    description: 'Your goal is to guess a hidden 5-letter word in 6 attempts or fewer. Let\'s walk through a sample game together. The secret word is hidden — can you figure it out?',
    guessesShown: 0,
  },
  {
    title: 'First Guess: STARE',
    description: 'We start with a common word. After submitting, each letter gets a color:\n\n🟩 Green = correct letter, correct position\n🟨 Yellow = correct letter, wrong position\n⬜ Gray = letter not in the word\n\nHere, A and R are in the word but misplaced (yellow), E is in the right spot (green), and S and T are not in the word (gray).',
    guessesShown: 1,
    highlightRow: 0,
  },
  {
    title: 'Second Guess: BRAIN',
    description: 'Using what we learned — we know A, R, and E are in the word. Let\'s try BRAIN.\n\nR, A, and N are in the word but in wrong positions (yellow). B and I are not in the word (gray). Now we know the word contains: A, R, E, N.',
    guessesShown: 2,
    highlightRow: 1,
  },
  {
    title: 'Third Guess: NEARS',
    description: 'We now know four letters: A, R, E, N. Let\'s try rearranging them with NEARS.\n\nAll four known letters light up yellow — they\'re all in the word, but none are in the right position yet. This narrows down the arrangement significantly.',
    guessesShown: 3,
    highlightRow: 2,
  },
  {
    title: 'Final Guess: CRANE',
    description: 'With all the clues, there\'s really only one option left: CRANE!\n\n🟩🟩🟩🟩🟩 — All green! The word was CRANE. You solved it in 4 attempts!',
    guessesShown: 4,
    highlightRow: 3,
  },
  {
    title: 'You\'re Ready!',
    description: 'That\'s all you need to know! Here are some tips:\n\n• Start with words that use common letters (S, T, A, R, E)\n• Pay attention to yellow letters — they\'re in the word, just not there\n• Use the process of elimination to narrow down positions\n• You have 6 attempts per game — take your time!\n\nPolyWordlot supports multiple languages and word lengths. Have fun!',
    guessesShown: 4,
  },
];

export const Tutorial: React.FC<TutorialProps> = ({ onComplete }) => {
  const [step, setStep] = useState(0);

  const currentStep = TUTORIAL_STEPS[step];
  const guessesToShow = TUTORIAL_GUESSES.slice(0, currentStep.guessesShown);

  const handleNext = () => {
    if (step < TUTORIAL_STEPS.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  const handlePrev = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  // Render a mini game board
  const renderBoard = () => {
    const rows: React.ReactNode[] = [];
    const maxGuesses = 6;

    for (let row = 0; row < maxGuesses; row++) {
      const cells: React.ReactNode[] = [];
      const isHighlighted = currentStep.highlightRow === row;

      for (let col = 0; col < WORD_LENGTH; col++) {
        let cellClass = 'cell empty';
        let letter = '';

        if (row < guessesToShow.length) {
          const evaluation = guessesToShow[row].evaluations[col];
          cellClass = `cell ${evaluation.state}`;
          letter = evaluation.letter;
        }

        cells.push(
          <div key={col} className={cellClass}>
            {letter}
          </div>
        );
      }

      rows.push(
        <div
          key={row}
          className={`row ${isHighlighted ? 'tutorial-highlight-row' : ''}`}
        >
          {cells}
        </div>
      );
    }

    return <div className="game-board">{rows}</div>;
  };

  const isLastStep = step === TUTORIAL_STEPS.length - 1;

  return (
    <div className="tutorial-container">
      <div className="tutorial-card">
        <div className="tutorial-header">
          <h2>{currentStep.title}</h2>
          <div className="tutorial-progress">
            {TUTORIAL_STEPS.map((_, i) => (
              <div
                key={i}
                className={`tutorial-progress-dot ${i === step ? 'active' : ''} ${i < step ? 'completed' : ''}`}
              />
            ))}
          </div>
        </div>

        <div className="tutorial-board-area">
          {renderBoard()}
        </div>

        <div className="tutorial-explanation">
          <p>{currentStep.description}</p>
        </div>

        <div className="tutorial-actions">
          <button
            type="button"
            className="tutorial-skip-button"
            onClick={handleSkip}
          >
            Skip Tutorial
          </button>
          <div className="tutorial-nav-buttons">
            {step > 0 && (
              <button
                type="button"
                className="tutorial-prev-button"
                onClick={handlePrev}
              >
                Back
              </button>
            )}
            <button
              type="button"
              className="tutorial-next-button"
              onClick={handleNext}
            >
              {isLastStep ? 'Other Features' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
