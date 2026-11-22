import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';

import { useAuth } from './auth';

// Deleting your account (migration 20261122140000): asking schedules it 30 days out; signing back in
// shows the date with "Keep my account". This keeps the date for the signed-in person.

interface DeletionCtx {
  /** When the signed-in account will be deleted (ISO time), or null. */
  due: string | null;
  /** Asks to delete the signed-in account. Returns the date. */
  request: () => Promise<string>;
  /** Keeps the account (cancels the deletion). */
  keep: () => Promise<void>;
}

const Ctx = createContext<DeletionCtx>({
  due: null,
  request: async () => { throw new Error('not signed in'); },
  keep: async () => {},
});

export function AccountDeletionProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const userId = auth.session?.user.id ?? null;
  // kept with the sign-in it's for, so the next person never sees someone else's date
  const [state, setState] = useState<{ userId: string; due: string | null } | null>(null);

  useEffect(() => {
    const db = supabase;
    if (!db || !userId) return;
    void db.rpc('my_account_deletion').then(
      (res) => { if (!res.error) setState({ userId, due: typeof res.data === 'string' ? res.data : null }); },
      () => {},
    );
  }, [userId]);

  const request = useCallback(async () => {
    if (!supabase || !userId) throw new Error('not signed in');
    const { data, error } = await supabase.rpc('request_account_deletion');
    if (error) throw error;
    const due = String(data);
    setState({ userId, due });
    return due;
  }, [userId]);

  const keep = useCallback(async () => {
    if (!supabase || !userId) return;
    const { error } = await supabase.rpc('cancel_account_deletion');
    if (error) throw error;
    setState({ userId, due: null });
  }, [userId]);

  const due = state && state.userId === userId ? state.due : null;
  const value = useMemo(() => ({ due, request, keep }), [due, request, keep]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAccountDeletion = () => useContext(Ctx);
