import { useState } from 'react';

import type { TradeId } from '@/data/trades';
import type { JobScope } from '@/data/types';
import { useLang, type TFn } from '@/i18n';

import { Card, Field, SwitchRow, T } from './ui';

/** A short path by default; richer scope stays optional for small repairs. */
export function ScopeEditor({ scope, tradeId, onChange }: {
  scope: JobScope; tradeId: TradeId; onChange: (patch: Partial<JobScope>) => void;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(!!(scope.location || scope.details || scope.exclusions));
  return (
    <>
      <Field label={t('scope.notes')} value={scope.notes ?? ''}
        onChangeText={(notes) => onChange({ notes })} placeholder={t(`scope.prompts.${tradeId}.notes`)}
        multiline maxLength={2000} style={{ minHeight: 96, paddingTop: 14, textAlignVertical: 'top' }} />
      <Card style={{ gap: 12 }}>
        <SwitchRow label={t('scope.optional')} value={open} onChange={setOpen} />
        {open ? <>
          <Field label={t('scope.location')} value={scope.location ?? ''}
            onChangeText={(location) => onChange({ location })} placeholder={t(`scope.prompts.${tradeId}.location`)} maxLength={300} />
          <Field label={t('scope.details')} value={scope.details ?? ''}
            onChangeText={(details) => onChange({ details })} placeholder={t(`scope.prompts.${tradeId}.details`)}
            multiline maxLength={2000} style={{ minHeight: 100, paddingTop: 14, textAlignVertical: 'top' }} />
          <Field label={t('scope.exclusions')} value={scope.exclusions ?? ''}
            onChangeText={(exclusions) => onChange({ exclusions })} placeholder={t('scope.exclusionsHint')}
            multiline maxLength={2000} style={{ minHeight: 80, paddingTop: 14, textAlignVertical: 'top' }} />
        </> : null}
      </Card>
    </>
  );
}

/** Only explicitly customer-facing owner text; private job notes never enter here. */
export function ScopeCard({ scope, excluded = [], t }: { scope?: JobScope; excluded?: string[]; t: TFn }) {
  if (!scope?.notes && !scope?.location && !scope?.details && !scope?.exclusions && !excluded.length) return null;
  return <Card style={{ gap: 8 }}>
    <T v="eyebrow">{t('scope.title')}</T>
    {scope?.location ? <T v="label">{scope.location}</T> : null}
    {scope?.notes ? <T>{scope.notes}</T> : null}
    {scope?.details ? <T>{scope.details}</T> : null}
    {scope?.exclusions || excluded.length ? <>
      <T v="label">{t('scope.exclusions')}</T>
      {scope?.exclusions ? <T>{scope.exclusions}</T> : null}
      {excluded.map((description, i) => <T key={i}>{description}</T>)}
    </> : null}
  </Card>;
}
