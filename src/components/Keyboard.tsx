import React, { useState, useEffect } from 'react';
import type { LetterState } from '../types';
import { loadKeyboard, loadKeyboardActions } from '../data/dictionaryLoader';

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

// Default action buttons (used as fallback)
const DEFAULT_ACTIONS = {
  enter: { label: 'ENTER', position: 'start' as const },
  backspace: { label: '⌫', position: 'end' as const },
};

export const Keyboard: React.FC<KeyboardProps> = ({
  onKeyPress,
  onEnter,
  onBackspace,
  letterStates,
  language,
}) => {
  const [layout, setLayout] = useState<string[][]>(DEFAULT_KEYBOARD);
  const [actions, setActions] = useState(DEFAULT_ACTIONS);

  useEffect(() => {
    const loadLayout = async () => {
      const keyboard = await loadKeyboard(language);
      setLayout(keyboard || DEFAULT_KEYBOARD);
      
      const keyboardActions = await loadKeyboardActions(language);
      if (keyboardActions) {
        setActions({
          enter: keyboardActions.enter || DEFAULT_ACTIONS.enter,
          backspace: keyboardActions.backspace || DEFAULT_ACTIONS.backspace,
        });
      } else {
        setActions(DEFAULT_ACTIONS);
      }
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

  const shouldShowEnter = (rowIndex: number): boolean => {
    if (rowIndex !== layout.length - 1) return false;
    const position = actions.enter?.position || 'start';
    return position !== 'none';
  };

  const shouldShowBackspace = (rowIndex: number): boolean => {
    if (rowIndex !== layout.length - 1) return false;
    const position = actions.backspace?.position || 'end';
    return position !== 'none';
  };

  const getEnterPosition = (): 'start' | 'end' => {
    return (actions.enter?.position || 'start') as 'start' | 'end';
  };

  const getBackspacePosition = (): 'start' | 'end' => {
    return (actions.backspace?.position || 'end') as 'start' | 'end';
  };

  const getEnterLabel = (): string => {
    return actions.enter?.label || 'ENTER';
  };

  const getBackspaceLabel = (): string => {
    return actions.backspace?.label || '⌫';
  };

  return (
    <div className="keyboard">
      {layout.map((row, rowIndex) => (
        <div key={rowIndex} className="keyboard-row">
          {shouldShowEnter(rowIndex) && getEnterPosition() === 'start' && (
            <button className="key key-action" onClick={onEnter}>
              {getEnterLabel()}
            </button>
          )}
          {shouldShowBackspace(rowIndex) && getBackspacePosition() === 'start' && (
            <button className="key key-action" onClick={onBackspace}>
              {getBackspaceLabel()}
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
          {shouldShowEnter(rowIndex) && getEnterPosition() === 'end' && (
            <button className="key key-action" onClick={onEnter}>
              {getEnterLabel()}
            </button>
          )}
          {shouldShowBackspace(rowIndex) && getBackspacePosition() === 'end' && (
            <button className="key key-action" onClick={onBackspace}>
              {getBackspaceLabel()}
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

