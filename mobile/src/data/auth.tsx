import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';

import { loadAll } from './db';
import { storeActions } from './store';

type Auth = {
  /** False when no server is set up (example mode). */
  configured: boolean;
  /** True once we know who's signed in and their data has loaded. */
  ready: boolean;
  session: Session | null;
  /** Why the business data couldn't load, if it didn't. */
  loadError: string | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  // false until we know whether someone is already signed in (avoids flashing the sign-in screen)
  const [sessionKnown, setSessionKnown] = useState(!supabase);
  // which user's data has finished loading, and any error doing it
  const [loaded, setLoaded] = useState<{ userId: string; error: string | null } | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionKnown(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // whenever the signed-in user changes, load their business (or clear everything)
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!supabase || !sessionKnown) return;
    if (!userId) {
      storeActions.signedOut();
      return;
    }
    let cancelled = false;
    storeActions.startConnected();
    loadAll()
      .then((data) => {
        if (cancelled) return;
        if (data) storeActions.hydrate(data);
        setLoaded({ userId, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoaded({ userId, error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, sessionKnown]);

  const ready = !supabase || (sessionKnown && (userId === null || loaded?.userId === userId));
  const loadError = loaded && loaded.userId === userId ? loaded.error : null;

  const value = useMemo<Auth>(
    () => ({
      configured: !!supabase,
      ready,
      session,
      loadError,
      async signIn(email, password) {
        if (!supabase) return 'No server is set up';
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        return error ? error.message : null;
      },
      async signUp(email, password) {
        if (!supabase) return 'No server is set up';
        const { error } = await supabase.auth.signUp({ email: email.trim(), password });
        return error ? error.message : null;
      },
      async signOut() {
        await supabase?.auth.signOut();
      },
    }),
    [ready, session, loadError],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
