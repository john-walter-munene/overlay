'use client';

import { useState } from 'react';
import Avatar from './Avatar';
import { avatarOptions } from '../lib/avatar';
import { removeAvatar, selectAvatarPreset, uploadAvatar } from '../lib/auth';

/**
 * Avatar chooser: upload a photo, or pick a generated avatar (including an
 * initials style). Self-contained — persists the choice to the API and reports
 * the resulting URL (or null when reset to the default) via onChange.
 */
export default function AvatarPicker({
  seed,
  value,
  onChange,
  previewSize = 84,
}: {
  /** Seed for the generated options (usually the username). */
  seed: string;
  /** Current avatar URL, or null for the default generated avatar. */
  value: string | null;
  onChange: (url: string | null) => void;
  previewSize?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const options = avatarOptions(seed || 'you');

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMsg(null);
    setBusy(true);
    try {
      const { avatarUrl } = await uploadAvatar(file);
      onChange(avatarUrl);
      setMsg('Photo uploaded ✓');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function pick(url: string) {
    if (busy) return;
    setMsg(null);
    setBusy(true);
    try {
      await selectAvatarPreset(url);
      onChange(url);
      setMsg('Avatar updated ✓');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setMsg(null);
    setBusy(true);
    try {
      await removeAvatar();
      onChange(null);
      setMsg('Reset to default ✓');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: '1.1rem',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <Avatar src={value} seed={seed} size={previewSize} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <label
              className="btn btn--secondary btn--sm"
              style={{ cursor: busy ? 'default' : 'pointer' }}
            >
              {busy ? 'Saving…' : 'Upload photo'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={onFile}
                disabled={busy}
                style={{ display: 'none' }}
              />
            </label>
            {value ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={reset}
                disabled={busy}
              >
                Reset
              </button>
            ) : null}
          </div>
          <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            {msg ??
              'Upload a photo, or pick a generated avatar. JPG/PNG/WEBP, up to 2 MB.'}
          </span>
        </div>
      </div>

      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={() => setShowOptions((open) => !open)}
        aria-expanded={showOptions}
        aria-controls="avatar-options"
        style={{
          marginTop: '1rem',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
        }}
      >
        Pick an avatar
        <span aria-hidden="true">{showOptions ? '\u25B4' : '\u25BE'}</span>
      </button>
      {showOptions ? (
        <div
          id="avatar-options"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))',
            gap: '0.6rem',
            marginTop: '0.75rem',
          }}
        >
          {options.map((o) => {
            const selected = value === o.url;
            return (
              <button
                key={o.style}
                type="button"
                onClick={() => pick(o.url)}
                disabled={busy}
                aria-pressed={selected}
                title={o.style === 'initials' ? 'Initials' : o.style}
                style={{
                  padding: '0.25rem',
                  borderRadius: 12,
                  border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                  background: selected ? 'var(--surface-2)' : 'transparent',
                  cursor: busy ? 'default' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Avatar src={o.url} seed={seed} size={44} />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
