'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { setLocale } from './actions/locale';
import {
  locales,
  localeNames,
  localeLabels,
  type Locale,
} from '../i18n/config';

/**
 * Language selector shown in the header. Persists the choice via the setLocale
 * server action (NEXT_LOCALE cookie) and revalidates so the whole app re-renders
 * in the chosen language — no page reload, no URL change.
 */
export default function LanguageSwitcher() {
  const active = useLocale() as Locale;
  const t = useTranslations('language');
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function choose(loc: Locale) {
    setOpen(false);
    if (loc === active) return;
    startTransition(() => {
      void setLocale(loc);
    });
  }

  return (
    <div className="lang-switch" ref={ref}>
      <button
        type="button"
        className="lang-switch__trigger"
        aria-label={t('select')}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <span className="lang-switch__code">{localeLabels[active]}</span>
      </button>

      {open ? (
        <div className="lang-switch__menu" role="menu" aria-label={t('label')}>
          {locales.map((loc) => (
            <button
              key={loc}
              type="button"
              role="menuitemradio"
              aria-checked={loc === active}
              className={
                loc === active
                  ? 'lang-switch__item is-active'
                  : 'lang-switch__item'
              }
              onClick={() => choose(loc)}
            >
              {localeNames[loc]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
