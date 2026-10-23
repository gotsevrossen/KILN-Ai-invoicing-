import type { PhotoTag } from '../data/types.ts';

// When and where a photo was taken, read from the photo's own details (EXIF), and the tag a
// new photo starts with. Kept apart from the camera code so it can be tested.
// Phones write these details differently: Android gives flat keys (GPSLatitude, DateTimeOriginal),
// iPhone nests them ({GPS}.Latitude, {Exif}.DateTimeOriginal).

type Exif = Record<string, unknown> | null | undefined;

const nested = (exif: Exif, group: string): Record<string, unknown> =>
  (exif && typeof exif[group] === 'object' && exif[group] !== null ? exif[group] as Record<string, unknown> : {});

/** 40.5, "40.5", or degrees/minutes/seconds like "40/1,25/1,1234/100" -> 40.42..., else null. */
function degrees(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const parts = value.split(',').map((part) => {
    const [n, d = '1'] = part.trim().split('/');
    return Number(n) / Number(d);
  });
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) return null;
  const [deg, min = 0, sec = 0] = parts;
  return deg + min / 60 + sec / 3600;
}

/** Where the photo was taken, if the phone saved it in the photo. */
export function exifLocation(exif: Exif): { lat: number; lng: number } | null {
  const gps = nested(exif, '{GPS}');
  const latRaw = degrees(exif?.GPSLatitude ?? gps.Latitude);
  const lngRaw = degrees(exif?.GPSLongitude ?? gps.Longitude);
  if (latRaw === null || lngRaw === null) return null;
  const latRef = String(exif?.GPSLatitudeRef ?? gps.LatitudeRef ?? 'N').toUpperCase();
  const lngRef = String(exif?.GPSLongitudeRef ?? gps.LongitudeRef ?? 'E').toUpperCase();
  const lat = latRef === 'S' ? -Math.abs(latRaw) : latRaw;
  const lng = lngRef === 'W' ? -Math.abs(lngRaw) : lngRaw;
  // 0, 0 is a phone with no fix, not a job in the ocean
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

/** When the photo was taken ("2026:10:23 14:05:11" on the phone's clock), as an ISO time, or null. */
export function exifTime(exif: Exif): string | null {
  const raw = exif?.DateTimeOriginal ?? nested(exif, '{Exif}').DateTimeOriginal;
  const m = typeof raw === 'string' ? /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(raw) : null;
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** The day a photo goes under in the job's activity, on this phone's calendar. */
export function localDay(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A new photo's tag from where the job is: before the work, during it, or once it's done. */
export function defaultTag(stage: 'estimate' | 'work' | 'invoice' | 'paid', workStarted: boolean): PhotoTag {
  if (stage === 'invoice' || stage === 'paid') return 'after';
  return stage === 'work' && workStarted ? 'during' : 'before';
}
