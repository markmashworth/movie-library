/**
 * Shared stub data and API-mocking helper for Playwright E2E tests.
 *
 * Every test that needs the app to render successfully calls `mockApiRoutes`
 * in a `beforeEach` (or at the top of the test) before navigating.  The
 * helper intercepts all /api/v1/* requests at the network level so no real
 * backend is required.
 */

import type { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Stub data
// ---------------------------------------------------------------------------

export const STUB_STATS = {
  total: 42,
  avg_rating: 7.85,
  genre_count: 8,
  min_year: 1994,
  max_year: 2024,
  top_genres: [
    { name: 'Drama', count: 15 },
    { name: 'Action', count: 10 },
  ],
  by_year: [],
};

export const STUB_MOVIES = {
  data: [
    { id: 1, title: 'The Shawshank Redemption', year: 1994, rating: 9.3, genres: ['Drama'] },
    { id: 2, title: 'The Godfather', year: 1972, rating: 9.2, genres: ['Drama', 'Crime'] },
    { id: 3, title: 'Pulp Fiction', year: 1994, rating: 8.9, genres: ['Drama', 'Crime'] },
  ],
  total: 3,
  limit: 100,
  offset: 0,
};

export const STUB_GENRES = {
  genres: ['Action', 'Comedy', 'Crime', 'Drama', 'Horror', 'Sci-Fi', 'Thriller'],
};

// A movie that the POST /movies endpoint returns when a new entry is created.
export const STUB_NEW_MOVIE = {
  id: 99,
  title: 'Inception',
  year: 2010,
  rating: 8.8,
  genres: ['Sci-Fi'],
};

// ---------------------------------------------------------------------------
// Route-mocking helper
// ---------------------------------------------------------------------------

/**
 * Intercepts all /api/v1/* traffic and returns stub responses so the UI
 * renders without a running backend.
 *
 * Call this before `page.goto()` in each test (or in a beforeEach).
 *
 * @param newMovieResponse  Optional override for the POST /movies response
 *   (defaults to STUB_NEW_MOVIE).  Pass a custom object to test specific
 *   post-add states.
 */
export async function mockApiRoutes(
  page: Page,
  newMovieResponse: object = STUB_NEW_MOVIE,
): Promise<void> {
  await page.route('**/api/v1/**', (route) => {
    const url = route.request().url();
    const method = route.request().method();

    // Stats — must be checked before the generic /movies catch-all because
    // /movies/stats also contains "/movies".
    if (url.includes('/movies/stats')) {
      return route.fulfill({ json: STUB_STATS });
    }

    // Create movie
    if (url.includes('/movies') && method === 'POST') {
      return route.fulfill({ status: 201, json: newMovieResponse });
    }

    // List / search movies
    if (url.includes('/movies')) {
      return route.fulfill({ json: STUB_MOVIES });
    }

    // Genres
    if (url.includes('/genres')) {
      return route.fulfill({ json: STUB_GENRES });
    }

    // Anything else — let it through (shouldn't happen in these tests)
    return route.continue();
  });
}
