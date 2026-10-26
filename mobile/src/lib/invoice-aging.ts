import type { InvoiceSnapshot } from '../data/types.ts';

/** The phone's calendar date, rather than UTC's date near midnight. */
export function localDate(ts: string | Date = new Date()): string {
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Example jobs keep their demonstration date; a real business uses today's date. */
export function businessDate(mode: 'example' | 'connected', exampleDate: string, now: Date = new Date()): string {
  return mode === 'example' ? exampleDate : localDate(now);
}

function calendarDay(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const stamp = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === iso
    ? stamp / 86_400_000 : null;
}

/** Unpaid calendar days after the saved due date. Due today is not overdue. */
export function invoiceDaysPastDue(input: {
  issued?: Pick<InvoiceSnapshot, 'issuedOn' | 'dueDays'>;
  sent: boolean;
  paid: boolean;
  dueCents: number;
}, today: string): number {
  if (!input.sent || input.paid || !Number.isSafeInteger(input.dueCents) || input.dueCents <= 0 || !input.issued) return 0;
  const { issuedOn, dueDays } = input.issued;
  if (!Number.isSafeInteger(dueDays) || dueDays < 0 || dueDays > 365) return 0;
  const start = calendarDay(issuedOn);
  const current = calendarDay(today);
  if (start === null || current === null) return 0;
  // UTC calendar-day arithmetic avoids 23/25-hour days at daylight-saving changes.
  return Math.max(0, current - start - dueDays);
}
