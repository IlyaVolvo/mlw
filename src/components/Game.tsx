import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { GameState, DictionaryEntry, LetterState, LanguageConfig } from '../types';
import { GameBoard } from './GameBoard';
import { Keyboard } from './Keyboard';
import { Settings } from './Settings';
import { loadDictionary } from '../data/dictionaryLoader';
import { getDailyWord, getWordFromSeed, formatDate } from '../utils/dailyWord';
import { evaluateGuess, isValidWord } from '../utils/gameLogic';
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
  availableLanguages
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
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [previewGameState, setPreviewGameState] = useState<GameState | null>(null);
  const [previewTargetWord, setPreviewTargetWord] = useState<string>('');
  const [isPlayingMode, setIsPlayingMode] = useState<boolean>(false); // True when actively playing a game

  // Load preferences on mount
  useEffect(() => {
    const prefs = loadPreferences();
    setRandomMode(prefs.randomMode || false);
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

  // Initialize component - just load dictionary, don't create game
  useEffect(() => {
    if (initializedRef.current) return;
    
    const initialize = async () => {
      setLoading(true);
      setError(null);

      try {
        const dict = await loadDictionary(language, wordLength);
        if (!dict) {
          setError(`Failed to load dictionary for ${language}-${wordLength}`);
          setLoading(false);
          return;
        }
        setDictionary(dict);
        initializedRef.current = true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize');
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, [userId, language, wordLength]);

  // Handle language or word length change - reload dictionary and clear preview
  useEffect(() => {
    if (!initializedRef.current || loading || isPlayingMode) return;

    const changeSettings = async () => {
      try {
        const dict = await loadDictionary(language, wordLength);
        if (dict) {
          setDictionary(dict);
        }
        // Clear preview when settings change
        setPreviewGameState(null);
        setPreviewTargetWord('');
        setSelectedPlayDate('');
      } catch (err) {
        console.error('Failed to load dictionary:', err);
      }
    };

    changeSettings();
  }, [language, wordLength, initializedRef.current, loading, isPlayingMode]);

  const saveGameToApi = useCallback(async (state: GameState) => {
    if (!dictionary || !targetWord || !isPlayingMode) return; // Only save when actively playing
    try {
      await apiClient.saveGame({
        language: state.language,
        wordLength: state.wordLength,
        targetWord,
        gameDate: state.date,
        isRandomMode: state.isRandomMode || false,
        wordSeed: state.wordSeed,
        guesses: state.guesses,
        isComplete: state.isComplete,
        isWon: state.isWon,
      });
    } catch (error) {
      console.error('Failed to save game to API:', error);
    }
  }, [dictionary, targetWord, isPlayingMode]);

  const handleKeyPress = useCallback((key: string) => {
    if (!gameState || gameState.isComplete || !dictionary) return;

    const normalizedKey = key.toLowerCase();
    if (gameState.currentGuess.length < wordLength) {
      const newGuess = gameState.currentGuess + normalizedKey;
      const updatedState = { ...gameState, currentGuess: newGuess };
      setGameState(updatedState);
      saveGameToApi(updatedState);
    }
  }, [gameState, wordLength, dictionary, saveGameToApi]);

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

    const evaluations = evaluateGuess(guess, targetWord);
    const isWon = guess === targetWord;
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
  }, [gameState, dictionary, wordLength, targetWord, saveGameToApi]);

  const handleBackspace = useCallback(() => {
    if (!gameState || gameState.isComplete) return;

    if (gameState.currentGuess.length > 0) {
      const newGuess = gameState.currentGuess.slice(0, -1);
      const updatedState = { ...gameState, currentGuess: newGuess };
      setGameState(updatedState);
      saveGameToApi(updatedState);
    }
  }, [gameState, saveGameToApi]);

  const handleLanguageChange = (newLanguage: string) => {
    // Update word length to first supported length if current is not supported
    const langConfig = availableLanguages.find(l => l.code === newLanguage);
    if (langConfig && !langConfig.supportedLengths.includes(wordLength)) {
      onWordLengthChange(langConfig.supportedLengths[0] || 5);
    }
    onLanguageChange(newLanguage);
  };

  const handleWordLengthChange = (newLength: number) => {
    onWordLengthChange(newLength);
  };

  const handlePlayGame = useCallback(async () => {
    if (isPlaying || isPlayingMode) return;
    
    // Load dictionary if not loaded
    let dict = dictionary;
    if (!dict) {
      try {
        dict = await loadDictionary(language, wordLength);
        if (!dict) {
          setError(`Failed to load dictionary for ${language}-${wordLength}`);
          return;
        }
        setDictionary(dict);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dictionary');
        return;
      }
    }

    setIsPlaying(true);
    setIsPlayingMode(true); // Enter playing mode - this greys out settings and tabs
    
    const playDate = selectedPlayDate || formatDate();
    let target: string;
    let wordSeed: number | undefined;

    try {
      if (randomMode) {
        // Random mode: always start new game
        wordSeed = Date.now();
        target = getWordFromSeed(dict, wordSeed);
        
        // Start a new game
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
        setPreviewGameState(null);
        setPreviewTargetWord('');
        setLetterStates(new Map());
        
        // Create DB entry for new game
        await apiClient.saveGame({
          language,
          wordLength,
          targetWord: target,
          gameDate: newState.date,
          isRandomMode: true,
          wordSeed: wordSeed,
          guesses: [],
          isComplete: false,
          isWon: false,
        });
      } else {
        // Daily mode: check for existing game (incomplete or completed) first
        // First check for incomplete game
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
            evaluations: evaluateGuess(g.word, target),
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
          setPreviewGameState(null);
          setPreviewTargetWord('');
          updateLetterStates(currentGame);
          setIsPlaying(false);
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
          // Restore the completed game (show result, but don't allow playing)
          const target = completedResponse.game.target_word;
          const guessesWithEvals = (completedResponse.game.guesses || []).map((g: any) => ({
            word: g.word,
            evaluations: evaluateGuess(g.word, target),
          }));
          const completedGame: GameState = {
            guesses: guessesWithEvals,
            currentGuess: '',
            isComplete: completedResponse.game.is_complete === 1,
            isWon: completedResponse.game.isWon,
            language: completedResponse.game.language,
            wordLength: completedResponse.game.word_length,
            date: completedResponse.game.game_date,
            isRandomMode: completedResponse.game.is_random_mode === 1,
            wordSeed: completedResponse.game.word_seed || undefined,
          };
          setGameState(completedGame);
          setTargetWord(target);
          setPreviewGameState(null);
          setPreviewTargetWord('');
          updateLetterStates(completedGame);
          setIsPlayingMode(true); // Show as playing but game is complete
          setIsPlaying(false);
          return;
        }
        
        // No existing game, start a new one for this date
        target = getDailyWord(dict, playDate);
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
        setPreviewGameState(null);
        setPreviewTargetWord('');
        setLetterStates(new Map());
        
        // Create DB entry for new game
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
    } finally {
      setIsPlaying(false);
      setSelectedPlayDate(''); // Clear date picker after starting
    }
  }, [dictionary, language, wordLength, randomMode, selectedPlayDate, isPlaying, isPlayingMode, updateLetterStates]);

  // Load preview game for selected date when in selection mode (not playing)
  useEffect(() => {
    if (isPlayingMode || loading || !dictionary) {
      // Clear preview when playing
      if (isPlayingMode) {
        setPreviewGameState(null);
        setPreviewTargetWord('');
      }
      return;
    }
    
    const loadPreviewGame = async () => {
      if (!selectedPlayDate && randomMode) {
        // Random mode - no preview for specific date
        setPreviewGameState(null);
        setPreviewTargetWord('');
        return;
      }
      
      const previewDate = selectedPlayDate || formatDate();
      
      try {
        // Check for completed game first
        const completedResponse = await apiClient.getCompletedGame({
          language,
          wordLength,
          gameDate: previewDate,
          isRandomMode: randomMode,
        });
        if (completedResponse.game) {
          const target = completedResponse.game.target_word;
          const guessesWithEvals = (completedResponse.game.guesses || []).map((g: any) => ({
            word: g.word,
            evaluations: evaluateGuess(g.word, target),
          }));
          const previewGame: GameState = {
            guesses: guessesWithEvals,
            currentGuess: '',
            isComplete: completedResponse.game.is_complete === 1,
            isWon: completedResponse.game.isWon,
            language: completedResponse.game.language,
            wordLength: completedResponse.game.word_length,
            date: completedResponse.game.game_date,
            isRandomMode: completedResponse.game.is_random_mode === 1,
            wordSeed: completedResponse.game.word_seed || undefined,
          };
          setPreviewGameState(previewGame);
          setPreviewTargetWord(target);
          return;
        }
        
        // Check for incomplete game
        const currentResponse = await apiClient.getCurrentGame({
          language,
          wordLength,
          gameDate: previewDate,
          isRandomMode: randomMode,
        });
        if (currentResponse.game && currentResponse.game.is_complete !== 1) {
          const target = currentResponse.game.target_word;
          const guessesWithEvals = (currentResponse.game.guesses || []).map((g: any) => ({
            word: g.word,
            evaluations: evaluateGuess(g.word, target),
          }));
          const previewGame: GameState = {
            guesses: guessesWithEvals,
            currentGuess: '',
            isComplete: false,
            isWon: false,
            language: currentResponse.game.language,
            wordLength: currentResponse.game.word_length,
            date: currentResponse.game.game_date,
            isRandomMode: currentResponse.game.is_random_mode === 1,
            wordSeed: currentResponse.game.word_seed || undefined,
          };
          setPreviewGameState(previewGame);
          setPreviewTargetWord(target);
          return;
        }
        
        // No game exists - show empty preview
        setPreviewGameState(null);
        setPreviewTargetWord('');
      } catch (err) {
        console.error('Failed to load preview game:', err);
        setPreviewGameState(null);
        setPreviewTargetWord('');
      }
    };

    loadPreviewGame();
  }, [selectedPlayDate, dictionary, language, wordLength, randomMode, isPlayingMode, loading]);

  const handleRandomModeChange = useCallback((newRandomMode: boolean) => {
    if (isPlayingMode) return; // Don't allow changes when playing
    const prefs = loadPreferences();
    prefs.randomMode = newRandomMode;
    savePreferences(prefs);
    setRandomMode(newRandomMode);
    // Clear preview when mode changes
    setPreviewGameState(null);
    setPreviewTargetWord('');
    setSelectedPlayDate('');
  }, [isPlayingMode]);

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (loading || !gameState || gameState.isComplete) return;

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
  }, [loading, gameState, handleEnter, handleBackspace, handleKeyPress]);

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  // Helper to format playing label
  const getPlayingLabel = () => {
    if (!gameState) return '';
    if (gameState.isRandomMode) {
      return 'Playing ... random';
    }
    const today = formatDate();
    if (gameState.date === today) {
      return 'Playing ...';
    }
    return `Playing ... ${gameState.date}`;
  };

  // Selection mode: not playing, show Play button and date picker
  if (!isPlayingMode || !gameState) {
    return (
      <div className="game-container">
        <div className="header-section">
          <h1>
            <span>Wordle Multi</span>
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
            <div className="view-tabs">
              <button
                className={`view-tab ${view === 'game' && !isPlayingMode ? 'active' : ''}`}
                onClick={() => {
                  // Reset to selection mode when clicking Game tab
                  setGameState(null);
                  setTargetWord('');
                  setPreviewGameState(null);
                  setPreviewTargetWord('');
                  setSelectedPlayDate('');
                  setIsPlayingMode(false);
                  onViewChange('game');
                }}
              >
                Game
              </button>
              <button
                className={`view-tab ${view === 'statistics' && !isPlayingMode ? 'active' : ''}`}
                onClick={() => {
                  if (!isPlayingMode) {
                    onViewChange('statistics');
                  }
                }}
              >
                Statistics
              </button>
            </div>
          )}
        </div>
        <Settings
          language={language}
          wordLength={wordLength}
          randomMode={randomMode}
          availableLanguages={availableLanguages}
          onLanguageChange={handleLanguageChange}
          onWordLengthChange={handleWordLengthChange}
          onRandomModeChange={handleRandomModeChange}
          disabled={false}
        />
        <div className="game-controls">
          <div className="play-controls">
            <button 
              className="play-button" 
              onClick={handlePlayGame}
              disabled={loading || isPlaying || (previewGameState?.isComplete ?? false)}
            >
              {isPlaying ? 'Playing...' : 'Play'}
            </button>
            {!randomMode && (
              <div className="date-picker-wrapper">
                <input
                  id="play-date"
                  type="date"
                  value={selectedPlayDate}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setSelectedPlayDate(e.target.value)}
                  className="date-input"
                />
              </div>
            )}
          </div>
        </div>
        {previewGameState && (
          <>
            <GameBoard
              guesses={previewGameState.guesses}
              currentGuess={previewGameState.currentGuess}
              wordLength={wordLength}
              maxGuesses={MAX_GUESSES}
              targetWord={previewGameState.isComplete && !previewGameState.isWon ? previewTargetWord : undefined}
              isComplete={previewGameState.isComplete}
              isWon={previewGameState.isWon}
            />
            {previewGameState.isComplete && (
              <div className="game-result">
                {previewGameState.isWon ? (
                  <div className="result-message success">
                    Congratulations! You won!
                  </div>
                ) : (
                  <div className="result-message failure">
                    Answer was: <strong>{previewTargetWord}</strong>
                  </div>
                )}
              </div>
            )}
          </>
        )}
        {!previewGameState && dictionary && (
          <GameBoard
            guesses={[]}
            currentGuess={''}
            wordLength={wordLength}
            maxGuesses={MAX_GUESSES}
            isComplete={false}
            isWon={false}
          />
        )}
      </div>
    );
  }

  // Playing mode: actively playing a game
  return (
    <div className="game-container">
      <div className="header-section">
        <h1>
          <span>Wordle Multi</span>
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
          <div className="view-tabs">
            <button
              className="view-tab"
              onClick={() => {
                // Reset to selection mode when clicking Game tab
                setGameState(null);
                setTargetWord('');
                setPreviewGameState(null);
                setPreviewTargetWord('');
                setSelectedPlayDate('');
                setIsPlayingMode(false);
                onViewChange('game');
              }}
            >
              Game
            </button>
            <button
              className="view-tab"
              onClick={() => {
                // Can't switch to statistics while playing
              }}
            >
              Statistics
            </button>
          </div>
        )}
      </div>
      <Settings
        language={language}
        wordLength={wordLength}
        randomMode={randomMode}
        availableLanguages={availableLanguages}
        onLanguageChange={handleLanguageChange}
        onWordLengthChange={handleWordLengthChange}
        onRandomModeChange={handleRandomModeChange}
        disabled={true}
      />
      <div className="game-controls">
        <div className="playing-indicator">
          <span className="playing-label">{getPlayingLabel()}</span>
        </div>
      </div>
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
      <Keyboard
        onKeyPress={handleKeyPress}
        onEnter={handleEnter}
        onBackspace={handleBackspace}
        letterStates={letterStates}
        language={language}
      />
    </div>
  );
};

