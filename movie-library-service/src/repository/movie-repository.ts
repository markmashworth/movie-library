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
 *   byId             — Map<id, Movie>          : the single source of truth.
 *   byGenre          — Map<genre, Set<id>>     : secondary index by genre.
 *                                                Stores IDs only; lookups
 *                                                rehydrate from byId.
 *   byYear           — Map<year, Set<id>>      : secondary index by year.
 *                                                Used by year-range queries.
 *   byIdentity       — Map<identityKey, id>    : dedupe index for upserts.
 *   titleLowerById   — Map<id, string>         : lowercased-title cache for
 *                                                substring search and
 *                                                relevance scoring.
 *
 * Running aggregates (maintained in O(1) per write):
 *   count, ratingSum, minYear, maxYear, genreCounts, yearCounts
 *
 * These let `getAggregates()` answer most of `getStats()` in O(top_genres)
 * rather than the original O(n × g). The service still pays an O(n) walk for
 * the per-year hydration in `by_year`, but everything else is precomputed.
 *
 * The trade-off is intentional: this service is read-heavy (roughly 10:1
 * read:write), so we pay a constant amount of extra bookkeeping on every
 * write to make the hot read paths cheap.
 *
 * All mutation goes through `upsert()` (or `add()`, which is a strict
 * create-only wrapper around it). Both keep every structure in sync.
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

/**
 * Snapshot of running aggregates. Returned by `getAggregates()` so the
 * service layer can answer most of `getStats()` without rescanning every
 * movie. The Maps are read-only views over the live counters — callers must
 * not mutate them.
 */
export interface RepositoryAggregates {
  count: number;
  ratingSum: number;
  /** null when the repository is empty. */
  minYear: number | null;
  /** null when the repository is empty. */
  maxYear: number | null;
  /** genre → number of movies that include this genre. */
  genreCounts: ReadonlyMap<string, number>;
  /** year → number of movies released in this year. */
  yearCounts: ReadonlyMap<number, number>;
}

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

/**
 * Returns a copy of `values` with duplicates removed, preserving the order
 * of first occurrence. Used to sanitise caller-supplied genre lists before
 * they reach the running counters.
 */
