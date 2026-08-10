// Pure blog-localization helpers (kept free of Nest/Prisma so the fallback and
// overlay rules can be unit-tested in isolation). The service reads English
// (source) rows plus any locale translations and delegates the "which text do
// we serve" decision here.

export interface LocalizableCard {
  slug: string;
  title: string;
  excerpt: string;
  coverImage: string | null;
}

/**
 * Overlay locale translations onto the English base list, matched by shared
 * slug. Rows without a translation keep their English text (fallback), and the
 * base ordering is preserved. Only display fields are overlaid; the canonical
 * metadata (tags, category, publishedAt, etc.) stays from the English source.
 */
export function overlayTranslations<T extends LocalizableCard>(
  base: T[],
  translations: LocalizableCard[],
): T[] {
  const bySlug = new Map(translations.map((t) => [t.slug, t]));
  return base.map((row) => {
    const tr = bySlug.get(row.slug);
    if (!tr) return row;
    return {
      ...row,
      title: tr.title,
      excerpt: tr.excerpt,
      coverImage: tr.coverImage ?? row.coverImage,
    };
  });
}

/** Whether a locale should attempt a translation lookup (English is the source). */
export function needsTranslation(locale: string): boolean {
  return locale !== 'en' && locale.trim() !== '';
}
