import { router, useLocalSearchParams } from 'expo-router';

import { NewJobForm } from '@/components/new-job';
import { PageHeader, Screen } from '@/components/ui';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';

/**
 * New job, on its own page (it's too long for a pop-up). Opened from a receipt,
 * the item being sorted goes straight onto the new job.
 */
export default function NewJob() {
  const { t } = useLang();
  const { actions } = useStore();
  const { item, customer, address, title, pricing } = useLocalSearchParams<{ item?: string; customer?: string; address?: string; title?: string; pricing?: string }>();
  // filled in by the KILN chat
  const chatPricing: 'hourly' | 'flat' | undefined = pricing === 'hourly' ? 'hourly' : pricing === 'flat' ? 'flat' : undefined;
  const initial = customer || address || title ? { customer, address, title, pricing: chatPricing } : undefined;

  return (
    <Screen header={<PageHeader title={t('newJob.title')} back={() => router.back()} />}>
      <NewJobForm
        initial={initial}
        onCreated={(id) => {
          if (item) {
            actions.assign(item, { type: 'jobs', jobIds: [id] });
            router.back();
          } else {
            router.replace(`/job/${id}`);
          }
        }}
      />
    </Screen>
  );
}
