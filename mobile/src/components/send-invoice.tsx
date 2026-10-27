import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share } from 'react-native';

import { PayFailed } from '@/data/db-pay';
import { useStore } from '@/data/store';
import type { Customer } from '@/data/types';
import { useLang, useTFor } from '@/i18n';
import { emailMessage, textMessage } from '@/lib/contact';
import { formatters } from '@/lib/format';
import { tap } from '@/theme/tokens';

import { Sheet } from './sheet';
import { Button, Notice, T } from './ui';

type How = 'text' | 'email' | 'share';

/**
 * Sends an invoice from the owner's own phone: KILN freezes it as sent, makes a private link,
 * and opens the texting or email app with a message in the customer's language. The owner taps
 * send there. Sending again makes a fresh link; earlier ones keep working until they expire.
 */
export function SendInvoiceSheet({ open, onClose, invoiceId, number, customer, totalCents }: {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
  number: string;
  customer: Customer;
  totalCents: number;
}) {
  const { t } = useLang();
  const tc = useTFor(customer.lang);
  const { state, actions } = useStore();
  const [busy, setBusy] = useState<How | null>(null);
  const [error, setError] = useState<string | null>(null);
  const connected = state.mode === 'connected';
  const canPayOnline = state.online.walletReady || state.online.bankReady;

  const send = async (how: How) => {
    setError(null);
    setBusy(how);
    try {
      actions.sendInvoice(invoiceId);
      const link = await actions.invoiceLink(invoiceId);
      const fc = formatters(customer.lang);
      const body = tc('customer.textBody', { name: customer.firstName, n: number, business: state.profile.businessName, amount: fc.money(totalCents), link });
      if (how === 'text') await textMessage(customer.phone, body);
      else if (how === 'email') await emailMessage(tc('customer.emailSubject', { n: number, business: state.profile.businessName }), body);
      else await Share.share({ message: body });
      onClose();
    } catch (e) {
      setError(t('invoice.linkFailed', { reason: t(`payErrors.${e instanceof PayFailed ? e.code : 'failed'}`) }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('invoice.sendTo', { name: customer.firstName })}>
      {connected ? (
        <>
          <T v="body" muted>{t('invoice.sendHelp', { name: customer.firstName })}</T>
          <Button label={busy === 'text' ? t('invoice.working') : customer.phone ? t('invoice.textTo', { phone: customer.phone }) : t('invoice.textNoPhone')}
            icon="message-square" big disabled={!!busy} onPress={() => send('text')} />
          <Button label={busy === 'email' ? t('invoice.working') : t('invoice.emailIt')} icon="mail" variant="outline" disabled={!!busy} onPress={() => send('email')} />
          <Button label={busy === 'share' ? t('invoice.working') : t('invoice.shareIt')} icon="share" variant="soft" disabled={!!busy} onPress={() => send('share')} />
          {error ? <Notice text={error} tone="danger" icon="alert-circle" /> : null}
          {!canPayOnline ? (
            <Pressable accessibilityRole="link" onPress={() => { onClose(); router.push('/settings/payments'); }}
              style={{ minHeight: tap.min, justifyContent: 'center' }}>
              <T v="small" muted style={{ textDecorationLine: 'underline' }}>{t('invoice.payOffHint')}</T>
            </Pressable>
          ) : null}
        </>
      ) : (
        <>
          <T v="body" muted>{t('invoice.exampleSend')}</T>
          <Button label={t('invoice.send')} icon="send" big onPress={() => { actions.sendInvoice(invoiceId); onClose(); }} />
        </>
      )}
    </Sheet>
  );
}
