import { Redirect, Tabs } from 'expo-router';

import { FloatingCaptureBar } from '@/components/tab-bar';
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
      backBehavior="initialRoute"
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <FloatingCaptureBar {...props} capture={{ route: 'capture', label: c.capture }} />}>
      <Tabs.Screen name="index" options={{ title: c.jobs }} />
      <Tabs.Screen name="capture" options={{ title: c.capture }} />
    </Tabs>
  );
}
