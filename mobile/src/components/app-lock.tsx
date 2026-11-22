import * as LocalAuthentication from 'expo-local-authentication';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform, StyleSheet, View, type AppStateStatus } from 'react-native';

import { LogoMark } from '@/components/logo';
import { Button, Notice, SwitchRow, T } from '@/components/ui';
import { useAuth } from '@/data/auth';
import { useLang } from '@/i18n';
import { lockEnabled, lockOnReturn, saveLockEnabled } from '@/lib/app-lock';
import { useScheme } from '@/theme/theme-mode';
import { dark, light } from '@/theme/tokens';

// Face ID or fingerprint (or the phone's own passcode) before KILN shows anything, when the app
// opens and when it comes back after a while. Phones only: the web version and customer pages are
// never locked. Signing in with a password already proves who it is, so that never asks again.

interface Lock {
  /** The phone has a screen lock (Face ID, fingerprint or passcode). null while checking. */
  available: boolean | null;
  enabled: boolean;
  /** Turning it on or off asks for Face ID or a fingerprint first. Returns whether it changed. */
  setEnabled: (on: boolean) => Promise<boolean>;
}

const Ctx = createContext<Lock | null>(null);
const phone = Platform.OS !== 'web';
const storage = typeof localStorage !== 'undefined' ? localStorage : undefined;

async function hasScreenLock(): Promise<boolean | null> {
  try {
    return (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    // A failed check gives us no evidence that the phone has no screen lock.
    return null;
  }
}

export function AppLock({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { t } = useLang();
  const scheme = useScheme();
  const p = scheme === 'dark' ? dark : light;
  const signedIn = !!auth.session;

  const [enabled, setEnabledState] = useState(() => lockEnabled(storage));
  const [available, setAvailable] = useState<boolean | null>(phone ? null : false);
  // decided once we know whether a saved sign-in came back when the app opened
  const [locked, setLocked] = useState<boolean | null>(phone ? null : false);
  const [away, setAway] = useState(false);
  const [failed, setFailed] = useState(false);
  // counts returns from the background, so a locked app asks again when it's reopened
  const [returns, setReturns] = useState(0);
  const leftAt = useRef<number | null>(null);
  const asking = useRef(false);
  // the prompt itself can briefly send the app to the background (Android's passcode screen):
  // don't ask again straight after a cancel, or it would never let the person out
  const askedAt = useRef(0);

  useEffect(() => {
    if (phone) void hasScreenLock().then(setAvailable);
  }, []);

  // opening the app: lock only if a saved sign-in was restored (a fresh password sign-in isn't asked again)
  if (locked === null && auth.ready) setLocked(phone && enabled && signedIn);
  // signed out (here or elsewhere): nothing to protect, and the next password sign-in opens straight away
  if (locked && !signedIn) setLocked(false);

  const ask = useCallback(async (): Promise<boolean> => {
    if (asking.current) return false;
    asking.current = true;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('lock.prompt'), cancelLabel: t('lock.cancel'), fallbackLabel: t('lock.passcode'), disableDeviceFallback: false,
      });
      return result.success;
    } catch {
      return false;
    } finally {
      asking.current = false;
      askedAt.current = Date.now();
    }
  }, [t]);

  const unlock = useCallback(async () => {
    const ok = await ask();
    setFailed(!ok);
    if (ok) setLocked(false);
  }, [ask]);

  useEffect(() => {
    if (!phone) return;
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      // hide what's on screen in the phone's app switcher
      setAway(state !== 'active');
      if (state === 'background') {
        if (leftAt.current === null) leftAt.current = Date.now();
      } else if (state === 'active') {
        if (lockOnReturn({ enabled, signedIn, available: available !== false, leftAt: leftAt.current, now: Date.now() })) setLocked(true);
        if (leftAt.current !== null) setReturns((n) => n + 1);
        leftAt.current = null;
      }
    });
    return () => sub.remove();
  }, [enabled, signedIn, available]);

  const showLock = phone && signedIn && enabled && available !== false && locked !== false;

  // ask right away when the lock appears, instead of waiting for a tap
  useEffect(() => {
    if (showLock && locked === true && available === true && AppState.currentState === 'active' && Date.now() - askedAt.current > 2000) void unlock();
  }, [showLock, locked, available, unlock, returns]);

  const setEnabled = useCallback(async (on: boolean) => {
    if (available !== true || !(await ask())) return false;
    saveLockEnabled(storage, on);
    setEnabledState(on);
    return true;
  }, [available, ask]);

  const value = useMemo(() => ({ available, enabled, setEnabled }), [available, enabled, setEnabled]);
  const cover = phone && signedIn && enabled && available !== false && away && !showLock;

  return (
    <Ctx.Provider value={value}>
      {!showLock && <View style={{ flex: 1 }} accessibilityElementsHidden={cover} importantForAccessibility={cover ? 'no-hide-descendants' : 'auto'}>
        {children}
      </View>}
      {showLock || cover ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: p.ground, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }]}>
          <LogoMark size={72} />
          {showLock && locked === true ? <>
            <T v="h2" style={{ textAlign: 'center' }}>{t('lock.title')}</T>
            <T muted style={{ textAlign: 'center' }}>{t('lock.body')}</T>
            {failed ? <Notice text={t('lock.failed')} tone="danger" icon="alert-circle" /> : null}
            <View style={{ alignSelf: 'stretch', gap: 10 }}>
              <Button label={t('lock.unlock')} icon="unlock" big onPress={() => void unlock()} />
              <Button label={t('lock.signOut')} icon="log-out" variant="ghost" onPress={() => void auth.signOut().catch(() => {})} />
            </View>
          </> : null}
        </View>
      ) : null}
    </Ctx.Provider>
  );
}

/** Settings switch. Hidden on the web; on a phone without a screen lock, says how to get one. */
export function AppLockSetting() {
  const lock = useContext(Ctx);
  const { t } = useLang();
  const [error, setError] = useState(false);
  if (!lock || !phone || lock.available === null) return null;
  if (!lock.available) return <T v="small" muted>{t('lock.noScreenLock')}</T>;
  return <>
    <SwitchRow label={t('lock.setting')} help={t('lock.settingHelp')} value={lock.enabled}
      onChange={(on) => void lock.setEnabled(on).then((ok) => setError(!ok))} />
    {error ? <Notice text={t('lock.notChanged')} tone="danger" icon="alert-circle" /> : null}
  </>;
}
