/**
 * In-memory persistence layer for the movie catalog.
 *
 * Identity model: a movie is uniquely identified by the tuple
 *   (canonicalTitle, year, normalized rating)
 * Two records sharing that tuple but differing only in genre are considered
 * the same movie, and their genre sets are merged.
 *
 * Title canonicalization
 * ----------------------
 * Before a title is used in the identity key it is passed through
 * `canonicalTitle()`, which applies the following rules in order:
 *   1. Unicode NFKC normalization (e.g. collapses compatibility characters).
 *   2. Lowercase (case-insensitive deduplication).
 *   3. Collapse any run of whitespace to a single ASCII space.
 *   4. Trim leading and trailing whitespace.
 *
 * The stored `movie.title` is always the original user-supplied string —
 * canonicalization is applied only when building the identity key.
 *
 * Change in dedupe behavior vs. the previous implementation
 * ----------------------------------------------------------
 * The identity key previously used the raw title string, making matching
 * case-sensitive ("Alien" and "alien" were treated as different movies).
 * It is now case-insensitive — "Alien" and "alien" will deduplicate.
 *
 * Diacritics remain significant: NFKC normalization does not strip accent
 * marks, so "Amelie" and "Amélie" are still treated as distinct movies.
 * If fully diacritic-insensitive matching is ever needed it can be layered
 * on top by adding a Unicode decomposition + diacritic-strip step after
 * NFKC normalization.
 *
 * Data structures:
 *   byId       — Map<id, Movie>          : the single source of truth.
 *   byGenre    — Map<genre, Set<id>>     : secondary index — IDs only, never
 *                                          a copy of the Movie. Lookups
 *                                          rehydrate from byId.
 *   byIdentity — Map<identityKey, id>    : dedupe index for the upsert path.
 *
 * All mutation goes through `upsert()` (or `add()`, which is a strict
 * create-only wrapper around it). Both keep all three structures in sync.
 *
 * Concurrency note
 * ----------------
 * Both `upsert()` and `add()` are *fully synchronous* — there are no `await`s
 * between the identity lookup and the index writes. Because Node.js runs JS
 * on a single thread, the entire check-then-write sequence is therefore
 * atomic relative to other JS code: two callers from different async tasks
 * (e.g. parallel migration workers) cannot interleave inside a single
 * upsert call. The second caller for the same identity will always observe
 * the first caller's write and merge into it.
 *
 * This invariant breaks the moment any I/O is added inside a write path —
 * if you ever introduce one, you must also introduce explicit per-identity
 * locking.
 */

import type { Movie, MovieInput } from '../types.js';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface UpsertResult {
  movie: Movie;
  /** True if a brand-new record was inserted; false if an existing one was merged into. */
  created: boolean;
  /** Genres that were newly added by this upsert (empty when no merge happened). */
  addedGenres: string[];
}

export type AddResult =
  | { ok: true; movie: Movie }
  | { ok: false; reason: 'duplicate'; existing: Movie };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeRating(rating: number): number {
  return Math.round(rating * 10) / 10;
}

/**
 * Returns a canonical form of `title` used exclusively for identity-key
 * construction. The stored title is never mutated.
 *
 * Rules (applied in order):
 *   1. Unicode NFKC normalization.
 *   2. Lowercase.
 *   3. Collapse runs of whitespace to a single space.
 *   4. Trim leading/trailing whitespace.
 */
