import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import { errorDetails, type ErrorDetails } from '@/lib/user-errors';
import type { Cents, TaxRule } from '@/lib/money';
import { SaveQueue } from '@/lib/save-queue';
import { OfflineJournal } from '@/lib/offline-journal';
import { command, executeCommand, type OfflineCommand } from './offline-commands';
import { copyDocument, estimateReady, needsActualHours, receiptShares, workItemValid } from '@/lib/billing';
import { businessDate } from '@/lib/invoice-aging';
import type { NewPhoto } from '@/lib/job-photos';
import { defaultTag } from '@/lib/photo-facts';
import { withReceiptReview } from '@/lib/receipt-policy';
import { removeFromPhone, stillOnPhone } from '@/lib/photo-file';

import { AiFailed, aiReady, guessTags, reviewReceipt } from './ai';
import * as dbApi from './db';
import * as docsApi from './db-docs';
import * as payApi from './db-pay';
import * as photosApi from './db-photos';
import * as sample from './sample';
import { business, customers, initialAssignments, initialEstimates, invoices, jobs, priceList, timeEntries } from './sample';
import type { TradeId } from './trades';
import type { Assignment, ChangeOrder, Customer, EstimateDraft, EstimateLine, Invoice, InvoiceBilling, InvoiceSnapshot, Job, Photo, PhotoTag, PriceItem, Receipt, TimeEntry, Unit, WorkItem } from './types';
import { canDeleteJob, canDeleteReceipt, changeOrderBase, hoursFor, invoiceBilling, invoiceLines, invoiceSummary, invoiceTax, invoiceTotals, jobStage, paidOnline, receiptsOnJob, workLocked } from './selectors';

export type { EstimateDraft, EstimateLine };

// App state. Two modes:
//  - example: no server set up; example data in memory, gone when the app restarts.
//  - connected: signed in to Supabase; the business's own data is loaded at start and
//    changes are saved as they happen: business, settings, price list, customers, jobs,
//    hours, notes, work done, estimates, change orders, typed-in receipts and their sorting,
//    and invoices. (Photos and
//    voice notes wait for the camera and microphone; until then they stay on screen only.)
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

/** A receipt typed in by hand. Each item is its price before tax. */
export interface NewReceiptInput {
  store: string;
  number: string;
  date: string;
  taxCents: Cents;
  items: { name: string; costCents: Cents }[];
}

export interface State {
  assignments: Record<string, Assignment>;
  /** Receipt lines KILN couldn't read, after the owner typed what they were. */
  fixedNames: Record<string, string>;
  markupOff: Record<string, boolean>;
  timeEntries: TimeEntry[];
  /** Work done, typed in on each job. */
  workItems: WorkItem[];
  acceptedSuggestions: string[];
  dismissedSuggestions: string[];
  materialsMode: Record<string, 'items' | 'total'>;
  /** Invoices that show the job location to the customer (proof of work). Off unless the owner turns it on. */
  showLocation: Record<string, boolean>;
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
  /** Payments saved on the server: cash marked by the owner, and Apple Pay, Google Pay, and bank payments from Stripe. */
  payments: payApi.PaymentRecord[];
  /** When the customer first opened each invoice's link (invoice id -> time). */
  opened: Record<string, string>;
  /** What the owner's Stripe account can take. */
  online: payApi.OnlinePay;
  captures: Capture[];
  /** Job photos: saved ones, and ones on this phone waiting for signal to upload. */
  photos: Photo[];
  cardFee: boolean;
  /** KILN writes the customer's job description from the job and its lines. Off until turned on. */
  aiScope: boolean;
  settings: PricingSettings;
  profile: Profile;
  priceList: PriceItem[];
  /** Bumped when a job or customer is added, so lists re-render. */
  version: number;
  mode: 'example' | 'connected';
  businessId: string | null;
  /** Last save that failed, shown to the owner. */
  syncError: ErrorDetails | null;
  /** A local save is separate from confirmation by the server. */
  localSave: 'confirmed' | 'waiting' | 'failed';
  pendingSaves: number;
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
    workItems: [],
    acceptedSuggestions: [],
    dismissedSuggestions: [],
    materialsMode: {},
    showLocation: {},
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
    payments: [],
    opened: {},
    online: { connected: false, walletReady: false, bankReady: false },
    captures: [],
    photos: [],
    cardFee: false,
    aiScope: false,
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
    localSave: 'confirmed',
    pendingSaves: 0,
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
    workItems: [],
    acceptedSuggestions: [],
    dismissedSuggestions: [],
    materialsMode: {},
    showLocation: {},
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
    payments: [],
    opened: {},
    online: { connected: false, walletReady: false, bankReady: false },
    captures: [],
    photos: [],
    profile: { businessName: '', phone: '', trades: [], pricing: 'flat', rateCents: 0, onboarded: false },
    settings: { markupBps: business.markupBps, tax: { ...business.tax }, depositBps: business.depositBps, dueDays: business.dueDays },
    // the example business's prices never carry into a real account
    priceList: [],
    mode: 'connected',
    syncError: null,
    localSave: 'confirmed',
    pendingSaves: 0,
  };
}

/** A new, empty estimate draft using the owner's default deposit. */
export function emptyDraft(s: State): EstimateDraft {
  return { number: `E-${1001 + Object.keys(s.estimates).length}`, lines: [], depositOn: true, depositBps: s.settings.depositBps, sent: false, signed: false };
}

function withDraft(s: State, jobId: string, fn: (d: EstimateDraft) => EstimateDraft): State {
  if (s.estimates[jobId]?.sent || invoices.some((invoice) => invoice.jobId === jobId && s.sentInvoices.includes(invoice.id))) return s;
  return { ...s, estimates: { ...s.estimates, [jobId]: fn(s.estimates[jobId] ?? emptyDraft(s)) } };
}

