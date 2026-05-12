# movie-library-service

Express + TypeScript REST API that manages a personal movie catalog and supports bulk migration of movie data from Google Drive.

## Running locally

Install node if not already installed.

Install dependencies:

```bash
npm install
```

Create `.env.local` in `movie-library-service/` with the following variables (only required if running a remote migration!):

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=...
GOOGLE_REFRESH_TOKEN=...
```

Start the app:

```bash
# Start the server (reads credentials from .env.local)
npm run start:local
```

The API is available at `http://localhost:8080/api/v1` and Swagger UI at `http://localhost:8080/docs`.

The service listens on `http://localhost:8080`. Swagger API docs are available at [`/docs`](http://localhost:8080/docs).

### Seeding / Migrating data

To pull a movie catalogue into the running service, either run the seed script, which uses some locally stored data:

```bash
npm run seed
```

or call the migration endpoint directly to fetch remote data from Google Drive:

```bash
curl -X POST http://localhost:8080/v1/migration \
  -H 'Content-Type: application/json' \
  -d '{"rootFolderId":"1Z-Bqt69UgrGkwo0ArjHaNrA7uUmUm2r6"}'
```

---

## Running tests

Tests use [Vitest](https://vitest.dev/). There are two separate test suites:

### Unit tests

Unit tests live alongside their source modules in `src/` (e.g. `src/routes/movies.test.ts`).

```bash
# Single run
npm test

# Watch mode (re-runs on file changes)
npm run test:watch

# Single run with coverage report
npm run test:coverage
```

### Integration tests

Integration tests live in `src/integration/` and test the actual service. The test suite spawns `tsx index.ts` as a child process, waits for the server to become ready, then makes HTTP requests against it.

There is currently only a minimal integration test that tests the `/heartbeat` endpoint to verify the app can start up.

```bash
npm run test:integration
```

> **Note:** Port 8080 must be free when running integration tests. Stop any locally running instance of the service first.

---

## Project structure

The service follows a standard three-tier layout inside `src/`: **routes → services → repository**.

- **`src/routes/`** — Express routers, one file per resource. Responsible for parsing and validating request parameters and delegating to the service layer.
- **`src/service/`** — Business logic: filtering, sorting, pagination, stats aggregation, input validation, and the Google Drive migration orchestration.
- **`src/repository/`** — In-memory persistence. Maintains secondary indexes for genre filtering and identity-based deduplication.
- **`src/clients/`** — OAuth2 Google Drive client used by the migration service.
- **`scripts/`** — One-off utilities for seeding the store and exploring the source data.

---

## API routes

All routes are mounted under `/api/v1`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/movies` | List, search, and filter movies with pagination |
| `GET` | `/movies/stats` | Pre-aggregated catalog statistics |
| `GET` | `/movies/:id` | Fetch a single movie |
| `POST` | `/movies` | Add a new movie (idempotent via `Idempotency-Key` header) |
| `GET` | `/genres` | Canonical sorted genre list |
| `POST` | `/genres` | Add a new genre |
| `POST` | `/migration` | Kick off a Google Drive migration (fire-and-forget, returns 202) |
| `GET` | `/heartbeat` | Health check |

## Idempotency

`POST /movies` and `POST /migration` both use the `express-idempotency` middleware. Clients should generate a UUID per logical request and send it as the `Idempotency-Key` header. The server caches and replays the first response for the same key, preventing duplicate movies from accidental double-submits.

---

## Limitations (take-home project)

This project was built as a take-home interview exercise. Several intentional simplifications were made to keep the scope manageable:

**In-memory data store** — there is no external database. All movies and genres live in `MovieRepository`'s in-memory `Map` structures and are lost when the process exits. In production this would be replaced with a persistent database (e.g. Postgres).

**No LocalStack or AWS emulation** — the project does not use LocalStack. There are no real SQS queues, or any other AWS-managed infrastructure.

**In-process migration queues** — the migration uses `p-queue` (two in-process queues) instead of a distributed messaging system. In a production service this design would have significant drawbacks:

- A server restart mid-migration loses all queued and in-flight work.
- There is no persistent retry mechanism. Failed file downloads or parse errors are simply logged and skipped; there is no dead-letter queue (DLQ) to capture them for later inspection or replay.
- Scaling to multiple service instances would require external coordination — the current design has no concept of distributed locking or task ownership.

In production, the migration would be modelled as a durable workflow backed by a distributed message broker (e.g. a queue-backed worker fleet). Each folder and each file would become a discrete message, giving the system automatic retries, configurable back-off, per-message visibility timeouts, and a DLQ for poison-pill items that consistently fail.

**No authentication or authorisation** — all endpoints are open. A real service would require OAuth2 or API key validation before allowing writes.

**Single process** — there is no clustering, load balancing, or horizontal scaling.

## Scripts

The directory `/scripts` contains scripts for exploratory data analysis.

`exploratory-data-analysis.js` will scrape the Google Drive and output all JSON files into `/scripts/data/movie.csv`.

It will expect a `credentials.json` containing the following structure:
```json
{
  "installed": {
    "client_id": "<client_id>.apps.googleusercontent.com",
    "project_id": "<project_id>",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_secret": "<client_secret>",
    "redirect_uris": [
      "<allowlisted_redirect_uri_from_project>"
    ]
  }
}

```

and `token.json` with the following structure:

```json
{
  "access_token": "<access_token>",
  "refresh_token": "<refresh_token>",
  "scope": "https://www.googleapis.com/auth/drive.readonly",
  "token_type": "Bearer",
  "refresh_token_expires_in": <expiration_time>,
  "expiry_date": <expiry_date>
}
```

`seed.js` will take the `movies.csv` and insert entries into the service. This can be used to sidestep remote calls
to Google Drive for local development.