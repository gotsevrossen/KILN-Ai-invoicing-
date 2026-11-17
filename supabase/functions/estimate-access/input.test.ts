import { CONSENT, validAcceptance } from './input.ts';
const assert = (v: boolean) => { if (!v) throw new Error('assertion failed'); };
Deno.test('quote acceptance requires explicit consent, bounded name and pinned hash', () => {
  const good = { name: 'Home Owner', hash: 'a'.repeat(64), agreed: true, consent: CONSENT.en };
  assert(validAcceptance(good));
  assert(validAcceptance({ ...good, consent: CONSENT.es }));
  assert(!validAcceptance({ ...good, agreed: false }));
  assert(!validAcceptance({ ...good, agreed: 'true' }));
  assert(!validAcceptance({ ...good, consent: '' }));
  assert(!validAcceptance({ ...good, name: ' ' }));
  assert(!validAcceptance({ ...good, name: 'x'.repeat(121) }));
  assert(!validAcceptance({ ...good, hash: 'bad' }));
});
