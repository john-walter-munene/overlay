'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch, getProfile } from '../../../lib/auth';
import { formStyles } from '../../formStyles';

type Role = 'user' | 'tipster' | 'admin';
type TipsterStatus = 'active' | 'suspended';

interface AdminUser {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
  tipster: { status: TipsterStatus } | null;
}

interface AdminUsersPage {
  items: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const ROLES: Role[] = ['user', 'tipster', 'admin'];
const PAGE_SIZE = 20;

const muted = { color: '#9aa4b2' } as const;

export default function AdminUsersPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminUsersPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (q: string, p: number) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        page: String(p),
        pageSize: String(PAGE_SIZE),
      });
      if (q) qs.set('q', q);
      const res = await authFetch(`/api/admin/users?${qs.toString()}`);
      if (!res.ok) throw new Error(`Failed to load users (${res.status})`);
      setData((await res.json()) as AdminUsersPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
      setData(null);
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
      if (profile.role !== 'admin') {
        router.replace('/account');
        return;
      }
      setAuthorized(true);
    })();
  }, [router]);

  useEffect(() => {
    if (authorized) load(query, page);
  }, [authorized, query, page, load]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setQuery(search.trim());
  }

  async function changeRole(user: AdminUser, role: Role) {
    if (role === user.role) return;
    const note = window.prompt(
      `Change ${user.email} from ${user.role} to ${role}?\n\nOptional audit note:`,
      '',
    );
    if (note === null) return; // cancelled
    setBusyId(user.id);
    setError(null);
    setNotice(null);
    try {
      const res = await authFetch(`/api/admin/users/${user.id}/role`, {
        method: 'PATCH',
        body: JSON.stringify(
          note.trim() ? { role, note: note.trim() } : { role },
        ),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Failed (${res.status})`);
      }
      setNotice(`${user.email} is now ${role}.`);
      await load(query, page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change role');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleSuspend(user: AdminUser) {
    const current = user.tipster?.status ?? 'active';
    const next: TipsterStatus = current === 'suspended' ? 'active' : 'suspended';
    const verb = next === 'suspended' ? 'Suspend' : 'Reinstate';
    const note = window.prompt(
      `${verb} tipster ${user.email}?\n\nOptional audit note:`,
      '',
    );
    if (note === null) return; // cancelled
    setBusyId(user.id);
    setError(null);
    setNotice(null);
    try {
      const res = await authFetch(`/api/admin/tipsters/${user.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify(
          note.trim() ? { status: next, note: note.trim() } : { status: next },
        ),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Failed (${res.status})`);
      }
      setNotice(
        `${user.email} ${next === 'suspended' ? 'suspended' : 'reinstated'}.`,
      );
      await load(query, page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setBusyId(null);
    }
  }

  if (!authorized) {
    return (
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '3rem 1.5rem' }}>
        <p style={muted}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1>Users</h1>
      <p style={muted}>
        Change a member’s role, or suspend and reinstate tipsters. Every action
        is recorded in the audit log with an optional note.
      </p>

      <form
        onSubmit={submitSearch}
        style={{ display: 'flex', gap: '0.6rem', margin: '1.5rem 0 1rem' }}
      >
        <input
          style={{ ...formStyles.input, maxWidth: 320 }}
          placeholder="Search by email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button style={formStyles.button} type="submit">
          Search
        </button>
        {query ? (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setPage(1);
              setQuery('');
            }}
            style={{
              background: 'transparent',
              color: '#9aa4b2',
              border: '1px solid #1c2430',
              borderRadius: 8,
              padding: '0.6rem 1.2rem',
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        ) : null}
      </form>

      {error ? <p style={formStyles.error}>{error}</p> : null}
      {notice ? <p style={{ color: '#6ea8fe', margin: 0 }}>{notice}</p> : null}

      {loading && !data ? (
        <p style={muted}>Loading…</p>
      ) : !data || data.items.length === 0 ? (
        <p style={muted}>No users found.</p>
      ) : (
        <table
          style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}
        >
          <thead>
            <tr style={{ textAlign: 'left', ...muted }}>
              <th style={{ padding: '0.5rem 0' }}>Email</th>
              <th>Role</th>
              <th>Tipster</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((u) => (
              <tr key={u.id} style={{ borderTop: '1px solid #1c2430' }}>
                <td style={{ padding: '0.6rem 0' }}>{u.email}</td>
                <td>
                  <select
                    aria-label={`Role for ${u.email}`}
                    style={{
                      ...formStyles.input,
                      width: 'auto',
                      padding: '0.35rem 0.5rem',
                    }}
                    value={u.role}
                    disabled={busyId === u.id}
                    onChange={(e) => changeRole(u, e.target.value as Role)}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={muted}>{u.tipster ? u.tipster.status : '—'}</td>
                <td>
                  {u.tipster ? (
                    <button
                      type="button"
                      disabled={busyId === u.id}
                      onClick={() => toggleSuspend(u)}
                      style={{
                        background: 'transparent',
                        color:
                          u.tipster.status === 'suspended'
                            ? '#6ea8fe'
                            : '#ff6b8a',
                        border: '1px solid #1c2430',
                        borderRadius: 8,
                        padding: '0.4rem 0.9rem',
                        cursor: busyId === u.id ? 'default' : 'pointer',
                      }}
                    >
                      {u.tipster.status === 'suspended'
                        ? 'Reinstate'
                        : 'Suspend'}
                    </button>
                  ) : (
                    <span style={muted}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {data && data.totalPages > 1 ? (
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
            marginTop: '1.5rem',
          }}
        >
          <button
            type="button"
            disabled={data.page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={{
              background: 'transparent',
              color: '#9aa4b2',
              border: '1px solid #1c2430',
              borderRadius: 8,
              padding: '0.5rem 1rem',
              cursor: data.page <= 1 ? 'default' : 'pointer',
            }}
          >
            ← Prev
          </button>
          <span style={muted}>
            Page {data.page} of {data.totalPages} · {data.total} users
          </span>
          <button
            type="button"
            disabled={data.page >= data.totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            style={{
              background: 'transparent',
              color: '#9aa4b2',
              border: '1px solid #1c2430',
              borderRadius: 8,
              padding: '0.5rem 1rem',
              cursor: data.page >= data.totalPages ? 'default' : 'pointer',
            }}
          >
            Next →
          </button>
        </div>
      ) : null}
    </main>
  );
}
