import React from 'react';
import type { LetterState } from '../types';

interface KeyboardProps {
  onKeyPress: (key: string) => void;
  onEnter: () => void;
  onBackspace: () => void;
  letterStates: Map<string, LetterState>;
  language: string;
}

// Keyboard layouts for different languages
const KEYBOARD_LAYOUTS: Record<string, string[][]> = {
  en: [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
  ],
  de: [
    ['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['y', 'x', 'c', 'v', 'b', 'n', 'm'],
  ],
  fr: [
    ['a', 'z', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['q', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm'],
    ['w', 'x', 'c', 'v', 'b', 'n'],
  ],
  it: [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
  ],
  ru: [
    ['й', 'ц', 'у', 'к', 'е', 'н', 'г', 'ш', 'щ', 'з', 'х', 'ъ'],
    ['ф', 'ы', 'в', 'а', 'п', 'р', 'о', 'л', 'д', 'ж', 'э'],
    ['я', 'ч', 'с', 'м', 'и', 'т', 'ь', 'б', 'ю'],
  ],
};

export const Keyboard: React.FC<KeyboardProps> = ({
  onKeyPress,
  onEnter,
  onBackspace,
  letterStates,
  language,
}) => {
  const layout = KEYBOARD_LAYOUTS[language] || KEYBOARD_LAYOUTS.en;

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

