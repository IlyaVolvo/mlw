# Offline-First Polywordlot

Create a fully offline-capable version of Polywordlot that stores all game data in IndexedDB, requires no login, and is controlled by a build-time flag — while keeping the existing online mode intact with minimal codebase divergence.

---

## Architecture Overview

```
┌─ Client (PWA) ──────────────────────────────────┐
│  React App (same UI)                             │
│    ↓                                             │
│  apiClient  ←──  build flag: VITE_OFFLINE_MODE   │
│    ├─ online  → RemoteApiClient (current)        │
│    └─ offline → LocalApiClient (IndexedDB)       │
│                                                  │
│  Service Worker: cache-first, auto-update        │
│  Dictionary Cache: IndexedDB / Cache API         │
└──────────────────────────────────────────────────┘
         │  fire-and-forget analytics POST
         ▼
┌─ Render Server (minimal) ────────────────────────┐
│  Express: serves static build + 3 API endpoints  │
│  SQLite (persistent disk): access_log, events    │
│  No auth, no user management                     │
└──────────────────────────────────────────────────┘
```

**Mode selection:** `VITE_OFFLINE_MODE=true` at build time. The same React codebase is used; only the `apiClient` export changes. The server-side Express uses `OFFLINE_MODE=true` env var to skip auth routes and use SQLite.

---

## Implementation Steps

### Phase 1: Data Provider Abstraction (~core change)

**1.1 Define `ApiClientInterface`** in `src/api/types.ts`
- Extract all public method signatures from the current `ApiClient` class into a TypeScript interface.
- Both online and offline clients implement this interface.

**1.2 Create `LocalApiClient`** in `src/api/localClient.ts`
- Implements `ApiClientInterface` using IndexedDB (via a thin wrapper).
- **IndexedDB schema** mirrors the PostgreSQL tables:
  - `games` store — keyed by auto-increment id, indexed by `[userId, gameDate]`, `[userId, language, wordLength]`
  - `user_preferences` store — keyed by userId
- `userId` is always `0`.
- Auth methods (`register`, `login`, `getCurrentUser`, `forgotPassword`, `resetPassword`) return hardcoded/no-op responses:
  - `getCurrentUser()` → `{ user: { id: 0, email: 'local', verified: lastSeenRelease } }`
- `sendFeedback()` → opens `mailto:` link (hardcoded address, e.g. from `VITE_FEEDBACK_EMAIL` env).
- `updateReleaseSeen()` → stores release index in IndexedDB/localStorage.
- Game CRUD methods (`getCurrentGame`, `getCompletedGame`, `saveGame`, `getHistory`, `getBulkGames`) query IndexedDB with the same filtering logic as the server routes.
- **Analytics beacon:** After `saveGame` (when complete) and on config switches, fire-and-forget `POST /api/analytics/event` to the server (best-effort, no error handling).

**1.3 Update `src/api/client.ts`** — conditional export
```ts
import { LocalApiClient } from './localClient';
import { RemoteApiClient } from './remoteClient'; // rename current class

const isOffline = import.meta.env.VITE_OFFLINE_MODE === 'true';
export const apiClient: ApiClientInterface = isOffline
  ? new LocalApiClient()
  : new RemoteApiClient();
```
The current `ApiClient` class gets renamed to `RemoteApiClient` and moved to `src/api/remoteClient.ts`. The export stays the same — components don't change.

### Phase 2: App.tsx Offline Bypass

**2.1 Skip auth flow in offline mode**
- In `App.tsx`, when `VITE_OFFLINE_MODE`, auto-set user to `{ id: 0, email: 'local', verified: ... }` instead of checking token/showing login.
- Hide Login/Register/ForgotPassword/ResetPassword components entirely.

**2.2 Replace Logout with Export/Import**
- `Game.tsx` currently shows a logout button. In offline mode, replace it with an Export/Import dropdown/menu.
- Add a small "offline" indicator badge near the settings area.

### Phase 3: Export / Import

**3.1 Export** — `src/utils/dbExport.ts`
- Read all IndexedDB stores (`games`, `user_preferences`).
- Produce a JSON blob: `{ version: 1, exportedAt: ISO, games: [...], preferences: {...} }`.
- Trigger browser download as `.json` file.

**3.2 Import** — same file
- Accept `.json` file upload via `<input type="file">`.
- Validate structure + show warning: "This will overwrite all local data. Continue?"
- Clear existing stores, write imported data.

### Phase 4: PWA + Auto-Update

**4.1 Service Worker** — `public/sw.js` (or Vite PWA plugin)
- Cache-first for static assets (JS, CSS, HTML).
- On activation, check for new version via a `/version.json` (contains git SHA or build timestamp).
- If new version detected, update cache and notify user (optional toast: "Updated!").

