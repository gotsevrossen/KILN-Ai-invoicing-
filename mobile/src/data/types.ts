import type { Lang } from '@/i18n';
import type { Cents, LineKind, TaxRule } from '@/lib/money';

// Shapes follow the data model in CLAUDE.md, trimmed to what the screens need.
// Dates are ISO strings (YYYY-MM-DD). Money is integer cents.

export interface Business {
  name: string;
  phone: string;
  markupBps: number;
  tax: TaxRule;
  dueDays: number;
  depositBps: number;
  pendingUploads: number;
}

export interface Customer {
  id: string;
  name: string;
  firstName: string;
  phone: string;
  lang: Lang;
}

export type JobGroup = 'active' | 'done' | 'paid';

export interface Job {
  id: string;
  title: string;
  customerId: string;
  address: string;
  pricing: 'hourly' | 'flat';
  rateCents?: Cents;
  group: JobGroup;
  /** Fixed status for example jobs that have no live documents. */
  baseStatus: 'estimateSent' | 'overdue' | 'repeat' | 'viewed' | 'paid' | 'live';
  /** Shown in lists when the job has no invoice or estimate to total. */
  amountCents?: Cents;
  overdueDays?: number;
  workOrder?: string;
  privateNote?: string;
  /** 0 = Sunday … 6 = Saturday */
  repeatWeekday?: number;
  paidNote?: string;
}

export interface TimeEntry {
  id: string;
  jobId: string;
  date: string;
  hundredths: number;
  note: string;
}

export type PhotoTag = 'before' | 'during' | 'after';

export type TimelineItem =
  | { kind: 'photos'; id: string; jobId: string; date: string; time: string; tags: PhotoTag[] }
  | { kind: 'voice'; id: string; jobId: string; date: string; time: string; length: string; transcript: string };

export interface ReceiptItem {
  id: string;
  line: number;
  name: string;
  qtyLabel: string;
  costCents: Cents;
  flagged?: boolean;
  likelyJobIds: string[];
}

export interface Receipt {
  id: string;
  store: string;
  number: string;
  date: string;
  taxCents: Cents;
  items: ReceiptItem[];
}

export type Assignment =
  | { type: 'jobs'; jobIds: string[] }
  | { type: 'personal' }
  | { type: 'overhead' };

export type Unit = 'sq_ft' | 'board' | 'linear_ft' | 'hour' | 'flat';

export interface PriceItem {
  id: string;
  name: string;
  unit: Unit;
  unitCents: Cents;
}

export interface DocLine {
  id: string;
  kind: LineKind;
  description: string;
  qtyHundredths: number;
  unitCents: Cents;
  unit?: Unit;
}

export interface Suggestion {
  id: string;
  title: string;
  reasonKey: 'invoice.missedValve';
  receiptItemId: string;
}

export interface Invoice {
  id: string;
  number: string;
  jobId: string;
  laborDescription: string;
  fees: DocLine[];
  /** Receipt items the AI put on the draft. */
  materialItemIds: string[];
  suggestion?: Suggestion;
  summary: string;
  sources: { photos: number; voice: number; receipts: number };
}

export interface ChangeOrder {
  id: string;
  number: number;
  jobId: string;
  description: string;
  amountCents: Cents;
  baseCents: Cents;
}

export interface CustomerEstimate {
  id: string;
  number: string;
  jobId: string;
  goodUntil: string;
  lines: DocLine[];
}
