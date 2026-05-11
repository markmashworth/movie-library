/**
 * Routes for /v1/movies
 *   GET  /movies       — list / search / filter
 *   GET  /movies/stats — aggregate catalog statistics
 *   GET  /movies/:id   — single movie
 *   POST /movies       — add a movie
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { listMovies, getMovie, createMovie, getStats } from '../service/movie-service.js';
import type { ListMoviesParams } from '../types.js';
import type { SortOrder } from '../types.js';
import { idempotency, getSharedIdempotencyService } from 'express-idempotency';

export const moviesRouter = Router();

// ---------------------------------------------------------------------------
// GET /movies
// ---------------------------------------------------------------------------
moviesRouter.get('/', (req: Request, res: Response) => {
  const { q, genre, min_rating, year_min, year_max, sort, limit, offset } = req.query;

  const parsedMinRating = min_rating !== undefined ? parseFloat(String(min_rating)) : undefined;
  const parsedYearMin   = year_min   !== undefined ? parseInt(String(year_min), 10)   : undefined;
  const parsedYearMax   = year_max   !== undefined ? parseInt(String(year_max), 10)   : undefined;
  const parsedLimit     = limit      !== undefined ? parseInt(String(limit), 10)      : undefined;
  const parsedOffset    = offset     !== undefined ? parseInt(String(offset), 10)     : undefined;

  const validSorts: SortOrder[] = ['rating_desc', 'rating_asc', 'year_desc', 'year_asc', 'title_asc'];
  const sortValue = sort !== undefined ? String(sort) : undefined;
  if (sortValue !== undefined && !validSorts.includes(sortValue as SortOrder)) {
    res.status(400).json({
      error: 'invalid_parameter',
      message: `Invalid sort value. Accepted: ${validSorts.join(', ')}.`,
    });
    return;
  }

  const genreParam = Array.isArray(genre)
    ? (genre as string[])
    : genre !== undefined
      ? [String(genre)]
      : undefined;

  const params: ListMoviesParams = {};
  if (q !== undefined) params.q = String(q);
  if (genreParam !== undefined) params.genre = genreParam;
  if (parsedMinRating !== undefined) params.min_rating = parsedMinRating;
  if (parsedYearMin !== undefined) params.year_min = parsedYearMin;
  if (parsedYearMax !== undefined) params.year_max = parsedYearMax;
  if (sortValue !== undefined) params.sort = sortValue as SortOrder;
  if (parsedLimit !== undefined) params.limit = parsedLimit;
  if (parsedOffset !== undefined) params.offset = parsedOffset;

  const result = listMovies(params);

  res.json(result);
});

// ---------------------------------------------------------------------------
// GET /movies/stats
// ---------------------------------------------------------------------------
moviesRouter.get('/stats', (req: Request, res: Response) => {
  const { top_genres_limit } = req.query;

  let topGenresLimit: number | undefined;
  if (top_genres_limit !== undefined) {
    const raw = String(top_genres_limit);
    const parsed = parseInt(raw, 10);
    if (!Number.isInteger(parsed) || String(parsed) !== raw) {
      res.status(400).json({
        error: 'invalid_parameter',
        message: 'top_genres_limit must be an integer.',
      });
      return;
    }
    topGenresLimit = parsed;
  }

  res.json(getStats({ topGenresLimit }));
});

// ---------------------------------------------------------------------------
// GET /movies/:id
// ---------------------------------------------------------------------------
moviesRouter.get('/:id', (req: Request, res: Response) => {
  const idParam = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
  const id = parseInt(idParam ?? '', 10);

  if (isNaN(id)) {
    res.status(400).json({
      error: 'invalid_parameter',
      message: 'Movie id must be an integer.',
    });
    return;
  }

  const movie = getMovie(id);
  if (!movie) {
    res.status(404).json({
      error: 'not_found',
      message: `No movie with id ${id}.`,
    });
    return;
  }

  res.json(movie);
});

// ---------------------------------------------------------------------------
// POST /movies
// ---------------------------------------------------------------------------
moviesRouter.post('/', idempotency(), (req: Request, res: Response) => {
  // The middleware always calls next() — even when replaying a cached response.
  // Guard here so we don't create a duplicate movie on a replayed request.
  if (getSharedIdempotencyService().isHit(req)) return;

  const result = createMovie(req.body);

  if (!result.ok) {
    if (result.kind === 'validation') {
      res.status(422).json({
        error: 'validation_failed',
        message: 'One or more fields are invalid.',
        errors: result.errors,
      });
      return;
    }

    // 'duplicate' — same (title, year, rating) already exists.
    res.status(409).json({
      error: 'duplicate_movie',
      message:
        'A movie with the same title, year, and rating already exists. ' +
        'To add genres to it, update the existing record.',
      existing: result.existing,
    });
    return;
  }

  res.status(201).json(result.movie);
});
