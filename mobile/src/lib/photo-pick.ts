import * as ImagePicker from 'expo-image-picker';

import type { AiImage } from '@/data/ai';

// Photos for KILN's AI helpers (receipts, old invoices): taken or chosen, sent once, never saved.

export type PickedPhoto = { uri: string } & AiImage;

// about 5 MB once decoded: Claude's limit for one image
const MAX_PHOTO_CHARS = 6_900_000;

/** The picker returns JPEG text for photos, but a PNG or WebP picked from the library (a screenshot) stays as it is. */
function mediaTypeOf(base64: string): AiImage['mediaType'] {
  if (base64.startsWith('iVBOR')) return 'image/png';
  if (base64.startsWith('UklGR')) return 'image/webp';
  return 'image/jpeg';
}

/**
 * Takes a photo, or lets the owner choose up to `room` from the library.
 * `problem`: camera access was refused, or a photo was too large to send (it's left out).
 */
export async function pickPhotos(camera: boolean, room: number): Promise<{ photos: PickedPhoto[]; problem: 'denied' | 'tooBig' | null }> {
  if (room <= 0) return { photos: [], problem: null };
  if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) return { photos: [], problem: 'denied' };
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5, base64: true, allowsMultipleSelection: !camera, selectionLimit: room };
  const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return { photos: [], problem: null };
  const photos: PickedPhoto[] = [];
  let problem: 'tooBig' | null = null;
  for (const asset of result.assets.slice(0, room)) {
    // some phones wrap the text in lines; the server takes it in one piece
    const data = asset.base64?.replace(/\s/g, '');
    if (!data) continue;
    if (data.length > MAX_PHOTO_CHARS) {
      problem = 'tooBig';
      continue;
    }
    photos.push({ uri: asset.uri, mediaType: mediaTypeOf(data), data });
  }
  return { photos, problem };
}
