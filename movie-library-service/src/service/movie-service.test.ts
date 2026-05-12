/**
 * Tests for the movie service.
 *
 * The service reads/writes through module-level singletons (movieRepository,
 * genreRepository). Each test resets the module registry so it gets a clean
 * repository pair: movieRepository starts empty and genreRepository is
 * pre-seeded with the 13 default genres.
 *
 * The pino logger is mocked to prevent the pino-pretty worker from spinning
 * up during tests.
 *
 * Run with: `vitest run src/service/movie-service.test.ts`
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Prevent pino-pretty from spawning a worker thread during tests.
vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MovieServiceModule = typeof import('./movie-service.js');

/** Returns a fresh service module backed by empty repos and the default genre list. */
async function freshService(): Promise<MovieServiceModule> {
  vi.resetModules();
  return import('./movie-service.js');
}

// Valid base input used across many tests — all fields are correct.
const VALID_INPUT = {
  title: 'Alien',
  year: 1979,
  rating: 8.5,
  genres: ['Sci-Fi', 'Horror'],
} as const;

// ---------------------------------------------------------------------------
// createMovie — input validation
// ---------------------------------------------------------------------------

describe('createMovie() — body shape validation', () => {
  let svc: MovieServiceModule;
  beforeEach(async () => { svc = await freshService(); });

  it('returns a validation error when the body is a string, not an object', () => {
    const r = svc.createMovie('not an object');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe('validation');
  });

  it('returns a validation error when the body is null', () => {
    const r = svc.createMovie(null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe('validation');
  });

  it('returns a validation error when the body is an array', () => {
    const r = svc.createMovie([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe('validation');
  });
});

describe('createMovie() — title validation', () => {
  let svc: MovieServiceModule;
  beforeEach(async () => { svc = await freshService(); });

  it('returns a validation error when title is missing', () => {
    const r = svc.createMovie({ year: 2000, rating: 7, genres: ['Action'] });
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === 'validation') {
      expect(r.errors.some(e => e.field === 'title')).toBe(true);
    }
  });

  it('returns a validation error when title is an empty string', () => {
    const r = svc.createMovie({ title: '', year: 2000, rating: 7, genres: ['Action'] });
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === 'validation') {
      expect(r.errors.some(e => e.field === 'title')).toBe(true);
    }
  });

  it('returns a validation error when title is not a string (e.g. a number)', () => {
    const r = svc.createMovie({ title: 42, year: 2000, rating: 7, genres: ['Action'] });
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === 'validation') {
      expect(r.errors.some(e => e.field === 'title')).toBe(true);
    }
  });

  it('returns a validation error when title exceeds 255 characters', () => {
    const r = svc.createMovie({ title: 'A'.repeat(256), year: 2000, rating: 7, genres: ['Action'] });
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === 'validation') {
      expect(r.errors.some(e => e.field === 'title')).toBe(true);
    }
  });

  it('accepts a title that is exactly 1 character', () => {
    const r = svc.createMovie({ title: 'X', year: 2000, rating: 7, genres: ['Action'] });
    expect(r.ok).toBe(true);
  });

  it('accepts a title that is exactly 255 characters', () => {
    const r = svc.createMovie({ title: 'A'.repeat(255), year: 2000, rating: 7, genres: ['Action'] });
    expect(r.ok).toBe(true);
  });
});

