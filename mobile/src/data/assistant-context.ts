import { businessDate } from '../lib/invoice-aging.ts';

import * as sample from './sample.ts';
import {
  customerOf, estimateDraft, estimateTotals, hoursFor, invoiceForJob, invoiceTotals, itemCostWithTax, jobOverdueDays, jobStage, partsCost,
  unsortedItems, workTotal,
} from './selectors.ts';
import type { State } from './store';
import type { Unit } from './types';

export interface ChatMessage { role: 'owner' | 'kiln'; text: string }

export interface AssistantInput {
  lang: 'en' | 'es';
  messages: ChatMessage[];
  today: string;
  focusJobId: string | null;
  jobs: {
    id: string; title: string; customer: string; address: string;
    stage: 'estimate' | 'work' | 'invoice' | 'paid'; pricing: 'hourly' | 'flat';
    rateCents: number | null; hours: number; workCents: number; receiptCents: number;
    estimate: { totalCents: number; depositCents: number; sent: boolean; signed: boolean } | null;
    invoice: { number: string; totalCents: number; dueCents: number; sent: boolean; paid: boolean; overdueDays: number } | null;
  }[];
  inbox: { id: string; name: string; store: string; costCents: number }[];
  items: { id: string; name: string; unit: Unit }[];
}

/**
 * What the KILN chat may know: the business's jobs, money and Inbox, as plain numbers.
 * Never sent: customer phone numbers, emails, private job notes, photos or signatures.
 * Only the last 16 messages go, so a long chat can't grow without limit.
 */
export function assistantInput(state: State, lang: 'en' | 'es', messages: ChatMessage[], focusJobId: string | null): AssistantInput {
  // active jobs first, then the most recent finished ones
  const jobs = [...sample.jobs].sort((a, b) => Number(b.group === 'active') - Number(a.group === 'active')).slice(0, 150);
  return {
    lang,
    messages: messages.slice(-16).map((m) => ({ role: m.role, text: m.text.slice(0, 2000) })),
    today: businessDate(state.mode, sample.TODAY),
    focusJobId: focusJobId && jobs.some((j) => j.id === focusJobId) ? focusJobId : null,
    jobs: jobs.map((job) => {
      const invoice = invoiceForJob(job.id);
      const draft = state.estimates[job.id];
      const est = draft?.lines.length ? estimateTotals(state, job.id) : null;
      const totals = invoice ? invoiceTotals(state, invoice) : null;
      return {
        id: job.id, title: job.title.slice(0, 200), customer: customerOf(job).name.slice(0, 120), address: job.address.slice(0, 300),
        stage: jobStage(state, job).stage, pricing: job.pricing, rateCents: job.rateCents ?? null,
        hours: hoursFor(state, job.id) / 100, workCents: workTotal(state, job.id), receiptCents: partsCost(state, job.id),
        estimate: est ? { totalCents: est.total, depositCents: est.deposit, sent: !!estimateDraft(state, job.id).sent, signed: !!draft?.signed } : null,
        invoice: invoice && totals ? { number: invoice.number.slice(0, 20), totalCents: totals.total, dueCents: totals.due,
          sent: state.sentInvoices.includes(invoice.id), paid: state.paidInvoices.includes(invoice.id), overdueDays: jobOverdueDays(state, job) } : null,
      };
    }),
    inbox: sample.receipts.flatMap((r) => unsortedItems(state, r).map((i) => ({ id: i.id, name: (state.fixedNames[i.id] ?? i.name).slice(0, 160),
      store: r.store.slice(0, 120), costCents: itemCostWithTax(i) }))).slice(0, 100),
    items: state.priceList.slice(0, 400).map((i) => ({ id: i.id, name: i.name.slice(0, 160), unit: i.unit })),
  };
}

/**
 * A crew member's chat: their assigned jobs and the price items they may use, with no money at all.
 * The server applies the same limits from the database whatever the app sends (ai_chat_scope).
 */
export function crewAssistantInput(lang: 'en' | 'es', messages: ChatMessage[], focusJobId: string | null,
  jobs: { id: string; title: string; address: string; customer_name: string; is_open: boolean }[],
  items: { id: string; name: string; unit: Unit; priced: boolean }[]): AssistantInput {
  return {
    lang,
    messages: messages.slice(-16).map((m) => ({ role: m.role, text: m.text.slice(0, 2000) })),
    today: businessDate('connected', sample.TODAY),
    focusJobId: focusJobId && jobs.some((j) => j.id === focusJobId) ? focusJobId : null,
    jobs: jobs.filter((j) => j.is_open).slice(0, 150).map((j) => ({
      id: j.id, title: j.title.slice(0, 200), customer: j.customer_name.slice(0, 120), address: j.address.slice(0, 300),
      stage: 'work' as const, pricing: 'flat' as const, rateCents: null, hours: 0, workCents: 0, receiptCents: 0, estimate: null, invoice: null,
    })),
    inbox: [],
    items: items.filter((i) => i.priced).slice(0, 400).map((i) => ({ id: i.id, name: i.name.slice(0, 160), unit: i.unit })),
  };
}
