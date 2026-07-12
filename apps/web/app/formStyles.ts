import type { CSSProperties } from 'react';

/** Shared inline styles for the small auth/dashboard forms. */
export const formStyles: Record<string, CSSProperties> = {
  wrap: { maxWidth: 420, margin: '0 auto', padding: '3rem 1.5rem' },
  form: { display: 'flex', flexDirection: 'column', gap: '0.85rem' },
  input: {
    background: '#111826',
    border: '1px solid #1c2430',
    borderRadius: 8,
    color: '#e6e6e6',
    padding: '0.7rem 0.9rem',
    fontSize: '1rem',
    width: '100%',
    boxSizing: 'border-box',
  },
  button: {
    background: '#6ea8fe',
    color: '#0b0e14',
    border: 'none',
    borderRadius: 8,
    padding: '0.75rem 1.4rem',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: { color: '#ff6b8a', margin: 0 },
};
