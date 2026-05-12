import type { StatsResponse } from '../../types';

interface TopGenresPanelProps {
  stats: StatsResponse;
}

export function TopGenresPanel({ stats }: TopGenresPanelProps) {
  const top5 = stats.top_genres;
  const maxCount = top5[0]?.count ?? 1;

  return (
    <div
      style={{
        background: 'var(--surface)',
        borderRadius: 14,
        border: '1px solid var(--border)',
        padding: '20px 22px',
      }}
    >
      <div className="mono" style={{ fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.18em', marginBottom: 4 }}>
        ◇ Distribution
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 14, letterSpacing: '-.01em', color: 'var(--text)' }}>
        Top 5 genres
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {top5.map((g, i) => (
          <div key={g.name}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)', width: 14 }}>{i + 1}</span>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{g.name}</span>
              </div>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{g.count}</span>
            </div>
            <div style={{ height: 4, background: 'rgba(239,230,212,.06)', borderRadius: 2, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${(g.count / maxCount) * 100}%`,
                  height: '100%',
                  background: i === 0 ? 'var(--accent)' : `rgba(214,60,46,${0.85 - i * 0.15})`,
                  borderRadius: 2,
                  transition: 'width .4s ease',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
