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

function sortMovies(movies: Movie[], sort: SortOrder): Movie[] {
  return [...movies].sort((a, b) => {
    switch (sort) {
      case 'rating_desc': return b.rating - a.rating;
      case 'rating_asc':  return a.rating - b.rating;
      case 'year_desc':   return b.year - a.year;
      case 'year_asc':    return a.year - b.year;
      case 'title_asc':   return a.title.localeCompare(b.title);
    }
  });
}

/**
 * Naive match-quality scorer for the `q` substring search.
 * Lower score = better match.
 *   0 – exact match (case-insensitive)
 *   1 – title starts with the query
 *   2 – query appears elsewhere in the title
 */
function matchScore(title: string, q: string): number {
  const lower = title.toLowerCase();
  const query = q.toLowerCase();
  if (lower === query) return 0;
  if (lower.startsWith(query)) return 1;
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

  // 1. Start with the genre-filtered set (or all movies).
  const genreFilter = genre
    ? Array.isArray(genre) ? genre : [genre]
    : [];

  let candidates: Movie[] =
    genreFilter.length > 0
      ? movieRepository.findByGenres(genreFilter)
      : movieRepository.findAll();

  // 2. Apply remaining filters in order of descending selectivity so that each
  //    subsequent filter operates on the smallest possible set.
  //
  //    Order rationale:
  //    a) Genre — already handled above at the repository level via the byGenre
  //       secondary index; no per-movie iteration needed, so it's free.
  //    b) `q` (title text search) — typically the most selective filter: a
  //       specific substring like "alien" matches only a handful of titles.
  //       It's also the most expensive per item (toLowerCase + includes), so
  //       running it first shrinks the set that cheaper filters must scan.
  //    c) `min_rating` — a high threshold (e.g. 7.0) eliminates a substantial
  //       fraction of the catalog in a single cheap numeric comparison.
  //    d) `year_min` / `year_max` — year ranges tend to be broad (spanning
  //       multiple decades), making them the least selective filter. They are
  //       merged into a single pass to avoid allocating an intermediate array.
  if (q) {
    const query = q.toLowerCase();
    candidates = candidates.filter(m => m.title.toLowerCase().includes(query));
  }
  if (min_rating > 0) {
    candidates = candidates.filter(m => m.rating >= min_rating);
  }
  if (year_min !== undefined || year_max !== undefined) {
    candidates = candidates.filter(
      m =>
        (year_min === undefined || m.year >= year_min) &&
        (year_max === undefined || m.year <= year_max),
    );
  }

  // 3. Sort — when a text query is present, rank by match quality first, then
  //    apply the requested sort as a tiebreaker.
  if (q) {
    const query = q;
    candidates = candidates.sort((a, b) => {
      const scoreDiff = matchScore(a.title, query) - matchScore(b.title, query);
      if (scoreDiff !== 0) return scoreDiff;
      return sortMovies([a, b], sort).indexOf(a) === 0 ? -1 : 1;
    });
  } else {
    candidates = sortMovies(candidates, sort);
  }

  const total = candidates.length;

  // 4. Paginate.
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

export function getStats(options: StatsOptions = {}): Stats {
  const limit = Math.min(
    Math.max(options.topGenresLimit ?? TOP_GENRES_DEFAULT, 1),
    TOP_GENRES_MAX,
  );

  const all = movieRepository.findAll();

  if (all.length === 0) {
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

  const total = all.length;
  const avg_rating =
    Math.round((all.reduce((s, m) => s + m.rating, 0) / total) * 100) / 100;

  let min_year = all[0]!.year;
  let max_year = all[0]!.year;
  for (const m of all) {
    if (m.year < min_year) min_year = m.year;
    if (m.year > max_year) max_year = m.year;
  }

  const genreCounts = new Map<string, number>();
  for (const m of all) {
    for (const g of m.genres) {
      genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
    }
  }
  const genre_count = genreCounts.size;
  const top_genres = Array.from(genreCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));

  const yearMap = new Map<number, Movie[]>();
  for (const m of all) {
    let bucket = yearMap.get(m.year);
    if (!bucket) {
      bucket = [];
      yearMap.set(m.year, bucket);
    }
    bucket.push(m);
  }

  const by_year: YearBucket[] = Array.from(yearMap.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, movies]) => {
      const sorted = [...movies].sort((a, b) => b.rating - a.rating);
      return {
        year,
        count: sorted.length,
        movies: sorted.map(({ id, title, rating, genres }) => ({
          id, title, rating, genres,
        })),
      };
    });

  return { total, avg_rating, genre_count, min_year, max_year, top_genres, by_year };
}

