import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { DocLine, EstimateDraft, WorkItem } from '../data/types.ts';
import { composeInvoiceLines, copyDocument, defaultBilling, estimateLines, estimateReady, needsActualHours, receiptShares, workItemValid, workLines } from './billing.ts';
import { documentTotals } from './money.ts';

const draft = (): EstimateDraft => ({ lines: [
  { id: 'hours', priceItemId: 'labor', description: 'Agreed labor', unit: 'hour', qtyHundredths: 200, unitCents: 8500 },
  { id: 'part', description: 'Included faucet', unit: 'each', kind: 'material', qtyHundredths: 100, unitCents: 5000 },
], sent: true, signed: true, depositOn: true, depositBps: 3000 });
const material: DocLine = { id: 'receipt', kind: 'material', description: 'Purchased faucet', qtyHundredths: 100, unitCents: 5000 };
const invoiceInput = () => ({ job: { pricing: 'hourly' as const, rateCents: 8500 }, estimate: draft(),
  billing: { ...defaultBilling(true), reviewed: true }, hours: 300, laborDescription: 'Actual labor', fees: [], changes: [], work: [] as DocLine[], materials: [material] });
const noTax = { rateBps: 0, labor: false, materials: false };

describe('estimate scope before issue', () => {
  it('blocks a partly priced agreement instead of silently dropping work', () => {
    const estimate = draft();
    estimate.lines[1].unitCents = null;
    assert.equal(estimateReady(estimate), false);
    estimate.lines[1].excluded = true;
    assert.equal(estimateReady(estimate), true);
    assert.deepEqual(estimateLines(estimate).map((l) => l.id), ['hours']);
    estimate.lines[1].excluded = false;
    assert.equal(estimateReady(estimate), false);
  });
  it('cannot issue empty or entirely excluded scope', () => {
    const estimate = draft();
    estimate.lines.forEach((line) => { line.excluded = true; });
    assert.equal(estimateReady(estimate), false);
    estimate.lines = [];
    assert.equal(estimateReady(estimate), false);
  });
  it('blocks invalid quantities, descriptions, and prices including cleared inputs', () => {
    for (const patch of [{ qtyHundredths: 0 }, { qtyHundredths: 1.5 }, { unitCents: -1 }, { unitCents: NaN }, { description: '  ' }]) {
      const estimate = draft();
      Object.assign(estimate.lines[0], patch);
      assert.equal(estimateReady(estimate), false);
    }
  });
  it('allows an explicitly entered zero-price item and preserves material tax classification', () => {
    const estimate = draft();
    estimate.lines[0].unitCents = 0;
    assert.equal(estimateReady(estimate), true);
    const total = documentTotals(estimateLines(estimate), { rateBps: 700, labor: false, materials: true });
    assert.equal(total.tax, 350);
    assert.equal(total.total, 5350);
  });
});

