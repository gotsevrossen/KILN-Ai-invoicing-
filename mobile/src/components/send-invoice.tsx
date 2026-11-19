import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Share } from 'react-native';

import { PayFailed, sendInvoiceEmail } from '@/data/db-pay';
import { useAuth } from '@/data/auth';
import { newUuid } from '@/data/db';
import { recordDelivery } from '@/data/document-delivery';
import { currentState, useStore } from '@/data/store';
import type { Customer } from '@/data/types';
import { useLang, useTFor } from '@/i18n';
import { emailMessage, textMessage } from '@/lib/contact';
import { formatters } from '@/lib/format';
import { invoicePaymentCopy } from '@/lib/invoice-payment';
import { userError } from '@/lib/user-errors';
import { tap } from '@/theme/tokens';

import { Sheet } from './sheet';
import { invoiceEmailMessage } from './delivery-status';
import { Button, Notice, T } from './ui';

type How = 'text' | 'email' | 'share' | 'direct';

/**
 * After issuance the owner can email the saved address or share a private link from their phone.
 * Sharing again makes a fresh link. Earlier links keep working until they expire.
 */
type SendInvoiceSheetProps = {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
  jobId: string;
  number: string;
  customer: Customer;
  totalCents: number;
  reminder?: boolean;
};

export function SendInvoiceSheet(props: SendInvoiceSheetProps) {
  const { state } = useStore();
  return <SendInvoiceSheetBody key={`${state.mode}:${state.businessId}:${props.invoiceId}:${!!props.reminder}`} {...props} />;
}
function SendInvoiceSheetBody({ open, onClose, invoiceId, jobId, number, customer, totalCents, reminder = false }: SendInvoiceSheetProps) {
  const { t, lang } = useLang();
  const es = lang === 'es';
  const c = invoicePaymentCopy[lang];
  const auth = useAuth();
  const tc = useTFor(customer.lang);
  const { state, actions } = useStore();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const active = () => alive.current && currentState().mode === state.mode && currentState().businessId === state.businessId;
  const [busy, setBusy] = useState<How | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState(false);
  const [opened, setOpened] = useState<Exclude<How, 'direct'> | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [emailResult, setEmailResult] = useState<string | null>(null);
  const attempt = useRef<{ id: string; recipient: string } | null>(null);
  const sending = useRef(false);
  const connected = state.mode === 'connected';
  const canPayOnline = state.online.walletReady || state.online.bankReady || state.online.cardReady;
  const blocked = !Object.keys(state.issuedInvoices[invoiceId]?.alternativeMethods ?? state.settings.alternativeMethods ?? {}).length;

  const send = async (how: How) => {
    if (sending.current || blocked) return;
    sending.current = true;
    setError(null);
    setBusy(how);
    try {
      await actions.sendInvoice(invoiceId);
      if (!active()) return;
      if (how === 'direct') {
        if (!customer.email) return;
        setEmailResult(null);
        await actions.retryOffline();
        if (!active()) return;
        if (attempt.current?.recipient !== customer.email) attempt.current = { id: newUuid(), recipient: customer.email };
        const result = await sendInvoiceEmail(invoiceId, attempt.current.id, customer.email, reminder);
        if (!active()) return;
        setEmailResult(invoiceEmailMessage(lang, result));
        if (result.status !== 'sending') attempt.current = null;
        return;
      }
      const link = await actions.invoiceLink(invoiceId);
      if (!active()) return;
      setPrepared(true);
      await recordDelivery('invoice', invoiceId, 'link_prepared');
      if (!active()) return;
      const fc = formatters(customer.lang);
      const body = reminder ? (customer.lang === 'es'
        ? `Hola, ${customer.firstName}. Puedes consultar el saldo de la factura ${number} de ${state.profile.businessName} aquí: ${link}`
        : `Hi ${customer.firstName}, you can review the balance of invoice ${number} from ${state.profile.businessName} here: ${link}`)
        : tc('customer.textBody', { name: customer.firstName, n: number, business: state.profile.businessName, amount: fc.money(totalCents), link });
      const subject = reminder ? (customer.lang === 'es' ? `Recordatorio de pago · ${number}` : `Payment reminder · ${number}`)
        : tc('customer.emailSubject', { n: number, business: state.profile.businessName });
      if (how === 'text') await textMessage(customer.phone, body);
      else if (how === 'email') await emailMessage(subject, body, customer.email);
      else { const result = await Share.share({ message: body }); if (result.action === Share.dismissedAction) return; }
      if (!active()) return;
      setOpened(how);
      await recordDelivery('invoice', invoiceId, 'share_opened', how);
    } catch (e) {
      if (active()) setError(t('invoice.linkFailed', { reason: e instanceof PayFailed ? t(`payErrors.${e.code}`)
        : e instanceof Error && e.message === 'alternative_methods_required' ? c.needsMethods : userError(t, e) }));
    } finally {
      sending.current = false;
      if (active()) setBusy(null);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={reminder ? (es ? 'Recordatorio de pago' : 'Payment reminder') : t('invoice.sendTo', { name: customer.firstName })}>
      {blocked ? <>
        <Notice text={c.needsMethods} tone="flag" />
        {!connected || auth.role === 'owner'
          ? <Button label={c.openSettings} onPress={() => { onClose(); router.push('/settings/payments'); }} />
          : <T v="small">{c.askOwner}</T>}
      </> : connected ? (
        <>
          <T v="body" muted>{es ? 'Puedes enviar por correo desde KILN o compartir el enlace desde tu teléfono.' : 'Email from KILN or share the link from your phone.'}</T>
          {emailResult ? <Notice text={emailResult} tone="soft" /> : null}
          {prepared ? <Notice text={es ? 'Enlace preparado.' : 'Link prepared.'} tone="soft" /> : null}
          {opened && !confirmed ? <Button label={es ? 'Confirmo que envié el mensaje' : 'I confirm I sent the message'} disabled={!!busy} onPress={async () => {
            setBusy(opened); setError(null);
            try { await recordDelivery('invoice', invoiceId, 'owner_confirmed_shared', opened); if (active()) setConfirmed(true); }
            catch (e) { if (active()) setError(userError(t, e)); } finally { if (active()) setBusy(null); }
          }} /> : null}
          {confirmed ? <Notice text={es ? 'Marcado como compartido por ti. No es una confirmación de entrega.' : 'Marked shared by you. This is not a delivery receipt.'} /> : null}
          <Button label={busy === 'text' ? t('invoice.working') : customer.phone ? t('invoice.textTo', { phone: customer.phone }) : t('invoice.textNoPhone')}
            icon="message-square" big disabled={!!busy} onPress={() => send('text')} />
          {customer.email ? <Button label={busy === 'direct' ? t('invoice.working') : es ? `Enviar a ${customer.email}` : `Email ${customer.email}`}
            icon="mail" variant="outline" disabled={!!busy} onPress={() => send('direct')} />
            : <Button label={es ? 'Añadir correo del cliente' : 'Add customer email'} icon="mail" variant="outline" disabled={!!busy}
              onPress={() => { onClose(); router.push(`/job/${jobId}/customer`); }} />}
          <Button label={busy === 'email' ? t('invoice.working') : es ? 'Abrir aplicación de correo' : 'Open email app'} icon="mail" variant="outline" disabled={!!busy} onPress={() => send('email')} />
          <Button label={busy === 'share' ? t('invoice.working') : t('invoice.shareIt')} icon="share" variant="soft" disabled={!!busy} onPress={() => send('share')} />
          {!canPayOnline && auth.role === 'owner' ? (
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
