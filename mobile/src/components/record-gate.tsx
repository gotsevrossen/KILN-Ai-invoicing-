import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '@/data/auth';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { usePalette } from '@/theme/use-palette';

import { Button, Notice, PageHeader, Screen, T } from './ui';

/**
 * Shows a page only once its job, invoice, or receipt is in memory. Opened from a link or a
 * browser refresh, a page can arrive before the signed-in business has loaded: it shows
 * "Loading…" until then, and "not available" if the record really isn't there.
 */
export function RecordGate({ found, children }: { found: () => boolean; children: ReactNode }) {
  const p = usePalette();
  const { t } = useLang();
  const auth = useAuth();
  // subscribing re-checks the record when the business finishes loading
  useStore();
  if (found()) return children;

  const loading = auth.configured && !auth.ready;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <Screen header={<PageHeader title="" back={back} />}>
      {loading ? (
        <View style={{ alignItems: 'center', gap: 14, paddingTop: 60 }}>
          <ActivityIndicator color={p.accent} size="large" />
          <T v="label">{t('common.loading')}</T>
        </View>
      ) : (
        <>
          <Notice text={t('common.notFound')} icon="alert-circle" tone="soft" />
          <Button label={t('common.goHome')} icon="home" variant="outline" onPress={() => router.replace('/')} />
        </>
      )}
    </Screen>
  );
}
