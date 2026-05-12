/**
 * Service layer — business logic that sits between the HTTP routes and the
 * persistence layer.  All querying, filtering, sorting, pagination, validation,
 * and stats aggregation live here.
 */

import { movieRepository } from '../repository/movie-repository.js';
import { isValidGenre, getGenres } from './genre-service.js';
import { logger } from '../logger.js';
import type {
  Movie,
  MovieInput,
  ListMoviesParams,
  ListMoviesResult,
  Stats,
  ValidationFieldError,
  SortOrder,
  YearBucket,
} from '../types.js';


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MIN_YEAR = 1888;

function getMaxYear(): number {
  return new Date().getFullYear() + 3;
}

/**
 * Returns the comparator used to order movies for a given `SortOrder`.
 */
function movieComparator(sort: SortOrder): (a: Movie, b: Movie) => number {
  switch (sort) {
    case 'rating_desc': return (a, b) => b.rating - a.rating;
    case 'rating_asc':  return (a, b) => a.rating - b.rating;
    case 'year_desc':   return (a, b) => b.year - a.year;
    case 'year_asc':    return (a, b) => a.year - b.year;
    case 'title_asc':   return (a, b) => a.title.localeCompare(b.title);
  }
}

/**
 * Match-quality scorer for the `q` substring search. Operates on
 * already-lowercased strings so the caller can lowercase once per query
 * (and once per movie, via the repository's titleLowerById cache) rather
 * than on every comparator invocation.
 *
 * Lower score = better match.
 *   0 – exact match
 *   1 – title starts with the query
 *   2 – query appears elsewhere in the title
 */
function matchScoreLowered(titleLower: string, queryLower: string): number {
  if (titleLower === queryLower) return 0;
  if (titleLower.startsWith(queryLower)) return 1;
  return 2;
}

// ---------------------------------------------------------------------------
// listMovies
// ---------------------------------------------------------------------------

export function listMovies(params: ListMoviesParams): ListMoviesResult {
  const {
    q,
    genre,
    min_rating = 0,
    year_min,
    year_max,
    sort = 'rating_desc',
    limit = 20,
    offset = 0,
  } = params;

  const genreFilter = genre
    ? Array.isArray(genre) ? genre : [genre]
    : [];
  const hasGenreFilter = genreFilter.length > 0;
  const hasYearFilter = year_min !== undefined || year_max !== undefined;

  // -------------------------------------------------------------------------
  // 1. Resolve the candidate set via the repository indexes (analagous to a DB index).
  //
  // Genre and year both have secondary indexes (byGenre, byYear). When either
  // filter is present we work with movie IDs and intersect, only hydrating to
  // Movie objects after the fact. When neither is present we fall back to a full scan.
  // -------------------------------------------------------------------------
  let candidates: Movie[];
  if (hasGenreFilter && hasYearFilter) {
    const genreIds = movieRepository.findIdsByGenres(genreFilter);
    const yearIds = movieRepository.findIdsByYearRange(year_min, year_max);
    // Iterate the smaller set; membership-check against the larger.
    const [small, large] = genreIds.size <= yearIds.size
      ? [genreIds, yearIds]
      : [yearIds, genreIds];
    const intersection: number[] = [];
    for (const id of small) {
      if (large.has(id)) intersection.push(id);
    }
    candidates = movieRepository.hydrate(intersection);
  } else if (hasGenreFilter) {
    candidates = movieRepository.findByGenres(genreFilter);
  } else if (hasYearFilter) {
    candidates = movieRepository.hydrate(
      movieRepository.findIdsByYearRange(year_min, year_max),
    );
  } else {
    candidates = movieRepository.findAll();
  }

  // Apply the remaining filters in order of descending selectivity so that
  // each subsequent filter operates on the smallest possible set.
  // Genre + year (handled via "indexes") > text search (most selective) > min_rating (least selective)
  let queryLower: string | undefined;
  if (q) {
    queryLower = q.toLowerCase();
    candidates = candidates.filter(m => {
      const titleLower = movieRepository.getTitleLower(m.id) ?? m.title.toLowerCase();
      return titleLower.includes(queryLower!);
    });
  }
  if (min_rating > 0) {
    candidates = candidates.filter(m => m.rating >= min_rating);
  }

  // Sort the candidates. When text query is present, rank by match quality first and use the requested sort as a tiebreaker.
  const cmp = movieComparator(sort);
  if (q && queryLower !== undefined) {
    const ql = queryLower;
    const scored = candidates.map(m => {
      const titleLower = movieRepository.getTitleLower(m.id) ?? m.title.toLowerCase();
      return { movie: m, score: matchScoreLowered(titleLower, ql) };
    });
    scored.sort((a, b) => {
      const scoreDiff = a.score - b.score;
      return scoreDiff !== 0 ? scoreDiff : cmp(a.movie, b.movie);
    });
    candidates = scored.map(s => s.movie);
  } else {
    candidates.sort(cmp);
  }

  const total = candidates.length;

  // Paginate. Limit the limit to 100 and the offset to 0.
  // For a production DB, we would use a cursor-based pagination approach to avoid the need scan unused entries.
  const clampedLimit  = Math.min(Math.max(limit, 1), 100);
  const clampedOffset = Math.max(offset, 0);
  const data = candidates.slice(clampedOffset, clampedOffset + clampedLimit);

  return {
    data,
    total,
    limit: clampedLimit,
    offset: clampedOffset
  };
}

