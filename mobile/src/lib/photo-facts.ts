import type { PhotoTag } from '../data/types.ts';

// Capture time from the photo's EXIF and the initial tag from the job stage.
// Android gives a flat DateTimeOriginal key and iPhone may nest it under {Exif}.

type Exif = Record<string, unknown> | null | undefined;

const nested = (exif: Exif, group: string): Record<string, unknown> =>
  (exif && typeof exif[group] === 'object' && exif[group] !== null ? exif[group] as Record<string, unknown> : {});

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
