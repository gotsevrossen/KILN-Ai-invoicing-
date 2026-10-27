import type { Unit } from './types';

// What each trade sees: its job types and the price list items it usually charges for.
// Names live in the translation files (trades.*, jobTypes.*, items.*). Starter price
// list items have no prices: the owner types their own. KILN never makes up prices.

export type TradeId =
  | 'plumbing'
  | 'electrical'
  | 'hvac'
  | 'drywall'
  | 'painting'
  | 'flooring'
  | 'handyman'
  | 'carpentry'
  | 'lawn'
  | 'landscaping';

export interface JobTypeDef {
  id: string;
  /** Items the owner gives a quantity for (square feet, fixtures, hours…). */
  ask: string[];
  /** Items added once, like a trip fee. */
  extras?: string[];
}

export interface TradeDef {
  id: TradeId;
  icon: 'droplet' | 'zap' | 'thermometer' | 'square' | 'edit-2' | 'grid' | 'tool' | 'layers' | 'scissors' | 'sun';
  /** How this trade usually charges, used to suggest a default in setup. */
  pricing: 'hourly' | 'flat';
  jobTypes: JobTypeDef[];
}

/** Every starter item and its unit. Ids are shared, so two trades can use the same item. */
export const ITEM_UNITS: Record<string, Unit> = {
  trip: 'flat',
  labor: 'hour',
  diag: 'flat',
  haul: 'flat',
  'fixture-install': 'each',
  'drain-clear': 'each',
  'water-heater': 'each',
  'shutoff-valve': 'each',
  outlet: 'each',
  'light-fixture': 'each',
  'ceiling-fan': 'each',
  panel: 'flat',
  tuneup: 'each',
  'hvac-install': 'each',
  duct: 'linear_ft',
  'dw-patch': 'each',
  'dw-hang': 'sq_ft',
  'dw-texture': 'sq_ft',
  'dw-ceiling': 'sq_ft',
  'paint-wall': 'sq_ft',
  'paint-ceiling': 'sq_ft',
  'paint-trim': 'linear_ft',
  'paint-exterior': 'sq_ft',
  'fence-paint': 'linear_ft',
  'floor-lvp': 'sq_ft',
  'floor-tile': 'sq_ft',
  'floor-carpet': 'sq_ft',
  'floor-remove': 'sq_ft',
  baseboard: 'linear_ft',
  mount: 'each',
  assembly: 'each',
  'small-repair': 'each',
  'deck-board': 'board',
  railing: 'linear_ft',
  'wash-seal': 'sq_ft',
  'fence-repair': 'linear_ft',
  'trim-carpentry': 'linear_ft',
  mow: 'each',
  'leaf-cleanup': 'flat',
  aeration: 'flat',
  hedge: 'each',
  mulch: 'cu_yd',
  plants: 'each',
  sod: 'sq_ft',
  'bed-prep': 'sq_ft',
};

/** Starter prices in cents (Rossen's call, Oct 27). Every other starter item begins empty for the owner to fill in. */
const STARTER_CENTS: Record<string, number> = { trip: 2000 };

/** A new starter item's price: hourly owners' labor is their rate, the trip fee is $20, the rest is empty. */
export function starterCents(itemId: string, pricing: 'hourly' | 'flat', rateCents: number | null): number | null {
  if (itemId === 'labor') return pricing === 'hourly' ? rateCents : null;
  return STARTER_CENTS[itemId] ?? null;
}

