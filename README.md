# Movie Library

A Netflix take-home project: an in-memory movie library service with a React-based UI. The service exposes a REST API for browsing and managing movies, and includes a migration endpoint that pulls an existing catalogue from Google Drive into the in-memory store.

## Repo layout

```
movie-library-service/   Express + TypeScript REST API backed by in-memory data structures
movie-library-ui/        React + TypeScript + Vite front-end
artifacts/               Wireframes and protoype used to ideate on the UI design.
```


## Running the backend

See instructions in the `movie-library-service` [README.md](./movie-library-service/README.md) for instructions.

## Running the frontend

See instructions in the `movie-library-ui` [README.md](./movie-library-ui/README.md) for instructions.

## CI pipeline

Workflows can be viewed in GitHub [here](https://github.com/markmashworth/movie-library/actions).

### Running the CI pipeline locally

Install dependencies:

```bash
brew install act
brew install gh
```

Run the pipeline:

```bash
act -s GITHUB_TOKEN="$(gh auth token)"
```

## Design decisions

**Identity tuple for deduplication.** The Drive contains duplicate JSON files where a single movie appears once per genre. Two Drive records are considered the same movie if they share the same title, release year, and rating — the genre is then merged onto the canonical entry rather than creating a duplicate. This rule is intentionally not applied to movies created via the API or UI, where collisions would be surprising to the user.

Why include rating in the deduplication? (title, year) is not guaranteed to be unique ([source](https://movies.stackexchange.com/questions/78328/have-there-ever-been-movies-with-the-same-name-released-in-the-same-year)). In practice, we could use some external source of truth, e.g. [TMDB](https://www.themoviedb.org/), to manage this.

**POST 409 vs migration upsert.** `POST /v1/movies` returns `409 Conflict` when a movie already exists, because a user who explicitly creates a record probably made a mistake if it already exists. The migration endpoint upserts instead, because its whole job is to reconcile an external source of truth. The functionality to edit movie exist in the app's current state.

**In-memory storage.** The store lives entirely in process memory. This satisfies the take-home constraint and keeps the setup dependency-free, but it means all data is lost on restart. A production version would swap the in-memory map for a database (behind the same repository interface!) and swap the p-queues used for migrations to a distributed queue.

**Valid year range.** The minimum valid year is 1888, supposedly the year [the first film](https://en.wikipedia.org/wiki/Roundhay_Garden_Scene) was published. The max valid year is the current year + 3 to allow for upcoming movies to be indexed.

## A non-exhaustive list of assumptions

* All JSON files in the Drive have values for all attributes (true for Drive's current state)
* A movie can span multiple genres (confirmed by duplicate movie entries in Drive)
* If movies share the same title, release year, and rating, then they reference the same movie (referenced above in design decisions)
* All JSON files in the GDrive share the same schema (true for Drive's current state):
* The additional feature for technical users (advanced search) is available to all users via a toggle. If this were a true "admin" feature in a production service, that would probably key off a role claim or something similar.
* It's OK to add additional UI elements not explicitly listed in the requirements (things like number of genres tracked).