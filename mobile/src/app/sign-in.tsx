import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Field, Notice, Row, Screen, Segmented, T } from '@/components/ui';
import { useAuth } from '@/data/auth';
import { useLang } from '@/i18n';
import { font } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

/** Email and password sign-in / create account. Apple and Google sign-in come with the developer accounts. */
export default function SignIn() {
  const p = usePalette();
  const { t, lang, setLang } = useLang();
  const auth = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  // same rule as the server: 8+ characters with letters and numbers
  const passwordOk = password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password);
  const ready = emailOk && (mode === 'in' ? password.length > 0 : passwordOk);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const err = mode === 'in' ? await auth.signIn(email, password) : await auth.signUp(email, password);
    setBusy(false);
    if (err) setError(err);
    else router.replace('/');
  };

  return (
    <Screen
      footer={
        <>
          <Button label={busy ? t('auth.working') : mode === 'in' ? t('auth.signIn') : t('auth.signUp')} icon="log-in" big disabled={!ready || busy} onPress={submit} />
          <Button
            label={mode === 'in' ? t('auth.toSignUp') : t('auth.toSignIn')}
            variant="ghost"
            onPress={() => {
              setMode(mode === 'in' ? 'up' : 'in');
              setError(null);
            }}
          />
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
      {error ? <Notice text={error} tone="danger" icon="alert-circle" /> : null}
    </Screen>
  );
}
