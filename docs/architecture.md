# Architecture

_Last verified against Cloudflare and the code on 2026-11-18. See also
[data-model.md](data-model.md), [known-issues.md](known-issues.md) and
[backlog.md](backlog.md)._

## What runs where

```
Phone (Safari/Chrome)
  │
  ├── https://bartender.tawiah.net        Cloudflare Pages project "ai-bartender"
  │     │  (whole host behind Cloudflare Access; login required)
  │     ├── /            React app (dist/ built from src/)
  │     └── /api/*  ───► Worker "bartender-api" (route set in the dashboard)
  │
  └── https://barmenu.tawiah.net          Cloudflare Pages project "barmenu"
        │  (public guest menu, barmenu-public/)
        ├── /            static page + menu.js
        └── /api/menu ─► same Worker; a WAF rule blocks every other /api path

Worker "bartender-api" (worker/)
  ├── KV namespace BARTENDER_KV  ← all data (see data-model.md)
  ├── Google Gemini 2.5 Flash    ← chat + flavor notes (secret GEMINI_API_KEY)
  └── Groq                       ← fallback (secret GROQ_API_KEY, optional)
```

How this was confirmed (2026-11-18):
- `bartender.tawiah.net/*` and `ai-bartender.pages.dev/*` redirect to the
  Access login.
- `barmenu.tawiah.net/api/menu` returns the Worker's JSON. Every other
  `barmenu.tawiah.net/api/*` path returns Cloudflare's "Attention Required"
  block page (a WAF rule).
- `bartender-api.<account>.workers.dev` returns error 1042 (the workers.dev
  route is disabled), and `wrangler.toml` now keeps it disabled.
- The app calls same-origin `/api` (`src/lib/config.js`). Override with the
  build-time variable `VITE_API_BASE` if needed.

**Routes and the WAF rule are managed in the Cloudflare dashboard, not in this
repo.** `wrangler.toml` deliberately has no `route`/`routes` keys, so
`wrangler deploy` leaves them alone. It sets `workers_dev = false` and
`preview_urls = false` so a deploy never re-publishes the API without a login.

## API (worker/worker.js)

| Route | Who can reach it | Purpose |
|---|---|---|
| `GET /api/menu` | Anyone (guest menu) | Active menu items, public fields only |
| `GET/POST /api/inventory` | Access users | Bar inventory list (`rev` conflict check) |
| `GET/POST /api/recipes` | Access users | Favorites (`rev` conflict check) |
| `GET/POST /api/shopping` | Access users | Shopping list (`rev` conflict check) |
| `GET/POST /api/chat-history` | Access users | Chat history (capped at 200) |
| `POST /api/chat` | Access users | AI bartender; may apply `[INVENTORY_UPDATE]` |
| `POST /api/enrich-inventory` | Access users | AI flavor notes (max 5 bottles per call) |
| `GET /api/export` | Access users | Everything in one JSON file |
| `GET /api/backups` | Access users | Lists daily backup keys |
| `GET /api/menu/admin`, `GET/POST/DELETE /api/menu/draft`, `POST /api/menu/publish`, `GET /api/menu/snapshots`, `POST /api/menu/rollback/:v`, `POST /api/menu` (legacy) | Access users | Menu editor |
| `GET/POST /api/favorites` | Access users | Legacy, unused by the app |

The Worker itself does **not** check who is calling. Protection comes from
Cloudflare Access (bartender host) and the WAF rule (barmenu host). CORS only
allows the app's own origins (plus `*` on `GET /api/menu`). Checking the Access
JWT inside the Worker is in [backlog.md](backlog.md).

## Code layout

| Path | What |
|---|---|
| `src/App.jsx` | The app (chat, inventory, favorites; ~4k lines, inline styles) |
| `src/components/` | `MenuEditor`, `BottomTabBar`, `ErrorBoundary` |
| `src/lib/` | Plain-JS logic with unit tests: `api` (safe loading), `saveQueue`, `listSync` (conflict-safe saves), `mergeChanges`, `inventory` (units, pours, undo), `shopping`, `useWakeLock`, `config` |
| `worker/worker.js` | Worker routes and AI prompts |
| `worker/lists.js` | List storage: revisions, daily backups |
| `worker/inventoryUpdate.js` | Parses/applies the chat's `[INVENTORY_UPDATE]` block |
| `barmenu-public/` | Guest menu site (`index.html`, `menu.js`, `_headers`) |
| `public/` | Static files for the app, incl. `_headers` (CSP, caching) and starter data |
| `tests/` | `node --test` unit/Worker tests and `tests/smoke/smoke.mjs` |
| `scripts/` | Icon generation and CSV→inventory conversion (dev only) |
| `assets/` | Print/design/reference files (not deployed) |

## How saving works (why data doesn't get lost)

1. **Loading:** a list counts as loaded only after a successful JSON response.
   On any failure the app shows "Couldn't load … Retry" and never writes. Demo
   data is seeded only on a genuine first run (`stored: false`).
2. **Saving:** every inventory change (−Shot, Make Drink, + Add, import, Edit →
   Save, AI chat update) is saved immediately through one queue, so saves are
   never dropped and rapid taps coalesce. A "Saving… / Not saved · Retry" pill
   shows the status.
3. **Two phones:** saves carry the revision the phone loaded. If the other
   phone saved in between, the Worker answers 409 with its current list. The
   app replays its own pending changes on top and retries. Whole-list saves
   (Edit mode, import) ask before overwriting.
4. **Backups:** before the first save of each UTC day, the previous version is
   copied to `backup:<key>:<date>` (14 days kept). "Export everything" downloads
   one file.

## Develop, test, deploy

```bash
npm install                       # first time (and: npx playwright install chromium)
npm run dev                       # app on :5173, proxies /api to :8787
npm run worker:dev                # Worker locally on :8787 (local KV)
npm test                          # unit + Worker tests (Node built-in runner)
npm run smoke                     # build + phone-size browser test of every flow
```

Deploy (all three use your `wrangler login`):

```bash
npm run worker:deploy             # Worker (wrangler deploy). Deploy this first.
npm run deploy:app                # build + Pages "ai-bartender"
npm run deploy:menu               # Pages "barmenu"
```

If a Pages project is connected to GitHub, merging to `main` also deploys it.
New app ↔ old Worker and old app ↔ new Worker both keep working, so either order
is safe, but deploying the Worker first is cleanest.

### Rollback

- **App / guest menu:** Cloudflare dashboard → Workers & Pages → `ai-bartender`
  (or `barmenu`) → Deployments → pick the previous one → *Rollback*.
- **Worker:** `npx wrangler rollback` (previous version), or dashboard →
  `bartender-api` → Deployments.
- **Data:** see "Restoring data" in [data-model.md](data-model.md).
- **Code:** each fix is its own commit, so `git revert <sha>` undoes one change.
