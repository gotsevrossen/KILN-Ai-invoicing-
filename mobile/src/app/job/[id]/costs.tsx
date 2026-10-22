import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { RecordGate } from '@/components/record-gate';
import { Card, Hair, ListRow, PageHeader, Screen, T } from '@/components/ui';
import * as sample from '@/data/sample';
import { hasJob, hoursFor, jobById, partsCost, receiptsOnJob } from '@/data/selectors';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';
import { usePalette } from '@/theme/use-palette';

function Stat({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const p = usePalette();
  return (
    <View style={{ flex: 1, gap: 2, paddingHorizontal: 12, borderRightWidth: last ? 0 : 1, borderRightColor: p.line }}>
      <T v="small" muted>{label}</T>
      <T v="money">{value}</T>
    </View>
  );
}

/** How the job is charged, the hours logged on it, and the receipts sorted to it. */
function JobCosts() {
  const { t } = useLang();
  const f = useFormat();
  const { state } = useStore();
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = jobById(id);
  const entries = state.timeEntries.filter((x) => x.jobId === job.id);
  const receipts = receiptsOnJob(state, job.id);
  const day = (iso: string) => (iso === sample.TODAY ? t('common.today') : f.date(iso));

  return (
    <Screen header={<PageHeader title={t('job.costs')} sub={job.title} back={() => router.back()} />}>
      <Card style={{ flexDirection: 'row', paddingHorizontal: 6 }}>
        <Stat label={t('job.labor')} value={job.pricing === 'hourly' && job.rateCents ? t('job.perHour', { amount: f.money(job.rateCents) }) : t('job.flat')} />
        <Stat label={t('job.hours')} value={f.qty(hoursFor(state, job.id))} />
        <Stat label={t('job.partsCost')} value={f.money(partsCost(state, job.id))} last />
      </Card>

      <T v="eyebrow" style={{ marginTop: 8 }}>{t('job.hours')}</T>
      {entries.length === 0 ? <T v="body" muted>{t('job.noHours')}</T> : (
        <Card style={{ gap: 4 }}>
          {entries.map((entry, i) => (
            <View key={entry.id}>
              {i ? <Hair /> : null}
              <ListRow icon="clock" title={entry.note || t('job.hours')} sub={day(entry.date)} right={<T v="money">{f.qty(entry.hundredths)} h</T>} />
            </View>
          ))}
        </Card>
      )}

      <T v="eyebrow" style={{ marginTop: 8 }}>{t('job.receipts')}</T>
      {receipts.length === 0 ? <T v="body" muted>{t('job.noReceipts')}</T> : (
        <Card style={{ gap: 4 }}>
          {receipts.map(({ receipt, items, cost }, i) => (
            <View key={receipt.id}>
              {i ? <Hair /> : null}
              <ListRow
                icon="file-text"
                title={t('job.receiptLine', { store: receipt.store, count: items.length })}
                sub={`${day(receipt.date)} · ${items.map((x) => state.fixedNames[x.id] ?? x.name).join(', ')}`}
                right={<T v="money">{f.money(cost)}</T>}
                onPress={() => router.push(`/receipt/${receipt.id}`)}
              />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

/** Waits for the record to load (a link or refresh can arrive first) instead of crashing. */
export default function JobCostsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecordGate found={() => hasJob(id)}><JobCosts /></RecordGate>;
}
