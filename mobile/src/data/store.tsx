import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';

import type { Cents, TaxRule } from '@/lib/money';
import { copyDocument, estimateReady, needsActualHours, receiptShares } from '@/lib/billing';

import * as dbApi from './db';
import * as sample from './sample';
import { TODAY, business, customers, initialAssignments, initialEstimates, invoices, jobs, priceList, timeEntries } from './sample';
import type { TradeId } from './trades';
import type { Assignment, Customer, EstimateDraft, EstimateLine, Invoice, InvoiceBilling, InvoiceSnapshot, Job, PriceItem, TimeEntry } from './types';
import { changeOrderBase, hoursFor, invoiceBilling, invoiceLines, invoiceSummary, invoiceTax } from './selectors';

export type { EstimateDraft, EstimateLine };

// App state. Two modes:
//  - example: no server set up; example data in memory, gone when the app restarts.
//  - connected: signed in to Supabase; the business's own data is loaded at start and
//    changes are saved as they happen. (Saved so far: business, settings, price list,
//    customers, jobs. Estimates, hours, notes, receipts, and invoices are next.)
// Screens only use the actions below, so they work the same in both modes.

export type CaptureKind = 'photo' | 'note' | 'voice';

export interface Capture {
  id: string;
  jobId: string;
  kind: CaptureKind;
  text?: string;
  date: string;
}


/** Pricing the owner can change in Settings. */
export interface PricingSettings {
  markupBps: number;
  tax: TaxRule;
  /** Default deposit for new estimates. */
  depositBps: number;
  /** 0 = due on receipt. */
  dueDays: number;
}

/** Who the owner is and what they do, from setup. */
export interface Profile {
  businessName: string;
  phone: string;
  trades: TradeId[];
  pricing: 'hourly' | 'flat';
  rateCents: Cents;
  /** False until setup is finished (or skipped). */
  onboarded: boolean;
}

export interface SetupInput {
  businessName: string;
  phone: string;
  trades: TradeId[];
  pricing: 'hourly' | 'flat';
  rateCents: Cents;
  /** The price list the owner ended setup with. */
  priceList: PriceItem[];
}

export interface NewJobInput {
  title: string;
  address: string;
  pricing: 'hourly' | 'flat';
  rateCents?: Cents;
  workOrder?: string;
  privateNote?: string;
  /** An existing customer, or the details for a new one. */
  customer: { id: string } | { name: string; phone: string; lang: Customer['lang'] };
}

export interface State {
  assignments: Record<string, Assignment>;
  /** Receipt lines KILN couldn't read, after the owner typed what they were. */
  fixedNames: Record<string, string>;
  markupOff: Record<string, boolean>;
  timeEntries: TimeEntry[];
  acceptedSuggestions: string[];
  dismissedSuggestions: string[];
  materialsMode: Record<string, 'items' | 'total'>;
  sentInvoices: string[];
  issuedInvoices: Record<string, InvoiceSnapshot>;
  invoiceBilling: Record<string, InvoiceBilling>;
  invoiceSummaries: Record<string, string>;
  voiceConfirmed: boolean;
  signed: Record<string, { name: string; at: string }>;
  declinedChanges: string[];
  /** Estimate drafts by job id. A job without one starts empty. */
  estimates: Record<string, EstimateDraft>;
  /** Jobs where the owner chose to skip the estimate step. */
  skippedEstimates: string[];
  /** Jobs taken back from an unsent invoice draft to the Work step (the draft is kept). */
  reopenedJobs: string[];
  paidInvoices: string[];
  captures: Capture[];
  cardFee: boolean;
  settings: PricingSettings;
  profile: Profile;
  priceList: PriceItem[];
  /** Bumped when a job or customer is added, so lists re-render. */
  version: number;
  mode: 'example' | 'connected';
  businessId: string | null;
  /** Last save that failed, shown to the owner. */
  syncError: string | null;
}

