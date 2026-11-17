import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';

import { FloatingTabBar } from '@/components/tab-bar';
import { teamText } from '@/features/team/text';
import { useTeam } from '@/features/team/use-team';
import { Button } from '@/components/ui';
import { useAuth } from '@/data/auth';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { userError } from '@/lib/user-errors';
import { font } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

function Loading({ text, retry, retryLabel }: { text: string; retry?: () => void; retryLabel?: string }) {
  const p = usePalette();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, backgroundColor: p.ground }}>
      {retry ? null : <ActivityIndicator color={p.accent} size="large" />}
      <Text style={{ fontFamily: font.semi, fontSize: 16, color: p.ink, textAlign: 'center' }}>{text}</Text>
      {retry ? <Button label={retryLabel ?? ""} onPress={retry} /> : null}
    </View>
  );
}

export default function TabLayout() {
  const { t, lang } = useLang();
  const team = useTeam();
  const { state } = useStore();
  const auth = useAuth();
  if (auth.configured) {
    if (!auth.ready) return <Loading text={t('auth.loading')} />;
    if (auth.loadError) return <Loading text={t('auth.loadFailed', { reason: userError(t, auth.loadError) })} retry={auth.retryLoad} retryLabel={t('auth.retry')} />;
    if (!auth.session) return <Redirect href="/sign-in" />;
    if (auth.pending) return <Redirect href="/waiting" />;
    if (auth.role === 'crew') return <Redirect href="/crew" />;
  }
  // first run: set up the business before anything else
  if (!state.profile.onboarded) return <Redirect href="/setup" />;
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <FloatingTabBar {...props} icons={team.showTab ? { index: 'home', jobs: 'briefcase', team: 'users' } : { index: 'home', jobs: 'briefcase' }} capture={{ route: 'capture', label: t('tabs.capture') }} />}>
      <Tabs.Screen name="index" options={{ title: t('tabs.home') }} />
      <Tabs.Screen name="jobs" options={{ title: t('tabs.jobs') }} />
      <Tabs.Screen name="team" options={{ title: teamText(lang).teamTitle }} />
      <Tabs.Screen name="capture" options={{ title: t('tabs.capture') }} />
    </Tabs>
  );
}
