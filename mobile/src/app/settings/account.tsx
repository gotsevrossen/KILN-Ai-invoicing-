import { router } from 'expo-router';
import { useState } from 'react';

import { Button, Card, Field, Notice, PageHeader, Screen, T } from '@/components/ui';
import { useAuth } from '@/data/auth';
import { accountText, emailOk, passwordOk } from '@/features/account/text';
import { useLang } from '@/i18n';
import { supabase } from '@/lib/supabase';
import { userError } from '@/lib/user-errors';

type Status = { kind: 'ok' | 'error'; text: string } | null;

/**
 * The signed-in person's own account: their name (shown on the team), their phone, their sign-in
 * email and their password. Business details are a separate, owner-only page.
 */
export default function Account() {
  const { lang, t } = useLang();
  const c = accountText(lang);
  const auth = useAuth();
  const user = auth.session?.user;
  const meta = (user?.user_metadata ?? {}) as { name?: unknown; phone?: unknown };
  const currentEmail = user?.email ?? '';
  // people who signed up with Apple or Google have no KILN password
  const hasPassword = (user?.identities ?? []).some((i) => i.provider === 'email') || user?.app_metadata?.provider === 'email';

  const [name, setName] = useState(auth.memberName || (typeof meta.name === 'string' ? meta.name : ''));
  const [phone, setPhone] = useState(typeof meta.phone === 'string' ? meta.phone : '');
  const [details, setDetails] = useState<Status>(null);
  const [email, setEmail] = useState('');
  const [emailStatus, setEmailStatus] = useState<Status>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<Status>(null);
  const [busy, setBusy] = useState<'details' | 'email' | 'password' | null>(null);

  if (!supabase || !user) {
    return <Screen header={<PageHeader title={c.accountTitle} back={() => router.back()} />}><Notice text={c.accountHelp} tone="soft" /></Screen>;
  }
  const client = supabase;

  const saveDetails = async () => {
    if (!name.trim()) return setDetails({ kind: 'error', text: c.needName });
    setBusy('details');
    setDetails(null);
    try {
      const meta = await client.auth.updateUser({ data: { name: name.trim(), phone: phone.trim() } });
      if (meta.error) throw meta.error;
      // the name on the team list (owners have a row too)
      const team = await client.rpc('update_my_name', { p_name: name.trim() });
      if (team.error) throw team.error;
      await auth.refreshMembership();
      setDetails({ kind: 'ok', text: c.saved });
    } catch (e) {
      setDetails({ kind: 'error', text: userError(t, e) });
    } finally {
      setBusy(null);
    }
  };

  const changeEmail = async () => {
    const clean = email.trim().toLowerCase();
    if (!emailOk(clean)) return setEmailStatus({ kind: 'error', text: c.badEmail });
    if (clean === currentEmail.toLowerCase()) return setEmailStatus({ kind: 'error', text: c.emailSame });
    setBusy('email');
    setEmailStatus(null);
    // Supabase emails a confirmation link; the sign-in email changes only after it's opened
    const { error } = await client.auth.updateUser({ email: clean });
    setBusy(null);
    if (error) return setEmailStatus({ kind: 'error', text: userError(t, error) });
    setEmail('');
    setEmailStatus({ kind: 'ok', text: c.emailSent.replace('%{email}', clean) });
  };

  const changePassword = async () => {
    if (!passwordOk(next)) return setPasswordStatus({ kind: 'error', text: c.passwordRule });
    if (next !== repeat) return setPasswordStatus({ kind: 'error', text: c.passwordsDiffer });
    setBusy('password');
    setPasswordStatus(null);
    try {
      // proves it's really them before the password changes (a phone left unlocked isn't enough)
      const check = await client.auth.signInWithPassword({ email: currentEmail, password: current });
      if (check.error) { setPasswordStatus({ kind: 'error', text: c.wrongPassword }); return; }
      const { error } = await client.auth.updateUser({ password: next });
      if (error) throw error;
      setCurrent(''); setNext(''); setRepeat('');
      setPasswordStatus({ kind: 'ok', text: c.passwordChanged });
    } catch (e) {
      setPasswordStatus({ kind: 'error', text: userError(t, e) });
    } finally {
      setBusy(null);
    }
  };

  const status = (s: Status) => (s ? <Notice text={s.text} tone={s.kind === 'ok' ? 'soft' : 'danger'} icon={s.kind === 'ok' ? 'check' : 'alert-circle'} /> : null);

  return (
    <Screen header={<PageHeader title={c.accountTitle} sub={c.accountHelp} back={() => router.back()} />}>
      <Card style={{ gap: 14 }}>
        <Field label={c.yourName} value={name} onChangeText={setName} maxLength={120} autoComplete="name" />
        <Field label={c.yourPhone} value={phone} onChangeText={setPhone} maxLength={40} keyboardType="phone-pad" autoComplete="tel" />
        {status(details)}
        <Button label={busy === 'details' ? c.saving : c.saveDetails} icon="check" disabled={!!busy} onPress={() => void saveDetails()} />
      </Card>

      <Card style={{ gap: 14 }}>
        <T v="eyebrow">{c.signInEmail}</T>
        <T v="h3">{currentEmail}</T>
        <Field label={c.newEmail} value={email} onChangeText={setEmail} maxLength={254} keyboardType="email-address"
          autoCapitalize="none" autoCorrect={false} autoComplete="email" />
        {status(emailStatus)}
        <Button label={c.changeEmail} icon="mail" variant="outline" disabled={!!busy || !email.trim()} onPress={() => void changeEmail()} />
      </Card>

      <Card style={{ gap: 14 }}>
        <T v="eyebrow">{c.password}</T>
        {hasPassword ? <>
          <Field label={c.currentPassword} value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" autoComplete="current-password" />
          <Field label={c.newPassword} value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
          <Field label={c.repeatPassword} value={repeat} onChangeText={setRepeat} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
          <T v="small" muted>{c.passwordRule}</T>
          {status(passwordStatus)}
          <Button label={c.changePassword} icon="lock" variant="outline" disabled={!!busy || !current || !next || !repeat} onPress={() => void changePassword()} />
        </> : <T v="small" muted>{c.noPassword}</T>}
      </Card>
    </Screen>
  );
}
