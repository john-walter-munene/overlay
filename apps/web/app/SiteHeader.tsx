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
          <Link href="/" onClick={closeMenu}>
            Leaderboard
          </Link>
          <Link href="/marketplace" onClick={closeMenu}>
            Marketplace
          </Link>
          <Link href="/blog" onClick={closeMenu}>
            Blog
          </Link>
          {role === 'tipster' ? (
            <Link href="/dashboard" onClick={closeMenu}>
              Dashboard
            </Link>
          ) : null}
          {role === 'tipster' ? (
            <Link href="/earnings" onClick={closeMenu}>
              Earnings
            </Link>
          ) : null}
          {role === 'admin' ? (
            <>
              <Link href="/admin" onClick={closeMenu}>
                Admin
              </Link>
              <Link href="/admin/users" onClick={closeMenu}>
                Users
              </Link>
            </>
          ) : null}
        </nav>

        <div className="site-header__actions">
          <ThemeToggle />
          {ready ? (
            role ? (
              <Link href="/account" className="is-primary" onClick={closeMenu}>
                Account
              </Link>
            ) : (
              <>
                <Link href="/login" onClick={closeMenu}>
                  Sign in
                </Link>
                <Link href="/signup" className="is-primary" onClick={closeMenu}>
                  Get started
                </Link>
              </>
            )
          ) : null}
        </div>
      </div>
    </header>
  );
}
