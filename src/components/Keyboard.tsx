import React, { useState, useEffect } from 'react';
import type { LetterState } from '../types';
import { loadKeyboard } from '../data/dictionaryLoader';

interface KeyboardProps {
  onKeyPress: (key: string) => void;
  onEnter: () => void;
  onBackspace: () => void;
  letterStates: Map<string, LetterState>;
  language: string;
}

// Default English keyboard layout (used as fallback)
const DEFAULT_KEYBOARD: string[][] = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

export const Keyboard: React.FC<KeyboardProps> = ({
  onKeyPress,
  onEnter,
  onBackspace,
  letterStates,
  language,
}) => {
  const [layout, setLayout] = useState<string[][]>(DEFAULT_KEYBOARD);

  useEffect(() => {
    const loadLayout = async () => {
      const keyboard = await loadKeyboard(language);
      setLayout(keyboard || DEFAULT_KEYBOARD);
    };
    
    loadLayout();
  }, [language]);

  const getKeyClass = (key: string): string => {
    const state = letterStates.get(key.toLowerCase());
    if (state) {
      return `key ${state}`;
    }
    return 'key';
  };

  return (
    <div className="keyboard">
      {layout.map((row, rowIndex) => (
        <div key={rowIndex} className="keyboard-row">
          {rowIndex === layout.length - 1 && (
            <button className="key key-action" onClick={onEnter}>
              ENTER
            </button>
          )}
          {row.map((key) => (
            <button
              key={key}
              className={getKeyClass(key)}
              onClick={() => onKeyPress(key)}
            >
              {key.toUpperCase()}
            </button>
          ))}
          {rowIndex === layout.length - 1 && (
            <button className="key key-action" onClick={onBackspace}>
              ⌫
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