function canonicalTitle(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function makeIdentityKey(title: string, year: number, normalizedRating: number): string {
  // Pipe is safe because pipes are not common in movie titles. If they were,
  // any unambiguous separator (e.g. ) would do.
  return `${canonicalTitle(title)}|${year}|${normalizedRating.toFixed(1)}`;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

class MovieRepository {
  /** Primary store: id → Movie (the single source of truth). */
  private readonly byId = new Map<number, Movie>();

  /** Genre index: genre → Set of movie ids. Stores IDs only. */
  private readonly byGenre = new Map<string, Set<number>>();

  /** Identity index: (title, year, rating) → id. Used for dedupe lookups. */
  private readonly byIdentity = new Map<string, number>();

  private nextId = 1;

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  findById(id: number): Movie | undefined {
    return this.byId.get(id);
  }

  /** Returns a shallow copy of every movie in insertion order. */
  findAll(): Movie[] {
    return Array.from(this.byId.values());
  }

  /** Returns all movies that belong to any of the supplied genres (OR logic). */
  findByGenres(genres: string[]): Movie[] {
    const ids = new Set<number>();
    for (const genre of genres) {
      const bucket = this.byGenre.get(genre);
      if (bucket) {
        for (const id of bucket) {
          ids.add(id);
        }
      }
    }
    const results: Movie[] = [];
    for (const id of ids) {
      const movie = this.byId.get(id);
      if (movie) results.push(movie);
    }
    return results;
  }

  /**
   * Look up a movie by its identity tuple. Useful for callers (e.g. POST
   * /movies on a 409) that need to surface the conflicting record.
   */
  findByIdentity(title: string, year: number, rating: number): Movie | undefined {
    const id = this.byIdentity.get(
      makeIdentityKey(title, year, normalizeRating(rating)),
    );
    return id !== undefined ? this.byId.get(id) : undefined;
  }

  get size(): number {
    return this.byId.size;
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  /**
   * Insert a new movie or merge new genres into an existing movie with the
   * same (title, year, rating) identity. See the concurrency note in the
   * file header — this method is intentionally synchronous so that
   * concurrent callers from different async tasks cannot race.
   */
  upsert(input: MovieInput): UpsertResult {
    const rating = normalizeRating(input.rating);
    const identityKey = makeIdentityKey(input.title, input.year, rating);

    const existingId = this.byIdentity.get(identityKey);
    if (existingId !== undefined) {
      const existing = this.byId.get(existingId);
      // existingId in byIdentity always points to a live byId entry.
      if (!existing) {
        throw new Error(
          `Repository invariant violated: byIdentity points at missing id ${existingId}`,
        );
      }

      const addedGenres = input.genres.filter((g) => !existing.genres.includes(g));
      if (addedGenres.length > 0) {
        existing.genres.push(...addedGenres);
        for (const g of addedGenres) {
          this.indexGenre(g, existingId);
        }
      }
      return { movie: existing, created: false, addedGenres };
    }

    // Brand-new movie.
    const id = this.nextId++;
    const movie: Movie = {
      id,
      title: input.title,
      year: input.year,
      rating,
      genres: [...input.genres],
    };
    this.byId.set(id, movie);
    this.byIdentity.set(identityKey, id);
    for (const g of movie.genres) {
      this.indexGenre(g, id);
    }
    return { movie, created: true, addedGenres: [...input.genres] };
  }

  /**
   * Strict create — refuses to mutate an existing movie. POST /movies uses
   * this to surface a 409 on identity collisions rather than silently
   * merging genres into someone else's record.
   *
   * Synchronous (and therefore atomic) for the same reason as upsert.
   */
  add(input: MovieInput): AddResult {
    const rating = normalizeRating(input.rating);
    const identityKey = makeIdentityKey(input.title, input.year, rating);
    const existingId = this.byIdentity.get(identityKey);
    if (existingId !== undefined) {
      const existing = this.byId.get(existingId);
      if (!existing) {
        throw new Error(
          `Repository invariant violated: byIdentity points at missing id ${existingId}`,
        );
      }
      return { ok: false, reason: 'duplicate', existing };
    }
    // Safe to delegate — upsert will take the create path because we just
    // confirmed no identity collision exists, and no other code can run
    // between this check and the synchronous upsert call.
    const { movie } = this.upsert(input);
    return { ok: true, movie };
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private indexGenre(genre: string, id: number): void {
    let bucket = this.byGenre.get(genre);
    if (!bucket) {
      bucket = new Set();
      this.byGenre.set(genre, bucket);
    }
    bucket.add(id);
  }
}

// Singleton — one shared instance for the lifetime of the process.
export const movieRepository = new MovieRepository();
