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

// Type for action button configuration
type ActionButton = {
  label: string;
  position: 'start' | 'end' | 'none';
};

type ActionsState = {
  enter: ActionButton;
  backspace: ActionButton;
};

// Default action buttons (used as fallback)
const DEFAULT_ACTIONS: ActionsState = {
  enter: { label: 'ENTER', position: 'start' },
  backspace: { label: '⌫', position: 'end' },
};

export const Keyboard: React.FC<KeyboardProps> = ({
  onKeyPress,
  onEnter,
  onBackspace,
  letterStates,
  language,
}) => {
  const [layout, setLayout] = useState<string[][]>(DEFAULT_KEYBOARD);
  const [actions, setActions] = useState<ActionsState>(DEFAULT_ACTIONS);

  useEffect(() => {
    const loadLayout = async () => {
      const keyboard = await loadKeyboard(language);
      setLayout(keyboard || DEFAULT_KEYBOARD);
      
      const keyboardActions = await loadKeyboardActions(language);
      if (keyboardActions) {
        setActions({
          enter: {
            label: keyboardActions.enter?.label || DEFAULT_ACTIONS.enter.label,
            position: (keyboardActions.enter?.position || DEFAULT_ACTIONS.enter.position) as 'start' | 'end' | 'none',
          },
          backspace: {
            label: keyboardActions.backspace?.label || DEFAULT_ACTIONS.backspace.label,
            position: (keyboardActions.backspace?.position || DEFAULT_ACTIONS.backspace.position) as 'start' | 'end' | 'none',
          },
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
    const position = actions.enter.position;
    return position !== 'none';
  };

  const shouldShowBackspace = (rowIndex: number): boolean => {
    if (rowIndex !== layout.length - 1) return false;
    const position = actions.backspace.position;
    return position !== 'none';
  };

  const getEnterPosition = (): 'start' | 'end' => {
    const pos = actions.enter.position;
    return pos === 'none' ? 'start' : (pos as 'start' | 'end');
  };

  const getBackspacePosition = (): 'start' | 'end' => {
    const pos = actions.backspace.position;
    return pos === 'none' ? 'end' : (pos as 'start' | 'end');
  };

  const getEnterLabel = (): string => {
    return actions.enter.label;
  };

  const getBackspaceLabel = (): string => {
    return actions.backspace.label;
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