// ---------------------------------------------------------------------------
// getMovie
// ---------------------------------------------------------------------------

export function getMovie(id: number): Movie | undefined {
  return movieRepository.findById(id);
}

// ---------------------------------------------------------------------------
// createMovie — with full validation
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Input validation (shared between createMovie and upsertMovie)
// ---------------------------------------------------------------------------

type ValidateResult =
  | { ok: true; value: MovieInput }
  | { ok: false; errors: ValidationFieldError[] };

function validateMovieInput(input: unknown): ValidateResult {
  const errors: ValidationFieldError[] = [];

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return {
      ok: false,
      errors: [{ field: 'body', message: 'Request body must be a JSON object.' }],
    };
  }

  const raw = input as Record<string, unknown>;

  // title
  const title = raw['title'];
  if (title === undefined || title === null || title === '') {
    errors.push({ field: 'title', message: 'Title is required.' });
  } else if (typeof title !== 'string') {
    errors.push({ field: 'title', message: 'Title must be a string.' });
  } else if (title.length < 1 || title.length > 255) {
    errors.push({ field: 'title', message: 'Title must be between 1 and 255 characters.' });
  }

  // year
  const year = raw['year'];
  if (year === undefined || year === null) {
    errors.push({ field: 'year', message: 'Year is required.' });
  } else if (typeof year !== 'number' || !Number.isInteger(year) || year < MIN_YEAR || year > getMaxYear()) {
    errors.push({ field: 'year', message: `Must be an integer between ${MIN_YEAR} and ${getMaxYear()}.` });
  }

  // rating
  const rating = raw['rating'];
  if (rating === undefined || rating === null) {
    errors.push({ field: 'rating', message: 'Rating is required.' });
  } else if (typeof rating !== 'number' || isNaN(rating)) {
    errors.push({ field: 'rating', message: 'Rating must be a number between 0.0 and 10.0.' });
  } else if (rating < 0 || rating > 10) {
    errors.push({ field: 'rating', message: 'Rating must be a number between 0.0 and 10.0.' });
  }

  // genres
  const genres = raw['genres'];
  if (genres === undefined || genres === null) {
    errors.push({ field: 'genres', message: 'At least one genre is required.' });
  } else if (!Array.isArray(genres) || genres.length === 0) {
    errors.push({ field: 'genres', message: 'At least one genre is required.' });
  } else {
    const invalid = genres.filter(
      (g): g is string => typeof g !== 'string' || !isValidGenre(g),
    );
    if (invalid.length > 0) {
      errors.push({
        field: 'genres',
        message: `Invalid genre(s): ${invalid.join(', ')}. Must be one of: ${getGenres().join(', ')}.`,
      });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      title: title as string,
      year: year as number,
      rating: rating as number,
      genres: genres as string[],
    } satisfies MovieInput,
  };
}

