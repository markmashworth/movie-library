/**
 * E2E test: StatsStrip shows values
 *
 * Verifies that the five stat tiles at the top of the app are rendered with
 * real (non-loading, non-error) values derived from the API response.
 *
 * The backend is fully mocked — no server needs to be running.
 */

import { test, expect } from '@playwright/test';
import { mockApiRoutes, STUB_STATS } from './fixtures';

test.describe('Stats strip', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept API calls before the page loads so the very first requests
    // are served by the mock.
    await mockApiRoutes(page);
    await page.goto('/');
  });

  test('displays the total movie count', async ({ page }) => {
    // STUB_STATS.total = 42, rendered by toLocaleString() → "42"
    await expect(
      page.getByText(STUB_STATS.total.toLocaleString()),
    ).toBeVisible();
  });

  test('displays the average rating', async ({ page }) => {
    // avg_rating = 7.85, formatted to 2 d.p. → "7.85"
    await expect(
      page.getByText(STUB_STATS.avg_rating.toFixed(2)),
    ).toBeVisible();
  });

  test('displays the top genre name', async ({ page }) => {
    // top_genres[0].name = "Drama"
    const topGenre = STUB_STATS.top_genres[0].name;
    // The name appears in both the StatsStrip tile and potentially genre
    // chips elsewhere, so we just need at least one visible occurrence.
    await expect(page.getByText(topGenre).first()).toBeVisible();
  });

  test('displays the genre count', async ({ page }) => {
    // genre_count = 8 — use exact:true so the partial match on "7.85" (which
    // contains the digit "8") doesn't cause a strict-mode violation.
    await expect(
      page.getByText(String(STUB_STATS.genre_count), { exact: true }),
    ).toBeVisible();
  });

  test('displays the year span', async ({ page }) => {
    // span = max_year - min_year = 2024 - 1994 = 30 → "30y"
    const span = STUB_STATS.max_year - STUB_STATS.min_year;
    await expect(page.getByText(`${span}y`)).toBeVisible();
  });

  test('all five tile labels are present', async ({ page }) => {
    const labels = [
      'Total movies',
      'Average rating',
      'Top genre',
      'Genres tracked',
      'Year span',
    ];
    for (const label of labels) {
      await expect(page.getByText(label)).toBeVisible();
    }
  });
});
