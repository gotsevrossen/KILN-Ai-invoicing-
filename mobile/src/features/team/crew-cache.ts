import { userErrorKey } from '@/lib/user-errors';

/** Crew data may be read from this device during a connection failure only. */
export async function crewRead<T>(scope: string, name: string, load: () => Promise<T>): Promise<T> {
  const key = `kiln.crew-cache:${scope}:${name}`;
  try {
    const result = await load();
    try { localStorage.setItem(key, JSON.stringify(result)); } catch { /* Online read still succeeded. */ }
    return result;
  } catch (error) {
    if (userErrorKey(error) !== 'errors.connection') throw error;
    let cached: string | null = null;
    try { cached = localStorage.getItem(key); } catch { /* No local copy. */ }
    if (cached) {
      try { return JSON.parse(cached) as T; } catch { /* Leave the original error intact. */ }
    }
    throw error;
  }
}
