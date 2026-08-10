'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getProfile } from '../lib/auth';
import ThemeToggle from './ThemeToggle';
import NotificationBell from './NotificationBell';
import LanguageSwitcher from './LanguageSwitcher';

export default function SiteHeader() {
  const t = useTranslations('nav');
  const [role, setRole] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    getProfile()
      .then((p) => setRole(p?.role ?? null))
      .finally(() => setReady(true));
  }, []);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="site-header__brand" onClick={closeMenu}>
          <img
            src="/logo-mark.png"
            alt=""
            width={30}
            height={30}
            className="site-header__mark"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <span className="site-header__wordmark">
            <span className="site-header__wordmark-accent">Overlay</span> Picks
          </span>
        </Link>

        <button
          type="button"
          className="nav-toggle"
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          aria-label={menuOpen ? t('closeMenu') : t('openMenu')}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span aria-hidden="true">{menuOpen ? '\u2715' : '\u2630'}</span>
        </button>

        <nav
          id="primary-navigation"
          aria-label="Primary"
          className={menuOpen ? 'site-nav is-open' : 'site-nav'}
        >
          <Link href="/tipsters" onClick={closeMenu}>
            {t('tipsters')}
          </Link>
          <Link href="/tips" onClick={closeMenu}>
            {t('dailyPicks')}
          </Link>
          <Link href="/tools/odds-calculator" onClick={closeMenu}>
            {t('calculator')}
          </Link>
          <div className="nav-dropdown">
            <button
              type="button"
              className="nav-dropdown__trigger"
              aria-haspopup="true"
            >
              {t('contentHub')} <span aria-hidden="true">▾</span>
            </button>
            <div className="nav-dropdown__menu" role="menu">
              <Link href="/content" onClick={closeMenu} role="menuitem">
                {t('content')}
              </Link>
              <Link href="/news" onClick={closeMenu} role="menuitem">
                {t('news')}
              </Link>
            </div>
          </div>
          <div className="nav-dropdown">
            <button
              type="button"
              className="nav-dropdown__trigger"
              aria-haspopup="true"
            >
              {t('about')} <span aria-hidden="true">▾</span>
            </button>
            <div className="nav-dropdown__menu" role="menu">
              <Link href="/about" onClick={closeMenu} role="menuitem">
                {t('howItWorks')}
              </Link>
              <Link href="/support" onClick={closeMenu} role="menuitem">
                {t('supportCenter')}
              </Link>
            </div>
          </div>
          {role === 'user' ? (
            <Link href="/dashboard" onClick={closeMenu}>
              {t('dashboard')}
            </Link>
          ) : null}
          {role === 'tipster' ? (
            <Link href="/dashboard" onClick={closeMenu}>
              {t('dashboard')}
            </Link>
          ) : null}
          {role === 'admin' || role === 'staff' ? (
            <Link href="/admin" onClick={closeMenu}>
              {t('admin')}
            </Link>
          ) : null}
        </nav>

        <div className="site-header__actions">
          <Link
            href="/search"
            onClick={closeMenu}
            aria-label={t('search')}
            title={t('search')}
            className="header-search-link"
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
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </Link>
          {ready && role ? <NotificationBell /> : null}
          {ready ? (
            role ? (
              <Link href="/account" onClick={closeMenu}>
                {t('myAccount')}
              </Link>
            ) : (
              <>
                <Link href="/login" onClick={closeMenu}>
                  {t('signIn')}
                </Link>
                <Link href="/signup" onClick={closeMenu}>
                  {t('getStarted')}
                </Link>
              </>
            )
          ) : null}
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
