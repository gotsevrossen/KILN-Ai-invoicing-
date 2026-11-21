import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { defaultTag, exifTime, localDay } from './photo-facts.ts';

describe('photo details', () => {
  it('reads when the photo was taken, on the phone’s clock', () => {
    const iso = exifTime({ DateTimeOriginal: '2026:10:23 14:05:11' })!;
    assert.equal(localDay(iso), '2026-10-23');
    assert.equal(new Date(iso).getHours(), 14);
    assert.equal(localDay(exifTime({ '{Exif}': { DateTimeOriginal: '2026:10:20 07:00:00' } })!), '2026-10-20');
    assert.equal(exifTime({ DateTimeOriginal: 'yesterday' }), null);
    assert.equal(exifTime(undefined), null);
  });

  it('starts a photo as before, during, or after the work', () => {
    assert.equal(defaultTag('estimate', false), 'before');
    assert.equal(defaultTag('work', false), 'before');
    assert.equal(defaultTag('work', true), 'during');
    assert.equal(defaultTag('invoice', true), 'after');
    assert.equal(defaultTag('paid', true), 'after');
  });
});