function initialState(): State {
  const assignments: Record<string, Assignment> = {};
  for (const [itemId, jobIds] of Object.entries(initialAssignments)) {
    assignments[itemId] = { type: 'jobs', jobIds };
  }
  return {
    assignments,
    fixedNames: {},
    markupOff: {},
    timeEntries: [...timeEntries],
    acceptedSuggestions: [],
    dismissedSuggestions: [],
    materialsMode: {},
    sentInvoices: [],
    issuedInvoices: {},
    invoiceBilling: {},
    invoiceSummaries: {},
    voiceConfirmed: false,
    signed: {},
    declinedChanges: [],
    estimates: Object.fromEntries(Object.entries(initialEstimates).map(([id, draft]) =>
      [id, { ...copyDocument(draft), tax: draft.sent ? { ...business.tax } : undefined }])),
    skippedEstimates: [],
    reopenedJobs: [],
    paidInvoices: [],
    captures: [],
    cardFee: false,
    settings: { markupBps: business.markupBps, tax: { ...business.tax }, depositBps: business.depositBps, dueDays: business.dueDays },
    version: 0,
    // example business; setup replaces this
    profile: {
      businessName: business.name,
      phone: business.phone,
      trades: ['handyman', 'carpentry', 'painting'],
      pricing: 'flat',
      rateCents: 8500,
      onboarded: false,
    },
    priceList: priceList.map((p) => ({ ...p })),
    mode: 'example',
    businessId: null,
    syncError: null,
  };
}

/** A real account starts empty: no example jobs, receipts, or estimates. */
function clearExampleData(): void {
  for (const list of [sample.jobs, sample.customers, sample.receipts, sample.timeline, sample.invoices, sample.changeOrders, sample.customerEstimates]) {
    list.length = 0;
  }
}

function connectedState(base: State): State {
  return {
    ...base,
    assignments: {},
    fixedNames: {},
    markupOff: {},
    timeEntries: [],
    acceptedSuggestions: [],
    dismissedSuggestions: [],
    materialsMode: {},
    sentInvoices: [],
    issuedInvoices: {},
    invoiceBilling: {},
    invoiceSummaries: {},
    voiceConfirmed: false,
    signed: {},
    declinedChanges: [],
    estimates: {},
    skippedEstimates: [],
    reopenedJobs: [],
    paidInvoices: [],
    captures: [],
    mode: 'connected',
    syncError: null,
  };
}

/** A new, empty estimate draft using the owner's default deposit. */
export function emptyDraft(s: State): EstimateDraft {
  return { lines: [], depositOn: true, depositBps: s.settings.depositBps, sent: false, signed: false };
}

function withDraft(s: State, jobId: string, fn: (d: EstimateDraft) => EstimateDraft): State {
  if (s.estimates[jobId]?.sent || invoices.some((invoice) => invoice.jobId === jobId && s.sentInvoices.includes(invoice.id))) return s;
  return { ...s, estimates: { ...s.estimates, [jobId]: fn(s.estimates[jobId] ?? emptyDraft(s)) } };
}

const newId = (prefix: string) => `${prefix}-${dbApi.newUuid()}`;

// ---------- the state lives outside React so actions can read the latest value ----------

let current: State = initialState();
const listeners = new Set<() => void>();
function set(fn: (s: State) => State): void {
  current = fn(current);
  listeners.forEach((l) => l());
}
const get = (): State => current;
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

// saves run one at a time, in order, so a quick off-then-on can't reach the server backwards
let saveQueue: Promise<void> = Promise.resolve();

/** Save to the server in connected mode. A failed save is shown to the owner, never dropped silently. */
function persist(task: (businessId: string) => Promise<void>): void {
  const { mode, businessId } = get();
  if (mode !== 'connected' || !businessId) return;
  saveQueue = saveQueue
    .then(() => task(businessId))
    .catch((e: unknown) => set((x) => ({ ...x, syncError: e instanceof Error ? e.message : String(e) })));
}

/** Puts a business loaded from the server in place of whatever was showing. */
function applyLoaded(loaded: dbApi.Loaded): void {
  clearExampleData();
  sample.customers.push(...loaded.customers);
  sample.jobs.push(...loaded.jobs);
  set((s) => ({
    ...connectedState(s),
    businessId: loaded.businessId,
    profile: loaded.profile,
    settings: loaded.settings,
    cardFee: loaded.cardFee,
    priceList: loaded.priceList,
    version: s.version + 1,
  }));
}

