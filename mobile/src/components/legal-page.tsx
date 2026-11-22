import { router } from 'expo-router';
import { View } from 'react-native';

import { useLang } from '@/i18n';
import { fillLegal, LEGAL, type LegalDoc } from '@/legal/details';

import { PageHeader, Screen, T } from './ui';

/** The Privacy Policy or Terms of Use, in the app's language. Open to everyone, signed in or not (the web pages too). */
export function LegalPage({ doc }: { doc: Record<'en' | 'es', LegalDoc> }) {
  const { t, lang } = useLang();
  const d = doc[lang];
  return (
    <Screen header={<PageHeader title={d.title} back={router.canGoBack() ? () => router.back() : undefined} />}>
      <T v="small" muted>{t('legal.updated', { date: LEGAL.updated[lang] })}</T>
      {d.intro.map((p, i) => <T key={i}>{fillLegal(p)}</T>)}
      {d.sections.map((s) => (
        <View key={s.heading} style={{ gap: 6 }}>
          <T v="h3" accessibilityRole="header">{s.heading}</T>
          {s.body.map((p, i) => <T key={i}>{fillLegal(p)}</T>)}
        </View>
      ))}
    </Screen>
  );
}
