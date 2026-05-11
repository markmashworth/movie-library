/**
 * Genre service — business logic that sits between the HTTP routes and the
 * persistence layer. Validation and result typing live here; all storage is
 * delegated to genreRepository.
 */

import { genreRepository } from '../repository/genre-repository.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the full list of genres in alphabetical order.
 */
export function getGenres(): readonly string[] {
  return genreRepository.findAll();
}

/**
 * Returns true when `genre` is a known valid genre.
 */
export function isValidGenre(genre: string): boolean {
  return genreRepository.has(genre);
}

export type AddGenreResult =
  | { ok: true; genre: string }
  | { ok: false; kind: 'duplicate' }
  | { ok: false; kind: 'validation'; message: string };

/**
 * Ensures a genre exists in the catalog, creating it if it doesn't.
 * Intended for use by the migration path only — regular movie creation
 * should reject unknown genres rather than silently create them.
 *
 * - Trims whitespace from the genre name.
 * - No-ops if the genre already exists.
 */
export function ensureGenre(genre: string): void {
  const trimmed = genre.trim();
  if (trimmed === '') return;
  if (!genreRepository.has(trimmed)) {
    genreRepository.insert(trimmed);
  }
}

/**
 * Validates and inserts a new genre into the catalog.
 *
 * - Trims whitespace from the input.
 * - Rejects empty strings (validation error).
 * - Rejects genres that already exist (duplicate error).
 * - Otherwise delegates the sorted insert to the repository.
 */
export function addGenre(input: unknown): AddGenreResult {
  if (typeof input !== 'string' || input.trim() === '') {
    return {
      ok: false,
      kind: 'validation',
      message: 'Genre must be a non-empty string.',
    };
  }

  const genre = input.trim();

  if (genreRepository.has(genre)) {
    return { ok: false, kind: 'duplicate' };
  }

  genreRepository.insert(genre);
  return { ok: true, genre };
}
