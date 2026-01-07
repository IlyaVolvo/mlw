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
  const [isHistoricalView, setIsHistoricalView] = useState<boolean>(false);

  // Load preferences on mount
  useEffect(() => {
    // Always default to Daily mode
    setRandomMode(false);
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

  // Load historical game when historicalDate changes
  useEffect(() => {
    if (!historicalDate) {
      setIsHistoricalView(false);
      return;
    }

    const loadHistoricalGame = async () => {
      setLoading(true);
      setError(null);
      setIsHistoricalView(true);

      try {
        const dict = await loadDictionary(language, wordLength);
        if (!dict) {
          setError(`Failed to load dictionary for ${language}-${wordLength}`);
          setLoading(false);
          return;
        }
        setDictionary(dict);

        try {
          // First check for completed game
          const completedResponse = await apiClient.getCompletedGame({
            language,
            wordLength,
            gameDate: historicalDate,
            isRandomMode: false,
          });
          if (completedResponse.game) {
            // Found completed game - show it
            const target = completedResponse.game.target_word;
            const guessesWithEvals = (completedResponse.game.guesses || []).map((g: any) => ({
              word: g.word,
              evaluations: evaluateGuess(g.word, target),
            }));
            const historicalGame: GameState = {
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
            setGameState(historicalGame);
            setTargetWord(target);
            updateLetterStates(historicalGame);
            setLoading(false);
            return;
          }

          // Check for current (incomplete) game
          const currentResponse = await apiClient.getCurrentGame({
            language,
            wordLength,
            gameDate: historicalDate,
            isRandomMode: false,
          });
          if (currentResponse.game) {
            // Found incomplete game - restore it
            const target = currentResponse.game.target_word;
            const guessesWithEvals = (currentResponse.game.guesses || []).map((g: any) => ({
              word: g.word,
              evaluations: evaluateGuess(g.word, target),
            }));
            const currentGame: GameState = {
              guesses: guessesWithEvals,
              currentGuess: '',
              isComplete: currentResponse.game.is_complete === 1,
              isWon: currentResponse.game.isWon,
              language: currentResponse.game.language,
              wordLength: currentResponse.game.word_length,
              date: currentResponse.game.game_date,
              isRandomMode: currentResponse.game.is_random_mode === 1,
              wordSeed: currentResponse.game.word_seed || undefined,
            };
            setGameState(currentGame);
            setTargetWord(target);
            updateLetterStates(currentGame);
            setLoading(false);
            return;
          }

          // No game found - start a new one for this date
          const target = getDailyWord(dict, historicalDate);
          const newState: GameState = {
            guesses: [],
            currentGuess: '',
            isComplete: false,
            isWon: false,
            language,
            wordLength,
            date: historicalDate,
            isRandomMode: false,
          };
          setGameState(newState);
          setTargetWord(target);
          updateLetterStates(newState);
          
          // Save new game to API
          await apiClient.saveGame({
            language,
            wordLength,
            targetWord: target,
            gameDate: historicalDate,
            isRandomMode: false,
            guesses: [],
            isComplete: false,
            isWon: false,
          });
        } catch (err) {
          console.error('Failed to load historical game:', err);
          setError('Failed to load historical game');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dictionary');
      } finally {
        setLoading(false);
      }
    };

    loadHistoricalGame();
  }, [historicalDate, language, wordLength, updateLetterStates]);

  // Initialize game
  useEffect(() => {
    if (initializedRef.current || historicalDate) return; // Skip if viewing historical game
    
    const initializeGame = async () => {
      setLoading(true);
      setError(null);

      try {
        // Always default to Daily mode
        setRandomMode(false);

        const today = formatDate();
        let currentLanguage = language;
        let currentWordLength = wordLength;
        let currentRandomMode = false; // Always default to Daily

        // Load dictionary
        const dict = await loadDictionary(currentLanguage, currentWordLength);
        if (!dict) {
          setError(`Failed to load dictionary for ${currentLanguage}-${currentWordLength}`);
          setLoading(false);
          return;
        }
        setDictionary(dict);

        // Get or generate target word
        let target: string;
        let wordSeed: number | undefined;

        if (currentRandomMode) {
          // Random mode: always generate new word on initialization
          wordSeed = Date.now();
          target = getWordFromSeed(dict, wordSeed);
        } else {
          // Daily mode: check if already completed today
          try {
            const completedResponse = await apiClient.getCompletedGame({
              language: currentLanguage,
              wordLength: currentWordLength,
              gameDate: today,
              isRandomMode: false,
            });
            if (completedResponse.game) {
              // Already completed today - show that result
              const target = completedResponse.game.target_word;
              const guessesWithEvals = (completedResponse.game.guesses || []).map((g: any) => ({
                word: g.word,
                evaluations: evaluateGuess(g.word, target),
              }));
              const completedGame = {
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
              updateLetterStates(completedGame);
              initializedRef.current = true;
              setLoading(false);
              return;
            }
          } catch (err) {
            console.error('Failed to check completed game:', err);
          }
          // Not completed - same word for the day
          target = getDailyWord(dict, today);
        }

        // Try to load current incomplete game
        try {
          const gameResponse = await apiClient.getCurrentGame({
            language: currentLanguage,
            wordLength: currentWordLength,
            gameDate: currentRandomMode ? undefined : today,
            isRandomMode: currentRandomMode,
            wordSeed: currentRandomMode ? wordSeed : undefined,
          });
          if (gameResponse.game) {
            // Restore existing game
            const target = gameResponse.game.target_word;
            const guessesWithEvals = (gameResponse.game.guesses || []).map((g: any) => ({
              word: g.word,
              evaluations: evaluateGuess(g.word, target),
            }));
            const restoredGame = {
              guesses: guessesWithEvals,
              currentGuess: '',
              isComplete: gameResponse.game.is_complete === 1,
              isWon: gameResponse.game.isWon,
              language: gameResponse.game.language,
              wordLength: gameResponse.game.word_length,
              date: gameResponse.game.game_date,
              isRandomMode: gameResponse.game.is_random_mode === 1,
              wordSeed: gameResponse.game.word_seed || undefined,
            };
            setGameState(restoredGame);
            setTargetWord(target);
            updateLetterStates(restoredGame);
            initializedRef.current = true;
            setLoading(false);
            return;
          }
        } catch (err) {
          console.error('Failed to load current game:', err);
        }

        // Start new game
        const newState: GameState = {
          guesses: [],
          currentGuess: '',
          isComplete: false,
          isWon: false,
          language: currentLanguage,
          wordLength: currentWordLength,
          date: currentRandomMode ? Date.now().toString() : today,
          isRandomMode: currentRandomMode,
          wordSeed: currentRandomMode ? wordSeed : undefined,
        };
        setGameState(newState);
        setTargetWord(target);
        updateLetterStates(newState);
        // Save new game to API
        await apiClient.saveGame({
          language: currentLanguage,
          wordLength: currentWordLength,
          targetWord: target,
          gameDate: newState.date,
          isRandomMode: currentRandomMode,
          wordSeed: currentRandomMode ? wordSeed : undefined,
          guesses: [],
          isComplete: false,
          isWon: false,
        });
        
        initializedRef.current = true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize game');
      } finally {
        setLoading(false);
      }
    };

    initializeGame();
  }, [userId]);

  // Handle language, word length, or random mode change
  useEffect(() => {
    if (!initializedRef.current || loading) return;

    const changeGame = async () => {
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

        const today = formatDate();

        // Only load existing games, don't create new ones when settings change
        // New games are only created when clicking "New Game" button
        if (randomMode) {
          // Random mode: don't auto-create games on settings change
          // Just clear the game state - user must click "New Game" to start
          setGameState(null);
          setTargetWord('');
          setLetterStates(new Map());
        } else {
          // Daily mode: check for completed game first, then current game
          // Don't create new game if none exists
          try {
            const completedResponse = await apiClient.getCompletedGame({
              language,
              wordLength,
              gameDate: today,
              isRandomMode: false,
            });
            if (completedResponse.game) {
              // Show completed game
              const target = completedResponse.game.target_word;
              const guessesWithEvals = (completedResponse.game.guesses || []).map((g: any) => ({
                word: g.word,
                evaluations: evaluateGuess(g.word, target),
              }));
              const completedGame = {
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
              updateLetterStates(completedGame);
            } else {
              // Check for current incomplete game
              const currentResponse = await apiClient.getCurrentGame({
                language,
                wordLength,
                gameDate: today,
                isRandomMode: false,
              });
              if (currentResponse.game) {
                const target = currentResponse.game.target_word;
                const guessesWithEvals = (currentResponse.game.guesses || []).map((g: any) => ({
                  word: g.word,
                  evaluations: evaluateGuess(g.word, target),
                }));
                const currentGame = {
                  guesses: guessesWithEvals,
                  currentGuess: '',
                  isComplete: currentResponse.game.is_complete === 1,
                  isWon: currentResponse.game.isWon,
                  language: currentResponse.game.language,
                  wordLength: currentResponse.game.word_length,
                  date: currentResponse.game.game_date,
                  isRandomMode: currentResponse.game.is_random_mode === 1,
                  wordSeed: currentResponse.game.word_seed || undefined,
                };
                setGameState(currentGame);
                setTargetWord(target);
                updateLetterStates(currentGame);
              } else {
                // No existing game - clear state, user must click "New Game" to start
                setGameState(null);
                setTargetWord('');
                setLetterStates(new Map());
              }
            }
          } catch (err) {
            console.error('Failed to load game:', err);
            // On error, clear state instead of creating new game
            setGameState(null);
            setTargetWord('');
            setLetterStates(new Map());
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to change game settings');
      } finally {
        setLoading(false);
      }
    };

    changeGame();
  }, [language, wordLength, randomMode, userId]);

  const saveGameToApi = useCallback(async (state: GameState) => {
    if (!dictionary || !targetWord) return;
    // Don't save if this is just an empty initial state that hasn't been initialized yet
    // The initial save is handled explicitly in the initialization code
    // Skip if: not initialized yet, no guesses, not complete, and no current guess
    if (!initializedRef.current && state.guesses.length === 0 && !state.isComplete && state.currentGuess === '') {
      return;
    }
    try {
      await apiClient.saveGame({
        language: state.language,
        wordLength: state.wordLength,
        targetWord,
        gameDate: state.date,
        isRandomMode: state.isRandomMode,
        wordSeed: state.wordSeed,
        guesses: state.guesses,
        isComplete: state.isComplete,
        isWon: state.isWon,
      });
    } catch (error) {
      console.error('Failed to save game to API:', error);
    }
  }, [dictionary, targetWord]);

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

  const handleClearGame = useCallback(async () => {
    if (!dictionary) return;

    const today = formatDate();
    let target: string;
    let wordSeed: number | undefined;

    if (randomMode) {
      // Random mode: always start new game
      wordSeed = Date.now();
      target = getWordFromSeed(dictionary, wordSeed);
    } else {
      // Daily mode: check if there's already a completed game for today
      try {
        const completedResponse = await apiClient.getCompletedGame({
          language,
          wordLength,
          gameDate: today,
          isRandomMode: false,
        });
        if (completedResponse.game) {
          // Restore the completed game
          const target = completedResponse.game.target_word;
          const guessesWithEvals = (completedResponse.game.guesses || []).map((g: any) => ({
            word: g.word,
            evaluations: evaluateGuess(g.word, target),
          }));
          const completedGame = {
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
          updateLetterStates(completedGame);
          return;
        }
      } catch (err) {
        console.error('Failed to check completed game:', err);
      }
      // No completed game, use today's word
      target = getDailyWord(dictionary, today);
    }

    // Start a new game
    const newState: GameState = {
      guesses: [],
      currentGuess: '',
      isComplete: false,
      isWon: false,
      language,
      wordLength,
      date: randomMode ? Date.now().toString() : today,
      isRandomMode: randomMode,
      wordSeed: randomMode ? wordSeed : undefined,
    };

    setGameState(newState);
    setLetterStates(new Map());
    setTargetWord(target);
    await apiClient.saveGame({
      language,
      wordLength,
      targetWord: target,
      gameDate: newState.date,
      isRandomMode: randomMode,
      wordSeed: randomMode ? wordSeed : undefined,
      guesses: [],
      isComplete: false,
      isWon: false,
    });
  }, [dictionary, language, wordLength, randomMode]);

  const handleRandomModeChange = useCallback((newRandomMode: boolean) => {
    const prefs = loadPreferences();
    prefs.randomMode = newRandomMode;
    savePreferences(prefs);
    setRandomMode(newRandomMode);
  }, []);

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

  if (!gameState || !dictionary) {
    return <div className="error">Failed to initialize game</div>;
  }

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
              className={`view-tab ${view === 'game' ? 'active' : ''}`}
              onClick={() => onViewChange('game')}
            >
              Game
            </button>
            <button
              className={`view-tab ${view === 'statistics' ? 'active' : ''}`}
              onClick={() => onViewChange('statistics')}
            >
              Statistics
            </button>
          </div>
        )}
      </div>
      {isHistoricalView && historicalDate && (
        <div className="historical-date-indicator">
          Playing game for: {historicalDate}
        </div>
      )}
      <Settings
        language={language}
        wordLength={wordLength}
        randomMode={randomMode}
        availableLanguages={availableLanguages}
        onLanguageChange={handleLanguageChange}
        onWordLengthChange={handleWordLengthChange}
        onRandomModeChange={handleRandomModeChange}
        disabled={isHistoricalView}
      />
      {!isHistoricalView && (
        <div className="game-controls">
          <button 
            className="clear-button" 
            onClick={handleClearGame}
            disabled={loading}
          >
            New Game
          </button>
        </div>
      )}
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
              Game Over! The word was: <strong>{targetWord}</strong>
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

