import { useState } from 'react';
import type { Filters } from '../types';

interface FilterBarProps {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  genres: string[];
  resultCount: number;
  totalCount: number;
}

function FilterChip({
  active,
  children,
  onClick,
  removable = false,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  removable?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 999,
        background: active ? 'var(--accent-soft)' : 'transparent',
        color: active ? 'var(--accent-2)' : 'var(--text-2)',
        border: `1px solid ${active ? 'rgba(214,60,46,.45)' : 'var(--border-strong)'}`,
        fontSize: 12, fontWeight: 500, cursor: 'pointer',
        fontFamily: 'inherit', whiteSpace: 'nowrap',
        transition: 'background .12s, color .12s, border-color .12s',
      }}
    >
      {children}
      {removable && <span style={{ opacity: .7, marginLeft: 2, fontSize: 14, lineHeight: 1 }}>×</span>}
    </button>
  );
}

function Dropdown({
  open,
  children,
  width = 260,
  onClose,
}: {
  open: boolean;
  children: React.ReactNode;
  width?: number;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
      <div
        style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0,
          width, background: 'var(--surface)',
          border: '1px solid var(--border-strong)', borderRadius: 10,
          boxShadow: 'var(--shadow)', padding: 12, zIndex: 40,
        }}
      >
        {children}
      </div>
    </>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1, padding: '6px 10px', borderRadius: 6,
  background: 'var(--bg-2)', border: '1px solid var(--border-strong)',
  color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
  outline: 'none', minWidth: 0,
};

type MenuId = 'genre' | 'rating' | 'year' | null;

