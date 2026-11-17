import { useEffect, useRef, useState } from 'react';
import { Share } from 'react-native';

import { prepareEstimateAccess, recordDelivery, type EstimateAccess, type ShareChannel } from '@/data/document-delivery';
import { currentState, useStore } from '@/data/store';
import type { Customer } from '@/data/types';
import { useLang } from '@/i18n';
import { emailMessage, textMessage } from '@/lib/contact';
import { Sheet } from './sheet';
import { Button, Notice, T } from './ui';

/** Issuing a quote and opening a composer never assert successful delivery. */
type SendEstimateSheetProps = {
  open: boolean; onClose: () => void; jobId: string; customer: Customer;
};

export function SendEstimateSheet(props: SendEstimateSheetProps) {
  const { state } = useStore();
  return <SendEstimateSheetBody key={`${state.mode}:${state.businessId}:${props.jobId}`} {...props} />;
}
function SendEstimateSheetBody({ open, onClose, jobId, customer }: SendEstimateSheetProps) {
  const { lang } = useLang();
  const es = lang === 'es';
  const { actions, state } = useStore();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const active = () => alive.current && currentState().mode === state.mode && currentState().businessId === state.businessId;
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<EstimateAccess | null>(null);
  const [opened, setOpened] = useState<ShareChannel | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState(false);
  const share = async (how: ShareChannel) => {
    setBusy(true); setError(false);
    try {
      await actions.sendEstimate(jobId);
      if (!active()) return;
      const link = prepared && Date.parse(prepared.expiresAt) > Date.now() ? prepared : await prepareEstimateAccess(jobId);
      if (!active()) return;
      setPrepared(link);
      const body = customer.lang === 'es'
        ? `Hola ${customer.firstName}, revisa y acepta tu presupuesto de ${state.profile.businessName}: ${link.url}`
        : `Hi ${customer.firstName}, review and accept your estimate from ${state.profile.businessName}: ${link.url}`;
      if (how === 'text') await textMessage(customer.phone, body);
      else if (how === 'email') await emailMessage(customer.lang === 'es' ? 'Tu presupuesto' : 'Your estimate', body);
      else { const result = await Share.share({ message: body }); if (result.action === Share.dismissedAction) return; }
      if (!active()) return;
      setOpened(how);
      await recordDelivery('estimate', link.documentId, 'share_opened', how);
    } catch { if (active()) setError(true); } finally { if (active()) setBusy(false); }
  };
  return <Sheet open={open} onClose={onClose} title={es ? 'Compartir presupuesto' : 'Share estimate'}>
    <T muted>{es ? 'KILN prepara una copia fija y un enlace privado. Tú envías el mensaje en tu aplicación. Abrirla no confirma la entrega.' : 'KILN prepares a fixed copy and a private link. You send the message in your app. Opening it does not confirm delivery.'}</T>
    {state.mode === 'connected' ? <>
      <Button label={es ? 'Abrir mensaje de texto' : 'Open text message'} disabled={busy} onPress={() => share('text')} />
      <Button label={es ? 'Abrir correo' : 'Open email'} variant="outline" disabled={busy} onPress={() => share('email')} />
      <Button label={es ? 'Abrir menú para compartir' : 'Open share menu'} variant="outline" disabled={busy} onPress={() => share('share')} />
      {prepared ? <Notice text={es ? 'Enlace preparado. No se ha confirmado la entrega.' : 'Link prepared. Delivery has not been confirmed.'} tone="soft" /> : null}
      {opened && !confirmed ? <Button label={es ? 'Confirmo que envié el mensaje' : 'I confirm I sent the message'} disabled={busy} onPress={async () => {
        if (!prepared) return;
        setBusy(true); setError(false);
        try { await recordDelivery('estimate', prepared.documentId, 'owner_confirmed_shared', opened); if (active()) setConfirmed(true); }
        catch { setError(true); } finally { setBusy(false); }
      }} /> : null}
      {confirmed ? <Notice text={es ? 'Marcado como compartido por ti. No es una confirmación de entrega.' : 'Marked shared by you. This is not a delivery receipt.'} /> : null}
    </> : <T muted>{es ? 'Los enlaces privados requieren iniciar sesión.' : 'Private links require signing in.'}</T>}
    {error ? <Notice text={es ? 'No pudimos completar ese paso. Comprueba tu conexión y vuelve a intentarlo. La copia puede haberse preparado; no se ha confirmado la entrega.' : 'We could not complete that step. Check your connection and try again. The copy may have been prepared; delivery has not been confirmed.'} tone="danger" /> : null}
  </Sheet>;
}