export const TRADES: TradeDef[] = [
  {
    id: 'plumbing',
    icon: 'droplet',
    pricing: 'hourly',
    jobTypes: [
      { id: 'leak', ask: ['labor'], extras: ['trip'] },
      { id: 'drain', ask: ['drain-clear'], extras: ['trip'] },
      { id: 'waterHeater', ask: ['water-heater'], extras: ['trip', 'haul'] },
      { id: 'fixture', ask: ['fixture-install', 'shutoff-valve'], extras: ['trip'] },
    ],
  },
  {
    id: 'electrical',
    icon: 'zap',
    pricing: 'hourly',
    jobTypes: [
      { id: 'outlets', ask: ['outlet'], extras: ['trip'] },
      { id: 'lighting', ask: ['light-fixture', 'ceiling-fan'], extras: ['trip'] },
      { id: 'panel', ask: [], extras: ['panel', 'trip'] },
      { id: 'troubleshoot', ask: ['labor'], extras: ['trip'] },
    ],
  },
  {
    id: 'hvac',
    icon: 'thermometer',
    pricing: 'hourly',
    jobTypes: [
      { id: 'tuneup', ask: ['tuneup'], extras: ['trip'] },
      { id: 'hvacRepair', ask: ['labor'], extras: ['diag'] },
      { id: 'hvacInstall', ask: ['hvac-install', 'duct'], extras: ['haul'] },
    ],
  },
  {
    id: 'drywall',
    icon: 'square',
    pricing: 'flat',
    jobTypes: [
      { id: 'patch', ask: ['dw-patch'] },
      { id: 'hangFinish', ask: ['dw-hang'], extras: ['haul'] },
      { id: 'texture', ask: ['dw-texture'] },
      { id: 'ceilingRepair', ask: ['dw-ceiling'] },
    ],
  },
  {
    id: 'painting',
    icon: 'edit-2',
    pricing: 'flat',
    jobTypes: [
      { id: 'interiorPaint', ask: ['paint-wall', 'paint-ceiling', 'paint-trim'] },
      { id: 'exteriorPaint', ask: ['paint-exterior', 'paint-trim'] },
      { id: 'fencePaint', ask: ['fence-paint'] },
    ],
  },
  {
    id: 'flooring',
    icon: 'grid',
    pricing: 'flat',
    jobTypes: [
      { id: 'lvp', ask: ['floor-lvp', 'floor-remove', 'baseboard'], extras: ['haul'] },
      { id: 'tile', ask: ['floor-tile', 'floor-remove'], extras: ['haul'] },
      { id: 'carpet', ask: ['floor-carpet', 'floor-remove'], extras: ['haul'] },
    ],
  },
  {
    id: 'handyman',
    icon: 'tool',
    pricing: 'hourly',
    jobTypes: [
      { id: 'hourlyWork', ask: ['labor'], extras: ['trip'] },
      { id: 'mounting', ask: ['mount'], extras: ['trip'] },
      { id: 'assembly', ask: ['assembly'], extras: ['trip'] },
      { id: 'smallRepairs', ask: ['small-repair'], extras: ['trip'] },
    ],
  },
  {
    id: 'carpentry',
    icon: 'layers',
    pricing: 'flat',
    jobTypes: [
      { id: 'deck', ask: ['deck-board', 'railing', 'wash-seal'], extras: ['haul'] },
      { id: 'fence', ask: ['fence-repair'], extras: ['haul'] },
      { id: 'trim', ask: ['trim-carpentry'] },
    ],
  },
  {
    id: 'lawn',
    icon: 'scissors',
    pricing: 'flat',
    jobTypes: [
      { id: 'mowing', ask: ['mow'] },
      { id: 'cleanup', ask: [], extras: ['leaf-cleanup'] },
      { id: 'aeration', ask: [], extras: ['aeration'] },
      { id: 'hedges', ask: ['hedge'] },
    ],
  },
  {
    id: 'landscaping',
    icon: 'sun',
    pricing: 'flat',
    jobTypes: [
      { id: 'mulch', ask: ['mulch', 'bed-prep'] },
      { id: 'planting', ask: ['plants'] },
      { id: 'sod', ask: ['sod'], extras: ['haul'] },
    ],
  },
];

export function tradeById(id: TradeId): TradeDef {
  const trade = TRADES.find((t) => t.id === id);
  if (!trade) throw new Error(`No trade ${id}`);
  return trade;
}

/** Every item the chosen trades use, in a stable order, no repeats. */
export function starterItemIds(trades: TradeId[]): string[] {
  const ids: string[] = [];
  for (const trade of TRADES.filter((t) => trades.includes(t.id))) {
    for (const jt of trade.jobTypes) {
      for (const id of [...jt.ask, ...(jt.extras ?? [])]) if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

/** Starter items only the removed trade uses. Items a remaining trade still uses (trip fee, labor…) are kept. */
export function itemsOnlyIn(removed: TradeId, remaining: TradeId[]): string[] {
  const keep = new Set(starterItemIds(remaining));
  return starterItemIds([removed]).filter((id) => !keep.has(id));
}

/** Hourly if most of the chosen trades usually charge by the hour. */
export function suggestedPricing(trades: TradeId[]): 'hourly' | 'flat' {
  const hourly = trades.filter((id) => tradeById(id).pricing === 'hourly').length;
  return hourly * 2 > trades.length ? 'hourly' : 'flat';
}
