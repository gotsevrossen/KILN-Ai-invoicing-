import { useMemo } from 'react';

import { localeFor, useLang, type Lang } from '@/i18n';

import { formatCents, formatQty } from './money';

/** Money, quantity, and date formatting in a given language. */
export function formatters(lang: Lang) {
  const locale = localeFor(lang);
  const dateFmt = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const monthFmt = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' });
  const weekdayFmt = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
  return {
    money: (cents: number) => formatCents(cents, locale),
    qty: (hundredths: number) => formatQty(hundredths, locale),
    /** "Oct 19" from "2026-10-19" */
    date: (iso: string) => dateFmt.format(new Date(`${iso}T00:00:00Z`)),
    month: (iso: string) => monthFmt.format(new Date(`${iso}T00:00:00Z`)),
    /** 0 = Sunday. Jan 4, 1970 was a Sunday. */
    weekday: (day: number) => weekdayFmt.format(new Date(Date.UTC(1970, 0, 4 + day))),
    pct: (bps: number) => formatQty(bps, locale),
  };
}

export function useFormat() {
  const { lang } = useLang();
  return useMemo(() => formatters(lang), [lang]);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
