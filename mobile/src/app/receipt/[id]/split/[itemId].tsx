import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { RecordGate } from '@/components/record-gate';
import { Button, Card, Checkbox, Field, Hair, Notice, PageHeader, Row, Screen, Segmented, T } from '@/components/ui';
import { hasReceipt, itemCostWithTax, openJobs, receiptById } from '@/data/selectors';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';
import { splitByWeights } from '@/lib/money';

/** Split one receipt item across jobs, evenly or by quantity, to the cent. */
function SplitItem() {
  const { t } = useLang();
  const f = useFormat();
  const { state, actions } = useStore();
  const { id, itemId } = useLocalSearchParams<{ id: string; itemId: string }>();
  const receipt = receiptById(id);
  const item = receipt.items.find((i) => i.id === itemId);
  const activeJobs = openJobs(state);

  const [splitJobs, setSplitJobs] = useState<string[]>([]);
  const [splitMode, setSplitMode] = useState<'equal' | 'quantity'>('equal');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const weights = splitJobs.map((jobId) => {
    const text = quantities[jobId] ?? '1';
    return /^\d{1,6}([.,]\d{1,2})?$/.test(text) ? Math.round(Number(text.replace(',', '.')) * 100) : 0;
  });
  const validSplit = splitMode === 'equal' || weights.every((weight) => weight > 0);
  const splitShares = item && splitJobs.length > 0 && validSplit
    ? splitByWeights(itemCostWithTax(item), splitMode === 'equal' ? splitJobs.map(() => 1) : weights) : [];
  // already sorted (or gone): nothing to split here
  const open = item && !state.assignments[item.id];

  return (
    <Screen
      header={<PageHeader title={t('receipt.splitTitle')} sub={item ? `${state.fixedNames[item.id] ?? item.name} · ${f.money(itemCostWithTax(item))}` : undefined} back={() => router.back()} />}
      footer={open ? (
        <Button
          label={t('review.splitSave')}
          big
          disabled={splitJobs.length < 2 || !validSplit}
          onPress={() => {
            if (!item) return;
            actions.assign(item.id, { type: 'jobs', jobIds: splitJobs, weights: splitMode === 'quantity' ? weights : undefined });
            router.back();
          }}
        />
      ) : undefined}>
      {!open ? <Notice text={t('common.notFound')} tone="soft" /> : (
        <>
          <T v="body" muted>{t('review.splitHelp')}</T>
          <Segmented label={t('review.splitMode')} value={splitMode}
            options={[{ key: 'equal', label: t('review.equal') }, { key: 'quantity', label: t('review.quantities') }]}
            onChange={setSplitMode} />
          <Card style={{ gap: 4 }}>
            {activeJobs.map((job, i) => {
              const on = splitJobs.includes(job.id);
              const share = on ? splitShares[splitJobs.indexOf(job.id)] : undefined;
              return (
                <View key={job.id} style={{ gap: 8, paddingBottom: on && splitMode === 'quantity' ? 8 : 0 }}>
                  {i ? <Hair /> : null}
                  <Row style={{ justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Checkbox label={job.title} value={on} onChange={(v) => setSplitJobs(v ? [...splitJobs, job.id] : splitJobs.filter((j) => j !== job.id))} />
                    </View>
                    {share !== undefined ? <T v="money">{f.money(share)}</T> : null}
                  </Row>
                  {on && splitMode === 'quantity' ? <Field label={`${t('review.weight')}: ${job.title}`}
                    keyboardType="decimal-pad" value={quantities[job.id] ?? '1'}
                    onChangeText={(value) => setQuantities({ ...quantities, [job.id]: value })} /> : null}
                </View>
              );
            })}
          </Card>
          {!validSplit ? <Notice text={t('review.splitBad')} tone="soft" /> : null}
        </>
      )}
    </Screen>
  );
}

/** Waits for the record to load (a link or refresh can arrive first) instead of crashing. */
export default function SplitItemRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecordGate found={() => hasReceipt(id)}><SplitItem /></RecordGate>;
}
