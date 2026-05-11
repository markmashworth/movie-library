import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Movie, StatsResponse, Filters } from './types';
import { listMovies, createMovie, getStats, getGenres } from './movie-library-service';
import type { MovieInput } from './types';

import { Topbar }         from './components/Topbar';
import { StatsStrip }     from './components/StatsStrip';
import { FilterBar }      from './components/FilterBar';
import { Leaderboard }    from './components/Leaderboard';
import { TopGenresPanel } from './components/TopGenresPanel';
import { ByYearPanel }    from './components/ByYearPanel';
import { AddMovieModal }  from './components/AddMovieModal';
import { SelectedToast }  from './components/SelectedToast';

const DEFAULT_FILTERS: Filters = { genres: [], minRating: 0, yearMin: null, yearMax: null };

export default function App() {
  // ── Data from API ───────────────────────────────────────────────────────────
  const [movies, setMovies]   = useState<Movie[]>([]);
  const [stats, setStats]     = useState<StatsResponse | null>(null);
  const [genres, setGenres]   = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [techMode, setTechMode]   = useState(false);
  const [filters, setFilters]     = useState<Filters>(DEFAULT_FILTERS);
  const [addOpen, setAddOpen]         = useState(false);
  const [addInitialTitle, setAddInitialTitle] = useState('');
  const [selected, setSelected]   = useState<Movie | null>(null);

  // ── Initial load ─────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [moviesRes, statsRes, genresRes] = await Promise.all([
        listMovies({ sort: 'rating_desc', limit: 100 }),
        getStats(),
        getGenres(),
      ]);
      setMovies(moviesRes.data);
      setStats(statsRes);
      setGenres(genresRes);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const freshStats = await getStats();
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
