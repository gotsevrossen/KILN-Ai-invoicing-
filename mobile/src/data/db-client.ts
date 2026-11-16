import { supabase } from '@/lib/supabase';

import { NoConnection } from './save-queue';

/** The server connection. Only the data files use it; screens go through the store. */
export function db() {
  if (!supabase) throw new Error('No server is set up');
  return supabase;
}

/** The result's data, or the server's error as a thrown Error (shown to the owner by the store). */
/** A single row the query must find (e.g. the estimate being sent). */
export function one<T>(res: { data: T | null; error: { message: string; name?: string } | null; status?: number }): T {
  const row = ok(res);
  if (!row) throw new Error('The record was not found on the server');
  return row;
}

export function ok<T>(res: { data: T; error: { message: string; name?: string } | null; status?: number }): T {
  if (res.error) {
    // No answer at all (no signal, a timeout): the save queue tries it again later.
    // Database requests report that as status 0; file requests as a StorageUnknownError.
    if (res.status === 0 || res.error.name === 'StorageUnknownError') throw new NoConnection(res.error.message);
    throw new Error(res.error.message);
  }
  return res.data;
}
