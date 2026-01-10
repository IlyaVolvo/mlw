# Database Configuration for Prisma

## Current Setup

Prisma Studio needs the `DATABASE_URL` environment variable to connect to your Supabase database.

## Quick Setup

### Option 1: Use the setup script
```bash
cd server
./setup-database-url.sh
```

### Option 2: Manual Setup

Add this to your `server/.env` file:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@YOUR_HOST.supabase.co:5432/postgres?sslmode=require"
```

Replace:
- `YOUR_PASSWORD` with your Supabase database password
- `YOUR_HOST` with your Supabase project host (e.g., `db.xxxxx.supabase.co`)

### Option 3: From Individual Variables

If you already have individual DB variables in `.env`, you can construct `DATABASE_URL`:

```env
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=require"
```

## Finding Your Supabase Connection Details

1. Go to your Supabase Dashboard
2. Navigate to **Settings** → **Database**
3. Under **Connection string**, select **URI**
4. Copy the connection string
5. Make sure it includes `?sslmode=require` at the end

## Database Name

For Supabase, the database name is typically **`postgres`** (the default PostgreSQL database).

You can verify this in your Supabase dashboard under **Settings** → **Database** → **Connection string**.

## Verify Connection

After setting up `DATABASE_URL`, test it:

```bash
cd server
npm run studio
```

Prisma Studio should open on port 5557 (or the port you configured) and show your database tables.

