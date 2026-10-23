import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import * as sample from '@/data/sample';
import { receiptsOnJob } from '@/data/selectors';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';
import { lineTotal } from '@/lib/money';
import { font } from '@/theme/tokens';

import { Card, IconButton, ListRow, PhotoTile, Row, T } from './ui';

export interface ActivityItem {
  key: string;
  date: string;
  node: ReactNode;
}

/**
 * Everything captured on a job, newest day first. Within a day, what the owner
 * just added (notes, photos, work, hours) comes before the rest.
 */
export function useJobActivity(jobId: string): ActivityItem[] {
  const { t } = useLang();
  const f = useFormat();
  const { state } = useStore();
  const items: ActivityItem[] = [];

  for (const c of state.captures.filter((x) => x.jobId === jobId).reverse()) {
    items.push({
      key: c.id,
      date: c.date,
      node: c.kind === 'photo' ? (
        <Card key={c.id} style={{ gap: 10 }}>
          <T v="small" muted>{t('job.photos', { count: 1 })}</T>
          <PhotoTile tag={t('job.during')} height={120} flex={false} />
        </Card>
      ) : (
        <Card key={c.id} style={{ paddingVertical: 8 }}>
          <ListRow icon={c.kind === 'voice' ? 'mic' : 'edit-3'} title={c.text || t('job.voiceNote', { length: '0:15' })} />
        </Card>
      ),
    });
  }
  for (const w of state.workItems.filter((x) => x.jobId === jobId).reverse()) {
    items.push({
      key: w.id,
      date: w.date,
      node: (
        <Card key={w.id} style={{ paddingVertical: 8 }}>
          <ListRow icon="tool" title={w.description} sub={t('job.work')} right={<T v="money">{f.money(lineTotal(w.qtyHundredths, w.unitCents))}</T>}
            onPress={() => router.push(`/job/${jobId}/costs`)} chevron={false} />
        </Card>
      ),
    });
  }
  for (const entry of state.timeEntries.filter((x) => x.jobId === jobId).reverse()) {
    items.push({
      key: entry.id,
      date: entry.date,
      node: (
        <Card key={entry.id} style={{ paddingVertical: 8 }}>
          <ListRow icon="clock" title={t('job.hoursLine', { note: entry.note || t('job.hours') })} right={<T v="money">{f.qty(entry.hundredths)} h</T>} />
        </Card>
      ),
    });
  }
  for (const { receipt, items: lines, cost } of receiptsOnJob(state, jobId)) {
    items.push({
      key: receipt.id,
      date: receipt.date,
      node: (
        <Card key={receipt.id} style={{ paddingVertical: 8 }}>
          <ListRow
            icon="file-text"
            title={t('job.receiptLine', { store: receipt.store, count: lines.length })}
            sub={lines.map((i) => state.fixedNames[i.id] ?? i.name).join(', ')}
            right={<T v="money">{f.money(cost)}</T>}
            onPress={() => router.push(`/receipt/${receipt.id}`)}
            chevron={false}
          />
        </Card>
      ),
    });
  }
  for (const item of sample.timeline.filter((x) => x.jobId === jobId)) {
    items.push({
      key: item.id,
      date: item.date,
      node: item.kind === 'photos' ? (
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
        </Card>
      ) : (
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
        </Card>
      ),
    });
  }
  // newest day first; the sort keeps the order above within a day
  return items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Activity under a heading per day (Today, Oct 19…). */
export function ActivityDays({ items }: { items: ActivityItem[] }) {
  const { t } = useLang();
  const f = useFormat();
  const days = [...new Set(items.map((i) => i.date))];
  return (
    <>
      {days.map((day) => (
        <View key={day} style={{ gap: 10 }}>
          <T style={{ fontFamily: font.black, fontSize: 18, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 8 }}>
            {day === sample.TODAY ? t('common.today') : f.date(day)}
          </T>
          {items.filter((i) => i.date === day).map((i) => i.node)}
        </View>
      ))}
    </>
  );
}
