import { useRouter, type Href } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { supabase } from '@/lib/supabase';
import { blocked, readSubscription, type Subscription } from '@/lib/subscription';

import { useAuth } from './auth';

// The business's KILN subscription as the server sees it (my_subscription()). Read when someone
// signs in, when the app comes back, and right after a purchase. Example mode and the web pay pages
// have none, and while the paywall is switched off at the server nothing here blocks anything.

interface SubscriptionCtx {
  sub: Subscription | null;
  /** Reads the plan again from KILN's server. */
  reload: () => Promise<void>;
  /** After buying or restoring: asks the server to check with the store now, then reads the plan. */
  syncStore: () => Promise<Subscription | null>;
}

const Ctx = createContext<SubscriptionCtx>({ sub: null, reload: async () => {}, syncStore: async () => null });

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const key = auth.session && auth.businessId ? `${auth.session.user.id}:${auth.businessId}` : null;
  // each answer is kept with the sign-in it was for, so a slow answer for a previous sign-in is never shown
  const [loaded, setLoaded] = useState<{ key: string; sub: Subscription | null } | null>(null);

  const reload = useCallback(async () => {
    if (!supabase || !key) return;
    const res = await supabase.rpc('my_subscription');
    if (!res.error) setLoaded({ key, sub: readSubscription(res.data) });
  }, [key]);

  const syncStore = useCallback(async () => {
    if (!supabase || !key) return null;
    const { data, error } = await supabase.functions.invoke('subscriptions', { body: { action: 'refresh' } });
    if (error) throw error;
    const sub = readSubscription(data);
    setLoaded({ key, sub });
    return sub;
  }, [key]);

  // on sign-in, and each time the app comes back
  useEffect(() => {
    const db = supabase;
    if (!db || !key) return;
    const read = () => void db.rpc('my_subscription').then(
      (res) => { if (!res.error) setLoaded({ key, sub: readSubscription(res.data) }); },
      () => {},
    );
    read();
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') read(); });
    return () => listener.remove();
  }, [key]);

  const sub = loaded && loaded.key === key ? loaded.sub : null;
  const value = useMemo(() => ({ sub, reload, syncStore }), [sub, reload, syncStore]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSubscription = () => useContext(Ctx);

/** Runs `go` when this person may add new work; otherwise opens the subscribe screen instead. */
export function useRequireAccess() {
  const { sub } = useSubscription();
  const router = useRouter();
  return useCallback((go: () => void) => {
    if (blocked(sub)) router.push('/subscribe' as Href);
    else go();
  }, [sub, router]);
}