**4.2 Dictionary caching**
- Dictionaries are currently fetched from `/dict/...` via `languageLoader.ts`.
- The service worker caches these responses. On each visit, do a background revalidation (`stale-while-revalidate`).
- First visit requires connectivity to seed the cache. Subsequent visits work fully offline.

**4.3 `public/version.json`** — generated at build time
- Contains `{ sha: "<git-hash>", buildTime: "<ISO>", dictHash: "<hash-of-dict-folder>" }`.
- Service worker compares stored vs. fetched version to decide on update.

### Phase 5: Render Server (Minimal)

**5.1 Server mode switch** in `server/src/index.ts`
- `OFFLINE_MODE=true` env var:
  - Skip auth routes registration.
  - Skip PostgreSQL pool creation.
  - Serve `dist/` as static files (the Vite build output).
  - Register analytics routes only.

**5.2 Analytics endpoints** — `server/src/routes/analytics.ts`
- `POST /api/analytics/event` — receives `{ type: 'game_complete' | 'config_switch', language, wordLength, ... }`, stores in SQLite `events` table.
- `GET /api/analytics/stats` — returns aggregated stats (unique IPs/day, events/day, etc.). Optionally protected by a simple API key.

**5.3 Access logging middleware** — `server/src/middleware/accessLog.ts`
- Logs every request to SQLite `access_log` table: `(id, timestamp, ip, method, path, user_agent, status_code)`.
- Query endpoint: `GET /api/analytics/access?groupBy=day` → returns `[{ date, unique_ips, total_requests }]`.

**5.4 SQLite setup** — `server/src/db/sqlite.ts`
- Uses `better-sqlite3` (synchronous, simple, no external service needed).
- Creates tables on startup: `access_log`, `events`.
- Stored on Render persistent disk volume (e.g. `/data/analytics.db`).

### Phase 6: Build & Deploy Configuration

**6.1 Vite config update**
- Pass `VITE_OFFLINE_MODE` and `VITE_FEEDBACK_EMAIL` as define variables.
- Generate `version.json` in build step.

**6.2 Render deployment**
- `render.yaml` blueprint: web service running the Express server.
- Build command: `npm run build` (builds both Vite frontend + server).
- Start command: `OFFLINE_MODE=true node server/dist/index.js`.
- Persistent disk mounted at `/data` for SQLite.

**6.3 NPM scripts** — add to `package.json`
- `"build:offline": "VITE_OFFLINE_MODE=true vite build && cd server && npm run build"`
- `"start:offline": "OFFLINE_MODE=true node server/dist/index.js"`

---

## Complexity Assessment

| Area | Effort | Notes |
|------|--------|-------|
| `ApiClientInterface` extraction | Low | Mechanical — extract types from existing class |
| `LocalApiClient` (IndexedDB) | **Medium-High** | ~200-300 lines; must replicate all query logic client-side |
| `App.tsx` offline bypass | Low | ~20 lines changed |
| Export/Import UI + logic | Low-Medium | ~100 lines new, simple modal |
| Service Worker + caching | Medium | ~150 lines; dictionary + asset caching strategy |
| `version.json` generation | Low | Build script addition |
| Render server (analytics) | Medium | New SQLite setup + 3 endpoints + middleware |
| Logout → Export/Import swap | Low | Conditional render in Game.tsx |

**Overall: Medium complexity.** ~15 files touched/created. The biggest piece is `LocalApiClient` which must faithfully replicate the server query logic in IndexedDB. The rest is straightforward plumbing.

**Estimated files:**
- **New:** `src/api/types.ts`, `src/api/localClient.ts`, `src/api/remoteClient.ts`, `src/utils/dbExport.ts`, `src/utils/indexedDb.ts`, `public/sw.js`, `server/src/db/sqlite.ts`, `server/src/routes/analytics.ts`, `server/src/middleware/accessLog.ts`, `render.yaml`
- **Modified:** `src/api/client.ts`, `src/components/App.tsx`, `src/components/Game.tsx`, `vite.config.ts`, `package.json`, `server/package.json`, `server/src/index.ts`

---

## What Stays the Same
- All game logic (`gameLogic.ts`, `dailyWord.ts`, `characterNormalization.ts`, etc.)
- All UI components (Game, GameBoard, Keyboard, Statistics, Settings, Calendar, Tutorials)
- Dictionary structure and loading (`languageLoader.ts` — fetches work the same, service worker handles caching)
- localStorage usage (preferences, tutorial flags, game state cache)
- The entire online mode (Vercel deployment, PostgreSQL, auth) — untouched when `VITE_OFFLINE_MODE` is not set