/** Ids are made on the phone (they work offline) and are the database ids too. */
const newId = () => dbApi.newUuid();

// ---------- the state lives outside React so actions can read the latest value ----------

let current: State = initialState();
const listeners = new Set<() => void>();
function set(fn: (s: State) => State): void {
  const next = fn(current);
  if (next === current) return;
  current = next;
  listeners.forEach((l) => l());
}
const get = (): State => current;
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

// Saves and delayed typing belong to the account that scheduled them.
const saveQueue = new SaveQueue((error) => set((s) => ({ ...s, syncError: errorDetails(error) })));

interface LocalSnapshot {
  state: State;
  lists: {
    jobs: Job[]; customers: Customer[]; receipts: Receipt[]; invoices: Invoice[];
    changeOrders: ChangeOrder[];
  };
}
let accountId: string | null = null;
let journalReady = false;
let volatileCommands: OfflineCommand[] = [];
const journal = new OfflineJournal<LocalSnapshot, OfflineCommand>({
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
});
function localSnapshot(): LocalSnapshot {
  return { state: get(), lists: { jobs: sample.jobs, customers: sample.customers,
    receipts: sample.receipts, invoices: sample.invoices, changeOrders: sample.changeOrders } };
}
function cacheCurrent(): void {
  if (!journalReady || !get().businessId || volatileCommands.length) return;
  try { journal.save(localSnapshot()); }
  catch (error) { set((s) => ({ ...s, localSave: 'failed', syncError: errorDetails(error) })); }
}
function persist(input: OfflineCommand | OfflineCommand[]): void {
  if (get().mode !== 'connected' || !get().businessId) return;
  try {
    const commands = Array.isArray(input) ? input : [input];
    // Even a failed startup read must not drop edits made while the owner keeps
    // the app open. They stay explicitly unconfirmed until storage works again.
    volatileCommands.push(...JSON.parse(JSON.stringify(commands)) as OfflineCommand[]);
    if (!journalReady) throw new Error('offline_storage_unavailable');
    journal.append(volatileCommands.map((c) => ({ id: newId(), command: c })), localSnapshot());
    volatileCommands = [];
    set((s) => ({ ...s, localSave: 'waiting', pendingSaves: journal.pending }));
    void retryOffline().catch(() => {});
  } catch (error) {
    set((s) => ({ ...s, localSave: 'failed', pendingSaves: journal.pending + volatileCommands.length, syncError: errorDetails(error) }));
  }
}
async function retryOffline(): Promise<void> {
  if (get().mode !== 'connected' || !get().businessId) return;
  const active = saveQueue.scope();
  try {
    if (!journalReady) {
      if (!accountId) throw new Error('offline_storage_unavailable');
      // Reopen only this session's journal. Preserve edits currently shown on
      // screen; importing an older cached snapshot here would overwrite them.
      journal.resume(accountId, volatileCommands.map((c) => ({ id: newId(), command: c })), localSnapshot());
      journalReady = true;
      volatileCommands = [];
    } else if (volatileCommands.length) {
      journal.append(volatileCommands.map((c) => ({ id: newId(), command: c })), localSnapshot());
      volatileCommands = [];
    }
    await journal.flush(executeCommand, () => localSnapshot());
    if (!active()) throw Object.assign(new Error('signed_out'), { code: 'signed_out' });
    saveQueue.clearFailure();
    set((s) => ({ ...s, pendingSaves: journal.pending, localSave: journal.pending ? 'waiting' : 'confirmed', syncError: null }));
    cacheCurrent();
  } catch (error) {
    if (active()) set((s) => ({ ...s, pendingSaves: journal.pending + volatileCommands.length, localSave: !journalReady || volatileCommands.length ? 'failed' : 'waiting', syncError: errorDetails(error) }));
    throw error;
  }
}
/** Refresh only an idle, unchanged view; never overwrite an edit made while the request ran. */
async function refreshDocuments(): Promise<void> {
  if (get().mode !== 'connected' || !get().businessId) return;
  const active = saveQueue.scope();
  await retryOffline();
  const before = get();
  const loaded = await dbApi.loadAll();
  if (!active() || get() !== before || journal.pending || volatileCommands.length || !loaded) return;
  applyLoaded(loaded);
  cacheCurrent();
}
const flushSoon = (_key: string) => {};
const saveEstimateSoon = (jobId: string) => {
  const draft = get().estimates[jobId];
  if (draft) persist(command('saveEstimate', get().businessId!, jobId, draft));
};
AppState.addEventListener('change', (next) => {
  if (next !== 'active') { saveQueue.flushAll(); cacheCurrent(); }
  else if (get().mode === 'connected') {
    set((s) => ({ ...s, version: s.version + 1 }));
    void retryOffline().catch(() => {});
  }
});
if (typeof localStorage !== 'undefined') setInterval(() => {
  if (journal.pending || volatileCommands.length) void retryOffline().catch(() => {});
}, 30_000);

// ---------- job photos waiting to upload ----------
// A photo stays on the phone until it's on the server, and the list of those waiting is kept
// too, so no signal or a closed app never loses one. They're tried again when the app comes
// back and every 45 seconds while any wait. (The web version has no app folder, so a closed
// tab loses photos still waiting: see photo-file.web.ts.)

const QUEUE_KEY = 'kiln.photoQueue';

function readQueue(): Record<string, Photo[]> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(QUEUE_KEY) : null;
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed as Record<string, Photo[]> : {};
  } catch {
    return {};
  }
}

function savePhotoQueue(): void {
  const { mode, businessId, photos } = get();
  if (mode !== 'connected' || !businessId || Platform.OS === 'web') return;
  try {
    const all = readQueue();
    const waiting = photos.filter((p) => !p.path && p.localUri);
    if (waiting.length) all[businessId] = waiting;
    else delete all[businessId];
    localStorage.setItem(QUEUE_KEY, JSON.stringify(all));
  } catch {
    // no storage: photos still upload while the app is open
  }
}

