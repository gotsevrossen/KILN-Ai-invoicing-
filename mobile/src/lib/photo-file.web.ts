// The web version has no app folder: a photo stays in the browser's memory until it uploads,
// and a closed tab loses one that hasn't. (Phones keep theirs; see photo-file.ts.)

export function keepOnPhone(uri: string): string {
  return uri;
}

export function stillOnPhone(): boolean {
  return true;
}

export function removeFromPhone(uri: string): void {
  if (uri.startsWith('blob:')) URL.revokeObjectURL(uri);
}

export async function photoBytes(uri: string): Promise<ArrayBuffer> {
  return (await fetch(uri)).arrayBuffer();
}
