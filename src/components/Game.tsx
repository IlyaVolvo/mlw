import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { GameState, DictionaryEntry, LetterState, LanguageConfig } from '../types';
import { GameBoard } from './GameBoard';
import { Keyboard } from './Keyboard';
import { Settings } from './Settings';
import { LanguageSelector } from './LanguageSelector';
import { loadDictionary } from '../data/dictionaryLoader';
import { getDailyWord, getWordFromSeed, formatDate } from '../utils/dailyWord';
import { evaluateGuess, isValidWord } from '../utils/gameLogic';
import { normalizeForLanguage, loadNormalization } from '../utils/characterNormalization';
import { loadPreferences, savePreferences } from '../utils/preferences';
import { apiClient } from '../api/client';

const MAX_GUESSES = 6;

interface GameProps {
  userId: number;
  onLogout?: () => void;
  view?: 'game' | 'statistics';
  onViewChange?: (view: 'game' | 'statistics') => void;
  historicalDate?: string | null;
  onHistoricalDateCleared?: () => void;
  onViewHistoricalGame?: (date: string) => void;
  language: string;
  wordLength: number;
  onLanguageChange: (language: string) => void;
  onWordLengthChange: (wordLength: number) => void;
  availableLanguages: LanguageConfig[];
  allAvailableLanguages: LanguageConfig[];
  onLanguageSelectionChange: (selectedCodes: string[]) => void;
}

