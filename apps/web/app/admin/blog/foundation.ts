import { authFetch } from '../../../lib/auth';

// Types

export type Status =
  | 'draft'
  | 'pending'
  | 'published'
  | 'archived';

export interface ManagedArticle {
  id: string;
  slug: string;
  title: string;
  body: string;
  excerpt: string;
  coverImage: string | null;
  tags: string[];
  category: 'content' | 'news';
  status: Status;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface Draft {
  id: string | null;
  title: string;
  slug: string;
  tags: string;

  // Persisted cover image URL.
  coverImage: string;

  // Local preview shown while editing.
  coverPreview: string;

  // Newly selected image waiting to be uploaded.
  coverFile: File | null;

  category: 'content' | 'news';
  status: Status;
  body: string;
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
}

// Constants

export const STATUS_LABELS: Record<Status, string> = {
  draft: 'Draft',
  pending: 'Pending review',
  published: 'Published',
  archived: 'Archived',
};

export const EMPTY_DRAFT: Draft = {
  id: null,
  title: '',
  slug: '',
  tags: '',
  coverImage: '',
  coverPreview: '',
  coverFile: null,
  category: 'content',
  status: 'draft',
  body: '',
  seoTitle: '',
  seoDescription: '',
  canonicalUrl: '',
};

// Helpers

export function toDraft(
  article: ManagedArticle,
): Draft {
  const coverImage = article.coverImage ?? '';

  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    tags: article.tags.join(', '),
    coverImage,
    coverPreview: coverImage,
    coverFile: null,
    category: article.category,
    status: article.status,
    body: article.body,
    seoTitle: article.seoTitle ?? '',
    seoDescription:
      article.seoDescription ?? '',
    canonicalUrl:
      article.canonicalUrl ?? '',
  };
}

function buildPayload(
  draft: Draft,
  coverImage: string,
) {
  return {
    title: draft.title,
    body: draft.body,
    coverImage: coverImage || undefined,
    tags: draft.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    category: draft.category,
    status: draft.status,
    seoTitle:
      draft.seoTitle || undefined,
    seoDescription:
      draft.seoDescription ||
      undefined,
    canonicalUrl:
      draft.canonicalUrl ||
      undefined,
    ...(draft.id
      ? {}
      : {
          slug:
            draft.slug || undefined,
        }),
  };
}

// API

export async function loadArticles(): Promise<
  ManagedArticle[]
> {
  const res = await authFetch(
    '/api/articles/manage/mine',
  );

  if (!res.ok) {
    throw new Error(
      `Failed to load articles (${res.status})`,
    );
  }

  return (await res.json()) as ManagedArticle[];
}

async function uploadArticleCover(
  file: File,
): Promise<string> {
  const formData = new FormData();

  formData.append('file', file);

  const res = await authFetch(
    '/api/articles/cover-upload',
    {
      method: 'POST',
      body: formData,
    },
  );

  await throwIfError(res);

  const data = (await res.json()) as {
    url?: string;
  };

  if (!data.url) {
    throw new Error(
      'The server did not return a cover image URL.',
    );
  }

  return data.url;
}

export async function createArticle(
  draft: Draft,
) {
  let coverImage = draft.coverImage;

  if (draft.coverFile) {
    coverImage = await uploadArticleCover(
      draft.coverFile,
    );
  }

  const payload = buildPayload(
    draft,
    coverImage,
  );

  const res = await authFetch(
    '/api/articles',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );

  await throwIfError(res);

  return res.json().catch(() => null);
}

export async function updateArticle(
  draft: Draft,
) {
  if (!draft.id) {
    throw new Error(
      'Cannot update an article without an id.',
    );
  }

  let coverImage = draft.coverImage;

  if (draft.coverFile) {
    coverImage = await uploadArticleCover(
      draft.coverFile,
    );
  }

  const payload = buildPayload(
    draft,
    coverImage,
  );

  const res = await authFetch(
    `/api/articles/${draft.id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );

  await throwIfError(res);

  return res.json().catch(() => null);
}

export async function deleteArticle(
  id: string,
) {
  const res = await authFetch(
    `/api/articles/${id}`,
    {
      method: 'DELETE',
    },
  );

  await throwIfError(res);
}

// Utilities

async function throwIfError(
  res: Response,
) {
  if (res.ok) {
    return;
  }

  const body = (await res
    .json()
    .catch(() => null)) as
    | {
        message?: string | string[];
      }
    | null;

  const message = Array.isArray(
    body?.message,
  )
    ? body.message.join(', ')
    : body?.message;

  throw new Error(
    message ||
      `Request failed (${res.status})`,
  );
}