import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PriceItem } from '../data/types.ts';
import { hoursNotWork, type Command } from './ai-check.ts';
import { billsAsHours, composeInvoiceLines, defaultBilling, laborRateCents } from './billing.ts';
import { documentTotals } from './money.ts';

const labor = (unitCents: number | null): PriceItem => ({ id: 'labor', name: 'Labor', unit: 'hour', unitCents });
const faucet: PriceItem = { id: 'faucet', name: 'Faucet install', unit: 'each', unitCents: 12000 };
const noTax = { rateBps: 0, labor: false, materials: false };

describe('labor rate: one source', () => {
  it('uses the price list Labor price', () => {
    assert.equal(laborRateCents([faucet, labor(9500)], 8500), 9500);
  });
  it('falls back to the setup rate only while Labor has no price', () => {
    assert.equal(laborRateCents([labor(null)], 8500), 8500);
    assert.equal(laborRateCents([faucet], 8500), 8500);
    assert.equal(laborRateCents([labor(0)], 8500), 8500);
  });
  it('has no rate rather than a made-up one', () => {
    assert.equal(laborRateCents([labor(null)], 0), null);
    assert.equal(laborRateCents([], undefined), null);
  });
  it('ignores an item named labor that is not hourly', () => {
    assert.equal(laborRateCents([{ ...labor(20000), unit: 'flat' }], 8500), 8500);
  });
});

describe('hours are billed at the job rate', () => {
  const base = { estimate: undefined, billing: defaultBilling(false), laborDescription: 'Labor', fees: [], changes: [], work: [], materials: [] };
  it('logged hours x the rate the job was created with', () => {
    const lines = composeInvoiceLines({ ...base, job: { pricing: 'hourly', rateCents: 9000 }, hours: 250 });
    assert.equal(lines.length, 1);
    assert.equal(lines[0].unitCents, 9000);
    assert.equal(documentTotals(lines, noTax).total, 22500);
  });
  it('a later price list change does not change an existing job', () => {
    // the job keeps its own copy; the invoice never reads the price list for hours
    const lines = composeInvoiceLines({ ...base, job: { pricing: 'hourly', rateCents: 9000 }, hours: 100 });
    assert.equal(lines[0].unitCents, 9000);
  });
  it('flat jobs never bill logged hours', () => {
    const lines = composeInvoiceLines({ ...base, job: { pricing: 'flat', rateCents: 9000 }, hours: 400 });
    assert.equal(lines.length, 0);
  });
});

describe('hours stay out of Work done', () => {
  it('hourly items are hours, everything else is work', () => {
    assert.equal(billsAsHours(labor(9000)), true);
    assert.equal(billsAsHours(faucet), false);
  });
  it('a voice command for labor hours becomes logged hours, not a work line', () => {
    const said: Command[] = [
      { type: 'work', jobId: 'j1', description: 'Labor', qtyHundredths: 200, unitCents: 7000, itemId: 'labor', kind: 'labor' },
      { type: 'work', jobId: 'j1', description: 'Faucet', qtyHundredths: 100, unitCents: null, itemId: 'faucet', kind: 'labor' },
    ];
    const out = hoursNotWork(said, [labor(9000), faucet]);
    assert.deepEqual(out[0], { type: 'hours', jobId: 'j1', hundredths: 200, note: 'Labor' });
    assert.equal(out[1].type, 'work');
  });
  it('leaves an impossible number of hours for the owner to fix', () => {
    const said: Command[] = [{ type: 'work', jobId: 'j1', description: 'Labor', qtyHundredths: 5000, unitCents: null, itemId: 'labor', kind: 'labor' }];
    assert.equal(hoursNotWork(said, [labor(9000)])[0].type, 'work');
  });
});
