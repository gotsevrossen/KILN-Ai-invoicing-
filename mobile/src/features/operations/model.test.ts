import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { centsInput, jobProfitability, type LaborCost } from './model.ts';
const cost = (id: string, rate: number): LaborCost => ({ time_entry_id: id, worker_id: 'w', business_id: 'b', loaded_rate_cents: rate });
describe('actual job profitability', () => {
  it('uses frozen loaded cost, includes purchase tax in material input, excludes sales tax from revenue input', () => {
    const result = jobProfitability(200000, 42100, 12000, [{ id: 't', hundredths: 650 }], [cost('t', 3200)]);
    assert.equal(result.laborCents, 20800);
    assert.equal(result.totalCents, 74900);
    assert.equal(result.profitCents, 125100);
    assert.equal(result.marginBps, 6255);
  });
  it('does not present a margin when any logged hours lack a cost', () => {
    const result = jobProfitability(100000, 10000, 0, [{ id: 'a', hundredths: 200 }, { id: 'b', hundredths: 100 }], [cost('a', 3000)]);
    assert.equal(result.uncostedHundredths, 100);
    assert.equal(result.profitCents, null);
    assert.equal(result.marginBps, null);
  });
  it('supports losses, zero revenue and unknown revenue without dividing by zero', () => {
    assert.equal(jobProfitability(100, 200, 0, [], []).profitCents, -100);
    assert.equal(jobProfitability(0, 200, 0, [], []).marginBps, null);
    assert.equal(jobProfitability(null, 200, 0, [], []).profitCents, null);
  });
  it('rounds each time entry once and rejects invalid money or hours', () => {
    assert.equal(jobProfitability(100, 0, 0, [{ id: 'a', hundredths: 1 }], [cost('a', 50)]).laborCents, 1);
    assert.throws(() => jobProfitability(0.5, 0, 0, [], []));
    assert.throws(() => jobProfitability(100, 0, 0, [{ id: 'a', hundredths: 2401 }], []));
  });
});
describe('cost inputs', () => {
  it('parses dollars without fractional-cent rounding', () => {
    assert.equal(centsInput('32,50'), 3250);
    assert.equal(centsInput('0'), 0);
    for (const v of ['-1', '12.345', '', '1e3', '99999999']) assert.equal(centsInput(v), null);
  });
});
