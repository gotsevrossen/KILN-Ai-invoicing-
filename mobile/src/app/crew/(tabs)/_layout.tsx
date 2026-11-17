import { Redirect, Tabs } from 'expo-router';

import { FloatingTabBar } from '@/components/tab-bar';
import { useAuth } from '@/data/auth';
import { teamText } from '@/features/team/text';
import { useLang } from '@/i18n';

export default function CrewTabs() {
  const { lang } = useLang();
  const c = teamText(lang);
  const auth = useAuth();
  if (auth.ready && !auth.session) return <Redirect href="/sign-in" />;
  if (auth.ready && auth.role !== 'crew') return <Redirect href="/" />;
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <FloatingTabBar {...props} icons={{ index: 'home', jobs: 'briefcase' }} capture={{ route: 'capture', label: c.capture }} />}>
      <Tabs.Screen name="index" options={{ title: c.home }} />
      <Tabs.Screen name="jobs" options={{ title: c.jobs }} />
      <Tabs.Screen name="capture" options={{ title: c.capture }} />
    </Tabs>
  );
}
