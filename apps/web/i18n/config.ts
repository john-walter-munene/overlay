// Supported locales for the web app. Locale is persisted in a cookie
// (NEXT_LOCALE) and read server-side, so the correct language renders on the
// first paint with no flash — mirroring the theme-toggle approach.

export const locales = ['en', 'fr', 'es', 'pt', 'de', 'nl', 'zh', 'tr'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

/** Cookie next-intl reads to determine the active locale. */
export const LOCALE_COOKIE = 'NEXT_LOCALE';

/** Native display names shown in the language switcher. */
export const localeNames: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
  es: 'Español',
  pt: 'Português',
  de: 'Deutsch',
  nl: 'Nederlands',
  zh: '中文',
  tr: 'Türkçe',
};

/** Short label shown on the switcher trigger (e.g. "EN"). */
export const localeLabels: Record<Locale, string> = {
  en: 'EN',
  fr: 'FR',
  es: 'ES',
  pt: 'PT',
  de: 'DE',
  nl: 'NL',
  zh: 'ZH',
  tr: 'TR',
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

/** Coerce an arbitrary value to a supported locale, falling back to default. */
export function resolveLocale(value: string | undefined | null): Locale {
  return isLocale(value) ? value : defaultLocale;
}