/** The saved photos, plus this business's photos still waiting on this phone. */
function withQueued(businessId: string, saved: Photo[]): Photo[] {
  const waiting: Photo[] = [];
  for (const p of readQueue()[businessId] ?? []) {
    if (!p.localUri) continue;
    // it made it to the server just before the app closed: the phone's copy can go
    if (saved.some((x) => x.id === p.id)) removeFromPhone(p.localUri);
    else if (stillOnPhone(p.localUri)) waiting.push(p);
  }
  return [...saved, ...waiting];
}

let uploading = false;

/** Uploads waiting photos one at a time. One that fails (no signal) waits for the next try. */
async function flushPhotos(): Promise<void> {
  if (uploading) return;
  uploading = true;
  const active = saveQueue.scope();
  try {
    for (const { id } of get().photos.filter((p) => !p.path && p.localUri)) {
      const { mode, businessId } = get();
      if (!active() || mode !== 'connected' || !businessId) return;
      const photo = get().photos.find((p) => p.id === id);
      if (!photo || photo.path) continue;
      try {
        const path = await photosApi.uploadPhoto(businessId, photo);
        if (!active()) return;
        const now = get().photos.find((p) => p.id === id);
        if (!now) {
          // deleted while it was uploading
          persist(command('deletePhoto', id, path));
          continue;
        }
        set((x) => ({ ...x, photos: x.photos.map((p) => (p.id === id ? { ...p, path, localUri: undefined } : p)) }));
        if (photo.localUri) removeFromPhone(photo.localUri);
        // the tag changed while it was uploading
        if (now.tag !== photo.tag) persist(command('updatePhotoTag', id, now.tag));
        savePhotoQueue();
      } catch {
        // no signal, or the server said no: it stays waiting
      }
    }
  } finally {
    uploading = false;
    if (!active()) void flushPhotos();
  }
}

AppState.addEventListener('change', (next) => {
  if (next === 'active') void flushPhotos();
});
// not while the web version is drawn on the computer, which would keep it from finishing
if (typeof window !== 'undefined') {
  setInterval(() => {
    if (get().photos.some((p) => !p.path && p.localUri)) void flushPhotos();
  }, 45_000);
}

/** A photo's before / during / after. KILN's guess (byOwner false) never replaces the owner's pick. */
function changeTag(id: string, tag: PhotoTag, byOwner: boolean): void {
  const photo = get().photos.find((p) => p.id === id);
  if (!photo || photo.tag === tag || workLocked(get(), photo.jobId) || (!byOwner && photo.tagByOwner)) return;
  set((x) => ({ ...x, photos: x.photos.map((p) => (p.id === id ? { ...p, tag, tagByOwner: p.tagByOwner || byOwner } : p)) }));
  if (photo.path) persist(command('updatePhotoTag', id, tag));
  else savePhotoQueue();
}

/** Puts a business loaded from the server in place of whatever was showing. */
function applyLoaded(loaded: dbApi.Loaded): void {
  clearExampleData();
  sample.setToday(docsApi.localDate());
  sample.customers.push(...loaded.customers);
  sample.jobs.push(...loaded.jobs);
  const d = loaded.docs;
  sample.receipts.push(...d.receipts);
  sample.changeOrders.push(...d.changeOrders);
  sample.invoices.push(...d.invoices);
  set((s) => ({
    ...connectedState(s),
    timeEntries: d.timeEntries,
    workItems: d.workItems,
    photos: withQueued(loaded.businessId, loaded.photos),
    captures: d.notes.map((n) => ({ id: n.id, jobId: n.jobId, kind: 'note' as const, text: n.text, date: n.date })),
    estimates: d.estimates,
    skippedEstimates: d.skippedEstimates,
    reopenedJobs: d.reopenedJobs,
    signed: d.signed,
    declinedChanges: d.declinedChanges,
    sentInvoices: d.sentInvoices,
    paidInvoices: d.paidInvoices,
    issuedInvoices: d.issuedInvoices,
    invoiceBilling: d.invoiceBilling,
    materialsMode: d.materialsMode,
    showLocation: d.showLocation,
    assignments: d.assignments,
    fixedNames: d.fixedNames,
    markupOff: d.markupOff,
    businessId: loaded.businessId,
    profile: loaded.profile,
    settings: loaded.settings,
    cardFee: loaded.cardFee,
    aiScope: loaded.aiScope,
    priceList: loaded.priceList,
    // Loading server data cannot repair unavailable local storage. Keep the
    // durability warning until the journal is usable rather than claiming a save.
    localSave: journalReady ? (journal.pending ? 'waiting' : 'confirmed') : 'failed',
    pendingSaves: journal.pending + volatileCommands.length,
    syncError: journalReady ? null : s.syncError,
    version: s.version + 1,
  }));
  void flushPhotos();
  void refreshPay();
}

/**
 * Picks up what happened outside the app: the customer opened the link, or paid by Apple Pay,
 * Google Pay, or bank (Stripe tells the server). A paid invoice never goes back to unpaid here.
 */
async function refreshPay(): Promise<void> {
  if (get().mode !== 'connected' || !get().businessId) return;
  const active = saveQueue.scope();
  try {
    const pay = await payApi.loadPayState();
    if (!active()) return;
    set((s) => ({
      ...s,
      payments: pay.payments,
      opened: pay.opened,
      online: pay.online,
      paidInvoices: [...new Set([...s.paidInvoices, ...pay.paidInvoices])],
    }));
  } catch {
    // no signal: the next refresh tries again
  }
}

