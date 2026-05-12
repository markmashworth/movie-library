import { useState } from 'react';
import type { StatsResponse } from '../../types';

interface ByYearPanelProps {
  stats: StatsResponse;
}

export function ByYearPanel({ stats }: ByYearPanelProps) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const byYear = stats.by_year;
  const maxCount = Math.max(...byYear.map(b => b.count), 1);

  return (
    <div
      style={{
        background: 'var(--surface)',
        borderRadius: 14,
        border: '1px solid var(--border)',
        padding: '20px 22px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
        <div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.18em', marginBottom: 4 }}>
            ◇ Timeline
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.01em', color: 'var(--text)' }}>
            Movies by year
          </div>
        </div>
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>{byYear.length} years</span>
      </div>

      <div
        style={{
          display: 'flex', flexDirection: 'column', gap: 0,
          maxHeight: 360, overflowY: 'auto',
          marginRight: -10, paddingRight: 10,
        }}
      >
        {byYear.map(bucket => {
          const open = expanded === bucket.year;
          return (
            <div key={bucket.year} style={{ borderBottom: '1px solid var(--border)' }}>
              <div
                onClick={() => setExpanded(open ? null : bucket.year)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 0', cursor: 'pointer',
                }}
              >
                <span style={{
                  fontSize: 9, color: 'var(--text-3)', width: 10,
                  display: 'inline-block',
                  transform: open ? 'rotate(90deg)' : 'rotate(0)',
                  transition: 'transform .15s',
                  userSelect: 'none',
                }}>
                  ▶
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, fontFeatureSettings: '"tnum"', width: 38, color: 'var(--text)' }}>
                  {bucket.year}
                </span>
                <div style={{ flex: 1, height: 4, background: 'rgba(239,230,212,.06)', borderRadius: 2, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${(bucket.count / maxCount) * 100}%`,
                      height: '100%',
                      background: 'var(--accent)',
                      borderRadius: 2,
                      transition: 'width .3s ease',
                    }}
                  />
                </div>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)', width: 24, textAlign: 'right' }}>
                  {bucket.count}
                </span>
              </div>

              {open && (
                <div style={{ paddingLeft: 22, paddingBottom: 10, paddingTop: 4 }}>
                  {bucket.movies.map(m => (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '4px 0', fontSize: 12, color: 'var(--text-2)',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.title}
                      </span>
                      <span className="mono" style={{ color: 'var(--gold)', marginLeft: 8, flexShrink: 0 }}>
                        ★ {m.rating.toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
