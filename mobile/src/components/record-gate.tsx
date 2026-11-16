import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { useAuth } from '@/data/auth';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';

import { LoadingCards } from './skeleton';
import { Button, Notice, PageHeader, Screen } from './ui';

/**
 * Shows a page only once its job, invoice, or receipt is in memory. Opened from a link or a
 * browser refresh, a page can arrive before the signed-in business has loaded: it shows
 * "Loading…" until then, and "not available" if the record really isn't there.
 */
export function RecordGate({ found, children }: { found: () => boolean; children: ReactNode }) {
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
        <LoadingCards label={t('common.loading')} />
      ) : (
        <>
          <Notice text={t('common.notFound')} icon="alert-circle" tone="soft" />
          <Button label={t('common.goHome')} icon="home" variant="outline" onPress={() => router.replace('/')} />
        </>
      )}
    </Screen>
  );
}
