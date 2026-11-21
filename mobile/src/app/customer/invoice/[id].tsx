import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';

import { CustomerPage } from '@/components/customer-page';
import { InvoicePaymentChoices } from '@/components/invoice-payment-choices';
import { ProofPhotos } from '@/components/job-photos';
import { InvoiceDocument } from '@/components/invoice-document';
import { RecordGate } from '@/components/record-gate';
import * as sample from '@/data/sample';
import { customerOf, documentScope, hasInvoice, invoiceById, invoiceLines, invoiceSummary, invoiceTax, invoiceTotals, jobById, paidOnline } from '@/data/selectors';
import { loadInvoiceOptions } from '@/data/pay-page';
import { onLiveRefresh } from '@/data/live-events';
import { useStore } from '@/data/store';
import { useTFor } from '@/i18n';
import { useInvoiceAcceptance } from '@/data/use-invoice-acceptance';
import { addDays, formatters } from '@/lib/format';
import { businessDate } from '@/lib/invoice-aging';

function CustomerInvoice() {
  const { state } = useStore();
  const { id } = useLocalSearchParams<{ id: string }>();
  const invoice = invoiceById(id)!;
  const job = jobById(invoice.jobId);
  const customer = customerOf(job);
  const tc = useTFor(customer.lang);
  const fc = formatters(customer.lang);
  const connected = state.mode === 'connected';
  const businessId = state.businessId;
  const [options, setOptions] = useState<{ businessId: string; value: Awaited<ReturnType<typeof loadInvoiceOptions>> } | null>(null);
  useFocusEffect(useCallback(() => {
    if (!connected || !businessId) return;
    let active = true;
    let revision = 0;
    const refresh = () => {
      const request = ++revision;
      void loadInvoiceOptions().then((value) => { if (active && request === revision) setOptions({ businessId, value }); })
        .catch(() => { if (active && request === revision) setOptions(null); });
    };
    refresh();
    const unsubscribe = onLiveRefresh(refresh);
    return () => { active = false; unsubscribe(); };
  }, [connected, businessId]));
  const online = options?.businessId === businessId ? options?.value : undefined;
  const sent = state.sentInvoices.includes(invoice.id);
  const acceptance = useInvoiceAcceptance(invoice.id, businessId, connected && sent);

  const lines = invoiceLines(state, invoice);
  const totals = invoiceTotals(state, invoice);
  const issued = state.issuedInvoices[invoice.id];
  const issuedOn = issued?.issuedOn ?? businessDate(state.mode, sample.TODAY);
  const pending = paidOnline(state, invoice.id).pending;
  const photoIds = issued?.proofPhotoIds ?? state.invoiceProofPhotos?.[invoice.id];
  const paid = state.paidInvoices.includes(invoice.id) || (totals.total > 0 && totals.due === 0);

  // the same view the customer's link opens (components/invoice-document.tsx); only the data source differs
  return (
    // customer links last 90 days from when they're made (supabase/functions/payments)
    <CustomerPage who={customer.firstName} tc={tc} expires={fc.date(addDays(issuedOn, 90))} bare>
      <InvoiceDocument tc={tc} fc={fc} hasPhotos={state.mode === 'example' || state.photos.some((photo) => photo.jobId === job.id)}
        data={{
          business: { name: state.profile.businessName, phone: state.profile.phone, email: state.profile.email, address: state.profile.address },
          number: invoice.number, customerName: customer.name, address: issued?.address ?? job.address,
          workOrder: issued ? issued.workOrder : job.workOrder, issuedOn,
          dueDays: issued?.dueDays ?? state.invoiceDueDays?.[invoice.id] ?? state.settings.dueDays,
          linkExpires: addDays(issuedOn, 90), lines,
          itemized: (issued?.materialsMode ?? state.materialsMode[invoice.id] ?? 'items') === 'items',
          totals, tax: invoiceTax(state, invoice), due: totals.due, paid, pending,
          scope: issued ? issued.scope : documentScope(state, job),
          excludedScope: issued ? issued.excludedScope : state.estimates[job.id]?.lines.filter((l) => l.excluded).map((l) => l.description),
          summary: invoiceSummary(state, invoice),
        }}
        payment={<InvoicePaymentChoices lang={customer.lang} methods={acceptance?.alternativeMethods ?? issued?.alternativeMethods ?? state.settings.alternativeMethods ?? {}}
          wallet={!!online?.wallet} card={!!online?.card} bank={!!online?.bank} testMode={online?.testMode} canPay={totals.due > 0 && pending === 0}
          acceptance={acceptance} />}
        photos={<ProofPhotos jobId={job.id} t={tc} ids={photoIds} showLocation={sent && !!state.showLocation[invoice.id]} height={140} />} />
    </CustomerPage>
  );
}

/** Waits for the record to load (a link or refresh can arrive first) instead of crashing. */
export default function CustomerInvoiceRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecordGate found={() => hasInvoice(id)}><CustomerInvoice /></RecordGate>;
}
