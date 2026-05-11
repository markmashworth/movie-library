import type { Movie } from '../types';
import { Poster, Star } from './atoms';

interface SelectedToastProps {
  movie: Movie | null;
  onClose: () => void;
}

export function SelectedToast({ movie, onClose }: SelectedToastProps) {
  if (!movie) return null;
  return (
    <div
      style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 80,
        width: 360, padding: 18,
        background: 'var(--surface)', borderRadius: 12,
        border: '1px solid var(--border-strong)',
        boxShadow: 'var(--shadow)',
        display: 'flex', gap: 14,
        animation: 'slideUp .2s ease-out',
      }}
    >
      <Poster movie={movie} w={64} h={92} big />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="mono" style={{ fontSize: 9, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.14em' }}>
          Found in library
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4, marginBottom: 4, color: 'var(--text)' }}>
          {movie.title}
        </div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>
          {movie.year} · {movie.genres.join(' / ')}
        </div>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Star size={12} />
          <span style={{ color: 'var(--gold)', fontWeight: 600, fontSize: 14 }}>
            {movie.rating.toFixed(1)}
          </span>
        </div>
      </div>
      <button
        onClick={onClose}
        style={{
          background: 'transparent', border: 'none', color: 'var(--text-3)',
          cursor: 'pointer', fontSize: 18, alignSelf: 'flex-start',
          lineHeight: 1, padding: 2,
        }}
      >
        ×
      </button>
    </div>
  );
}
