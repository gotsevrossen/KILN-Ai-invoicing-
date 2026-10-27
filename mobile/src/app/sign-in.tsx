import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Field, Notice, Row, Screen, Segmented, T } from '@/components/ui';
import { useAuth, type ResetProblem } from '@/data/auth';
import { useLang } from '@/i18n';
import { font } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

/** Seconds between reset-code emails (the server also limits how often it sends). */
const RESEND_WAIT = 60;

/** Email and password sign-in / create account / reset a forgotten password with an emailed code. Apple and Google sign-in come with the developer accounts. */
export default function SignIn() {
  const p = usePalette();
  const { t, lang, setLang } = useLang();
  const auth = useAuth();
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
  const ready =
    mode === 'reset'
      ? codeSent
        ? emailOk && (verified || codeOk) && passwordOk
        : emailOk
      : emailOk && (mode === 'in' ? password.length > 0 : passwordOk);

  const resetMessage = (problem: ResetProblem): string => {
    if (problem.kind === 'badCode') return t('auth.badCode');
    if (problem.kind === 'tooMany') return t('auth.tooMany');
    if (problem.kind === 'samePassword') return t('auth.samePassword');
    if (problem.kind === 'weakPassword') return t('auth.weakPassword');
    return problem.message;
  };

  const switchMode = (next: 'in' | 'up' | 'reset') => {
    // a used reset code signs the owner in; leaving without a new password signs them back out
    if (verified) auth.signOut();
    // the typed password isn't reused between signing in and choosing a new one
    if (next === 'reset' || mode === 'reset') setPassword('');
    setMode(next);
    setError(null);
    setCodeSent(false);
    setCode('');
    setVerified(false);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    const err = mode === 'in' ? await auth.signIn(email, password) : await auth.signUp(email, password);
    setBusy(false);
    if (err) setError(err);
    else router.replace('/');
  };

  // Same message whether or not the email has an account, so this can't be used to find out who does.
  const sendCode = async () => {
    setBusy(true);
    setError(null);
    const problem = await auth.sendResetCode(email);
    setBusy(false);
    if (problem) {
      setError(resetMessage(problem));
      return;
    }
    setCodeSent(true);
    setCode('');
    setResendAt(Date.now() + RESEND_WAIT * 1000);
    setNow(Date.now());
  };

  const saveNewPassword = async () => {
    setBusy(true);
    setError(null);
    if (!verified) {
      const problem = await auth.verifyResetCode(email, code);
      if (problem) {
        setBusy(false);
        setError(resetMessage(problem));
        return;
      }
      setVerified(true);
    }
    const problem = await auth.setNewPassword(password);
    setBusy(false);
    if (problem) {
      setError(problem.kind === 'other' ? t('auth.passwordNotSaved', { reason: problem.message }) : resetMessage(problem));
      return;
    }
    router.replace('/');
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
            <Field
              label={t('auth.newPassword')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
            />
            <T v="small" color={password && !passwordOk ? p.danger : p.muted}>{t('auth.passwordHelp')}</T>
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
      <Field
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
        textContentType={mode === 'in' ? 'password' : 'newPassword'}
      />
      {mode === 'up' ? <T v="small" color={password && !passwordOk ? p.danger : p.muted}>{t('auth.passwordHelp')}</T> : null}
      {/* reset needs a server to email the code; the sign-in screen only shows when one is set up, but check anyway */}
      {mode === 'in' && auth.configured ? (
        <Button label={t('auth.forgot')} variant="ghost" style={{ alignSelf: 'flex-start' }} onPress={() => switchMode('reset')} />
      ) : null}
      {error ? <Notice text={error} tone="danger" icon="alert-circle" /> : null}
    </Screen>
  );
}
