import * as Crypto from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { keepOnPhone } from './photo-file';
import { exifTime } from './photo-facts';

// Job photos from the camera or the library, ready to save: shrunk and re-saved as a new JPEG
// to strip metadata. Keep the capture time and a small copy for KILN's before/during/after guess.

export interface NewPhoto {
  id: string;
  localUri: string;
  takenAt: string;
  /** A small JPEG (as text) for KILN's tag guess. Never saved. */
  small?: string;
}

const MAX_EDGE = 1600;
const MAX_PICK = 10;

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

/** Take a photo or choose up to 10, keeping the original capture time when available. */
export async function pickJobPhotos(camera: boolean): Promise<{ photos: NewPhoto[]; problem: 'denied' | null }> {
  if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) return { photos: [], problem: 'denied' };
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, exif: !camera, allowsMultipleSelection: !camera, selectionLimit: MAX_PICK };
  const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return { photos: [], problem: null };
  const photos: NewPhoto[] = [];
  for (const asset of result.assets.slice(0, MAX_PICK)) {
    const id = Crypto.randomUUID();
    const { uri, small } = await shrink(asset);
    photos.push({
      id,
      localUri: keepOnPhone(uri, id),
      takenAt: (camera ? null : exifTime(asset.exif)) ?? new Date().toISOString(),
      small,
    });
  }
  return { photos, problem: null };
}
