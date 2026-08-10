'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  COMPARE_MAX,
  getCompare,
  isSelected,
  subscribeCompare,
  toggleCompare,
} from './compareStore';

/**
 * Per-row "Compare" checkbox on the marketplace (OB-160). Reflects and mutates
 * the shared compare store; disables itself once three tipsters are selected
 * (unless this row is one of them).
 */
export default function CompareToggle({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const t = useTranslations('compare');
  const [selected, setSelected] = useState(false);
  const [atCap, setAtCap] = useState(false);

  useEffect(() => {
    const sync = () => {
      setSelected(isSelected(id));
      setAtCap(getCompare().length >= COMPARE_MAX);
    };
    sync();
    return subscribeCompare(sync);
  }, [id]);

  const disabled = !selected && atCap;

  return (
    <label
      title={disabled ? t('capReached', { max: COMPARE_MAX }) : t('compareTitle')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        color: 'var(--muted)',
        fontSize: '0.8rem',
        cursor: disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      <input
        type="checkbox"
        checked={selected}
        disabled={disabled}
        onChange={() => toggleCompare({ id, name })}
      />
      {t('compare')}
    </label>
  );
}
