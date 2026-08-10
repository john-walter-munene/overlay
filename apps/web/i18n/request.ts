import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { LOCALE_COOKIE, resolveLocale } from './config';

// next-intl request config for cookie-based locale selection (no URL routing).
// Reads the NEXT_LOCALE cookie, validates it, and loads the matching catalog.
export default getRequestConfig(async () => {
  const store = await cookies();
  const locale = resolveLocale(store.get(LOCALE_COOKIE)?.value);
  const messages = (await import(`../messages/${locale}.json`)).default;
  return { locale, messages };
});
