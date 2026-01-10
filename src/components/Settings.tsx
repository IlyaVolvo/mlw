import React from 'react';
import type { LanguageConfig } from '../types';
import { formatDate } from '../utils/dailyWord';

interface SettingsProps {
  language: string;
  wordLength: number;
  randomMode: boolean;
  availableLanguages: LanguageConfig[];
  selectedDate: string;
  onLanguageChange: (language: string) => void;
  onWordLengthChange: (length: number) => void;
  onRandomModeChange: (randomMode: boolean) => void;
  onDateChange: (date: string) => void;
  disabled?: boolean;
}

// Format date for display - show "today", "yesterday", day of week, or actual date
const formatDateDisplay = (selectedDate: string | null, today: string): string => {
  if (!selectedDate || selectedDate === today) {
    return 'today';
  }
  
  // Parse dates in local time (YYYY-MM-DD format)
  const [yearStr, monthStr, dayStr] = selectedDate.split('-');
  const selectedDateObj = new Date(parseInt(yearStr), parseInt(monthStr) - 1, parseInt(dayStr));
  const todayStr = today.split('-');
  const todayObj = new Date(parseInt(todayStr[0]), parseInt(todayStr[1]) - 1, parseInt(todayStr[2]));
  
  // Calculate days difference
  const diffTime = todayObj.getTime() - selectedDateObj.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  // Show "yesterday" if it's 1 day ago
  if (diffDays === 1) {
    return 'yesterday';
  }
  
  // Check if it's in the same week as today
  const startOfWeek = new Date(todayObj);
  startOfWeek.setDate(todayObj.getDate() - todayObj.getDay()); // Sunday
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6); // Saturday
  
  if (selectedDateObj >= startOfWeek && selectedDateObj <= endOfWeek) {
    // Same week - show day of week
    const dayOfWeek = selectedDateObj.toLocaleDateString('en-US', { weekday: 'long' });
    return dayOfWeek;
  }
  
  // Otherwise show actual date
  const month = selectedDateObj.toLocaleDateString('en-US', { month: 'short' });
  const day = selectedDateObj.getDate();
  const year = selectedDateObj.getFullYear();
  const todayYear = todayObj.getFullYear();
  
  if (year === todayYear) {
    return `${month} ${day}`;
  }
  return `${month} ${day}, ${year}`;
};

export const Settings: React.FC<SettingsProps> = ({
  language,
  wordLength,
  randomMode,
  availableLanguages,
  selectedDate,
  onLanguageChange,
  onWordLengthChange,
  onRandomModeChange,
  onDateChange,
  disabled = false,
}) => {
  const currentLangConfig = availableLanguages.find(lang => lang.code === language);
  const today = formatDate();

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
          value={randomMode ? 'training' : 'daily'}
          onChange={(e) => onRandomModeChange(e.target.value === 'training')}
          disabled={disabled}
        >
          <option value="daily">Daily</option>
          <option value="training">Training</option>
        </select>
      </div>
      {!randomMode && (
        <div className="setting-group date-picker-setting">
          <div className="date-picker-wrapper-inline" style={{ position: 'relative', display: 'inline-block' }}>
            <input
              id="date-picker-hidden"
              type="date"
              value={selectedDate || today}
              max={today}
              onChange={(e) => {
                const selectedValue = e.target.value;
                // Ensure no future dates can be selected
                if (selectedValue <= today) {
                  onDateChange(selectedValue);
                }
              }}
              disabled={disabled}
              className="date-picker-input-compact"
              style={{ 
                padding: '8px 8px',
                paddingLeft: '32px',
                paddingRight: '8px',
                border: '2px solid #ddd',
                borderRadius: '8px',
                fontSize: '1rem',
                background: 'white',
                cursor: disabled ? 'not-allowed' : 'pointer',
                transition: 'border-color 0.2s',
                color: 'transparent',
                width: 'auto',
                minWidth: '120px',
                height: '38px',
                position: 'relative',
                zIndex: 2,
                caretColor: 'transparent'
              }}
              onMouseEnter={(e) => {
                if (!disabled) {
                  e.currentTarget.style.borderColor = '#667eea';
                }
              }}
              onMouseLeave={(e) => {
                if (!disabled) {
                  e.currentTarget.style.borderColor = '#ddd';
                }
              }}
              onClick={(e) => {
                if (!disabled) {
                  e.stopPropagation();
                  // Ensure the picker opens
                  const input = e.currentTarget;
                  if (input && typeof (input as any).showPicker === 'function') {
                    try {
                      (input as any).showPicker();
                    } catch (err) {
                      // Fallback if showPicker fails
                      input.focus();
                      input.click();
                    }
                  }
                }
              }}
            />
            <div 
              className="date-picker-icon-overlay" 
              aria-hidden="true"
              style={{ 
                position: 'absolute',
                left: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                zIndex: 3,
                color: '#666'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="4" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                <line x1="3" y1="8" x2="17" y2="8" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="7" y1="4" x2="7" y2="8" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="13" y1="4" x2="13" y2="8" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="10" cy="12" r="1" fill="currentColor"/>
                <circle cx="13" cy="12" r="1" fill="currentColor"/>
                <circle cx="16" cy="12" r="1" fill="currentColor"/>
                <circle cx="10" cy="15" r="1" fill="currentColor"/>
                <circle cx="13" cy="15" r="1" fill="currentColor"/>
                <circle cx="16" cy="15" r="1" fill="currentColor"/>
              </svg>
            </div>
            <span 
              className="date-display-text-compact" 
              style={{
                position: 'absolute',
                left: '32px',
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                fontSize: '1rem',
                color: '#333',
                fontWeight: 500,
                userSelect: 'none',
                textAlign: 'left',
                whiteSpace: 'nowrap',
                zIndex: 3,
                display: 'block',
                lineHeight: '1'
              }}
            >
              {formatDateDisplay(selectedDate || null, today)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

