import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { InvoicePage, useInvoice } from '@/components/invoice-parts';
import { RecordGate } from '@/components/record-gate';
import { Button, Card, Row, Segmented, T } from '@/components/ui';
import { DueDaysPicker } from '@/components/settings-rows';
import { hasInvoice } from '@/data/selectors';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';

/** How materials show on the invoice, and when it's due. */
function InvoiceOptions() {
  const { t, lang } = useLang();
  const f = useFormat();
  const { state, actions } = useStore();
  const { invoice, sent, mode, dueDays, dueDate } = useInvoice();
  const [resetCount, setResetCount] = useState(0);

  return (
    <InvoicePage title={t('invoice.options')} footer={<Button label={t('estimate.done')} big onPress={() => router.back()} />}>
      <Card style={{ gap: 12 }}>
        <T v="eyebrow">{t('invoice.materials')}</T>
        {sent ? (
          <T v="body">{mode === 'items' ? t('invoice.itemized') : t('invoice.oneTotal')}</T>
        ) : (
          <Segmented label={t('invoice.materials')} value={mode} onChange={(m) => actions.setMaterialsMode(invoice.id, m)}
            options={[{ key: 'items', label: t('invoice.itemized') }, { key: 'total', label: t('invoice.oneTotal') }]} />
        )}
        <T v="small" muted>{t('invoice.markupHidden', { pct: f.pct(state.settings.markupBps) })}</T>
      </Card>
      <Card style={{ gap: 8 }}>
        {!sent ? <>
          <DueDaysPicker key={resetCount} days={dueDays} onChange={(days) => actions.setInvoiceDueDays(invoice.id, days)} />
          {state.invoiceDueDays?.[invoice.id] !== undefined ? <Button label={lang === 'es' ? 'Usar el plazo de la empresa' : 'Use business default'}
            variant="outline" onPress={() => {
              actions.setInvoiceDueDays(invoice.id, null);
              setResetCount((count) => count + 1);
            }} /> : null}
        </> : null}
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="body">{dueDays === 0 ? t('invoice.dueOnReceipt') : t('invoice.dueIn', { days: dueDays })}</T>
          <T v="money">{f.date(dueDate)}</T>
        </Row>
      </Card>
    </InvoicePage>
  );
}

/** Waits for the record to load (a link or refresh can arrive first) instead of crashing. */
export default function InvoiceOptionsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecordGate found={() => hasInvoice(id)}><InvoiceOptions /></RecordGate>;
}
