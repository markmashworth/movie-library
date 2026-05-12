import { useState, useEffect, useRef, useCallback } from 'react';
import type { Movie } from '../../types';
import { searchMovies } from '../../movie-library-service';
import { Poster, Star } from '../Atoms/Atoms';

interface TopbarProps {
  onOpenAdd: (initialTitle?: string) => void;
  techMode: boolean;
  setTechMode: (v: boolean) => void;
  onSelectMovie: (m: Movie) => void;
}

export function Topbar({ onOpenAdd, techMode, setTechMode, onSelectMovie }: TopbarProps) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [matches, setMatches] = useState<Movie[]>([]);
  const [total, setTotal] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  const runSearch = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setMatches([]); setTotal(0); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchMovies(query, 6);
        setMatches(results);
        setTotal(results.length); // approximate — good enough for dropdown footer
      } catch {
        setMatches([]);
      }
    }, 150);
  }, []);

  useEffect(() => { runSearch(q); }, [q, runSearch]);

  // ⌘K / ⌃K
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const pick = (m: Movie) => {
    onSelectMovie(m);
    setQ(m.title);
    setOpen(false);
  };

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        height: 64,
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        padding: '0 32px',
        background: 'rgba(13,10,7,.78)',
        backdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '.18em', color: 'var(--text)' }}>
          NETFLIX
        </div>
        <div
          style={{
            width: 6, height: 6, borderRadius: 99,
            background: 'var(--accent)', alignSelf: 'center',
            boxShadow: '0 0 12px var(--accent)',
          }}
        />
        <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '.18em', color: 'var(--text)', marginLeft: '5px' }}>
          Movie Library
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', flex: 1, maxWidth: 520, marginLeft: 16 }}>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            height: 38, padding: '0 14px', borderRadius: 8,
            background: 'var(--surface)',
            border: `1px solid ${open ? 'var(--border-strong)' : 'var(--border)'}`,
            transition: 'border-color .15s',
          }}
        >
          {/* Search icon */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-3)', flexShrink: 0 }}>
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={e => { setQ(e.target.value); setOpen(true); setHi(0); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, matches.length - 1)); }
              if (e.key === 'ArrowUp')   { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
              if (e.key === 'Enter' && matches[hi]) pick(matches[hi]);
              if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
            }}
            placeholder="Search the library by title…"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text)', fontFamily: 'inherit', fontSize: 14,
            }}
          />
          <span
            className="mono"
            style={{
              fontSize: 10, padding: '2px 6px', borderRadius: 4,
              border: '1px solid var(--border-strong)', color: 'var(--text-3)',
            }}
          >
            ⌘K
          </span>
        </div>

        {/* Dropdown */}
        {open && q.trim() && (
          <div
            style={{
              position: 'absolute', top: 44, left: 0, right: 0,
              background: 'var(--surface)',
              border: '1px solid var(--border-strong)',
              borderRadius: 10,
              boxShadow: 'var(--shadow)',
              overflow: 'hidden',
              zIndex: 60,
            }}
          >
            {matches.length === 0 ? (
              <div style={{ padding: 16, fontSize: 13, color: 'var(--text-2)' }}>
                No matches for <span style={{ color: 'var(--text)' }}>"{q}"</span>.
                <span
                  style={{ marginLeft: 8, color: 'var(--accent)', cursor: 'pointer' }}
                  onMouseDown={e => { e.preventDefault(); onOpenAdd(q); setOpen(false); }}
                >
                  + Add it →
                </span>
              </div>
            ) : (
              matches.map((m, i) => (
                <div
                  key={m.id}
                  onMouseDown={e => { e.preventDefault(); pick(m); }}
                  onMouseEnter={() => setHi(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px', cursor: 'pointer',
                    background: i === hi ? 'rgba(214,60,46,.08)' : 'transparent',
                    borderLeft: `2px solid ${i === hi ? 'var(--accent)' : 'transparent'}`,
                  }}
                >
                  <Poster movie={m} w={32} h={46} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.title}
                    </div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '.04em', marginTop: 2 }}>
                      {m.year} · {m.genres.join(' / ')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--gold)', fontWeight: 600 }}>
                    <Star size={11} /> {m.rating.toFixed(1)}
                  </div>
                </div>
              ))
            )}
            <div
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 12px', borderTop: '1px solid var(--border)',
                background: 'var(--bg-2)', fontSize: 11, color: 'var(--text-3)',
              }}
            >
              <span className="mono">↑↓ navigate · ↵ open · esc close</span>
              <span>{total} result{total !== 1 ? 's' : ''}</span>
            </div>
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* Advanced Search toggle */}
      <div
        role="switch"
        aria-checked={techMode}
        onClick={() => setTechMode(!techMode)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12, color: 'var(--text-2)', cursor: 'pointer',
          padding: '6px 12px', borderRadius: 999,
          border: `1px solid ${techMode ? 'var(--accent)' : 'var(--border)'}`,
          background: techMode ? 'var(--accent-soft)' : 'transparent',
          userSelect: 'none',
          transition: 'border-color .15s, background .15s',
        }}
      >
        <div
          style={{
            width: 26, height: 14, borderRadius: 99, position: 'relative',
            background: techMode ? 'var(--accent)' : 'rgba(239,230,212,.15)',
            transition: 'background .15s',
          }}
        >
          <div
            style={{
              position: 'absolute', top: 2, left: techMode ? 14 : 2,
              width: 10, height: 10, borderRadius: 99, background: '#fff7ee',
              transition: 'left .15s',
            }}
          />
        </div>
        <span className="mono" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: techMode ? 'var(--accent)' : 'var(--text-3)' }}>
          Advanced Search
        </span>
      </div>

      {/* Add movie button */}
      <button
        onClick={() => onOpenAdd()}
        style={{
          height: 38, padding: '0 16px', borderRadius: 8,
          background: 'var(--accent)', color: '#fff7ee',
          border: 'none', cursor: 'pointer',
          fontSize: 13, fontWeight: 600, letterSpacing: '.01em',
          display: 'flex', alignItems: 'center', gap: 6,
          boxShadow: '0 4px 14px rgba(214,60,46,.35)',
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 0, marginBottom: 1 }}>+</span> Add Movie
      </button>
    </div>
  );
}
