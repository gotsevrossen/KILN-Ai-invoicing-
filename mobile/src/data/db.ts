import * as Crypto from 'expo-crypto';

import { db, ok } from './db-client';
import { loadDocs, type LoadedDocs } from './db-docs';
import { loadPhotos } from './db-photos';

import type { PricingSettings, Profile, SetupInput } from './store';
import type { TradeId } from './trades';
import type { Customer, Job, Photo, PriceItem, Unit } from './types';

// Reads and writes for the real database. Row Level Security on the server decides
// what each signed-in user can see, so these queries never filter by user themselves.

/** Ids are made on the phone so a new record can be used right away, even offline. */
export const newUuid = (): string => Crypto.randomUUID();


interface BusinessRow {
  id: string;
  name: string;
  phone: string;
  trades: string[];
  pricing: 'hourly' | 'flat';
  rate_cents: number;
  markup_bps: number;
  tax_rate_bps: number;
  tax_labor: boolean;
  tax_materials: boolean;
  deposit_bps: number;
  due_days: number;
  card_fee: boolean;
  ai_write_scope: boolean;
}

interface PriceRow {
  id: string;
  catalog_id: string | null;
  name: string;
  unit: Unit;
  unit_cents: number | null;
}

interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  lang: 'en' | 'es';
}

interface JobRow {
  id: string;
  customer_id: string;
  estimate_skipped: boolean;
  reopened: boolean;
  title: string;
  address: string;
  pricing: 'hourly' | 'flat';
  rate_cents: number | null;
  work_order: string | null;
  private_note: string | null;
}

export interface Loaded {
  businessId: string;
  profile: Profile;
  settings: PricingSettings;
  cardFee: boolean;
  /** KILN writes the customer's job description (Settings switch). */
  aiScope: boolean;
  priceList: PriceItem[];
  customers: Customer[];
  jobs: Job[];
  /** Hours, notes, estimates, change orders, receipts, and invoices. */
  docs: LoadedDocs;
  photos: Photo[];
}

const toPriceItem = (r: PriceRow): PriceItem => ({ id: r.catalog_id ?? r.id, dbId: r.id, name: r.name, unit: r.unit, unitCents: r.unit_cents });

const toCustomer = (r: CustomerRow): Customer => ({ id: r.id, name: r.name, firstName: r.name.split(' ')[0], phone: r.phone, lang: r.lang });

const toJob = (r: JobRow): Job => ({
  id: r.id,
  title: r.title,
  customerId: r.customer_id,
  address: r.address,
  pricing: r.pricing,
  rateCents: r.rate_cents ?? undefined,
  group: 'active',
  baseStatus: 'live',
  workOrder: r.work_order ?? undefined,
  privateNote: r.private_note ?? undefined,
});

/** Everything the app needs at start, or null when this account has no business yet (setup next). */
export async function loadAll(): Promise<Loaded | null> {
  const b = ok(await db().from('businesses').select('*').maybeSingle<BusinessRow>());
  if (!b) return null;
  const [items, customers, jobs] = await Promise.all([
    db().from('price_list_items').select('id, catalog_id, name, unit, unit_cents').order('created_at').returns<PriceRow[]>(),
    db().from('customers').select('id, name, phone, lang').order('created_at').returns<CustomerRow[]>(),
    db().from('jobs').select('id, customer_id, title, address, pricing, rate_cents, work_order, private_note, estimate_skipped, reopened').order('created_at', { ascending: false }).returns<JobRow[]>(),
  ]);
  return {
    businessId: b.id,
    profile: {
      businessName: b.name,
      phone: b.phone,
      trades: b.trades as TradeId[],
      pricing: b.pricing,
      rateCents: b.rate_cents,
      onboarded: true,
    },
    settings: {
      markupBps: b.markup_bps,
      tax: { rateBps: b.tax_rate_bps, labor: b.tax_labor, materials: b.tax_materials },
      depositBps: b.deposit_bps,
      dueDays: b.due_days,
    },
    cardFee: b.card_fee,
    aiScope: b.ai_write_scope,
    priceList: (ok(items) ?? []).map(toPriceItem),
    customers: (ok(customers) ?? []).map(toCustomer),
    jobs: (ok(jobs) ?? []).map(toJob),
    photos: await loadPhotos(),
    docs: await loadDocs({
      skipped: (ok(jobs) ?? []).filter((j) => j.estimate_skipped).map((j) => j.id),
      reopened: (ok(jobs) ?? []).filter((j) => j.reopened).map((j) => j.id),
    }),
  };
}

