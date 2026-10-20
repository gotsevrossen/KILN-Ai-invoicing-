import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { Stepper } from '@/components/stepper';
import { Button, Card, Field, Hair, Icon, IconButton, ListRow, Notice, PageHeader, PhotoTile, Row, Screen, T, type IconName } from '@/components/ui';
import * as sample from '@/data/sample';
import { changeOrdersForJob, customerOf, hoursFor, invoiceForJob, jobById, jobStage, partsCost, receiptsOnJob, unsortedItems } from '@/data/selectors';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';
import { font } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

function Stat({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const p = usePalette();
  return (
    <View style={{ flex: 1, gap: 2, paddingHorizontal: 12, borderRightWidth: last ? 0 : 1, borderRightColor: p.line }}>
      <T v="small" muted>{label}</T>
      <T v="money">{value}</T>
    </View>
  );
}

function parseHours(text: string): number | null {
  const n = Number(text.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0 || n > 24) return null;
  return Math.round(n * 100);
}

export default function JobDetail() {
  const p = usePalette();
  const { t } = useLang();
  const f = useFormat();
  const { state, actions } = useStore();
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = jobById(id);
  const customer = customerOf(job);
  const invoice = invoiceForJob(job.id);
  const co = changeOrdersForJob(job.id)[0];
  const { stage, detail } = jobStage(state, job);

  // a sent estimate opens as the customer sees it; a draft opens in the builder
  const sentEstimate = sample.customerEstimates.find((e) => e.jobId === job.id);
  const draft = state.estimates[job.id];
  const customerEstimateRoute: Href = sentEstimate ? `/customer/estimate/${sentEstimate.id}` : `/customer/estimate/${job.id}`;
  const builderRoute: Href = `/estimate/${job.id}`;

  const [hoursOpen, setHoursOpen] = useState(false);
  const [hoursText, setHoursText] = useState('');
  const [hoursNote, setHoursNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [photoAdded, setPhotoAdded] = useState(false);
  const [receiptSoon, setReceiptSoon] = useState(false);
  const hoursValue = parseHours(hoursText);

  // ---------- what's next ----------
  type Next = { title: string; body: string; action?: { label: string; icon: IconName; onPress: () => void }; extra?: ReactNode };
  const next: Next = (() => {
    switch (detail) {
      case 'estimateDraft':
        return {
          title: t('flow.estimateDraft'),
          body: t('flow.estimateDraftBody'),
          action: { label: t('flow.buildEstimate'), icon: 'clipboard', onPress: () => router.push(builderRoute) },
          extra: <Button label={t('flow.skipEstimate')} variant="ghost" onPress={() => actions.skipEstimate(job.id)} />,
        };
      case 'estimateWaiting':
        return {
          title: t('flow.estimateWaiting', { name: customer.firstName }),
          body: t('flow.estimateWaitingBody'),
          action: { label: t('flow.openEstimate'), icon: 'eye', onPress: () => router.push(customerEstimateRoute) },
        };
      case 'working':
        return {
          title: t('flow.working'),
          body: t('flow.workingBody'),
          action: {
            label: t('flow.jobDone'),
            icon: 'check',
            onPress: () => router.push(`/invoice/${actions.finishJob(job.id)}`),
          },
        };
      case 'invoiceDraft':
        return {
          title: t('flow.invoiceDraft'),
          body: t('flow.invoiceDraftBody'),
          action: invoice ? { label: t('flow.reviewInvoice'), icon: 'file-text', onPress: () => router.push(`/invoice/${invoice.id}`) } : undefined,
        };
      case 'invoiceSent':
        return {
          title: t('flow.invoiceSent'),
          body: t('flow.invoiceSentBody'),
          action: invoice ? { label: t('flow.markPaid'), icon: 'dollar-sign', onPress: () => actions.markPaid(invoice.id) } : undefined,
          extra: invoice ? <Button label={t('flow.viewInvoice')} variant="ghost" onPress={() => router.push(`/invoice/${invoice.id}`)} /> : undefined,
        };
      default:
        return { title: t('flow.paidDone'), body: t('flow.paidBody') };
    }
  })();

  // ---------- timeline, newest day first ----------
  const byDate = new Map<string, ReactNode[]>();
  const add = (date: string, node: ReactNode) => byDate.set(date, [...(byDate.get(date) ?? []), node]);

  for (const item of sample.timeline.filter((x) => x.jobId === job.id)) {
    if (item.kind === 'photos') {
      add(
        item.date,
        <Card key={item.id} style={{ gap: 10 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="small" muted>{t('job.photos', { count: item.tags.length })}</T>
            <T v="small" muted>{item.time}</T>
          </Row>
          <Row gap={8}>
            {item.tags.slice(0, 3).map((tag, i) => (
              <PhotoTile key={i} tag={t(`job.${tag}`)} />
            ))}
          </Row>
        </Card>,
      );
    } else {
      add(
        item.date,
        <Card key={item.id}>
          <Row style={{ alignItems: 'flex-start' }} gap={12}>
            <IconButton icon="play" label={t('job.play')} tone="dark" />
            <View style={{ flex: 1, gap: 4 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T v="small" muted>{t('job.voiceNote', { length: item.length })}</T>
                <T v="small" muted>{item.time}</T>
              </Row>
              <T v="body">“{item.transcript}”</T>
            </View>
          </Row>
        </Card>,
      );
    }
  }
  for (const { receipt, items, cost } of receiptsOnJob(state, job.id)) {
    add(
      receipt.date,
      <Card key={receipt.id} style={{ paddingVertical: 8 }}>
        <ListRow
          icon="file-text"
          title={t('job.receiptLine', { store: receipt.store, count: items.length })}
          sub={items.map((i) => state.fixedNames[i.id] ?? i.name).join(', ')}
          right={<T v="money">{f.money(cost)}</T>}
          onPress={() => router.push(`/receipt/${receipt.id}`)}
          chevron={false}
        />
      </Card>,
    );
  }
  for (const entry of state.timeEntries.filter((x) => x.jobId === job.id)) {
    add(
      entry.date,
      <Card key={entry.id} style={{ paddingVertical: 8 }}>
        <ListRow icon="clock" title={t('job.hoursLine', { note: entry.note || t('job.hours') })} right={<T v="money">{f.qty(entry.hundredths)} h</T>} />
      </Card>,
    );
  }
  for (const c of state.captures.filter((x) => x.jobId === job.id)) {
    add(
      c.date,
      c.kind === 'photo' ? (
        <Card key={c.id} style={{ gap: 10 }}>
          <T v="small" muted>{t('job.photos', { count: 1 })}</T>
          <PhotoTile tag={t('job.during')} height={120} flex={false} />
        </Card>
      ) : (
        <Card key={c.id} style={{ paddingVertical: 8 }}>
          <ListRow icon={c.kind === 'voice' ? 'mic' : 'edit-3'} title={c.text || t('job.voiceNote', { length: '0:15' })} />
        </Card>
      ),
    );
  }
  const days = [...byDate.keys()].sort().reverse();
  const canCapture = stage === 'estimate' || stage === 'work';

  return (
    <Screen
      header={
        <>
          <PageHeader
            title={job.title}
            back={() => router.back()}
            right={
              <>
                <IconButton icon="phone" label={t('job.call', { name: customer.firstName })} />
                <IconButton icon="message-square" label={t('job.text', { name: customer.firstName })} />
              </>
            }
          />
          <Stepper stage={stage} />
        </>
      }
      footer={next.action ? <Button label={next.action.label} icon={next.action.icon} big onPress={next.action.onPress} /> : undefined}>
      <T v="small" muted>
        {customer.name} · {job.address}
        {job.workOrder ? ` · ${t('job.workOrder', { number: job.workOrder })}` : ''}
      </T>

      <Card tone={stage === 'paid' ? 'inverse' : 'plain'} style={{ gap: 6 }}>
        <T v="h2" color={stage === 'paid' ? p.onInverse : undefined}>{next.title}</T>
        <T v="body" color={stage === 'paid' ? p.onInverseMuted : p.muted}>{next.body}</T>
        {next.extra}
      </Card>

      <Card style={{ flexDirection: 'row', paddingHorizontal: 6 }}>
        <Stat label={t('job.labor')} value={job.pricing === 'hourly' && job.rateCents ? t('job.perHour', { amount: f.money(job.rateCents) }) : t('job.flat')} />
        <Stat label={t('job.hours')} value={f.qty(hoursFor(state, job.id))} />
        <Stat label={t('job.partsCost')} value={f.money(partsCost(state, job.id))} last />
      </Card>

      {canCapture ? (
        <Row gap={8}>
          <Button
            label={t('flow.photo')}
            icon="camera"
            variant="soft"
            stacked
            style={{ backgroundColor: p.card }}
            onPress={() => {
              actions.addCapture(job.id, 'photo');
              setPhotoAdded(true);
            }}
          />
          <Button label={t('flow.note')} icon="edit-3" variant="soft" stacked style={{ backgroundColor: p.card }} onPress={() => setNoteOpen(true)} />
          <Button label={t('flow.receipt')} icon="file-text" variant="soft" stacked style={{ backgroundColor: p.card }} onPress={() => {
              const r = sample.receipts.find((x) => unsortedItems(state, x).length > 0) ?? sample.receipts[0];
              if (r) router.push(`/receipt/${r.id}`);
              else setReceiptSoon(true);
            }} />
          {job.pricing === 'hourly' ? (
            <Button label={t('job.logHours')} icon="clock" variant="soft" stacked style={{ backgroundColor: p.card }} onPress={() => setHoursOpen(true)} />
          ) : null}
        </Row>
      ) : null}
      {photoAdded ? <Notice text={t('flow.photoAdded')} icon="camera" /> : null}
      {receiptSoon ? <Notice text={t('capture.receiptSoon')} icon="info" tone="soft" /> : null}

      {co || draft || sentEstimate ? (
        <Row gap={8}>
          {draft || sentEstimate ? (
            <Button
              label={t('flow.viewEstimate')}
              icon="clipboard"
              variant="soft"
              stacked
              style={{ backgroundColor: p.card }}
              onPress={() => router.push(draft && !draft.signed && !sentEstimate ? builderRoute : customerEstimateRoute)}
            />
          ) : null}
          {co ? (
            <Button label={t('job.changeOrder')} icon="edit-3" variant="soft" stacked style={{ backgroundColor: p.card }} onPress={() => router.push(`/change-order/${co.id}`)} />
          ) : null}
        </Row>
      ) : null}

      {job.privateNote ? (
        <Card tone="flag" style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Icon name="lock" color={p.onFlag} />
          <View style={{ flex: 1, gap: 2 }}>
            <T v="label" color={p.onFlag}>{job.privateNote}</T>
            <T v="small" color={p.onFlag}>{t('common.privateNote')}</T>
          </View>
        </Card>
      ) : null}

      {days.length === 0 ? <T v="body" muted>{t('job.noTimeline')}</T> : null}
      {days.map((day) => (
        <View key={day} style={{ gap: 10 }}>
          <T style={{ fontFamily: font.black, fontSize: 18, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 8 }}>
            {day === sample.TODAY ? t('common.today') : f.date(day)}
          </T>
          {byDate.get(day)}
        </View>
      ))}

      <Sheet open={hoursOpen} onClose={() => setHoursOpen(false)} title={t('logHours.title')}>
        <Field label={t('logHours.hours')} value={hoursText} onChangeText={setHoursText} keyboardType="decimal-pad" placeholder="2.5" />
        {hoursText && hoursValue === null ? <T v="small" color={p.danger}>{t('logHours.bad')}</T> : null}
        <Field label={t('logHours.note')} value={hoursNote} onChangeText={setHoursNote} placeholder={t('logHours.notePlaceholder')} />
        <Hair />
        <Button
          label={t('common.save')}
          disabled={hoursValue === null}
          onPress={() => {
            if (hoursValue === null) return;
            actions.logHours(job.id, hoursValue, hoursNote.trim());
            setHoursText('');
            setHoursNote('');
            setHoursOpen(false);
          }}
        />
      </Sheet>

      <Sheet open={noteOpen} onClose={() => setNoteOpen(false)} title={t('flow.note')}>
        <Field value={noteText} onChangeText={setNoteText} placeholder={t('capture.notePlaceholder')} multiline autoFocus style={{ minHeight: 120, paddingTop: 14, textAlignVertical: 'top' }} />
        <Button
          label={t('common.save')}
          disabled={!noteText.trim()}
          onPress={() => {
            actions.addCapture(job.id, 'note', noteText.trim());
            setNoteText('');
            setNoteOpen(false);
          }}
        />
      </Sheet>
    </Screen>
  );
}