describe('invoice billing reconciliation', () => {
  it('replaces two estimated hours with three actual hours once', () => {
    const lines = composeInvoiceLines(invoiceInput());
    assert.deepEqual(lines.filter((l) => l.unit === 'hour').map((l) => l.qtyHundredths), [300]);
    assert.equal(documentTotals(lines, noTax).total, 30500);
  });
  it('uses agreed hours without adding logged hours when owner selects agreed pricing', () => {
    const input = invoiceInput();
    input.billing.labor = 'estimate';
    const lines = composeInvoiceLines(input);
    assert.deepEqual(lines.filter((l) => l.unit === 'hour').map((l) => l.qtyHundredths), [200]);
    assert.equal(documentTotals(lines, noTax).total, 22000);
  });
  it('keeps included purchase receipts as costs rather than second customer charges', () => {
    const lines = composeInvoiceLines(invoiceInput());
    assert.equal(lines.filter((l) => l.kind === 'material').length, 1);
    assert.equal(lines.some((l) => l.id === 'receipt'), false);
  });
  it('adds explicitly additional materials only once when a suggestion repeats a receipt id', () => {
    const input = invoiceInput();
    input.billing.materials = 'additional';
    input.materials.push({ ...material });
    const lines = composeInvoiceLines(input);
    assert.equal(lines.filter((l) => l.id === 'receipt').length, 1);
    assert.equal(documentTotals(lines, noTax).total, 35500);
  });
  it('does not append tracked hours to a flat-price job', () => {
    const input = { ...invoiceInput(), job: { pricing: 'flat' as const, rateCents: 8500 } };
    assert.equal(documentTotals(composeInvoiceLines(input), noTax).total, 22000);
  });
  it('bills actual labor and selected materials when there is no estimate', () => {
    const input = { ...invoiceInput(), estimate: undefined, billing: defaultBilling(false) };
    assert.equal(documentTotals(composeInvoiceLines(input), noTax).total, 30500);
  });
  it('requires explicit billing review for an agreed price', () => {
    assert.equal(defaultBilling(true).reviewed, false);
    assert.equal(defaultBilling(true).materials, 'included');
  });
  it('bills typed-in work on a flat job with no estimate', () => {
    const valve: WorkItem = { id: 'v', jobId: 'j', date: '2026-10-22', description: 'Replaced shutoff valve', unit: 'each', qtyHundredths: 150, unitCents: 8500, kind: 'labor' };
    const input = { ...invoiceInput(), job: { pricing: 'flat' as const }, estimate: undefined, billing: defaultBilling(false), materials: [], work: workLines([valve]) };
    const lines = composeInvoiceLines(input);
    assert.deepEqual(lines.map((l) => l.id), ['work-v']);
    assert.equal(documentTotals(lines, noTax).total, 12750);
  });
  it('adds typed-in work on top of a signed estimate, once', () => {
    const input = invoiceInput();
    input.work.push(...workLines([{ id: 'x', jobId: 'j', date: '2026-10-22', description: 'Extra trip', unit: 'flat', qtyHundredths: 100, unitCents: 4500, kind: 'fee' }]));
    const lines = composeInvoiceLines(input);
    assert.equal(lines.filter((l) => l.id === 'work-x').length, 1);
    assert.equal(documentTotals(lines, noTax).total, 35000);
  });
  it('accepts only complete work items', () => {
    const ok = { description: 'Patch drywall', qtyHundredths: 100, unitCents: 0 };
    assert.equal(workItemValid(ok), true);
    assert.equal(workItemValid({ ...ok, description: '  ' }), false);
    assert.equal(workItemValid({ ...ok, qtyHundredths: 0 }), false);
    assert.equal(workItemValid({ ...ok, unitCents: -1 }), false);
    assert.equal(workItemValid({ ...ok, unitCents: 12.5 }), false);
  });
  it('blocks accidentally replacing quoted labor with no logged hours or no rate', () => {
    assert.equal(needsActualHours({ pricing: 'hourly', rateCents: 8500 }, draft(), defaultBilling(true), 0), true);
    assert.equal(needsActualHours({ pricing: 'hourly' }, draft(), defaultBilling(true), 300), true);
    assert.equal(needsActualHours({ pricing: 'hourly', rateCents: 8500 }, draft(), defaultBilling(true), 300), false);
    assert.equal(needsActualHours({ pricing: 'hourly' }, draft(), { ...defaultBilling(true), labor: 'estimate' }, 0), false);
  });
});

describe('receipt allocation including tax', () => {
  it('supports a 3:1 use split while conserving every receipt-tax cent', () => {
    assert.deepEqual(receiptShares(1001, { type: 'jobs', jobIds: ['a', 'b'], weights: [300, 100] }), [751, 250]);
  });
  it('preserves the equal-share shortcut and deterministic odd-cent rounding', () => {
    assert.deepEqual(receiptShares(1001, { type: 'jobs', jobIds: ['a', 'b'] }), [501, 500]);
  });
  it('rejects malformed assignments rather than losing or inventing cost', () => {
    for (const weights of [[0, 1], [-1, 1], [NaN, 1], [Infinity, 1], [1], [0.5, 1]]) {
      assert.throws(() => receiptShares(1001, { type: 'jobs', jobIds: ['a', 'b'], weights }));
    }
    assert.throws(() => receiptShares(1001, { type: 'jobs', jobIds: ['a', 'a'] }));
    assert.throws(() => receiptShares(1001, { type: 'jobs', jobIds: [] }));
  });
});

describe('issued document copy', () => {
  it('keeps issued price, scope, tax, and description stable after draft and settings edits', () => {
    const estimate = draft();
    const live = { lines: estimateLines(estimate), scope: { notes: 'Kitchen fixture only' }, tax: { rateBps: 700, labor: true, materials: true } };
    const issued = copyDocument(live);
    const original = documentTotals(issued.lines, issued.tax);
    live.lines[0].unitCents = 99999;
    live.scope.notes = 'Different work';
    live.tax.rateBps = 1000;
    assert.deepEqual(documentTotals(issued.lines, issued.tax), original);
    assert.equal(issued.scope.notes, 'Kitchen fixture only');
    assert.equal(issued.tax.rateBps, 700);
  });
});
