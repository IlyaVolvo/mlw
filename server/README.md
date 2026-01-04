# Wordle Multi Server

Backend server for Wordle Multi game with authentication and persistent storage.

## Setup

1. Install dependencies:
```bash
cd server
npm install
```

2. Create `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

3. Configure environment variables in `.env`:
- `JWT_SECRET`: Secret key for JWT tokens (change in production!)
- `SMTP_HOST`: SMTP server host (e.g., smtp.gmail.com)
- `SMTP_PORT`: SMTP server port (e.g., 587)
- `SMTP_USER`: Your email address
- `SMTP_PASS`: Your email app password (for Gmail, use an App Password)
- `SMTP_FROM`: From email address
- `FRONTEND_URL`: Frontend URL for password reset links

## Running

Development:
```bash
npm run dev
```

Production:
```bash
npm run build
npm start
```

Server runs on port 3101 by default.

## Email Setup

For Gmail:
1. Enable 2-factor authentication
2. Generate an App Password: https://myaccount.google.com/apppasswords
3. Use the App Password as `SMTP_PASS`

## Database

PostgreSQL database is used. Create a database named `wordle` (or configure via environment variables).

Environment variables for database connection:
- `DB_HOST`: PostgreSQL host (default: localhost)
- `DB_PORT`: PostgreSQL port (default: 5432)
- `DB_NAME`: Database name (default: wordle)
- `DB_USER`: PostgreSQL user (default: postgres)
- `DB_PASSWORD`: PostgreSQL password (default: postgres)

Tables are created automatically on first run:
- `users`: User accounts with email/password
- `games`: All games played
- `password_reset_tokens`: Password reset tokens

