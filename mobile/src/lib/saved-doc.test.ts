import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { SavedSnapshot } from '../data/job-cleanup.ts';
import { savedDocHtml, savedTotals, type SavedDocLabels } from './saved-doc.ts';

const base = (over: Partial<SavedSnapshot> = {}): SavedSnapshot => ({
  type: 'invoice',
  business: { name: "Mike's Plumbing", phone: '555-0100' },
  customer: { name: 'Lee', phone: null, email: null, lang: 'en' },
  job: { title: 'Kitchen sink', address: '1 Main St', workOrder: null },
  document: { number: 'I-1', sent_at: '2026-10-01T12:00:00Z', paid_at: null, tax_rate_bps: 700, tax_labor: false, tax_materials: true },
  lines: [
    { description: 'Labor', kind: 'labor', qty_hundredths: 200, unit_cents: 9000 },
    { description: 'P-trap', kind: 'material', qty_hundredths: 100, unit_cents: 1000 },
    { description: 'Extra outlet', kind: 'labor', qty_hundredths: 100, unit_cents: 5000, excluded: true },
  ],
  payments: [],
  signatures: [],
  ...over,
});

const labels: SavedDocLabels = {
  title: 'Invoice', billTo: 'Customer', job: 'Job', workOrder: 'Work order', issued: 'Issued', paidOn: 'Paid', signed: 'Signed', declined: 'Declined',
  description: 'Description', qty: 'Qty', price: 'Price', amount: 'Amount', excluded: 'Not included',
  subtotal: 'Subtotal', tax: 'Tax', total: 'Total', paid: 'Paid', due: 'Balance due', base: 'Before', newTotal: 'New total',
  payments: 'Payments', signatures: 'Signatures', fingerprint: 'Fingerprint', method: (m) => m, signedBy: (n) => `Signed by ${n}`,
};

describe('saved document totals', () => {
  it('counts priced, included lines and taxes only what the document taxed', () => {
    const t = savedTotals(base());
    assert.equal(t.subtotal, 19000);
    assert.equal(t.tax, 70);
    assert.equal(t.total, 19070);
    assert.equal(t.due, 19070);
  });
  it('subtracts succeeded payments only', () => {
    const t = savedTotals(base({ payments: [
      { amountCents: 5000, method: 'cash', paidAt: null, status: 'succeeded' },
      { amountCents: 9000, method: 'bank', paidAt: null, status: 'failed' },
    ] }));
    assert.equal(t.paid, 5000);
    assert.equal(t.due, 14070);
  });
  it('an invoice marked paid owes nothing', () => {
    const t = savedTotals(base({ document: { ...base().document, paid_at: '2026-10-05T00:00:00Z' } }));
    assert.equal(t.due, 0);
    assert.equal(t.paid, t.total);
  });
  it('a change order totals its own amount', () => {
    const t = savedTotals(base({ type: 'change_order', lines: [], document: { number: 'C-1', amount_cents: 25000, base_cents: 100000 } }));
    assert.equal(t.total, 25000);
  });
});

describe('saved document page', () => {
  it('escapes text from the copy so nothing in it runs', () => {
    const html = savedDocHtml(base({ customer: { name: '<script>alert(1)</script>', phone: null, email: null, lang: 'en' } }), labels, 'en');
    assert.ok(!html.includes('<script>alert'));
    assert.ok(html.includes('&lt;script&gt;'));
  });
  it('marks excluded lines and shows the balance', () => {
    const html = savedDocHtml(base(), labels, 'en');
    assert.ok(html.includes('Not included'));
    assert.ok(html.includes('$190.70'));
  });
  it('keeps lump-sum materials private and shows signature ink in a signed copy', () => {
    const html = savedDocHtml(base({ document: { ...base().document, materials_mode: 'total' },
      signatures: [{ name: 'Lee', signedAt: '2026-10-03T14:00:00Z', method: 'finger', hash: '', ink: [[[0, 0], [1, 1]]] }] }),
    { ...labels, materials: 'Materials' }, 'en');
    assert.ok(!html.includes('P-trap'));
    assert.ok(html.includes('Materials'));
    assert.ok(html.includes('<svg'));
  });
  it('receipts show money received and omit failed payment attempts', () => {
    const html = savedDocHtml(base({ payments: [
      { amountCents: 5000, method: 'cash', paidAt: null, status: 'succeeded' },
      { amountCents: 10000, method: 'bank', paidAt: null, status: 'failed' },
    ] }), labels, 'en', true);
    assert.ok(html.includes('$50.00'));
    assert.ok(!html.includes('$100.00'));
    assert.ok(!html.includes('P-trap'));
  });
  it('shows the saved terms and warranty on a customer copy', () => {
    const html = savedDocHtml(base({ document: { ...base().document,
      scope: { terms: 'Due on receipt', warranty: 'Covered <parts>' } } }), labels, 'en');
    assert.ok(html.includes('<h3>Terms</h3><p>Due on receipt</p>'));
    assert.ok(html.includes('<h3>Warranty</h3><p>Covered &lt;parts&gt;</p>'));
  });
});
