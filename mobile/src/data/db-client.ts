import { supabase } from '@/lib/supabase';

/** The server connection. Only the data files use it; screens go through the store. */
export function db() {
  if (!supabase) throw new Error('No server is set up');
  return supabase;
}

/** The result's data, or the server's error as a thrown Error (shown to the owner by the store). */
/** A single row the query must find (e.g. the estimate being sent). */
export function one<T>(res: { data: T | null; error: { message: string } | null }): T {
  const row = ok(res);
  if (!row) throw new Error('The record was not found on the server');
  return row;
}

export function ok<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}
