import type { Href } from 'expo-router';

import * as sample from '@/data/sample';
import { changeOrdersForJob, invoiceForJob, jobStage } from '@/data/selectors';
import { useStore } from '@/data/store';
import type { ChangeOrder, Job } from '@/data/types';

export type DocStatus = 'draft' | 'sent' | 'signed' | 'skipped' | 'pending' | 'declined' | 'notSent' | 'paid';

/** The job's estimate, change orders, and invoice, each with its status and where it opens. */
export function useJobDocs(job: Job) {
  const { state } = useStore();
  const { stage } = jobStage(state, job);
  const draft = state.estimates[job.id];
  const sentEstimate = sample.customerEstimates.find((e) => e.jobId === job.id);
  const builderRoute: Href = `/estimate/${job.id}`;
  const customerEstimateRoute: Href = sentEstimate ? `/customer/estimate/${sentEstimate.id}` : `/customer/estimate/${job.id}`;

  // a draft opens in the builder; once sent or signed, it opens as the customer sees it
  let estimate: { status: DocStatus; route?: Href } | null = null;
  if (draft || sentEstimate) {
    const sent = !!draft?.sent || !!sentEstimate;
    // work only starts once it's signed (or the estimate was skipped)
    const signed = !!draft?.signed || (sent && stage !== 'estimate');
    estimate = {
      status: signed ? 'signed' : sent ? 'sent' : 'draft',
      route: draft && !draft.signed && !sentEstimate ? builderRoute : customerEstimateRoute,
    };
  } else if (state.skippedEstimates.includes(job.id)) {
    estimate = { status: 'skipped' };
  }

  const changes: { co: ChangeOrder; status: DocStatus }[] = changeOrdersForJob(job.id).map((co) => ({
    co,
    status: state.signed[co.id] ? 'signed' : state.declinedChanges.includes(co.id) ? 'declined' : 'pending',
  }));

  const invoice = invoiceForJob(job.id);
  const invoiceStatus: DocStatus | null = !invoice ? null
    : state.paidInvoices.includes(invoice.id) ? 'paid' : state.sentInvoices.includes(invoice.id) ? 'sent' : 'notSent';

  return { estimate, changes, invoice, invoiceStatus, builderRoute, customerEstimateRoute };
}
