import { router, useLocalSearchParams } from 'expo-router';

import { InvoicePage, useInvoice } from '@/components/invoice-parts';
import { ProofPhotos } from '@/components/job-photos';
import { ScopeCard } from '@/components/job-scope';
import { RecordGate } from '@/components/record-gate';
import { Button, Card, Field, SwitchRow, T } from '@/components/ui';
import { hasInvoice, invoiceSummary } from '@/data/selectors';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';

/** Proof of work: before/after photos, the job summary, the agreed scope, and whether to show the location. */
function InvoiceProof() {
  const { t } = useLang();
  const { state, actions } = useStore();
  const { invoice, job, sent, issued } = useInvoice();

  return (
    <InvoicePage title={t('invoice.proof')} footer={<Button label={t('estimate.done')} big onPress={() => router.back()} />}>
      <ProofPhotos jobId={job.id} t={t} showLocation={!!state.showLocation[invoice.id]} />
      <Card style={{ gap: 12 }}>
        <Field label={t('invoice.summaryLabel')} value={invoiceSummary(state, invoice)} editable={!sent} maxLength={4000}
          onChangeText={(text) => actions.setInvoiceSummary(invoice.id, text)} multiline
          style={{ minHeight: 100, paddingTop: 14, textAlignVertical: 'top', fontSize: 16 }} />
        <SwitchRow label={t('invoice.showLocation')} value={!!state.showLocation[invoice.id]}
          onChange={(on) => actions.setShowLocation(invoice.id, on)} />
        <T v="small" muted>{t('photos.proofHelp')}</T>
      </Card>
      <ScopeCard scope={issued ? issued.scope : state.estimates[job.id]?.scope}
        excluded={issued ? issued.excludedScope : state.estimates[job.id]?.lines.filter((l) => l.excluded).map((l) => l.description)} t={t} />
    </InvoicePage>
  );
}

/** Waits for the record to load (a link or refresh can arrive first) instead of crashing. */
export default function InvoiceProofRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecordGate found={() => hasInvoice(id)}><InvoiceProof /></RecordGate>;
}
