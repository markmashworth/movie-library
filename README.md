# Movie Library

A Netflix take-home project: an in-memory movie library service with a companion React UI. The service exposes a REST API for browsing and managing movies, and includes a migration endpoint that pulls an existing catalogue from Google Drive into the in-memory store.

## Repo layout

```
movie-library-service/   Express + TypeScript REST API (in-memory store)
movie-library-ui/        React + Vite front-end
```

## Prerequisites

Node **v22.22.0** (see `.nvmrc` — use `nvm use` to switch automatically).

## Running the backend

```bash
cd movie-library-service
npm install
```

Create `.env.local` in `movie-library-service/` with the following variables:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=...
GOOGLE_REFRESH_TOKEN=...
```

Then start the server:

```bash
npm run start:local
```

The service listens on `http://localhost:8080`. Swagger API docs are available at [`/docs`](http://localhost:8080/docs).

### Seeding / Migrating data

To pull the Google Drive catalogue into the running service, either run the seed script:

```bash
# from movie-library-service/
npm run seed
```

or call the migration endpoint directly:

```bash
curl -X POST http://localhost:8080/v1/migration \
  -H 'Content-Type: application/json' \
  -d '{"rootFolderId":"1Z-Bqt69UgrGkwo0ArjHaNrA7uUmUm2r6"}'
```

## Running the frontend

```bash
cd movie-library-ui
npm install
npm run dev
```

## Design decisions

**Identity tuple for deduplication.** The Drive contains duplicate JSON files where a single movie appears once per genre. Two Drive records are considered the same movie if they share the same title, release year, and rating — the genre is then merged onto the canonical entry rather than creating a duplicate. This rule is intentionally not applied to movies created via the API or UI, where collisions would be surprising to the user.

**POST 409 vs migration upsert.** `POST /v1/movies` returns `409 Conflict` when a movie already exists, because a user who explicitly creates a record probably made a mistake if it already exists. The migration endpoint upserts instead, because its whole job is to reconcile an external source of truth — erroring on every pre-existing entry would make reruns useless.

**In-memory storage.** The store lives entirely in process memory. This satisfies the take-home constraint and keeps the setup dependency-free, but it means all data is lost on restart. A production version would swap the in-memory map for a database behind the same repository interface.

## Assumptions

* All JSON files in the Drive have values for all attributes (true for Drive's current state)
* A movie can span multiple genres (confirmed by duplicate movie entries in Drive)
* If movies share the same title, release year, and rating, then they reference the same movie. This logic will NOT apply to movies created via the API/ / UI (i.e. updating an existing movie with a new genre) as I think that would be a confusing user experience.
* All JSON files in the GDrive share the same schema:

```
{
    title: string,
    genre: string,
    year: integer,
    rating: number,
}
```
