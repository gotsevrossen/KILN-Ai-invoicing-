import { userErrorKey } from '@/lib/user-errors';

/** Crew data may be read from this device during a connection failure only. */
export async function crewRead<T>(scope: string, name: string, load: () => Promise<T>, mayReadOffline?: () => boolean): Promise<T> {
  const key = `kiln.crew-cache:${scope}:${name}`;
  try {
    const result = await load();
    try { localStorage.setItem(key, JSON.stringify(result)); } catch { /* Online read still succeeded. */ }
    return result;
  } catch (error) {
    const reason = userErrorKey(error);
    if (reason !== 'errors.connection') {
      if (reason === 'errors.permission' || reason === 'errors.missing' || reason === 'errors.signIn') {
        try { localStorage.removeItem(key); } catch { /* The current read still fails closed. */ }
      }
      throw error;
    }
    if (mayReadOffline && !mayReadOffline()) throw error;
    let cached: string | null = null;
    try { cached = localStorage.getItem(key); } catch { /* No local copy. */ }
    if (cached) {
      try { return JSON.parse(cached) as T; } catch { /* Leave the original error intact. */ }
    }
    throw error;
  }
}

export function cachedAssignment(scope: string, jobId: string): boolean {
  try {
    const jobs: unknown = JSON.parse(localStorage.getItem(`kiln.crew-cache:${scope}:jobs`) ?? 'null');
    return Array.isArray(jobs) && jobs.some((job) => job?.id === jobId);
  } catch { return false; }
}
