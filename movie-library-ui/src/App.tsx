import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Movie, StatsResponse, Filters } from './types';
import { listMovies, createMovie, getStats, getGenres } from './movie-library-service';
import type { MovieInput } from './types';

import { Topbar }         from './components/Topbar/Topbar';
import { StatsStrip }     from './components/StatsStrip/StatsStrip';
import { FilterBar }      from './components/FilterBar/FilterBar';
import { Leaderboard }    from './components/Leaderboard/Leaderboard';
import { TopGenresPanel } from './components/TopGenresPanel/TopGenresPanel';
import { ByYearPanel }    from './components/ByYearPanel/ByYearPanel';
import { AddMovieModal }  from './components/AddMovieModal/AddMovieModal';
import { SelectedToast }  from './components/SelectedToast/SelectedToast';

const DEFAULT_FILTERS: Filters = { genres: [], minRating: 0, yearMin: null, yearMax: null };

export default function App() {
  // ── Data from API ───────────────────────────────────────────────────────────
  const [movies, setMovies]         = useState<Movie[]>([]);
  const [stats, setStats]           = useState<StatsResponse | null>(null);
  const [genres, setGenres]         = useState<string[]>([]);
  const [loading, setLoading]       = useState(true);
  const [moviesError, setMoviesError] = useState(false);
  const [statsError, setStatsError]   = useState(false);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [techMode, setTechMode]   = useState(false);
  const [filters, setFilters]     = useState<Filters>(DEFAULT_FILTERS);
  const [addOpen, setAddOpen]         = useState(false);
  const [addInitialTitle, setAddInitialTitle] = useState('');
  const [selected, setSelected]   = useState<Movie | null>(null);

  // ── Initial load ─────────────────────────────────────────────────────────────
  const loadAll = useCallback(() => {
    setLoading(true);
    setMoviesError(false);
    setStatsError(false);
    // Each fetch is independent — a failure in one won't prevent the others
    // from rendering.
    const movies = listMovies({ sort: 'rating_desc', limit: 100 })
      .then(res => setMovies(res.data))
      .catch(err => { console.error('Failed to load movies:', err); setMoviesError(true); });
    const stats = getStats(5)
      .then(setStats)
      .catch(err => { console.error('Failed to load stats:', err); setStatsError(true); });
    const genres = getGenres()
      .then(setGenres)
      .catch(err => console.error('Failed to load genres:', err));
    // Keep the loading spinner up until all three settle.
    void Promise.allSettled([movies, stats, genres]).then(() => setLoading(false));
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // ── Re-fetch movies when tech-mode filters change ────────────────────────────
  useEffect(() => {
    if (!techMode) {
      // Reset to unfiltered when leaving tech mode
      void listMovies({ sort: 'rating_desc', limit: 100 }).then(r => setMovies(r.data));
      return;
    }
    const params = {
      sort: 'rating_desc' as const,
      limit: 100,
      genre: filters.genres.length > 0 ? filters.genres : undefined,
      min_rating: filters.minRating > 0 ? filters.minRating : undefined,
      year_min: filters.yearMin ?? undefined,
      year_max: filters.yearMax ?? undefined,
    };
    void listMovies(params).then(r => setMovies(r.data));
   
  }, [techMode, filters]);

  // ── Total unfiltered count (from stats) for FilterBar display ────────────────
  const totalCount = stats?.total ?? 0;

  // ── Leaderboard title changes based on filter state ──────────────────────────
  const hasActiveFilters =
    techMode && (filters.genres.length > 0 || filters.minRating > 0 || filters.yearMin !== null || filters.yearMax !== null);

  const leaderboardTitle    = hasActiveFilters ? 'Top-rated · filtered' : 'Top-rated movies';
  const leaderboardSubtitle = hasActiveFilters
    ? `Across ${movies.length} matched title${movies.length !== 1 ? 's' : ''} · sorted by rating ↓`
    : 'Across the entire library · sorted by rating ↓';

  // ── Key to force Leaderboard to reset pagination on filter change ─────────────
  const leaderboardKey = useMemo(
    () => JSON.stringify({ techMode, filters }),
    [techMode, filters],
  );

  // ── Add a new genre to the catalog, keep genres list sorted ─────────────────
  const handleGenreCreated = useCallback((genre: string) => {
    setGenres(gs => {
      const next = [...gs, genre];
      next.sort((a, b) => a.localeCompare(b));
      return next;
    });
  }, []);

  // ── Add a movie via the API, then refresh stats ───────────────────────────────
  const handleAdd = async (input: MovieInput) => {
    // Generate a fresh key for each submission so the server can deduplicate
    // accidental double-sends (e.g. two rapid clicks) without affecting
    // independent submissions made later.
    const idempotencyKey = crypto.randomUUID();
    const movie = await createMovie(input, idempotencyKey);
    // Optimistically prepend; re-sort by rating
    setMovies(ms => [...ms, movie].sort((a, b) => b.rating - a.rating));
    // Refresh stats so the tiles update
    const freshStats = await getStats(5);
    setStats(freshStats);
    setSelected(movie);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <Topbar
        onOpenAdd={(title) => { setAddInitialTitle(title ?? ''); setAddOpen(true); }}
        techMode={techMode}
        setTechMode={setTechMode}
        onSelectMovie={setSelected}
      />

      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '24px 32px 48px' }}>

        {/* Stats strip */}
        {stats ? (
          <StatsStrip stats={stats} />
        ) : statsError ? (
          <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 10, border: '1px solid rgba(214,60,46,.3)', background: 'rgba(214,60,46,.08)', color: 'var(--accent-2)', fontSize: 13 }}>
            ⚠ Stats unavailable — could not reach the server.
          </div>
        ) : (
          <div style={{ height: 100, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            Loading stats…
          </div>
        )}

        {/* Tech filter bar */}
        {techMode && (
          <FilterBar
            filters={filters}
            setFilters={setFilters}
            genres={genres}
            resultCount={movies.length}
            totalCount={totalCount}
          />
        )}

        {/* Main 2-col grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 20 }}>

          <Leaderboard
            key={leaderboardKey}
            movies={movies}
            title={leaderboardTitle}
            subtitle={leaderboardSubtitle}
            loading={loading}
            error={moviesError}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {stats && <TopGenresPanel stats={stats} />}
            {stats && <ByYearPanel stats={stats} />}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: 32, padding: '14px 18px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            color: 'var(--text-3)',
          }}
        >
          <span className="mono" style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase' }}>
            Movie Library · Internal Tools
          </span>
        </div>
      </div>

      <SelectedToast movie={selected} onClose={() => setSelected(null)} />
      <AddMovieModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={handleAdd}
        onGenreCreated={handleGenreCreated}
        genres={genres}
        initialTitle={addInitialTitle}
      />
    </>
  );
}
