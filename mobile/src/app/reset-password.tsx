import type { SupabaseClient } from '@supabase/supabase-js';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { Button, Field, Notice, Screen, T } from '@/components/ui';
import { resetProblem } from '@/data/auth';
import { useLang } from '@/i18n';
import { recoveryClient } from '@/lib/supabase';
import { userError } from '@/lib/user-errors';

async function openRecovery(): Promise<SupabaseClient | null> {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const access = params.get('access_token');
  const refresh = params.get('refresh_token');
  if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  if (params.get('type') !== 'recovery' || !access || !refresh) return null;
  const client = recoveryClient();
  if (!client) return null;
  const { error } = await client.auth.setSession({ access_token: access, refresh_token: refresh });
  return error ? null : client;
}

export default function ResetPassword() {
  const { t } = useLang();
  const opening = useRef<Promise<SupabaseClient | null> | null>(null);
  const [client, setClient] = useState<SupabaseClient | null | undefined>(undefined);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let live = true;
    opening.current ??= openRecovery();
    void opening.current.then((value) => { if (live) setClient(value); }, () => { if (live) setClient(null); });
    return () => { live = false; };
  }, []);

  const valid = password.length >= 8 && /[a-z]/i.test(password) && /\d/.test(password) && password === confirmation;
  async function update() {
    if (!valid || !client || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await client.auth.updateUser({ password });
      if (result.error) {
        const problem = resetProblem(result.error);
        setError(problem.kind === 'samePassword' ? t('auth.samePassword')
          : problem.kind === 'weakPassword' ? t('auth.weakPassword') : userError(t, problem));
        return;
      }
      setDone(true);
      setPassword('');
      setConfirmation('');
      await client.auth.signOut({ scope: 'local' });
    } catch (e) {
      setError(userError(t, e));
    } finally { setBusy(false); }
  }

  return <Screen>
    <T v="title" accessibilityRole="header">{t('auth.resetTitle')}</T>
    {done || client === null ? <>
      <Notice text={t(done ? 'auth.resetComplete' : 'auth.resetLinkInvalid')} tone={done ? 'accent' : 'danger'} />
      <Button label={t('auth.backToSignIn')} onPress={() => router.replace('/sign-in')} />
    </> : client === undefined ? <T>{t('auth.working')}</T> : <>
      <Field label={t('auth.newPassword')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
      <T v="small" muted>{t('auth.passwordHelp')}</T>
      <Field label={t('auth.confirmPassword')} value={confirmation} onChangeText={setConfirmation} secureTextEntry autoComplete="new-password" />
      {confirmation && confirmation !== password ? <T v="small">{t('auth.passwordsDiffer')}</T> : null}
      {error ? <Notice text={error} tone="danger" /> : null}
      <Button label={t(busy ? 'auth.working' : 'auth.savePassword')} disabled={!valid || busy} onPress={update} />
    </>}
  </Screen>;
}
