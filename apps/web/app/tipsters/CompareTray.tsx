'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  clearCompare,
  getCompare,
  removeCompare,
  subscribeCompare,
  type CompareItem,
} from './compareStore';

/**
 * Sticky bottom tray listing the currently selected tipsters (OB-160). Hidden
 * until at least one is picked; "Compare" activates at two. Navigates to the
 * comparison page with the ids in the query string (shareable / SSR-friendly).
 */
export default function CompareTray() {
  const t = useTranslations('compare');
  const router = useRouter();
  const [items, setItems] = useState<CompareItem[]>([]);

  useEffect(() => {
    const sync = () => setItems(getCompare());
    sync();
    return subscribeCompare(sync);
  }, []);

  if (items.length === 0) return null;

  const canCompare = items.length >= 2;
  const href = `/tipsters/compare?ids=${items
    .map((i) => encodeURIComponent(i.id))
    .join(',')}`;

  return (
    <div
      role="region"
      aria-label={t('trayLabel')}
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 50,
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        padding: '0.75rem 1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        flexWrap: 'wrap',
        justifyContent: 'center',
        boxShadow: '0 -4px 16px rgba(0,0,0,0.08)',
      }}
    >
      <strong>{t('selectedCount', { count: items.length, max: 3 })}</strong>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {items.map((i) => (
          <span
            key={i.id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              border: '1px solid var(--border)',
              borderRadius: 999,
              padding: '0.2rem 0.35rem 0.2rem 0.7rem',
              fontSize: '0.85rem',
            }}
          >
            {i.name}
            <button
              type="button"
              onClick={() => removeCompare(i.id)}
              aria-label={t('remove', { name: i.name })}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--muted)',
                cursor: 'pointer',
                fontSize: '1.1rem',
                lineHeight: 1,
                padding: '0 0.15rem',
              }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <button
        type="button"
        className="btn btn--primary btn--sm"
        disabled={!canCompare}
        onClick={() => canCompare && router.push(href)}
        title={canCompare ? undefined : t('needTwo')}
      >
        {t('compareNow')}
      </button>
      <button
        type="button"
        className="btn btn--secondary btn--sm"
        onClick={clearCompare}
      >
        {t('clear')}
      </button>
    </div>
  );
}
