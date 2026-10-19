import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import type { Cents } from '@/lib/money';

import { TODAY, initialAssignments, timeEntries, walshEstimateInputs } from './sample';
import type { Assignment, TimeEntry } from './types';

// In-memory app state for the example build. Resets when the app restarts.
// Supabase replaces this in the next step; screens only use the actions below.

export type CaptureKind = 'photo' | 'note' | 'voice';

export interface Capture {
  id: string;
  jobId: string;
  kind: CaptureKind;
  text?: string;
  date: string;
}

export interface EstimateDraft {
  deckSqFt: number;
  boards: number;
  railingFt: number;
  haulCents: Cents | null;
  depositOn: boolean;
  sent: boolean;
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
  voiceConfirmed: boolean;
  signed: Record<string, { name: string; at: string }>;
  estimate: EstimateDraft;
  captures: Capture[];
  cardFee: boolean;
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
    voiceConfirmed: false,
    signed: {},
    estimate: { ...walshEstimateInputs, haulCents: null, depositOn: true, sent: false },
    captures: [],
    cardFee: false,
  };
}

let nextId = 1;
const newId = (prefix: string) => `${prefix}-${nextId++}`;

function makeActions(set: (fn: (s: State) => State) => void) {
  return {
    assign(itemId: string, assignment: Assignment) {
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
      set((s) => ({ ...s, materialsMode: { ...s.materialsMode, [invoiceId]: mode } }));
    },
    sendInvoice(invoiceId: string) {
      set((s) => (s.sentInvoices.includes(invoiceId) ? s : { ...s, sentInvoices: [...s.sentInvoices, invoiceId] }));
    },
    confirmVoice() {
      set((s) => ({ ...s, voiceConfirmed: true }));
    },
    sign(changeOrderId: string, name: string) {
      set((s) => ({ ...s, signed: { ...s.signed, [changeOrderId]: { name, at: new Date().toISOString() } } }));
    },
    updateEstimate(patch: Partial<EstimateDraft>) {
      set((s) => ({ ...s, estimate: { ...s.estimate, ...patch } }));
    },
    addCapture(jobId: string, kind: CaptureKind, text?: string) {
      set((s) => ({ ...s, captures: [...s.captures, { id: newId('c'), jobId, kind, text, date: TODAY }] }));
    },
    setCardFee(on: boolean) {
      set((s) => ({ ...s, cardFee: on }));
    },
  };
}

export type Actions = ReturnType<typeof makeActions>;

const Ctx = createContext<{ state: State; actions: Actions } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(initialState);
  const actions = useMemo(() => makeActions(setState), []);
  const value = useMemo(() => ({ state, actions }), [state, actions]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
