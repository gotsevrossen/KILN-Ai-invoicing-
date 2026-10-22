import { router } from 'expo-router';

import { EstimatePage, pickJobType, useEstimate } from '@/components/estimate-parts';
import { ScopeEditor } from '@/components/job-scope';
import { Button, Notice, T } from '@/components/ui';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';

/** What the customer sees: the job description and optional scope details. */
export default function EstimateScope() {
  const { t } = useLang();
  const { state, actions } = useStore();
  const { job, customer, draft } = useEstimate();
  const { trade, jobTypeId } = pickJobType(state.profile.trades, job.id, draft.scope);

  return (
    <EstimatePage title={t('estimate.customerSees')} footer={<Button label={t('estimate.done')} big onPress={() => router.back()} />}>
      <Notice text={t('scope.language', { language: customer.lang === 'es' ? 'Español' : 'English' })} tone="soft" />
      <ScopeEditor scope={draft.scope ?? {}} tradeId={trade.id} onChange={(patch) => actions.updateEstimate(job.id,
        { scope: { ...draft.scope, ...patch, tradeId: trade.id, jobTypeId } })} />
      {['painting', 'flooring', 'drywall', 'carpentry', 'landscaping'].includes(trade.id) ? <T v="small" muted>{t('scope.measurement')}</T> : null}
    </EstimatePage>
  );
}
