import React, { useState, useEffect, useRef } from 'react';
import { Login } from './Login';
import { Register } from './Register';
import { ForgotPassword } from './ForgotPassword';
import { ResetPassword } from './ResetPassword';
import { Game } from './Game';
import { Statistics } from './Statistics';
import { Tutorial } from './Tutorial';
import { IconsTutorial } from './IconsTutorial';
import { ReleaseMessageModal } from './ReleaseMessageModal';
import { getReleasesToShow, recordPlayed } from '../utils/releaseNotes';
import { apiClient } from '../api/client';
import { getLanguageConfigs } from '../data/dictionaryLoader';
import { loadPreferences, savePreferences } from '../utils/preferences';
import type { LanguageConfig } from '../types';

const TUTORIAL_COMPLETED_KEY = 'polywordlot-tutorial-completed';
const ICONS_TUTORIAL_COMPLETED_KEY = 'polywordlot-icons-tutorial-completed';

interface User {
  id: number;
  email: string;
  verified?: number;
}

export const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [configsLoaded, setConfigsLoaded] = useState(false);
  const [authView, setAuthView] = useState<'login' | 'register' | 'forgot' | 'reset'>('login');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [view, setView] = useState<'game' | 'statistics'>('game');
  const [initialStatisticType, setInitialStatisticType] = useState<string | undefined>(undefined);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showIconsTutorial, setShowIconsTutorial] = useState(false);
  const [releasesToShow, setReleasesToShow] = useState<Array<{ message: string }>>([]);
  const [lastDisplayedIndex, setLastDisplayedIndex] = useState<number>(-1);
  const [allAvailableLanguages, setAllAvailableLanguages] = useState<LanguageConfig[]>([]);
  const [availableLanguages, setAvailableLanguages] = useState<LanguageConfig[]>([]);
  const [historicalDate, setHistoricalDate] = useState<string | null>(null);
  const [language, setLanguage] = useState<string>('en');
  const [wordLength, setWordLength] = useState<number>(5);
  const configsLoadPromiseRef = useRef<Promise<void> | null>(null);
  const allConfigsRef = useRef<LanguageConfig[]>([]);
  const dismissedReleaseRef = useRef(false);
  const lastReleaseCheckRef = useRef<number>(0);
  const RELEASE_CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
  const MIN_CHECK_GAP_MS = 60 * 1000; // 1 minute - throttle language/wordLength triggers

  const checkForReleases = (bustCache: boolean) => {
    if (!user || showTutorial || showIconsTutorial) return;
    const now = Date.now();
    if (!bustCache && now - lastReleaseCheckRef.current < MIN_CHECK_GAP_MS) return;
    lastReleaseCheckRef.current = now;
    const lastSeen = user.verified ?? 0;
    getReleasesToShow(lastSeen, bustCache).then(({ releases, lastDisplayedIndex: idx }) => {
      if (releases.length > 0) {
        dismissedReleaseRef.current = false; // allow showing new releases
        setReleasesToShow(releases);
        setLastDisplayedIndex(idx);
      }
    });
  };

  // Initial check on login (bust cache to get fresh server content)
  useEffect(() => {
    if (user && !showTutorial && !showIconsTutorial && !dismissedReleaseRef.current) {
      const lastSeen = user.verified ?? 0;
      getReleasesToShow(lastSeen, true).then(({ releases, lastDisplayedIndex: idx }) => {
        if (releases.length > 0) {
          setReleasesToShow(releases);
          setLastDisplayedIndex(idx);
        }
      });
    }
  }, [user, showTutorial, showIconsTutorial]);

  // Periodic check every 10 minutes (bust cache for fresh server content)
  useEffect(() => {
    if (!user || showTutorial || showIconsTutorial) return;
    const id = setInterval(() => checkForReleases(true), RELEASE_CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [user, showTutorial, showIconsTutorial]);

  // Check on language or wordLength change (throttled, bust cache) - skip initial mount
  const langWordInitializedRef = useRef(false);
  useEffect(() => {
    if (!user || showTutorial || showIconsTutorial) return;
    if (!langWordInitializedRef.current) {
      langWordInitializedRef.current = true;
      return;
    }
    checkForReleases(true);
  }, [language, wordLength]);

  useEffect(() => {
    // Load preferences first
    const prefs = loadPreferences();
    setLanguage(prefs.language);
    setWordLength(prefs.wordLength);

    const loadConfigs = async () => {
      try {
        const allConfigs = await getLanguageConfigs();
        allConfigsRef.current = allConfigs;
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
        
        setConfigsLoaded(true);
      } catch (error) {
        console.error('Failed to load language configs:', error);
        setConfigsLoaded(true); // Still set to true to not block the app
      }
    };
    
    const configsPromise = loadConfigs();
    configsLoadPromiseRef.current = configsPromise;
    configsPromise.finally(() => {
      configsLoadPromiseRef.current = null;
    });

    const checkAuth = async () => {
      try {
        // Wait for configs to load before setting user (prevents race condition)
        await configsPromise;
        
        const token = apiClient.getToken();
        if (token) {
          const response = await apiClient.getCurrentUser();
          
          // Configs are now loaded (we awaited the promise), safe to set user
          setUser(response.user);

          // Show tutorials if not yet completed (for returning users with existing token)
          const tutorialDone = localStorage.getItem(TUTORIAL_COMPLETED_KEY);
          const iconsTutorialDone = localStorage.getItem(ICONS_TUTORIAL_COMPLETED_KEY);
          if (!tutorialDone) {
            setShowTutorial(true);
          } else if (!iconsTutorialDone) {
            setShowIconsTutorial(true);
          }
          
          // Load preferences from API when logged in
          try {
            const apiPrefs = await apiClient.getPreferences();
            if (apiPrefs.selectedLanguages !== null) {
              // User has saved preferences in the database
              const prefs = loadPreferences();
              prefs.selectedLanguages = apiPrefs.selectedLanguages;
              savePreferences(prefs); // Sync to localStorage for consistency
              
              // Reload configs with API preferences
              // Use the ref to ensure we have the latest configs
              const selectedSet = new Set(apiPrefs.selectedLanguages);
              const filteredConfigs = allConfigsRef.current.filter(lang => selectedSet.has(lang.code));
              setAvailableLanguages(filteredConfigs);
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
      configsPromise.finally(() => setLoading(false));
    } else {
      checkAuth();
    }
  }, []);

  const handleTutorialComplete = () => {
    localStorage.setItem(TUTORIAL_COMPLETED_KEY, 'true');
    setShowTutorial(false);
    const iconsDone = localStorage.getItem(ICONS_TUTORIAL_COMPLETED_KEY);
    if (!iconsDone) {
      setShowIconsTutorial(true);
    }
  };

  const handleIconsTutorialComplete = () => {
    localStorage.setItem(ICONS_TUTORIAL_COMPLETED_KEY, 'true');
    setShowIconsTutorial(false);
  };

  const handleLogin = async (userData: User) => {
    // Wait for configs to be loaded before setting user (prevents race condition)
    // This ensures Game component doesn't mount until configs are ready
    if (configsLoadPromiseRef.current) {
      await configsLoadPromiseRef.current;
    }
    
    // Check if user has completed the tutorials
    const tutorialDone = localStorage.getItem(TUTORIAL_COMPLETED_KEY);
    const iconsTutorialDone = localStorage.getItem(ICONS_TUTORIAL_COMPLETED_KEY);
    if (!tutorialDone) {
      setShowTutorial(true);
    } else if (!iconsTutorialDone) {
      setShowIconsTutorial(true);
    }

    // Configs are now loaded (we awaited the promise), safe to set user
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
        // Use the ref to ensure we have the latest configs
        const selectedSet = new Set(apiPrefs.selectedLanguages);
        const filteredConfigs = allConfigsRef.current.filter(lang => selectedSet.has(lang.code));
        setAvailableLanguages(filteredConfigs);
      }
    } catch (error) {
      console.error('Failed to load preferences from API:', error);
      // Continue with localStorage preferences as fallback
    }
  };

  const handleLogout = () => {
    dismissedReleaseRef.current = false;
    apiClient.setToken(null);
    setUser(null);
  };

  if (loading || !configsLoaded) {
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

  const handleViewChange = (newView: 'game' | 'statistics' | null, statType?: string) => {
    if (newView === null) {
      setView('game'); // Default to game if null
    } else {
      setView(newView);
    }
    // Clear historical date when switching views
    if (newView === 'statistics') {
      setHistoricalDate(null);
      setInitialStatisticType(statType);
    } else {
      setInitialStatisticType(undefined);
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

  if (showTutorial) {
    return (
      <div className="app-container">
        <Tutorial onComplete={handleTutorialComplete} />
      </div>
    );
  }

  if (showIconsTutorial) {
    return (
      <div className="app-container">
        <IconsTutorial onComplete={handleIconsTutorialComplete} />
      </div>
    );
  }

  const handleReleaseDismiss = () => {
    dismissedReleaseRef.current = true;
    const nextUnseenIndex = lastDisplayedIndex >= 0 ? lastDisplayedIndex + 1 : -1;
    setReleasesToShow([]);
    setLastDisplayedIndex(-1);
    if (nextUnseenIndex >= 0) {
      apiClient.updateReleaseSeen(nextUnseenIndex).then(() => {
        setUser((u) => (u ? { ...u, verified: nextUnseenIndex } : null));
      }).catch(() => { /* ignore */ });
    }
  };

  return (
    <div className="app-container">
      {releasesToShow.length > 0 && (
        <ReleaseMessageModal releases={releasesToShow} onDismiss={handleReleaseDismiss} />
      )}
      {view === 'game' ? (
        <Game 
          userId={user.id}
          userEmail={user.email}
          onLogout={handleLogout} 
          view={view} 
          onViewChange={handleViewChange}
          onRecordPlayed={() => recordPlayed()}
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
          view={view} 
          onViewChange={handleViewChange}
          onViewHistoricalGame={handleViewHistoricalGame}
          language={language}
          wordLength={wordLength}
          onLanguageChange={handleLanguageChange}
          onWordLengthChange={handleWordLengthChange}
          initialStatisticType={initialStatisticType as any}
        />
      )}
    </div>
  );
};

