# Polywordlot API Reference

Base path: `/api`  
Auth: protected endpoints require `Authorization: Bearer <token>`

## Response conventions

- Success responses are JSON payloads specific to each endpoint.
- Error responses typically use:
  - `400` invalid input
  - `401` unauthorized / invalid token
  - `404` missing resource
  - `405` method not allowed
  - `500` server error
- Most errors return `{ "error": "message" }`.

## Auth endpoints

### `POST /auth/register`
Create a new user and return JWT token.

Request body:

```json
{
  "email": "user@example.com",
  "password": "secret123",
  "lastReleaseIndex": 0
}
```

Notes:
- `email` and `password` are required.
- `password` minimum length is 6.
- `lastReleaseIndex` is optional and maps to user `verified` field.

Success response:

```json
{
  "token": "<jwt>",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "verified": 0
  }
}
```

### `POST /auth/login`
Authenticate user and return JWT token.

Request body:

```json
{
  "email": "user@example.com",
  "password": "secret123"
}
```

Success response:

```json
{
  "token": "<jwt>",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "verified": 0
  }
}
```

### `GET /auth/me` (protected)
Return current authenticated user.

Success response:

```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "created_at": "2026-02-27T12:34:56.000Z",
    "verified": 0
  }
}
```

### `POST /auth/forgot-password`
Create password reset token and send email.

Request body:

```json
{
  "email": "user@example.com",
  "baseUrl": "https://your-app.example.com"
}
```

Notes:
- Always returns a success-style message to avoid revealing whether the email exists.
- `baseUrl` is optional and used to build reset link.

Success response:

```json
{
  "message": "If the email exists, a password reset link has been sent"
}
```

### `POST /auth/reset-password`
Reset password using token from email.

Request body:

```json
{
  "token": "<reset-token>",
  "password": "newSecret123"
}
```

Success response:

```json
{
  "message": "Password reset successful"
}
```

### `POST /auth/send-feedback` (protected)
Send user feedback email to configured recipient.

Request body:

```json
{
  "comments": "Your app is great."
}
```

Success response:

```json
{
  "success": true,
  "message": "Feedback sent successfully"
}
```

### `GET /auth/preferences` (protected)
Get saved language preferences.

Success response:

```json
{
  "selectedLanguages": ["en", "fr"]
}
```

If not set:

```json
{
  "selectedLanguages": null
}
```

### `POST /auth/preferences` (protected)
Save selected languages and/or release index in one call.

Request body (either field can be omitted):

```json
{
  "selectedLanguages": ["en", "fr"],
  "lastSeenReleaseIndex": 3
}
```

Notes:
- `selectedLanguages: null` clears to default/all behavior.
- `lastSeenReleaseIndex` updates the user `verified` value.

Success response:

```json
{
  "success": true
}
```

## Game endpoints

### `GET /games` (protected)
Get a single latest game matching filters.  
Used for both incomplete and completed retrieval via `isComplete`.

Query params:
- `isComplete`: `0|1` (or `false|true`)
- `language` (optional)
- `wordLength` (optional)
- `gameDate` (optional, `YYYY-MM-DD` for daily mode)
- `isRandomMode` (optional, `true|false`)
- `wordSeed` (optional)

Success response:

```json
{
  "game": {
    "id": 10,
    "user_id": 1,
    "language": "en",
    "word_length": 5,
    "target_word": "apple",
    "game_date": "2026-02-27",
    "is_random_mode": 0,
    "word_seed": null,
    "is_complete": 1,
    "created_at": "2026-02-27T12:00:00.000Z",
    "completed_at": "2026-02-27T12:02:00.000Z",
    "guesses": [{ "word": "ample", "evaluations": [] }]
  }
}
```

If no game is found:

```json
{
  "game": null
}
```

### `GET /games/history` (protected)
Get list of non-random games for history/statistics.

Query params:
- `language` (optional)
- `wordLength` (optional)
- `limit` (optional, default `100`)

Success response:

```json
{
  "games": [
    {
      "id": 10,
      "userId": 1,
      "isRandomMode": false,
      "gameStarted": "2026-02-27T12:00:00.000Z",
      "gameEnded": "2026-02-27T12:02:00.000Z",
      "game_date": "2026-02-27",
      "language": "en",
      "wordLength": 5,
      "targetWord": "apple",
      "guesses": [{ "word": "ample", "evaluations": [] }],
      "isComplete": true
    }
  ]
}
```

Field semantics in the example above:
- `targetWord`: the answer for that stored game day (`game_date` + `language` + `wordLength`).
- `guesses`: the exact submitted guesses saved for that game, in chronological order. Each item is `{ word, evaluations }`; `evaluations` is currently returned as an empty array placeholder in this endpoint.
- `isComplete`: indicates whether the game has been finalized (`true` = finished, won or lost; `false` = in-progress snapshot).
- `isWon` and `guessesCount` are intentionally not returned by this endpoint. They must be derived client-side from `targetWord` and `guesses` (using current normalization rules).

### `GET /games/bulk` (protected)
Get non-random games for a date range, grouped by `game_date`.

Query params (required):
- `language`
- `wordLength`
- `startDate` (`YYYY-MM-DD`)
- `endDate` (`YYYY-MM-DD`)

Success response:

```json
{
  "games": {
    "2026-02-27": {
      "id": 10,
      "user_id": 1,
      "language": "en",
      "word_length": 5,
      "target_word": "apple",
      "game_date": "2026-02-27",
      "is_random_mode": 0,
      "word_seed": null,
      "is_complete": 1,
      "created_at": "2026-02-27T12:00:00.000Z",
      "completed_at": "2026-02-27T12:02:00.000Z",
      "guesses": [{ "word": "ample", "evaluations": [] }]
    }
  }
}
```

### `POST /games/save` (protected)
Create or update a game record for user/date/mode/seed combination.

Request body:

```json
{
  "language": "en",
  "wordLength": 5,
  "targetWord": "apple",
  "gameDate": "2026-02-27",
  "isRandomMode": false,
  "wordSeed": null,
  "guesses": [{ "word": "ample", "evaluations": [] }],
  "isComplete": true,
  "isWon": false
}
```

Notes:
- Required fields: `language`, `wordLength`, `targetWord`, `gameDate`.
- `isWon` is accepted in request but server currently derives win status from saved guesses/target in read endpoints.

Success response:

```json
{
  "success": true,
  "gameId": 10
}
```

