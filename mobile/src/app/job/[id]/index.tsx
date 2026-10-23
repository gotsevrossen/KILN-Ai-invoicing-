import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { aiErrorText } from '@/components/ai-parts';
import { ActivityDays, useJobActivity } from '@/components/job-activity';
import { useJobDocs, type DocStatus } from '@/components/job-docs';
import { RecordGate } from '@/components/record-gate';
import { Sheet } from '@/components/sheet';
import { Stepper } from '@/components/stepper';
import { WorkSheet } from '@/components/work-sheet';
import { Button, Card, Field, Hair, Icon, IconButton, ListRow, Notice, PageHeader, Row, Screen, T, type IconName } from '@/components/ui';
import { aiReady, draftChange, type ChangeDraft } from '@/data/ai';
import * as sample from '@/data/sample';
import { canDeleteJob, changeOrdersForJob, customerOf, hasJob, hoursFor, invoiceForJob, jobById, jobStage, partsCost, type Stage, workTotal } from '@/data/selectors';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { priceChange } from '@/lib/ai-check';
import { callNumber, dialable, textNumber } from '@/lib/contact';
import { useFormat } from '@/lib/format';
import { usePalette } from '@/theme/use-palette';

function parseHours(text: string): number | null {
  const n = Number(text.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0 || n > 24) return null;
  return Math.round(n * 100);
}

