import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFile = path.join(logsDir, 'server.log');
const errorLogFile = path.join(logsDir, 'error.log');

function getTimestamp(): string {
  return new Date().toISOString();
}

function writeToFile(file: string, message: string): void {
  try {
    fs.appendFileSync(file, `${message}\n`, 'utf8');
  } catch (error) {
    // Fallback to console if file write fails
    console.error('Failed to write to log file:', error);
    console.error(message);
  }
}

export const logger = {
  info: (message: string, ...args: any[]): void => {
    const logMessage = `[${getTimestamp()}] [INFO] ${message} ${args.length > 0 ? JSON.stringify(args) : ''}`;
    console.log(logMessage);
    writeToFile(logFile, logMessage);
  },

  error: (message: string, error?: any): void => {
    const errorDetails = error instanceof Error 
      ? `${error.message}\n${error.stack}` 
      : error 
        ? JSON.stringify(error, null, 2) 
        : '';
    const logMessage = `[${getTimestamp()}] [ERROR] ${message}${errorDetails ? '\n' + errorDetails : ''}`;
    console.error(logMessage);
    writeToFile(errorLogFile, logMessage);
    writeToFile(logFile, logMessage);
  },

  warn: (message: string, ...args: any[]): void => {
    const logMessage = `[${getTimestamp()}] [WARN] ${message} ${args.length > 0 ? JSON.stringify(args) : ''}`;
    console.warn(logMessage);
    writeToFile(logFile, logMessage);
  },

  debug: (message: string, ...args: any[]): void => {
    const logMessage = `[${getTimestamp()}] [DEBUG] ${message} ${args.length > 0 ? JSON.stringify(args) : ''}`;
    console.debug(logMessage);
    writeToFile(logFile, logMessage);
  },
};

