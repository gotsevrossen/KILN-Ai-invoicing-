import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { joinHeard, voiceLocale } from './voice-text.ts';

describe('voice notes', () => {
  it('listens in the app language unless the owner picked one', () => {
    assert.deepEqual(voiceLocale('app', 'es'), { lang: 'es', locale: 'es-US' });
    assert.deepEqual(voiceLocale('app', 'en'), { lang: 'en', locale: 'en-US' });
    assert.deepEqual(voiceLocale('en', 'es'), { lang: 'en', locale: 'en-US' });
    assert.deepEqual(voiceLocale('es', 'en'), { lang: 'es', locale: 'es-US' });
  });

  it('joins finished pieces and the one still being heard', () => {
    assert.equal(joinHeard(['Two hours on the Smith job.', ' Add a trip fee '], 'and a fau'), 'Two hours on the Smith job. Add a trip fee and a fau');
    assert.equal(joinHeard([], '  '), '');
    assert.equal(joinHeard(['done'], ''), 'done');
  });
});
