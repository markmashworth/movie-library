# movie-library-ui

React + TypeScript + Vite frontend for the Movie Library catalog. Communicates exclusively with `movie-library-service` via a local Vite dev-proxy.

## Running locally

```bash
# Requires movie-library-service to be running on port 8080
nvm use 26 && npm run dev
```

The UI is served at `http://localhost:3000`. All `/api` requests are transparently proxied to `http://localhost:8080` by Vite (configured in `vite.config.ts`), so no port is ever hard-coded in UI code.

---

## Project structure

All application code lives in `src/`.

- **`App.tsx`** — root component; owns all remote data and passes it down as props. No child component fetches independently.
- **`movie-library-service.ts`** — centralised API client. All `fetch` calls live here; no component ever calls `fetch` directly.
- **`components/`** — UI components covering the topbar, stat tiles, filter panel, movie leaderboard, genre and year breakdowns, the add-movie modal, and toast notifications.

