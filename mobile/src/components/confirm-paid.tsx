import * as sample from '@/data/sample';
import { invoiceTotals, paidOnline } from '@/data/selectors';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';
import { usePalette } from '@/theme/use-palette';

import { Sheet } from './sheet';
import { Button, Card, T } from './ui';

/**
 * "Mark as paid?" Paid in cash or by check can't be taken back, so one stray tap
 * never closes an invoice. Shows what's still owed: the same amount KILN records.
 */
export function ConfirmPaidSheet({ invoiceId, open, onClose }: { invoiceId: string; open: boolean; onClose: () => void }) {
  const p = usePalette();
  const { t } = useLang();
  const f = useFormat();
  const { state, actions } = useStore();
  const invoice = sample.invoices.find((i) => i.id === invoiceId);
  const left = invoice ? Math.max(0, invoiceTotals(state, invoice).total - paidOnline(state, invoiceId).paid) : 0;

  return (
    <Sheet open={open} onClose={onClose} title={t('confirmPaid.title')}>
      <Card tone="inverse" style={{ gap: 4 }}>
        <T v="eyebrow" color={p.onInverseMuted}>{t('confirmPaid.owed')}</T>
        <T v="moneyBig" color={p.onInverse}>{f.money(left)}</T>
      </Card>
      <T v="body" muted>{t('confirmPaid.body')}</T>
      <Button label={t('confirmPaid.confirm')} icon="check" big onPress={() => {
        actions.markPaid(invoiceId);
        onClose();
      }} />
      <Button label={t('common.cancel')} variant="outline" onPress={onClose} />
    </Sheet>
  );
}