/** Setup: makes the business (and you its owner) and saves the starter price list. */
export async function createBusiness(input: SetupInput): Promise<void> {
  const businessId = ok(
    await db().rpc('create_business', {
      p_name: input.businessName.trim(),
      p_phone: input.phone.trim(),
      p_trades: input.trades,
      p_pricing: input.pricing,
      p_rate_cents: input.rateCents,
    }),
  ) as string;
  if (input.priceList.length) {
    ok(
      await db()
        .from('price_list_items')
        .insert(
          input.priceList.map((p) => ({
            business_id: businessId,
            // starter items keep their id (e.g. 'dw-patch') so trades can find them
            catalog_id: p.id,
            name: p.name,
            unit: p.unit,
            unit_cents: p.unitCents,
          })),
        ),
    );
  }
}

export async function saveSettings(businessId: string, s: PricingSettings, cardFee: boolean, aiScope: boolean): Promise<void> {
  ok(
    await db()
      .from('businesses')
      .update({
        markup_bps: s.markupBps,
        tax_rate_bps: s.tax.rateBps,
        tax_labor: s.tax.labor,
        tax_materials: s.tax.materials,
        deposit_bps: s.depositBps,
        due_days: s.dueDays,
        card_fee: cardFee,
        ai_write_scope: aiScope,
      })
      .eq('id', businessId),
  );
}

/**
 * Saves the owner's trades, adds the starter items new trades bring (skipping any already there),
 * and deletes the starter items of a trade turned off. Estimate lines keep their own copy of
 * name and price, so deleting an item never changes an estimate.
 */
export async function saveTrades(businessId: string, trades: TradeId[], newItems: PriceItem[], removedItemIds: string[]): Promise<void> {
  ok(await db().from('businesses').update({ trades }).eq('id', businessId));
  if (removedItemIds.length) {
    ok(await db().from('price_list_items').delete().eq('business_id', businessId).in('catalog_id', removedItemIds));
  }
  if (newItems.length) {
    ok(
      await db()
        .from('price_list_items')
        .upsert(
          newItems.map((p) => ({ business_id: businessId, catalog_id: p.id, name: p.name, unit: p.unit, unit_cents: p.unitCents })),
          { onConflict: 'business_id,catalog_id', ignoreDuplicates: true },
        ),
    );
  }
}

/** Saves a price. Items not in the database yet (an owner-added starter item) are added. */
export async function savePrice(businessId: string, item: PriceItem): Promise<void> {
  if (item.dbId) {
    ok(await db().from('price_list_items').update({ unit_cents: item.unitCents }).eq('id', item.dbId));
  } else {
    ok(
      await db().from('price_list_items').upsert(
        { business_id: businessId, catalog_id: item.id, name: item.name, unit: item.unit, unit_cents: item.unitCents },
        { onConflict: 'business_id,catalog_id' },
      ),
    );
  }
}

export async function insertCustomer(businessId: string, c: Customer): Promise<void> {
  ok(await db().from('customers').insert({ id: c.id, business_id: businessId, name: c.name, phone: c.phone, lang: c.lang }));
}

export async function insertJob(businessId: string, j: Job): Promise<void> {
  ok(
    await db().from('jobs').insert({
      id: j.id,
      business_id: businessId,
      customer_id: j.customerId,
      title: j.title,
      address: j.address,
      pricing: j.pricing,
      rate_cents: j.rateCents ?? null,
      work_order: j.workOrder ?? null,
      private_note: j.privateNote ?? null,
    }),
  );
}
