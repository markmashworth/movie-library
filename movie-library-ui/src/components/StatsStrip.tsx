import type { StatsResponse } from '../types';

interface StatsStripProps {
  stats: StatsResponse;
}

function StatTile({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        flex: 1,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '18px 20px',
        minWidth: 0,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {accent && (
        <div
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            background: 'linear-gradient(90deg, var(--accent), transparent)',
          }}
        />
      )}
      <div
        className="mono"
        style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.14em' }}
      >
        {label}
      </div>
      <div
        style={{
          fontWeight: 200,
          fontSize: 44,
          lineHeight: 1.05,
          color: 'var(--text)',
          marginTop: 6,
          fontFeatureSettings: '"tnum"',
          letterSpacing: '-.02em',
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-2)' }}>{sub}</div>
      )}
    </div>
  );
}

export function StatsStrip({ stats }: StatsStripProps) {
  const topGenre = stats.top_genres[0];
  const span = stats.max_year - stats.min_year;

  return (
    <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
      <StatTile
        label="Total movies"
        value={stats.total.toLocaleString()}
        accent
      />
      <StatTile
        label="Average rating"
        value={stats.avg_rating.toFixed(2)}
        sub="across all titles"
      />
      <StatTile
        label="Top genre"
        value={topGenre?.name ?? '—'}
        sub={topGenre ? `${topGenre.count} titles · ${Math.round((topGenre.count / stats.total) * 100)}%` : undefined}
      />
      <StatTile
        label="Genres tracked"
        value={String(stats.genre_count)}
        sub="unique"
      />
      <StatTile
        label="Year span"
        value={`${span}y`}
        sub={`${stats.min_year} → ${stats.max_year}`}
      />
    </div>
  );
}
