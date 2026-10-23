import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { aiErrorText, kilnWroteScope, scopeInputFor } from '@/components/ai-parts';
import { EstimatePage, pickJobType, useEstimate } from '@/components/estimate-parts';
import { ScopeEditor } from '@/components/job-scope';
import { RecordGate } from '@/components/record-gate';
import { Button, Notice, T } from '@/components/ui';
import { aiReady, writeScope } from '@/data/ai';
import { hasJob } from '@/data/selectors';
import { currentState, useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { usePalette } from '@/theme/use-palette';

/** What the customer sees: the job description and optional scope details. */
function EstimateScope() {
  const p = usePalette();
  const { t } = useLang();
  const { state, actions } = useStore();
  const { job, customer, draft } = useEstimate();
  const { trade, jobTypeId } = pickJobType(state.profile.trades, job.id, draft.scope);

  // Settings switch: KILN writes the description in the customer's language; the owner checks it
  const canWrite = state.aiScope && aiReady(state.mode);
  const hasNotes = !!draft.scope?.notes?.trim();
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wrote, setWrote] = useState(() => kilnWroteScope.has(job.id));
  const write = () => {
    const before = draft.scope?.notes ?? '';
    setWriting(true);
    setError(null);
    writeScope(scopeInputFor(currentState(), job.id))
      .then((notes) => {
        const scope = currentState().estimates[job.id]?.scope;
        // the owner typed while KILN was writing: keep their words
        if ((scope?.notes ?? '') !== before) return;
        actions.updateEstimate(job.id, { scope: { ...scope, notes, tradeId: trade.id, jobTypeId } });
        kilnWroteScope.add(job.id);
        setWrote(true);
      }, (e: unknown) => setError(aiErrorText(t, e)))
      .finally(() => setWriting(false));
  };

  return (
    <EstimatePage title={t('estimate.customerSees')} footer={<Button label={t('estimate.done')} big onPress={() => router.back()} />}>
      <Notice text={t('scope.language', { language: customer.lang === 'es' ? 'Español' : 'English' })} tone="soft" />
      {canWrite ? (
        <Button label={writing ? t('ai.writing') : hasNotes ? t('ai.rewriteScope') : t('ai.writeScope')} icon="edit-3"
          variant="outline" disabled={writing} onPress={write} />
      ) : null}
      {error ? <T v="small" color={p.danger}>{error}</T> : null}
      {wrote && hasNotes ? <Notice text={t('ai.wrote')} tone="flag" icon="info" /> : null}
      <ScopeEditor scope={draft.scope ?? {}} tradeId={trade.id} onChange={(patch) => {
        if ('notes' in patch) {
          kilnWroteScope.delete(job.id);
          setWrote(false);
        }
        actions.updateEstimate(job.id, { scope: { ...draft.scope, ...patch, tradeId: trade.id, jobTypeId } });
      }} />
      {['painting', 'flooring', 'drywall', 'carpentry', 'landscaping'].includes(trade.id) ? <T v="small" muted>{t('scope.measurement')}</T> : null}
    </EstimatePage>
  );
}

/** Waits for the record to load (a link or refresh can arrive first) instead of crashing. */
export default function EstimateScopeRoute() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  return <RecordGate found={() => hasJob(jobId)}><EstimateScope /></RecordGate>;
}
