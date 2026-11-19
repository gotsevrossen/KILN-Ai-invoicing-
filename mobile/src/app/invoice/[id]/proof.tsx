import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { aiErrorText } from '@/components/ai-parts';
import { InvoicePage, useInvoice } from '@/components/invoice-parts';
import { PhotoImage, proofCandidates, ProofPhotos } from '@/components/job-photos';
import { DocumentTermsEditor, ScopeCard } from '@/components/job-scope';
import { RecordGate } from '@/components/record-gate';
import { Button, Card, Checkbox, Field, Notice, SwitchRow, T } from '@/components/ui';
import { aiReady, reviewInvoice } from '@/data/ai';
import { customerOf, documentScope, hasInvoice, invoiceLines, invoiceSummary, workItemsFor } from '@/data/selectors';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';

/** Proof of work: before/after photos, the job summary, the agreed scope, and whether to show the location. */
function InvoiceProof() {
  const { t, lang } = useLang();
  const { state, actions } = useStore();
  const { invoice, job, sent, issued } = useInvoice();
  const photos = proofCandidates(state.photos, job.id).filter((photo) => state.mode === 'example' || photo.path);
  const savedIds = issued?.proofPhotoIds ?? state.invoiceProofPhotos?.[invoice.id];
  const selected = savedIds ?? photos.slice(0, 12).map((photo) => photo.id);
  const es = lang === 'es';
  const [review, setReview] = useState<{ input: string; summary: string | null; questions: string[] } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [problem, setProblem] = useState('');
  const billed = sent ? [] : invoiceLines(state, invoice).map((line) => line.description.slice(0, 300)).slice(0, 100);
  const records = sent ? [] : [
    ...workItemsFor(state, job.id).map((entry) => entry.description),
    ...state.timeEntries.filter((entry) => entry.jobId === job.id).map((entry) => entry.note),
    ...state.captures.filter((entry) => entry.jobId === job.id && entry.kind !== 'photo').map((entry) => entry.text),
  ].flatMap((record) => record?.trim() ? [record.trim().slice(0, 500)] : []).slice(-30);
  const reviewInput = { lang: customerOf(job).lang, billed, records };
  const input = JSON.stringify(reviewInput);
  const current = review?.input === input ? review : null;

  const runReview = async () => {
    setReviewing(true);
    setProblem('');
    setReview(null);
    try { setReview({ input, ...await reviewInvoice(reviewInput) }); }
    catch (error) { setProblem(aiErrorText(t, error)); }
    finally { setReviewing(false); }
  };

  return (
    <InvoicePage title={t('invoice.proof')} footer={<Button label={t('estimate.done')} big onPress={() => router.back()} />}>
      {sent || !photos.length ? <ProofPhotos jobId={job.id} t={t} ids={savedIds} showLocation={!!state.showLocation[invoice.id]} /> : <Card style={{ gap: 10 }}>
        <T v="label">{es ? 'Fotos en la factura' : 'Photos on the invoice'}</T>
        <T v="small" muted>{es ? 'Elige hasta 12 fotos.' : 'Choose up to 12 photos.'}</T>
        {photos.map((photo, index) => <Card key={photo.id}>
          <PhotoImage photo={photo} tag={t(`job.${photo.tag}`)} />
          <Checkbox label={`${t(`job.${photo.tag}`)} ${index + 1}`} value={selected.includes(photo.id)} onChange={(on) => {
            const current = selected.filter((id) => photos.some((candidate) => candidate.id === id));
            if (on && current.length >= 12) return;
            actions.setInvoiceProofPhotos(invoice.id, on ? [...current, photo.id] : current.filter((id) => id !== photo.id));
          }} />
        </Card>)}
      </Card>}
      <Card style={{ gap: 12 }}>
        <Field label={t('invoice.summaryLabel')} value={invoiceSummary(state, invoice)} editable={!sent} maxLength={4000}
          onChangeText={(text) => actions.setInvoiceSummary(invoice.id, text)} multiline
          style={{ minHeight: 100, fontSize: 16 }} />
        {!sent ? <SwitchRow label={t('invoice.showLocation')} value={!!state.showLocation[invoice.id]}
          onChange={(on) => actions.setShowLocation(invoice.id, on)} /> : null}
        <T v="small" muted>{t('photos.proofHelp')}</T>
      </Card>
      {!sent && records.length > 0 && aiReady(state.mode) ? <Card style={{ gap: 10 }}>
        <T v="label">{es ? 'Revisión de factura con IA' : 'AI invoice review'}</T>
        <T v="small" muted>{es ? 'Revisa el trabajo registrado y las notas del trabajo para proponer un resumen y preguntas de facturación.' :
          'Review recorded work and job notes for a draft summary and billing questions.'}</T>
        <Button label={reviewing ? (es ? 'Revisando…' : 'Reviewing…') : (es ? 'Revisar factura' : 'Review invoice')}
          icon="search" variant="outline" disabled={reviewing} onPress={runReview} />
        {problem ? <Notice text={problem} tone="flag" /> : null}
        {current?.summary ? <>
          <T>{current.summary}</T>
          <Button label={es ? 'Usar este resumen' : 'Use this summary'} variant="outline"
            onPress={() => actions.setInvoiceSummary(invoice.id, current.summary!)} />
        </> : null}
        {current?.questions.length ? <>
          <T v="label">{es ? 'Preguntas para ti' : 'Questions for you'}</T>
          {current.questions.map((question) => <T key={question}>{question}</T>)}
        </> : null}
        {current && !current.summary && !current.questions.length ? <T v="small" muted>
          {es ? 'Sin sugerencias para los registros actuales.' : 'No suggestions for the current records.'}
        </T> : null}
      </Card> : null}
      {!sent && (!state.estimates[job.id]?.sent || state.estimates[job.id]?.declinedAt) ?
        <DocumentTermsEditor values={job.documentTerms} defaults={state.profile.documentTerms ?? {}}
          onChange={(key, value) => actions.setJobDocumentTerm(job.id, key, value)} /> : null}
      <ScopeCard scope={issued ? issued.scope : documentScope(state, job)}
        excluded={issued ? issued.excludedScope : state.estimates[job.id]?.lines.filter((l) => l.excluded).map((l) => l.description)} t={t} />
    </InvoicePage>
  );
}

/** Waits for the record to load (a link or refresh can arrive first) instead of crashing. */
export default function InvoiceProofRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecordGate found={() => hasInvoice(id)}><InvoiceProof /></RecordGate>;
}
