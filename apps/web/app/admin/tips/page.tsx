'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { todayIsoDate } from '@overlay/shared/daily-tips';
import { roleHasPermission } from '@overlay/shared/rbac';
import { authFetch, getProfile } from '../../../lib/auth';

interface ManagedTip {
  id: string;
  date: string;
  sport: string;
  league: string | null;
  match: string;
  market: string;
  selection: string;
  odds: number | null;
  analysis: string | null;
}

interface Draft {
  id: string | null;
  date: string;
  sport: string;
  league: string;
  match: string;
  market: string;
  selection: string;
  odds: string;
  analysis: string;
  sortOrder: string;
}

const MUTED = 'var(--muted)';

function emptyDraft(): Draft {
  return {
    id: null,
    date: todayIsoDate(),
    sport: '',
    league: '',
    match: '',
    market: '',
    selection: '',
    odds: '',
    analysis: '',
    sortOrder: '0',
  };
}

function toDraft(t: ManagedTip): Draft {
  return {
    id: t.id,
    date: t.date,
    sport: t.sport,
    league: t.league ?? '',
    match: t.match,
    market: t.market,
    selection: t.selection,
    odds: t.odds != null ? String(t.odds) : '',
    analysis: t.analysis ?? '',
    sortOrder: '0',
  };
}

const inputStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--fg)',
  padding: '0.55rem 0.7rem',
  fontSize: '0.95rem',
  width: '100%',
  boxSizing: 'border-box',
};

export default function AdminTipsPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [tips, setTips] = useState<ManagedTip[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/free-tips/admin/all');
      if (!res.ok) throw new Error(`Failed to load tips (${res.status})`);
      setTips((await res.json()) as ManagedTip[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tips');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const profile = await getProfile();
      if (!profile) {
        router.replace('/login');
        return;
      }
      if (!roleHasPermission(profile.role, 'content:moderate')) {
        router.replace('/account');
        return;
      }
      setAuthorized(true);
      await load();
    })();
  }, [router, load]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const body = {
        date: draft.date,
        sport: draft.sport.trim(),
        league: draft.league.trim() || undefined,
        match: draft.match.trim(),
        market: draft.market.trim(),
        selection: draft.selection.trim(),
        odds: draft.odds.trim() ? Number(draft.odds) : undefined,
        analysis: draft.analysis.trim() || undefined,
        sortOrder: draft.sortOrder.trim() ? Number(draft.sortOrder) : 0,
      };
      const res = await authFetch(
        draft.id ? `/api/free-tips/${draft.id}` : '/api/free-tips',
        {
          method: draft.id ? 'PATCH' : 'POST',
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      setNotice(draft.id ? 'Tip updated.' : 'Tip added.');
      setDraft(emptyDraft());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this free tip?')) return;
    setError(null);
    try {
      const res = await authFetch(`/api/free-tips/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  if (!authorized) return null;

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>
        Free Daily Tips
      </h1>
      <p style={{ color: MUTED, marginTop: 0 }}>
        Curate the public “bets of the day” shown on{' '}
        <a href="/tips" style={{ color: 'var(--accent)' }}>
          /tips
        </a>
        . These are ungated and not linked to any tipster.
      </p>

      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
      {notice ? <p style={{ color: 'var(--success)' }}>{notice}</p> : null}

      <form
        onSubmit={save}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '0.75rem',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '1.1rem',
          margin: '1.5rem 0',
        }}
      >
        <label style={{ display: 'grid', gap: '0.25rem' }}>
          <span style={{ color: MUTED, fontSize: '0.8rem' }}>Date</span>
          <input
            type="date"
            required
            value={draft.date}
            onChange={(e) => set({ date: e.target.value })}
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'grid', gap: '0.25rem' }}>
          <span style={{ color: MUTED, fontSize: '0.8rem' }}>Sport</span>
          <input
            required
            value={draft.sport}
            onChange={(e) => set({ sport: e.target.value })}
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'grid', gap: '0.25rem' }}>
          <span style={{ color: MUTED, fontSize: '0.8rem' }}>League (optional)</span>
          <input
            value={draft.league}
            onChange={(e) => set({ league: e.target.value })}
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'grid', gap: '0.25rem' }}>
          <span style={{ color: MUTED, fontSize: '0.8rem' }}>Match</span>
          <input
            required
            placeholder="Arsenal vs Chelsea"
            value={draft.match}
            onChange={(e) => set({ match: e.target.value })}
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'grid', gap: '0.25rem' }}>
          <span style={{ color: MUTED, fontSize: '0.8rem' }}>Market</span>
          <input
            required
            placeholder="1X2, Over/Under…"
            value={draft.market}
            onChange={(e) => set({ market: e.target.value })}
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'grid', gap: '0.25rem' }}>
          <span style={{ color: MUTED, fontSize: '0.8rem' }}>Selection</span>
          <input
            required
            value={draft.selection}
            onChange={(e) => set({ selection: e.target.value })}
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'grid', gap: '0.25rem' }}>
          <span style={{ color: MUTED, fontSize: '0.8rem' }}>Odds (optional)</span>
          <input
            type="number"
            step="0.01"
            min="1"
            value={draft.odds}
            onChange={(e) => set({ odds: e.target.value })}
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'grid', gap: '0.25rem' }}>
          <span style={{ color: MUTED, fontSize: '0.8rem' }}>Sort order</span>
          <input
            type="number"
            value={draft.sortOrder}
            onChange={(e) => set({ sortOrder: e.target.value })}
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'grid', gap: '0.25rem', gridColumn: '1 / -1' }}>
          <span style={{ color: MUTED, fontSize: '0.8rem' }}>Analysis (optional)</span>
          <textarea
            rows={2}
            value={draft.analysis}
            onChange={(e) => set({ analysis: e.target.value })}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </label>
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '0.5rem' }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              background: 'var(--accent)',
              color: 'var(--on-accent)',
              border: 'none',
              borderRadius: 8,
              padding: '0.6rem 1.2rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {saving ? 'Saving…' : draft.id ? 'Update tip' : 'Add tip'}
          </button>
          {draft.id ? (
            <button
              type="button"
              onClick={() => setDraft(emptyDraft())}
              style={{
                background: 'transparent',
                color: 'var(--fg)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '0.6rem 1.2rem',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      <h2 style={{ fontSize: '1.2rem' }}>All tips</h2>
      {loading ? (
        <p style={{ color: MUTED }}>Loading…</p>
      ) : tips.length === 0 ? (
        <p style={{ color: MUTED }}>No free tips yet. Add one above.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {tips.map((t) => (
            <li
              key={t.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '0.8rem 1rem',
                marginBottom: '0.6rem',
                display: 'flex',
                justifyContent: 'space-between',
                gap: '0.75rem',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>
                  {t.match}{' '}
                  <span style={{ color: MUTED, fontWeight: 400 }}>
                    · {t.market}: {t.selection}
                    {t.odds != null ? ` @ ${t.odds.toFixed(2)}` : ''}
                  </span>
                </div>
                <div style={{ color: MUTED, fontSize: '0.8rem' }}>
                  {t.date} · {t.sport}
                  {t.league ? ` · ${t.league}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(toDraft(t));
                    setNotice(null);
                  }}
                  style={{
                    background: 'transparent',
                    color: 'var(--accent)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '0.4rem 0.8rem',
                    cursor: 'pointer',
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  style={{
                    background: 'transparent',
                    color: 'var(--danger)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '0.4rem 0.8rem',
                    cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
