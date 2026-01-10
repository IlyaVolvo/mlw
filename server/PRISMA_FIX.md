# Fix Prisma Database Connection

## Issue
Prisma Studio is showing different data than your psql connection because Prisma needs `DATABASE_URL` environment variable.

## Solution

Add this line to your `server/.env` file:

```env
DATABASE_URL="postgresql://ilya@localhost:5432/mlw"
```

If your PostgreSQL requires a password, use:

```env
DATABASE_URL="postgresql://ilya:YOUR_PASSWORD@localhost:5432/mlw"
```

## Verify

After adding `DATABASE_URL`, restart Prisma Studio:

```bash
cd server
npm run studio
```

Prisma should now connect to the same database (`mlw`) that you see with psql.

## Connection String Format

```
postgresql://[user]:[password]@[host]:[port]/[database]
```

Your connection:
- User: `ilya`
- Host: `localhost`
- Port: `5432`
- Database: `mlw`

