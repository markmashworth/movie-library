import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  listMovies,
  searchMovies,
  getMovie,
  createMovie,
  getStats,
  getGenres,
  createGenre,
} from './movie-library-service'
import type { ListMoviesResponse, Movie, StatsResponse } from './types'

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function respondOk(body: unknown): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  })
}

function respondErr(status: number, body: unknown = {}): void {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: () => Promise.resolve(body),
  })
}

const emptyList: ListMoviesResponse = { data: [], total: 0, limit: 100, offset: 0 }

const sampleMovie: Movie = { id: 1, title: 'Inception', year: 2010, rating: 8.8, genres: ['Action'] }

const sampleStats: StatsResponse = {
  total: 10,
  avg_rating: 7.5,
  genre_count: 5,
  min_year: 2000,
  max_year: 2023,
  top_genres: [{ name: 'Drama', count: 4 }],
  by_year: [],
}

beforeEach(() => {
  mockFetch.mockClear()
})

// ---------------------------------------------------------------------------
// buildQuery — tested indirectly through listMovies
// ---------------------------------------------------------------------------

describe('buildQuery (via listMovies)', () => {
  it('omits undefined params from the query string', async () => {
    respondOk(emptyList)
    await listMovies({ q: undefined, genre: undefined, min_rating: undefined })
    expect(mockFetch.mock.calls[0][0] as string).toBe('/api/v1/movies')
  })

  it('omits null params from the query string', async () => {
    respondOk(emptyList)
    // year_min accepts number | undefined; pass undefined to simulate null-like absence
    await listMovies({ year_min: undefined, year_max: undefined })
    expect(mockFetch.mock.calls[0][0] as string).toBe('/api/v1/movies')
  })

  it('omits empty-string params from the query string', async () => {
    respondOk(emptyList)
    await listMovies({ q: '' })
    expect(mockFetch.mock.calls[0][0] as string).toBe('/api/v1/movies')
  })

  it('serialises a single scalar param correctly', async () => {
    respondOk(emptyList)
    await listMovies({ q: 'batman' })
    expect(mockFetch.mock.calls[0][0] as string).toBe('/api/v1/movies?q=batman')
  })

  it('serialises multiple scalar params correctly', async () => {
    respondOk(emptyList)
    await listMovies({ q: 'batman', limit: 10, offset: 5 })
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('q=batman')
    expect(url).toContain('limit=10')
    expect(url).toContain('offset=5')
  })

  it('repeats array values as separate query params (genre=A&genre=B)', async () => {
    respondOk(emptyList)
    await listMovies({ genre: ['Action', 'Drama'] })
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('genre=Action')
    expect(url).toContain('genre=Drama')
  })

  it('returns an empty query string when all params are absent', async () => {
    respondOk(emptyList)
    await listMovies({})
    expect(mockFetch.mock.calls[0][0] as string).toBe('/api/v1/movies')
  })

  it('prefixes with "?" when at least one param is present', async () => {
    respondOk(emptyList)
    await listMovies({ limit: 5 })
    expect((mockFetch.mock.calls[0][0] as string).startsWith('/api/v1/movies?')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// listMovies
// ---------------------------------------------------------------------------

describe('listMovies', () => {
  it('calls GET /api/v1/movies with no query string when called with no params', async () => {
    respondOk(emptyList)
    await listMovies()
    expect(mockFetch.mock.calls[0][0] as string).toBe('/api/v1/movies')
  })

  it('includes q param when provided', async () => {
    respondOk(emptyList)
    await listMovies({ q: 'hero' })
    expect(mockFetch.mock.calls[0][0] as string).toContain('q=hero')
  })

  it('includes genre param (repeated) when an array is provided', async () => {
    respondOk(emptyList)
    await listMovies({ genre: ['Sci-Fi', 'Thriller'] })
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('genre=Sci-Fi')
    expect(url).toContain('genre=Thriller')
  })

  it('includes min_rating when provided', async () => {
    respondOk(emptyList)
    await listMovies({ min_rating: 7.5 })
    expect(mockFetch.mock.calls[0][0] as string).toContain('min_rating=7.5')
  })

  it('includes year_min and year_max when provided', async () => {
    respondOk(emptyList)
    await listMovies({ year_min: 2000, year_max: 2020 })
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('year_min=2000')
    expect(url).toContain('year_max=2020')
  })

  it('includes sort param when provided', async () => {
    respondOk(emptyList)
    await listMovies({ sort: 'rating_desc' })
    expect(mockFetch.mock.calls[0][0] as string).toContain('sort=rating_desc')
  })

  it('includes limit and offset when provided', async () => {
    respondOk(emptyList)
    await listMovies({ limit: 20, offset: 40 })
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('limit=20')
    expect(url).toContain('offset=40')
  })

  it('returns the parsed ListMoviesResponse on a 200 response', async () => {
    const response: ListMoviesResponse = { data: [sampleMovie], total: 1, limit: 100, offset: 0 }
    respondOk(response)
    const result = await listMovies()
    expect(result).toEqual(response)
  })

  it('throws an error using body.message when the response is not ok', async () => {
    respondErr(422, { message: 'Validation failed' })
    await expect(listMovies()).rejects.toThrow('Validation failed')
  })

  it('throws an error using body.error when message is absent', async () => {
    respondErr(404, { error: 'Not found' })
    await expect(listMovies()).rejects.toThrow('Not found')
  })

  it('throws a generic "HTTP <status>" error when the body has neither field', async () => {
    respondErr(500, {})
    await expect(listMovies()).rejects.toThrow('HTTP 500')
  })
})

// ---------------------------------------------------------------------------
// searchMovies
// ---------------------------------------------------------------------------

describe('searchMovies', () => {
  it('returns an empty array immediately when query is an empty string', async () => {
    const result = await searchMovies('')
    expect(result).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns an empty array immediately when query is whitespace-only', async () => {
    const result = await searchMovies('   ')
    expect(result).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('calls listMovies with sort=rating_desc and the provided limit', async () => {
    respondOk(emptyList)
    await searchMovies('batman', 3)
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('sort=rating_desc')
    expect(url).toContain('limit=3')
  })

  it('defaults limit to 6 when not specified', async () => {
    respondOk(emptyList)
    await searchMovies('batman')
    expect(mockFetch.mock.calls[0][0] as string).toContain('limit=6')
  })

  it('returns the data array from the listMovies response', async () => {
    respondOk({ data: [sampleMovie], total: 1, limit: 6, offset: 0 })
    const result = await searchMovies('inception')
    expect(result).toEqual([sampleMovie])
  })
})

// ---------------------------------------------------------------------------
// getMovie
// ---------------------------------------------------------------------------

describe('getMovie', () => {
  it('calls GET /api/v1/movies/:id with the correct id', async () => {
    respondOk(sampleMovie)
    await getMovie(42)
    expect(mockFetch.mock.calls[0][0] as string).toBe('/api/v1/movies/42')
  })

  it('returns the parsed Movie on a 200 response', async () => {
    respondOk(sampleMovie)
    const result = await getMovie(1)
    expect(result).toEqual(sampleMovie)
  })

  it('throws an error when the server returns a non-ok status', async () => {
    respondErr(404, { message: 'Movie not found' })
    await expect(getMovie(999)).rejects.toThrow('Movie not found')
  })
})

// ---------------------------------------------------------------------------
// createMovie
// ---------------------------------------------------------------------------

describe('createMovie', () => {
  const input = { title: 'Dune', year: 2021, rating: 8.0, genres: ['Sci-Fi'] }

  it('calls POST /api/v1/movies with the correct JSON body', async () => {
    respondOk(sampleMovie)
    await createMovie(input)
    const init = mockFetch.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify(input))
  })

  it('sets Content-Type: application/json header', async () => {
    respondOk(sampleMovie)
    await createMovie(input)
    const init = mockFetch.mock.calls[0][1] as RequestInit & { headers: Record<string, string> }
    expect(init.headers['Content-Type']).toBe('application/json')
  })

  it('includes the Idempotency-Key header when idempotencyKey is provided', async () => {
    respondOk(sampleMovie)
    await createMovie(input, 'test-key-123')
    const init = mockFetch.mock.calls[0][1] as RequestInit & { headers: Record<string, string> }
    expect(init.headers['Idempotency-Key']).toBe('test-key-123')
  })

  it('does not include the Idempotency-Key header when idempotencyKey is omitted', async () => {
    respondOk(sampleMovie)
    await createMovie(input)
    const init = mockFetch.mock.calls[0][1] as RequestInit & { headers: Record<string, string> }
    expect(init.headers['Idempotency-Key']).toBeUndefined()
  })

  it('returns the created Movie on a 200 response', async () => {
    respondOk(sampleMovie)
    const result = await createMovie(input)
    expect(result).toEqual(sampleMovie)
  })

  it('throws with the API error message on a 422 validation failure', async () => {
    respondErr(422, { message: 'Rating out of range' })
    await expect(createMovie(input)).rejects.toThrow('Rating out of range')
  })

  it('throws with the API error message on a 409 conflict response', async () => {
    respondErr(409, { error: 'Duplicate title' })
    await expect(createMovie(input)).rejects.toThrow('Duplicate title')
  })
})

// ---------------------------------------------------------------------------
// getStats
// ---------------------------------------------------------------------------

describe('getStats', () => {
  it('calls GET /api/v1/movies/stats with no query string when topGenresLimit is omitted', async () => {
    respondOk(sampleStats)
    await getStats()
    expect(mockFetch.mock.calls[0][0] as string).toBe('/api/v1/movies/stats')
  })

  it('includes the top_genres_limit param when topGenresLimit is provided', async () => {
    respondOk(sampleStats)
    await getStats(10)
    expect(mockFetch.mock.calls[0][0] as string).toContain('top_genres_limit=10')
  })

  it('returns the parsed StatsResponse on a 200 response', async () => {
    respondOk(sampleStats)
    const result = await getStats()
    expect(result).toEqual(sampleStats)
  })

  it('throws an error when the server returns a non-ok status', async () => {
    respondErr(500, { message: 'Internal server error' })
    await expect(getStats()).rejects.toThrow('Internal server error')
  })
})

// ---------------------------------------------------------------------------
// getGenres
// ---------------------------------------------------------------------------

describe('getGenres', () => {
  it('calls GET /api/v1/genres', async () => {
    respondOk({ genres: [] })
    await getGenres()
    expect(mockFetch.mock.calls[0][0] as string).toBe('/api/v1/genres')
  })

  it('unwraps and returns the genres array from the response object', async () => {
    respondOk({ genres: ['Action', 'Drama', 'Comedy'] })
    const result = await getGenres()
    expect(result).toEqual(['Action', 'Drama', 'Comedy'])
  })

  it('throws an error when the server returns a non-ok status', async () => {
    respondErr(503, { error: 'Service unavailable' })
    await expect(getGenres()).rejects.toThrow('Service unavailable')
  })
})

// ---------------------------------------------------------------------------
// createGenre
// ---------------------------------------------------------------------------

describe('createGenre', () => {
  it('calls POST /api/v1/genres with { name } as the JSON body', async () => {
    respondOk({ genre: 'Horror' })
    await createGenre('Horror')
    const init = mockFetch.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ name: 'Horror' }))
  })

  it('sets Content-Type: application/json header', async () => {
    respondOk({ genre: 'Horror' })
    await createGenre('Horror')
    const init = mockFetch.mock.calls[0][1] as RequestInit & { headers: Record<string, string> }
    expect(init.headers['Content-Type']).toBe('application/json')
  })

  it('returns the created genre string unwrapped from { genre }', async () => {
    respondOk({ genre: 'Horror' })
    const result = await createGenre('horror')
    expect(result).toBe('Horror')
  })

  it('throws with the API error message on a 400 validation failure', async () => {
    respondErr(400, { message: 'Genre name too short' })
    await expect(createGenre('')).rejects.toThrow('Genre name too short')
  })

  it('throws with the API error message on a 409 duplicate response', async () => {
    respondErr(409, { error: 'Genre already exists' })
    await expect(createGenre('Drama')).rejects.toThrow('Genre already exists')
  })
})

// ---------------------------------------------------------------------------
// Shared request error handling
// ---------------------------------------------------------------------------

describe('request error handling', () => {
  it('uses body.message as the thrown message when present', async () => {
    respondErr(400, { error: 'bad input', message: 'ignored' })
    await expect(listMovies()).rejects.toThrow('ignored')
  })

  it('falls back to body.message when body.error is absent', async () => {
    respondErr(422, { message: 'validation failed' })
    await expect(listMovies()).rejects.toThrow('validation failed')
  })

  it('falls back to "HTTP <status>" when neither error nor message is present', async () => {
    respondErr(503, {})
    await expect(listMovies()).rejects.toThrow('HTTP 503')
  })

  it('handles a non-JSON response body without throwing an additional error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    })
    await expect(listMovies()).rejects.toThrow('HTTP 500')
  })
})