function dedupePreservingOrder<T>(values: readonly T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

class MovieRepository {
  /** Primary store: id → Movie (the single source of truth). */
  private readonly byId = new Map<number, Movie>();

  /** Genre index: genre → Set of movie ids. Stores IDs only. */
  private readonly byGenre = new Map<string, Set<number>>();

  /** Year index: year → Set of movie ids. Stores IDs only. */
  private readonly byYear = new Map<number, Set<number>>();

  /** Identity index: (title, year, rating) → id. Used for dedupe lookups. */
  private readonly byIdentity = new Map<string, number>();

  /**
   * Lowercased-title cache: id → titleLower.
   * Computed once on insert and reused by every substring search and
   * relevance score. Stored separately from Movie so the public type stays
   * a clean DTO.
   */
  private readonly titleLowerById = new Map<number, string>();

  // -- Running aggregates (maintained in O(1) per write) --
  private ratingSum = 0;
  private minYear: number | null = null;
  private maxYear: number | null = null;

  /** Movies-per-genre. Incremented per *distinct* genre on insert/merge. */
  private readonly genreCounts = new Map<string, number>();

  /** Movies-per-year. Bumped only when a new movie is inserted. */
  private readonly yearCounts = new Map<number, number>();

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
    return this.hydrate(this.findIdsByGenres(genres));
  }

  /**
   * Returns the set of ids that belong to ANY of the supplied genres
   * (OR logic). Useful when callers want to intersect the result with
   * another index (e.g. byYear) before paying the hydration cost.
   *
   * The returned Set is freshly allocated and safe for the caller to mutate.
   */
  findIdsByGenres(genres: string[]): Set<number> {
    const ids = new Set<number>();
    for (const genre of genres) {
      const bucket = this.byGenre.get(genre);
      if (!bucket) continue;
      for (const id of bucket) {
        ids.add(id);
      }
    }
    return ids;
  }

  /**
   * Returns the set of ids whose `year` falls within the supplied (inclusive)
   * range. `undefined` for either bound means "no constraint on that side".
   *
   * Implementation walks the keys of the `byYear` index, which is bounded by
   * the number of *distinct* release years in the catalog — typically ~100,
   * regardless of how many movies are stored. Per-year buckets are unioned
   * via Set semantics.
   *
   * The returned Set is freshly allocated and safe for the caller to mutate.
   */
  findIdsByYearRange(yearMin?: number, yearMax?: number): Set<number> {
    const ids = new Set<number>();
    for (const [year, bucket] of this.byYear) {
      if (yearMin !== undefined && year < yearMin) continue;
      if (yearMax !== undefined && year > yearMax) continue;
      for (const id of bucket) {
        ids.add(id);
      }
    }
    return ids;
  }

  /** Hydrate an id iterable into Movie objects (skipping any stale ids). */
  hydrate(ids: Iterable<number>): Movie[] {
    const results: Movie[] = [];
    for (const id of ids) {
      const movie = this.byId.get(id);
      if (movie) results.push(movie);
    }
    return results;
  }

  /**
   * Returns the cached lowercased title for `id`, or undefined if the id is
   * unknown. The service uses this for both the `q` substring filter and the
   * match-quality score in listMovies, avoiding redundant toLowerCase() calls
   * during sort.
   */
  getTitleLower(id: number): string | undefined {
    return this.titleLowerById.get(id);
  }

  /**
   * Snapshot of running aggregates. O(1) — the underlying counters are
   * maintained incrementally inside `upsert()`. The Maps are returned as
   * read-only views over the live counters; callers must not mutate them.
   *
   * For `getStats()` this drops the headline computation from O(n × g) to
   * O(top_genres). `by_year` still iterates the byYear index for hydration
   * but skips the bucketing step entirely.
   */
  getAggregates(): RepositoryAggregates {
    return {
      count: this.byId.size,
      ratingSum: this.ratingSum,
      minYear: this.minYear,
      maxYear: this.maxYear,
      genreCounts: this.genreCounts,
      yearCounts: this.yearCounts,
    };
  }

  /**
   * Iterates the year index. Used by `getStats()` to build per-year buckets
   * without re-bucketing every movie on every call. Yields `[year, ids]`
   * tuples where `ids` is a *live* read-only view of the bucket — callers
   * must not mutate.
   */
  yearBuckets(): Iterable<readonly [number, ReadonlySet<number>]> {
    return this.byYear.entries();
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

    // Defensively de-duplicate the input's genres before they touch any
    // counter — otherwise a caller-side mistake (e.g. ['Action', 'Action'])
    // would silently double-count in `genreCounts`.
    const inputGenres = dedupePreservingOrder(input.genres);

    const existingId = this.byIdentity.get(identityKey);
    if (existingId !== undefined) {
      const existing = this.byId.get(existingId);
      // existingId in byIdentity always points to a live byId entry.
      if (!existing) {
        throw new Error(
          `Repository invariant violated: byIdentity points at missing id ${existingId}`,
        );
      }

      const existingGenreSet = new Set(existing.genres);
      const addedGenres = inputGenres.filter((g) => !existingGenreSet.has(g));
      if (addedGenres.length > 0) {
        existing.genres.push(...addedGenres);
        for (const g of addedGenres) {
          this.indexGenre(g, existingId);
          this.genreCounts.set(g, (this.genreCounts.get(g) ?? 0) + 1);
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
      genres: [...inputGenres],
    };
    this.byId.set(id, movie);
    this.byIdentity.set(identityKey, id);
    this.titleLowerById.set(id, movie.title.toLowerCase());

    for (const g of movie.genres) {
      this.indexGenre(g, id);
      this.genreCounts.set(g, (this.genreCounts.get(g) ?? 0) + 1);
    }
    this.indexYear(movie.year, id);
    this.yearCounts.set(movie.year, (this.yearCounts.get(movie.year) ?? 0) + 1);

    this.ratingSum += rating;
    if (this.minYear === null || movie.year < this.minYear) this.minYear = movie.year;
    if (this.maxYear === null || movie.year > this.maxYear) this.maxYear = movie.year;

    return { movie, created: true, addedGenres: [...inputGenres] };
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
    // between this check and the synchronous upsert call (relies on the concurrency note in the file header).
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

  private indexYear(year: number, id: number): void {
    let bucket = this.byYear.get(year);
    if (!bucket) {
      bucket = new Set();
      this.byYear.set(year, bucket);
    }
    bucket.add(id);
  }
}

// Singleton — one shared instance for the lifetime of the process.
export const movieRepository = new MovieRepository();
