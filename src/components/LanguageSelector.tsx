import React, { useState, useEffect } from 'react';
import type { LanguageConfig } from '../types';
import { loadPreferences, savePreferences } from '../utils/preferences';
import { HelpTooltip } from './HelpTooltip';

interface LanguageSelectorProps {
  allAvailableLanguages: LanguageConfig[]; // All languages before filtering
  isOpen: boolean;
  onClose: () => void;
  onSelectionChange: (selectedCodes: string[]) => void;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  allAvailableLanguages,
  isOpen,
  onClose,
  onSelectionChange,
}) => {
  const [selectedLanguages, setSelectedLanguages] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      const prefs = loadPreferences();
      const selected = prefs.selectedLanguages || allAvailableLanguages.map(l => l.code);
      setSelectedLanguages(new Set(selected));
    }
  }, [isOpen, allAvailableLanguages]);

  const handleToggle = (code: string) => {
    const newSelected = new Set(selectedLanguages);
    if (newSelected.has(code)) {
      // Don't allow deselecting the last language
      if (newSelected.size > 1) {
        newSelected.delete(code);
      }
    } else {
      newSelected.add(code);
    }
    setSelectedLanguages(newSelected);
  };

  const handleSave = () => {
    const selectedArray = Array.from(selectedLanguages);
    const prefs = loadPreferences();
    
    // Save selected languages (undefined if all selected)
    prefs.selectedLanguages = selectedArray.length === allAvailableLanguages.length 
      ? undefined 
      : selectedArray;
    
    // Ensure current language is in selected list, if not switch to first selected
    if (!selectedArray.includes(prefs.language)) {
      prefs.language = selectedArray[0] || 'en';
    }
    
    savePreferences(prefs);
    onSelectionChange(selectedArray);
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="language-selector-overlay" onClick={handleCancel}>
      <div className="language-selector-modal" onClick={(e) => e.stopPropagation()}>
        <div className="language-selector-header">
          <h2>Select Languages</h2>
          <button className="close-button" onClick={handleCancel} aria-label="Close">×</button>
        </div>
        <div className="language-selector-list">
          {allAvailableLanguages.map((lang) => {
            const isSelected = selectedLanguages.has(lang.code);
            const isDisabled = selectedLanguages.size === 1 && isSelected;
            
            return (
              <label 
                key={lang.code} 
                className={`language-selector-item ${isDisabled ? 'disabled' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleToggle(lang.code)}
                  disabled={isDisabled}
                />
                {lang.flag && <span className="language-selector-flag">{lang.flag}</span>}
                <span className="language-selector-item-name">{lang.name}</span>
                <HelpTooltip language={lang.code} placement="left">
                  <span className="language-selector-item-help" title={`Help for ${lang.name}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                      <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                  </span>
                </HelpTooltip>
              </label>
            );
          })}
        </div>
        <div className="language-selector-footer">
          <button onClick={handleCancel}>Cancel</button>
          <button onClick={handleSave} className="primary">Save</button>
        </div>
      </div>
    </div>
  );
};