// ---------------------------------------------------------------------------
// createMovie — strict create. Identity collisions surface as a 'duplicate'
// failure so the route can return 409 Conflict.
// ---------------------------------------------------------------------------

export type CreateMovieResult =
  | { ok: true; movie: Movie }
  | { ok: false; kind: 'validation'; errors: ValidationFieldError[] }
  | { ok: false; kind: 'duplicate'; existing: Movie };

export function createMovie(input: unknown): CreateMovieResult {
  const validated = validateMovieInput(input);
  if (!validated.ok) {
    logger.warn({ errors: validated.errors }, 'createMovie validation failed');
    return { ok: false, kind: 'validation', errors: validated.errors };
  }

  const result = movieRepository.add(validated.value);
  if (!result.ok) {
    return { ok: false, kind: 'duplicate', existing: result.existing };
  }

  return { ok: true, movie: result.movie };
}

// ---------------------------------------------------------------------------
// upsertMovie — used by the migration path. Merges new genres into an
// existing movie when the (title, year, rating) identity already exists.
// ---------------------------------------------------------------------------

export type UpsertMovieResult =
  | { ok: true; movie: Movie; created: boolean; addedGenres: string[] }
  | { ok: false; errors: ValidationFieldError[] };

export function upsertMovie(input: unknown): UpsertMovieResult {
  const validated = validateMovieInput(input);
  if (!validated.ok) {
    return { ok: false, errors: validated.errors };
  }

  const { movie, created, addedGenres } = movieRepository.upsert(validated.value);
  return { ok: true, movie, created, addedGenres };
}

// ---------------------------------------------------------------------------
// getStats
// ---------------------------------------------------------------------------

export interface StatsOptions {
  /** How many entries to include in `top_genres`. Default: 5. Max: 100. */
  topGenresLimit?: number;
}

const TOP_GENRES_DEFAULT = 5;
const TOP_GENRES_MAX = 100;

// Method to return aggregate statistics about the movie catalog. In production, against a DB, this
// would be extremely expensive to compute on the fly, so this would be pre-computed and cached.
// In this case, we're using an in-memory store, so we can afford to compute it on the fly.
export function getStats(options: StatsOptions = {}): Stats {
  const limit = Math.min(
    Math.max(options.topGenresLimit ?? TOP_GENRES_DEFAULT, 1),
    TOP_GENRES_MAX,
  );

  const agg = movieRepository.getAggregates();

  if (agg.count === 0) {
    return {
      total: 0,
      avg_rating: 0,
      genre_count: 0,
      min_year: 0,
      max_year: 0,
      top_genres: [],
      by_year: [],
    };
  }

  // Headline metrics: read directly from the running aggregates. No per-call
  // scan of the catalog is needed — counters are maintained incrementally
  // in the repository on every upsert.
  const total = agg.count;
  const avg_rating = Math.round((agg.ratingSum / total) * 100) / 100;
  const min_year = agg.minYear ?? 0;
  const max_year = agg.maxYear ?? 0;
  const genre_count = agg.genreCounts.size;

  const top_genres = Array.from(agg.genreCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));

  // by_year still hydrates Movies (the response includes the per-year movie
  // list), but uses the precomputed byYear index — no re-bucketing required.
  const by_year: YearBucket[] = Array.from(movieRepository.yearBuckets())
    .sort((a, b) => b[0] - a[0])
    .map(([year, ids]) => {
      const movies = movieRepository.hydrate(ids)
        .sort((a, b) => b.rating - a.rating);
      return {
        year,
        count: movies.length,
        movies: movies.map(({ id, title, rating, genres }) => ({
          id, title, rating, genres,
        })),
      };
    });

  return { total, avg_rating, genre_count, min_year, max_year, top_genres, by_year };
}

