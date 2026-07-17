'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getProfile } from '../lib/auth';
import ThemeToggle from './ThemeToggle';

export default function SiteHeader() {
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
          Overlay Bets
        </Link>

        <button
          type="button"
          className="nav-toggle"
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
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
            Tipsters
          </Link>
          <Link href="/tips" onClick={closeMenu}>
            Free tips
          </Link>
          <Link href="/tools/odds-calculator" onClick={closeMenu}>
            Betting Calculator
          </Link>
          <Link href="/blog" onClick={closeMenu}>
            Blog
          </Link>
          <div className="nav-dropdown">
            <button
              type="button"
              className="nav-dropdown__trigger"
              aria-haspopup="true"
            >
              About <span aria-hidden="true">▾</span>
            </button>
            <div className="nav-dropdown__menu" role="menu">
              <Link href="/about" onClick={closeMenu} role="menuitem">
                How it works
              </Link>
              <Link href="/support" onClick={closeMenu} role="menuitem">
                Support Center
              </Link>
            </div>
          </div>
          {role === 'user' ? (
            <Link href="/dashboard" onClick={closeMenu}>
              Dashboard
            </Link>
          ) : null}
          {role === 'tipster' ? (
            <Link href="/dashboard" onClick={closeMenu}>
              Dashboard
            </Link>
          ) : null}
          {role === 'admin' ? (
            <Link href="/admin" onClick={closeMenu}>
              Admin
            </Link>
          ) : null}
        </nav>

        <div className="site-header__actions">
          {ready ? (
            role ? (
              <Link href="/account" onClick={closeMenu}>
                My Account
              </Link>
            ) : (
              <Link href="/login" onClick={closeMenu}>
                Sign in
              </Link>
            )
          ) : null}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
