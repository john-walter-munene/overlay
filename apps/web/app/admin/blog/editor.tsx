'use client';

import { useState } from 'react';
import { formStyles } from '../../formStyles';
import { Draft, Status } from './foundation';
import { Preview } from './view';

// Editor unique experience.
import './editor.css';

// --- Toolbar ---

interface ToolbarProps {
  saving: boolean;
  canSave: boolean;
  onSave(): void;
  onCancel(): void;
}

export function Toolbar({ saving, canSave, onSave, onCancel }: ToolbarProps) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
      <button style={formStyles.button} onClick={onSave} disabled={!canSave || saving}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button
        style={{ ...formStyles.button, background: 'var(--border)', color: 'var(--fg)' }}
        onClick={onCancel}
        disabled={saving}
      >
        Cancel
      </button>
    </div>
  );
}

// --- Metadata Form ---

interface MetadataFormProps {
  draft: Draft;
  role: 'admin' | 'tipster' | null;
  update<K extends keyof Draft>(key: K, value: Draft[K]): void;
}

export function MetadataForm({ draft, role, update }: MetadataFormProps) {
  const [coverFileName, setCoverFileName] = useState<string | null>(null);

  function handleCoverPick(file: File | null) {
    if (!file) return;

    // Store the raw File so createArticle/updateArticle can upload it later
    update('coverFile', file);

    // Build a local preview URL immediately
    const preview = URL.createObjectURL(file);
    update('coverPreview', preview);
    update('coverImage', preview); // fallback for existing <img src={draft.coverImage}>

    setCoverFileName(file.name);
  }

  const hasCover = draft.coverImage && draft.coverPreview;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      <label>
        Title
        <input
          style={formStyles.input}
          value={draft.title}
          onChange={(e) => update('title', e.target.value)}
        />
      </label>

      {!draft.id && (
        <label>
          Slug (optional — derived from title)
          <input
            style={formStyles.input}
            value={draft.slug}
            onChange={(e) => update('slug', e.target.value)}
          />
        </label>
      )}

      {/* Cover image upload — styled like a file-picker button */}
      <label>
        Cover image
        <div
          style={{
            ...formStyles.input,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: 0,
            overflow: 'hidden',
            cursor: 'pointer',
          }}
        >
          <span
            style={{
              background: 'var(--border)',
              color: 'var(--fg)',
              padding: '0.7rem 1rem',
              whiteSpace: 'nowrap',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            {coverFileName ? 'Change' : 'Choose file'}
          </span>
          <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            {coverFileName ?? 'PNG / JPEG / WebP'}
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{
              position: 'absolute',
              opacity: 0,
              width: 0,
              height: 0,
              overflow: 'hidden',
            }}
            onChange={(e) => {
              handleCoverPick(e.target.files?.[0] ?? null);
              e.target.value = '';
            }}
          />
        </div>
      </label>

      {/* Cover preview */}
      {hasCover && (
        <div style={{ position: 'relative' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={draft.coverPreview}
            alt="Cover preview"
            style={{
              width: '100%',
              borderRadius: 8,
              border: '1px solid var(--border)',
              display: 'block',
            }}
          />
          <button
            type="button"
            title="Remove cover"
            onClick={() => {
              update('coverImage', '');
              update('coverPreview', '');
              update('coverFile', null);
              setCoverFileName(null);
            }}
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              background: 'rgba(0,0,0,0.65)',
              color: '#fff',
              border: 'none',
              borderRadius: '50%',
              width: 26,
              height: 26,
              fontSize: '1rem',
              lineHeight: 1,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>
      )}

      <label>
        Tags (comma separated)
        <input
          style={formStyles.input}
          value={draft.tags}
          onChange={(e) => update('tags', e.target.value)}
        />
      </label>

      <label>
        Section
        <select
          style={formStyles.input}
          value={draft.category}
          onChange={(e) => update('category', e.target.value as 'content' | 'news')}
        >
          <option value="content">Content (guides)</option>
          <option value="news">News</option>
        </select>
      </label>

      <label>
        Status
        <select
          style={formStyles.input}
          value={draft.status}
          onChange={(e) => update('status', e.target.value as Status)}
        >
          <option value="draft">Draft</option>
          {role === 'admin' ? (
            <>
              <option value="pending">Pending review</option>
              <option value="published">Published</option>
            </>
          ) : (
            <option value="pending">Submit for review</option>
          )}
          <option value="archived">Archived</option>
        </select>
      </label>

      <label>
        SEO title
        <input
          style={formStyles.input}
          value={draft.seoTitle}
          onChange={(e) => update('seoTitle', e.target.value)}
        />
      </label>

      <label>
        SEO description
        <input
          style={formStyles.input}
          value={draft.seoDescription}
          onChange={(e) => update('seoDescription', e.target.value)}
        />
      </label>

      <label>
        Canonical URL
        <input
          style={formStyles.input}
          value={draft.canonicalUrl}
          onChange={(e) => update('canonicalUrl', e.target.value)}
        />
      </label>

    </div>
  );
}

// --- Markdown Editor ---

interface MarkdownEditorProps {
  body: string;
  update<K extends keyof Draft>(key: K, value: Draft[K]): void;
}

export function MarkdownEditor({ body, update }: MarkdownEditorProps) {
  return (
    <textarea
      style={{
        ...formStyles.input,
        minHeight: 520,
        fontFamily: 'monospace',
        resize: 'vertical',
      }}
      value={body}
      onChange={(e) => update('body', e.target.value)}
      placeholder="Write markdown here..."
    />
  );
}

// --- Workspace Tabs ---

interface WorkspaceTabsProps {
  active: 'write' | 'preview';
  setActive(tab: 'write' | 'preview'): void;
}

export function WorkspaceTabs({ active, setActive }: WorkspaceTabsProps) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
      {(['write', 'preview'] as const).map((tab) => (
        <button
          key={tab}
          style={{
            ...formStyles.button,
            opacity: active === tab ? 1 : 0.6,
            background: active === tab ? 'var(--accent)' : 'var(--border)',
            color: active === tab ? 'var(--on-accent)' : 'var(--fg)',
          }}
          onClick={() => setActive(tab)}
        >
          {tab === 'write' ? 'Editor' : 'Preview'}
        </button>
      ))}
    </div>
  );
}

// --- Editor ---

interface EditorProps {
  draft: Draft;
  role: 'admin' | 'tipster' | null;
  saving: boolean;
  update<K extends keyof Draft>(key: K, value: Draft[K]): void;
  onSave(): void;
  onCancel(): void;
}

export function Editor({ draft, role, saving, update, onSave, onCancel }: EditorProps) {
  const [workspace, setWorkspace] = useState<'write' | 'preview'>('write');

  const canSave = draft.title.trim().length > 0 && draft.body.trim().length > 0;

  return (
    <section>

      <WorkspaceTabs active={workspace} setActive={setWorkspace} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 360px) minmax(0, 1fr)',
          gap: '1.5rem',
        }}
      >
        <aside
          style={{
            ...formStyles.form,
            maxHeight: '80vh',
            overflowY: 'auto',
          }}
        >
          <MetadataForm draft={draft} role={role} update={update} />

          <Toolbar saving={saving} canSave={canSave} onSave={onSave} onCancel={onCancel} />
        </aside>

        <main style={{ minWidth: 0 }}>
          {workspace === 'write' ? (
            <MarkdownEditor body={draft.body} update={update} />
          ) : (
            <Preview body={draft.body} />
          )}
        </main>
      </div>

    </section>
  );
}