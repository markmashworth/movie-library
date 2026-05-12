# movie-library-ui

React + TypeScript + Vite frontend for the Movie Library catalog. Communicates exclusively with `movie-library-service` via a local Vite dev-proxy.

## Running locally

Install dependencies:

```bash
npm install
```

Run the app:

```bash
# Requires movie-library-service to be running on port 8080
nvm use && npm run dev
```

The UI is served at `http://localhost:3000`. All api requests are sent to `http://localhost:8080` by Vite (configured in `vite.config.ts`), so no port is ever hard-coded in UI code.

---

## Running tests

### Unit tests

Unit tests use [Vitest](https://vitest.dev/) with jsdom and React Testing Library. Test files live alongside source code in `src/` (e.g. `movie-library-service.test.ts`).

```bash
# Watch mode (re-runs on file changes)
npm test

# Single run (useful for CI)
npm run test:run

# Single run with coverage report
npm run test:coverage
```

### Playwright (e2e) tests

End-to-end tests use [Playwright](https://playwright.dev/) and live in the `e2e/` directory. Playwright will automatically start the Vite dev server on `http://localhost:3000` before running — if the server is already running it will be reused. The tests also require `movie-library-service` to be running on port 8080 (see the service README).

```bash
# Run all e2e tests headlessly
npm run test:e2e

# Run with the Playwright interactive UI (useful for debugging)
npm run test:e2e:ui
```

A HTML report is generated in `playwright-report/` after each run and opened automatically when using `--ui` mode.

---

## Project structure

All application code lives in `src/`.

- **`App.tsx`** — root component; owns all remote data and passes it down as props. No child component fetches independently.
- **`movie-library-service.ts`** — centralised API client. All `fetch` calls live here; no component ever calls `fetch` directly.
- **`components/`** — UI components covering the rest of the frontend.

