import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { passwordResetUrl, supabase } from '@/lib/supabase';
import { errorDetails, userErrorKey, type ErrorDetails } from '@/lib/user-errors';

import { loadAll } from './db';
import { loadTeamMembership, type TeamMembership, type TeamRole } from './team-access';
import { currentState, storeActions } from './store';

/** Why a password-reset step failed, so the screen can explain it in the owner's language. */
export type ResetProblem = ErrorDetails & { kind: 'badCode' | 'tooMany' | 'samePassword' | 'weakPassword' | 'other' };

export function resetProblem(error: { code?: string; status?: number; message: string }): ResetProblem {
  const { code, status, message } = error;
  if (code === 'otp_expired' || (status === 403 && !code)) return { kind: 'badCode', message };
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || status === 429) return { kind: 'tooMany', message };
  if (code === 'same_password') return { kind: 'samePassword', message };
  if (code === 'weak_password') return { kind: 'weakPassword', message };
  return { kind: 'other', ...errorDetails(error) };
}

type Auth = {
  /** False when no server is set up (example mode). */
  configured: boolean;
  /** True once we know who's signed in and their data has loaded. */
  ready: boolean;
  session: Session | null;
  /** Role in the business. Null in example mode or before setup. */
  role: TeamRole | null;
  /** Joined with an invite code and waiting for an owner or manager to approve. */
  pending: boolean;
  businessId: string | null;
  businessName: string;
  /** This person's name on the team (from their invite). */
  memberName: string;
  /** Crew see prices on estimates, invoices and the price list (the owner's switch). */
  crewSeesPrices: boolean;
  /** Why the business data couldn't load, if it didn't. */
  loadError: ErrorDetails | null;
  retryLoad: () => void;
  /** Re-check role/access without tearing down an unchanged account view. */
  refreshMembership: () => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<ErrorDetails | null>;
  signUp: (email: string, password: string) => Promise<ErrorDetails | null>;
  signOut: () => Promise<void>;
  /** Sends the project's recovery email and provides the callback for link-based templates. */
  sendPasswordReset: (email: string) => Promise<ResetProblem | null>;
  /** Checks the emailed code. On success the owner is signed in, ready to set a new password. */
  verifyResetCode: (email: string, code: string) => Promise<ResetProblem | null>;
  /** Saves a new password for the signed-in owner. */
  setNewPassword: (password: string) => Promise<ResetProblem | null>;
};

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [membership, setMembership] = useState<(TeamMembership & { userId: string }) | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sessionError, setSessionError] = useState<ErrorDetails | null>(null);
  // false until we know whether someone is already signed in (avoids flashing the sign-in screen)
  const [sessionKnown, setSessionKnown] = useState(!supabase);
  // which user's data has finished loading, and any error doing it
  const [loaded, setLoaded] = useState<{ userId: string; error: ErrorDetails | null } | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let live = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!live) return;
      setSession(data.session);
      setSessionError(error ? errorDetails(error) : null);
      setSessionKnown(true);
    }).catch((e: unknown) => {
      if (!live) return;
      setSessionError(errorDetails(e));
      setSessionKnown(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_OUT') { setLoaded(null); setMembership(null); }
      setSession(s);
    });
    return () => { live = false; data.subscription.unsubscribe(); };
  }, [attempt]);

  // whenever the signed-in user changes, load their business (or clear everything)
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!supabase || !sessionKnown) return;
    if (!userId) {
      storeActions.signedOut();
      return;
    }
    let cancelled = false;
    // Membership is resolved before any owner data is loaded. Helpers use isolated RPCs.
    storeActions.clearAccountView();
    void (async () => {
      try {
        let member: Awaited<ReturnType<typeof loadTeamMembership>>;
        try {
          member = await loadTeamMembership();
          if (cancelled) return;
          try { localStorage.setItem(`kiln.membership:${userId}`, JSON.stringify(member)); } catch { /* Offline recovery remains optional if storage is unavailable. */ }
        } catch (error) {
          let cached: unknown = null;
          try { cached = JSON.parse(localStorage.getItem(`kiln.membership:${userId}`) ?? 'null'); } catch { /* No cached authority. */ }
          // A previously active member can use their own cached view during a connection failure.
          const value = cached as Partial<TeamMembership> | null;
          if (userErrorKey(error) !== 'errors.connection' || !value?.role || !['owner', 'manager', 'crew'].includes(value.role) || value.status !== 'active' || typeof value.businessId !== 'string') throw error;
          member = value as TeamMembership;
        }
        if (cancelled) return;
        setMembership(member ? { ...member, userId } : null);
        // crew and people waiting for approval never load business tables
        if (member && (member.role === 'crew' || member.status === 'pending')) {
          storeActions.startHelper(member.businessId);
          setLoaded({ userId, error: null });
          return;
        }
        storeActions.startConnected(userId);
        await storeActions.retryOffline();
        const before = currentState();
        const data = await loadAll();
        if (cancelled) return;
        if (data && currentState() === before) storeActions.hydrate(data);
        setLoaded({ userId, error: null });
      } catch (e) {
        if (!cancelled) {
          storeActions.offlineLoadFailed(e);
          setLoaded({ userId, error: storeActions.hasOfflineCache() ? null : errorDetails(e) });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, sessionKnown, attempt]);

  const ready = !supabase || !!sessionError || (sessionKnown && (userId === null || loaded?.userId === userId));
  const loadError = sessionError ?? (loaded && loaded.userId === userId ? loaded.error : null);

  const value = useMemo<Auth>(
    () => ({
      configured: !!supabase,
      ready,
      session,
      role: membership?.userId === userId && membership.status === 'active' ? membership.role : null,
      pending: membership?.userId === userId && membership.status === 'pending',
      businessId: membership?.userId === userId ? membership.businessId : null,
      businessName: membership?.userId === userId ? membership.businessName : '',
      memberName: membership?.userId === userId ? membership.name : '',
      crewSeesPrices: membership?.userId === userId ? membership.crewSeesPrices : false,
      loadError,
      retryLoad: () => { setSessionError(null); setLoaded(null); setAttempt((n) => n + 1); },
      async refreshMembership() {
        if (!supabase || !userId) return false;
        const next = await loadTeamMembership();
        const current = await supabase.auth.getSession();
        if (current.data.session?.user.id !== userId) return false;
        try { localStorage.setItem(`kiln.membership:${userId}`, JSON.stringify(next)); } catch { /* optional cache */ }
        const previous = membership?.userId === userId ? membership : null;
        const changedAccess = previous?.businessId !== next?.businessId || previous?.role !== next?.role || previous?.status !== next?.status;
        if (changedAccess) {
          storeActions.clearAccountView();
          setMembership(next ? { ...next, userId } : null);
          setLoaded(null);
          setAttempt((n) => n + 1);
          return false;
        }
        if (next && (previous?.name !== next.name || previous?.businessName !== next.businessName || previous?.crewSeesPrices !== next.crewSeesPrices)) {
          setMembership({ ...next, userId });
        }
        return true;
      },
      async signIn(email, password) {
        if (!supabase) return { message: 'No server is set up' };
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        return error ? errorDetails(error) : null;
      },
      async signUp(email, password) {
        if (!supabase) return { message: 'No server is set up' };
        const { error } = await supabase.auth.signUp({ email: email.trim(), password });
        return error ? errorDetails(error) : null;
      },
      async signOut() {
        const result = await supabase?.auth.signOut();
        if (result?.error) throw result.error;
      },
      async sendPasswordReset(email) {
        if (!supabase) return { kind: 'other', message: 'No server is set up' };
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: passwordResetUrl });
        return error ? resetProblem(error) : null;
      },
      async verifyResetCode(email, code) {
        if (!supabase) return { kind: 'other', message: 'No server is set up' };
        const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' });
        return error ? resetProblem(error) : null;
      },
      async setNewPassword(password) {
        if (!supabase) return { kind: 'other', message: 'No server is set up' };
        const { error } = await supabase.auth.updateUser({ password });
        return error ? resetProblem(error) : null;
      },
    }),
    [ready, session, loadError, membership, userId],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
