import { tradeById, type TradeId } from '../data/trades.ts';
import type { Unit } from '../data/types.ts';
import { lineTotal, type LineKind } from './money.ts';

// The app's own check on what the AI server sends back, before anything reaches a screen.
// The server checks too; this keeps a bad or tampered reply from becoming a line or a price.
// Anything that doesn't fit is dropped, never guessed.

export interface Guess {
  tradeId: TradeId | null;
  jobTypeId: string | null;
  quantities: { itemId: string; qtyHundredths: number }[];
}

export interface MissedItem {
  itemId: string;
  reason: string;
}

export interface ImportedPrice {
  name: string;
  unit: Unit;
  unitCents: number;
  /** The owner's price list item this price is for, or null for a new item. */
  matchId: string | null;
  unclear: boolean;
}

const UNITS: Unit[] = ['sq_ft', 'board', 'linear_ft', 'hour', 'flat', 'each', 'cu_yd'];

const record = (x: unknown): Record<string, unknown> | null => (x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : null);
const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown, max: number): string | null => {
  if (typeof x !== 'string') return null;
  const s = x.replace(/\s+/g, ' ').trim();
  return s && s.length <= max ? s : null;
};
const whole = (x: unknown, min: number, max: number): number | null =>
  (typeof x === 'number' && Number.isSafeInteger(x) && x >= min && x <= max ? x : null);

/** A job type from the owner's own trades, and quantities only for their own price list items. */
export function checkGuess(raw: unknown, trades: TradeId[], itemIds: string[]): Guess | null {
  const r = record(raw);
  if (!r) return null;
  let tradeId: TradeId | null = null;
  let jobTypeId: string | null = null;
  if (typeof r.tradeId === 'string' && trades.includes(r.tradeId as TradeId) &&
    tradeById(r.tradeId as TradeId).jobTypes.some((jt) => jt.id === r.jobTypeId)) {
    tradeId = r.tradeId as TradeId;
    jobTypeId = r.jobTypeId as string;
  }
  const seen = new Set<string>();
  const quantities: Guess['quantities'] = [];
  for (const q of list(r.quantities)) {
    const x = record(q);
    const qty = whole(x?.qtyHundredths, 1, 100_000_000);
    if (!x || typeof x.itemId !== 'string' || !itemIds.includes(x.itemId) || seen.has(x.itemId) || qty === null) continue;
    seen.add(x.itemId);
    quantities.push({ itemId: x.itemId, qtyHundredths: qty });
  }
  return { tradeId, jobTypeId, quantities: quantities.slice(0, 20) };
}

/** Up to 3 of the owner's price list items, each with a short reason. */
export function checkMissed(raw: unknown, itemIds: string[]): MissedItem[] {
  const seen = new Set<string>();
  const out: MissedItem[] = [];
  for (const m of list(record(raw)?.items)) {
    const x = record(m);
    const reason = str(x?.reason, 160);
    if (!x || typeof x.itemId !== 'string' || !itemIds.includes(x.itemId) || seen.has(x.itemId) || !reason) continue;
    seen.add(x.itemId);
    out.push({ itemId: x.itemId, reason });
  }
  return out.slice(0, 3);
}

/** The customer description, or null if it's empty or too long to be one. Line breaks are kept. */
export function checkScope(raw: unknown): string | null {
  const text = record(raw)?.text;
  if (typeof text !== 'string') return null;
  const s = text.trim();
  return s && s.length <= 1500 ? s : null;
}

/** Prices in whole cents, for a known unit, matched to at most one price per existing item. */
export function checkPrices(raw: unknown, itemIds: string[]): ImportedPrice[] {
  const matched = new Set<string>();
  const out: ImportedPrice[] = [];
  for (const p of list(record(raw)?.prices)) {
    const x = record(p);
    const name = str(x?.name, 160);
    const cents = whole(x?.unitCents, 0, 100_000_000);
    if (!x || !name || cents === null || !UNITS.includes(x.unit as Unit)) continue;
    const matchId = typeof x.matchId === 'string' && itemIds.includes(x.matchId) && !matched.has(x.matchId) ? x.matchId : null;
    if (matchId) matched.add(matchId);
    out.push({ name, unit: x.unit as Unit, unitCents: cents, matchId, unclear: x.unclear === true });
  }
  return out.slice(0, 150);
}

