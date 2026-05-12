/**
 * Tests for GenreRepository.
 *
 * The repository class itself is not exported — only the singleton
 * `genreRepository` is. Each test obtains a freshly-seeded instance by
 * resetting the module registry before importing, so tests never share state.
 *
 * Run with: `vitest run src/repository/genre-repository.test.ts`
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RepoModule = typeof import('./genre-repository.js');

const DEFAULT_GENRES = [
  'Action',
  'Animation',
  'Comedy',
  'Documentary',
  'Drama',
  'Fantasy',
  'Horror',
  'Mystery',
  'Romance',
  'Sci-Fi',
  'Thriller',
  'War',
  'Western',
] as const;

/** Returns a freshly-seeded genreRepository by resetting the module cache. */
async function freshRepo(): Promise<RepoModule['genreRepository']> {
  vi.resetModules();
  const mod = await import('./genre-repository.js') as RepoModule;
  return mod.genreRepository;
}

// ---------------------------------------------------------------------------
// findAll()
// ---------------------------------------------------------------------------

describe('GenreRepository — findAll()', () => {
  it('returns all 13 default genres', async () => {
    const repo = await freshRepo();
    expect(repo.findAll()).toHaveLength(13);
  });

  it('returns genres in ascending alphabetical order after seeding', async () => {
    const repo = await freshRepo();
    const genres = [...repo.findAll()];
    const sorted = [...genres].sort((a, b) => a.localeCompare(b));
    expect(genres).toEqual(sorted);
  });

  it('returns the same array reference on successive calls (O(1) — no copy)', async () => {
    const repo = await freshRepo();
    expect(repo.findAll()).toBe(repo.findAll());
  });

  it('reflects a genre inserted after module load', async () => {
    const repo = await freshRepo();
    repo.insert('Anime');
    expect(repo.findAll()).toContain('Anime');
  });

  it('returns genres in sorted order after several inserts', async () => {
    const repo = await freshRepo();
    repo.insert('Zombie');
    repo.insert('Anime');
    repo.insert('Absurdist');
    const genres = [...repo.findAll()];
    const sorted = [...genres].sort((a, b) => a.localeCompare(b));
    expect(genres).toEqual(sorted);
  });
});

// ---------------------------------------------------------------------------
// has()
// ---------------------------------------------------------------------------

describe('GenreRepository — has()', () => {
  it('returns true for a genre that is in the default seed', async () => {
    const repo = await freshRepo();
    expect(repo.has('Action')).toBe(true);
  });

  it('returns false for a genre that has never been inserted', async () => {
    const repo = await freshRepo();
    expect(repo.has('Anime')).toBe(false);
  });

  it('is case-sensitive — "action" is not found when only "Action" is seeded', async () => {
    const repo = await freshRepo();
    expect(repo.has('action')).toBe(false);
    expect(repo.has('ACTION')).toBe(false);
    expect(repo.has('Action')).toBe(true);
  });

  it('returns false for an empty string', async () => {
    const repo = await freshRepo();
    expect(repo.has('')).toBe(false);
  });

  it('returns true for a genre immediately after it is inserted', async () => {
    const repo = await freshRepo();
    expect(repo.has('Anime')).toBe(false);
    repo.insert('Anime');
    expect(repo.has('Anime')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// insert()
// ---------------------------------------------------------------------------

describe('GenreRepository — insert()', () => {
  it('inserting a genre that sorts before all existing genres places it at index 0', async () => {
    const repo = await freshRepo();
    // "Aaaa" sorts before "Action" (the first default genre)
    repo.insert('Aaaa');
    expect(repo.findAll()[0]).toBe('Aaaa');
  });

  it('inserting a genre that sorts after all existing genres places it at the last position', async () => {
    const repo = await freshRepo();
    // "Zzz" sorts after "Western" (the last default genre)
    repo.insert('Zzz');
    const genres = repo.findAll();
    expect(genres[genres.length - 1]).toBe('Zzz');
  });

  it('inserting "Anime" places it between "Animation" and "Comedy"', async () => {
    const repo = await freshRepo();
    repo.insert('Anime');
    const genres = [...repo.findAll()];
    const animationIdx = genres.indexOf('Animation');
    const animeIdx = genres.indexOf('Anime');
    const comedyIdx = genres.indexOf('Comedy');
    expect(animationIdx).toBeGreaterThanOrEqual(0);
    expect(animeIdx).toBeGreaterThan(animationIdx);
    expect(animeIdx).toBeLessThan(comedyIdx);
  });

  it('after insert, has() returns true for the newly inserted genre', async () => {
    const repo = await freshRepo();
    repo.insert('Anime');
    expect(repo.has('Anime')).toBe(true);
  });

  it('inserts multiple genres in reverse-alpha order and the list stays fully sorted', async () => {
    const repo = await freshRepo();
    const additions = ['Zombie', 'Superhero', 'Manga', 'Anime', 'Absurdist'];
    for (const g of additions) {
      repo.insert(g);
    }
    const genres = [...repo.findAll()];
    const sorted = [...genres].sort((a, b) => a.localeCompare(b));
    expect(genres).toEqual(sorted);
  });

  it('inserts multiple genres in random order and the list stays fully sorted', async () => {
    const repo = await freshRepo();
    const additions = ['Superhero', '3D', 'Anime', 'Biographical', 'Arthouse'];
    for (const g of additions) {
      repo.insert(g);
    }
    const genres = [...repo.findAll()];
    const sorted = [...genres].sort((a, b) => a.localeCompare(b));
    expect(genres).toEqual(sorted);
  });
});

// ---------------------------------------------------------------------------
// Default singleton seeding
// ---------------------------------------------------------------------------

describe('GenreRepository — default singleton seeding', () => {
  let repo: RepoModule['genreRepository'];

  beforeEach(async () => {
    repo = await freshRepo();
  });

  it('is pre-seeded with exactly the 13 expected default genres', () => {
    expect([...repo.findAll()]).toEqual([...DEFAULT_GENRES]);
  });

  it('default genres are returned in sorted alphabetical order', () => {
    const genres = [...repo.findAll()];
    const sorted = [...genres].sort((a, b) => a.localeCompare(b));
    expect(genres).toEqual(sorted);
  });

  it('has() returns true for each of the 13 default genres', () => {
    for (const genre of DEFAULT_GENRES) {
      expect(repo.has(genre), `expected has("${genre}") to be true`).toBe(true);
    }
  });

  it('has() returns false for a genre not in the default list', () => {
    expect(repo.has('Anime')).toBe(false);
    expect(repo.has('Superhero')).toBe(false);
    expect(repo.has('action')).toBe(false); // wrong case
  });
});
