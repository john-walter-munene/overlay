'use client';

import { useRouter } from 'next/navigation';

/**
 * Calendar date picker for the free Daily Tips hub (OB-150). A native date
 * input that deep-links to `/tips?date=YYYY-MM-DD` on change so any day is
 * reachable directly. Prev/next day navigation is handled by plain links in the
 * server-rendered date strip, keeping the page crawlable.
 */
export default function TipsDatePicker({ value }: { value: string }) {
  const router = useRouter();
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        color: 'var(--muted)',
        fontSize: '0.9rem',
      }}
    >
      <span>Jump to date</span>
      <input
        type="date"
        value={value}
        aria-label="Pick a date"
        onChange={(e) => {
          const next = e.target.value;
          if (next) router.push(`/tips?date=${next}`);
        }}
        style={{
          background: 'var(--surface)',
          color: 'var(--fg)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '0.4rem 0.6rem',
        }}
      />
    </label>
  );
}
