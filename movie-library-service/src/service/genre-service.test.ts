/**
 * Tests for the genre service.
 *
 * The service delegates storage to `genreRepository`, which is a module-level
 * singleton. Each test resets the module registry so it gets a fresh,
 * default-seeded repository with no cross-test state bleed.
 *
 * Run with: `vitest run src/service/genre-service.test.ts`
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ServiceModule = typeof import('./genre-service.js');

/** Returns a fresh service module backed by a clean, default-seeded repository. */
async function freshService(): Promise<ServiceModule> {
  vi.resetModules();
  return import('./genre-service.js') as Promise<ServiceModule>;
}

// ---------------------------------------------------------------------------
// getGenres()
// ---------------------------------------------------------------------------

describe('getGenres()', () => {
  it('returns the full list of default genres (13 entries)', async () => {
    const svc = await freshService();
    expect(svc.getGenres()).toHaveLength(13);
  });

  it('returns genres in ascending alphabetical order', async () => {
    const svc = await freshService();
    const genres = [...svc.getGenres()];
    const sorted = [...genres].sort((a, b) => a.localeCompare(b));
    expect(genres).toEqual(sorted);
  });

  it('reflects genres added after module initialisation', async () => {
    const svc = await freshService();
    svc.addGenre('Anime');
    expect(svc.getGenres()).toContain('Anime');
  });
});

// ---------------------------------------------------------------------------
// isValidGenre()
// ---------------------------------------------------------------------------

describe('isValidGenre()', () => {
  it('returns true for a genre that exists in the default catalog', async () => {
    const svc = await freshService();
    expect(svc.isValidGenre('Action')).toBe(true);
    expect(svc.isValidGenre('Drama')).toBe(true);
    expect(svc.isValidGenre('Sci-Fi')).toBe(true);
  });

  it('returns false for a genre that does not exist', async () => {
    const svc = await freshService();
    expect(svc.isValidGenre('Anime')).toBe(false);
    expect(svc.isValidGenre('Superhero')).toBe(false);
  });

  it('is case-sensitive — "action" is invalid when only "Action" is in the catalog', async () => {
    const svc = await freshService();
    expect(svc.isValidGenre('action')).toBe(false);
    expect(svc.isValidGenre('ACTION')).toBe(false);
    expect(svc.isValidGenre('Action')).toBe(true);
  });

  it('returns false for an empty string', async () => {
    const svc = await freshService();
    expect(svc.isValidGenre('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ensureGenre()
// ---------------------------------------------------------------------------

describe('ensureGenre()', () => {
  it('inserts a new genre when it does not already exist', async () => {
    const svc = await freshService();
    expect(svc.isValidGenre('Anime')).toBe(false);
    svc.ensureGenre('Anime');
    expect(svc.isValidGenre('Anime')).toBe(true);
  });

  it('is a no-op when the genre already exists — catalog size does not change', async () => {
    const svc = await freshService();
    const sizeBefore = svc.getGenres().length;
    svc.ensureGenre('Action'); // already in the default list
    expect(svc.getGenres()).toHaveLength(sizeBefore);
  });

  it('trims leading and trailing whitespace before inserting', async () => {
    const svc = await freshService();
    svc.ensureGenre('  Anime  ');
    expect(svc.isValidGenre('Anime')).toBe(true);
    expect(svc.isValidGenre('  Anime  ')).toBe(false); // untrimmed version is not stored
  });

  it('is a no-op for a whitespace-only string (empty after trim)', async () => {
    const svc = await freshService();
    const sizeBefore = svc.getGenres().length;
    svc.ensureGenre('   ');
    expect(svc.getGenres()).toHaveLength(sizeBefore);
  });

  it('is a no-op for an empty string', async () => {
    const svc = await freshService();
    const sizeBefore = svc.getGenres().length;
    svc.ensureGenre('');
    expect(svc.getGenres()).toHaveLength(sizeBefore);
  });

  it('after inserting via ensureGenre, the catalog contains the genre exactly once', async () => {
    const svc = await freshService();
    svc.ensureGenre('Anime');
    svc.ensureGenre('Anime'); // second call is a no-op
    const matches = svc.getGenres().filter(g => g === 'Anime');
    expect(matches).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// addGenre()
// ---------------------------------------------------------------------------

describe('addGenre() — validation failures', () => {
  let svc: ServiceModule;

  beforeEach(async () => {
    svc = await freshService();
  });

  it('returns { ok: false, kind: "validation" } when input is a number', () => {
    const result = svc.addGenre(42);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('validation');
  });

  it('returns { ok: false, kind: "validation" } when input is null', () => {
    const result = svc.addGenre(null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('validation');
  });

  it('returns { ok: false, kind: "validation" } when input is undefined', () => {
    const result = svc.addGenre(undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('validation');
  });

  it('returns { ok: false, kind: "validation" } when input is an empty string', () => {
    const result = svc.addGenre('');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('validation');
  });

  it('returns { ok: false, kind: "validation" } when input is a whitespace-only string', () => {
    const result = svc.addGenre('   ');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('validation');
  });

  it('validation error message says "Genre must be a non-empty string."', () => {
    const result = svc.addGenre('');
    if (!result.ok && result.kind === 'validation') {
      expect(result.message).toBe('Genre must be a non-empty string.');
    } else {
      expect.fail('Expected a validation error');
    }
  });
});

describe('addGenre() — duplicate', () => {
  it('returns { ok: false, kind: "duplicate" } when the genre already exists', async () => {
    const svc = await freshService();
    const result = svc.addGenre('Action'); // default genre
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('duplicate');
  });

  it('is case-sensitive — "action" is treated as a new genre even though "Action" exists', async () => {
    const svc = await freshService();
    const result = svc.addGenre('action');
    // "action" !== "Action", so it is NOT a duplicate
    expect(result.ok).toBe(true);
  });
});

describe('addGenre() — success', () => {
  let svc: ServiceModule;

  beforeEach(async () => {
    svc = await freshService();
  });

  it('returns { ok: true, genre } for a valid new genre', () => {
    const result = svc.addGenre('Anime');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.genre).toBe('Anime');
  });

  it('trims leading and trailing whitespace from the input before inserting', () => {
    const result = svc.addGenre('  Anime  ');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.genre).toBe('Anime');
  });

  it('the newly added genre appears in getGenres() after a successful add', () => {
    svc.addGenre('Anime');
    expect(svc.getGenres()).toContain('Anime');
  });

  it('isValidGenre() returns true for the newly added genre', () => {
    svc.addGenre('Anime');
    expect(svc.isValidGenre('Anime')).toBe(true);
  });

  it('adding a genre maintains the sorted order of the catalog', () => {
    svc.addGenre('Anime');
    const genres = [...svc.getGenres()];
    const sorted = [...genres].sort((a, b) => a.localeCompare(b));
    expect(genres).toEqual(sorted);
  });

  it('a second attempt to add the same genre returns a duplicate error', () => {
    svc.addGenre('Anime');
    const second = svc.addGenre('Anime');
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.kind).toBe('duplicate');
  });
});
