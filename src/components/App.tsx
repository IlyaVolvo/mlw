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
      const configs = await getLanguageConfigs();
      setAvailableLanguages(configs);
      
      // Validate word length for selected language after configs load
      const langConfig = configs.find(lang => lang.code === prefs.language);
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

  const handleLogin = (userData: User) => {
    setUser(userData);
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

  const handleViewChange = (newView: 'game' | 'statistics') => {
    setView(newView);
    // Clear historical date when switching to game view (unless it's from a historical game selection)
    if (newView === 'game' && !historicalDate) {
      // Already cleared or not set
    } else if (newView === 'statistics') {
      // Clear historical date when switching to statistics
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
        />
      ) : (
        <Statistics 
          userId={user.id} 
          availableLanguages={availableLanguages} 
          view={view} 
          onViewChange={handleViewChange}
          onViewHistoricalGame={handleViewHistoricalGame}
          language={language}
          wordLength={wordLength}
          onLanguageChange={handleLanguageChange}
          onWordLengthChange={handleWordLengthChange}
        />
      )}
    </div>
  );
};

