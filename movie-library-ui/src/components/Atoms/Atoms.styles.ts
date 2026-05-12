// Shared button and input style objects — kept in a separate file so that
// Atoms.tsx only exports React components (required for fast refresh).

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
