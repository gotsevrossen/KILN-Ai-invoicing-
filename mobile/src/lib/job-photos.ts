import * as Crypto from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

import { keepOnPhone } from './photo-file';
import { exifLocation, exifTime } from './photo-facts';

// Job photos from the camera or the library, ready to save: shrunk and re-saved as a new JPEG
// (so the file carries no GPS or other details from the phone), with where and when it was taken
// kept beside it. Also a small copy for KILN's before/during/after guess.

export interface NewPhoto {
  id: string;
  localUri: string;
  takenAt: string;
  lat?: number;
  lng?: number;
  /** A small JPEG (as text) for KILN's tag guess. Never saved. */
  small?: string;
}

const MAX_EDGE = 1600;
const MAX_PICK = 10;

/** Where the phone is now, or null if the owner said no or it takes too long (indoors, no signal). */
async function hereNow(): Promise<{ lat: number; lng: number } | null> {
  try {
    if ((await Location.requestForegroundPermissionsAsync()).status !== 'granted') return null;
    const recent = await Location.getLastKnownPositionAsync({ maxAge: 2 * 60 * 1000, requiredAccuracy: 200 });
    const pos = recent ?? await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
    ]);
    return pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : null;
  } catch {
    return null;
  }
}

/** The long side at most `edge` pixels, keeping its shape. */
function fit(width: number, height: number, edge: number) {
  if (!width || !height) return { width: edge };
  return width >= height ? { width: Math.min(edge, width) } : { height: Math.min(edge, height) };
}

async function shrink(asset: ImagePicker.ImagePickerAsset): Promise<{ uri: string; small?: string }> {
  const big = await (await ImageManipulator.manipulate(asset.uri).resize(fit(asset.width, asset.height, MAX_EDGE)).renderAsync())
    .saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
  try {
    const small = await (await ImageManipulator.manipulate(big.uri).resize(fit(asset.width, asset.height, 512)).renderAsync())
      .saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
    return { uri: big.uri, small: small.base64 };
  } catch {
    // the guess is optional; the photo isn't
    return { uri: big.uri };
  }
}

/**
 * Takes a photo, or lets the owner choose up to 10. A photo taken now gets the phone's location;
 * a chosen one keeps the location and time saved in it, if any.
 */
export async function pickJobPhotos(camera: boolean): Promise<{ photos: NewPhoto[]; problem: 'denied' | null }> {
  if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) return { photos: [], problem: 'denied' };
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, exif: true, allowsMultipleSelection: !camera, selectionLimit: MAX_PICK };
  const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return { photos: [], problem: null };
  const here = camera ? await hereNow() : null;
  const photos: NewPhoto[] = [];
  for (const asset of result.assets.slice(0, MAX_PICK)) {
    const id = Crypto.randomUUID();
    const { uri, small } = await shrink(asset);
    const where = here ?? (camera ? null : exifLocation(asset.exif));
    photos.push({
      id,
      localUri: keepOnPhone(uri, id),
      takenAt: (camera ? null : exifTime(asset.exif)) ?? new Date().toISOString(),
      ...(where ?? {}),
      small,
    });
  }
  return { photos, problem: null };
}
