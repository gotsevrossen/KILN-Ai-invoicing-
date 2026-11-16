import { router } from 'expo-router';

import { LogoMark } from '@/components/logo';
import { Button, Card, Icon, IconButton, ListRow, Notice, Pill, Row, Screen, T } from '@/components/ui';
import * as sample from '@/data/sample';
import { changeOrderTotal, homeSummary, invoiceForJob, invoiceTotals, jobAmount, jobById, jobOverdueDays, jobStatus, unsortedItems } from '@/data/selectors';
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

  const summary = homeSummary(state);
  // one card for everything waiting on the owner (a new account has none of these)
  const receipts = sample.receipts.filter((r) => unsortedItems(state, r).length > 0);
  const drafts = sample.invoices.filter((i) => !state.sentInvoices.includes(i.id));
  const changes = sample.changeOrders.filter((c) => !state.signed[c.id] && !state.declinedChanges.includes(c.id));
  const overdueJobs = sample.jobs.filter((j) => jobStatus(state, j) === 'overdue');
  const pendingUploads = state.mode === 'example' ? sample.business.pendingUploads : 0;
  const noJobs = sample.jobs.length === 0;
  const nothing = !noJobs && receipts.length + drafts.length + changes.length + overdueJobs.length === 0;

  return (
    <Screen
      tabs
      header={
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={10}>
            <LogoMark size={34} />
            {/* line height matches the font's own, so the capitals sit level with the logo's middle */}
            <T style={{ fontFamily: font.black, fontSize: 26, lineHeight: 28, letterSpacing: 4, includeFontPadding: false }}>KILN</T>
          </Row>
          <Row>
            {pendingUploads ? <Pill label={t('home.upload', { count: pendingUploads })} tone="plain" /> : null}
            <IconButton icon="settings" label={t('home.settings')} onPress={() => router.push('./settings')} />
          </Row>
        </Row>
      }>

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

      {state.syncError ? <Notice text={t('auth.syncFailed', { reason: state.syncError })} tone="danger" icon="alert-circle" /> : null}
      {nothing ? <Notice text={t('home.allClear')} /> : null}

      {noJobs ? (
        <Card style={{ gap: 12 }}>
          <T v="h2">{t('home.firstJobTitle')}</T>
          <T v="body" muted>{t('home.firstJobBody')}</T>
          <Button label={t('home.firstJob')} icon="plus" big onPress={() => router.push('/new-job')} />
        </Card>
      ) : null}

      {receipts.map((receipt) => {
        const count = unsortedItems(state, receipt).length;
        const when = receipt.date === sample.TODAY ? t('common.today') : f.date(receipt.date);
        return (
          <Card key={receipt.id} onPress={() => router.push(`/receipt/${receipt.id}`)} label={t('home.sortReceipt', { count })} style={{ paddingVertical: 10 }}>
            <ListRow
              icon="file-text"
              iconTone="flag"
              title={t('home.sortReceipt', { count })}
              sub={`${receipt.store} · ${when} · ${f.money(receipt.items.reduce((a, i) => a + i.costCents, 0) + receipt.taxCents)}`}
              chevron
            />
          </Card>
        );
      })}

      {drafts.map((invoice) => (
        <Card key={invoice.id} onPress={() => router.push(`/invoice/${invoice.id}`)} label={t('home.invoiceReady')} style={{ paddingVertical: 10 }}>
          <ListRow
            icon="file"
            iconTone="accent"
            title={t('home.invoiceReady')}
            sub={`${jobById(invoice.jobId).title} · ${f.money(invoiceTotals(state, invoice).total)}`}
            chevron
          />
        </Card>
      ))}

      {changes.map((co) => (
        <Card key={co.id} onPress={() => router.push(`/job/${co.jobId}`)} label={t('home.waitingSignature')} style={{ paddingVertical: 10 }}>
          <ListRow
            icon="edit-3"
            title={t('home.waitingSignature')}
            sub={t('home.changeOrderLine', { job: jobById(co.jobId).title, amount: f.money(co.amountCents) })}
            right={<T v="small" muted>{f.money(changeOrderTotal(co))}</T>}
            chevron
          />
        </Card>
      ))}

      {overdueJobs.map((job) => (
        <Card key={job.id} label={job.title} style={{ paddingVertical: 10 }} onPress={() => {
          const bill = invoiceForJob(job.id);
          router.push(bill ? `/invoice/${bill.id}` : `/job/${job.id}`);
        }}>
          <ListRow
            icon="clock"
            iconTone="danger"
            title={t('home.overdueDays', { count: jobOverdueDays(state, job) })}
            sub={`${job.title} · ${f.money(jobAmount(state, job))}`}
            chevron
          />
        </Card>
      ))}

      {state.mode === 'example' ? (
        <Row style={{ justifyContent: 'center', marginTop: 12 }} gap={6}>
          <Icon name="info" size={14} color={p.muted} />
          <T v="small" muted>{t('common.exampleData')}</T>
        </Row>
      ) : null}
    </Screen>
  );
}