describe('createMovie() — year validation', () => {
  let svc: MovieServiceModule;
  beforeEach(async () => { svc = await freshService(); });

  it('returns a validation error when year is missing', () => {
    const r = svc.createMovie({ title: 'Movie', rating: 7, genres: ['Action'] });
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === 'validation') {
      expect(r.errors.some(e => e.field === 'year')).toBe(true);
    }
  });

  it('returns a validation error when year is not a number (e.g. a string)', () => {
    const r = svc.createMovie({ title: 'Movie', year: '2000', rating: 7, genres: ['Action'] });
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === 'validation') {
      expect(r.errors.some(e => e.field === 'year')).toBe(true);
    }
  });

  it('returns a validation error when year is a float (e.g. 1999.5)', () => {
    const r = svc.createMovie({ title: 'Movie', year: 1999.5, rating: 7, genres: ['Action'] });
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === 'validation') {
      expect(r.errors.some(e => e.field === 'year')).toBe(true);
    }
  });

  it('returns a validation error when year is below 1888 (MIN_YEAR)', () => {
    const r = svc.createMovie({ title: 'Movie', year: 1887, rating: 7, genres: ['Action'] });
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === 'validation') {
      expect(r.errors.some(e => e.field === 'year')).toBe(true);
    }
  });

  it('returns a validation error when year is above currentYear + 3', () => {
    const tooFuture = new Date().getFullYear() + 4;
    const r = svc.createMovie({ title: 'Movie', year: tooFuture, rating: 7, genres: ['Action'] });
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === 'validation') {
      expect(r.errors.some(e => e.field === 'year')).toBe(true);
    }
  });

  it('accepts year = 1888 (lower boundary)', () => {
    const r = svc.createMovie({ title: 'Movie', year: 1888, rating: 7, genres: ['Action'] });
    expect(r.ok).toBe(true);
  });

  it('accepts year = currentYear + 3 (upper boundary)', () => {
    const maxYear = new Date().getFullYear() + 3;
    const r = svc.createMovie({ title: 'Movie', year: maxYear, rating: 7, genres: ['Action'] });
    expect(r.ok).toBe(true);
  });
});

describe('createMovie() — rating validation', () => {
  let svc: MovieServiceModule;
  beforeEach(async () => { svc = await freshService(); });

  it('returns a validation error when rating is missing', () => {
    const r = svc.createMovie({ title: 'Movie', year: 2000, genres: ['Action'] });
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === 'validation') {
      expect(r.errors.some(e => e.field === 'rating')).toBe(true);
    }
  });

  it('returns a validation error when rating is not a number (e.g. a string)', () => {
    const r = svc.createMovie({ title: 'Movie', year: 2000, rating: '7', genres: ['Action'] });
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === 'validation') {
      expect(r.errors.some(e => e.field === 'rating')).toBe(true);
    }
  });

  it('returns a validation error when rating is NaN', () => {
    const r = svc.createMovie({ title: 'Movie', year: 2000, rating: NaN, genres: ['Action'] });
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === 'validation') {
      expect(r.errors.some(e => e.field === 'rating')).toBe(true);
    }
  });

  it('returns a validation error when rating is below 0', () => {
    const r = svc.createMovie({ title: 'Movie', year: 2000, rating: -0.1, genres: ['Action'] });
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === 'validation') {
      expect(r.errors.some(e => e.field === 'rating')).toBe(true);
    }
  });

  it('returns a validation error when rating is above 10', () => {
    const r = svc.createMovie({ title: 'Movie', year: 2000, rating: 10.1, genres: ['Action'] });
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === 'validation') {
      expect(r.errors.some(e => e.field === 'rating')).toBe(true);
    }
  });

  it('accepts rating = 0 (lower boundary)', () => {
    const r = svc.createMovie({ title: 'Movie', year: 2000, rating: 0, genres: ['Action'] });
    expect(r.ok).toBe(true);
  });

  it('accepts rating = 10 (upper boundary)', () => {
    const r = svc.createMovie({ title: 'Movie', year: 2000, rating: 10, genres: ['Action'] });
    expect(r.ok).toBe(true);
  });
});

describe('createMovie() — genres validation', () => {
  let svc: MovieServiceModule;
  beforeEach(async () => { svc = await freshService(); });

  it('returns a validation error when genres is missing', () => {
    const r = svc.createMovie({ title: 'Movie', year: 2000, rating: 7 });
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === 'validation') {
      expect(r.errors.some(e => e.field === 'genres')).toBe(true);
    }
  });

  it('returns a validation error when genres is not an array', () => {
    const r = svc.createMovie({ title: 'Movie', year: 2000, rating: 7, genres: 'Action' });
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === 'validation') {
      expect(r.errors.some(e => e.field === 'genres')).toBe(true);
    }
  });

  it('returns a validation error when genres is an empty array', () => {
    const r = svc.createMovie({ title: 'Movie', year: 2000, rating: 7, genres: [] });
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === 'validation') {
      expect(r.errors.some(e => e.field === 'genres')).toBe(true);
    }
  });

  it('returns a validation error when genres contains an unrecognised genre string', () => {
    const r = svc.createMovie({ title: 'Movie', year: 2000, rating: 7, genres: ['Anime'] });
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === 'validation') {
      expect(r.errors.some(e => e.field === 'genres')).toBe(true);
    }
  });

  it('error message for invalid genres lists the bad values and the valid options', () => {
    const r = svc.createMovie({ title: 'Movie', year: 2000, rating: 7, genres: ['Anime'] });
    if (!r.ok && r.kind === 'validation') {
      const genreError = r.errors.find(e => e.field === 'genres');
      expect(genreError?.message).toContain('Anime');
      expect(genreError?.message).toContain('Action'); // one of the valid genres
    } else {
      expect.fail('Expected a genres validation error');
    }
  });
});

