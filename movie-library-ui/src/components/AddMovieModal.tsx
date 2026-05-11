import { useState, useEffect, useRef } from 'react';
import type { MovieInput } from '../types';
import { ghostBtn, primaryBtn, modalInput } from './atoms';
import { createGenre } from '../movie-library-service';

interface AddMovieModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (input: MovieInput) => Promise<void>;
  onGenreCreated: (genre: string) => void;
  genres: string[];
  initialTitle?: string;
}

function Field({
  label,
  required = false,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <label className="mono" style={{ fontSize: 10, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.14em' }}>
          {label}{required && <span style={{ color: 'var(--accent)' }}> *</span>}
        </label>
        {hint && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function AddMovieModal({ open, onClose, onAdd, onGenreCreated, genres, initialTitle = '' }: AddMovieModalProps) {
  const [title, setTitle]   = useState('');
  const [year, setYear]     = useState('');
  const [rating, setRating] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);

  // Inline "add genre" state
  const [addingGenre, setAddingGenre]     = useState(false);
  const [newGenreName, setNewGenreName]   = useState('');
  const [genreAddError, setGenreAddError] = useState('');
  const [genreSaving, setGenreSaving]     = useState(false);
  const genreInputRef = useRef<HTMLInputElement>(null);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
    } else {
      setTitle(''); setYear(''); setRating('');
      setSelectedGenres([]); setError(''); setSaving(false);
      setAddingGenre(false); setNewGenreName(''); setGenreAddError(''); setGenreSaving(false);
    }
  }, [open, initialTitle]);

  // Focus the genre input when the inline add form opens
  useEffect(() => {
    if (addingGenre) {
      setTimeout(() => genreInputRef.current?.focus(), 0);
    }
  }, [addingGenre]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  const toggleGenre = (g: string) => {
    setSelectedGenres(gs => gs.includes(g) ? gs.filter(x => x !== g) : [...gs, g]);
  };

  const openGenreAdd = () => {
    setAddingGenre(true);
    setNewGenreName('');
    setGenreAddError('');
  };

  const cancelGenreAdd = () => {
    setAddingGenre(false);
    setNewGenreName('');
    setGenreAddError('');
  };

  const submitGenre = async () => {
    const name = newGenreName.trim();
    if (!name) return;
    setGenreSaving(true);
    setGenreAddError('');
    try {
      const created = await createGenre(name);
      onGenreCreated(created);
      setSelectedGenres(gs => [...gs, created]);
      setAddingGenre(false);
      setNewGenreName('');
    } catch (err) {
      setGenreAddError((err as Error).message ?? 'Failed to add genre.');
    } finally {
      setGenreSaving(false);
    }
  };

  const submit = async () => {
    setError('');
    if (!title.trim()) return setError('Title is required.');
    const y = parseInt(year);
    if (!y || y < 1900 || y > 2030) return setError('Enter a valid year (1900–2030).');
    const r = parseFloat(rating);
    if (isNaN(r) || r < 0 || r > 10) return setError('Rating must be between 0 and 10.');
    if (selectedGenres.length === 0) return setError('Pick at least one genre.');

    setSaving(true);
    try {
      await onAdd({ title: title.trim(), year: y, rating: Math.round(r * 10) / 10, genres: selectedGenres });
      onClose();
    } catch (err) {
      setError((err as Error).message ?? 'Failed to save. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(8,6,4,.78)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, animation: 'fadeIn .15s ease-out',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 540, maxHeight: '90vh', overflowY: 'auto',
          background: 'var(--surface)',
          border: '1px solid var(--border-strong)',
          borderRadius: 16, padding: 28,
          boxShadow: '0 30px 80px rgba(0,0,0,.7)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
          <div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.18em', marginBottom: 6 }}>
              ＋ New entry
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.01em', color: 'var(--text)' }}>Add a movie</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>
              Adds to the in-app catalog — won't touch Drive.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 4 }}
          >
            ×
          </button>
        </div>

        <div style={{ height: 1, background: 'var(--border)', margin: '20px 0' }} />

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="Title" required>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. The Long Quiet Hour"
              style={modalInput}
              autoFocus
            />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Year" required>
              <input
                value={year}
                onChange={e => setYear(e.target.value)}
                placeholder="2025"
                type="number"
                min="1900"
                max="2030"
                style={modalInput}
              />
            </Field>
            <Field label="Rating" required>
              <input
                value={rating}
                onChange={e => setRating(e.target.value)}
                placeholder="★ 0–10"
                type="number"
                step="0.1"
                min="0"
                max="10"
                style={modalInput}
              />
            </Field>
          </div>
          <Field label="Genres" required hint="Pick any number">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {genres.map(g => {
                const active = selectedGenres.includes(g);
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => toggleGenre(g)}
                    style={{
                      padding: '6px 12px', borderRadius: 999, fontSize: 12,
                      background: active ? 'var(--accent)' : 'transparent',
                      color: active ? '#fff7ee' : 'var(--text-2)',
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--border-strong)'}`,
                      cursor: 'pointer', fontFamily: 'inherit',
                      fontWeight: active ? 600 : 400,
                      transition: 'background .1s, color .1s',
                    }}
                  >
                    {g}
                  </button>
                );
              })}

              {/* Inline add-genre toggle */}
              {!addingGenre ? (
                <button
                  type="button"
                  onClick={openGenreAdd}
                  title="Add a new genre to the catalog"
                  style={{
                    padding: '6px 12px', borderRadius: 999, fontSize: 12,
                    background: 'transparent',
                    color: 'var(--text-3)',
                    border: '1px dashed var(--border-strong)',
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'color .1s, border-color .1s',
                  }}
                >
                  ＋ Add genre
                </button>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <input
                    ref={genreInputRef}
                    value={newGenreName}
                    onChange={e => { setNewGenreName(e.target.value); setGenreAddError(''); }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); void submitGenre(); }
                      if (e.key === 'Escape') { e.stopPropagation(); cancelGenreAdd(); }
                    }}
                    placeholder="Genre name"
                    style={{
                      ...modalInput,
                      width: 130,
                      padding: '5px 10px',
                      fontSize: 12,
                      borderRadius: 999,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void submitGenre()}
                    disabled={genreSaving || !newGenreName.trim()}
                    title="Confirm"
                    style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: genreSaving || !newGenreName.trim() ? 'var(--surface-2)' : 'var(--accent)',
                      border: 'none',
                      color: genreSaving || !newGenreName.trim() ? 'var(--text-3)' : '#fff7ee',
                      cursor: genreSaving || !newGenreName.trim() ? 'default' : 'pointer',
                      fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'background .1s',
                      flexShrink: 0,
                    }}
                  >
                    {genreSaving ? '…' : '✓'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelGenreAdd}
                    title="Cancel"
                    style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: 'transparent',
                      border: '1px solid var(--border-strong)',
                      color: 'var(--text-3)',
                      cursor: 'pointer',
                      fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    ✕
                  </button>
                  {genreAddError && (
                    <span style={{ fontSize: 11, color: 'var(--accent-2)', width: '100%' }}>
                      {genreAddError}
                    </span>
                  )}
                </div>
              )}
            </div>
          </Field>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              marginTop: 14, padding: '8px 12px', borderRadius: 6,
              background: 'rgba(214,60,46,.12)', border: '1px solid rgba(214,60,46,.3)',
              color: 'var(--accent-2)', fontSize: 12,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ height: 1, background: 'var(--border)', margin: '24px 0 18px' }} />

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>esc to cancel</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={ghostBtn}>Cancel</button>
            <button
              onClick={saving ? undefined : submit}
              style={{ ...primaryBtn, opacity: saving ? 0.6 : 1, cursor: saving ? 'default' : 'pointer' }}
            >
              {saving ? 'Saving…' : 'Save → library'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
