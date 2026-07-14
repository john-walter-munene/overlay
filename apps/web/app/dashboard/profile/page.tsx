'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  validateTipsterProfile,
  formatSports,
  centsToPriceUnits,
  TIPSTER_PROFILE_LIMITS,
} from '@overlay/shared/tipster-profile';
import { authFetch, getProfile } from '../../../lib/auth';
import { getTipster } from '../../../lib/api';
import { formStyles } from '../../formStyles';

const MUTED = 'var(--muted)';

export default function ProfileEditorPage() {
  const router = useRouter();
  const [tipsterId, setTipsterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ bio: '', sports: '', price: '0' });
  const [errors, setErrors] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

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
      const current = await getTipster(profile.tipsterId);
      if (current) {
        setForm({
          bio: current.bio ?? '',
          sports: formatSports(current.sports),
          price: centsToPriceUnits(current.subscriptionPriceCents),
        });
      }
      setLoading(false);
    })();
  }, [router]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErrors([]);

    const result = validateTipsterProfile(form);
    if (!result.valid || !result.payload) {
      setErrors(result.errors);
      return;
    }

    setSaving(true);
    try {
      const res = await authFetch('/api/tipsters/me', {
        method: 'PATCH',
        body: JSON.stringify(result.payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string | string[];
        };
        const detail = Array.isArray(body.message)
          ? body.message.join(', ')
          : body.message;
        throw new Error(detail ?? `Failed (${res.status})`);
      }
      // Reflect the normalized values back into the form.
      setForm({
        bio: result.payload.bio,
        sports: formatSports(result.payload.sports),
        price: centsToPriceUnits(result.payload.subscriptionPriceCents),
      });
      setMsg('Profile saved ✓');
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Failed to save']);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p style={{ margin: 0 }}>
        <Link href="/dashboard" style={{ color: 'var(--accent)' }}>
          ← Dashboard
        </Link>
      </p>
      <h1>Edit your profile</h1>
      <p style={{ color: MUTED }}>
        Your bio, sports and subscription price appear on your public tipster
        page.
      </p>

      {loading ? (
        <p style={{ color: MUTED }}>Loading…</p>
      ) : (
        <form onSubmit={save} style={{ ...formStyles.form, maxWidth: 520 }}>
          <label style={{ color: MUTED, fontSize: '0.9rem' }}>
            Bio
            <textarea
              style={{
                ...formStyles.input,
                marginTop: '0.35rem',
                minHeight: 110,
                resize: 'vertical',
              }}
              maxLength={TIPSTER_PROFILE_LIMITS.bioMaxLength}
              placeholder="Tell subscribers about your edge…"
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
            />
          </label>

          <label style={{ color: MUTED, fontSize: '0.9rem' }}>
            Sports (comma separated)
            <input
              style={{ ...formStyles.input, marginTop: '0.35rem' }}
              placeholder="NBA, NFL, Soccer"
              value={form.sports}
              onChange={(e) => setForm({ ...form, sports: e.target.value })}
            />
          </label>

          <label style={{ color: MUTED, fontSize: '0.9rem' }}>
            Monthly subscription price (in your currency units)
            <input
              style={{ ...formStyles.input, marginTop: '0.35rem' }}
              type="number"
              step="0.01"
              min="0"
              placeholder="9.99"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </label>

          {errors.length > 0 ? (
            <ul style={{ ...formStyles.error, paddingLeft: '1.2rem' }}>
              {errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          ) : null}
          {msg ? <p style={{ color: 'var(--accent)', margin: 0 }}>{msg}</p> : null}

          <button style={formStyles.button} disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      )}

      {tipsterId ? (
        <p style={{ marginTop: '1.5rem' }}>
          <Link href={`/tipsters/${tipsterId}`} style={{ color: 'var(--accent)' }}>
            → View public profile
          </Link>
        </p>
      ) : null}
    </main>
  );
}
