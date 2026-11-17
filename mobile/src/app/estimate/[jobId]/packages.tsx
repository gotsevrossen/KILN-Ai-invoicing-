import { useLocalSearchParams } from 'expo-router';

import { EstimatePage } from '@/components/estimate-parts';
import { RecordGate } from '@/components/record-gate';
import { ServicePackages } from '@/components/service-packages';
import { hasJob } from '@/data/selectors';
import { useLang } from '@/i18n';

/** Service packages for one estimate, on their own page like Job details. */
function EstimatePackages({ jobId }: { jobId: string }) {
  const { t } = useLang();
  return <EstimatePage title={t('packages.title')}><ServicePackages jobId={jobId} /></EstimatePage>;
}

/** Waits for the record to load (a link or refresh can arrive first) instead of crashing. */
export default function EstimatePackagesRoute() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  return <RecordGate found={() => hasJob(jobId)}><EstimatePackages jobId={jobId} /></RecordGate>;
}
