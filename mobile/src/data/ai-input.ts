import type { TFn } from '../i18n';

import type { GuessInput } from './ai';
import type { State } from './store';
import { TRADES } from './trades.ts';
import type { Job } from './types';

/** Names and units for the owner's items, used by AI helpers to identify existing charges. */
export const priceItems = (state: Pick<State, 'priceList'>, leaveOut: string[] = []) =>
  state.priceList.filter((item) => !leaveOut.includes(item.id)).slice(0, 400)
    .map((item) => ({ id: item.id, name: item.name.slice(0, 160), unit: item.unit }));

/** Recognize work across the catalog using the job description and notes. */
export function guessInputFor(state: Pick<State, 'priceList' | 'captures' | 'estimates'>, job: Job, t: TFn): GuessInput {
  const description = state.estimates[job.id]?.scope?.notes?.trim();
  const notes = state.captures.filter((capture) => capture.jobId === job.id && capture.kind === 'note' && capture.text)
    .map((capture) => capture.text!.slice(0, 2000)).slice(-20);
  return {
    title: job.title.slice(0, 200),
    note: (job.privateNote ?? '').slice(0, 2000),
    notes: [...(description ? [description.slice(0, 2000)] : []), ...notes].slice(0, 20),
    hourly: job.pricing === 'hourly',
    trades: TRADES.map((trade) => ({
      id: trade.id,
      name: t(`trades.${trade.id}`),
      jobTypes: trade.jobTypes.map((jobType) => ({ id: jobType.id, name: t(`jobTypes.${jobType.id}` as 'jobTypes.leak') })),
    })),
    items: priceItems(state),
  };
}
