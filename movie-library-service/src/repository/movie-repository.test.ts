/**
 * Tests for MovieRepository identity / dedupe behaviour.
 *
 * The repository class itself is not exported — only the singleton
 * `movieRepository` is. Each test obtains a fresh, empty instance by
 * resetting the module registry before importing, so tests never share state.
 *
 * The repository does not validate genres, so any string is a valid genre
 * value here; genre validation is the service layer's responsibility.
 *
 * Run with: `vitest run src/repository/movie-repository.test.ts`
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MovieInput } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RepoModule = typeof import('./movie-repository.js');

async function freshModule(): Promise<RepoModule> {
  vi.resetModules();
  return import('./movie-repository.js');
}

/** Minimal valid MovieInput used as a base across tests. */
const BASE: MovieInput = {
  title: 'Alien',
  year: 1979,
  rating: 8.5,
  genres: ['Sci-Fi'],
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('MovieRepository — title canonicalization & deduplication', () => {
  let mod: RepoModule;

  beforeEach(async () => {
    mod = await freshModule();
  });

  // -------------------------------------------------------------------------
  // Case normalization
  // -------------------------------------------------------------------------

  it('two adds differing only in title case deduplicate (e.g. "Alien" vs "alien")', () => {
    const first  = mod.movieRepository.add({ ...BASE, title: 'Alien' });
    const second = mod.movieRepository.add({ ...BASE, title: 'alien' });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('duplicate');

    // Only one record should exist in the repository.
    expect(mod.movieRepository.size).toBe(1);
  });

  it('upsert with a differently-cased title merges genres rather than creating a new record', () => {
    mod.movieRepository.upsert({ ...BASE, title: 'Alien',  genres: ['Sci-Fi'] });
    const result = mod.movieRepository.upsert({ ...BASE, title: 'ALIEN', genres: ['Horror'] });

    // Should be a merge, not a creation.
    expect(result.created).toBe(false);
    expect(result.addedGenres).toContain('Horror');

    // Still only one record.
    expect(mod.movieRepository.size).toBe(1);

    // The stored movie now carries both genres.
    const movie = mod.movieRepository.findAll()[0];
    expect(movie?.genres).toEqual(expect.arrayContaining(['Sci-Fi', 'Horror']));
  });

  // -------------------------------------------------------------------------
  // Whitespace normalization
  // -------------------------------------------------------------------------

  it('titles that differ only by a trailing space deduplicate', () => {
    const first  = mod.movieRepository.add({ ...BASE, title: 'Alien' });
    const second = mod.movieRepository.add({ ...BASE, title: 'Alien ' }); // trailing space

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('duplicate');
    expect(mod.movieRepository.size).toBe(1);
  });

  it('titles that differ only by a leading space deduplicate', () => {
    const first  = mod.movieRepository.add({ ...BASE, title: 'Alien' });
    const second = mod.movieRepository.add({ ...BASE, title: ' Alien' }); // leading space

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('duplicate');
    expect(mod.movieRepository.size).toBe(1);
  });

  it('a title with a double-space between words deduplicates with its single-space equivalent', () => {
    const first  = mod.movieRepository.add({ ...BASE, title: 'The Alien' });
    const second = mod.movieRepository.add({ ...BASE, title: 'The  Alien' }); // double space

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('duplicate');
    expect(mod.movieRepository.size).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Diacritics remain significant
  // -------------------------------------------------------------------------

  it('"Amelie" and "Amélie" are treated as distinct movies and do NOT deduplicate', () => {
    const amelie  = mod.movieRepository.add({ ...BASE, title: 'Amelie' });
    const amelie2 = mod.movieRepository.add({ ...BASE, title: 'Amélie' });

    // NFKC normalization does not strip accent marks, so both inserts succeed.
    expect(amelie.ok).toBe(true);
    expect(amelie2.ok).toBe(true);
    expect(mod.movieRepository.size).toBe(2);
  });
});
