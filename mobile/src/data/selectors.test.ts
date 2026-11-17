import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { businessDate, localDate } from '../lib/invoice-aging.ts';
import * as sample from './sample.ts';
import { homeSummary, invoiceById, invoiceTotals, jobById, jobGroup, jobOverdueDays, jobStatus } from './selectors.ts';
import type { State } from './store';

/** A sent copy whose price/terms deliberately differ from live job/settings data. */
function stateForInvoice(): State {
  return {
    payments: [], opened: {}, online: { connected: false, walletReady: false, bankReady: false },
    mode: 'example', sentInvoices: ['inv-1042'], paidInvoices: [],
    issuedInvoices: { 'inv-1042': {
      lines: [{ id: 'saved', description: 'Agreed repair', kind: 'labor', qtyHundredths: 100, unitCents: 12500 }],
      tax: { rateBps: 0, labor: false, materials: false }, summary: 'Repair completed',
      materialsMode: 'items', dueDays: 15, issuedOn: '2026-10-01', address: '412 Elm St',
    } },
    settings: { markupBps: 2000, tax: { rateBps: 0, labor: false, materials: false }, dueDays: 365, depositBps: 3000 },
    estimates: {}, invoiceBilling: {}, reopenedJobs: [], signed: {}, declinedChanges: [],
    timeEntries: [], workItems: [], assignments: {}, acceptedSuggestions: [], fixedNames: {}, markupOff: {},
    skippedEstimates: [], dismissedSuggestions: [], materialsMode: {}, showLocation: {}, invoiceSummaries: {},
    voiceConfirmed: false, captures: [], photos: [], cardFee: false, aiScope: false,
    businessId: null, version: 0, syncError: null, priceList: [], localSave: 'confirmed', pendingSaves: 0,
    profile: { businessName: 'Test repair', phone: '', trades: ['handyman'], pricing: 'flat', rateCents: 8500, onboarded: true },
  };
}

describe('overdue jobs and Home totals', () => {
  const park = jobById('park');
  it('subtracts confirmed partial payments from outstanding and overdue balances only once', () => {
    const state = stateForInvoice();
    const original = homeSummary(state);
    state.payments.push({ id: 'partial', invoiceId: 'inv-1042', amountCents: 5000, method: 'bank', status: 'succeeded', paidAt: '2026-10-02' });
    state.payments.push({ id: 'pending', invoiceId: 'inv-1042', amountCents: 1000, method: 'bank', status: 'processing', paidAt: '2026-10-02' });
    const totals = invoiceTotals(state, invoiceById('inv-1042')!);
    assert.equal(totals.total, 12500);
    assert.equal(totals.paid, 5000);
    assert.equal(totals.due, 7500);
    const summary = homeSummary(state);
    assert.equal(summary.owed, original.owed - 5000);
    assert.equal(summary.overdueCents, original.overdueCents - 5000);
  });

  it('credits deposit and milestone payments once on the final invoice, keeping processing separate', () => {
    const state = stateForInvoice();
    const invoice = invoiceById('inv-1042')!;
    const deposit = { id: 'deposit', invoiceId: null, jobId: invoice.jobId, amountCents: 3000, method: 'cash' as const, status: 'succeeded' as const, paidAt: '2026-10-02' };
    state.payments.push(deposit, deposit, { id: 'milestone', invoiceId: null, jobId: invoice.jobId, amountCents: 2000, method: 'bank', status: 'processing', paidAt: '2026-10-02' });
    const totals = invoiceTotals(state, invoice);
    assert.equal(totals.paid, 3000);
    assert.equal(totals.due, 9500);
  });

  it('never shows a negative balance or an overdue invoice after its whole balance was paid', () => {
    const state = stateForInvoice();
    state.payments.push({ id: 'paid', invoiceId: 'inv-1042', amountCents: 15000, method: 'wallet', status: 'succeeded', paidAt: '2026-10-02' });
    assert.equal(invoiceTotals(state, invoiceById('inv-1042')!).due, 0);
    assert.equal(jobOverdueDays(state, park), 0);
  });

  it('shows a live sent invoice as overdue using its saved terms and price', () => {
    const state = stateForInvoice();
    assert.equal(jobOverdueDays(state, park), 3);
    assert.equal(jobStatus(state, park), 'overdue');
    assert.equal(jobGroup(state, park), 'done');
    const summary = homeSummary(state);
    // The other overdue example remains visible; the live invoice adds exactly its frozen $125.
    assert.equal(summary.overdueCount, 2);
    assert.equal(summary.overdueCents, 125000 + 12500);
    state.settings.dueDays = 0;
    assert.equal(jobOverdueDays(state, park), 3);
  });
  it('keeps sent invoices out of overdue until the day after they are due', () => {
    const state = stateForInvoice();
    state.issuedInvoices['inv-1042'].issuedOn = '2026-10-04';
    assert.equal(jobStatus(state, park), 'sent');
    assert.equal(jobOverdueDays(state, park), 0);
    state.issuedInvoices['inv-1042'].issuedOn = '2026-10-05';
    assert.equal(jobStatus(state, park), 'sent');
  });
  it('removes a paid invoice from both overdue and outstanding balances', () => {
    const state = stateForInvoice();
    const unpaid = homeSummary(state);
    state.paidInvoices.push('inv-1042');
    const paid = homeSummary(state);
    assert.equal(jobStatus(state, park), 'paid');
    assert.equal(jobGroup(state, park), 'paid');
    assert.equal(jobOverdueDays(state, park), 0);
    assert.equal(paid.overdueCount, unpaid.overdueCount - 1);
    assert.equal(paid.overdueCents, unpaid.overdueCents - 12500);
    assert.equal(paid.owed, unpaid.owed - 12500);
  });
  it('does not age an unsent draft or guess terms for a missing issued copy', () => {
    const state = stateForInvoice();
    state.sentInvoices = [];
    assert.equal(jobStatus(state, park), 'invoiceReady');
    assert.equal(jobOverdueDays(state, park), 0);
    state.sentInvoices.push('inv-1042');
    delete state.issuedInvoices['inv-1042'];
    assert.equal(jobStatus(state, park), 'sent');
    assert.equal(jobOverdueDays(state, park), 0);
  });
  it('uses the real calendar for signed-in businesses without requiring another login', () => {
    const state = stateForInvoice();
    state.mode = 'connected';
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    state.issuedInvoices['inv-1042'].issuedOn = localDate(yesterday);
    state.issuedInvoices['inv-1042'].dueDays = 0;
    assert.equal(jobOverdueDays(state, park), 1);
    assert.equal(jobStatus(state, park), 'overdue');
    assert.equal(businessDate(state.mode, sample.TODAY), localDate());
  });
  it('keeps the fixed overdue example working without manufacturing an invoice', () => {
    const state = stateForInvoice();
    const maple = jobById('maple-2b');
    assert.equal(jobStatus(state, maple), 'overdue');
    assert.equal(jobOverdueDays(state, maple), 9);
  });
});
