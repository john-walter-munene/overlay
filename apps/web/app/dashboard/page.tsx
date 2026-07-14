'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch, getProfile } from '../../lib/auth';
import { API_URL } from '../../lib/api';
import type { PerformanceDashboard } from '../../lib/api';
import { formStyles } from '../formStyles';
import PerformanceDashboardView from '../PerformanceDashboard';

interface EventRow {
  id: string;
  sport: string;
  league: string | null;
  home: string;
  away: string;
  startTime: string;
}

interface Pick {
  id: string;
  market: string;
  selection: string;
  oddsAtPick: number;
  status: string;
  clv: number | null;
}

const MARKETS = ['1X2', 'moneyline', 'spread', 'totals'];

export default function DashboardPage() {
  const router = useRouter();
  const [tipsterId, setTipsterId] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [performance, setPerformance] = useState<PerformanceDashboard | null>(
    null,
  );
  const [form, setForm] = useState({
    eventId: '',
    market: '1X2',
    selection: '',
    oddsAtPick: '2.00',
    stakeUnits: '1',
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadPicks = useCallback(async (id: string) => {
    const res = await fetch(`${API_URL}/api/picks/tipster/${id}`);
    if (res.ok) setPicks((await res.json()) as Pick[]);
  }, []);

  const loadPerformance = useCallback(async () => {
    try {
      const res = await authFetch('/api/picks/me/performance');
      if (res.ok) setPerformance((await res.json()) as PerformanceDashboard);
    } catch {
      setPerformance(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const profile = await getProfile();
      if (!profile) {
        router.replace('/login');
        return;
      }
      if (profile.role !== 'tipster' || !profile.tipsterId) {
        router.replace('/account');
        return;
      }
      setTipsterId(profile.tipsterId);
      fetch(`${API_URL}/api/events/upcoming`)
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => setEvents(data as EventRow[]))
        .catch(() => setEvents([]));
      loadPicks(profile.tipsterId);
      loadPerformance();
    })();
  }, [router, loadPicks, loadPerformance]);

  async function submitPick(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!form.eventId) {
      setMsg('Pick an event first.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch('/api/picks', {
        method: 'POST',
        body: JSON.stringify({
          eventId: form.eventId,
          market: form.market,
          selection: form.selection,
          oddsAtPick: Number(form.oddsAtPick),
          stakeUnits: Number(form.stakeUnits),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(body.message ?? `Failed (${res.status})`);
      }
      setMsg('Pick locked ✓');
      setForm((f) => ({ ...f, selection: '' }));
      if (tipsterId) await loadPicks(tipsterId);
      await loadPerformance();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1>Tipster dashboard</h1>
      <p style={{ color: '#9aa4b2' }}>
        Picks are hash-locked and timestamped the moment you submit — before
        kickoff. That’s what makes your record verifiable.
      </p>

      <h2 style={{ marginTop: '2rem' }}>Submit a pick</h2>
      <form
        onSubmit={submitPick}
        style={{ ...formStyles.form, maxWidth: 520 }}
      >
        <label style={{ color: '#9aa4b2', fontSize: '0.9rem' }}>
          Event
          <select
            style={{ ...formStyles.input, marginTop: '0.35rem' }}
            value={form.eventId}
            onChange={(e) => setForm({ ...form, eventId: e.target.value })}
          >
            <option value="">Select an upcoming event…</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.home} vs {ev.away} — {new Date(ev.startTime).toLocaleString()}
              </option>
            ))}
          </select>
        </label>

        <label style={{ color: '#9aa4b2', fontSize: '0.9rem' }}>
          Market
          <select
            style={{ ...formStyles.input, marginTop: '0.35rem' }}
            value={form.market}
            onChange={(e) => setForm({ ...form, market: e.target.value })}
          >
            {MARKETS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <input
          style={formStyles.input}
          placeholder="Selection (e.g. Home, Over 2.5)"
          value={form.selection}
          onChange={(e) => setForm({ ...form, selection: e.target.value })}
          required
        />
        <input
          style={formStyles.input}
          type="number"
          step="0.01"
          min="1.01"
          placeholder="Odds"
          value={form.oddsAtPick}
          onChange={(e) => setForm({ ...form, oddsAtPick: e.target.value })}
          required
        />
        <input
          style={formStyles.input}
          type="number"
          step="0.1"
          min="0.1"
          placeholder="Stake (units)"
          value={form.stakeUnits}
          onChange={(e) => setForm({ ...form, stakeUnits: e.target.value })}
          required
        />
        {msg ? <p style={{ color: '#6ea8fe', margin: 0 }}>{msg}</p> : null}
        <button style={formStyles.button} disabled={submitting}>
          {submitting ? 'Locking…' : 'Lock pick'}
        </button>
      </form>

      <PerformanceDashboardView data={performance} />

      <h2 style={{ marginTop: '2.5rem' }}>Your track record</h2>
      {picks.length === 0 ? (
        <p style={{ color: '#9aa4b2' }}>No settled picks yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#9aa4b2' }}>
              <th style={{ padding: '0.5rem 0' }}>Selection</th>
              <th>Market</th>
              <th>Odds</th>
              <th>CLV</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {picks.map((p) => (
              <tr key={p.id} style={{ borderTop: '1px solid #1c2430' }}>
                <td style={{ padding: '0.5rem 0' }}>{p.selection}</td>
                <td>{p.market}</td>
                <td>{p.oddsAtPick.toFixed(2)}</td>
                <td>{p.clv != null ? `${(p.clv * 100).toFixed(1)}%` : '—'}</td>
                <td>{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
