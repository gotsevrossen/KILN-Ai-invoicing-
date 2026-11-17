import { joinInput } from './input.ts';
const assert = (v: boolean) => { if (!v) throw new Error('assertion failed'); };
Deno.test('join input accepts only token plus explicit action and bounded email code', () => {
  assert(joinInput({ action: 'send_code', token: 'a'.repeat(64) }) !== null);
  assert(joinInput({ action: 'accept', token: 'a'.repeat(64), code: '123456' }) !== null);
  for (const bad of [null, [], { action: 'accept', token: 'a'.repeat(64) }, { action: 'accept', token: 'a'.repeat(64), code: '123456789' }, { action: 'accept', token: 'a'.repeat(64), code: 123456 }, { action: 'send_code', token: 'bad' }, { action: 'owner', token: 'a'.repeat(64) }]) assert(joinInput(bad) === null);
});
