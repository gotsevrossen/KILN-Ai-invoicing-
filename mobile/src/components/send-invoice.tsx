import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Share } from 'react-native';

import { PayFailed } from '@/data/db-pay';
import { recordDelivery } from '@/data/document-delivery';
import { currentState, useStore } from '@/data/store';
import type { Customer } from '@/data/types';
import { useLang, useTFor } from '@/i18n';
import { emailMessage, textMessage } from '@/lib/contact';
import { formatters } from '@/lib/format';
import { userError } from '@/lib/user-errors';
import { tap } from '@/theme/tokens';

import { Sheet } from './sheet';
import { Button, Notice, T } from './ui';

type How = 'text' | 'email' | 'share';

/**
 * Prepares an invoice on the owner's phone: KILN freezes the issued copy, makes a private link,
 * and opens the texting or email app with a message in the customer's language. The owner taps
 * send there. Sending again makes a fresh link; earlier ones keep working until they expire.
 */
type SendInvoiceSheetProps = {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
  number: string;
  customer: Customer;
  totalCents: number;
};

export function SendInvoiceSheet(props: SendInvoiceSheetProps) {
  const { state } = useStore();
  return <SendInvoiceSheetBody key={`${state.mode}:${state.businessId}:${props.invoiceId}`} {...props} />;
}
function SendInvoiceSheetBody({ open, onClose, invoiceId, number, customer, totalCents }: SendInvoiceSheetProps) {
  const { t, lang } = useLang();
  const es = lang === 'es';
  const tc = useTFor(customer.lang);
  const { state, actions } = useStore();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const active = () => alive.current && currentState().mode === state.mode && currentState().businessId === state.businessId;
  const [busy, setBusy] = useState<How | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState(false);
  const [opened, setOpened] = useState<How | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const connected = state.mode === 'connected';
  const canPayOnline = state.online.walletReady || state.online.bankReady;

  const send = async (how: How) => {
    setError(null);
    setBusy(how);
    try {
      await actions.sendInvoice(invoiceId);
      if (!active()) return;
      const link = await actions.invoiceLink(invoiceId);
      if (!active()) return;
      setPrepared(true);
      await recordDelivery('invoice', invoiceId, 'link_prepared');
      if (!active()) return;
      const fc = formatters(customer.lang);
      const body = tc('customer.textBody', { name: customer.firstName, n: number, business: state.profile.businessName, amount: fc.money(totalCents), link });
      if (how === 'text') await textMessage(customer.phone, body);
      else if (how === 'email') await emailMessage(tc('customer.emailSubject', { n: number, business: state.profile.businessName }), body);
      else { const result = await Share.share({ message: body }); if (result.action === Share.dismissedAction) return; }
      if (!active()) return;
      setOpened(how);
      await recordDelivery('invoice', invoiceId, 'share_opened', how);
    } catch (e) {
      if (active()) setError(t('invoice.linkFailed', { reason: e instanceof PayFailed ? t(`payErrors.${e.code}`) : userError(t, e) }));
    } finally {
      if (active()) setBusy(null);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('invoice.sendTo', { name: customer.firstName })}>
      {connected ? (
        <>
          <T v="body" muted>{es ? 'Tú envías el mensaje en tu aplicación. Preparar la copia o abrir la aplicación no confirma la entrega.' : 'You send the message in your app. Preparing the copy or opening the app does not confirm delivery.'}</T>
          {prepared ? <Notice text={es ? 'Enlace preparado.' : 'Link prepared.'} tone="soft" /> : null}
          {opened && !confirmed ? <Button label={es ? 'Confirmo que envié el mensaje' : 'I confirm I sent the message'} disabled={!!busy} onPress={async () => {
            setBusy(opened); setError(null);
            try { await recordDelivery('invoice', invoiceId, 'owner_confirmed_shared', opened); if (active()) setConfirmed(true); }
            catch (e) { if (active()) setError(userError(t, e)); } finally { if (active()) setBusy(null); }
          }} /> : null}
          {confirmed ? <Notice text={es ? 'Marcado como compartido por ti. No es una confirmación de entrega.' : 'Marked shared by you. This is not a delivery receipt.'} /> : null}
          <Button label={busy === 'text' ? t('invoice.working') : customer.phone ? t('invoice.textTo', { phone: customer.phone }) : t('invoice.textNoPhone')}
            icon="message-square" big disabled={!!busy} onPress={() => send('text')} />
          <Button label={busy === 'email' ? t('invoice.working') : t('invoice.emailIt')} icon="mail" variant="outline" disabled={!!busy} onPress={() => send('email')} />
          <Button label={busy === 'share' ? t('invoice.working') : t('invoice.shareIt')} icon="share" variant="soft" disabled={!!busy} onPress={() => send('share')} />
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
          <Button label={t('invoice.send')} icon="send" big onPress={() => {
            setError(null);
            void actions.sendInvoice(invoiceId).then(onClose).catch((e: unknown) => setError(userError(t, e)));
          }} />
        </>
      )}
      {error ? <Notice text={error} tone="danger" icon="alert-circle" /> : null}
    </Sheet>
  );
}
