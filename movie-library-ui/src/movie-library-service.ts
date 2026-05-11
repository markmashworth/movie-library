/**
 * movie-library-service.ts
 *
 * Centralised API client for the Movie Library backend.
 * All network calls go through this module — no component ever calls fetch directly.
 *
 * Base URL: Vite proxies /api → http://localhost:8080, so we never hard-code a port
 * in the UI code. The proxy is configured in vite.config.ts.
 */

import type {
  Movie,
  MovieInput,
  ListMoviesParams,
  ListMoviesResponse,
  StatsResponse,
  ApiErrorResponse,
} from './types';

const BASE = '/api/v1';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val === undefined || val === null || val === '') continue;
    if (Array.isArray(val)) {
      for (const item of val) q.append(key, String(item));
    } else {
      q.set(key, String(val));
    }
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as ApiErrorResponse;
    // Some endpoints return { error } (genres), others { message } (movies)
    const msg = body.error ?? body.message ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List, search, and filter movies.
 * Maps 1:1 to GET /v1/movies.
 */
export async function listMovies(params: ListMoviesParams = {}): Promise<ListMoviesResponse> {
  const qs = buildQuery({
    q:          params.q,
    genre:      params.genre,       // array → repeated ?genre=A&genre=B
    min_rating: params.min_rating,
    year_min:   params.year_min,
    year_max:   params.year_max,
    sort:       params.sort,
    limit:      params.limit,
    offset:     params.offset,
  });
  return request<ListMoviesResponse>(`/movies${qs}`);
}

/**
 * Title autocomplete — returns up to `limit` matches ranked by quality.
 * Used by the search bar dropdown.
 */
export async function searchMovies(q: string, limit = 6): Promise<Movie[]> {
  if (!q.trim()) return [];
  const res = await listMovies({ q, limit, sort: 'rating_desc' });
  return res.data;
}

/**
 * Fetch a single movie by ID.
 * Used when the user selects an autocomplete result.
 */
export async function getMovie(id: number): Promise<Movie> {
  return request<Movie>(`/movies/${id}`);
}

/**
 * Add a new movie to the catalog via POST /v1/movies.
 * Throws on validation failures (422) with the API error message.
 */
export async function createMovie(input: MovieInput): Promise<Movie> {
  return request<Movie>('/movies', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/**
 * Pre-aggregated catalog statistics (total, avg rating, genres, years, etc.).
 * Always reflects the full catalog — no filters accepted.
 */
export async function getStats(): Promise<StatsResponse> {
  return request<StatsResponse>('/movies/stats');
}

/**
 * Canonical genre list for the Add Movie modal and filter bar.
 */
export async function getGenres(): Promise<string[]> {
  const res = await request<{ genres: string[] }>('/genres');
  return res.genres;
}

/**
 * Add a new genre to the catalog via POST /v1/genres.
 * Returns the created genre name (trimmed, as stored by the server).
 * Throws on validation (400) or duplicate (409) errors.
 */
export async function createGenre(name: string): Promise<string> {
  const res = await request<{ genre: string }>('/genres', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return res.genre;
}
