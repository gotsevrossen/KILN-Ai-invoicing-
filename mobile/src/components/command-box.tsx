import { useState } from 'react';
import { View } from 'react-native';

import { readCommand, type Command } from '@/data/ai';
import * as sample from '@/data/sample';
import { customerOf, jobById, workLocked } from '@/data/selectors';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';
import { lineTotal } from '@/lib/money';
import { voiceAvailable } from '@/lib/voice';
import { radius } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

import { aiErrorText } from './ai-parts';
import { parseDollars } from './estimate-parts';
import { JobPicker } from './sheet';
import { Button, ButtonRow, Card, Field, IconButton, Notice, Row, T } from './ui';
import { VoiceSheet } from './voice-sheet';

/** One action KILN found, plus the price the owner typed for work with no price yet. */
type Found = Command & { key: number; priceText?: string };

/**
 * "Add 2 hours and a $40 faucet to the Smith job": KILN turns it into hours, work, and notes,
 * and nothing changes until the owner taps Add. A job it can't tell, or work with no price,
 * waits for the owner instead of being guessed. Voice notes will use the same step.
 */
export function CommandBox({ voiceOpen = false, onVoiceClose }: {
  /** The Capture tab's Voice button: what's heard is checked the same way as typed text. */
  voiceOpen?: boolean;
  onVoiceClose?: () => void;
}) {
  const p = usePalette();
  const { t, lang } = useLang();
  const f = useFormat();
  const { state, actions } = useStore();
  const [text, setText] = useState('');
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Found[] | null>(null);
  const [pickFor, setPickFor] = useState<number | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [micOpen, setMicOpen] = useState(false);

  const priceOf = (itemId: string | null) => (itemId ? state.priceList.find((i) => i.id === itemId)?.unitCents ?? null : null);

  const read = (said = text) => {
    setReading(true);
    setError(null);
    setDone(null);
    const jobs = sample.jobs.filter((j) => j.group === 'active' && !workLocked(state, j.id)).slice(0, 100);
    readCommand({
      lang,
      text: said.slice(0, 1000),
      jobs: jobs.map((j) => ({ id: j.id, title: j.title.slice(0, 200), customer: customerOf(j).name.slice(0, 120), address: j.address.slice(0, 300) })),
      items: state.priceList.slice(0, 400).map((i) => ({ id: i.id, name: i.name.slice(0, 160), unit: i.unit })),
    })
      // a price the owner said wins; otherwise their own price list price
      .then((found) => setRows(found.map((c, key) => (c.type === 'work' ? { ...c, key, unitCents: c.unitCents ?? priceOf(c.itemId) } : { ...c, key }))),
        (e: unknown) => setError(aiErrorText(t, e)))
      .finally(() => setReading(false));
  };

  const update = (key: number, patch: Partial<Found>) => setRows((rs) => rs && rs.map((r) => (r.key === key ? { ...r, ...patch } as Found : r)));
  const remove = (key: number) => setRows((rs) => rs && rs.filter((r) => r.key !== key));
  const workCents = (r: Found) => (r.type !== 'work' ? null : r.unitCents ?? (r.priceText ? parseDollars(r.priceText) : null));
  const ready = !!rows?.length && rows.every((r) => r.jobId && (r.type !== 'work' || workCents(r) !== null));

  const addAll = () => {
    if (!rows || !ready) return;
    const failed: string[] = [];
    for (const r of rows) {
      const jobId = r.jobId!;
      if (r.type === 'hours') actions.logHours(jobId, r.hundredths, r.note);
      else if (r.type === 'note') actions.addCapture(jobId, 'note', r.text);
      else {
        const item = state.priceList.find((i) => i.id === r.itemId);
        const ok = actions.addWorkItem(jobId, {
          priceItemId: item?.id, description: r.description, unit: item?.unit ?? 'flat',
          qtyHundredths: r.qtyHundredths, unitCents: workCents(r)!, kind: r.kind,
        });
        if (!ok) failed.push(r.description);
      }
    }
    const jobs = [...new Set(rows.map((r) => jobById(r.jobId!).title))].join(', ');
    setDone(failed.length ? t('ai.cmdFailed', { items: failed.join(', ') }) : t('capture.added', { job: jobs }));
    setRows(null);
    setText('');
  };

  const label = (r: Found) => (r.type === 'hours' ? (r.note ? `${t('ai.cmdHours')} · ${r.note}` : t('ai.cmdHours'))
    : r.type === 'note' ? r.text
    : r.qtyHundredths === 100 ? r.description : `${f.qty(r.qtyHundredths)} × ${r.description}`);
  const value = (r: Found) => (r.type === 'hours' ? `${f.qty(r.hundredths)} h`
    : r.type === 'work' && r.unitCents !== null ? f.money(lineTotal(r.qtyHundredths, r.unitCents)) : '');

  return (
    <Card style={{ gap: 12, marginTop: 6 }}>
      <T v="eyebrow">{t('ai.cmdTitle')}</T>
      {rows === null ? <>
        <Field value={text} onChangeText={setText} placeholder={t('ai.cmdPlaceholder')} accessibilityLabel={t('ai.cmdTitle')}
          multiline maxLength={1000} editable={!reading} style={{ minHeight: 84, paddingTop: 14, textAlignVertical: 'top' }} />
        <ButtonRow gap={10}>
          {voiceAvailable ? <Button label={t('voice.speak')} icon="mic" variant="outline" disabled={reading} onPress={() => setMicOpen(true)} /> : null}
          <Button label={reading ? t('ai.cmdReading') : t('ai.cmdRead')} icon="zap" variant="dark" flex disabled={reading || !text.trim()} onPress={() => read()} />
        </ButtonRow>
        <T v="small" muted>{t('ai.cmdHelp')}</T>
      </> : rows.length === 0 ? (
        <Notice text={t('ai.cmdNone')} icon="info" tone="soft" />
      ) : (
        <View style={{ gap: 8 }}>
          {rows.map((r) => (
            <View key={r.key} style={{ gap: 8, backgroundColor: p.ground, borderRadius: radius.xs, padding: 12 }}>
              <Row gap={8} style={{ alignItems: 'center' }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="label" style={{ fontSize: 16 }}>{label(r)}</T>
                  <T v="small" muted>{r.jobId ? jobById(r.jobId).title : t('ai.cmdNoJob')}</T>
                </View>
                {value(r) ? <T v="money">{value(r)}</T> : null}
                <IconButton icon="x" label={t('ai.cmdRemove', { item: label(r) })} onPress={() => remove(r.key)} />
              </Row>
              {r.type === 'work' && r.unitCents === null ? (
                <Field label={t('ai.cmdPrice')} value={r.priceText ?? ''} onChangeText={(priceText) => update(r.key, { priceText })}
                  placeholder={t('estimate.pricePlaceholder')} keyboardType="decimal-pad" />
              ) : null}
              <Button label={r.jobId ? t('ai.cmdChangeJob') : t('common.whichJob')} icon="briefcase"
                variant={r.jobId ? 'outline' : 'dark'} onPress={() => setPickFor(r.key)} />
            </View>
          ))}
        </View>
      )}
      {rows !== null ? (
        <ButtonRow gap={10}>
          <Button label={t('common.cancel')} variant="outline" onPress={() => setRows(null)} />
          {rows.length ? <Button label={t('ai.cmdAdd', { count: rows.length })} icon="check" flex disabled={!ready} onPress={addAll} /> : null}
        </ButtonRow>
      ) : null}
      {rows?.length && !ready ? <T v="small" muted>{t('ai.cmdNeedMore')}</T> : null}
      {error ? <T v="small" color={p.danger}>{error}</T> : null}
      {done ? <Notice text={done} /> : null}

      <VoiceSheet open={voiceOpen || micOpen} onClose={() => {
        setMicOpen(false);
        onVoiceClose?.();
      }} onDone={(heard) => {
        setMicOpen(false);
        onVoiceClose?.();
        setRows(null);
        setText(heard);
        read(heard);
      }} />
      <JobPicker open={pickFor !== null} onClose={() => setPickFor(null)} onPick={(jobId) => {
        if (pickFor !== null) update(pickFor, { jobId });
        setPickFor(null);
      }} />
    </Card>
  );
}
