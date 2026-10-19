import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Icon, IconButton, ListRow, Notice, Pill, Row, Screen, T } from '@/components/ui';
import * as sample from '@/data/sample';
import { changeOrderTotal, homeSummary, invoiceTotals, jobById, receiptById, unsortedItems } from '@/data/selectors';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';
import { font, radius } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

export default function Home() {
  const p = usePalette();
  const { t } = useLang();
  const f = useFormat();
  const { state } = useStore();
  const [reminded, setReminded] = useState(false);

  const summary = homeSummary(state);
  const receipt = receiptById('hd-4471');
  const unsorted = unsortedItems(state, receipt);
  const invoice = sample.invoices[0];
  const invoiceOpen = !state.sentInvoices.includes(invoice.id);
  const co = sample.changeOrders[0];
  const coOpen = !state.signed[co.id];
  const overdueJobs = sample.jobs.filter((j) => j.baseStatus === 'overdue');
  const nothing = unsorted.length === 0 && !invoiceOpen && !coOpen && overdueJobs.length === 0;

  return (
    <Screen tabs>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={10}>
          <View style={{ width: 16, height: 16, borderRadius: 5, backgroundColor: p.accent }} />
          <T style={{ fontFamily: font.black, fontSize: 26, letterSpacing: 4 }}>KILN</T>
        </Row>
        <Row>
          <Pill label={t('home.upload', { count: sample.business.pendingUploads })} tone="plain" />
          <IconButton icon="settings" label={t('home.settings')} onPress={() => router.push('/settings')} />
        </Row>
      </Row>

      <Card tone="accent" style={{ padding: 22, gap: 6, borderRadius: radius.lg }}>
        <T v="eyebrow" color={p.onAccent}>{t('home.owedToYou')}</T>
        <T v="moneyBig" color={p.onAccent}>{f.money(summary.owed)}</T>
        <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 6 }} gap={6}>
          <T v="label" color={p.onAccent}>
            {t('home.overdue', { count: summary.overdueCount })} · {f.money(summary.overdueCents)}
          </T>
          <T v="small" color={p.onAccent}>
            {t('home.paidIn', { month: f.month(sample.TODAY) })} · {f.money(summary.paidCents)}
          </T>
        </Row>
      </Card>

      <Row style={{ justifyContent: 'space-between', marginTop: 8 }}>
        <T v="title" style={{ fontSize: 28, lineHeight: 30 }} accessibilityRole="header">{t('home.needsYou')}</T>
      </Row>

      {nothing ? <Notice text={t('home.allClear')} /> : null}

      {unsorted.length > 0 ? (
        <Card onPress={() => router.push(`/receipt/${receipt.id}`)} label={t('home.sortReceipt', { count: unsorted.length })} style={{ paddingVertical: 10 }}>
          <ListRow
            icon="file-text"
            iconTone="flag"
            title={t('home.sortReceipt', { count: unsorted.length })}
            sub={`${receipt.store} · ${t('common.today')} · ${f.money(receipt.items.reduce((a, i) => a + i.costCents, 0) + receipt.taxCents)}`}
            chevron
          />
        </Card>
      ) : null}

      {invoiceOpen ? (
        <Card onPress={() => router.push(`/invoice/${invoice.id}`)} label={t('home.invoiceReady')} style={{ paddingVertical: 10 }}>
          <ListRow
            icon="file"
            iconTone="accent"
            title={t('home.invoiceReady')}
            sub={`${jobById(invoice.jobId).title} · ${f.money(invoiceTotals(state, invoice).total)}`}
            chevron
          />
        </Card>
      ) : null}

      {coOpen ? (
        <Card onPress={() => router.push(`/job/${co.jobId}`)} label={t('home.waitingSignature')} style={{ paddingVertical: 10 }}>
          <ListRow
            icon="edit-3"
            title={t('home.waitingSignature')}
            sub={t('home.changeOrderLine', { job: jobById(co.jobId).title, amount: f.money(co.amountCents) })}
            right={<T v="small" muted>{f.money(changeOrderTotal(co))}</T>}
            chevron
          />
        </Card>
      ) : null}

      {overdueJobs.map((job) => (
        <Card key={job.id} style={{ paddingVertical: 10 }}>
          <ListRow
            icon="clock"
            iconTone="danger"
            title={t('home.overdueDays', { count: job.overdueDays ?? 0 })}
            sub={`${job.title} · ${f.money(job.amountCents ?? 0)}`}
            chevron={false}
            right={<Button label={t('home.remind')} icon="send" variant="dark" onPress={() => setReminded(true)} style={{ minHeight: 48, paddingHorizontal: 14 }} />}
          />
        </Card>
      ))}

      {reminded ? <Notice text={t('home.reminderReady')} icon="message-square" /> : null}

      <Row style={{ justifyContent: 'center', marginTop: 12 }} gap={6}>
        <Icon name="info" size={14} color={p.muted} />
        <T v="small" muted>{t('common.exampleData')}</T>
      </Row>
    </Screen>
  );
}
