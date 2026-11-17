import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Button, Card, Field, Notice, PageHeader, Screen, T } from '@/components/ui';
import { useAuth } from '@/data/auth';
import { joinTeam, loadTeamMembership } from '@/data/team-access';
import { useLang } from '@/i18n';
import { userError } from '@/lib/user-errors';
import { teamText } from './text';

function JoinAccount({ token }: { token: string }) {
  const auth = useAuth();
  const { lang, t } = useLang();
  const c = teamText(lang);
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const inFlight = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [resendAt]);
  const attempt = async (action: 'send_code' | 'accept') => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      await joinTeam(action, token, action === 'accept' ? code.trim() : undefined);
      if (!alive.current) return;
      if (action === 'send_code') { setSent(true); setResendAt(Date.now() + 60000); setNow(Date.now()); }
      else { auth.retryLoad(); router.replace('/team-work'); }
    } catch (e) {
      // Acceptance may have committed before the response was lost and the code
      // was consumed. Refresh only this account's membership; never re-use OTP proof.
      try {
        const member = await loadTeamMembership();
        if (alive.current && member?.role === 'helper') { auth.retryLoad(); router.replace('/team-work'); return; }
      } catch { /* keep the original friendly failure below */ }
      if (!alive.current) return;
      const key = (e as { code?: string }).code;
      setError(key === 'account_has_business' ? c.accountHasBusiness : key === 'bad_code' ? c.badCode : key === 'invitation_unavailable' ? c.invalidLink : key === 'email_unavailable' ? c.emailUnavailable : key === 'too_many' ? c.tooMany : key === 'signed_out' ? c.expiredSession : userError(t, e));
    } finally { if (alive.current) { inFlight.current = false; setBusy(false); } }
  };
  if (auth.role === 'helper') return <Screen header={<PageHeader title={c.join} />}><Notice text={c.joined} tone="accent" /><Button label={c.title} onPress={() => router.replace('/team-work')} /></Screen>;
  const seconds = Math.max(0, Math.ceil((resendAt - now) / 1000));
  return <Screen header={<PageHeader title={c.join} />}>
    <T>{c.joinHelp}</T>
    {!auth.session ? <><Notice text={c.returnLink} tone="soft" /><Button label={c.signIn} onPress={() => router.push({ pathname: '/sign-in', params: { join: token } })} /></> : <Card>
      <T v="label">{auth.session.user.email}</T>
      <Button label={seconds ? `${c.sendCode} (${seconds})` : c.sendCode} disabled={busy || seconds > 0} onPress={() => void attempt('send_code')} />
      {sent ? <><T muted>{c.codeSent}</T><Field label={c.code} value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" maxLength={8} editable={!busy} /><Button label={busy ? c.saving : c.accept} disabled={busy || !/^\d{6,8}$/.test(code.trim())} onPress={() => void attempt('accept')} /></> : null}
      <Button label={c.signOut} variant="outline" disabled={busy} onPress={() => void auth.signOut()} />
    </Card>}
    {error ? <Notice text={error} tone="danger" /> : null}
  </Screen>;
}
export function JoinScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const auth = useAuth();
  const { lang } = useLang();
  const c = teamText(lang);
  if (!/^[a-f0-9]{64}$/.test(token ?? '')) return <Screen><Notice text={c.invalidLink} tone="soft" /></Screen>;
  return <JoinAccount key={`${auth.session?.user.id ?? 'guest'}:${token}`} token={token} />;
}
