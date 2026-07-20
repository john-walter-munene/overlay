'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getProfile } from '../lib/auth';
import ThemeToggle from './ThemeToggle';
import './SiteHeader.css';

type MobileDropdown = 'content' | 'about' | null;

export default function SiteHeader() {
  const [role, setRole] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] =
    useState<MobileDropdown>(null);

  useEffect(() => {
    getProfile()
      .then((p) => setRole(p?.role ?? null))
      .finally(() => setReady(true));
  }, []);

  function closeMenu() {
    setMenuOpen(false);
    setOpenDropdown(null);
  }

  function toggleDropdown(
    name: Exclude<MobileDropdown, null>,
  ) {
    setOpenDropdown((current) =>
      current === name ? null : name,
    );
  }

  function handleNavigation() {
    closeMenu();
  }

  return (
    <header className="site-header">
      <div className="site-header__inner">

        <Link
          href="/"
          className="site-header__brand"
          onClick={handleNavigation}
        >
          Overlay Bets
        </Link>

        <button
          type="button"
          className="nav-toggle"
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          aria-label={
            menuOpen
              ? 'Close navigation menu'
              : 'Open navigation menu'
          }
          onClick={() => {
            if (menuOpen) {
              closeMenu();
            } else {
              setMenuOpen(true);
            }
          }}
        >
          <span aria-hidden="true">
            {menuOpen ? '✕' : '☰'}
          </span>
        </button>

        <nav
          id="primary-navigation"
          aria-label="Primary"
          className={
            menuOpen
              ? 'site-nav is-open'
              : 'site-nav'
          }
        >
          <Link
            href="/tipsters"
            onClick={handleNavigation}
          >
            Tipsters
          </Link>

          <Link
            href="/tips"
            onClick={handleNavigation}
          >
            Free tips
          </Link>

          <Link
            href="/tools/odds-calculator"
            onClick={handleNavigation}
          >
            Betting Calculator
          </Link>

          <div
            className={
              openDropdown === 'content'
                ? 'nav-dropdown is-open'
                : 'nav-dropdown'
            }
          >
            <button
              type="button"
              className="nav-dropdown__trigger"
              aria-expanded={
                openDropdown === 'content'
              }
              aria-controls="content-menu"
              onClick={() =>
                toggleDropdown('content')
              }
            >
              <span>Content &amp; News</span>

              <span aria-hidden="true">
                {openDropdown === 'content'
                  ? '▴'
                  : '▾'}
              </span>
            </button>

            <div
              id="content-menu"
              className="nav-dropdown__menu"
            >
              <Link
                href="/content"
                onClick={handleNavigation}
              >
                Content
              </Link>

              <Link
                href="/news"
                onClick={handleNavigation}
              >
                News
              </Link>
            </div>
          </div>

          <div
            className={
              openDropdown === 'about'
                ? 'nav-dropdown is-open'
                : 'nav-dropdown'
            }
          >
            <button
              type="button"
              className="nav-dropdown__trigger"
              aria-expanded={
                openDropdown === 'about'
              }
              aria-controls="about-menu"
              onClick={() =>
                toggleDropdown('about')
              }
            >
              <span>About</span>

              <span aria-hidden="true">
                {openDropdown === 'about'
                  ? '▴'
                  : '▾'}
              </span>
            </button>

            <div
              id="about-menu"
              className="nav-dropdown__menu"
            >
              <Link
                href="/about"
                onClick={handleNavigation}
              >
                How it works
              </Link>

              <Link
                href="/support"
                onClick={handleNavigation}
              >
                Support Center
              </Link>
            </div>
          </div>

          {role === 'user' && (
            <Link
              href="/dashboard"
              onClick={handleNavigation}
            >
              Dashboard
            </Link>
          )}

          {role === 'tipster' && (
            <Link
              href="/dashboard"
              onClick={handleNavigation}
            >
              Dashboard
            </Link>
          )}

          {role === 'admin' && (
            <Link
              href="/admin"
              onClick={handleNavigation}
            >
          ) : null}
          {role === 'admin' || role === 'staff' ? (
            <Link href="/admin" onClick={closeMenu}>
              Admin
            </Link>
          )}

          <div className="site-header__actions">
            <Link
              href="/search"
              onClick={handleNavigation}
              className="header-search-link"
              aria-label="Search"
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
                <circle
                  cx="11"
                  cy="11"
                  r="7"
                />
                <line
                  x1="21"
                  y1="21"
                  x2="16.65"
                  y2="16.65"
                />
              </svg>
            </Link>

            {ready &&
              (role ? (
                <Link
                  href="/account"
                  onClick={handleNavigation}
                >
                  My Account
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={handleNavigation}
                  >
                    Sign in
                  </Link>

                  <Link
                    href="/signup"
                    className="btn btn--primary"
                    onClick={handleNavigation}
                  >
                    Get started
                  </Link>
                </>
              ))}

            <ThemeToggle />
          </div>

        </nav>

      </div>
    </header>
  );
}