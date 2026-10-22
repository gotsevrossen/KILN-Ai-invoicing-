import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { useJobDocs, type DocStatus } from '@/components/job-docs';
import { RecordGate } from '@/components/record-gate';
import { Card, Hair, ListRow, Notice, PageHeader, Screen } from '@/components/ui';
import { hasJob, invoiceTotals, jobById } from '@/data/selectors';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';

/** The job's estimate, change orders, and invoice in one list. */
function JobDocuments() {
  const { t } = useLang();
  const f = useFormat();
  const { state } = useStore();
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = jobById(id);
  const { estimate, changes, invoice, invoiceStatus } = useJobDocs(job);
  const status = (x: DocStatus) => t(`job.docStatus.${x}`);

  const rows = [
    estimate ? (
      <ListRow key="estimate" icon="clipboard" title={t('job.estimate')} sub={status(estimate.status)}
        onPress={estimate.route ? () => router.push(estimate.route!) : undefined} />
    ) : null,
    ...changes.map(({ co, status: x }) => (
      <ListRow key={co.id} icon="edit-3" iconTone={x === 'pending' ? 'flag' : 'soft'} title={`${t('job.changeOrder')} #${co.number}`}
        sub={`${status(x)} · ${f.money(co.amountCents)}`} onPress={() => router.push(`/change-order/${co.id}`)} />
    )),
    invoice && invoiceStatus ? (
      <ListRow key="invoice" icon="file" title={`${t('flow.invoice')} #${invoice.number}`}
        sub={`${status(invoiceStatus)} · ${f.money(invoiceTotals(state, invoice).total)}`} onPress={() => router.push(`/invoice/${invoice.id}`)} />
    ) : null,
  ].filter(Boolean);

  return (
    <Screen header={<PageHeader title={t('job.documents')} sub={job.title} back={() => router.back()} />}>
      {rows.length === 0 ? <Notice text={t('job.noDocuments')} icon="folder" tone="soft" /> : (
        <Card style={{ gap: 4 }}>
          {rows.map((row, i) => (
            <View key={i}>
              {i ? <Hair /> : null}
              {row}
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

/** Waits for the record to load (a link or refresh can arrive first) instead of crashing. */
export default function JobDocumentsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecordGate found={() => hasJob(id)}><JobDocuments /></RecordGate>;
}