function JobDetail() {
  const p = usePalette();
  const { t } = useLang();
  const f = useFormat();
  const { state, actions } = useStore();
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = jobById(id);
  const customer = customerOf(job);
  const invoice = invoiceForJob(job.id);
  const changes = changeOrdersForJob(job.id);
  const pendingChange = changes.find((change) => !state.signed[change.id] && !state.declinedChanges.includes(change.id));
  const co = pendingChange ?? changes[changes.length - 1];
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [photoAdded, setPhotoAdded] = useState(false);
  const [workOpen, setWorkOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [changeDescription, setChangeDescription] = useState('');
  const [changePrice, setChangePrice] = useState('');
  const changeCents = /^\d{1,6}([.,]\d{1,2})?$/.test(changePrice)
    ? Math.round(Number(changePrice.replace(',', '.')) * 100) : null;
  // KILN writes up the owner's quick note for the customer and prices it from the owner's own list
  const [changeDraft, setChangeDraft] = useState<ChangeDraft | null>(null);
  const [changeDrafting, setChangeDrafting] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);
  const draftWithKiln = () => {
    setChangeDrafting(true);
    setChangeError(null);
    draftChange({
      lang: customer.lang,
      title: job.title.slice(0, 200),
      note: changeDescription.slice(0, 2000),
      agreed: (draft?.lines ?? []).filter((l) => !l.excluded).slice(0, 100).map((l) => l.description.slice(0, 300)),
      items: state.priceList.slice(0, 400).map((i) => ({ id: i.id, name: i.name.slice(0, 160), unit: i.unit })),
    })
      .then((d) => {
        setChangeDescription(d.description);
        const { cents } = priceChange(d, state.priceList);
        if (cents !== null) setChangePrice((cents / 100).toFixed(2));
        setChangeDraft(d);
      }, (e: unknown) => setChangeError(aiErrorText(t, e)))
      .finally(() => setChangeDrafting(false));
  };
  const changePriced = changeDraft ? priceChange(changeDraft, state.priceList) : null;
  const itemName = (itemId: string) => state.priceList.find((i) => i.id === itemId)?.name ?? itemId;
  const hoursValue = parseHours(hoursText);
  const canUnskip = state.skippedEstimates.includes(job.id) && !draft?.signed && !draft?.sent && !invoice && !co;

  // ---------- tapping the progress bar ----------
  // a draft opens in the builder; once sent or signed, it opens as the customer sees it
  const estimateRoute: Href = draft && !draft.signed && !sentEstimate ? builderRoute : draft || sentEstimate ? customerEstimateRoute : builderRoute;
  const onStep: Partial<Record<Stage, () => void>> = {
    estimate: canUnskip
      ? () => actions.unskipEstimate(job.id)
      : draft || sentEstimate || stage === 'estimate'
        ? () => router.push(estimateRoute)
        : undefined,
    // back from an unsent invoice draft; a sent invoice locks the work
    work: detail === 'invoiceDraft' ? () => actions.reopenWork(job.id) : undefined,
    // only opens an invoice that exists, so a stray tap never makes one
    invoice: invoice && stage !== 'paid' ? () => router.push(`/invoice/${actions.finishJob(job.id)}`) : undefined,
    paid: invoice && stage === 'paid' ? () => router.push(`/invoice/${invoice.id}`) : undefined,
  };

  // ---------- what's next ----------
  type Next = { title: string; body: string; action?: { label: string; icon: IconName; onPress: () => void }; extra?: ReactNode };
  const next: Next = (() => {
    switch (detail) {
      case 'estimateDraft':
        return {
          title: t('flow.estimateDraft'),
          body: t('flow.estimateDraftBody'),
          action: { label: t('flow.buildEstimate'), icon: 'clipboard', onPress: () => router.push(builderRoute) },
          extra: <Button label={t('flow.skipEstimate')} variant="outline" onPress={() => actions.skipEstimate(job.id)} />,
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
          // undo a skipped estimate, but only while nothing has been signed or invoiced
          extra: canUnskip ? <Button label={t('flow.backToEstimate')} icon="corner-up-left" variant="outline" onPress={() => actions.unskipEstimate(job.id)} /> : undefined,
        };
      case 'invoiceDraft':
        return {
          title: t('flow.invoiceDraft'),
          body: t('flow.invoiceDraftBody'),
          action: invoice ? { label: t('flow.reviewInvoice'), icon: 'file-text', onPress: () => router.push(`/invoice/${invoice.id}`) } : undefined,
          // not sent yet, so the owner can still add hours, photos, or receipts
          extra: <Button label={t('flow.backToWork')} icon="corner-up-left" variant="outline" onPress={() => actions.reopenWork(job.id)} />,
        };
      case 'invoiceSent':
        return {
          title: t('flow.invoiceSent'),
          body: t('flow.invoiceSentBody'),
          action: invoice ? { label: t('flow.markPaid'), icon: 'dollar-sign', onPress: () => actions.markPaid(invoice.id) } : undefined,
          extra: invoice ? <Button label={t('flow.viewInvoice')} variant="outline" onPress={() => router.push(`/invoice/${invoice.id}`)} /> : undefined,
        };
      default:
        return { title: t('flow.paidDone'), body: t('flow.paidBody') };
    }
  })();

  // ---------- summaries: each opens its own page ----------
  const activity = useJobActivity(job.id);
  const docs = useJobDocs(job);
  const status = (x: DocStatus) => t(`job.docStatus.${x}`);
  const docsSub = [
    docs.estimate ? `${t('job.estimate')}: ${status(docs.estimate.status)}` : null,
    ...docs.changes.map(({ co: c, status: x }) => `${t('job.changeOrder')} #${c.number}: ${status(x)}`),
    docs.invoiceStatus ? `${t('flow.invoice')}: ${status(docs.invoiceStatus)}` : null,
  ].filter(Boolean).join(' · ') || t('job.noDocuments');
  const hours = hoursFor(state, job.id);
  const costSub = [
    job.pricing === 'hourly' && job.rateCents ? t('job.perHour', { amount: f.money(job.rateCents) }) : t('job.flat'),
    job.pricing === 'hourly' || hours > 0 ? `${f.qty(hours)} h` : null,
    `${t('job.partsCost')} ${f.money(partsCost(state, job.id))}`,
    state.workItems.some((w) => w.jobId === job.id) ? t('job.workTotal', { amount: f.money(workTotal(state, job.id)) }) : null,
  ].filter(Boolean).join(' · ');
  // photos and notes help on a site visit; work, receipts, and hours wait for the Work step
  const canCapture = stage === 'estimate' || stage === 'work';
  const canLogWork = stage === 'work';

  return (
    <Screen
      header={
        <>
          <PageHeader
            title={job.title}
            back={() => router.back()}
            right={
              dialable(customer.phone) ? (
                <>
                  <IconButton icon="phone" label={t('job.call', { name: customer.firstName })} onPress={() => callNumber(customer.phone)} />
                  <IconButton icon="message-square" label={t('job.text', { name: customer.firstName })} onPress={() => textNumber(customer.phone)} />
                </>
              ) : undefined
            }
          />
          <Stepper stage={stage} onStep={onStep} />
        </>
      }
      footer={next.action ? <Button label={next.action.label} icon={next.action.icon} big onPress={next.action.onPress} /> : undefined}>
      <Card style={{ paddingVertical: 6, gap: 0 }}>
        <ListRow
          icon="user"
          title={customer.name}
          sub={`${job.address}${job.workOrder ? ` · ${t('job.workOrder', { number: job.workOrder })}` : ''}`}
          onPress={() => router.push(`/job/${job.id}/customer`)}
        />
        {job.privateNote ? (
          <Row gap={10} style={{ alignItems: 'flex-start', borderTopWidth: 1, borderTopColor: p.line, paddingVertical: 10 }}>
            <Icon name="lock" size={18} color={p.muted} />
            <View style={{ flex: 1, gap: 2 }}>
              <T v="label">{job.privateNote}</T>
              <T v="small" muted>{t('common.privateNote')}</T>
            </View>
          </Row>
        ) : null}
      </Card>

      <Card tone={stage === 'paid' ? 'inverse' : 'plain'} style={{ gap: 6 }}>
        <T v="h2" color={stage === 'paid' ? p.onInverse : undefined}>{next.title}</T>
        <T v="body" color={stage === 'paid' ? p.onInverseMuted : p.muted}>{next.body}</T>
        {next.extra}
      </Card>

      {canLogWork ? (
        <Row gap={8}>
          <Button label={t('flow.workDone')} icon="tool" variant="soft" stacked style={{ backgroundColor: p.card }} onPress={() => setWorkOpen(true)} />
          <Button label={t('flow.receipt')} icon="file-text" variant="soft" stacked style={{ backgroundColor: p.card }}
            onPress={() => router.push({ pathname: '/receipt/new', params: { job: job.id } })} />
        </Row>
      ) : null}
      {canCapture ? (
        <Row gap={8}>
          {/* every job: hourly jobs bill these; flat-price jobs keep them for the owner's records */}
          {canLogWork ? <Button label={t('job.logHours')} icon="clock" variant="soft" stacked style={{ backgroundColor: p.card }} onPress={() => setHoursOpen(true)} /> : null}
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
        </Row>
      ) : null}
      {photoAdded ? <Notice text={t('flow.photoAdded')} icon="camera" /> : null}
      {(stage === 'work' || detail === 'invoiceDraft') ? <Button label={t('review.newChange')} variant="outline" icon="plus"
        onPress={() => pendingChange ? router.push(`/change-order/${pendingChange.id}`) : setChangeOpen(true)} /> : null}

      <Card style={{ gap: 4 }}>
        <ListRow icon="dollar-sign" title={t('job.costs')} sub={costSub} onPress={() => router.push(`/job/${job.id}/costs`)} />
        <Hair />
        <ListRow icon="folder" iconTone={pendingChange ? 'flag' : 'soft'} title={t('job.documents')} sub={docsSub}
          onPress={() => router.push(`/job/${job.id}/documents`)} />
      </Card>

      {activity.length === 0 ? <T v="body" muted>{t('job.noTimeline')}</T> : <ActivityDays items={activity.slice(0, 3)} />}
      {activity.length > 3 ? (
        <Button label={t('job.seeAll', { count: activity.length })} icon="list" variant="outline" onPress={() => router.push(`/job/${job.id}/activity`)} />
      ) : null}

      {/* only while nothing on it was sent or signed */}
      {canDeleteJob(state, job) ? (
        <Button label={t('job.delete')} icon="trash-2" variant="outline" style={{ marginTop: 16 }} onPress={() => setDeleteOpen(true)} />
      ) : null}

      <Sheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t('job.deleteTitle')}>
        <T v="body">{t('job.deleteBody')}</T>
        <Button label={t('job.delete')} icon="trash-2" variant="danger" big onPress={() => {
          setDeleteOpen(false);
          if (router.canGoBack()) router.back();
          else router.replace('/jobs');
          // once this screen has closed, so it never shows a job that's gone
          setTimeout(() => actions.deleteJob(job.id), 400);
        }} />
        <Button label={t('common.cancel')} variant="outline" onPress={() => setDeleteOpen(false)} />
      </Sheet>

      <Sheet open={changeOpen} onClose={() => setChangeOpen(false)} title={t('review.newChange')}>
        <T muted>{aiReady(state.mode) ? t('ai.changeHelp') : t('review.changeHelp')}</T>
        <Field label={t('review.changeDescription')} value={changeDescription} onChangeText={setChangeDescription}
          multiline maxLength={2000} style={{ minHeight: 100, paddingTop: 14, textAlignVertical: 'top' }} />
        {aiReady(state.mode) ? (
          <Button label={changeDrafting ? t('ai.writing') : t('ai.draftChange')} icon="zap" variant="outline"
            disabled={changeDrafting || !changeDescription.trim()} onPress={draftWithKiln} />
        ) : null}
        {changeError ? <T v="small" color={p.danger}>{changeError}</T> : null}
        <Field label={t('review.changePrice')} value={changePrice} onChangeText={setChangePrice} keyboardType="decimal-pad" />
        {changeDraft && changePriced ? (
          <View style={{ gap: 4 }}>
            {changeDraft.statedCents !== null ? <T v="small" muted>{t('ai.changeStated')}</T> : null}
            {changeDraft.quantities.map((q) => {
              const unitCents = state.priceList.find((i) => i.id === q.itemId)?.unitCents ?? null;
              return <T key={q.itemId} v="small" muted>
                {`${f.qty(q.qtyHundredths)} × ${itemName(q.itemId)} · ${unitCents === null ? t('estimate.needsPrice') : f.money(unitCents)}`}
              </T>;
            })}
            {changePriced.unpriced.length ? (
              <Notice text={t('ai.changeUnpriced', { items: changePriced.unpriced.map(itemName).join(', ') })} icon="alert-triangle" tone="flag" />
            ) : changePriced.cents === null ? <Notice text={t('ai.changeNoPrice')} icon="info" tone="soft" /> : null}
          </View>
        ) : null}
        <Button label={t('review.changeCreate')} disabled={!changeDescription.trim() || changeCents === null} onPress={() => {
          if (changeCents === null) return;
          const changeId = actions.createChangeOrder(job.id, changeDescription, changeCents);
          if (!changeId) return;
          setChangeOpen(false);
          setChangeDescription('');
          setChangePrice('');
          setChangeDraft(null);
          setTimeout(() => router.push(`/change-order/${changeId}`), 400);
        }} />
      </Sheet>

      <WorkSheet jobId={job.id} open={workOpen} onClose={() => setWorkOpen(false)} onEstimate={!!draft?.signed} />

      <Sheet open={hoursOpen} onClose={() => setHoursOpen(false)} title={t('logHours.title')}>
        {job.pricing === 'flat' ? <T v="small" muted>{t('logHours.flatNote')}</T> : null}
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

/** Waits for the record to load (a link or refresh can arrive first) instead of crashing. */
export default function JobDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecordGate found={() => hasJob(id)}><JobDetail /></RecordGate>;
}
