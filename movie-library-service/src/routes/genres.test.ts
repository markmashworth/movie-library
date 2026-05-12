/**
 * Tests for the /v1/genres routes.
 *   GET  /  — returns the canonical sorted genre list
 *   POST /  — adds a new genre; body: { "name": "string" }
 *
 * The genre service is mocked so these tests exercise only the HTTP layer:
 * request parsing, status codes, and response shapes. Business logic is
 * covered by genre-service.test.ts.
 *
 * Run with: `vitest run src/routes/genres.test.ts`
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Application } from 'express';

// ---------------------------------------------------------------------------
// Mock the service layer — routes test HTTP mechanics only
// ---------------------------------------------------------------------------

vi.mock('../service/genre-service.js', () => ({
  getGenres: vi.fn(),
  addGenre:  vi.fn(),
  isValidGenre: vi.fn(),
  ensureGenre:  vi.fn(),
}));

import { genresRouter } from './genres.js';
import { getGenres, addGenre } from '../service/genre-service.js';

// ---------------------------------------------------------------------------
// App factory — minimal Express instance (no pino-http or other global middleware)
// ---------------------------------------------------------------------------

function buildApp(): Application {
  const app = express();
  app.use(express.json());
  app.use('/', genresRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET /genres
// ---------------------------------------------------------------------------

describe('GET /genres', () => {
  it('responds with 200 OK', async () => {
    vi.mocked(getGenres).mockReturnValue(['Action', 'Comedy', 'Drama']);
    const res = await request(buildApp()).get('/');
    expect(res.status).toBe(200);
  });

  it('response body has a "genres" array', async () => {
    vi.mocked(getGenres).mockReturnValue(['Action', 'Comedy', 'Drama']);
    const res = await request(buildApp()).get('/');
    expect(res.body).toHaveProperty('genres');
    expect(Array.isArray(res.body.genres)).toBe(true);
  });

  it('response contains exactly the genres returned by the service', async () => {
    const genres = ['Action', 'Comedy', 'Drama'];
    vi.mocked(getGenres).mockReturnValue(genres);
    const res = await request(buildApp()).get('/');
    expect(res.body.genres).toEqual(genres);
  });

  it('genres are forwarded in the order returned by the service (expected: alphabetical)', async () => {
    const sorted = ['Action', 'Animation', 'Comedy', 'Drama'];
    vi.mocked(getGenres).mockReturnValue(sorted);
    const res = await request(buildApp()).get('/');
    expect(res.body.genres).toEqual(sorted);
  });

  it('returns JSON content-type', async () => {
    vi.mocked(getGenres).mockReturnValue([]);
    const res = await request(buildApp()).get('/');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

// ---------------------------------------------------------------------------
// POST /genres
// ---------------------------------------------------------------------------

describe('POST /genres — success', () => {
  it('responds with 201 Created for a valid new genre name', async () => {
    vi.mocked(addGenre).mockReturnValue({ ok: true, genre: 'Anime' });
    const res = await request(buildApp())
      .post('/')
      .send({ name: 'Anime' });
    expect(res.status).toBe(201);
  });

  it('response body has the shape { genre: string }', async () => {
    vi.mocked(addGenre).mockReturnValue({ ok: true, genre: 'Anime' });
    const res = await request(buildApp())
      .post('/')
      .send({ name: 'Anime' });
    expect(res.body).toEqual({ genre: 'Anime' });
  });

  it('returns JSON content-type on success', async () => {
    vi.mocked(addGenre).mockReturnValue({ ok: true, genre: 'Anime' });
    const res = await request(buildApp())
      .post('/')
      .send({ name: 'Anime' });
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

describe('POST /genres — duplicate', () => {
  it('responds with 409 Conflict when the genre already exists', async () => {
    vi.mocked(addGenre).mockReturnValue({ ok: false, kind: 'duplicate' });
    const res = await request(buildApp())
      .post('/')
      .send({ name: 'Action' });
    expect(res.status).toBe(409);
  });

  it('409 response body has { error: "Genre already exists." }', async () => {
    vi.mocked(addGenre).mockReturnValue({ ok: false, kind: 'duplicate' });
    const res = await request(buildApp())
      .post('/')
      .send({ name: 'Action' });
    expect(res.body).toEqual({ error: 'Genre already exists.' });
  });
});

describe('POST /genres — validation errors', () => {
  it('responds with 400 Bad Request when "name" is missing from the body', async () => {
    vi.mocked(addGenre).mockReturnValue({
      ok: false, kind: 'validation', message: 'Genre must be a non-empty string.',
    });
    const res = await request(buildApp())
      .post('/')
      .send({});
    expect(res.status).toBe(400);
  });

  it('responds with 400 Bad Request when "name" is not a string (e.g. a number)', async () => {
    vi.mocked(addGenre).mockReturnValue({
      ok: false, kind: 'validation', message: 'Genre must be a non-empty string.',
    });
    const res = await request(buildApp())
      .post('/')
      .send({ name: 42 });
    expect(res.status).toBe(400);
  });

  it('responds with 400 Bad Request when "name" is an empty string', async () => {
    vi.mocked(addGenre).mockReturnValue({
      ok: false, kind: 'validation', message: 'Genre must be a non-empty string.',
    });
    const res = await request(buildApp())
      .post('/')
      .send({ name: '' });
    expect(res.status).toBe(400);
  });

  it('responds with 400 Bad Request when "name" is a whitespace-only string', async () => {
    vi.mocked(addGenre).mockReturnValue({
      ok: false, kind: 'validation', message: 'Genre must be a non-empty string.',
    });
    const res = await request(buildApp())
      .post('/')
      .send({ name: '   ' });
    expect(res.status).toBe(400);
  });

  it('400 response body has an "error" field containing the validation message', async () => {
    const message = 'Genre must be a non-empty string.';
    vi.mocked(addGenre).mockReturnValue({ ok: false, kind: 'validation', message });
    const res = await request(buildApp())
      .post('/')
      .send({ name: '' });
    expect(res.body).toHaveProperty('error', message);
  });

  it('returns JSON content-type on validation error', async () => {
    vi.mocked(addGenre).mockReturnValue({
      ok: false, kind: 'validation', message: 'Genre must be a non-empty string.',
    });
    const res = await request(buildApp())
      .post('/')
      .send({ name: '' });
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});
