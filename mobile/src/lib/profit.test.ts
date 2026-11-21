import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import * as sample from '../data/sample.ts';
import { jobProfit } from '../data/selectors.ts';
import type { State } from '../data/store';
import type { Job, Receipt } from '../data/types.ts';
import { jobEarnings, materialsBilledCents } from './profit.ts';

describe('profit math', () => {
  it('materials are billed at cost plus the Settings markup', () => {
    // 20% on $100.00 and on $49.99 (rounded to the cent)
    assert.equal(materialsBilledCents([{ costCents: 10000 }, { costCents: 4999 }], 2000), 12000 + 5999);
  });
  it('an item with markup turned off is billed at cost', () => {
    assert.equal(materialsBilledCents([{ costCents: 10000, markupOff: true }], 2000), 10000);
  });
  it('earned = labor + work + materials billed - receipt costs', () => {
    const r = jobEarnings({ laborCents: 34000, workCents: 5000, materialCostCents: 10000, materialBilledCents: 12000 });
    assert.equal(r.revenueCents, 51000);
    assert.equal(r.markupCents, 2000);
    assert.equal(r.earnedCents, 41000);
    assert.equal(r.marginBps, 8039);
  });
  it('materials included in an agreed price cost the owner without billing more', () => {
    const r = jobEarnings({ laborCents: 50000, workCents: 0, materialCostCents: 8000, materialBilledCents: 0 });
    assert.equal(r.earnedCents, 42000);
  });
  it('a credit change lowers revenue', () => {
    const r = jobEarnings({ laborCents: 50000, workCents: -5000, materialCostCents: 0, materialBilledCents: 0 });
    assert.equal(r.revenueCents, 45000);
  });
  it('no revenue means no margin, not a division by zero', () => {
    assert.equal(jobEarnings({ laborCents: 0, workCents: 0, materialCostCents: 2500, materialBilledCents: 0 }).marginBps, null);
  });
  it('refuses fractional or negative money', () => {
    assert.throws(() => jobEarnings({ laborCents: 10.5, workCents: 0, materialCostCents: 0, materialBilledCents: 0 }));
    assert.throws(() => jobEarnings({ laborCents: 0, workCents: 0, materialCostCents: -1, materialBilledCents: 0 }));
  });
});

describe('job profitability from data on the job', () => {
  const job: Job = { id: 'profit-test', title: 'Profit test', customerId: sample.customers[0].id, address: '1 Test St',
    pricing: 'hourly', rateCents: 9000, group: 'active', baseStatus: 'live' };
  const receipt: Receipt = { id: 'profit-receipt', store: 'Store', number: '1', date: '2026-11-01', taxCents: 0,
    items: [{ id: 'profit-item', line: 1, name: 'Valve', qtyLabel: '× 1', costCents: 10000, likelyJobIds: [] }] };
  sample.jobs.push(job);
  sample.receipts.push(receipt);
  after(() => {
    sample.jobs.splice(sample.jobs.indexOf(job), 1);
    sample.receipts.splice(sample.receipts.indexOf(receipt), 1);
  });
  const state = (): State => ({
    payments: [], opened: {}, online: { connected: false, walletReady: false, bankReady: false },
    mode: 'example', sentInvoices: [], paidInvoices: [], issuedInvoices: {},
    settings: { markupBps: 2000, tax: { rateBps: 0, labor: false, materials: false }, dueDays: 15, depositBps: 3000 },
    estimates: {}, invoiceBilling: {}, reopenedJobs: [], signed: {}, declinedChanges: [],
    timeEntries: [{ id: 't1', jobId: job.id, date: '2026-11-01', hundredths: 300, note: '' }],
    workItems: [{ id: 'w1', jobId: job.id, date: '2026-11-01', description: 'Haul away', unit: 'flat', qtyHundredths: 100, unitCents: 4000, kind: 'fee' }],
    assignments: { 'profit-item': { type: 'jobs', jobIds: [job.id] } }, acceptedSuggestions: [], fixedNames: {}, markupOff: {},
    skippedEstimates: [], dismissedSuggestions: [], materialsMode: {}, showLocation: {}, invoiceSummaries: {},
    voiceConfirmed: false, captures: [], photos: [], cardFee: false, aiScope: false,
    businessId: null, version: 0, syncError: null, priceList: [], localSave: 'confirmed', pendingSaves: 0,
    profile: { businessName: 'Test', phone: '', trades: ['handyman'], pricing: 'hourly', rateCents: 7500, onboarded: true },
  });

  it('uses logged hours x the job rate (not the setup rate), work done, receipts and markup', () => {
    const r = jobProfit(state(), job.id);
    assert.equal(r.laborCents, 27000); // 3 h x $90 job rate, not $75
    assert.equal(r.workCents, 4000);
    assert.equal(r.materialCostCents, 10000);
    assert.equal(r.materialBilledCents, 12000);
    assert.equal(r.markupCents, 2000);
    assert.equal(r.earnedCents, 27000 + 4000 + 2000);
    assert.equal(r.fromInvoice, false);
  });
  it('follows the owner turning markup off for an item', () => {
    const s = state();
    s.markupOff['profit-item'] = true;
    assert.equal(jobProfit(s, job.id).markupCents, 0);
  });

  it('includes a saved invoice credit whose line ID no longer matches the change order', () => {
    const invoice = { id: 'profit-invoice', number: '1001', jobId: job.id, laborDescription: '', summary: '', fees: [] };
    const s = state();
    s.issuedInvoices[invoice.id] = {
      lines: [
        { id: 'saved-credit', kind: 'labor', description: 'Change order credit', qtyHundredths: 100, unitCents: -2000 },
        { id: 'saved-materials', kind: 'material', description: 'Valve', qtyHundredths: 100, unitCents: 12000 },
      ],
      tax: s.settings.tax, summary: '', materialsMode: 'items', dueDays: 15, issuedOn: '2026-11-01', address: job.address,
    };
    sample.invoices.push(invoice);
    try {
      assert.equal(jobProfit(s, job.id).earnedCents, 0);
    } finally {
      sample.invoices.splice(sample.invoices.indexOf(invoice), 1);
    }
  });
});
