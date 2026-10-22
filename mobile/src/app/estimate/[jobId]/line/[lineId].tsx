import { router, useLocalSearchParams } from 'expo-router';

import { EstimateLineEditor } from '@/components/estimate-line-editor';
import { EstimatePage, useEstimate } from '@/components/estimate-parts';
import { Button, Card } from '@/components/ui';
import { useLang } from '@/i18n';

/** One estimate line: description, quantity, price, charge type, exclude, save to price list. */
export default function EstimateLinePage() {
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
