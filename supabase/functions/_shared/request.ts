export class BodyTooLarge extends Error {}
export class InvalidBody extends Error {}

/** Bound bytes and buffer allocations even when the sender supplies many tiny chunks. */
export async function readBody(req: Request, limit: number): Promise<string> {
  if (Number(req.headers.get('content-length')) > limit) {
    await req.body?.cancel();
    throw new BodyTooLarge();
  }
  if (!req.body) return '';
  const reader = req.body.getReader();
  let buffer = new Uint8Array(0);
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const end = bytes + value.byteLength;
      if (end > limit) throw new BodyTooLarge();
      if (end > buffer.length) {
        const capacity = Math.min(limit, Math.max(end, 4096, buffer.length * 2));
        const larger = new Uint8Array(capacity);
        larger.set(buffer);
        buffer = larger;
      }
      buffer.set(value, bytes);
      bytes = end;
    }
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, bytes));
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export async function readObject(req: Request, limit: number): Promise<Record<string, unknown>> {
  try {
    const value = JSON.parse(await readBody(req, limit));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InvalidBody();
    return value;
  } catch (error) {
    if (error instanceof BodyTooLarge) throw error;
    throw new InvalidBody();
  }
}
