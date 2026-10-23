import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AiFailed, findMissed, writeScope, type GuessInput, type MissedItem, type ScopeInput } from '@/data/ai';
import { customerOf, estimateDraft, jobById } from '@/data/selectors';
import { currentState, storeActions, useStore, type State } from '@/data/store';
import { tradeById } from '@/data/trades';
import type { Job } from '@/data/types';
import { translate, useLang, type Lang, type TFn } from '@/i18n';

import { pickJobType } from './estimate-parts';
import { Button, Card, IconButton, Row, T } from './ui';

// What the screens send to KILN's AI helpers, built from the latest saved state.
// Only what each task needs: never prices, and never the private note where text could come back
// to the customer.

const priceItems = (s: State, leaveOut: string[] = []) =>
  s.priceList.filter((i) => !leaveOut.includes(i.id)).slice(0, 400).map((i) => ({ id: i.id, name: i.name.slice(0, 160), unit: i.unit }));

/** The job type and quantities, read from the job's title, its private note, and typed notes. */
export function guessInputFor(s: State, job: Job, t: TFn): GuessInput {
  return {
    title: job.title.slice(0, 200),
    note: (job.privateNote ?? '').slice(0, 2000),
    notes: s.captures.filter((c) => c.jobId === job.id && c.kind === 'note' && c.text).map((c) => c.text!.slice(0, 2000)).slice(-20),
    hourly: job.pricing === 'hourly',
    trades: s.profile.trades.slice(0, 10).map((id) => ({
      id,
      name: t(`trades.${id}`),
      jobTypes: tradeById(id).jobTypes.map((jt) => ({ id: jt.id, name: t(`jobTypes.${jt.id}` as 'jobTypes.leak') })),
    })),
    items: priceItems(s),
  };
}

/** The customer description, from the job and its lines, in the customer's language. */
export function scopeInputFor(s: State, jobId: string): ScopeInput {
  const job = jobById(jobId);
  const lang = customerOf(job).lang;
  const draft = estimateDraft(s, jobId);
  const { jobType, isCustom } = pickJobType(s.profile.trades, jobId, draft.scope);
  const unit = (u: string) => (u === 'flat' ? '' : ` ${translate(lang, `estimate.units.${u}` as 'estimate.units.each')}`);
  return {
    lang,
    title: job.title.slice(0, 200),
    jobType: isCustom ? '' : translate(lang, `jobTypes.${jobType.id}` as 'jobTypes.leak'),
    draft: (draft.scope?.notes ?? '').slice(0, 2000),
    location: (draft.scope?.location ?? '').slice(0, 300),
    lines: draft.lines.filter((l) => !l.excluded && l.description.trim()).slice(0, 100)
      .map((l) => ({ description: l.description.slice(0, 300), qty: `${l.qtyHundredths / 100}${unit(l.unit)}` })),
    excluded: [...draft.lines.filter((l) => l.excluded).map((l) => l.description), ...(draft.scope?.exclusions ? [draft.scope.exclusions] : [])]
      .slice(0, 100).map((x) => x.slice(0, 300)),
  };
}

/** Jobs whose customer description KILN wrote (until the owner edits it), so the page can say so. */
export const kilnWroteScope = new Set<string>();

/**
 * Writes the customer description in the background when it's still empty (Settings switch on).
 * Fails quietly: the owner can still write it, or tap "Write it for me".
 */
export function draftScopeInBackground(jobId: string): void {
  writeScope(scopeInputFor(currentState(), jobId))
    .then((text) => {
      if (storeActions.fillScopeNotes(jobId, text)) kilnWroteScope.add(jobId);
    })
    .catch(() => {});
}

/** The message for an AI helper that didn't answer. */
export function aiErrorText(t: TFn, e: unknown): string {
  return t(`ai.errors.${e instanceof AiFailed ? e.code : 'failed'}`);
}

// ---------------------------------------------------------------- "Did you forget?"

// one check per set of lines, and "not needed" taps, kept while the app is open
const missedChecked = new Map<string, MissedItem[]>();
const notNeeded = new Map<string, string[]>();

/**
 * Price list items an estimate like this usually has, that this one doesn't. Checked again only
 * when the estimate's items change (not prices or quantities). `leaveOut`: items already offered.
 */
export function MissedItems({ jobId, leaveOut, onAdd }: { jobId: string; leaveOut: string[]; onAdd: (itemId: string) => void }) {
  const { t, lang } = useLang();
  const { state: s } = useStore();
  const draft = estimateDraft(s, jobId);
  const onEstimate = draft.lines.map((l) => l.priceItemId).filter((id): id is string => !!id);
  const signature = `${jobId}|${lang}|${draft.lines.map((l) => `${l.priceItemId ?? l.description}:${l.excluded ? 1 : 0}`).sort().join(',')}`;
  const [result, setResult] = useState<{ signature: string; items: MissedItem[] } | null>(null);
  const [gone, setGone] = useState<string[]>(() => notNeeded.get(jobId) ?? []);
  const hasLines = draft.lines.some((l) => !l.excluded);
  const skip = leaveOut.join(',');

  useEffect(() => {
    if (!hasLines) return;
    let live = true;
    const cached = missedChecked.get(signature);
    const now = currentState();
    const d = estimateDraft(now, jobId);
    const { jobType, isCustom } = pickJobType(now.profile.trades, jobId, d.scope);
    const ask = cached ? Promise.resolve(cached) : findMissed({
      lang: lang as Lang,
      title: jobById(jobId).title.slice(0, 200),
      jobType: isCustom ? '' : translate(lang, `jobTypes.${jobType.id}` as 'jobTypes.leak'),
      lines: d.lines.slice(0, 100).map((l) => ({ description: l.description.slice(0, 300), excluded: !!l.excluded })),
      items: priceItems(now, [...d.lines.map((l) => l.priceItemId ?? ''), ...skip.split(',')]),
    }).then((items) => {
      missedChecked.set(signature, items);
      return items;
    });
    ask.then((items) => {
      if (live) setResult({ signature, items });
    }, () => {});
    return () => {
      live = false;
    };
  }, [signature, hasLines, jobId, lang, skip]);

  const items = (result?.signature === signature ? result.items : [])
    .filter((m) => !gone.includes(m.itemId) && !onEstimate.includes(m.itemId) && !leaveOut.includes(m.itemId));
  if (!items.length) return null;

  const dismiss = (itemId: string) => {
    const next = [...gone, itemId];
    notNeeded.set(jobId, next);
    setGone(next);
  };

  return (
    <Card style={{ gap: 10 }}>
      <T v="eyebrow">{t('ai.missedTitle')}</T>
      {items.map((m) => {
        const name = s.priceList.find((i) => i.id === m.itemId)?.name ?? m.itemId;
        return (
          <Row key={m.itemId} gap={10} style={{ alignItems: 'center' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="label" style={{ fontSize: 16 }}>{name}</T>
              <T v="small" muted>{m.reason}</T>
            </View>
            <Button label={t('ai.missedAdd')} icon="plus" variant="outline" onPress={() => onAdd(m.itemId)} />
            <IconButton icon="x" label={t('ai.missedDismiss', { item: name })} onPress={() => dismiss(m.itemId)} />
          </Row>
        );
      })}
      <T v="small" muted>{t('ai.missedHelp')}</T>
    </Card>
  );
}
