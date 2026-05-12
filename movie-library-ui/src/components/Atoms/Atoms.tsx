// Tiny shared atoms: Star icon, Poster card, and button style presets.

import type { Movie } from '../../types';

// ---------------------------------------------------------------------------
// Star icon
// ---------------------------------------------------------------------------

export function Star({ size = 12, fill = 'var(--gold)' }: { size?: number; fill?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ display: 'inline-block', verticalAlign: '-2px', flexShrink: 0 }}
    >
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        fill={fill}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Poster — deterministic gradient based on movie id, no fake images
// ---------------------------------------------------------------------------

const PALETTES: [string, string, string][] = [
  ['#3a1f1a', '#7a3326', '#d4a64b'],
  ['#1d2a35', '#3b5a72', '#cda86a'],
  ['#2c1f33', '#5e3b6e', '#e1b89c'],
  ['#22302a', '#3d6a55', '#e7c66f'],
  ['#3b1f1f', '#a23a30', '#f0c984'],
  ['#1f1c2e', '#3e3a64', '#bfb1e6'],
  ['#2a2117', '#6a4d2b', '#d3b07a'],
  ['#15252e', '#2e6e7a', '#d6e1c4'],
];

function posterGradient(movie: Movie): string {
  const [a, b, c] = PALETTES[movie.id % PALETTES.length]!;
  return `linear-gradient(155deg, ${a} 0%, ${b} 60%, ${c} 130%)`;
}

interface PosterProps {
  movie: Movie;
  w?: number;
  h?: number;
  big?: boolean;
}

export function Poster({ movie, w = 56, h = 80, big = false }: PosterProps) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 4,
        flexShrink: 0,
        background: posterGradient(movie),
        boxShadow: '0 6px 18px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.06)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* vignette */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,.45) 100%)',
        }}
      />
      {/* title */}
      <div
        style={{
          position: 'absolute',
          left: big ? 8 : 5,
          right: big ? 8 : 5,
          bottom: big ? 8 : 5,
          fontSize: big ? 11 : 8.5,
          fontWeight: 700,
          lineHeight: 1.1,
          color: '#fff7ee',
          textShadow: '0 1px 2px rgba(0,0,0,.6)',
          letterSpacing: '.01em',
        }}
      >
        {movie.title}
      </div>
      {/* year */}
      <div
        style={{
          position: 'absolute',
          top: big ? 8 : 5,
          left: big ? 8 : 5,
          fontSize: big ? 9 : 7,
          fontFamily: 'JetBrains Mono, monospace',
          color: 'rgba(255,255,255,.7)',
        }}
      >
        {movie.year}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared button styles (objects so they're easy to spread)
// ---------------------------------------------------------------------------

export const ghostBtn: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  fontSize: 12,
  background: 'transparent',
  color: 'var(--text-2)',
  border: '1px solid var(--border-strong)',
  cursor: 'pointer',
};

export const primaryBtn: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  background: 'var(--accent)',
  color: '#fff7ee',
  border: 'none',
  cursor: 'pointer',
  boxShadow: '0 4px 14px rgba(214,60,46,.25)',
};

export const modalInput: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 8,
  background: 'var(--bg-2)',
  border: '1px solid var(--border-strong)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  fontSize: 14,
  outline: 'none',
};
