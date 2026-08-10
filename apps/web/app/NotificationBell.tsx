'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { authFetch } from '../lib/auth';
import type { FeedPick } from '../lib/api';

// Subscriber-facing announcement shape (see @overlay/shared PublicAnnouncement).
// Only the fields the bell renders are declared here.
interface UpcomingAnnouncement {
  id: string;
  tipsterId: string;
  title: string;
  message: string | null;
  nextDropAt: string | null;
}

type NotifKind = 'pick' | 'drop';

interface NotifItem {
  id: string;
  kind: NotifKind;
  /** Epoch ms used for ordering and (for picks) unread detection. */
  ts: number;
  title: string;
  detail: string;
  href: string;
}

const SEEN_KEY = 'overlay-notifications-seen';
const POLL_MS = 90_000;

function readLastSeen(): number {
  if (typeof window === 'undefined') return 0;
  const raw = window.localStorage.getItem(SEEN_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

function relativeTime(ts: number, now: number): string {
  const diff = ts - now;
  const past = diff < 0;
  const mins = Math.round(Math.abs(diff) / 60_000);
  let label: string;
  if (mins < 1) label = 'just now';
  else if (mins < 60) label = `${mins}m`;
  else if (mins < 1440) label = `${Math.round(mins / 60)}h`;
  else label = `${Math.round(mins / 1440)}d`;
  if (label === 'just now') return label;
  return past ? `${label} ago` : `in ${label}`;
}

function pickItems(picks: FeedPick[]): NotifItem[] {
  return picks.map((p) => ({
    id: `pick:${p.id}`,
    kind: 'pick' as const,
    ts: p.lockedAt,
    title: `New pick from ${p.tipsterName ?? 'a tipster'}`,
    detail: `${p.market} · ${p.selection} @ ${p.oddsAtPick.toFixed(2)}`,
    href: '/feed',
  }));
}

function dropItems(anns: UpcomingAnnouncement[]): NotifItem[] {
  return anns
    .filter((a) => a.nextDropAt)
    .map((a) => ({
      id: `drop:${a.id}`,
      kind: 'drop' as const,
      ts: new Date(a.nextDropAt as string).getTime(),
      title: 'Tip drop scheduled',
      detail: a.message ? `${a.title} — ${a.message}` : a.title,
      href: `/tipsters/${a.tipsterId}`,
    }));
}

export default function NotificationBell() {
  const [items, setItems] = useState<NotifItem[]>([]);
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState<number>(0);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const [feedRes, annRes] = await Promise.all([
        authFetch('/api/picks/me/feed'),
        authFetch('/api/announcements/upcoming'),
      ]);
      const picks: FeedPick[] = feedRes.ok ? await feedRes.json() : [];
      const anns: UpcomingAnnouncement[] = annRes.ok ? await annRes.json() : [];
      const merged = [...pickItems(picks), ...dropItems(anns)].sort(
        (a, b) => b.ts - a.ts,
      );
      setItems(merged.slice(0, 15));
    } catch {
      /* offline / signed out — leave the bell empty */
    }
  }, []);

  useEffect(() => {
    setLastSeen(readLastSeen());
    load();
    const id = window.setInterval(load, POLL_MS);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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

  const now = Date.now();
  // Only picks that have already happened count toward the unread badge;
  // upcoming drops are informational reminders, not "new" activity.
  const unread = items.filter(
    (i) => i.kind === 'pick' && i.ts > lastSeen && i.ts <= now,
  ).length;

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        const stamp = Date.now();
        window.localStorage.setItem(SEEN_KEY, String(stamp));
        setLastSeen(stamp);
      }
      return next;
    });
  };

  return (
    <div className="notif-bell" ref={rootRef}>
      <button
        type="button"
        className="notif-bell__trigger"
        aria-label={
          unread > 0 ? `Notifications (${unread} new)` : 'Notifications'
        }
        aria-expanded={open}
        aria-haspopup="true"
        onClick={toggle}
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
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 ? (
          <span className="notif-bell__badge" aria-hidden="true">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="notif-bell__menu" role="menu" aria-label="Notifications">
          <div className="notif-bell__header">Notifications</div>
          {items.length === 0 ? (
            <p className="notif-bell__empty">You&rsquo;re all caught up.</p>
          ) : (
            <ul className="notif-bell__list">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="notif-bell__item"
                    role="menuitem"
                    onClick={() => setOpen(false)}
                  >
                    <span
                      className={`notif-bell__dot notif-bell__dot--${item.kind}`}
                      aria-hidden="true"
                    />
                    <span className="notif-bell__body">
                      <span className="notif-bell__title">{item.title}</span>
                      <span className="notif-bell__detail">{item.detail}</span>
                    </span>
                    <span className="notif-bell__time">
                      {relativeTime(item.ts, now)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/account"
            className="notif-bell__settings"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            Notification settings
          </Link>
        </div>
      ) : null}
    </div>
  );
}
