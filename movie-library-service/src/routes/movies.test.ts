/**
 * Tests for the /v1/movies routes.
 *   GET  /        — list / search / filter
 *   GET  /stats   — aggregate catalog statistics
 *   GET  /:id     — single movie lookup
 *   POST /        — create a movie
 *
 * The movie service is mocked so these tests exercise only the HTTP layer:
 * query-string parsing, path-param parsing, status codes, error shapes, and
 * idempotency middleware behaviour.
 *
 * Run with: `vitest run src/routes/movies.test.ts`
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Application } from 'express';
import type { Movie, Stats, ListMoviesResult } from '../types.js';

// ---------------------------------------------------------------------------
// Mock: movie service
// ---------------------------------------------------------------------------

vi.mock('../service/movie-service.js', () => ({
  listMovies:  vi.fn(),
  getMovie:    vi.fn(),
  createMovie: vi.fn(),
  getStats:    vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: express-idempotency
// The real middleware keeps an in-memory store that persists across tests.
// Mocking it lets us control whether a request is a replay or a fresh call.
// ---------------------------------------------------------------------------

const mockIsHit = vi.hoisted(() => vi.fn(() => false));

vi.mock('express-idempotency', () => ({
  // Mirror real middleware behaviour: send the cached response on a replay, then
  // always call next() so the route handler can call isHit() and return early.
  // Without sending a response on a replay, supertest would hang waiting for bytes
  // that the short-circuited handler never sends.
  idempotency: vi.fn(() => (req: unknown, res: unknown, next: () => void) => {
    if (mockIsHit(req)) {
      (res as { status: (c: number) => { json: (b: unknown) => void } })
        .status(200).json({ replayed: true });
    }
    next();
  }),
  getSharedIdempotencyService: vi.fn(() => ({ isHit: mockIsHit })),
}));

import { moviesRouter } from './movies.js';
import { listMovies, getMovie, createMovie, getStats } from '../service/movie-service.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOVIE: Movie = {
  id: 1,
  title: 'Alien',
  year: 1979,
  rating: 8.5,
  genres: ['Sci-Fi', 'Horror'],
};

const STATS: Stats = {
  total: 1,
  avg_rating: 8.5,
  genre_count: 2,
  min_year: 1979,
  max_year: 1979,
  top_genres: [{ name: 'Sci-Fi', count: 1 }],
  by_year: [{ year: 1979, count: 1, movies: [{ id: 1, title: 'Alien', rating: 8.5, genres: ['Sci-Fi'] }] }],
};

const LIST_RESULT: ListMoviesResult = {
  data:   [MOVIE],
  total:  1,
  limit:  20,
  offset: 0,
};

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

function buildApp(): Application {
  const app = express();
  app.use(express.json());
  app.use('/', moviesRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockIsHit.mockReturnValue(false);
});

// ---------------------------------------------------------------------------
// GET /movies
// ---------------------------------------------------------------------------

describe('GET /movies — default behaviour', () => {
  beforeEach(() => {
    vi.mocked(listMovies).mockReturnValue(LIST_RESULT);
  });

  it('responds with 200 OK', async () => {
    const res = await request(buildApp()).get('/');
    expect(res.status).toBe(200);
  });

  it('response body contains data, total, limit, and offset fields', async () => {
    const res = await request(buildApp()).get('/');
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('limit');
    expect(res.body).toHaveProperty('offset');
  });

  it('forwards the response from listMovies to the client', async () => {
    const res = await request(buildApp()).get('/');
    expect(res.body).toEqual(LIST_RESULT);
  });
});

describe('GET /movies — query parameter forwarding', () => {
  beforeEach(() => {
    vi.mocked(listMovies).mockReturnValue(LIST_RESULT);
  });

  it('passes the q parameter to listMovies', async () => {
    await request(buildApp()).get('/?q=alien');
    expect(vi.mocked(listMovies)).toHaveBeenCalledWith(expect.objectContaining({ q: 'alien' }));
  });

  it('passes a single genre parameter to listMovies', async () => {
    await request(buildApp()).get('/?genre=Drama');
    expect(vi.mocked(listMovies)).toHaveBeenCalledWith(
      expect.objectContaining({ genre: expect.arrayContaining(['Drama']) }),
    );
  });

  it('passes multiple genre parameters as an array to listMovies', async () => {
    await request(buildApp()).get('/?genre=Drama&genre=Comedy');
    expect(vi.mocked(listMovies)).toHaveBeenCalledWith(
      expect.objectContaining({ genre: expect.arrayContaining(['Drama', 'Comedy']) }),
    );
  });

  it('parses min_rating as a float and passes it to listMovies', async () => {
    await request(buildApp()).get('/?min_rating=7.5');
    expect(vi.mocked(listMovies)).toHaveBeenCalledWith(
      expect.objectContaining({ min_rating: 7.5 }),
    );
  });

  it('parses year_min and year_max as integers', async () => {
    await request(buildApp()).get('/?year_min=2000&year_max=2020');
    expect(vi.mocked(listMovies)).toHaveBeenCalledWith(
      expect.objectContaining({ year_min: 2000, year_max: 2020 }),
    );
  });

  it('parses limit and offset as integers', async () => {
    await request(buildApp()).get('/?limit=10&offset=5');
    expect(vi.mocked(listMovies)).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, offset: 5 }),
    );
  });

  it.each([
    'rating_desc', 'rating_asc', 'year_desc', 'year_asc', 'title_asc',
  ] as const)('passes valid sort value "%s" to listMovies', async (sort) => {
    await request(buildApp()).get(`/?sort=${sort}`);
    expect(vi.mocked(listMovies)).toHaveBeenCalledWith(
      expect.objectContaining({ sort }),
    );
  });
});

describe('GET /movies — sort validation', () => {
  it('responds with 400 when ?sort= is an unrecognised value', async () => {
    const res = await request(buildApp()).get('/?sort=newest');
    expect(res.status).toBe(400);
  });

  it('400 response body has error: "invalid_parameter"', async () => {
    const res = await request(buildApp()).get('/?sort=newest');
    expect(res.body.error).toBe('invalid_parameter');
  });

  it('400 response message lists the accepted sort values', async () => {
    const res = await request(buildApp()).get('/?sort=newest');
    expect(res.body.message).toContain('rating_desc');
    expect(res.body.message).toContain('title_asc');
  });
});

// ---------------------------------------------------------------------------
// GET /movies/stats
// ---------------------------------------------------------------------------

describe('GET /movies/stats', () => {
  beforeEach(() => {
    vi.mocked(getStats).mockReturnValue(STATS);
  });

  it('responds with 200 OK', async () => {
    const res = await request(buildApp()).get('/stats');
    expect(res.status).toBe(200);
  });

  it('response body includes all expected stats fields', async () => {
    const res = await request(buildApp()).get('/stats');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('avg_rating');
    expect(res.body).toHaveProperty('genre_count');
    expect(res.body).toHaveProperty('min_year');
    expect(res.body).toHaveProperty('max_year');
    expect(res.body).toHaveProperty('top_genres');
    expect(res.body).toHaveProperty('by_year');
  });

  it('passes a valid integer top_genres_limit to getStats', async () => {
    await request(buildApp()).get('/stats?top_genres_limit=10');
    expect(vi.mocked(getStats)).toHaveBeenCalledWith(
      expect.objectContaining({ topGenresLimit: 10 }),
    );
  });

  it('responds with 400 when top_genres_limit is not an integer (e.g. "abc")', async () => {
    const res = await request(buildApp()).get('/stats?top_genres_limit=abc');
    expect(res.status).toBe(400);
  });

  it('responds with 400 when top_genres_limit is a float string (e.g. "5.5")', async () => {
    const res = await request(buildApp()).get('/stats?top_genres_limit=5.5');
    expect(res.status).toBe(400);
  });

  it('400 response body has error: "invalid_parameter"', async () => {
    const res = await request(buildApp()).get('/stats?top_genres_limit=bad');
    expect(res.body.error).toBe('invalid_parameter');
  });

  it('400 response message says "top_genres_limit must be an integer."', async () => {
    const res = await request(buildApp()).get('/stats?top_genres_limit=bad');
    expect(res.body.message).toBe('top_genres_limit must be an integer.');
  });
});

// ---------------------------------------------------------------------------
// GET /movies/:id
// ---------------------------------------------------------------------------

describe('GET /movies/:id', () => {
  it('responds with 200 and the movie object when the id exists', async () => {
    vi.mocked(getMovie).mockReturnValue(MOVIE);
    const res = await request(buildApp()).get('/1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(MOVIE);
  });

  it('responds with 404 when no movie with that id exists', async () => {
    vi.mocked(getMovie).mockReturnValue(undefined);
    const res = await request(buildApp()).get('/999');
    expect(res.status).toBe(404);
  });

  it('404 response body has error: "not_found"', async () => {
    vi.mocked(getMovie).mockReturnValue(undefined);
    const res = await request(buildApp()).get('/999');
    expect(res.body.error).toBe('not_found');
  });

  it('404 response message mentions the requested id', async () => {
    vi.mocked(getMovie).mockReturnValue(undefined);
    const res = await request(buildApp()).get('/999');
    expect(res.body.message).toContain('999');
  });

  it('responds with 400 when :id is not an integer (e.g. "abc")', async () => {
    const res = await request(buildApp()).get('/abc');
    expect(res.status).toBe(400);
  });

  it('400 response body has error: "invalid_parameter"', async () => {
    const res = await request(buildApp()).get('/abc');
    expect(res.body.error).toBe('invalid_parameter');
  });

  it('400 response message says "Movie id must be an integer."', async () => {
    const res = await request(buildApp()).get('/abc');
    expect(res.body.message).toBe('Movie id must be an integer.');
  });
});

// ---------------------------------------------------------------------------
// POST /movies
// ---------------------------------------------------------------------------

describe('POST /movies — success', () => {
  it('responds with 201 Created and the new movie for valid input', async () => {
    vi.mocked(createMovie).mockReturnValue({ ok: true, movie: MOVIE });
    const res = await request(buildApp())
      .post('/')
      .send({ title: 'Alien', year: 1979, rating: 8.5, genres: ['Sci-Fi'] });
    expect(res.status).toBe(201);
    expect(res.body).toEqual(MOVIE);
  });

  it('the returned movie has id, title, year, rating, and genres', async () => {
    vi.mocked(createMovie).mockReturnValue({ ok: true, movie: MOVIE });
    const res = await request(buildApp())
      .post('/')
      .send({ title: 'Alien', year: 1979, rating: 8.5, genres: ['Sci-Fi'] });
    expect(res.body).toMatchObject({ id: expect.any(Number), title: expect.any(String) });
  });
});

describe('POST /movies — validation failure', () => {
  it('responds with 422 Unprocessable Entity for an invalid request body', async () => {
    vi.mocked(createMovie).mockReturnValue({
      ok: false,
      kind: 'validation',
      errors: [{ field: 'title', message: 'Title is required.' }],
    });
    const res = await request(buildApp()).post('/').send({});
    expect(res.status).toBe(422);
  });

  it('422 response body has error: "validation_failed"', async () => {
    vi.mocked(createMovie).mockReturnValue({
      ok: false,
      kind: 'validation',
      errors: [{ field: 'title', message: 'Title is required.' }],
    });
    const res = await request(buildApp()).post('/').send({});
    expect(res.body.error).toBe('validation_failed');
  });

  it('422 response body contains a non-empty errors array with field-level details', async () => {
    const errors = [
      { field: 'title',  message: 'Title is required.' },
      { field: 'rating', message: 'Rating is required.' },
    ];
    vi.mocked(createMovie).mockReturnValue({ ok: false, kind: 'validation', errors });
    const res = await request(buildApp()).post('/').send({});
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors).toHaveLength(2);
    expect(res.body.errors[0]).toHaveProperty('field');
    expect(res.body.errors[0]).toHaveProperty('message');
  });

  it('422 response message says "One or more fields are invalid."', async () => {
    vi.mocked(createMovie).mockReturnValue({
      ok: false,
      kind: 'validation',
      errors: [{ field: 'title', message: 'Title is required.' }],
    });
    const res = await request(buildApp()).post('/').send({});
    expect(res.body.message).toBe('One or more fields are invalid.');
  });
});

describe('POST /movies — duplicate', () => {
  it('responds with 409 Conflict when the same identity already exists', async () => {
    vi.mocked(createMovie).mockReturnValue({
      ok: false,
      kind: 'duplicate',
      existing: MOVIE,
    });
    const res = await request(buildApp())
      .post('/')
      .send({ title: 'Alien', year: 1979, rating: 8.5, genres: ['Horror'] });
    expect(res.status).toBe(409);
  });

  it('409 response body has error: "duplicate_movie"', async () => {
    vi.mocked(createMovie).mockReturnValue({
      ok: false,
      kind: 'duplicate',
      existing: MOVIE,
    });
    const res = await request(buildApp())
      .post('/')
      .send({ title: 'Alien', year: 1979, rating: 8.5, genres: ['Horror'] });
    expect(res.body.error).toBe('duplicate_movie');
  });

  it('409 response body includes the existing movie record under an "existing" key', async () => {
    vi.mocked(createMovie).mockReturnValue({
      ok: false,
      kind: 'duplicate',
      existing: MOVIE,
    });
    const res = await request(buildApp())
      .post('/')
      .send({ title: 'Alien', year: 1979, rating: 8.5, genres: ['Horror'] });
    expect(res.body.existing).toEqual(MOVIE);
  });
});

// ---------------------------------------------------------------------------
// POST /movies — idempotency
// ---------------------------------------------------------------------------

describe('POST /movies — idempotency', () => {
  it('calls createMovie when mockIsHit returns false (first / fresh request)', async () => {
    mockIsHit.mockReturnValue(false);
    vi.mocked(createMovie).mockReturnValue({ ok: true, movie: MOVIE });

    const res = await request(buildApp())
      .post('/')
      .set('Idempotency-Key', 'test-key-fresh')
      .send({ title: 'Alien', year: 1979, rating: 8.5, genres: ['Sci-Fi'] });

    expect(vi.mocked(createMovie)).toHaveBeenCalledOnce();
    expect(res.status).toBe(201);
  });

  it('skips createMovie when mockIsHit returns true (replayed request)', async () => {
    mockIsHit.mockReturnValue(true);

    await request(buildApp())
      .post('/')
      .set('Idempotency-Key', 'test-key-replay')
      .send({ title: 'Alien', year: 1979, rating: 8.5, genres: ['Sci-Fi'] });

    // Handler returns early when isHit is true — createMovie is never called
    expect(vi.mocked(createMovie)).not.toHaveBeenCalled();
  });
});
