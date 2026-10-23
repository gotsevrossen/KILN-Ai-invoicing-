import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { defaultTag, exifLocation, exifTime, localDay } from './photo-facts.ts';

describe('photo details', () => {
  it('reads Android’s flat GPS keys, with south and west as negative', () => {
    assert.deepEqual(exifLocation({ GPSLatitude: 40.42, GPSLatitudeRef: 'N', GPSLongitude: 86.91, GPSLongitudeRef: 'W' }), { lat: 40.42, lng: -86.91 });
    assert.deepEqual(exifLocation({ GPSLatitude: 33.9, GPSLatitudeRef: 'S', GPSLongitude: 18.4, GPSLongitudeRef: 'E' }), { lat: -33.9, lng: 18.4 });
  });

  it('reads iPhone’s nested GPS details', () => {
    assert.deepEqual(exifLocation({ '{GPS}': { Latitude: 40.42, LatitudeRef: 'N', Longitude: 86.91, LongitudeRef: 'W' } }), { lat: 40.42, lng: -86.91 });
  });

  it('reads degrees, minutes and seconds', () => {
    const loc = exifLocation({ GPSLatitude: '40/1,25/1,12/1', GPSLatitudeRef: 'N', GPSLongitude: '86/1,54/1,36/1', GPSLongitudeRef: 'W' })!;
    assert.ok(Math.abs(loc.lat - 40.42) < 0.001);
    assert.ok(Math.abs(loc.lng + 86.91) < 0.001);
  });

  it('has no location without GPS, or with a phone that had no fix', () => {
    assert.equal(exifLocation({}), null);
    assert.equal(exifLocation(null), null);
    assert.equal(exifLocation({ GPSLatitude: 0, GPSLongitude: 0 }), null);
    assert.equal(exifLocation({ GPSLatitude: 'junk', GPSLongitude: 1 }), null);
  });

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
