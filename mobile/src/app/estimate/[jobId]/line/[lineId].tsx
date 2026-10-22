import { router, useLocalSearchParams } from 'expo-router';

import { EstimateLineEditor } from '@/components/estimate-line-editor';
import { EstimatePage, useEstimate } from '@/components/estimate-parts';
import { RecordGate } from '@/components/record-gate';
import { Button, Card } from '@/components/ui';
import { hasJob } from '@/data/selectors';
import { useLang } from '@/i18n';

/** One estimate line: description, quantity, price, charge type, exclude, save to price list. */
function EstimateLinePage() {
  const { t } = useLang();
  const { lineId } = useLocalSearchParams<{ lineId: string }>();
  const { job, draft } = useEstimate();
  const line = draft.lines.find((l) => l.id === lineId);

  return (
    <EstimatePage title={t('estimate.lineTitle')} footer={<Button label={t('estimate.done')} big onPress={() => router.back()} />}>
      {line ? <Card style={{ gap: 12 }}><EstimateLineEditor jobId={job.id} line={line} /></Card> : null}
    </EstimatePage>
  );
}

/** Waits for the record to load (a link or refresh can arrive first) instead of crashing. */
export default function EstimateLinePageRoute() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  return <RecordGate found={() => hasJob(jobId)}><EstimateLinePage /></RecordGate>;
}
