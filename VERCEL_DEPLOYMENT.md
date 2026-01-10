# Vercel Deployment Guide

This guide explains how to deploy the Wordle Multi application to Vercel.

## Prerequisites

- Vercel account
- Supabase database (already deployed)
- GitHub repository (recommended for automatic deployments)

## Deployment Steps

### 1. Environment Variables

Set the following environment variables in your Vercel project settings:

#### Database (Supabase)
```
DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require
```

Or use individual connection parameters:
```
DB_HOST=your-supabase-host.supabase.co
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=your-password
```

#### JWT Secret
```
JWT_SECRET=your-secret-key-here
```

#### Email Configuration (for password reset)
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com
```

#### Frontend URL (optional, for CORS)
```
FRONTEND_URL=https://your-app.vercel.app
```

### 2. Build Configuration

The project is configured to:
- Build the frontend (Vite/React) to `dist/`
- Build the server (TypeScript) to `server/dist/`
- Serve API routes via serverless functions at `/api/*`

### 3. Deploy to Vercel

#### Option A: Via Vercel CLI
```bash
npm i -g vercel
vercel
```

#### Option B: Via GitHub Integration
1. Push your code to GitHub
2. Import project in Vercel dashboard
3. Connect your GitHub repository
4. Vercel will automatically detect the configuration

### 4. Post-Deployment

After deployment:
1. Verify the health endpoint: `https://your-app.vercel.app/api/health`
2. Test authentication endpoints
3. Verify database connection

## Project Structure

```
/
├── api/              # Vercel serverless function entry point
│   └── index.ts      # Express app wrapper for Vercel
├── server/           # Backend Express server
│   ├── src/          # TypeScript source
│   └── dist/         # Compiled JavaScript (built during deployment)
├── src/              # Frontend React app
├── dist/             # Built frontend (output directory)
└── vercel.json       # Vercel configuration
```

## Environment Variables Quick Reference

Set these in Vercel Dashboard → Project Settings → Environment Variables:

### Required
- `DATABASE_URL` - Supabase PostgreSQL connection string
  OR use individual vars: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `JWT_SECRET` - Secret key for JWT token signing

### Optional (for password reset)
- `SMTP_HOST` - SMTP server hostname
- `SMTP_PORT` - SMTP server port (usually 587)
- `SMTP_USER` - SMTP username/email
- `SMTP_PASS` - SMTP password/app password
- `SMTP_FROM` - From email address

### Optional (for CORS)
- `FRONTEND_URL` - Your Vercel deployment URL

## Troubleshooting

### Build Failures
- Ensure all dependencies are listed in `package.json`
- Check that TypeScript compilation succeeds: `cd server && npm run build`
- Verify environment variables are set correctly
- Check Vercel build logs for specific errors

### API Routes Not Working
- Check that `server/dist/` is built correctly (build command runs `cd server && npm run build`)
- Verify the `/api` rewrite rules in `vercel.json`
- Check Vercel function logs for errors
- Ensure `@vercel/node` is installed in root `package.json`

### Database Connection Issues
- Verify `DATABASE_URL` or individual DB env vars are correct
- Ensure Supabase allows connections from Vercel IPs (should be enabled by default)
- Check Supabase connection pooling settings
- Verify SSL mode is set correctly (`?sslmode=require` in connection string)

### CORS Issues
- Set `FRONTEND_URL` environment variable to your Vercel URL
- Verify CORS configuration in `api/index.ts`
- Check browser console for CORS error messages

## Local Development

For local development, use:
```bash
# Terminal 1: Frontend
npm run dev

# Terminal 2: Backend
cd server && npm run dev
```

The Vite dev server proxies `/api/*` requests to the backend server.

