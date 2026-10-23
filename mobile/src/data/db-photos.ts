import { photoBytes } from '@/lib/photo-file';

import { db, ok, one } from './db-client';
import type { Photo, PhotoTag } from './types';

// Job photos on the server: the file in the private job-photos bucket, and a row in photos.
// Row Level Security and the storage rules keep each business to its own folder; once a job's
// invoice is sent, the server refuses changes to its photos.

const BUCKET = 'job-photos';

interface PhotoRow {
  id: string;
  job_id: string;
  storage_path: string;
  tag: PhotoTag | null;
  lat: number | null;
  lng: number | null;
  taken_at: string;
}

export const photoPath = (businessId: string, p: Pick<Photo, 'id' | 'jobId'>) => `${businessId}/${p.jobId}/${p.id}.jpg`;

export async function loadPhotos(): Promise<Photo[]> {
  const rows = ok(await db().from('photos').select('id, job_id, storage_path, tag, lat, lng, taken_at').order('taken_at').returns<PhotoRow[]>()) ?? [];
  return rows.map((r) => ({
    id: r.id,
    jobId: r.job_id,
    tag: r.tag ?? 'during',
    // a saved tag was already the owner's call (or accepted by them)
    tagByOwner: true,
    takenAt: r.taken_at,
    lat: r.lat ?? undefined,
    lng: r.lng ?? undefined,
    path: r.storage_path,
  }));
}

/**
 * Uploads the file, then saves its row. Safe to repeat after a dropped connection: a file or row
 * that already made it is kept as it is. Returns the file's path.
 */
export async function uploadPhoto(businessId: string, p: Photo): Promise<string> {
  if (!p.localUri) throw new Error('This photo has no file on this phone');
  const path = photoPath(businessId, p);
  const up = await db().storage.from(BUCKET).upload(path, await photoBytes(p.localUri), { contentType: 'image/jpeg', upsert: false });
  if (up.error && !/exist|duplicate/i.test(up.error.message)) throw new Error(up.error.message);
  ok(await db().from('photos').upsert({
    id: p.id,
    business_id: businessId,
    job_id: p.jobId,
    storage_path: path,
    tag: p.tag,
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    taken_at: p.takenAt,
  }, { onConflict: 'id', ignoreDuplicates: true }));
  return path;
}

export async function updatePhotoTag(id: string, tag: PhotoTag): Promise<void> {
  ok(await db().from('photos').update({ tag }).eq('id', id));
}

/** The row first: if the server refuses (invoice sent), the file stays too. */
export async function deletePhoto(id: string, path: string): Promise<void> {
  ok(await db().from('photos').delete().eq('id', id));
  ok(await db().storage.from(BUCKET).remove([path]));
}

/** Files left behind when a fresh job is deleted (its rows go with the job). */
export async function deletePhotoFiles(paths: string[]): Promise<void> {
  if (paths.length) ok(await db().storage.from(BUCKET).remove(paths));
}

// links to private files work for an hour; kept so a screen doesn't ask again each time
const links = new Map<string, { url: string; until: number }>();

/** A short-lived link to show a saved photo to the signed-in owner. */
export async function photoLink(path: string): Promise<string> {
  const cached = links.get(path);
  if (cached && cached.until > Date.now()) return cached.url;
  const { signedUrl } = one(await db().storage.from(BUCKET).createSignedUrl(path, 3600));
  links.set(path, { url: signedUrl, until: Date.now() + 50 * 60 * 1000 });
  return signedUrl;
}
