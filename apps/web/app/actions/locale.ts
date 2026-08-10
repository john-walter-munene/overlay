'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { LOCALE_COOKIE, resolveLocale } from '../../i18n/config';

/**
 * Persist the user's language choice in the NEXT_LOCALE cookie and revalidate
 * so server components re-render in the new locale.
 */
export async function setLocale(value: string): Promise<void> {
  const locale = resolveLocale(value);
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: 'lax',
  });
  revalidatePath('/', 'layout');
}
