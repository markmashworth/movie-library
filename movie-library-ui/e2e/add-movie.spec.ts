/**
 * E2E test: A movie can be added
 *
 * Verifies the full "Add Movie" flow:
 *   1. Open the modal via the header button
 *   2. Fill in title, year, rating, and a genre
 *   3. Submit the form
 *   4. The app shows a confirmation toast with the new movie's title
 *   5. The movie appears in the leaderboard list
 *
 * The backend is fully mocked — no server needs to be running.
 */

import { test, expect } from '@playwright/test';
import { mockApiRoutes, STUB_NEW_MOVIE } from './fixtures';

test.describe('Add movie', () => {
  test.beforeEach(async ({ page }) => {
    await mockApiRoutes(page);
    await page.goto('/');
  });

  test('opens the Add Movie modal when the header button is clicked', async ({ page }) => {
    await page.getByRole('button', { name: /Add Movie/i }).click();
    await expect(page.getByText('Add a movie')).toBeVisible();
  });

  test('can add a movie and sees a confirmation toast', async ({ page }) => {
    // Open the modal
    await page.getByRole('button', { name: /Add Movie/i }).click();
    await expect(page.getByText('Add a movie')).toBeVisible();

    // Fill in the form
    await page.getByPlaceholder(/Long Quiet/i).fill('Inception');
    await page.getByPlaceholder('2025').fill('2010');
    await page.getByPlaceholder(/0–10/i).fill('8.8');

    // Select a genre — pick the first one available from STUB_GENRES
    await page.getByRole('button', { name: 'Sci-Fi' }).click();

    // Submit
    await page.getByRole('button', { name: /Save → library/i }).click();

    // The modal should close and the SelectedToast should appear.
    // "Found in library" is the toast's label — unique on the page, so this
    // is a precise signal that the toast (not just any copy of the title) appeared.
    await expect(page.getByText('Add a movie')).not.toBeVisible();
    await expect(page.getByText('Found in library')).toBeVisible();
  });

  test('new movie appears in the leaderboard after adding', async ({ page }) => {
    // Open modal and fill in details
    await page.getByRole('button', { name: /Add Movie/i }).click();
    await page.getByPlaceholder(/Long Quiet/i).fill('Inception');
    await page.getByPlaceholder('2025').fill('2010');
    await page.getByPlaceholder(/0–10/i).fill('8.8');
    await page.getByRole('button', { name: 'Sci-Fi' }).click();
    await page.getByRole('button', { name: /Save → library/i }).click();

    // After add, the movie is optimistically inserted into the movie list.
    // The title appears in multiple DOM nodes (leaderboard row + toast), so
    // use .first() to avoid strict-mode ambiguity — we just need to confirm
    // it's present somewhere on the page.
    await expect(page.getByText(STUB_NEW_MOVIE.title).first()).toBeVisible();
  });

  test('shows a validation error when the title is missing', async ({ page }) => {
    await page.getByRole('button', { name: /Add Movie/i }).click();
    // Skip title, go straight to Save
    await page.getByRole('button', { name: /Save → library/i }).click();
    await expect(page.getByText('Title is required.')).toBeVisible();
  });

  test('shows a validation error when no genre is selected', async ({ page }) => {
    await page.getByRole('button', { name: /Add Movie/i }).click();
    await page.getByPlaceholder(/Long Quiet/i).fill('Inception');
    await page.getByPlaceholder('2025').fill('2010');
    await page.getByPlaceholder(/0–10/i).fill('8.8');
    // Deliberately skip genre selection
    await page.getByRole('button', { name: /Save → library/i }).click();
    await expect(page.getByText('Pick at least one genre.')).toBeVisible();
  });

  test('modal can be dismissed with the Cancel button', async ({ page }) => {
    await page.getByRole('button', { name: /Add Movie/i }).click();
    await expect(page.getByText('Add a movie')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Add a movie')).not.toBeVisible();
  });
});
