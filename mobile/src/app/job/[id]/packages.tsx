import { router, useLocalSearchParams } from 'expo-router';

import { RecordGate } from '@/components/record-gate';
import { ServicePackages } from '@/components/service-packages';
import { PageHeader, Screen } from '@/components/ui';
import { hasJob, jobById } from '@/data/selectors';
import { useLang } from '@/i18n';

/** Service packages added as work on one job, on their own page. */
function JobPackages({ id }: { id: string }) {
  const { t } = useLang();
  const job = jobById(id);
  return (
    <Screen header={<PageHeader title={t('packages.title')} sub={job.title} back={() => router.back()} />}>
      <ServicePackages jobId={job.id} target="work" />
    </Screen>
  );
}

/** Waits for the record to load (a link or refresh can arrive first) instead of crashing. */
export default function JobPackagesRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecordGate found={() => hasJob(id)}><JobPackages id={id} /></RecordGate>;
}