function makeActions() {
  return {
    assign(itemId: string, assignment: Assignment) {
      // a sent invoice's materials stay put, and nothing new goes onto it
      const before = get().assignments[itemId];
      if (before?.type === 'jobs' && before.jobIds.some((jobId) => workLocked(get(), jobId))) return;
      if (assignment.type === 'jobs' && assignment.jobIds.some((jobId) => workLocked(get(), jobId))) return;
      if (assignment.type === 'jobs') receiptShares(0, assignment);
      set((s) => ({ ...s, assignments: { ...s.assignments, [itemId]: assignment } }));
      persist(command('assignReceiptItem', get().businessId!, itemId, assignment));
    },
    resetReceipt(allIds: string[]) {
      const itemIds = allIds.filter((id) => {
        const a = get().assignments[id];
        return !(a?.type === 'jobs' && a.jobIds.some((jobId) => workLocked(get(), jobId)));
      });
      set((s) => {
        const assignments = { ...s.assignments };
        const fixedNames = { ...s.fixedNames };
        for (const id of itemIds) {
          if (!initialAssignments[id]) delete assignments[id];
          delete fixedNames[id];
        }
        return { ...s, assignments, fixedNames };
      });
      persist(itemIds.flatMap((id) => [command('assignReceiptItem', get().businessId!, id, null), command('updateReceiptItem', id, { fixedName: null })]));
    },
    fixItem(itemId: string, name: string) {
      set((s) => ({ ...s, fixedNames: { ...s.fixedNames, [itemId]: name } }));
      persist(command('updateReceiptItem', itemId, { fixedName: name }));
    },
    toggleMarkup(itemId: string) {
      set((s) => ({ ...s, markupOff: { ...s.markupOff, [itemId]: !s.markupOff[itemId] } }));
      persist(command('updateReceiptItem', itemId, { markupOff: !!get().markupOff[itemId] }));
    },
    logHours(jobId: string, hundredths: number, note: string) {
      if (workLocked(get(), jobId)) return;
      const entry: TimeEntry = { id: newId(), jobId, date: sample.TODAY, hundredths, note };
      set((s) => ({ ...s, timeEntries: [...s.timeEntries, entry] }));
      persist(command('insertTimeEntry', get().businessId!, entry));
    },
    /** Work done on the job, priced. Returns false if it isn't complete or the invoice was sent. */
    addWorkItem(jobId: string, input: Omit<WorkItem, 'id' | 'jobId' | 'date'>): boolean {
      const item: WorkItem = { ...input, description: input.description.trim(), id: newId(), jobId, date: sample.TODAY };
      if (!jobs.some((j) => j.id === jobId) || workLocked(get(), jobId) || !workItemValid(item)) return false;
      set((s) => ({ ...s, workItems: [...s.workItems, item] }));
      persist(command('insertWorkItem', get().businessId!, item));
      return true;
    },
    addWorkItems(jobId: string, inputs: Omit<WorkItem, 'id' | 'jobId' | 'date'>[]): boolean {
      if (!inputs.length || !jobs.some((job) => job.id === jobId) || workLocked(get(), jobId)) return false;
      const items = inputs.map((input) => ({ ...input, description: input.description.trim(), id: newId(), jobId, date: sample.TODAY }));
      if (!items.every(workItemValid)) return false;
      set((s) => ({ ...s, workItems: [...s.workItems, ...items] }));
      persist(items.map((item) => command('insertWorkItem', get().businessId!, item)));
      return true;
    },
    removeWorkItem(id: string) {
      const item = get().workItems.find((w) => w.id === id);
      if (!item || workLocked(get(), item.jobId)) return;
      set((s) => ({ ...s, workItems: s.workItems.filter((w) => w.id !== id) }));
      persist(command('deleteWorkItem', id));
    },
    /**
     * A receipt typed in by hand. With a job, every item goes to it (the owner can still
     * re-sort on the receipt page); without one, the items wait in the Inbox. Returns its id.
     */
    async addReceipt(input: NewReceiptInput, jobId: string | null): Promise<string | null> {
      // Freeze exactly what is reviewed; no receipt, expense or outbox entry exists yet.
      input = { ...input, items: input.items.map((item) => ({ ...item })) };
      const active = saveQueue.scope();
      const money = (c: number) => Number.isSafeInteger(c) && c >= 0 && c <= 100_000_000;
      const items = input.items.map((i) => ({ name: i.name.trim(), costCents: i.costCents }));
      if (!input.store.trim() || input.store.length > 120 || input.number.length > 60 || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
        !money(input.taxCents) || items.length === 0 || items.length > 200 ||
        items.some((i) => !i.name || i.name.length > 160 || !money(i.costCents)) ||
        (jobId !== null && (!jobs.some((j) => j.id === jobId) || workLocked(get(), jobId)))) return null;
      if (!aiReady(get().mode)) throw new AiFailed('signed_out');
      return withReceiptReview(() => reviewReceipt({ store: input.store, items }), items.length, () => {
        if (!active() || (jobId !== null && (!jobs.some((j) => j.id === jobId) || workLocked(get(), jobId)))) return null;
        const receipt: Receipt = {
          id: newId(), store: input.store.trim(), number: input.number.trim(), date: input.date, taxCents: input.taxCents,
          items: items.map((i, index) => ({ id: newId(), line: index + 1, name: i.name, qtyLabel: '', costCents: i.costCents, likelyJobIds: jobId ? [jobId] : [] })),
        };
        sample.receipts.unshift(receipt);
        set((s) => {
          if (!jobId) return { ...s, version: s.version + 1 };
          const assignments = { ...s.assignments };
          for (const item of receipt.items) assignments[item.id] = { type: 'jobs', jobIds: [jobId] };
          return { ...s, assignments, version: s.version + 1 };
        });
        persist(command('insertReceipt', get().businessId!, receipt, jobId));
        return receipt.id;
      });
    },
    /**
     * New photos for a job, from the camera or library. They start as before, during, or after
     * from where the job is, then KILN's guess (signed in) unless the owner changes one first.
     * False if the job's invoice was already sent.
     */
    addPhotos(jobId: string, photos: NewPhoto[]): boolean {
      const s = get();
      const job = jobs.find((j) => j.id === jobId);
      if (!job || !photos.length || workLocked(s, jobId)) return false;
      const started = s.workItems.some((w) => w.jobId === jobId) || s.timeEntries.some((e) => e.jobId === jobId) || receiptsOnJob(s, jobId).length > 0;
      const tag = defaultTag(jobStage(s, job).stage, started);
      const added: Photo[] = photos.map((n) => ({ id: n.id, jobId, tag, takenAt: n.takenAt, lat: n.lat, lng: n.lng, localUri: n.localUri }));
      set((x) => ({ ...x, photos: [...x.photos, ...added], version: x.version + 1 }));
      savePhotoQueue();
      void flushPhotos();
      const small = photos.flatMap((n) => (n.small ? [{ id: n.id, data: n.small }] : [])).slice(0, 10);
      if (aiReady(s.mode) && small.length) {
        guessTags(job.title, small.map((x) => ({ mediaType: 'image/jpeg' as const, data: x.data })))
          .then((tags) => tags.forEach((guess, i) => {
            if (guess) changeTag(small[i].id, guess, false);
          }))
          .catch(() => {});
      }
      return true;
    },
    setPhotoTag(id: string, tag: PhotoTag) {
      changeTag(id, tag, true);
    },
    /** A photo taken by mistake. False once the job's invoice was sent (it's part of the record). */
    removePhoto(id: string): boolean {
      const photo = get().photos.find((p) => p.id === id);
      if (!photo || workLocked(get(), photo.jobId)) return false;
      set((x) => ({ ...x, photos: x.photos.filter((p) => p.id !== id), version: x.version + 1 }));
      if (photo.path) persist(command('deletePhoto', id, photo.path!));
      if (photo.localUri) removeFromPhone(photo.localUri);
      savePhotoQueue();
      return true;
    },
    /** A receipt typed in with a mistake. Returns false if it's kept (see canDeleteReceipt). */
    deleteReceipt(receiptId: string): boolean {
      const receipt = sample.receipts.find((r) => r.id === receiptId);
      if (!receipt || !canDeleteReceipt(get(), receipt)) return false;
      sample.receipts.splice(sample.receipts.indexOf(receipt), 1);
      set((s) => {
        const assignments = { ...s.assignments };
        const fixedNames = { ...s.fixedNames };
        const markupOff = { ...s.markupOff };
        for (const item of receipt.items) {
          delete assignments[item.id];
          delete fixedNames[item.id];
          delete markupOff[item.id];
        }
        return { ...s, assignments, fixedNames, markupOff, version: s.version + 1 };
      });
      persist(command('deleteReceipt', receiptId));
      return true;
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
      persist(command('updateInvoice', invoiceId, { materialsMode: mode }));
    },
    setShowLocation(invoiceId: string, on: boolean) {
      if (get().issuedInvoices[invoiceId]) return;
      set((s) => ({ ...s, showLocation: { ...s.showLocation, [invoiceId]: on } }));
      persist(command('updateInvoice', invoiceId, { showLocation: on }));
    },
    async sendInvoice(invoiceId: string): Promise<void> {
      const connected = get().mode === 'connected';
      const active = saveQueue.scope();
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
        issuedOn: businessDate(s.mode, sample.TODAY), address: job.address, workOrder: job.workOrder });

      // the summary being typed is saved first; then the lines and frozen copy
      flushSoon(`summary:${invoiceId}`);
      const markSent = () => set((x) => ({ ...x, issuedInvoices: { ...x.issuedInvoices, [invoiceId]: snapshot }, sentInvoices: [...x.sentInvoices, invoiceId] }));
      if (connected) { await retryOffline(); if (!active() || get().businessId !== s.businessId) throw new Error('signed_out'); await saveQueue.commit(() => docsApi.sendInvoice(invoiceId, snapshot, !!s.showLocation[invoiceId]), markSent); cacheCurrent(); }
      else markSent();
    },
    setInvoiceBilling(invoiceId: string, patch: Partial<InvoiceBilling>) {
      const s = get();
      const invoice = invoices.find((i) => i.id === invoiceId);
      if (!invoice || s.issuedInvoices[invoiceId]) return;
      set((x) => ({ ...x, invoiceBilling: { ...x.invoiceBilling, [invoiceId]: { ...invoiceBilling(x, invoice), ...patch } } }));
      persist(command('updateInvoice', invoiceId, { billing: get().invoiceBilling[invoiceId] }));
    },
    setInvoiceSummary(invoiceId: string, summary: string) {
      if (get().issuedInvoices[invoiceId]) return;
      set((s) => ({ ...s, invoiceSummaries: { ...s.invoiceSummaries, [invoiceId]: summary } }));
      persist(command('updateInvoice', invoiceId, { summary }));
    },
    async sendEstimate(jobId: string): Promise<void> {
      const active = saveQueue.scope();
      const s = get(); const draft = s.estimates[jobId];
      if (draft?.sent) return;
      if (!draft || !estimateReady(draft) || invoices.some((i) => i.jobId === jobId && s.sentInvoices.includes(i.id))) throw new Error('Estimate is not ready');
      const issued = copyDocument({ ...draft, sent: true, tax: s.settings.tax });
      const apply = () => set((x) => ({ ...x, estimates: { ...x.estimates, [jobId]: issued } }));
      if (s.mode === 'connected') {
        await retryOffline();
        if (!active() || get().businessId !== s.businessId) throw new Error('signed_out');
        await saveQueue.commit(() => docsApi.sendEstimate(s.businessId!, jobId, s.settings.tax), apply);
        cacheCurrent();
      } else apply();
    },
    confirmVoice() {
      set((s) => ({ ...s, voiceConfirmed: true }));
    },
    async sign(changeOrderId: string, name: string, ink: [number, number][][]): Promise<void> {
      const active = saveQueue.scope();
      const s = get(); const co = sample.changeOrders.find((change) => change.id === changeOrderId);
      if (!co || name.trim().length < 2 || s.declinedChanges.includes(changeOrderId) || sample.invoices.some((i) => i.jobId === co.jobId && s.sentInvoices.includes(i.id))) throw new Error('Change cannot be accepted');
      if (s.signed[changeOrderId]) return;
      const apply = () => set((x) => ({ ...x, signed: { ...x.signed, [changeOrderId]: { name: name.trim(), at: new Date().toISOString() } } }));
      if (s.mode === 'connected') { await retryOffline(); if (!active() || get().businessId !== s.businessId) throw new Error('signed_out'); await saveQueue.commit(() => docsApi.signChangeOrder(co.id, name.trim(), ink), apply); cacheCurrent(); }
      else apply();
    },
    declineChange(changeOrderId: string) {
      if (get().signed[changeOrderId] || get().declinedChanges.includes(changeOrderId)) return;
      set((s) => ({ ...s, declinedChanges: [...s.declinedChanges, changeOrderId] }));
      persist(command('declineChangeOrder', get().businessId!, changeOrderId));
    },
    updateEstimate(jobId: string, patch: Partial<EstimateDraft>) {
      set((s) => withDraft(s, jobId, (d) => ({ ...d, ...patch })));
      saveEstimateSoon(jobId);
    },
    /** A customer description KILN drafted in the background. Kept only if the owner hasn't written one meanwhile. */
    fillScopeNotes(jobId: string, notes: string): boolean {
      if (get().estimates[jobId]?.scope?.notes?.trim()) return false;
      set((s) => withDraft(s, jobId, (d) => ({ ...d, scope: { ...d.scope, notes } })));
      saveEstimateSoon(jobId);
      return true;
    },
    addLines(jobId: string, lines: Omit<EstimateLine, 'id'>[]) {
      set((s) => withDraft(s, jobId, (d) => ({ ...d, lines: [...d.lines, ...lines.map((l) => ({ ...l, id: newId() }))] })));
      saveEstimateSoon(jobId);
    },
    updateLine(jobId: string, lineId: string, patch: Partial<EstimateLine>) {
      set((s) => withDraft(s, jobId, (d) => ({ ...d, lines: d.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) })));
      saveEstimateSoon(jobId);
    },
    removeLine(jobId: string, lineId: string) {
      set((s) => withDraft(s, jobId, (d) => ({ ...d, lines: d.lines.filter((l) => l.id !== lineId) })));
      saveEstimateSoon(jobId);
    },
    addCapture(jobId: string, kind: CaptureKind, text?: string) {
      if (workLocked(get(), jobId)) return;
      const capture: Capture = { id: newId(), jobId, kind, text, date: sample.TODAY };
      set((s) => ({ ...s, captures: [...s.captures, capture] }));
      if ((kind === 'note' || kind === 'voice') && text?.trim()) persist(command('insertNote', get().businessId!, { id: capture.id, jobId, text: text.trim() }));
    },
    skipEstimate(jobId: string) {
      set((s) => (s.skippedEstimates.includes(jobId) ? s : { ...s, skippedEstimates: [...s.skippedEstimates, jobId] }));
      persist(command('setJobFlags', jobId, { estimate_skipped: true }));
    },
    /** Undo "Skip estimate" (the job screen only offers it before anything is signed or invoiced). */
    unskipEstimate(jobId: string) {
      set((s) => ({ ...s, skippedEstimates: s.skippedEstimates.filter((id) => id !== jobId) }));
      persist(command('setJobFlags', jobId, { estimate_skipped: false }));
    },
    /**
     * Back to the Work step from an invoice draft that hasn't been sent, to add hours, photos,
     * or receipts. The draft is kept; its lines always come from the job, so they update.
     */
    reopenWork(jobId: string) {
      set((s) => (s.reopenedJobs.includes(jobId) ? s : { ...s, reopenedJobs: [...s.reopenedJobs, jobId] }));
      persist(command('setJobFlags', jobId, { reopened: true }));
    },
    /** The customer signed the estimate (for now on the owner's phone, from the customer page). */
    async signEstimate(jobId: string, signer: string, ink: [number, number][][]): Promise<void> {
      const active = saveQueue.scope();
      const s = get(); const draft = s.estimates[jobId];
      if (!draft?.sent || !estimateReady(draft) || signer.trim().length < 2) throw new Error('Estimate cannot be accepted');
      if (draft.signed) return;
      const apply = () => set((x) => ({ ...x, estimates: { ...x.estimates, [jobId]: { ...draft, signed: true } } }));
      if (s.mode === 'connected') { await retryOffline(); if (!active() || get().businessId !== s.businessId) throw new Error('signed_out'); await saveQueue.commit(() => docsApi.signEstimate(jobId, signer.trim(), ink), apply); cacheCurrent(); }
      else apply();
    },
    createChangeOrder(jobId: string, description: string, amountCents: number): string | null {
      const s = get();
      const job = jobs.find((j) => j.id === jobId);
      if (!job || !description.trim() || description.length > 2000 || !Number.isSafeInteger(amountCents) || Math.abs(amountCents) > 100_000_000 ||
        sample.invoices.some((i) => i.jobId === jobId && s.sentInvoices.includes(i.id))) return null;
      const changes = sample.changeOrders.filter((c) => c.jobId === jobId);
      // Resolve outstanding changes before proposing another revised total.
      if (changes.some((c) => !s.signed[c.id] && !s.declinedChanges.includes(c.id))) return null;
      if (changeOrderBase(s, job) + amountCents < 0) return null;
      const co: ChangeOrder = { id: newId(), jobId, number: Math.max(0, ...changes.map((c) => c.number)) + 1,
        description: description.trim(), amountCents, baseCents: changeOrderBase(s, job) };
      sample.changeOrders.push(co);
      set((x) => ({ ...x, version: x.version + 1 }));
      persist(command('insertChangeOrder', get().businessId!, co));
      return co.id;
    },
    /**
     * "Job done": makes the invoice draft for a job (or returns the one it has).
     * The invoice's lines come from the job at the moment you look at it: signed
     * estimate, signed change orders, hours, and sorted receipt items.
     */
    finishJob(jobId: string): string {
      // done again after going back to work: same draft, now with the new hours and receipts
      if (get().reopenedJobs.includes(jobId)) {
        set((s) => ({ ...s, reopenedJobs: s.reopenedJobs.filter((id) => id !== jobId) }));
        persist(command('setJobFlags', jobId, { reopened: false }));
      }
      const existing = invoices.find((i) => i.jobId === jobId);
      if (existing) return existing.id;
      const job = jobs.find((j) => j.id === jobId);
      const invoice: Invoice = {
        id: newId(),
        // a real business numbers from 1001; the example business is further along
        number: String((get().mode === 'connected' ? 1001 : 1043) + invoices.length),
        jobId,
        laborDescription: job?.title ?? '',
        fees: [],
        summary: get().estimates[jobId]?.scope?.notes ?? job?.title ?? '',
      };
      invoices.push(invoice);
      set((s) => ({ ...s, version: s.version + 1 }));
      persist(command('insertInvoice', get().businessId!, invoice));
      return invoice.id;
    },
    /**
     * Deletes a job made by accident, with its hours, work, notes, and drafts. Receipt items on it go
     * back to the inbox, or stay on the other jobs of a split. Returns false if the job is kept.
     */
    deleteJob(jobId: string): boolean {
      const s = get();
      const job = jobs.find((j) => j.id === jobId);
      if (!job || !canDeleteJob(s, job)) return false;
      const assignments = { ...s.assignments };
      const moved: [string, Assignment | null][] = [];
      for (const [itemId, a] of Object.entries(s.assignments)) {
        if (a.type !== 'jobs' || !a.jobIds.includes(jobId)) continue;
        const keep = a.jobIds.map((id, i) => ({ id, weight: a.weights?.[i] })).filter((x) => x.id !== jobId);
        const next: Assignment | null = keep.length
          ? { type: 'jobs', jobIds: keep.map((x) => x.id), weights: a.weights ? keep.map((x) => x.weight ?? 1) : undefined }
          : null;
        if (next) assignments[itemId] = next;
        else delete assignments[itemId];
        moved.push([itemId, next]);
      }
      const jobPhotos = s.photos.filter((p) => p.jobId === jobId);
      for (const p of jobPhotos) if (p.localUri) removeFromPhone(p.localUri);
      jobs.splice(jobs.indexOf(job), 1);
      for (const list of [invoices, sample.changeOrders] as { jobId: string }[][]) {
        for (let i = list.length - 1; i >= 0; i--) if (list[i].jobId === jobId) list.splice(i, 1);
      }
      set((x) => {
        const estimates = { ...x.estimates };
        delete estimates[jobId];
        return {
          ...x,
          estimates,
          assignments,
          timeEntries: x.timeEntries.filter((e) => e.jobId !== jobId),
          workItems: x.workItems.filter((w) => w.jobId !== jobId),
          captures: x.captures.filter((c) => c.jobId !== jobId),
          photos: x.photos.filter((p) => p.jobId !== jobId),
          skippedEstimates: x.skippedEstimates.filter((id) => id !== jobId),
          reopenedJobs: x.reopenedJobs.filter((id) => id !== jobId),
          version: x.version + 1,
        };
      });
      // a typed edit still waiting would recreate the estimate after the job is gone
      saveQueue.cancel(`estimate:${jobId}`);
      persist([
        ...moved.map(([itemId, next]) => command('assignReceiptItem', get().businessId!, itemId, next)),
        command('deleteJob', get().businessId!, jobId),
        command('deletePhotoFiles', jobPhotos.flatMap((p) => (p.path ? [p.path] : []))),
      ]);
      savePhotoQueue();
      return true;
    },
    /** Final cash collection requires a server response. A stale or reserved
     * balance is rejected for review rather than stored in the ordinary outbox.
     */
    async markPaid(invoiceId: string, confirmedCents?: number): Promise<void> {
      const s = get();
      const active = saveQueue.scope();
      const invoice = invoices.find((i) => i.id === invoiceId);
      if (!invoice || !s.sentInvoices.includes(invoiceId)) throw new Error('Invoice is not ready for payment');
      if (s.paidInvoices.includes(invoiceId)) return;
      const left = Math.max(0, invoiceTotals(s, invoice).total - paidOnline(s, invoiceId).paid);
      if (confirmedCents !== undefined && confirmedCents !== left) throw new Error('Balance changed. Refresh first');
      const apply = () => set((x) => ({ ...x, paidInvoices: [...new Set([...x.paidInvoices, invoiceId])] }));
      if (s.mode === 'example') { apply(); return; }
      await retryOffline();
      if (!active() || get().businessId !== s.businessId) throw new Error('signed_out');
      await saveQueue.commit(() => docsApi.markInvoicePaid(invoiceId, left), apply);
      cacheCurrent();
      void refreshPay();
    },
    refreshPay,
    /**
     * The customer's link for a sent invoice. Waits for the send itself to reach the server first,
     * since a link only ever opens a sent invoice.
     */
    async invoiceLink(invoiceId: string): Promise<string> {
      const active = saveQueue.scope();
      await saveQueue.wait();
      const link = await payApi.invoiceLink(invoiceId);
      if (!active()) throw Object.assign(new Error('signed_out'), { code: 'signed_out' });
      return link;
    },
    stripeSetupUrl: payApi.stripeSetupUrl,
    /** Asks Stripe what the owner's account can take now, and keeps the answer. */
    async checkStripe(): Promise<void> {
      if (get().mode !== 'connected') return;
      const active = saveQueue.scope();
      const online = await payApi.checkStripe();
      if (!active()) return;
      set((s) => ({ ...s, online }));
    },
    updateSettings(patch: Partial<PricingSettings>) {
      set((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
      persist(command('saveSettings', get().businessId!, get().settings, get().cardFee, get().aiScope));
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
        customerId = get().mode === 'connected' ? dbApi.newUuid() : newId();
        newCustomer = { id: customerId, name, firstName: name.split(' ')[0], phone: input.customer.phone.trim(), lang: input.customer.lang };
        customers.push(newCustomer);
      }
      const job: Job = {
        id: get().mode === 'connected' ? dbApi.newUuid() : newId(),
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
      persist([
        ...(newCustomer ? [command('insertCustomer', get().businessId!, newCustomer)] : []),
        command('insertJob', get().businessId!, job),
      ]);
      return job.id;
    },
    async completeSetup(input: SetupInput): Promise<void> {
      if (get().mode === 'connected') {
        const active = saveQueue.scope();
        await dbApi.createBusiness(input);
        if (!active()) throw Object.assign(new Error('signed_out'), { code: 'signed_out' });
        const loaded = await dbApi.loadAll();
        if (!active()) throw Object.assign(new Error('signed_out'), { code: 'signed_out' });
        if (!loaded) throw new Error('Setup was saved but could not be loaded');
        applyLoaded(loaded);
        cacheCurrent();
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
      if (item) persist(command('savePrice', get().businessId!, item));
    },
    /** The owner's own price list item (not a trade starter item). No price is fine; KILN flags it. */
    addPriceItem(name: string, unit: Unit, unitCents: Cents | null): PriceItem {
      const item: PriceItem = { id: `own-${newId()}`, name: name.trim().slice(0, 160), unit, unitCents };
      set((s) => ({ ...s, priceList: [...s.priceList, item] }));
      // saved like a starter item the owner added: its id is kept, so it loads back the same
      persist(command('savePrice', get().businessId!, item));
      return item;
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
      persist(command('saveTrades', get().businessId!, trades, newItems, removedItemIds));
    },
    setCardFee(on: boolean) {
      set((s) => ({ ...s, cardFee: on }));
      persist(command('saveSettings', get().businessId!, get().settings, on, get().aiScope));
    },
    setAiScope(on: boolean) {
      set((s) => ({ ...s, aiScope: on }));
      persist(command('saveSettings', get().businessId!, get().settings, get().cardFee, on));
    },
    clearSyncError() {
      set((s) => ({ ...s, syncError: null }));
    },

    // ---------- connected mode ----------

    /** Signed in: show this account's data only (none yet until it loads). */
    clearAccountView() {
      cacheCurrent();
      journal.close(); journalReady = false; volatileCommands = []; accountId = null;
      saveQueue.reset(); clearExampleData();
      set((s) => ({ ...connectedState(s), businessId: null, version: s.version + 1 }));
    },
    startHelper(businessId: string) {
      // crew screens use today's real date (receipts), not the example business's
      sample.setToday(docsApi.localDate());
      set((s) => ({ ...connectedState(s), businessId, profile: { ...s.profile, onboarded: true }, version: s.version + 1 }));
    },
    startConnected(userId: string) {
      saveQueue.reset();
      journal.close(); journalReady = false; volatileCommands = []; accountId = userId;
      clearExampleData();
      set((s) => ({ ...connectedState(s), businessId: null, version: s.version + 1 }));
      try {
        const cached = journal.open(userId);
        journalReady = true;
        if (cached) {
          sample.jobs.push(...cached.lists.jobs); sample.customers.push(...cached.lists.customers);
          sample.receipts.push(...cached.lists.receipts); sample.invoices.push(...cached.lists.invoices);
          sample.changeOrders.push(...cached.lists.changeOrders);
          sample.setToday(docsApi.localDate());
          set((s) => ({ ...cached.state, mode: 'connected', online: { connected: false, walletReady: false, bankReady: false },
            localSave: journal.pending ? 'waiting' : 'confirmed', pendingSaves: journal.pending, version: s.version + 1 }));
        }
      } catch (error) { set((s) => ({ ...s, localSave: 'failed', syncError: errorDetails(error) })); }
    },
    retryOffline,
    refreshDocuments,
    hasOfflineCache() { return !!accountId && !!get().businessId; },
    offlineLoadFailed(error: unknown) { set((s) => ({ ...s, syncError: errorDetails(error) })); },
    /** Puts the loaded business data in place. */
    hydrate(loaded: dbApi.Loaded) {
      // Never overwrite locally pending edits with a stale startup response.
      if (journal.pending || volatileCommands.length) return;
      applyLoaded(loaded);
      cacheCurrent();
    },
    signedOut() {
      cacheCurrent();
      journal.close(); journalReady = false; volatileCommands = []; accountId = null;
      saveQueue.reset();
      clearExampleData();
      set((s) => ({ ...connectedState(s), businessId: null, version: s.version + 1 }));
    },
  };
}

export type Actions = ReturnType<typeof makeActions>;

/** The one set of actions. Also used outside React (sign-in, loading). */
export const storeActions: Actions = makeActions();

/** The latest state, for work that finishes after a screen has moved on (an AI answer arriving). */
export const currentState = (): State => get();

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
