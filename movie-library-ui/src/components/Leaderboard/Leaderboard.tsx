import { useState } from 'react';
import type { Movie } from '../../types';
import { Poster, Star, ghostBtn, primaryBtn } from '../Atoms/Atoms';

function RankNumber({ n }: { n: number }) {
  return (
    <div
      style={{
        fontWeight: 200,
        fontSize: 56,
        lineHeight: 1,
        color: n <= 3 ? 'var(--accent)' : 'var(--text-3)',
        fontFeatureSettings: '"tnum"',
        letterSpacing: '-.04em',
        width: 60,
        textAlign: 'center',
        flexShrink: 0,
        textShadow: n <= 3 ? '0 0 30px rgba(214,60,46,.4)' : 'none',
      }}
    >
      {String(n).padStart(2, '0')}
    </div>
  );
}

function LeaderboardRow({ rank, movie }: { rank: number; movie: Movie }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 18,
        padding: '14px 20px',
        borderRadius: 8,
        background: hovered ? 'rgba(239,230,212,.03)' : 'transparent',
        transition: 'background .12s',
        cursor: 'default',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <RankNumber n={rank} />
      <Poster movie={movie} w={48} h={68} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
          {movie.title}
        </div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
          {movie.year} · {movie.genres.join(' / ')}
        </div>
      </div>
      <div
        style={{
          display: 'flex', alignItems: 'baseline', gap: 6,
          padding: '8px 14px', borderRadius: 6,
          background: 'rgba(212,166,75,.08)', border: '1px solid rgba(212,166,75,.18)',
        }}
      >
        <Star size={13} />
        <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--gold)', fontFeatureSettings: '"tnum"' }}>
          {movie.rating.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

interface LeaderboardProps {
  movies: Movie[];
  title: string;
  subtitle: string;
  loading?: boolean;
  error?: boolean;
}

export function Leaderboard({ movies, title, subtitle, loading = false, error = false }: LeaderboardProps) {
  const [shown, setShown] = useState(5);
  const total = movies.length;
  const canMore = shown < total;

  // Reset shown when the movie set changes (e.g. filter changed)
  // We reset by keying the parent — no need to handle explicitly here.

  return (
    <div
      style={{
        background: 'var(--surface)',
        borderRadius: 14,
        border: '1px solid var(--border)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '20px 24px',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.18em', marginBottom: 6 }}>
            ★ Ranked
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.01em', color: 'var(--text)' }}>
            {title}
          </div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
            {subtitle}
          </div>
        </div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>
          Showing{' '}
          <span style={{ color: 'var(--text)' }}>1–{Math.min(shown, total)}</span>
          {' '}of {total}
        </div>
      </div>

      {/* Rows */}
      <div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            Loading…
          </div>
        ) : error ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--accent-2)', fontSize: 13 }}>
            ⚠ Could not load movies! Please try again later.
          </div>
        ) : total === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>
            No movies match your filters.
          </div>
        ) : (
          movies.slice(0, shown).map((m, i) => (
            <div key={m.id}>
              <LeaderboardRow rank={i + 1} movie={m} />
              {i < shown - 1 && i < total - 1 && (
                <div style={{ height: 1, background: 'var(--border)', margin: '0 20px' }} />
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '14px 24px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-2)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>
          Each click reveals the next 5 in rank order.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {shown > 5 && (
            <button onClick={() => setShown(5)} style={ghostBtn}>↺ Reset</button>
          )}
          <button
            disabled={!canMore}
            onClick={() => setShown(s => Math.min(s + 5, total))}
            style={{ ...primaryBtn, opacity: canMore ? 1 : 0.35, cursor: canMore ? 'pointer' : 'default' }}
          >
            Show next 5 →
          </button>
        </div>
      </div>
    </div>
  );
}
