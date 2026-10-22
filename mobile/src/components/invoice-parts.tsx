import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';

import * as sample from '@/data/sample';
import { changeOrdersForJob, customerOf, hoursFor, invoiceBilling, invoiceById, invoiceLines, jobById } from '@/data/selectors';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { needsActualHours } from '@/lib/billing';
import { addDays } from '@/lib/format';

import type { Fix } from './fix-list';
import { Notice, PageHeader, Screen } from './ui';

/** The invoice the current page is about (the id in the address), and what still blocks sending. */
export function useInvoice() {
  const { t } = useLang();
  const { state } = useStore();
  const { id } = useLocalSearchParams<{ id: string }>();
  const invoice = invoiceById(id)!;
  const job = jobById(invoice.jobId);
  const sent = state.sentInvoices.includes(invoice.id);
  const billing = invoiceBilling(state, invoice);
  const issued = state.issuedInvoices[invoice.id];
  const agreed = !!state.estimates[job.id]?.signed;
  const missingHours = needsActualHours(job, state.estimates[job.id], billing, hoursFor(state, job.id));
  const pendingChange = changeOrdersForJob(job.id).find((change) => !state.signed[change.id] && !state.declinedChanges.includes(change.id));
  const lines = invoiceLines(state, invoice);
  const dueDays = issued?.dueDays ?? state.settings.dueDays;

  // the same checks the store makes before it sends
  const fixes: Fix[] = sent ? [] : [
    ...(lines.length === 0 ? [{ key: 'empty', text: t('review.emptyInvoice') }] : []),
    ...(agreed && !billing.reviewed ? [{ key: 'billing', text: t('review.billBasis'), onPress: () => router.push(`/invoice/${invoice.id}/billing`) }] : []),
    ...(missingHours ? [{ key: 'hours', text: t('review.hoursNeeded'), onPress: () => router.push(`/invoice/${invoice.id}/billing`) }] : []),
    ...(pendingChange ? [{ key: 'change', text: t('review.changeBeforeSend'), onPress: () => router.push(`/change-order/${pendingChange.id}`) }] : []),
  ];

  return {
    invoice,
    job,
    customer: customerOf(job),
    sent,
    paid: state.paidInvoices.includes(invoice.id),
    billing,
    issued,
    agreed,
    lines,
    fixes,
    mode: issued?.materialsMode ?? state.materialsMode[invoice.id] ?? 'items',
    dueDays,
    dueDate: addDays(issued?.issuedOn ?? sample.TODAY, dueDays),
  };
}

/** An invoice page below the invoice: the job in the header; changes stop once it's sent. */
export function InvoicePage({ title, footer, children, lockWhenSent }: {
  title: string; footer?: ReactNode; children: ReactNode; lockWhenSent?: boolean;
}) {
  const { t } = useLang();
  const { invoice, job, sent } = useInvoice();
  const locked = lockWhenSent && sent;
  return (
    <Screen
      header={<PageHeader title={title} sub={`${job.title} · #${invoice.number}`} back={() => router.back()} />}
      footer={locked ? undefined : footer}>
      {locked ? <Notice text={t('review.frozen')} tone="soft" /> : children}
    </Screen>
  );
}