export const Game: React.FC<GameProps> = ({ 
  userId, 
  onLogout, 
  view, 
  onViewChange, 
  historicalDate, 
  onHistoricalDateCleared: _onHistoricalDateCleared, 
  onViewHistoricalGame: _onViewHistoricalGame,
  language,
  wordLength,
  onLanguageChange,
  onWordLengthChange,
  availableLanguages,
  allAvailableLanguages,
  onLanguageSelectionChange
}) => {
  const [dictionary, setDictionary] = useState<DictionaryEntry | null>(null);
  const [targetWord, setTargetWord] = useState<string>('');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [letterStates, setLetterStates] = useState<Map<string, LetterState>>(new Map());
  const [randomMode, setRandomMode] = useState<boolean>(false);
  const initializedRef = useRef<boolean>(false);
  const [selectedPlayDate, setSelectedPlayDate] = useState<string>('');
  const [isPlayingMode, setIsPlayingMode] = useState<boolean>(false); // True when actively playing a game
  const [showOptions, setShowOptions] = useState(false);

  // Load preferences on mount - default to Daily mode (not Training)
  useEffect(() => {
    const prefs = loadPreferences();
    // Default to Daily (not Training) if not set
    setRandomMode(prefs.randomMode === true);
    // Initialize selected date to today for Daily mode
    if (!prefs.randomMode) {
      setSelectedPlayDate(formatDate());
    }
  }, []);

  const updateLetterStates = useCallback((state: GameState) => {
    const states = new Map<string, LetterState>();
    for (const guess of state.guesses) {
      for (const eval_ of guess.evaluations) {
        const currentState = states.get(eval_.letter);
        // Priority: correct > present > absent
        if (!currentState || 
            (currentState === 'absent' && eval_.state !== 'absent') ||
            (currentState === 'present' && eval_.state === 'correct')) {
          states.set(eval_.letter, eval_.state);
        }
      }
    }
    setLetterStates(states);
  }, []);

  // Handle historicalDate prop (legacy, might be removed)
  useEffect(() => {
    if (historicalDate && !isPlayingMode) {
      setSelectedPlayDate(historicalDate);
    }
  }, [historicalDate, isPlayingMode]);

  // Load dictionary on mount
  useEffect(() => {
    const loadDict = async () => {
      try {
        const dict = await loadDictionary(language, wordLength);
        if (dict) {
          setDictionary(dict);
        }
      } catch (err) {
        console.error('Failed to load dictionary:', err);
      }
    };
    loadDict();
  }, [language, wordLength]);

  // Initialize component - just load dictionary and normalization, don't create game
  useEffect(() => {
    if (initializedRef.current) return;
    
    const initialize = async () => {
      setLoading(true);
      setError(null);

      try {
        // Load dictionary and normalization in parallel
        const [dict] = await Promise.all([
          loadDictionary(language, wordLength),
          loadNormalization(language),
        ]);
        if (!dict) {
          setError(`Failed to load dictionary for ${language}-${wordLength}`);
          setLoading(false);
          return;
        }
        setDictionary(dict);
        // Normalization is cached in characterNormalization module, no need to store it
        initializedRef.current = true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize');
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, [userId, language, wordLength]);

  // Handle language or word length change - reload dictionary, normalization and clear preview
  useEffect(() => {
      if (!initializedRef.current || loading || isPlayingMode) return;

    const changeSettings = async () => {
      try {
        // Load dictionary and normalization in parallel
        const [dict] = await Promise.all([
          loadDictionary(language, wordLength),
          loadNormalization(language),
        ]);
        if (dict) {
          setDictionary(dict);
        }
        // Normalization is cached in characterNormalization module, no need to store it
        // Clear game state when settings change
        setGameState(null);
        setTargetWord('');
        if (!randomMode) {
          setSelectedPlayDate(formatDate());
        }
      } catch (err) {
        console.error('Failed to load dictionary:', err);
      }
    };

    changeSettings();
  }, [language, wordLength, initializedRef.current, loading, isPlayingMode]);

  const saveGameToApi = useCallback(async (state: GameState) => {
    // Don't save Training mode games to DB
    if (state.isRandomMode) return;
    if (!dictionary || !targetWord || !isPlayingMode) return; // Only save when actively playing
    try {
      await apiClient.saveGame({
        language: state.language,
        wordLength: state.wordLength,
        targetWord,
        gameDate: state.date,
        isRandomMode: false,
        wordSeed: state.wordSeed,
        guesses: state.guesses,
        isComplete: state.isComplete,
        isWon: state.isWon,
      });
    } catch (error) {
      console.error('Failed to save game to API:', error);
    }
  }, [dictionary, targetWord, isPlayingMode]);

  // New function to start game automatically (called when first letter is typed)
  const handleStartGame = useCallback(async () => {
    if (!dictionary || isPlayingMode) return;
    
    setIsPlayingMode(true);
    const playDate = selectedPlayDate || formatDate();
    let target: string;
    let wordSeed: number | undefined;

    try {
      if (randomMode) {
        // Training mode: always start new game
        wordSeed = Date.now();
        target = getWordFromSeed(dictionary, wordSeed);
        
        const newState: GameState = {
          guesses: [],
          currentGuess: '',
          isComplete: false,
          isWon: false,
          language,
          wordLength,
          date: Date.now().toString(),
          isRandomMode: true,
          wordSeed: wordSeed,
        };

        setGameState(newState);
        setTargetWord(target);
        setLetterStates(new Map());
        
        // Don't save Training mode games to DB
      } else {
        // Daily mode: check for existing game first
        const currentResponse = await apiClient.getCurrentGame({
          language,
          wordLength,
          gameDate: playDate,
          isRandomMode: false,
        });
        if (currentResponse.game && currentResponse.game.is_complete !== 1) {
          // Found incomplete game - continue playing it
          const target = currentResponse.game.target_word;
          const guessesWithEvals = (currentResponse.game.guesses || []).map((g: any) => ({
            word: g.word,
            evaluations: evaluateGuess(g.word, target, language),
          }));
          const currentGame: GameState = {
            guesses: guessesWithEvals,
            currentGuess: '',
            isComplete: false,
            isWon: false,
            language: currentResponse.game.language,
            wordLength: currentResponse.game.word_length,
            date: currentResponse.game.game_date,
            isRandomMode: false,
            wordSeed: undefined,
          };
          setGameState(currentGame);
          setTargetWord(target);
          updateLetterStates(currentGame); // Update letter states from loaded guesses
          return;
        }
        
        // Check for completed game
        const completedResponse = await apiClient.getCompletedGame({
          language,
          wordLength,
          gameDate: playDate,
          isRandomMode: false,
        });
        if (completedResponse.game) {
          // Restore the completed game
          const target = completedResponse.game.target_word;
          const guessesWithEvals = (completedResponse.game.guesses || []).map((g: any) => ({
            word: g.word,
            evaluations: evaluateGuess(g.word, target, language),
          }));
          const completedGame: GameState = {
            guesses: guessesWithEvals,
            currentGuess: '',
            isComplete: completedResponse.game.is_complete === 1,
            isWon: completedResponse.game.isWon,
            language: completedResponse.game.language,
            wordLength: completedResponse.game.word_length,
            date: completedResponse.game.game_date,
            isRandomMode: false,
            wordSeed: undefined,
          };
          setGameState(completedGame);
          setTargetWord(target);
          updateLetterStates(completedGame); // Update letter states from loaded guesses
          return;
        }
        
        // No existing game, start a new one
        target = getDailyWord(dictionary, playDate);
        const newState: GameState = {
          guesses: [],
          currentGuess: '',
          isComplete: false,
          isWon: false,
          language,
          wordLength,
          date: playDate,
          isRandomMode: false,
          wordSeed: undefined,
        };

        setGameState(newState);
        setTargetWord(target);
        setLetterStates(new Map());
        
        // Save game to DB (only for Daily mode)
        await apiClient.saveGame({
          language,
          wordLength,
          targetWord: target,
          gameDate: playDate,
          isRandomMode: false,
          guesses: [],
          isComplete: false,
          isWon: false,
        });
      }
    } catch (err) {
      console.error('Failed to start game:', err);
      setError('Failed to start game');
      setIsPlayingMode(false);
    }
  }, [dictionary, language, wordLength, randomMode, selectedPlayDate, isPlayingMode, updateLetterStates]);

  // Auto-start game when first letter is typed (instead of Play button)
  const handleKeyPress = useCallback(async (key: string) => {
    const normalizedKey = key.toLowerCase();
    
    // If not in playing mode and we have a dictionary, start the game first
    if (!isPlayingMode && dictionary && !gameState) {
      await handleStartGame();
      // After game starts, the gameState will be set, so we can process the key
      // Use a small timeout to ensure state is updated
      setTimeout(() => {
        setGameState((currentState) => {
          if (currentState && !currentState.isComplete && currentState.currentGuess.length < wordLength) {
            const newGuess = currentState.currentGuess + normalizedKey;
            const updatedState = { ...currentState, currentGuess: newGuess };
            saveGameToApi(updatedState);
            return updatedState;
          }
          return currentState;
        });
      }, 0);
      return;
    }

    if (!gameState || gameState.isComplete || !dictionary) return;

    if (gameState.currentGuess.length < wordLength) {
      const newGuess = gameState.currentGuess + normalizedKey;
      const updatedState = { ...gameState, currentGuess: newGuess };
      setGameState(updatedState);
      saveGameToApi(updatedState);
    }
  }, [gameState, wordLength, dictionary, language, saveGameToApi, isPlayingMode, handleStartGame]);

  const handleEnter = useCallback(() => {
    if (!gameState || gameState.isComplete || !dictionary) return;

    const guess = gameState.currentGuess.toLowerCase().trim();
    
    if (guess.length !== wordLength) {
      // Show error - word not long enough
      return;
    }

    if (!isValidWord(guess, dictionary)) {
      // Show error - word not in dictionary
      alert('Word not in dictionary!');
      return;
    }

    const evaluations = evaluateGuess(guess, targetWord, language);
    // Normalize for language-specific character equivalences when checking win condition
    const normalizedGuess = normalizeForLanguage(guess, language);
    const normalizedTarget = normalizeForLanguage(targetWord, language);
    const isWon = normalizedGuess === normalizedTarget;
    const newGuesses = [...gameState.guesses, { word: guess, evaluations }];
    const isComplete = isWon || newGuesses.length >= MAX_GUESSES;

    const updatedState: GameState = {
      ...gameState,
      guesses: newGuesses,
      currentGuess: '',
      isComplete,
      isWon,
    };

    setGameState(updatedState);
    saveGameToApi(updatedState);
    updateLetterStates(updatedState);
  }, [gameState, dictionary, wordLength, targetWord, language, saveGameToApi, updateLetterStates]);

  const handleBackspace = useCallback(() => {
    if (!gameState || gameState.isComplete) return;

    if (gameState.currentGuess.length > 0) {
      const newGuess = gameState.currentGuess.slice(0, -1);
      const updatedState = { ...gameState, currentGuess: newGuess };
      setGameState(updatedState);
      saveGameToApi(updatedState);
    }
  }, [gameState, saveGameToApi]);

  const handleLanguageChange = async (newLanguage: string) => {
    // Update word length to first supported length if current is not supported
    const langConfig = availableLanguages.find(l => l.code === newLanguage);
    const newWordLength = (langConfig && !langConfig.supportedLengths.includes(wordLength)) 
      ? (langConfig.supportedLengths[0] || 5)
      : wordLength;
    
    // Save current preferences
    const prefs = loadPreferences();
    prefs.language = newLanguage;
    prefs.wordLength = newWordLength;
    savePreferences(prefs);
    
    // Update state
    if (newWordLength !== wordLength) {
      onWordLengthChange(newWordLength);
    }
    onLanguageChange(newLanguage);
    
    // Game state will be loaded by the useEffect that watches language/wordLength
  };

  const handleWordLengthChange = async (newLength: number) => {
    // Save current preferences
    const prefs = loadPreferences();
    prefs.wordLength = newLength;
    savePreferences(prefs);
    
    onWordLengthChange(newLength);
    
    // Game state will be loaded by the useEffect that watches language/wordLength
  };

  // Load game state when date/language/length changes (if in Daily mode)
  useEffect(() => {
    if (randomMode || !dictionary || loading) return;

    const loadGameForDate = async () => {
      const playDate = selectedPlayDate || formatDate();
      try {
        // Check for current game
        const currentResponse = await apiClient.getCurrentGame({
          language,
          wordLength,
          gameDate: playDate,
          isRandomMode: false,
        });
        if (currentResponse.game && currentResponse.game.is_complete !== 1) {
          const target = currentResponse.game.target_word;
          const guessesWithEvals = (currentResponse.game.guesses || []).map((g: any) => ({
            word: g.word,
            evaluations: evaluateGuess(g.word, target, language),
          }));
          const currentGame: GameState = {
            guesses: guessesWithEvals,
            currentGuess: '',
            isComplete: false,
            isWon: false,
            language: currentResponse.game.language,
            wordLength: currentResponse.game.word_length,
            date: currentResponse.game.game_date,
            isRandomMode: false,
            wordSeed: undefined,
          };
          setGameState(currentGame);
          setTargetWord(target);
          updateLetterStates(currentGame); // Update letter states from loaded guesses
          setIsPlayingMode(true);
          return;
        }
        
        // Check for completed game
        const completedResponse = await apiClient.getCompletedGame({
          language,
          wordLength,
          gameDate: playDate,
          isRandomMode: false,
        });
        if (completedResponse.game) {
          const target = completedResponse.game.target_word;
          const guessesWithEvals = (completedResponse.game.guesses || []).map((g: any) => ({
            word: g.word,
            evaluations: evaluateGuess(g.word, target, language),
          }));
          const completedGame: GameState = {
            guesses: guessesWithEvals,
            currentGuess: '',
            isComplete: completedResponse.game.is_complete === 1,
            isWon: completedResponse.game.isWon,
            language: completedResponse.game.language,
            wordLength: completedResponse.game.word_length,
            date: completedResponse.game.game_date,
            isRandomMode: false,
            wordSeed: undefined,
          };
          setGameState(completedGame);
          setTargetWord(target);
          updateLetterStates(completedGame); // Update letter states from loaded guesses
          setIsPlayingMode(false); // Set to false for completed games - keyboard won't show anyway
          return;
        }
        
        // No game exists - clear game state and reset playing mode to allow starting new game
        setGameState(null);
        setTargetWord('');
        setIsPlayingMode(false); // Reset to allow starting new game
      } catch (err) {
        console.error('Failed to load game:', err);
        setGameState(null);
        setTargetWord('');
        setIsPlayingMode(false); // Reset to allow starting new game
      }
    };

    loadGameForDate();
  }, [selectedPlayDate, language, wordLength, randomMode, dictionary, loading, updateLetterStates]);

  // Handle date change
  const handleDateChange = useCallback(async (date: string) => {
    setSelectedPlayDate(date);
    // Game state will be loaded by the useEffect above
  }, []);

  const handleRandomModeChange = useCallback((newRandomMode: boolean) => {
    const prefs = loadPreferences();
    prefs.randomMode = newRandomMode;
    savePreferences(prefs); // Make sticky
    setRandomMode(newRandomMode);
    
    if (!newRandomMode) {
      // Switching to Daily mode - set date and load game state
      setSelectedPlayDate(formatDate());
      // Game state will be loaded by the useEffect that watches randomMode
    } else {
      // Switching to Training mode - clear date, clear game state
      setSelectedPlayDate('');
      setGameState(null);
      setTargetWord('');
      setIsPlayingMode(false);
    }
  }, []);

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (loading) return;

      // If no game state and it's a letter, start the game first (similar to handleKeyPress)
      if (!gameState && e.key.length === 1 && /[a-zA-Zа-яА-ЯёЁ]/.test(e.key)) {
        if (!isPlayingMode && dictionary) {
          await handleStartGame();
          // After game starts, process the key
          setTimeout(() => {
            setGameState((currentState) => {
              if (currentState && !currentState.isComplete && currentState.currentGuess.length < wordLength) {
                const normalizedKey = e.key.toLowerCase();
                const newGuess = currentState.currentGuess + normalizedKey;
                const updatedState = { ...currentState, currentGuess: newGuess };
                saveGameToApi(updatedState);
                return updatedState;
              }
              return currentState;
            });
          }, 0);
        }
        return;
      }

      if (!gameState || gameState.isComplete) return;

      if (e.key === 'Enter') {
        handleEnter();
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key.length === 1 && /[a-zA-Zа-яА-ЯёЁ]/.test(e.key)) {
        handleKeyPress(e.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading, gameState, isPlayingMode, dictionary, wordLength, language, handleEnter, handleBackspace, handleKeyPress, handleStartGame, saveGameToApi]);

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  // Simplified render - always show game board
  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  return (
    <div className="game-container">
      <div className="header-section">
        <h1>
          <span>PolyWordlot</span>
          {onLogout && (
            <div className="logout-wrapper">
              <button onClick={onLogout} className="logout-icon" title="Logout">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
              </button>
              <span className="logout-tooltip">Logout</span>
            </div>
          )}
        </h1>
        {onViewChange && (
          <div className="header-tabs-row">
            <div className="view-tabs">
              <button
                className={`view-tab ${view === 'game' ? 'active' : ''}`}
                onClick={() => {
                  // Don't clear game state - keep selections sticky
                  onViewChange('game');
                }}
              >
                Game
              </button>
              <button
                className={`view-tab ${view === 'statistics' ? 'active' : ''}`}
                onClick={() => {
                  // Don't clear game state - keep selections sticky
                  onViewChange('statistics');
                }}
              >
                Statistics
              </button>
            </div>
            <button
              className={`options-icon-button ${showOptions ? 'active' : ''}`}
              onClick={() => setShowOptions(!showOptions)}
              title="Options"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M12 1v6m0 6v6m9-9h-6m-6 0H3m15.364 6.364l-4.243-4.243m-4.242 0l-4.243 4.243m4.242-4.242l-4.243 4.243m4.242 0l4.243 4.243"></path>
              </svg>
            </button>
          </div>
        )}
      </div>
      <Settings
        language={language}
        wordLength={wordLength}
        randomMode={randomMode}
        availableLanguages={availableLanguages}
        selectedDate={selectedPlayDate || formatDate()}
        onLanguageChange={handleLanguageChange}
        onWordLengthChange={handleWordLengthChange}
        onRandomModeChange={handleRandomModeChange}
        onDateChange={handleDateChange}
        disabled={false}
      />
      {!dictionary && !loading && (
        <GameBoard
          guesses={[]}
          currentGuess={''}
          wordLength={wordLength}
          maxGuesses={MAX_GUESSES}
          isComplete={false}
          isWon={false}
        />
      )}
      {gameState && dictionary && (
        <>
          <GameBoard
            guesses={gameState.guesses}
            currentGuess={gameState.currentGuess}
            wordLength={wordLength}
            maxGuesses={MAX_GUESSES}
            targetWord={gameState.isComplete && !gameState.isWon ? targetWord : undefined}
            isComplete={gameState.isComplete}
            isWon={gameState.isWon}
          />
          {gameState.isComplete && (
            <div className="game-result">
              {gameState.isWon ? (
                <div className="result-message success">
                  Congratulations! You won!
                </div>
              ) : (
                <div className="result-message failure">
                  Answer was: <strong>{targetWord}</strong>
                </div>
              )}
            </div>
          )}
          {!gameState.isComplete && (
            <Keyboard
              onKeyPress={handleKeyPress}
              onEnter={handleEnter}
              onBackspace={handleBackspace}
              letterStates={letterStates}
              language={language}
            />
          )}
        </>
      )}
      {!gameState && dictionary && (
        <>
          <GameBoard
            guesses={[]}
            currentGuess={''}
            wordLength={wordLength}
            maxGuesses={MAX_GUESSES}
            isComplete={false}
            isWon={false}
          />
          <Keyboard
            onKeyPress={handleKeyPress}
            onEnter={handleEnter}
            onBackspace={handleBackspace}
            letterStates={letterStates}
            language={language}
          />
        </>
      )}
      <LanguageSelector
        allAvailableLanguages={allAvailableLanguages}
        isOpen={showOptions}
        onClose={() => setShowOptions(false)}
        onSelectionChange={onLanguageSelectionChange}
      />
    </div>
  );
};

