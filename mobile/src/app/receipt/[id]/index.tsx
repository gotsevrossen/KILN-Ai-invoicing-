import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { RecordGate } from '@/components/record-gate';
import { Sheet } from '@/components/sheet';
import { Button, ButtonRow, Card, Field, Hair, PageHeader, Pill, Row, Screen, T, type Tone } from '@/components/ui';
import * as sample from '@/data/sample';
import { canDeleteReceipt, customerOf, hasReceipt, itemCostWithTax, jobById, receiptById } from '@/data/selectors';
import { useStore } from '@/data/store';
import type { ReceiptItem } from '@/data/types';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';
import { applyMarkup } from '@/lib/money';
import { font, radius, tap } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

function SortReceipt() {
  const p = usePalette();
  const { t } = useLang();
  const f = useFormat();
  const { state, actions } = useStore();
  const { id } = useLocalSearchParams<{ id: string }>();
  const receipt = receiptById(id);
  const activeJobs = sample.jobs.filter((j) => j.group === 'active');

  const [fixOpen, setFixOpen] = useState(false);
  const [fixText, setFixText] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  // the full list stays folded while sorting: the current item is what matters
  const [listOpen, setListOpen] = useState(false);

  const nameOf = (item: ReceiptItem) => state.fixedNames[item.id] ?? item.name;
  const isFlagged = (item: ReceiptItem) => !!item.flagged && !state.fixedNames[item.id];
  const queue = receipt.items.filter((i) => !state.assignments[i.id] && !isFlagged(i));
  const current = queue[0];
  const flagged = receipt.items.find((i) => isFlagged(i) && !state.assignments[i.id]);
  const done = receipt.items.filter((i) => state.assignments[i.id]).length;
  const total = receipt.items.reduce((a, i) => a + i.costCents, 0) + receipt.taxCents;
  const showList = listOpen || !current;

  const statusOf = (item: ReceiptItem): { label: string; tone: Tone | 'outline' } => {
    const a = state.assignments[item.id];
    if (a?.type === 'jobs') return { label: a.jobIds.map((j) => jobById(j).title.split(' ')[0]).join(' + '), tone: 'outline' };
    if (a?.type === 'personal') return { label: t('receipt.personal'), tone: 'outline' };
    if (a?.type === 'overhead') return { label: t('receipt.overhead'), tone: 'outline' };
    if (current && item.id === current.id) return { label: t('receipt.now'), tone: 'accent' };
    if (isFlagged(item)) return { label: t('receipt.cantRead'), tone: 'flag' };
    return { label: t('receipt.waiting'), tone: 'soft' };
  };

  const cost = current ? itemCostWithTax(current) : 0;
  const markupOn = current ? !state.markupOff[current.id] : false;

  return (
    <Screen
      header={
        <PageHeader
          title={`${receipt.store} #${receipt.number}`}
          sub={`${receipt.date === sample.TODAY ? t('common.today') : f.date(receipt.date)} · ${f.money(total)}`}
          back={() => router.back()}
          right={<Pill label={`${done}/${receipt.items.length}`} tone="inverse" />}
        />
      }>

      {current ? (
        <Card style={{ gap: 14, padding: 20 }}>
          <View style={{ gap: 4 }}>
            <T v="eyebrow" muted>{t('receipt.itemOf', { n: current.line, total: receipt.items.length })}</T>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }} gap={12}>
              <T v="h2" style={{ flex: 1 }}>
                {nameOf(current)} <T v="h2" muted>{current.qtyLabel}</T>
              </T>
              <View style={{ alignItems: 'flex-end' }}>
                <T v="money" style={{ fontSize: 21 }}>{f.money(cost)}</T>
                {cost !== current.costCents ? <T v="small" muted>{t('receipt.inclTax', { amount: f.money(cost - current.costCents) })}</T> : null}
              </View>
            </Row>
            {/* markup in one line: what this bills, and a button to change it */}
            <Row style={{ justifyContent: 'space-between' }} gap={10}>
              <T v="small" muted style={{ flex: 1 }}>
                {markupOn
                  ? t('receipt.markupOnLine', { amount: f.money(applyMarkup(cost, state.settings.markupBps)), pct: f.pct(state.settings.markupBps) })
                  : t('receipt.markupOffLine', { amount: f.money(cost) })}
              </T>
              <Button label={markupOn ? t('receipt.markupTurnOff') : t('receipt.markupTurnOn')} variant="outline"
                style={{ minHeight: tap.min, paddingHorizontal: 14 }} onPress={() => actions.toggleMarkup(current.id)} />
            </Row>
          </View>
          <Hair />
          <T v="h3">{t('receipt.whichJob')}</T>
          {activeJobs.map((job) => {
            const likely = current.likelyJobIds.includes(job.id);
            return (
              <Pressable
                key={job.id}
                onPress={() => actions.assign(current.id, { type: 'jobs', jobIds: [job.id] })}
                accessibilityRole="button"
                accessibilityLabel={`${job.title}${likely ? `, ${t('receipt.likely')}` : ''}`}
                style={({ pressed }) => ({
                  minHeight: 64,
                  borderRadius: radius.sm,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  backgroundColor: likely ? p.accentSoft : p.ground,
                  borderWidth: likely ? 2 : 0,
                  borderColor: p.accent,
                  opacity: pressed ? 0.8 : 1,
                })}>
                <View style={{ flex: 1 }}>
                  <T v="label" style={{ fontSize: 16 }}>{job.title}</T>
                  <T v="small" muted>{customerOf(job).name} · {job.address}</T>
                </View>
                {likely ? <Pill label={t('receipt.likely')} tone="accent" /> : null}
              </Pressable>
            );
          })}
          <Button label={t('common.newJob')} icon="plus" variant="outline"
            onPress={() => router.push({ pathname: '/new-job', params: { item: current.id } })} />
          <ButtonRow>
            <Button label={t('receipt.split')} variant="soft" flex onPress={() => router.push(`/receipt/${receipt.id}/split/${current.id}`)} />
            <Button label={t('receipt.personal')} variant="soft" flex onPress={() => actions.assign(current.id, { type: 'personal' })} />
            <Button label={t('receipt.overhead')} variant="soft" flex onPress={() => actions.assign(current.id, { type: 'overhead' })} />
          </ButtonRow>
        </Card>
      ) : (
        <Card tone="inverse" style={{ gap: 12, padding: 20 }}>
          <T v="title" color={p.onInverse} style={{ fontSize: 26, lineHeight: 28 }}>
            {t('receipt.sorted', { done, total: receipt.items.length })}
          </T>
          {flagged ? (
            <>
              <T v="body" color={p.onInverseMuted}>{t('receipt.cantReadBody', { n: flagged.line })}</T>
              <Button label={t('receipt.fixLine', { n: flagged.line })} icon="edit-3" onPress={() => setFixOpen(true)} />
            </>
          ) : null}
          <Button label={t('receipt.startOver')} variant="outline" style={{ borderColor: p.onInverse }} onPress={() => actions.resetReceipt(receipt.items.map((i) => i.id))} />
        </Card>
      )}

      {current ? (
        <Button label={listOpen ? t('receipt.hideAll') : t('receipt.seeAll', { count: receipt.items.length })}
          icon={listOpen ? 'chevron-up' : 'chevron-down'} variant="outline" onPress={() => setListOpen(!listOpen)} />
      ) : null}
      {showList ? (
        <Card style={{ gap: 0 }}>
          <T v="eyebrow" style={{ marginBottom: 6 }}>{t('receipt.onReceipt')}</T>
          {receipt.items.map((item) => {
            const s = statusOf(item);
            return (
              <Row key={item.id} gap={10} style={{ minHeight: 52, borderTopWidth: 1, borderTopColor: p.line, paddingVertical: 6 }}>
                <T v="small" muted style={{ width: 16, fontFamily: font.semi }}>{item.line}</T>
                <T v="body" style={{ flex: 1 }} numberOfLines={2}>{nameOf(item)}</T>
                <T v="money" style={{ fontFamily: font.medium, fontSize: 15 }}>{f.money(itemCostWithTax(item))}</T>
                <View style={{ width: 96, alignItems: 'flex-end' }}>
                  <Pill label={s.label} tone={s.tone} />
                </View>
              </Row>
            );
          })}
          <Hair style={{ marginTop: 6 }} />
          <T v="small" muted style={{ marginTop: 10 }}>{t('receipt.taxSplit', { amount: f.money(receipt.taxCents) })}</T>
        </Card>
      ) : null}

      <Pressable onPress={() => router.back()} accessibilityRole="link" style={{ minHeight: tap.min, alignItems: 'center', justifyContent: 'center' }}>
        <T v="label" style={{ textDecorationLine: 'underline' }}>{t('receipt.finishLater')}</T>
      </Pressable>

      {canDeleteReceipt(state, receipt) ? (
        <Button label={t('receipt.delete')} icon="trash-2" variant="outline" style={{ marginTop: 16 }} onPress={() => setDeleteOpen(true)} />
      ) : null}

      <Sheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t('receipt.deleteTitle')}>
        <T v="body">{t('receipt.deleteBody')}</T>
        <Button label={t('receipt.delete')} icon="trash-2" variant="danger" big onPress={() => {
          setDeleteOpen(false);
          if (router.canGoBack()) router.back();
          else router.replace('/');
          // once this screen has closed, so it never shows a receipt that's gone
          setTimeout(() => actions.deleteReceipt(receipt.id), 400);
        }} />
        <Button label={t('common.cancel')} variant="outline" onPress={() => setDeleteOpen(false)} />
      </Sheet>

      <Sheet open={fixOpen} onClose={() => setFixOpen(false)} title={flagged ? t('receipt.fixLine', { n: flagged.line }) : ''}>
        <Field value={fixText} onChangeText={setFixText} placeholder={t('capture.notePlaceholder')} autoFocus />
        <Button
          label={t('common.save')}
          disabled={!fixText.trim() || !flagged}
          onPress={() => {
            if (!flagged) return;
            actions.fixItem(flagged.id, fixText.trim());
            setFixText('');
            setFixOpen(false);
          }}
        />
      </Sheet>
    </Screen>
  );
}

/** Waits for the record to load (a link or refresh can arrive first) instead of crashing. */
export default function SortReceiptRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecordGate found={() => hasReceipt(id)}><SortReceipt /></RecordGate>;
}
