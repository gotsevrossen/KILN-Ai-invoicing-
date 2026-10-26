import { FunctionsHttpError } from '@supabase/supabase-js';

import {
  checkChange, checkCommands, checkGuess, checkTags, checkMissed, checkPrices, checkReceipt, checkScope,
  type ChangeDraft, type Command, type Guess, type ImportedPrice, type MissedItem, type ScannedReceipt,
} from '@/lib/ai-check';
import { supabase } from '@/lib/supabase';

import type { TradeId } from './trades';
import type { PhotoTag, Unit } from './types';

// Calls to KILN's AI helpers on the server (supabase/functions/ai). Claude is never called
// from the phone: the key stays on the server, which also checks the sign-in and daily limit.
// Every answer is checked again here (lib/ai-check) before a screen uses it.

/** Why an AI helper didn't answer. Screens show `ai.errors.<code>`. */
export type AiErrorCode = 'not_set_up' | 'key_refused' | 'limit' | 'busy' | 'signed_out' | 'too_big' | 'offline' | 'failed';

export class AiFailed extends Error {
  constructor(readonly code: AiErrorCode) {
    super(code);
  }
}

const CODES: Record<string, AiErrorCode> = { not_set_up: 'not_set_up', key_refused: 'key_refused', limit: 'limit', busy: 'busy', signed_out: 'signed_out', too_big: 'too_big' };

/** AI needs the server: signed in (connected mode), not the example build. */
export function aiReady(mode: 'example' | 'connected'): boolean {
  return mode === 'connected' && supabase !== null;
}

async function call(task: 'guess' | 'missed' | 'scope' | 'prices' | 'receipt' | 'change' | 'command' | 'tags', input: unknown): Promise<unknown> {
  if (!supabase) throw new AiFailed('not_set_up');
  const { data, error } = await supabase.functions.invoke('ai', { body: { task, input } });
  if (!error) return data;
  if (error instanceof FunctionsHttpError) {
    const body = await (error.context as Response).json().catch(() => null) as { error?: string } | null;
    throw new AiFailed(CODES[body?.error ?? ''] ?? 'failed');
  }
  throw new AiFailed('offline');
}

type Item = { id: string; name: string; unit: Unit };

export interface GuessInput {
  title: string;
  /** The private note from when the job was made. Only ids and numbers come back, never its text. */
  note: string;
  notes: string[];
  hourly: boolean;
  trades: { id: TradeId; name: string; jobTypes: { id: string; name: string }[] }[];
  items: Item[];
}

/** The job type and the quantities the job's text states. Null when KILN can't tell. */
export async function guessJob(input: GuessInput): Promise<Guess | null> {
  return checkGuess(await call('guess', input), input.trades.map((t) => t.id), input.items.map((i) => i.id));
}

export interface MissedInput {
  lang: 'en' | 'es';
  title: string;
  jobType: string;
  lines: { description: string; excluded: boolean }[];
  /** Price list items not on the estimate yet. */
  items: Item[];
}

export async function findMissed(input: MissedInput): Promise<MissedItem[]> {
  return checkMissed(await call('missed', input), input.items.map((i) => i.id));
}

export interface ScopeInput {
  /** The customer's language. */
  lang: 'en' | 'es';
  title: string;
  jobType: string;
  /** What the owner already typed, rewritten. Never the job's private note. */
  draft: string;
  location: string;
  lines: { description: string; qty: string }[];
  excluded: string[];
}

export async function writeScope(input: ScopeInput): Promise<string> {
  const text = checkScope(await call('scope', input));
  if (!text) throw new AiFailed('failed');
  return text;
}

/** A photo as text, ready to send. */
export type AiImage = { mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string };

export interface PricesInput {
  text: string;
  images: AiImage[];
  items: Item[];
}

export async function readPrices(input: PricesInput): Promise<ImportedPrice[]> {
  return checkPrices(await call('prices', input), input.items.map((i) => i.id));
}

/** Store, date, items before tax, and tax from one or two photos of a receipt. */
export async function scanReceipt(images: AiImage[]): Promise<ScannedReceipt> {
  const receipt = checkReceipt(await call('receipt', { images }));
  if (!receipt) throw new AiFailed('failed');
  return receipt;
}

export interface ChangeInput {
  /** The customer's language: they read and sign the change order. */
  lang: 'en' | 'es';
  title: string;
  note: string;
  /** Lines already agreed on the estimate, for context. */
  agreed: string[];
  items: Item[];
}

export async function draftChange(input: ChangeInput): Promise<ChangeDraft> {
  const draft = checkChange(await call('change', input), input.items.map((i) => i.id));
  if (!draft) throw new AiFailed('failed');
  return draft;
}

export interface CommandInput {
  /** The owner's language, for descriptions. */
  lang: 'en' | 'es';
  text: string;
  jobs: { id: string; title: string; customer: string; address: string }[];
  items: Item[];
}

export async function readCommand(input: CommandInput): Promise<Command[]> {
  return checkCommands(await call('command', input), input.jobs.map((j) => j.id), input.items.map((i) => i.id));
}

/** KILN's before / during / after guess for each photo (small copies), in order. Null: can't tell. */
export async function guessTags(title: string, images: AiImage[]): Promise<(PhotoTag | null)[]> {
  return checkTags(await call('tags', { title: title.slice(0, 200), images }), images.length);
}

export type { ChangeDraft, Command, Guess, ImportedPrice, MissedItem, ScannedReceipt };
