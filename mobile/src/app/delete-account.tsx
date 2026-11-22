import { router, type Href } from 'expo-router';
import { useState } from 'react';

import { Button, Field, Notice, PageHeader, Screen, T } from '@/components/ui';
import { useAccountDeletion } from '@/data/account-deletion';
import { useAuth } from '@/data/auth';
import { useLang } from '@/i18n';
import { LEGAL } from '@/legal/details';
import { useFormat } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { userError } from '@/lib/user-errors';

/**
 * Delete my account: in the app (Settings) and on the web at /delete-account, which Google Play needs
 * for people without the app. The account goes 30 days later; until then, signing in shows the date
 * and "Keep my account". An owner's whole business goes with them; a team member's work stays.
 * Asking signs the person out everywhere, so a lost phone can't undo it.
 */
export default function DeleteAccount() {
  const { t } = useLang();
  const f = useFormat();
  const auth = useAuth();
  const deletion = useAccountDeletion();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // the date, once asked (the person is signed out right after)
  const [done, setDone] = useState<string | null>(null);

  const user = auth.session?.user;
  const hasPassword = (user?.identities ?? []).some((i) => i.provider === 'email') || user?.app_metadata?.provider === 'email';
  const day = (iso: string) => f.date(iso.slice(0, 10));
  const header = <PageHeader title={t('deleteAccount.title')} back={router.canGoBack() ? () => router.back() : undefined} />;

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try { await work(); } catch (e) { setProblem(userError(t, e)); } finally { setBusy(false); }
  };

  if (done) {
    return (
      <Screen header={header}>
        <Notice text={t('deleteAccount.scheduled', { date: day(done) })} icon="check" tone="soft" />
        <T>{t('deleteAccount.scheduledHelp')}</T>
      </Screen>
    );
  }

  // signed out (the web page): sign in first
  if (!auth.session) {
    return (
      <Screen header={header}>
        <T>{t('deleteAccount.signInFirst')}</T>
        <Field label={t('deleteAccount.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Field label={t('deleteAccount.password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
        <Button label={busy ? t('deleteAccount.working') : t('deleteAccount.signIn')} big disabled={busy || !email.trim() || !password}
          onPress={() => void run(async () => { const err = await auth.signIn(email, password); if (err) throw err; setPassword(''); })} />
        {problem ? <Notice text={problem} tone="danger" icon="alert-circle" /> : null}
        <T v="small" muted>{t('deleteAccount.otherSignIn', { email: LEGAL.email })}</T>
      </Screen>
    );
  }

  // already asked: keep it, or leave it and sign out
  if (deletion.due) {
    return (
      <Screen header={<PageHeader title={t('deleteAccount.pendingTitle')} />}>
        <T>{t('deleteAccount.pendingBody', { date: day(deletion.due) })}</T>
        <Button label={busy ? t('deleteAccount.working') : t('deleteAccount.keep')} icon="check" big disabled={busy}
          onPress={() => void run(async () => { await deletion.keep(); router.replace('/' as Href); })} />
        <Button label={t('deleteAccount.signOut')} variant="ghost" disabled={busy} onPress={() => void auth.signOut().catch(() => {})} />
        {problem ? <Notice text={problem} tone="danger" icon="alert-circle" /> : null}
      </Screen>
    );
  }

  const owner = auth.role === 'owner';
  const ready = confirm.trim().toUpperCase() === t('deleteAccount.confirmWord') && (!hasPassword || !!password);
  const remove = () => run(async () => {
    if (!supabase) return;
    // a password account proves it's really them (a phone left unlocked isn't enough)
    if (hasPassword && user?.email) {
      const check = await supabase.auth.signInWithPassword({ email: user.email, password });
      if (check.error) { setProblem(t('deleteAccount.wrongPassword')); return; }
    }
    const due = await deletion.request();
    setDone(due);
    // signed out on every device, so a lost phone can't keep using (or undo) it
    await supabase.auth.signOut({ scope: 'global' }).catch(() => {});
  });

  return (
    <Screen header={header}>
      <Notice text={owner ? t('deleteAccount.ownerWhat') : t('deleteAccount.memberWhat')} icon="alert-circle" tone="flag" />
      <T>{t('deleteAccount.when')}</T>
      {owner ? <T>{t('deleteAccount.saveFirst')}</T> : null}
      {owner ? <T muted>{t('deleteAccount.stripe')}</T> : null}
      <T muted>{t('deleteAccount.store')}</T>
      {hasPassword ? <Field label={t('deleteAccount.password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" /> : null}
      <Field label={t('deleteAccount.confirmLabel')} value={confirm} onChangeText={setConfirm} autoCapitalize="characters" autoCorrect={false} />
      <Button label={busy ? t('deleteAccount.working') : t('deleteAccount.button')} icon="trash-2" variant="danger" big disabled={busy || !ready} onPress={() => void remove()} />
      {problem ? <Notice text={problem} tone="danger" icon="alert-circle" /> : null}
    </Screen>
  );
}