describe('createMovie() — multiple field errors', () => {
  it('returns all field-level errors in a single response when multiple fields are invalid', async () => {
    const svc = await freshService();
    // Missing title and genres, invalid rating
    const r = svc.createMovie({ year: 2000, rating: 999, genres: [] });
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === 'validation') {
      const fields = r.errors.map(e => e.field);
      expect(fields).toContain('title');
      expect(fields).toContain('rating');
      expect(fields).toContain('genres');
    }
  });
});

// ---------------------------------------------------------------------------
// createMovie — success path
// ---------------------------------------------------------------------------

describe('createMovie() — success path', () => {
  let svc: MovieServiceModule;
  beforeEach(async () => { svc = await freshService(); });

  it('returns { ok: true, movie } with all expected fields for valid input', () => {
    const r = svc.createMovie(VALID_INPUT);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.movie.title).toBe('Alien');
      expect(r.movie.year).toBe(1979);
      expect(r.movie.genres).toEqual(expect.arrayContaining(['Sci-Fi', 'Horror']));
    }
  });

  it('normalises rating to one decimal place (e.g. 7.15 rounds to 7.2)', () => {
    const r = svc.createMovie({ ...VALID_INPUT, rating: 7.15 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.movie.rating).toBe(7.2);
  });

  it('normalises rating to one decimal place (e.g. 8.04 rounds to 8.0)', () => {
    const r = svc.createMovie({ ...VALID_INPUT, rating: 8.04 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.movie.rating).toBe(8.0);
  });

  it('the returned movie has a unique numeric id', () => {
    const r1 = svc.createMovie({ ...VALID_INPUT, title: 'Movie One' });
    const r2 = svc.createMovie({ ...VALID_INPUT, title: 'Movie Two' });
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(typeof r1.movie.id).toBe('number');
      expect(r1.movie.id).not.toBe(r2.movie.id);
    }
  });

  it('genres on the stored movie match the input genres exactly', () => {
    const r = svc.createMovie({ ...VALID_INPUT, genres: ['Action', 'Thriller'] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.movie.genres).toEqual(expect.arrayContaining(['Action', 'Thriller']));
  });
});

// ---------------------------------------------------------------------------
// createMovie — duplicate detection
// ---------------------------------------------------------------------------

