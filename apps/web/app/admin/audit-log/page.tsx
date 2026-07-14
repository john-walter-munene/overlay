'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch, getProfile } from '../../../lib/auth';
import { formStyles } from '../../formStyles';

interface AuditLogEntry {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  payload: unknown;
  createdAt: string;
}

interface AuditLogPage {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface Filters {
  entity: string;
  actor: string;
  action: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = {
  entity: '',
  actor: '',
  action: '',
  from: '',
  to: '',
};

const PAGE_SIZE = 25;

const muted = { color: '#9aa4b2' } as const;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/** Pretty-print a JSON payload, tolerating primitives and null. */
function renderPayload(payload: unknown): string {
  if (payload == null) return '—';
  if (typeof payload === 'string') return payload;
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

export default function AdminAuditLogPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [form, setForm] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditLogPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (filters: Filters, p: number) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        page: String(p),
        pageSize: String(PAGE_SIZE),
      });
      if (filters.entity) qs.set('entity', filters.entity);
      if (filters.actor) qs.set('actor', filters.actor);
      if (filters.action) qs.set('action', filters.action);
      if (filters.from) qs.set('from', filters.from);
      if (filters.to) qs.set('to', filters.to);
      const res = await authFetch(`/api/admin/audit-log?${qs.toString()}`);
      if (!res.ok) throw new Error(`Failed to load audit log (${res.status})`);
      setData((await res.json()) as AuditLogPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log');
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
    if (authorized) load(applied, page);
  }, [authorized, applied, page, load]);

  function submitFilters(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setApplied({
      entity: form.entity.trim(),
      actor: form.actor.trim(),
      action: form.action.trim(),
      from: form.from,
      to: form.to,
    });
  }

  function clearFilters() {
    setForm(EMPTY_FILTERS);
    setPage(1);
    setApplied(EMPTY_FILTERS);
  }

  const hasFilters = Object.values(applied).some((v) => v !== '');

  if (!authorized) {
    return (
      <main style={{ maxWidth: 1040, margin: '0 auto', padding: '3rem 1.5rem' }}>
        <p style={muted}>Loading…</p>
      </main>
    );
  }

  const field = (
    label: string,
    key: keyof Filters,
    type: 'text' | 'date',
    placeholder?: string,
  ) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <span style={{ ...muted, fontSize: '0.8rem' }}>{label}</span>
      <input
        type={type}
        style={{ ...formStyles.input, minWidth: 150 }}
        placeholder={placeholder}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
    </label>
  );

  return (
    <main style={{ maxWidth: 1040, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <h1>Audit log</h1>
      <p style={muted}>
        Every privileged action is recorded here. Filter by entity, actor,
        action or date range.
      </p>

      <form
        onSubmit={submitFilters}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          alignItems: 'flex-end',
          margin: '1.5rem 0 1rem',
        }}
      >
        {field('Entity', 'entity', 'text', 'e.g. Tipster')}
        {field('Actor', 'actor', 'text', 'e.g. admin:…')}
        {field('Action', 'action', 'text', 'e.g. role.changed')}
        {field('From', 'from', 'date')}
        {field('To', 'to', 'date')}
        <button style={formStyles.button} type="submit">
          Apply
        </button>
        {hasFilters ? (
          <button
            type="button"
            onClick={clearFilters}
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

      {loading && !data ? (
        <p style={muted}>Loading…</p>
      ) : !data || data.items.length === 0 ? (
        <p style={muted}>No audit-log entries found.</p>
      ) : (
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            marginTop: '1rem',
          }}
        >
          <thead>
            <tr style={{ textAlign: 'left', ...muted }}>
              <th style={{ padding: '0.5rem 0' }}>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Payload</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((entry) => (
              <tr key={entry.id} style={{ borderTop: '1px solid #1c2430' }}>
                <td
                  style={{
                    padding: '0.6rem 0.6rem 0.6rem 0',
                    whiteSpace: 'nowrap',
                    ...muted,
                  }}
                >
                  {formatDate(entry.createdAt)}
                </td>
                <td style={{ padding: '0.6rem 0.6rem 0.6rem 0' }}>
                  {entry.actor}
                </td>
                <td style={{ padding: '0.6rem 0.6rem 0.6rem 0' }}>
                  {entry.action}
                </td>
                <td style={{ padding: '0.6rem 0.6rem 0.6rem 0' }}>
                  {entry.entity}
                  <div style={{ ...muted, fontSize: '0.78rem' }}>
                    {entry.entityId}
                  </div>
                </td>
                <td style={{ padding: '0.6rem 0' }}>
                  <pre
                    style={{
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontSize: '0.82rem',
                      color: '#cbd3df',
                      maxWidth: 360,
                    }}
                  >
                    {renderPayload(entry.payload)}
                  </pre>
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
            Page {data.page} of {data.totalPages} · {data.total} entries
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
