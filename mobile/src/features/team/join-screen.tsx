import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';

import { Button, Field, Notice, PageHeader, Screen, Segmented, T } from '@/components/ui';
import { useAuth } from '@/data/auth';
import { cleanCode, leaveTeam, requestToJoin } from '@/data/team-access';
import { useLang } from '@/i18n';
import { userError } from '@/lib/user-errors';

import { fill, teamText } from './text';

/** The invited person types (or opens a link with) their code, then waits for approval. */
export function JoinScreen() {
  const { code: fromLink } = useLocalSearchParams<{ code?: string }>();
  const { lang, setLang, t } = useLang();
  const c = teamText(lang);
  const auth = useAuth();
  const [code, setCode] = useState(typeof fromLink === 'string' ? cleanCode(fromLink) ?? '' : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);

  if (auth.pending) return <Redirect href="/waiting" />;
  const header = <PageHeader title={c.joinTitle} back={router.canGoBack() ? () => router.back() : undefined} />;
  const language = <Segmented label={c.language} value={lang} onChange={setLang} options={[{ key: 'en', label: 'English' }, { key: 'es', label: 'Español' }]} />;

  if (!auth.session) return <Screen header={header}>
    {language}
    <T>{c.joinHelp}</T>
    <Notice text={c.signInFirst} tone="soft" icon="info" />
    <Button label={c.signIn} onPress={() => router.push({ pathname: '/sign-in', params: { join: cleanCode(code) ?? '1' } })} />
  </Screen>;

  const join = async () => {
    const clean = cleanCode(code);
    if (!clean) { setError(c.badCode); return; }
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      await requestToJoin(clean);
      auth.retryLoad();
      router.replace('/waiting');
    } catch (e) {
      const message = (e as { message?: string }).message ?? '';
      setError(/already has a business/.test(message) ? c.accountHasBusiness : /invitation unavailable/.test(message) ? c.invalidInvite : userError(t, e));
    } finally { inFlight.current = false; setBusy(false); }
  };

  return <Screen header={header}>
    {language}
    <T>{c.joinHelp}</T>
    <Field label={c.code} value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} maxLength={24} editable={!busy} />
    {error ? <Notice text={error} tone="danger" icon="alert-circle" /> : null}
    <Button label={busy ? c.saving : c.join} icon="arrow-right" big disabled={busy || !code.trim()} onPress={() => void join()} />
    <Button label={c.signOut} variant="outline" disabled={busy} onPress={() => void auth.signOut().then(() => router.replace('/sign-in'), () => undefined)} />
  </Screen>;
}

/** Joined with a code: nothing to see until an owner or manager approves. */
export function WaitingScreen() {
  const { lang, t } = useLang();
  const c = teamText(lang);
  const auth = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (auth.ready && auth.role === 'crew') return <Redirect href="/crew" />;
  if (auth.ready && auth.role) return <Redirect href="/" />;
  if (auth.ready && !auth.pending) return <Redirect href={auth.session ? '/join' : '/sign-in'} />;
  return <Screen header={<PageHeader title={c.waitingTitle} />}>
    <T v="body">{fill(c.waitingBody, { business: auth.businessName })}</T>
    {error ? <Notice text={error} tone="danger" icon="alert-circle" /> : null}
    <Button label={c.checkAgain} icon="refresh-cw" disabled={busy || !auth.ready} onPress={auth.retryLoad} />
    <Button label={c.cancelRequest} variant="outline" disabled={busy} onPress={() => {
      setBusy(true); setError('');
      leaveTeam().then(() => auth.retryLoad(), (e: unknown) => setError(userError(t, e))).finally(() => setBusy(false));
    }} />
    <Button label={c.signOut} variant="ghost" disabled={busy} onPress={() => void auth.signOut().then(() => router.replace('/sign-in'), () => undefined)} />
  </Screen>;
}
