import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fillLegal, LEGAL } from './details.ts';
import { privacy } from './privacy.ts';
import { terms } from './terms.ts';

const allText = (doc: typeof privacy.en) => [doc.title, ...doc.intro, ...doc.sections.flatMap((s) => [s.heading, ...s.body])];

describe('Privacy Policy and Terms of Use', () => {
  it('English and Spanish have the same sections, in the same order', () => {
    for (const doc of [privacy, terms]) {
      assert.equal(doc.es.sections.length, doc.en.sections.length);
      doc.en.sections.forEach((s, i) => assert.equal(doc.es.sections[i].body.length, s.body.length, s.heading));
    }
  });

  it('every blank in the text is one details.ts fills in', () => {
    for (const doc of [privacy.en, privacy.es, terms.en, terms.es]) {
      for (const text of allText(doc)) assert.doesNotMatch(fillLegal(text), /\{[a-z]+\}/, text);
    }
    assert.equal(fillLegal('{state} law, {web}/delete-account'), `${LEGAL.state} law, ${LEGAL.web}/delete-account`);
  });

  it('says the governing state and the 30-day deletion in both languages', () => {
    assert.equal(LEGAL.state, 'Illinois');
    for (const doc of [privacy.en, privacy.es]) assert.match(allText(doc).join(' '), /30/);
  });
});