describe('createMovie() — duplicate detection', () => {
  let svc: MovieServiceModule;
  beforeEach(async () => { svc = await freshService(); });

  it('returns { ok: false, kind: "duplicate", existing } when identity already exists', () => {
    svc.createMovie(VALID_INPUT);
    const r = svc.createMovie(VALID_INPUT);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe('duplicate');
  });

  it('the existing movie returned in the duplicate result is the originally stored record', () => {
    const first = svc.createMovie(VALID_INPUT);
    const second = svc.createMovie(VALID_INPUT);

    // Guard: first call must succeed, second must fail as a duplicate.
    // NOTE: a duplicate has ok: false, so we want !first.ok or second.ok (not !second.ok)
    // to be the failure sentinels.
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    expect(second.ok).toBe(false);
    if (second.ok) return;

    expect(second.kind).toBe('duplicate');
    if (second.kind !== 'duplicate') return;

    expect(second.existing.id).toBe(first.movie.id);
  });

  it('duplicate check is case-insensitive on title ("Alien" vs "alien" collide)', () => {
    svc.createMovie(VALID_INPUT);
    const r = svc.createMovie({ ...VALID_INPUT, title: 'alien' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe('duplicate');
  });

  it('duplicate check collapses extra whitespace in title (" Alien" collides with "Alien")', () => {
    svc.createMovie(VALID_INPUT);
    const r = svc.createMovie({ ...VALID_INPUT, title: ' Alien ' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe('duplicate');
  });

  it('movies that differ only in rating are NOT duplicates', () => {
    svc.createMovie(VALID_INPUT);
    const r = svc.createMovie({ ...VALID_INPUT, rating: 7.0 });
    expect(r.ok).toBe(true);
  });

  it('movies that differ only in year are NOT duplicates', () => {
    svc.createMovie(VALID_INPUT);
    const r = svc.createMovie({ ...VALID_INPUT, year: 2000 });
    expect(r.ok).toBe(true);
  });

  it('movies that differ only in title are NOT duplicates', () => {
    svc.createMovie(VALID_INPUT);
    const r = svc.createMovie({ ...VALID_INPUT, title: 'Aliens' });
    expect(r.ok).toBe(true);
  });

  it('"Amelie" and "Amélie" are treated as distinct movies and do NOT deduplicate', () => {
    svc.createMovie({ title: 'Amelie', year: 2001, rating: 8.3, genres: ['Comedy', 'Romance'] });
    const r = svc.createMovie({ title: 'Amélie', year: 2001, rating: 8.3, genres: ['Comedy', 'Romance'] });
    expect(r.ok).toBe(true); // diacritics are significant — not a duplicate
  });
});

// ---------------------------------------------------------------------------
// upsertMovie()
// ---------------------------------------------------------------------------

describe('upsertMovie()', () => {
  let svc: MovieServiceModule;
  beforeEach(async () => { svc = await freshService(); });

  it('returns { ok: false, errors } for invalid input (same validation as createMovie)', () => {
    const r = svc.upsertMovie({ title: '', year: 2000, rating: 7, genres: ['Action'] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThan(0);
  });

  it('returns { ok: true, created: true } when inserting a brand-new movie', () => {
    const r = svc.upsertMovie(VALID_INPUT);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.created).toBe(true);
  });

  it('addedGenres lists every genre on the first insert', () => {
    const r = svc.upsertMovie(VALID_INPUT);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.addedGenres).toEqual(expect.arrayContaining(['Sci-Fi', 'Horror']));
    }
  });

  it('returns { ok: true, created: false } when the same identity already exists', () => {
    svc.upsertMovie(VALID_INPUT);
    const r = svc.upsertMovie({ ...VALID_INPUT, genres: ['Action'] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.created).toBe(false);
  });

  it('addedGenres lists only genres that are new on a merge', () => {
    svc.upsertMovie(VALID_INPUT); // Sci-Fi, Horror
    const r = svc.upsertMovie({ ...VALID_INPUT, genres: ['Action', 'Sci-Fi'] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.addedGenres).toEqual(['Action']); // Sci-Fi already existed
    }
  });

  it('addedGenres is empty when the movie already has all the genres in the input', () => {
    svc.upsertMovie(VALID_INPUT); // Sci-Fi, Horror
    const r = svc.upsertMovie({ ...VALID_INPUT, genres: ['Sci-Fi'] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.addedGenres).toHaveLength(0);
  });

  it('the merged genres appear on the movie object after upsert', () => {
    svc.upsertMovie(VALID_INPUT); // Sci-Fi, Horror
    const r = svc.upsertMovie({ ...VALID_INPUT, genres: ['Action', 'Thriller'] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.movie.genres).toEqual(expect.arrayContaining(['Sci-Fi', 'Horror', 'Action', 'Thriller']));
    }
  });
});

// ---------------------------------------------------------------------------
// getMovie()
// ---------------------------------------------------------------------------

describe('getMovie()', () => {
  let svc: MovieServiceModule;
  beforeEach(async () => { svc = await freshService(); });

  it('returns the movie when the id exists', () => {
    const created = svc.createMovie(VALID_INPUT);
    if (!created.ok) expect.fail('createMovie failed');
    const found = svc.getMovie(created.movie.id);
    expect(found).toBeDefined();
    expect(found?.title).toBe('Alien');
  });

  it('returns undefined when the id does not exist', () => {
    expect(svc.getMovie(999)).toBeUndefined();
  });

  it('returns undefined for id 0', () => {
    expect(svc.getMovie(0)).toBeUndefined();
  });

  it('returns undefined for a negative id', () => {
    expect(svc.getMovie(-1)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// listMovies() — helpers
// ---------------------------------------------------------------------------

// Seed movies used by filter/sort/pagination tests.
const SEED = [
  { title: 'Alien',                  year: 1979, rating: 8.5, genres: ['Sci-Fi', 'Horror'] },
  { title: 'The Shawshank Redemption', year: 1994, rating: 9.3, genres: ['Drama'] },
  { title: 'Inception',              year: 2010, rating: 8.8, genres: ['Action', 'Sci-Fi', 'Thriller'] },
  { title: 'The Big Lebowski',       year: 1998, rating: 8.1, genres: ['Comedy'] },
  { title: "Schindler's List",       year: 1993, rating: 8.9, genres: ['Drama', 'War'] },
  { title: 'The Dark Knight',        year: 2008, rating: 9.0, genres: ['Action', 'Thriller'] },
  { title: 'Amélie',                 year: 2001, rating: 8.3, genres: ['Comedy', 'Romance'] },
];

function seedMovies(svc: MovieServiceModule): void {
  for (const m of SEED) {
    svc.upsertMovie(m);
  }
}

// ---------------------------------------------------------------------------
// listMovies() — defaults
// ---------------------------------------------------------------------------

describe('listMovies() — default behaviour', () => {
  let svc: MovieServiceModule;
  beforeEach(async () => {
    svc = await freshService();
    seedMovies(svc);
  });

  it('returns all movies when no filters are supplied', () => {
    const r = svc.listMovies({});
    expect(r.total).toBe(SEED.length);
    expect(r.data).toHaveLength(SEED.length);
  });

  it('response contains data, total, limit, and offset fields', () => {
    const r = svc.listMovies({});
    expect(r).toHaveProperty('data');
    expect(r).toHaveProperty('total');
    expect(r).toHaveProperty('limit');
    expect(r).toHaveProperty('offset');
  });

  it('default limit is 20', () => {
    const r = svc.listMovies({});
    expect(r.limit).toBe(20);
  });

  it('default offset is 0', () => {
    const r = svc.listMovies({});
    expect(r.offset).toBe(0);
  });

  it('default sort is rating_desc', () => {
    const r = svc.listMovies({});
    const ratings = r.data.map(m => m.rating);
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
  });
});

// ---------------------------------------------------------------------------
// listMovies() — genre filter
// ---------------------------------------------------------------------------

describe('listMovies() — genre filter', () => {
  let svc: MovieServiceModule;
  beforeEach(async () => {
    svc = await freshService();
    seedMovies(svc);
  });

  it('returns only movies that belong to the specified genre', () => {
    const r = svc.listMovies({ genre: ['Drama'] });
    expect(r.data.every(m => m.genres.includes('Drama'))).toBe(true);
    expect(r.total).toBe(2); // Shawshank + Schindler's List
  });

  it('returns movies that match ANY of multiple genres (OR logic)', () => {
    const r = svc.listMovies({ genre: ['Horror', 'Comedy'] });
    // Alien (Horror), The Big Lebowski (Comedy), Amélie (Comedy)
    expect(r.total).toBe(3);
    expect(r.data.every(m => m.genres.includes('Horror') || m.genres.includes('Comedy'))).toBe(true);
  });

  it('returns an empty data array when no movies match the genre filter', () => {
    const r = svc.listMovies({ genre: ['Fantasy'] });
    expect(r.total).toBe(0);
    expect(r.data).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// listMovies() — min_rating filter
// ---------------------------------------------------------------------------

describe('listMovies() — min_rating filter', () => {
  let svc: MovieServiceModule;
  beforeEach(async () => {
    svc = await freshService();
    seedMovies(svc);
  });

  it('returns only movies with rating >= min_rating', () => {
    const r = svc.listMovies({ min_rating: 9.0 });
    expect(r.data.every(m => m.rating >= 9.0)).toBe(true);
  });

  it('includes movies whose rating exactly equals min_rating', () => {
    const r = svc.listMovies({ min_rating: 9.0 });
    expect(r.data.some(m => m.rating === 9.0)).toBe(true); // The Dark Knight
  });

  it('returns an empty data array when no movies meet the threshold', () => {
    const r = svc.listMovies({ min_rating: 10 });
    expect(r.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// listMovies() — year range filter
// ---------------------------------------------------------------------------

describe('listMovies() — year range filter', () => {
  let svc: MovieServiceModule;
  beforeEach(async () => {
    svc = await freshService();
    seedMovies(svc);
  });

  it('returns only movies with year >= year_min when only year_min is supplied', () => {
    const r = svc.listMovies({ year_min: 2001 });
    expect(r.data.every(m => m.year >= 2001)).toBe(true);
  });

  it('returns only movies with year <= year_max when only year_max is supplied', () => {
    const r = svc.listMovies({ year_max: 1994 });
    expect(r.data.every(m => m.year <= 1994)).toBe(true);
  });

  it('returns movies within [year_min, year_max] when both are supplied', () => {
    const r = svc.listMovies({ year_min: 1993, year_max: 1998 });
    expect(r.data.every(m => m.year >= 1993 && m.year <= 1998)).toBe(true);
    expect(r.total).toBe(3); // Schindler's (1993), Shawshank (1994), Big Lebowski (1998)
  });

  it('includes movies whose year exactly equals year_min or year_max', () => {
    const r = svc.listMovies({ year_min: 1979, year_max: 1979 });
    expect(r.total).toBe(1);
    expect(r.data[0]?.title).toBe('Alien');
  });

  it('returns an empty data array when no movies fall within the year range', () => {
    const r = svc.listMovies({ year_min: 2020, year_max: 2025 });
    expect(r.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// listMovies() — text search (q)
// ---------------------------------------------------------------------------

describe('listMovies() — text search (q)', () => {
  let svc: MovieServiceModule;
  beforeEach(async () => {
    svc = await freshService();
    // Three movies with "alien" appearing at different positions in the title
    svc.upsertMovie({ title: 'The Alien Experience', year: 2000, rating: 7.0, genres: ['Sci-Fi'] }); // contains
    svc.upsertMovie({ title: 'Alien Nation',          year: 2005, rating: 7.0, genres: ['Sci-Fi'] }); // starts with
    svc.upsertMovie({ title: 'Alien',                 year: 2010, rating: 7.0, genres: ['Sci-Fi'] }); // exact
  });

  it('returns only movies whose title contains the query string (case-insensitive)', () => {
    const r = svc.listMovies({ q: 'alien' });
    expect(r.total).toBe(3);
    expect(r.data.every(m => m.title.toLowerCase().includes('alien'))).toBe(true);
  });

  it('returns an empty data array when no titles contain the query', () => {
    const r = svc.listMovies({ q: 'zzznomatch' });
    expect(r.total).toBe(0);
  });

  it('exact-title matches rank before prefix matches in the result', () => {
    const r = svc.listMovies({ q: 'Alien' });
    const titles = r.data.map(m => m.title);
    expect(titles.indexOf('Alien')).toBeLessThan(titles.indexOf('Alien Nation'));
  });

  it('prefix matches rank before mid-title matches in the result', () => {
    const r = svc.listMovies({ q: 'Alien' });
    const titles = r.data.map(m => m.title);
    expect(titles.indexOf('Alien Nation')).toBeLessThan(titles.indexOf('The Alien Experience'));
  });
});

// ---------------------------------------------------------------------------
// listMovies() — sorting
// ---------------------------------------------------------------------------

describe('listMovies() — sorting', () => {
  let svc: MovieServiceModule;
  beforeEach(async () => {
    svc = await freshService();
    // Insert movies in a fixed order with predictable ratings/years/titles
    svc.upsertMovie({ title: 'Movie C', year: 2000, rating: 6.0, genres: ['Action'] });
    svc.upsertMovie({ title: 'Movie A', year: 2010, rating: 8.0, genres: ['Action'] });
    svc.upsertMovie({ title: 'Movie B', year: 1990, rating: 7.0, genres: ['Action'] });
  });

  it('sort=rating_desc returns movies in descending rating order', () => {
    const r = svc.listMovies({ sort: 'rating_desc' });
    const ratings = r.data.map(m => m.rating);
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
  });

  it('sort=rating_asc returns movies in ascending rating order', () => {
    const r = svc.listMovies({ sort: 'rating_asc' });
    const ratings = r.data.map(m => m.rating);
    expect(ratings).toEqual([...ratings].sort((a, b) => a - b));
  });

  it('sort=year_desc returns movies in descending year order', () => {
    const r = svc.listMovies({ sort: 'year_desc' });
    const years = r.data.map(m => m.year);
    expect(years).toEqual([...years].sort((a, b) => b - a));
  });

  it('sort=year_asc returns movies in ascending year order', () => {
    const r = svc.listMovies({ sort: 'year_asc' });
    const years = r.data.map(m => m.year);
    expect(years).toEqual([...years].sort((a, b) => a - b));
  });

  it('sort=title_asc returns movies in ascending locale-aware title order', () => {
    const r = svc.listMovies({ sort: 'title_asc' });
    const titles = r.data.map(m => m.title);
    expect(titles).toEqual(['Movie A', 'Movie B', 'Movie C']);
  });
});

// ---------------------------------------------------------------------------
// listMovies() — pagination
// ---------------------------------------------------------------------------

describe('listMovies() — pagination', () => {
  let svc: MovieServiceModule;
  beforeEach(async () => {
    svc = await freshService();
    seedMovies(svc); // 7 movies
  });

  it('limit clamps to 1 when a value below 1 is supplied', () => {
    const r = svc.listMovies({ limit: 0 });
    expect(r.limit).toBe(1);
    expect(r.data).toHaveLength(1);
  });

  it('limit clamps to 100 when a value above 100 is supplied', () => {
    const r = svc.listMovies({ limit: 999 });
    expect(r.limit).toBe(100);
  });

  it('offset clamps to 0 when a negative value is supplied', () => {
    const r = svc.listMovies({ offset: -5 });
    expect(r.offset).toBe(0);
  });

  it('total reflects the full filtered count, not just the page size', () => {
    const r = svc.listMovies({ limit: 2 });
    expect(r.total).toBe(SEED.length);
    expect(r.data).toHaveLength(2);
  });

  it('returns the correct slice of results for a given limit and offset', () => {
    const all = svc.listMovies({ sort: 'rating_desc' });
    const page = svc.listMovies({ sort: 'rating_desc', limit: 3, offset: 2 });
    expect(page.data).toEqual(all.data.slice(2, 5));
  });

  it('returns an empty data array when offset equals the total count', () => {
    const r = svc.listMovies({ offset: SEED.length });
    expect(r.data).toHaveLength(0);
    expect(r.total).toBe(SEED.length); // total is still the filtered count
  });
});

// ---------------------------------------------------------------------------
// listMovies() — combined filters
// ---------------------------------------------------------------------------

describe('listMovies() — filter combinations', () => {
  let svc: MovieServiceModule;
  beforeEach(async () => {
    svc = await freshService();
    seedMovies(svc);
  });

  it('genre + min_rating filters work together', () => {
    // Sci-Fi movies rated >= 8.8 → Inception (8.8), not Alien (8.5)
    const r = svc.listMovies({ genre: ['Sci-Fi'], min_rating: 8.8 });
    expect(r.total).toBe(1);
    expect(r.data[0]?.title).toBe('Inception');
  });

  it('q + year_max filters work together', () => {
    // Title contains "the" AND year <= 2000
    const r = svc.listMovies({ q: 'the', year_max: 2000 });
    expect(r.data.every(m => m.title.toLowerCase().includes('the') && m.year <= 2000)).toBe(true);
  });

  it('genre + year range + min_rating all apply simultaneously', () => {
    // Action movies, year >= 2005, rating >= 9.0 → The Dark Knight (2008, 9.0)
    const r = svc.listMovies({ genre: ['Action'], year_min: 2005, min_rating: 9.0 });
    expect(r.total).toBe(1);
    expect(r.data[0]?.title).toBe('The Dark Knight');
  });
});

// ---------------------------------------------------------------------------
// getStats()
// ---------------------------------------------------------------------------

describe('getStats()', () => {
  it('returns zeros and empty arrays when the repository is empty', async () => {
    const svc = await freshService();
    const s = svc.getStats();
    expect(s.total).toBe(0);
    expect(s.avg_rating).toBe(0);
    expect(s.genre_count).toBe(0);
    expect(s.min_year).toBe(0);
    expect(s.max_year).toBe(0);
    expect(s.top_genres).toHaveLength(0);
    expect(s.by_year).toHaveLength(0);
  });

  describe('with seeded movies', () => {
    let svc: MovieServiceModule;
    beforeEach(async () => {
      svc = await freshService();
      seedMovies(svc); // 7 movies — ratings: 8.5, 9.3, 8.8, 8.1, 8.9, 9.0, 8.3
    });

    it('total equals the number of inserted movies', () => {
      expect(svc.getStats().total).toBe(7);
    });

    it('avg_rating is rounded to 2 decimal places', () => {
      // 8.5+9.3+8.8+8.1+8.9+9.0+8.3 = 60.9, /7 = 8.7 exactly
      expect(svc.getStats().avg_rating).toBe(8.7);
    });

    it('min_year is the earliest release year in the catalog', () => {
      expect(svc.getStats().min_year).toBe(1979); // Alien
    });

    it('max_year is the latest release year in the catalog', () => {
      expect(svc.getStats().max_year).toBe(2010); // Inception
    });

    it('genre_count reflects the number of distinct genres across all movies', () => {
      // Sci-Fi, Horror, Drama, Action, Thriller, Comedy, War, Romance = 8 distinct
      expect(svc.getStats().genre_count).toBe(8);
    });

    it('top_genres are sorted by count descending', () => {
      const counts = svc.getStats().top_genres.map(g => g.count);
      expect(counts).toEqual([...counts].sort((a, b) => b - a));
    });

    it('ties in top_genres are broken alphabetically by genre name', () => {
      // Action, Comedy, Drama, Sci-Fi, Thriller all have count=2 → sorted alphabetically
      const top5 = svc.getStats({ topGenresLimit: 5 }).top_genres;
      const namesAtCount2 = top5.filter(g => g.count === 2).map(g => g.name);
      expect(namesAtCount2).toEqual([...namesAtCount2].sort((a, b) => a.localeCompare(b)));
    });

    it('top_genres defaults to the top 5 entries', () => {
      expect(svc.getStats().top_genres).toHaveLength(5);
    });

    it('topGenresLimit option controls how many genres are returned', () => {
      expect(svc.getStats({ topGenresLimit: 3 }).top_genres).toHaveLength(3);
      expect(svc.getStats({ topGenresLimit: 8 }).top_genres).toHaveLength(8);
    });

    it('topGenresLimit is clamped to a maximum of 100', () => {
      const s = svc.getStats({ topGenresLimit: 999 });
      // Only 8 distinct genres in the seed, so we get 8 even though 100 is the cap
      expect(s.top_genres.length).toBeLessThanOrEqual(100);
    });

    it('topGenresLimit is clamped to a minimum of 1', () => {
      expect(svc.getStats({ topGenresLimit: 0 }).top_genres).toHaveLength(1);
    });

    it('by_year entries are sorted in descending year order', () => {
      const years = svc.getStats().by_year.map(b => b.year);
      expect(years).toEqual([...years].sort((a, b) => b - a));
    });

    it('each by_year entry lists its movies sorted by rating descending', () => {
      for (const bucket of svc.getStats().by_year) {
        const ratings = bucket.movies.map(m => m.rating);
        expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
      }
    });

    it('each by_year entry contains id, title, rating, genres — but not year', () => {
      const movie = svc.getStats().by_year[0]?.movies[0];
      expect(movie).toBeDefined();
      expect(movie).toHaveProperty('id');
      expect(movie).toHaveProperty('title');
      expect(movie).toHaveProperty('rating');
      expect(movie).toHaveProperty('genres');
      expect(movie).not.toHaveProperty('year');
    });

    it('count on each by_year entry matches the number of movies for that year', () => {
      for (const bucket of svc.getStats().by_year) {
        expect(bucket.count).toBe(bucket.movies.length);
      }
    });
  });
});