const isoDay = (x: unknown): string | null => {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return null;
  const d = new Date(`${x}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === x ? x : null;
};

export interface ScannedReceipt {
  store: string;
  number: string;
  date: string | null;
  taxCents: number;
  /** The receipt's printed total, to check the items against. Null if unreadable. */
  totalCents: number | null;
  items: { name: string; costCents: number; unclear: boolean }[];
}

/** A receipt read from a photo: readable lines with whole-cent prices before tax. */
export function checkReceipt(raw: unknown): ScannedReceipt | null {
  const r = record(raw);
  if (!r) return null;
  const items = list(r.items).flatMap((i) => {
    const x = record(i);
    const name = str(x?.name, 160);
    const cents = whole(x?.costCents, 0, 100_000_000);
    return x && name && cents !== null ? [{ name, costCents: cents, unclear: x.unclear === true }] : [];
  }).slice(0, 200);
  return {
    store: str(r.store, 120) ?? '',
    number: str(r.number, 60) ?? '',
    date: isoDay(r.date),
    taxCents: whole(r.taxCents, 0, 100_000_000) ?? 0,
    totalCents: whole(r.totalCents, 0, 100_000_000),
    items,
  };
}

export interface ChangeDraft {
  description: string;
  quantities: { itemId: string; qtyHundredths: number }[];
  /** A price the owner said in the note. Null: the app prices it from the list. */
  statedCents: number | null;
}

export function checkChange(raw: unknown, itemIds: string[]): ChangeDraft | null {
  const r = record(raw);
  const description = typeof r?.description === 'string' ? r.description.trim() : '';
  if (!r || !description || description.length > 2000) return null;
  const guess = checkGuess({ quantities: r.quantities }, [], itemIds);
  return { description, quantities: guess?.quantities ?? [], statedCents: whole(r.statedCents, 0, 100_000_000) };
}

/**
 * The change's price: what the owner said, or the owner's own prices × quantities.
 * Items with no price yet are listed, never guessed; with any of them the price stays empty.
 */
export function priceChange(draft: ChangeDraft, priceList: { id: string; unitCents: number | null }[]): { cents: number | null; unpriced: string[] } {
  const unpriced = draft.quantities.filter((q) => priceList.find((i) => i.id === q.itemId)?.unitCents == null).map((q) => q.itemId);
  if (draft.statedCents !== null) return { cents: draft.statedCents, unpriced };
  if (!draft.quantities.length || unpriced.length) return { cents: null, unpriced };
  const cents = draft.quantities.reduce((sum, q) => sum + lineTotal(q.qtyHundredths, priceList.find((i) => i.id === q.itemId)!.unitCents!), 0);
  return { cents, unpriced };
}

export type Command =
  | { type: 'hours'; jobId: string | null; hundredths: number; note: string }
  | { type: 'work'; jobId: string | null; description: string; qtyHundredths: number; unitCents: number | null; itemId: string | null; kind: LineKind }
  | { type: 'note'; jobId: string | null; text: string };

/** Actions for the owner to confirm. A job or item that isn't theirs becomes "pick one", never a guess. */
export function checkCommands(raw: unknown, jobIds: string[], itemIds: string[]): Command[] {
  return list(record(raw)?.actions).flatMap((a): Command[] => {
    const x = record(a);
    if (!x) return [];
    const jobId = typeof x.jobId === 'string' && jobIds.includes(x.jobId) ? x.jobId : null;
    if (x.type === 'hours') {
      const h = whole(x.hundredths, 1, 2400);
      return h !== null ? [{ type: 'hours', jobId, hundredths: h, note: str(x.note, 200) ?? '' }] : [];
    }
    if (x.type === 'work') {
      const description = str(x.description, 300);
      const qty = whole(x.qtyHundredths, 1, 100_000_000);
      const kind = (['labor', 'material', 'fee'] as const).find((k) => k === x.kind) ?? 'labor';
      const itemId = typeof x.itemId === 'string' && itemIds.includes(x.itemId) ? x.itemId : null;
      return description && qty !== null
        ? [{ type: 'work', jobId, description, qtyHundredths: qty, unitCents: whole(x.unitCents, 0, 100_000_000), itemId, kind }]
        : [];
    }
    if (x.type === 'note') {
      const text = typeof x.text === 'string' ? x.text.trim().slice(0, 2000) : '';
      return text ? [{ type: 'note', jobId, text }] : [];
    }
    return [];
  }).slice(0, 10);
}