export function FilterBar({ filters, setFilters, genres, resultCount, totalCount }: FilterBarProps) {
  const [openMenu, setOpenMenu] = useState<MenuId>(null);
  const close = () => setOpenMenu(null);

  const toggleGenre = (g: string) => {
    setFilters(f => ({
      ...f,
      genres: f.genres.includes(g) ? f.genres.filter(x => x !== g) : [...f.genres, g],
    }));
  };

  const hasFilter =
    filters.genres.length > 0 || filters.minRating > 0 || filters.yearMin !== null || filters.yearMax !== null;

  return (
    <div
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '14px 18px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        position: 'relative',
      }}
    >
      {/* Label */}
      <div
        className="mono"
        style={{
          fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.18em',
          marginRight: 6, display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--accent)', display: 'inline-block' }} />
        Advanced Search
      </div>

      {/* Genre */}
      <div style={{ position: 'relative' }}>
        <FilterChip
          active={openMenu === 'genre' || filters.genres.length > 0}
          onClick={() => setOpenMenu(openMenu === 'genre' ? null : 'genre')}
        >
          Genre
          {filters.genres.length > 0 && (
            <span className="mono" style={{ marginLeft: 2, color: 'var(--accent)' }}>· {filters.genres.length}</span>
          )}
          <span style={{ fontSize: 9, opacity: .7 }}>▾</span>
        </FilterChip>
        <Dropdown open={openMenu === 'genre'} onClose={close} width={300}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.14em', marginBottom: 8 }}>
            Pick any · multi
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {genres.map(g => {
              const active = filters.genres.includes(g);
              return (
                <button
                  key={g}
                  onClick={() => toggleGenre(g)}
                  style={{
                    padding: '6px 12px', borderRadius: 999, fontSize: 12,
                    background: active ? 'var(--accent)' : 'transparent',
                    color: active ? '#fff7ee' : 'var(--text-2)',
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--border-strong)'}`,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {g}
                </button>
              );
            })}
          </div>
        </Dropdown>
      </div>

      {/* Min rating */}
      <div style={{ position: 'relative' }}>
        <FilterChip
          active={openMenu === 'rating' || filters.minRating > 0}
          onClick={() => setOpenMenu(openMenu === 'rating' ? null : 'rating')}
        >
          Min rating
          {filters.minRating > 0 && (
            <span className="mono" style={{ color: 'var(--accent)' }}>· ★ {filters.minRating.toFixed(1)}</span>
          )}
          <span style={{ fontSize: 9, opacity: .7 }}>▾</span>
        </FilterChip>
        <Dropdown open={openMenu === 'rating'} onClose={close} width={280}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.14em' }}>Minimum rating</span>
            <span style={{ fontSize: 16, color: 'var(--accent)', fontWeight: 600 }}>★ {filters.minRating.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="10"
            step="0.1"
            value={filters.minRating}
            onChange={e => setFilters(f => ({ ...f, minRating: parseFloat(e.target.value) }))}
          />
          <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
            <span>0.0</span><span>5.0</span><span>10.0</span>
          </div>
        </Dropdown>
      </div>

      {/* Year range */}
      <div style={{ position: 'relative' }}>
        <FilterChip
          active={openMenu === 'year' || filters.yearMin !== null || filters.yearMax !== null}
          onClick={() => setOpenMenu(openMenu === 'year' ? null : 'year')}
        >
          Year
          {(filters.yearMin !== null || filters.yearMax !== null) && (
            <span className="mono" style={{ color: 'var(--accent)' }}>
              · {filters.yearMin ?? '…'} – {filters.yearMax ?? '…'}
            </span>
          )}
          <span style={{ fontSize: 9, opacity: .7 }}>▾</span>
        </FilterChip>
        <Dropdown open={openMenu === 'year'} onClose={close} width={260}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.14em', marginBottom: 10 }}>
            Year range
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="number"
              min="1888"
              max={new Date().getFullYear() + 3}
              placeholder="From"
              value={filters.yearMin ?? ''}
              onChange={e => setFilters(f => ({ ...f, yearMin: e.target.value ? parseInt(e.target.value) : null }))}
              style={inputStyle}
            />
            <span style={{ color: 'var(--text-3)' }}>—</span>
            <input
              type="number"
              min="1888"
              max={new Date().getFullYear() + 3}
              placeholder="To"
              value={filters.yearMax ?? ''}
              onChange={e => setFilters(f => ({ ...f, yearMax: e.target.value ? parseInt(e.target.value) : null }))}
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {([
              [2020, 2030, 'Recent'],
              [2010, 2019, '2010s'],
              [2000, 2009, '2000s'],
              [1990, 1999, '90s'],
              [1980, 1989, '80s'],
            ] as [number, number, string][]).map(([a, b, l]) => (
              <button
                key={l}
                onClick={() => setFilters(f => ({ ...f, yearMin: a, yearMax: b }))}
                style={{
                  padding: '4px 10px', fontSize: 11, borderRadius: 99,
                  background: 'transparent', border: '1px solid var(--border-strong)',
                  color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </Dropdown>
      </div>

      <div style={{ width: 1, height: 18, background: 'var(--border-strong)', margin: '0 4px' }} />

      {/* Active chips */}
      {filters.genres.map(g => (
        <FilterChip key={g} active removable onClick={() => setFilters(f => ({ ...f, genres: f.genres.filter(x => x !== g) }))}>{g}</FilterChip>
      ))}
      {filters.minRating > 0 && (
        <FilterChip active removable onClick={() => setFilters(f => ({ ...f, minRating: 0 }))}>★ ≥ {filters.minRating.toFixed(1)}</FilterChip>
      )}
      {(filters.yearMin !== null || filters.yearMax !== null) && (
        <FilterChip active removable onClick={() => setFilters(f => ({ ...f, yearMin: null, yearMax: null }))}>
          {filters.yearMin ?? '…'} – {filters.yearMax ?? '…'}
        </FilterChip>
      )}

      <div style={{ flex: 1 }} />

      <div className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{resultCount.toLocaleString()}</span>
        <span style={{ color: 'var(--text-3)' }}> / {totalCount.toLocaleString()} matched</span>
      </div>
      {hasFilter && (
        <button
          onClick={() => setFilters({ genres: [], minRating: 0, yearMin: null, yearMax: null })}
          style={{
            padding: '6px 12px', fontSize: 12, borderRadius: 999,
            background: 'transparent', border: '1px solid var(--border-strong)',
            color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Clear all
        </button>
      )}
    </div>
  );
}
