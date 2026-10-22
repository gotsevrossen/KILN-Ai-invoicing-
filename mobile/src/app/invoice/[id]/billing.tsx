import { router, useLocalSearchParams } from 'expo-router';

import { InvoicePage, useInvoice } from '@/components/invoice-parts';
import { RecordGate } from '@/components/record-gate';
import { Button, Card, Checkbox, Notice, Segmented, SwitchRow, T } from '@/components/ui';
import { hasInvoice } from '@/data/selectors';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';

/** With a signed estimate: whether hours and materials are already in the agreed price. */
function InvoiceBilling() {
  const { t } = useLang();
  const { actions } = useStore();
  const { invoice, job, billing, fixes } = useInvoice();
  const hoursFix = fixes.find((x) => x.key === 'hours');

  return (
    <InvoicePage title={t('invoice.billing')} lockWhenSent footer={<Button label={t('estimate.done')} big onPress={() => router.back()} />}>
      <T v="body" muted>{t('review.billBasis')}</T>
      {job.pricing === 'hourly' ? (
        <Card style={{ gap: 12 }}>
          <Segmented label={t('invoice.labor')} value={billing.labor} options={[
            { key: 'actual', label: t('review.actual') }, { key: 'estimate', label: t('review.estimate') },
          ]} onChange={(labor) => actions.setInvoiceBilling(invoice.id, { labor, reviewed: false })} />
          <T v="small" muted>{t('review.laborHelp')}</T>
          {hoursFix ? <Notice text={hoursFix.text} tone="soft" /> : null}
        </Card>
      ) : null}
      <Card style={{ gap: 12 }}>
        <SwitchRow label={t('review.materialsIncluded')} value={billing.materials === 'included'}
          onChange={(included) => actions.setInvoiceBilling(invoice.id, { materials: included ? 'included' : 'additional', reviewed: false })} />
        <T v="small" muted>{t('review.materialsHelp')}</T>
      </Card>
      <Card>
        <Checkbox label={t('review.billingConfirmed')} value={billing.reviewed}
          onChange={(reviewed) => actions.setInvoiceBilling(invoice.id, { reviewed })} />
      </Card>
    </InvoicePage>
  );
}

/** Waits for the record to load (a link or refresh can arrive first) instead of crashing. */
export default function InvoiceBillingRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecordGate found={() => hasInvoice(id)}><InvoiceBilling /></RecordGate>;
}
