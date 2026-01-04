import React, { useState, useEffect } from 'react';
import { Login } from './Login';
import { Register } from './Register';
import { ForgotPassword } from './ForgotPassword';
import { ResetPassword } from './ResetPassword';
import { Game } from './Game';
import { Statistics } from './Statistics';
import { apiClient } from '../api/client';
import { getLanguageConfigs } from '../data/dictionaryLoader';
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

  useEffect(() => {
    const loadConfigs = async () => {
      const configs = await getLanguageConfigs();
      setAvailableLanguages(configs);
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
  };

  return (
    <div className="app-container">
      {view === 'game' ? (
        <Game 
          userId={user.id} 
          onLogout={handleLogout} 
          view={view} 
          onViewChange={setView}
          historicalDate={historicalDate}
          onHistoricalDateCleared={() => setHistoricalDate(null)}
          onViewHistoricalGame={handleViewHistoricalGame}
        />
      ) : (
        <Statistics 
          userId={user.id} 
          availableLanguages={availableLanguages} 
          view={view} 
          onViewChange={setView}
          onViewHistoricalGame={handleViewHistoricalGame}
        />
      )}
    </div>
  );
};

