'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSettings } from '@/lib/store/settings-store';
import { makeFormatter, type Fmt } from './format-core';

export { makeFormatter, type Fmt };

export function useFmt(): Fmt {
  const locale = useLocale();
  const persianDigits = useSettings((s) => s.persianDigits);
  const tempUnit = useSettings((s) => s.tempUnit);
  const t = useTranslations('units');
  return useMemo(
    () => makeFormatter(locale, persianDigits, tempUnit, { h: t('h'), m: t('m'), d: t('d'), w: t('w'), kw: t('kw'), wh: t('wh'), kwh: t('kwh') }),
    [locale, persianDigits, tempUnit, t],
  );
}
