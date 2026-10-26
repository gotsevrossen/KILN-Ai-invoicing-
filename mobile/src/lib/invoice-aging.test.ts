import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { businessDate, invoiceDaysPastDue, localDate } from './invoice-aging.ts';

const bill = () => ({ issued: { issuedOn: '2026-10-01', dueDays: 15 }, sent: true, paid: false, dueCents: 12500 });

describe('invoice calendar dates', () => {
  it('uses the local calendar at either end of the day', () => {
    assert.equal(localDate(new Date(2026, 9, 26, 0, 1)), '2026-10-26');
    assert.equal(localDate(new Date(2026, 9, 26, 23, 59)), '2026-10-26');
  });
  it('keeps examples fixed while a signed-in business follows the current day', () => {
    const now = new Date(2026, 9, 26, 23, 59);
    assert.equal(businessDate('example', '2026-10-19', now), '2026-10-19');
    assert.equal(businessDate('connected', '2026-10-19', now), '2026-10-26');
    assert.equal(businessDate('connected', '2026-10-19', new Date(2026, 9, 27)), '2026-10-27');
  });
});

describe('invoice aging', () => {
  it('is not overdue before or on the saved due date', () => {
    assert.equal(invoiceDaysPastDue(bill(), '2026-10-15'), 0);
    assert.equal(invoiceDaysPastDue(bill(), '2026-10-16'), 0);
    assert.equal(invoiceDaysPastDue(bill(), '2026-10-17'), 1);
    assert.equal(invoiceDaysPastDue(bill(), '2026-10-26'), 10);
  });
  it('starts due-on-receipt aging the following day', () => {
    const input = { ...bill(), issued: { issuedOn: '2026-10-01', dueDays: 0 } };
    assert.equal(invoiceDaysPastDue(input, '2026-10-01'), 0);
    assert.equal(invoiceDaysPastDue(input, '2026-10-02'), 1);
  });
  it('does not chase drafts, paid bills, zero balances, or absent issued records', () => {
    for (const patch of [{ sent: false }, { paid: true }, { dueCents: 0 }, { dueCents: -1 }, { dueCents: NaN }, { issued: undefined }]) {
      assert.equal(invoiceDaysPastDue({ ...bill(), ...patch }, '2026-10-26'), 0);
    }
  });
  it('counts calendar days across daylight-saving changes', () => {
    for (const [issuedOn, today] of [['2026-03-07', '2026-03-09'], ['2026-10-31', '2026-11-02']]) {
      assert.equal(invoiceDaysPastDue({ ...bill(), issued: { issuedOn, dueDays: 0 } }, today), 2);
    }
  });
  it('handles month/year boundaries and leap years', () => {
    for (const [issuedOn, dueDays, today] of [
      ['2026-12-31', 1, '2027-01-02'], ['2028-02-28', 1, '2028-03-01'], ['2027-02-28', 0, '2027-03-01'],
    ] as const) {
      assert.equal(invoiceDaysPastDue({ ...bill(), issued: { issuedOn, dueDays } }, today), 1);
    }
  });
  it('does not invent overdue notices from invalid dates or payment terms', () => {
    for (const issuedOn of ['not a date', '2026-02-30', '2026-10-01T00:00:00Z', '']) {
      assert.equal(invoiceDaysPastDue({ ...bill(), issued: { issuedOn, dueDays: 0 } }, '2026-10-26'), 0);
    }
    for (const dueDays of [-1, 1.5, Infinity, 366]) {
      assert.equal(invoiceDaysPastDue({ ...bill(), issued: { issuedOn: '2026-10-01', dueDays } }, '2026-10-26'), 0);
    }
    assert.equal(invoiceDaysPastDue(bill(), '2026-02-30'), 0);
  });
});
