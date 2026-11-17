import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Field, Notice, Row, Screen, Segmented, T } from '@/components/ui';
import { useAuth, type ResetProblem } from '@/data/auth';
import { cleanCode } from '@/data/team-access';
import { teamText } from '@/features/team/text';
import { useLang } from '@/i18n';
import { userError } from '@/lib/user-errors';
import { font } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

/** Seconds between reset-code emails (the server also limits how often it sends). */
const RESEND_WAIT = 60;

/** Email and password sign-in / create account / reset a forgotten password with an emailed code. Apple and Google sign-in come with the developer accounts. */
export default function SignIn() {
  const p = usePalette();
  const { t, lang, setLang } = useLang();
  const { join } = useLocalSearchParams<{ join?: string }>();
  // came from "I was invited to a team": go back to entering the code after signing in
  const joinCode = typeof join === 'string' ? cleanCode(join) : null;
  const destination: Href = joinCode ? `/join/${joinCode}` : join === '1' ? '/join' : '/';
  const auth = useAuth();
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // making a password (new account or reset): typed twice, and can be shown
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // password reset: code sent, the code typed, and whether it already worked (it can only be used once)
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [verified, setVerified] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  // tick the "send a new code" countdown only while it's waiting
  const waitLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));
  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [resendAt]);

  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  // same rule as the server: 8+ characters with letters and numbers
  const passwordOk = password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password);
  const codeOk = /^\d{6}$/.test(code.trim());
  const matches = confirm === password;
  const ready =
    mode === 'reset'
      ? codeSent
        ? emailOk && (verified || codeOk) && passwordOk && matches
        : emailOk
      : emailOk && (mode === 'in' ? password.length > 0 : passwordOk && matches);

  /** The new password typed twice, with a show/hide button (new account and password reset). */
  const newPassword = (label: string) => <>
    <Field label={label} value={password} onChangeText={setPassword} secureTextEntry={!show}
      autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" />
    <T v="small" color={password && !passwordOk ? p.danger : p.muted}>{t('auth.passwordHelp')}</T>
    <Field label={t('auth.confirmPassword')} value={confirm} onChangeText={setConfirm} secureTextEntry={!show}
      autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" />
    {confirm && !matches ? <T v="small" color={p.danger}>{t('auth.passwordsDiffer')}</T> : null}
    <Button label={show ? t('auth.hidePassword') : t('auth.showPassword')} icon={show ? 'eye-off' : 'eye'} variant="ghost"
      style={{ alignSelf: 'flex-start' }} onPress={() => setShow((v) => !v)} />
  </>;

  const resetMessage = (problem: ResetProblem): string => {
    if (problem.kind === 'badCode') return t('auth.badCode');
    if (problem.kind === 'tooMany') return t('auth.tooMany');
    if (problem.kind === 'samePassword') return t('auth.samePassword');
    if (problem.kind === 'weakPassword') return t('auth.weakPassword');
    return userError(t, problem);
  };

  const switchMode = (next: 'in' | 'up' | 'reset') => {
    // a used reset code signs the owner in; leaving without a new password signs them back out
    if (verified) void auth.signOut().catch((e: unknown) => setError(userError(t, e)));
    // the typed password isn't reused between signing in and choosing a new one
    if (next === 'reset' || mode === 'reset') setPassword('');
    setConfirm('');
    setShow(false);
    setMode(next);
    setError(null);
    setCodeSent(false);
    setCode('');
    setVerified(false);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const err = mode === 'in' ? await auth.signIn(email, password) : await auth.signUp(email, password);
      if (err) setError(userError(t, err));
      else router.replace(destination);
    } catch (e) {
      setError(userError(t, e));
    } finally {
      setBusy(false);
    }
  };

  // Same message whether or not the email has an account, so this can't be used to find out who does.
  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const problem = await auth.sendResetCode(email);
      if (problem) {
        setError(resetMessage(problem));
        return;
      }
      setCodeSent(true);
      setCode('');
      setResendAt(Date.now() + RESEND_WAIT * 1000);
      setNow(Date.now());
    } catch (e) {
      setError(userError(t, e));
    } finally {
      setBusy(false);
    }
  };

  const saveNewPassword = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!verified) {
        const problem = await auth.verifyResetCode(email, code);
        if (problem) {
          setError(resetMessage(problem));
          return;
        }
        setVerified(true);
      }
      const problem = await auth.setNewPassword(password);
      if (problem) {
        setError(problem.kind === 'other' ? t('auth.passwordNotSaved', { reason: userError(t, problem) }) : resetMessage(problem));
        return;
      }
      router.replace(destination);
    } catch (e) {
      setError(userError(t, e));
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'reset') {
    return (
      <Screen
        footer={
          <>
            <Button
              label={busy ? t('auth.working') : codeSent ? t('auth.savePassword') : t('auth.sendCode')}
              icon={codeSent ? 'lock' : 'mail'}
              big
              disabled={!ready || busy}
              onPress={codeSent ? saveNewPassword : sendCode}
            />
            {codeSent && !verified ? (
              <Button
                label={waitLeft > 0 ? t('auth.resendWait', { seconds: waitLeft }) : t('auth.resend')}
                icon="refresh-cw"
                variant="outline"
                disabled={waitLeft > 0 || busy || !emailOk}
                onPress={sendCode}
              />
            ) : null}
            <Button label={t('auth.backToSignIn')} variant={codeSent && !verified ? 'ghost' : 'outline'} onPress={() => switchMode('in')} />
          </>
        }>
        <Row gap={10} style={{ marginTop: 12 }}>
          <View style={{ width: 16, height: 16, borderRadius: 5, backgroundColor: p.accent }} />
          <T style={{ fontFamily: font.black, fontSize: 26, letterSpacing: 4 }}>KILN</T>
        </Row>
        <T v="title" accessibilityRole="header">{t('auth.resetTitle')}</T>
        <T v="body" muted>{t('auth.resetBody')}</T>
        <Field
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          editable={!verified}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
        />
        {codeSent ? (
          <>
            <Notice text={t('auth.codeSent')} tone="plain" icon="mail" />
            {!verified ? (
              <Field
                label={t('auth.code')}
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
              />
            ) : null}
            {newPassword(t('auth.newPassword'))}
          </>
        ) : null}
        {error ? <Notice text={error} tone="danger" icon="alert-circle" /> : null}
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          <Button label={busy ? t('auth.working') : mode === 'in' ? t('auth.signIn') : t('auth.signUp')} icon="log-in" big disabled={!ready || busy} onPress={submit} />
          <Button label={mode === 'in' ? t('auth.toSignUp') : t('auth.toSignIn')} variant="outline" onPress={() => switchMode(mode === 'in' ? 'up' : 'in')} />
        </>
      }>
      <Row gap={10} style={{ marginTop: 12 }}>
        <View style={{ width: 16, height: 16, borderRadius: 5, backgroundColor: p.accent }} />
        <T style={{ fontFamily: font.black, fontSize: 26, letterSpacing: 4 }}>KILN</T>
      </Row>
      <T v="title" accessibilityRole="header">{mode === 'in' ? t('auth.signInTitle') : t('auth.signUpTitle')}</T>
      <T v="body" muted>{t('auth.body')}</T>
      <Segmented
        label={t('setup.language')}
        value={lang}
        onChange={setLang}
        options={[
          { key: 'en', label: 'English' },
          { key: 'es', label: 'Español' },
        ]}
      />
      <Field label={t('auth.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
      {mode === 'up' ? newPassword(t('auth.password')) : (
        <Field
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
        />
      )}
      {/* reset needs a server to email the code; the sign-in screen only shows when one is set up, but check anyway */}
      {mode === 'in' && auth.configured ? (
        <Button label={t('auth.forgot')} variant="ghost" style={{ alignSelf: 'flex-start' }} onPress={() => switchMode('reset')} />
      ) : null}
      {error ? <Notice text={error} tone="danger" icon="alert-circle" /> : null}
      {/* invited workers make their own account here, then enter the code on the next page */}
      {join ? <Notice text={teamText(lang).signInFirst} tone="soft" icon="users" />
        : <Button label={teamText(lang).invited} icon="users" variant="ghost" style={{ alignSelf: 'flex-start' }} onPress={() => router.setParams({ join: '1' })} />}
    </Screen>
  );
}