function makeActions() {
  return {
    assign(itemId: string, assignment: Assignment) {
      if (assignment.type === 'jobs') receiptShares(0, assignment);
      set((s) => ({ ...s, assignments: { ...s.assignments, [itemId]: assignment } }));
    },
    resetReceipt(itemIds: string[]) {
      set((s) => {
        const assignments = { ...s.assignments };
        const fixedNames = { ...s.fixedNames };
        for (const id of itemIds) {
          if (!initialAssignments[id]) delete assignments[id];
          delete fixedNames[id];
        }
        return { ...s, assignments, fixedNames };
      });
    },
    fixItem(itemId: string, name: string) {
      set((s) => ({ ...s, fixedNames: { ...s.fixedNames, [itemId]: name } }));
    },
    toggleMarkup(itemId: string) {
      set((s) => ({ ...s, markupOff: { ...s.markupOff, [itemId]: !s.markupOff[itemId] } }));
    },
    logHours(jobId: string, hundredths: number, note: string) {
      set((s) => ({
        ...s,
        timeEntries: [...s.timeEntries, { id: newId('t'), jobId, date: TODAY, hundredths, note }],
      }));
    },
    acceptSuggestion(id: string) {
      set((s) => ({ ...s, acceptedSuggestions: [...s.acceptedSuggestions, id] }));
    },
    dismissSuggestion(id: string) {
      set((s) => ({ ...s, dismissedSuggestions: [...s.dismissedSuggestions, id] }));
    },
    setMaterialsMode(invoiceId: string, mode: 'items' | 'total') {
      if (get().issuedInvoices[invoiceId]) return;
      set((s) => ({ ...s, materialsMode: { ...s.materialsMode, [invoiceId]: mode } }));
    },
    sendInvoice(invoiceId: string) {
      const s = get();
      const invoice = invoices.find((i) => i.id === invoiceId);
      if (!invoice || s.sentInvoices.includes(invoiceId) || !invoiceBilling(s, invoice).reviewed) return;
      if (sample.changeOrders.some((change) => change.jobId === invoice.jobId && !s.signed[change.id] && !s.declinedChanges.includes(change.id))) return;
      const job = jobs.find((j) => j.id === invoice.jobId)!;
      if (needsActualHours(job, s.estimates[job.id], invoiceBilling(s, invoice), hoursFor(s, job.id))) return;
      const lines = invoiceLines(s, invoice);
      if (lines.length === 0) return;
      const snapshot: InvoiceSnapshot = copyDocument({ lines, tax: invoiceTax(s, invoice), summary: invoiceSummary(s, invoice),
        scope: s.estimates[job.id]?.scope, excludedScope: s.estimates[job.id]?.lines.filter((l) => l.excluded).map((l) => l.description),
        materialsMode: s.materialsMode[invoiceId] ?? 'items', dueDays: s.settings.dueDays,
        issuedOn: TODAY, address: job.address, workOrder: job.workOrder });
      set((x) => ({ ...x, issuedInvoices: { ...x.issuedInvoices, [invoiceId]: snapshot }, sentInvoices: [...x.sentInvoices, invoiceId] }));
    },
    setInvoiceBilling(invoiceId: string, patch: Partial<InvoiceBilling>) {
      const s = get();
      const invoice = invoices.find((i) => i.id === invoiceId);
      if (!invoice || s.issuedInvoices[invoiceId]) return;
      set((x) => ({ ...x, invoiceBilling: { ...x.invoiceBilling, [invoiceId]: { ...invoiceBilling(x, invoice), ...patch } } }));
    },
    setInvoiceSummary(invoiceId: string, summary: string) {
      if (get().issuedInvoices[invoiceId]) return;
      set((s) => ({ ...s, invoiceSummaries: { ...s.invoiceSummaries, [invoiceId]: summary } }));
    },
    sendEstimate(jobId: string) {
      const s = get();
      const draft = s.estimates[jobId];
      if (!draft || draft.sent || !estimateReady(draft) ||
        invoices.some((invoice) => invoice.jobId === jobId && s.sentInvoices.includes(invoice.id))) return;
      const issued = copyDocument({ ...draft, sent: true, tax: s.settings.tax });
      set((x) => ({ ...x, estimates: { ...x.estimates, [jobId]: issued } }));
    },
    confirmVoice() {
      set((s) => ({ ...s, voiceConfirmed: true }));
    },
    sign(changeOrderId: string, name: string) {
      const co = sample.changeOrders.find((change) => change.id === changeOrderId);
      if (!co || !name.trim() || get().signed[changeOrderId] || get().declinedChanges.includes(changeOrderId) ||
        sample.invoices.some((invoice) => invoice.jobId === co.jobId && get().sentInvoices.includes(invoice.id))) return;
      set((s) => ({ ...s, signed: { ...s.signed, [changeOrderId]: { name, at: new Date().toISOString() } } }));
    },
    declineChange(changeOrderId: string) {
      if (get().signed[changeOrderId] || get().declinedChanges.includes(changeOrderId)) return;
      set((s) => ({ ...s, declinedChanges: [...s.declinedChanges, changeOrderId] }));
    },
    updateEstimate(jobId: string, patch: Partial<EstimateDraft>) {
      set((s) => withDraft(s, jobId, (d) => ({ ...d, ...patch })));
    },
    addLines(jobId: string, lines: Omit<EstimateLine, 'id'>[]) {
      set((s) => withDraft(s, jobId, (d) => ({ ...d, lines: [...d.lines, ...lines.map((l) => ({ ...l, id: newId('line') }))] })));
    },
    updateLine(jobId: string, lineId: string, patch: Partial<EstimateLine>) {
      set((s) => withDraft(s, jobId, (d) => ({ ...d, lines: d.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) })));
    },
    removeLine(jobId: string, lineId: string) {
      set((s) => withDraft(s, jobId, (d) => ({ ...d, lines: d.lines.filter((l) => l.id !== lineId) })));
    },
    addCapture(jobId: string, kind: CaptureKind, text?: string) {
      set((s) => ({ ...s, captures: [...s.captures, { id: newId('c'), jobId, kind, text, date: TODAY }] }));
    },
    skipEstimate(jobId: string) {
      set((s) => (s.skippedEstimates.includes(jobId) ? s : { ...s, skippedEstimates: [...s.skippedEstimates, jobId] }));
    },
    /** Undo "Skip estimate" (the job screen only offers it before anything is signed or invoiced). */
    unskipEstimate(jobId: string) {
      set((s) => ({ ...s, skippedEstimates: s.skippedEstimates.filter((id) => id !== jobId) }));
    },
    /**
     * Back to the Work step from an invoice draft that hasn't been sent, to add hours, photos,
     * or receipts. The draft is kept; its lines always come from the job, so they update.
     */
    reopenWork(jobId: string) {
      set((s) => (s.reopenedJobs.includes(jobId) ? s : { ...s, reopenedJobs: [...s.reopenedJobs, jobId] }));
    },
    /** The customer signed the estimate (example build: from the customer page preview). */
    signEstimate(jobId: string) {
      const draft = get().estimates[jobId];
      if (!draft?.sent || draft.signed || !estimateReady(draft)) return;
      set((s) => ({ ...s, estimates: { ...s.estimates, [jobId]: { ...draft, signed: true } } }));
    },
    createChangeOrder(jobId: string, description: string, amountCents: number): string | null {
      const s = get();
      const job = jobs.find((j) => j.id === jobId);
      if (!job || !description.trim() || description.length > 2000 || !Number.isSafeInteger(amountCents) || amountCents < 0 ||
        sample.invoices.some((i) => i.jobId === jobId && s.sentInvoices.includes(i.id))) return null;
      const changes = sample.changeOrders.filter((c) => c.jobId === jobId);
      // Resolve outstanding changes before proposing another revised total.
      if (changes.some((c) => !s.signed[c.id] && !s.declinedChanges.includes(c.id))) return null;
      const id = newId('co');
      sample.changeOrders.push({ id, jobId, number: Math.max(0, ...changes.map((c) => c.number)) + 1,
        description: description.trim(), amountCents, baseCents: changeOrderBase(s, job) });
      set((x) => ({ ...x, version: x.version + 1 }));
      return id;
    },
    /**
     * "Job done": makes the invoice draft for a job (or returns the one it has).
     * The invoice's lines come from the job at the moment you look at it: signed
     * estimate, signed change orders, hours, and sorted receipt items.
     */
    finishJob(jobId: string): string {
      // done again after going back to work: same draft, now with the new hours and receipts
      set((s) => (s.reopenedJobs.includes(jobId) ? { ...s, reopenedJobs: s.reopenedJobs.filter((id) => id !== jobId) } : s));
      const existing = invoices.find((i) => i.jobId === jobId);
      if (existing) return existing.id;
      const job = jobs.find((j) => j.id === jobId);
      const invoice: Invoice = {
        id: newId('inv'),
        number: String(1043 + invoices.length),
        jobId,
        laborDescription: job?.title ?? '',
        fees: [],
        summary: get().estimates[jobId]?.scope?.notes ?? job?.title ?? '',
      };
      invoices.push(invoice);
      set((s) => ({ ...s, version: s.version + 1 }));
      return invoice.id;
    },
    markPaid(invoiceId: string) {
      set((s) => (s.paidInvoices.includes(invoiceId) ? s : { ...s, paidInvoices: [...s.paidInvoices, invoiceId] }));
    },
    updateSettings(patch: Partial<PricingSettings>) {
      set((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
      persist((bid) => dbApi.saveSettings(bid, get().settings, get().cardFee));
    },
    /**
     * Adds a job (and a new customer if needed) and returns the job id.
     * Example build only: new jobs go into the in-memory example lists, so every
     * screen sees them; they're gone after the app restarts. Supabase replaces this.
     */
    addJob(input: NewJobInput): string {
      let customerId: string;
      let newCustomer: Customer | null = null;
      if ('id' in input.customer) {
        customerId = input.customer.id;
      } else {
        const name = input.customer.name.trim();
        customerId = get().mode === 'connected' ? dbApi.newUuid() : newId('cust');
        newCustomer = { id: customerId, name, firstName: name.split(' ')[0], phone: input.customer.phone.trim(), lang: input.customer.lang };
        customers.push(newCustomer);
      }
      const job: Job = {
        id: get().mode === 'connected' ? dbApi.newUuid() : newId('job'),
        title: input.title.trim(),
        customerId,
        address: input.address.trim(),
        pricing: input.pricing,
        rateCents: input.pricing === 'hourly' ? input.rateCents : undefined,
        group: 'active',
        baseStatus: 'live',
        workOrder: input.workOrder?.trim() || undefined,
        privateNote: input.privateNote?.trim() || undefined,
      };
      jobs.unshift(job);
      set((s) => ({ ...s, version: s.version + 1 }));
      // a new customer is saved first, then the job that points at it
      persist(async (bid) => {
        if (newCustomer) await dbApi.insertCustomer(bid, newCustomer);
        await dbApi.insertJob(bid, job);
      });
      return job.id;
    },
    async completeSetup(input: SetupInput): Promise<void> {
      if (get().mode === 'connected') {
        await dbApi.createBusiness(input);
        const loaded = await dbApi.loadAll();
        if (!loaded) throw new Error('Setup was saved but could not be loaded');
        applyLoaded(loaded);
        return;
      }
      set((s) => ({
        ...s,
        profile: { businessName: input.businessName.trim() || s.profile.businessName, phone: input.phone.trim(), trades: input.trades, pricing: input.pricing, rateCents: input.rateCents, onboarded: true },
        priceList: input.priceList,
      }));
    },
    /** Keep the example business and go straight to the app. */
    skipSetup() {
      set((s) => ({ ...s, profile: { ...s.profile, onboarded: true } }));
    },
    redoSetup() {
      set((s) => ({ ...s, profile: { ...s.profile, onboarded: false } }));
    },
    setPrice(itemId: string, cents: Cents | null) {
      set((s) => ({ ...s, priceList: s.priceList.map((p) => (p.id === itemId ? { ...p, unitCents: cents } : p)) }));
      const item = get().priceList.find((p) => p.id === itemId);
      if (item) persist((bid) => dbApi.savePrice(bid, item));
    },
    /**
     * Changes the work the owner does. New trades bring their starter items (no prices);
     * a trade that's turned off takes away the items only it used. The owner's own items stay.
     */
    setTrades(trades: TradeId[], newItems: PriceItem[], removedItemIds: string[] = []) {
      set((s) => ({
        ...s,
        profile: { ...s.profile, trades },
        priceList: [...s.priceList.filter((i) => !removedItemIds.includes(i.id)), ...newItems],
      }));
      persist((bid) => dbApi.saveTrades(bid, trades, newItems, removedItemIds));
    },
    setCardFee(on: boolean) {
      set((s) => ({ ...s, cardFee: on }));
      persist((bid) => dbApi.saveSettings(bid, get().settings, on));
    },
    clearSyncError() {
      set((s) => ({ ...s, syncError: null }));
    },

    // ---------- connected mode ----------

    /** Signed in: show this account's data only (none yet until it loads). */
    startConnected() {
      clearExampleData();
      set((s) => ({ ...connectedState(s), businessId: null, profile: { ...s.profile, onboarded: false }, version: s.version + 1 }));
    },
    /** Puts the loaded business data in place. */
    hydrate(loaded: dbApi.Loaded) {
      applyLoaded(loaded);
    },
    signedOut() {
      clearExampleData();
      set((s) => ({ ...connectedState(s), businessId: null, profile: { ...s.profile, onboarded: false }, version: s.version + 1 }));
    },
  };
}

export type Actions = ReturnType<typeof makeActions>;

/** The one set of actions. Also used outside React (sign-in, loading). */
export const storeActions: Actions = makeActions();

const Ctx = createContext<{ state: State; actions: Actions } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, get, get);
  const value = useMemo(() => ({ state, actions: storeActions }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
