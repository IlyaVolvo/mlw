import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'wordle',
  user: process.env.DB_USER || process.env.USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

/**
 * Generates a deterministic seed for a given date and dictionary
 */
function generateSeed(date: string, language: string, wordLength: number): number {
  const dateStr = date.replace(/-/g, '');
  const combined = `${dateStr}-${language}-${wordLength}`;
  
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return Math.abs(hash);
}

/**
 * Gets a deterministic word for a given date from answer words
 */
function getDailyWord(answerWords: string[], date: string, language: string, wordLength: number): string {
  const seed = generateSeed(date, language, wordLength);
  const index = seed % answerWords.length;
  return answerWords[index];
}

/**
 * Loads dictionary files
 */
function loadDictionaryFiles(language: string, wordLength: number): { answers: string[], words: string[] } {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const dictDir = path.resolve(__dirname, '../../public/dict/wordle-wordlists');
  
  const answersPath = path.join(dictDir, `${language}-${wordLength}-answers.txt`);
  const dictionaryPath = path.join(dictDir, `${language}-${wordLength}-dictionary.txt`);
  
  const answers = fs.readFileSync(answersPath, 'utf-8')
    .split('\n')
    .map(line => {
      // Extract only the first word (up to first whitespace)
      const firstWord = line.trim().split(/\s+/)[0];
      return firstWord.toLowerCase();
    })
    .filter(word => word.length > 0);
  
  const words = fs.readFileSync(dictionaryPath, 'utf-8')
    .split('\n')
    .map(line => {
      // Extract only the first word (up to first whitespace)
      const firstWord = line.trim().split(/\s+/)[0];
      return firstWord.toLowerCase();
    })
    .filter(word => word.length > 0);
  
  return { answers, words };
}

/**
 * Generates valid guess sequence for a win
 * Creates guesses that could logically lead to the target (simplified approach)
 */
function generateWinGuesses(targetWord: string, attemptCount: number, allWords: string[]): string[] {
  const guesses: string[] = [];
  const usedWords = new Set<string>();
  usedWords.add(targetWord);
  
  // For simplicity, we'll use words that share some letters with the target
  // and ensure the last guess is the target word
  for (let i = 0; i < attemptCount - 1; i++) {
    // Find a word that hasn't been used and shares at least one letter with target
    const candidate = allWords.find(word => 
      !usedWords.has(word) && 
      word.split('').some(letter => targetWord.includes(letter))
    );
    
    if (candidate) {
      guesses.push(candidate);
      usedWords.add(candidate);
    } else {
      // Fallback: just pick any unused word
      const fallback = allWords.find(word => !usedWords.has(word));
      if (fallback) {
        guesses.push(fallback);
        usedWords.add(fallback);
      }
    }
  }
  
  // Last guess is always the target word (the win)
  guesses.push(targetWord);
  
  return guesses;
}

/**
 * Generates valid guess sequence for a loss (6 guesses that don't include target)
 */
function generateLossGuesses(targetWord: string, allWords: string[]): string[] {
  const guesses: string[] = [];
  const usedWords = new Set<string>();
  usedWords.add(targetWord);
  
  // Generate 6 guesses that don't include the target
  for (let i = 0; i < 6; i++) {
    const candidate = allWords.find(word => !usedWords.has(word));
    if (candidate) {
      guesses.push(candidate);
      usedWords.add(candidate);
    } else {
      // If we run out of words, just repeat (unlikely with large dictionaries)
      break;
    }
  }
  
  return guesses;
}

async function populateGames() {
  const userId = 1;
  const language = 'en';
  const wordLength = 5;
  
  console.log('Loading dictionary files...');
  const { answers, words } = loadDictionaryFiles(language, wordLength);
  console.log(`Loaded ${answers.length} answer words and ${words.length} dictionary words`);
  
  // Combine all words for guess generation
  const allWords = [...new Set([...answers, ...words])].filter(w => w.length === wordLength);
  console.log(`Total unique words: ${allWords.length}`);
  
  // Distribution: 365 games total
  // 1 attempt: 0% (0 games)
  // 2 attempts: 3% (~11 games)
  // 3 attempts: 28% (~102 games)
  // 4 attempts: 42% (~153 games)
  // 5 attempts: 19% (~69 games)
  // 6 attempts: 6% (~22 games)
  // Loss: 1% (~4 games)
  
  const distribution = [
    { attempts: 2, count: 11 },
    { attempts: 3, count: 102 },
    { attempts: 4, count: 153 },
    { attempts: 5, count: 69 },
    { attempts: 6, count: 22 },
    { attempts: 0, count: 4 }, // 0 means loss
  ];
  
  // Generate all dates in 2025
  const dates: string[] = [];
  const startDate = new Date('2025-01-01');
  const endDate = new Date('2025-12-31');
  
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    dates.push(dateStr);
  }
  
  console.log(`Generating ${dates.length} games...`);
  
  // Create array of game outcomes based on distribution
  const outcomes: number[] = [];
  distribution.forEach(({ attempts, count }) => {
    for (let i = 0; i < count; i++) {
      outcomes.push(attempts);
    }
  });
  
  // Shuffle outcomes to distribute across the year
  for (let i = outcomes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [outcomes[i], outcomes[j]] = [outcomes[j], outcomes[i]];
  }
  
  // Fill remaining days (if any) with 4 attempts (most common)
  while (outcomes.length < dates.length) {
    outcomes.push(4);
  }
  
  console.log('Inserting games into database...');
  
  let inserted = 0;
  const batchSize = 100;
  
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const attemptCount = outcomes[i];
    
    // Get daily word
    const targetWord = getDailyWord(answers, date, language, wordLength);
    
    // Generate guesses
    let guesses: string[];
    let isWon: boolean;
    
    if (attemptCount === 0) {
      // Loss
      guesses = generateLossGuesses(targetWord, allWords);
      isWon = false;
    } else {
      // Win
      guesses = generateWinGuesses(targetWord, attemptCount, allWords);
      isWon = true;
    }
    
    const gameDate = date;
    const createdAt = new Date(`${date}T12:00:00Z`);
    const completedAt = new Date(`${date}T12:30:00Z`);
    
    try {
      await pool.query(
        `INSERT INTO games (
          user_id, language, word_length, target_word, game_date,
          is_random_mode, word_seed, is_complete, guesses,
          created_at, completed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          userId,
          language,
          wordLength,
          targetWord,
          gameDate,
          0, // is_random_mode
          null, // word_seed
          1, // is_complete
          guesses, // PostgreSQL array
          createdAt,
          completedAt,
        ]
      );
      
      inserted++;
      
      if (inserted % batchSize === 0) {
        console.log(`Inserted ${inserted}/${dates.length} games...`);
      }
    } catch (error) {
      console.error(`Error inserting game for ${date}:`, error);
      throw error;
    }
  }
  
  console.log(`Successfully inserted ${inserted} games!`);
  await pool.end();
}

populateGames().catch((error) => {
  console.error('Error populating games:', error);
  process.exit(1);
});

