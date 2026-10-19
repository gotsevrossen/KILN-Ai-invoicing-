import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { Button, Card, Field, Hair, Icon, IconButton, ListRow, PageHeader, PhotoTile, Row, Screen, T } from '@/components/ui';
import * as sample from '@/data/sample';
import { changeOrdersForJob, customerOf, hoursFor, invoiceForJob, jobById, partsCost, receiptsOnJob } from '@/data/selectors';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';
import { font, radius } from '@/theme/tokens';
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
  const estimateRoute = job.id === 'walsh' ? '/estimate/walsh' : job.id === 'gomez' ? '/customer/estimate/e-208' : null;

  const [hoursOpen, setHoursOpen] = useState(false);
  const [hoursText, setHoursText] = useState('');
  const [hoursNote, setHoursNote] = useState('');
  const hoursValue = parseHours(hoursText);

  // Build the timeline, newest day first.
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
          sub={items.map((i) => i.name).join(', ')}
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

  return (
    <Screen
      footer={
        invoice ? (
          <Button label={t('job.jobDone')} icon="check" big onPress={() => router.push(`/invoice/${invoice.id}`)} />
        ) : undefined
      }>
      <PageHeader
        title={job.title}
        sub={`${customer.name} · ${job.address}${job.workOrder ? ` · ${t('job.workOrder', { number: job.workOrder })}` : ''}`}
        back={() => router.back()}
        right={
          <>
            <IconButton icon="phone" label={t('job.call', { name: customer.firstName })} />
            <IconButton icon="message-square" label={t('job.text', { name: customer.firstName })} />
          </>
        }
      />

      <Card style={{ flexDirection: 'row', paddingHorizontal: 6 }}>
        <Stat label={t('job.labor')} value={job.pricing === 'hourly' && job.rateCents ? t('job.perHour', { amount: f.money(job.rateCents) }) : t('job.flat')} />
        <Stat label={t('job.hours')} value={f.qty(hoursFor(state, job.id))} />
        <Stat label={t('job.partsCost')} value={f.money(partsCost(state, job.id))} last />
      </Card>

      <Row gap={8}>
        {job.pricing === 'hourly' ? <Button label={t('job.logHours')} icon="clock" variant="soft" flex style={{ backgroundColor: p.card }} onPress={() => setHoursOpen(true)} /> : null}
        {co ? <Button label={t('job.changeOrder')} icon="edit-3" variant="soft" flex style={{ backgroundColor: p.card }} onPress={() => router.push(`/change-order/${co.id}`)} /> : null}
        {estimateRoute ? <Button label={t('job.estimate')} icon="clipboard" variant="soft" flex style={{ backgroundColor: p.card }} onPress={() => router.push(estimateRoute)} /> : null}
      </Row>

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
      <View style={{ height: 8, borderRadius: radius.pill }} />
    </Screen>
  );
}
