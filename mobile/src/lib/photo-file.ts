import { Directory, File, Paths } from 'expo-file-system';

// Phones: a photo waiting to upload is kept in the app's own folder (the cache folder can be
// cleared by the phone), so it survives having no signal and the app closing.

const folder = () => new Directory(Paths.document, 'photos');

/** Moves a freshly saved photo into the app's folder and returns its new address. */
export function keepOnPhone(uri: string, id: string): string {
  const dir = folder();
  dir.create({ idempotent: true, intermediates: true });
  const dest = new File(dir, `${id}.jpg`);
  if (dest.exists) dest.delete();
  const source = new File(uri);
  source.copy(dest);
  if (source.exists) source.delete();
  return dest.uri;
}

/** Whether a kept photo is still there (an app reinstall clears the folder). */
export function stillOnPhone(uri: string): boolean {
  return new File(uri).exists;
}

/** Once it's uploaded, the phone's copy isn't needed. */
export function removeFromPhone(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // already gone
  }
}

export function photoBytes(uri: string): Promise<ArrayBuffer> {
  return new File(uri).arrayBuffer();
}
