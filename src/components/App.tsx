import React, { useState, useEffect } from 'react';
import { Login } from './Login';
import { Register } from './Register';
import { ForgotPassword } from './ForgotPassword';
import { ResetPassword } from './ResetPassword';
import { Game } from './Game';
import { Statistics } from './Statistics';
import { apiClient } from '../api/client';
import { getLanguageConfigs } from '../data/dictionaryLoader';
import { loadPreferences, savePreferences } from '../utils/preferences';
import type { LanguageConfig } from '../types';

interface User {
  id: number;
  email: string;
}

export const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authView, setAuthView] = useState<'login' | 'register' | 'forgot' | 'reset'>('login');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [view, setView] = useState<'game' | 'statistics'>('game');
  const [allAvailableLanguages, setAllAvailableLanguages] = useState<LanguageConfig[]>([]);
  const [availableLanguages, setAvailableLanguages] = useState<LanguageConfig[]>([]);
  const [historicalDate, setHistoricalDate] = useState<string | null>(null);
  const [language, setLanguage] = useState<string>('en');
  const [wordLength, setWordLength] = useState<number>(5);

  useEffect(() => {
    // Load preferences first
    const prefs = loadPreferences();
    setLanguage(prefs.language);
    setWordLength(prefs.wordLength);

    const loadConfigs = async () => {
      const allConfigs = await getLanguageConfigs();
      setAllAvailableLanguages(allConfigs);
      
      // Filter based on user's language selection
      let filteredConfigs = allConfigs;
      
      if (prefs.selectedLanguages && prefs.selectedLanguages.length < allConfigs.length) {
        // Filter to only selected languages
        const selectedSet = new Set(prefs.selectedLanguages);
        filteredConfigs = allConfigs.filter(lang => selectedSet.has(lang.code));
      }
      
      // Ensure current language is in filtered list
      if (prefs.language && !filteredConfigs.find(l => l.code === prefs.language)) {
        // Current language was deselected, switch to first available
        const langToUse = filteredConfigs[0]?.code || 'en';
        const updatedPrefs = { ...prefs, language: langToUse };
        savePreferences(updatedPrefs);
        setLanguage(langToUse);
      }
      
      setAvailableLanguages(filteredConfigs);
      
      // Validate word length for selected language after configs load
      const langConfig = filteredConfigs.find(lang => lang.code === prefs.language);
      if (langConfig && !langConfig.supportedLengths.includes(prefs.wordLength)) {
        const validLength = langConfig.supportedLengths[0] || 5;
        setWordLength(validLength);
        const updatedPrefs = { ...prefs, wordLength: validLength };
        savePreferences(updatedPrefs);
      }
    };
    loadConfigs();

    const checkAuth = async () => {
      try {
        const token = apiClient.getToken();
        if (token) {
          const response = await apiClient.getCurrentUser();
          setUser(response.user);
          
          // Load preferences from API when logged in
          try {
            const apiPrefs = await apiClient.getPreferences();
            if (apiPrefs.selectedLanguages !== null) {
              // User has saved preferences in the database
              const prefs = loadPreferences();
              prefs.selectedLanguages = apiPrefs.selectedLanguages;
              savePreferences(prefs); // Sync to localStorage for consistency
            }
            // If selectedLanguages is null, user has no saved preferences (all languages)
            // Use localStorage preferences as fallback
          } catch (apiError) {
            // API call failed, use localStorage preferences as fallback
            console.error('Failed to load preferences from API:', apiError);
          }
        }
      } catch (error) {
        // Not authenticated
        apiClient.setToken(null);
      } finally {
        setLoading(false);
      }
    };

    // Check for reset token in URL
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (token) {
      setResetToken(token);
      setAuthView('reset');
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      checkAuth();
    }
  }, []);

  const handleLogin = async (userData: User) => {
    setUser(userData);
    // Load preferences from API when user logs in
    try {
      const apiPrefs = await apiClient.getPreferences();
      if (apiPrefs.selectedLanguages !== null) {
        // User has saved preferences in the database
        const prefs = loadPreferences();
        prefs.selectedLanguages = apiPrefs.selectedLanguages;
        savePreferences(prefs); // Sync to localStorage for consistency
        
        // Reload configs with API preferences
        const allConfigs = allAvailableLanguages;
        const selectedSet = new Set(apiPrefs.selectedLanguages);
        const filteredConfigs = allConfigs.filter(lang => selectedSet.has(lang.code));
        setAvailableLanguages(filteredConfigs);
      }
    } catch (error) {
      console.error('Failed to load preferences from API:', error);
      // Continue with localStorage preferences as fallback
    }
  };

  const handleLogout = () => {
    apiClient.setToken(null);
    setUser(null);
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="app-container">
        {authView === 'login' && (
          <Login
            onLogin={handleLogin}
            onSwitchToRegister={() => setAuthView('register')}
            onSwitchToForgotPassword={() => setAuthView('forgot')}
          />
        )}
        {authView === 'register' && (
          <Register onRegister={handleLogin} onSwitchToLogin={() => setAuthView('login')} />
        )}
        {authView === 'forgot' && <ForgotPassword onSwitchToLogin={() => setAuthView('login')} />}
        {authView === 'reset' && (
          <ResetPassword token={resetToken} onSuccess={() => setAuthView('login')} />
        )}
      </div>
    );
  }

  const handleViewHistoricalGame = (date: string) => {
    setHistoricalDate(date);
    setView('game'); // Switch to game view when viewing historical game
  };

  const handleViewChange = (newView: 'game' | 'statistics' | null) => {
    if (newView === null) {
      setView('game'); // Default to game if null
    } else {
      setView(newView);
    }
    // Clear historical date when switching views
    if (newView === 'statistics') {
      setHistoricalDate(null);
    }
  };

  const handleLanguageChange = (newLanguage: string) => {
    setLanguage(newLanguage);
    const prefs = loadPreferences();
    const updatedPrefs = { ...prefs, language: newLanguage };
    savePreferences(updatedPrefs);
    
    // Validate word length for new language
    const langConfig = availableLanguages.find(l => l.code === newLanguage);
    if (langConfig && !langConfig.supportedLengths.includes(wordLength)) {
      const validLength = langConfig.supportedLengths[0] || 5;
      setWordLength(validLength);
      updatedPrefs.wordLength = validLength;
      savePreferences(updatedPrefs);
    }
  };

  const handleWordLengthChange = (newLength: number) => {
    setWordLength(newLength);
    const prefs = loadPreferences();
    const updatedPrefs = { ...prefs, wordLength: newLength };
    savePreferences(updatedPrefs);
  };

  const handleLanguageSelectionChange = async (selectedCodes: string[]) => {
    // Reload configs with new selection
    const allConfigs = allAvailableLanguages;
    const selectedSet = new Set(selectedCodes);
    const filteredConfigs = allConfigs.filter(lang => selectedSet.has(lang.code));
    
    setAvailableLanguages(filteredConfigs);
    
    // Save to localStorage
    const prefs = loadPreferences();
    prefs.selectedLanguages = selectedCodes.length === allConfigs.length 
      ? undefined 
      : selectedCodes;
    savePreferences(prefs);
    
    // Save to API if user is logged in
    if (user) {
      try {
        await apiClient.savePreferences(prefs.selectedLanguages || null);
      } catch (error) {
        console.error('Failed to save preferences to API:', error);
        // Continue anyway - localStorage backup is already saved
      }
    }
    
    // Ensure current language is still available
    if (!filteredConfigs.find(l => l.code === prefs.language)) {
      const langToUse = filteredConfigs[0]?.code || 'en';
      setLanguage(langToUse);
      const updatedPrefs = { ...prefs, language: langToUse };
      savePreferences(updatedPrefs);
    }
  };

  return (
    <div className="app-container">
      {view === 'game' ? (
        <Game 
          userId={user.id} 
          onLogout={handleLogout} 
          view={view} 
          onViewChange={handleViewChange}
          historicalDate={historicalDate}
          onHistoricalDateCleared={() => setHistoricalDate(null)}
          onViewHistoricalGame={handleViewHistoricalGame}
          language={language}
          wordLength={wordLength}
          onLanguageChange={handleLanguageChange}
          onWordLengthChange={handleWordLengthChange}
          availableLanguages={availableLanguages}
          allAvailableLanguages={allAvailableLanguages}
          onLanguageSelectionChange={handleLanguageSelectionChange}
        />
      ) : (
        <Statistics 
          userId={user.id} 
          availableLanguages={availableLanguages}
          allAvailableLanguages={allAvailableLanguages}
          view={view} 
          onViewChange={handleViewChange}
          onViewHistoricalGame={handleViewHistoricalGame}
          onLanguageSelectionChange={handleLanguageSelectionChange}
          language={language}
          wordLength={wordLength}
          onLanguageChange={handleLanguageChange}
          onWordLengthChange={handleWordLengthChange}
        />
      )}
    </div>
  );
};

