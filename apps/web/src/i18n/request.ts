import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

export const LOCALES = ['en', 'fa'] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = 'NEXT_LOCALE';

/** Locale lives in a cookie (no locale prefix in URLs, so routes stay `/dashboard` etc.). */
export default getRequestConfig(async () => {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  const locale: Locale = value === 'fa' ? 'fa' : 'en';
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
