import React from 'react';
import type { LanguageConfig } from '../types';

interface SettingsProps {
  language: string;
  wordLength: number;
  randomMode: boolean;
  availableLanguages: LanguageConfig[];
  onLanguageChange: (language: string) => void;
  onWordLengthChange: (length: number) => void;
  onRandomModeChange: (randomMode: boolean) => void;
  disabled?: boolean;
}

export const Settings: React.FC<SettingsProps> = ({
  language,
  wordLength,
  randomMode,
  availableLanguages,
  onLanguageChange,
  onWordLengthChange,
  onRandomModeChange,
  disabled = false,
}) => {
  const currentLangConfig = availableLanguages.find(lang => lang.code === language);

  return (
    <div className="settings">
      <div className="setting-group">
        <select
          id="language-select"
          value={language}
          onChange={(e) => onLanguageChange(e.target.value)}
          disabled={disabled}
        >
          {availableLanguages.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
      </div>
      <div className="setting-group">
        <select
          id="length-select"
          value={wordLength}
          onChange={(e) => onWordLengthChange(Number(e.target.value))}
          disabled={disabled}
        >
          {currentLangConfig?.supportedLengths.map((length) => (
            <option key={length} value={length}>
              {length}
            </option>
          ))}
        </select>
      </div>
      <div className="setting-group">
        <select
          id="mode-select"
          value={randomMode ? 'random' : 'daily'}
          onChange={(e) => onRandomModeChange(e.target.value === 'random')}
          disabled={disabled}
        >
          <option value="daily">Daily</option>
          <option value="random">Random</option>
        </select>
      </div>
    </div>
  );
};

