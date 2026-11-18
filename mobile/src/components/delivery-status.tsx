import { useEffect, useState } from 'react';
import { invoiceEmailStatus, type InvoiceEmailResult } from '@/data/db-pay';
import { db, ok, one } from '@/data/db-client';
import { useStore } from '@/data/store';
import type { DeliveryEvent } from '@/data/document-delivery';
import { useLang } from '@/i18n';
import { Button, Card, T } from './ui';
const copy = {
  en: { title: 'Sharing status', issued: 'Issued — delivery not confirmed', link_prepared: 'Private link prepared — delivery not confirmed', share_opened: 'Messaging app opened — delivery not confirmed', owner_confirmed_shared: 'You confirmed sharing — no delivery receipt', customer_viewed: 'Customer link opened', retry: 'Refresh sharing status', failed: 'Sharing status unavailable. Delivery has not been confirmed.' },
  es: { title: 'Estado del envío', issued: 'Emitido — entrega sin confirmar', link_prepared: 'Enlace preparado — entrega sin confirmar', share_opened: 'Aplicación de mensajes abierta — entrega sin confirmar', owner_confirmed_shared: 'Confirmaste el envío — sin recibo de entrega', customer_viewed: 'Enlace del cliente abierto', retry: 'Actualizar estado del envío', failed: 'Estado no disponible. No se confirmó la entrega.' },
};
const emailCopy = {
  en: { sending: 'Email send in progress.', accepted: 'Email accepted by the sending service.', delivered: 'Email delivered to the recipient’s mail server.', delayed: 'Email delivery delayed.', failed: 'Email delivery failed.', unknown: 'Email delivery could not be confirmed. Verify before resending.', stale: 'Latest email status is unavailable.' },
  es: { sending: 'Enviando correo.', accepted: 'El servicio de correo aceptó el mensaje.', delivered: 'Correo entregado al servidor del destinatario.', delayed: 'Se retrasó la entrega del correo.', failed: 'No se pudo entregar el correo.', unknown: 'No se pudo confirmar la entrega del correo. Verifica antes de reenviarlo.', stale: 'El estado más reciente del correo no está disponible.' },
};

export function invoiceEmailMessage(lang: 'en' | 'es', result: InvoiceEmailResult): string {
  const c = emailCopy[lang];
  const message = result.status ? c[result.status] : '';
  return result.stale ? `${message} ${c.stale}`.trim() : message;
}

export function DeliveryStatus({ invoiceId, jobId, refresh }: { invoiceId?: string; jobId?: string; refresh?: boolean }) {
  const { state } = useStore();
  if (state.mode !== 'connected' || !state.businessId) return null;
  return <Status key={`${state.businessId}:${invoiceId ?? jobId}`} invoiceId={invoiceId} jobId={jobId} refresh={refresh} />;
}
function Status({ invoiceId, jobId, refresh }: { invoiceId?: string; jobId?: string; refresh?: boolean }) {
  const { lang } = useLang(); const c = copy[lang];
  const [event, setEvent] = useState<DeliveryEvent | null>(null);
  const [email, setEmail] = useState<InvoiceEmailResult | null>(null);
  const [expired, setExpired] = useState(false);
  const [failed, setFailed] = useState(false); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    if (invoiceId && !refresh) {
      void invoiceEmailStatus(invoiceId).then((result) => { if (live) setEmail(result); }, () => {
        if (live) setEmail((previous) => ({ status: previous?.status ?? null, stale: true }));
      });
    }
    void (async () => {
      try {
        const type = invoiceId ? 'invoice' : 'estimate';
        const estimate = invoiceId ? null : one<{ id: string; signed_at: string | null; declined_at: string | null }>(
          await db().from('estimates').select('id,signed_at,declined_at').eq('job_id', jobId!).single(),
        );
        const id = invoiceId ?? estimate!.id;
        const events = ok(await db().from('document_delivery_events').select('document_type,document_id,stage,created_at').eq('document_type', type).eq('document_id', id).order('created_at', { ascending: false }).limit(50)) as DeliveryEvent[];
        const lastLink = estimate && !estimate.signed_at && !estimate.declined_at
          ? ok(await db().from('estimate_access_links').select('expires_at').eq('estimate_id', id).is('revoked_at', null)
            .order('expires_at', { ascending: false }).limit(1).maybeSingle<{ expires_at: string }>()) : null;
        const rank = { customer_viewed: 4, owner_confirmed_shared: 3, share_opened: 2, link_prepared: 1 };
        const latest = events.reduce<DeliveryEvent | null>((best, item) => !best || rank[item.stage] > rank[best.stage] ? item : best, null);
        if (live) { setEvent(latest); setExpired(!!lastLink && Date.parse(lastLink.expires_at) <= Date.now()); setFailed(false); }
      } catch { if (live) setFailed(true); }
    })();
    return () => { live = false; };
  }, [invoiceId, jobId, attempt, refresh]);
  return <Card style={{ gap: 8 }}><T v="label">{c.title}</T><T v="small">{failed ? c.failed : event ? c[event.stage] : c.issued}</T>
    {expired && !failed ? <T v="small">{lang === 'es' ? 'El enlace caducó. Envía un enlace nuevo.' : 'The customer link expired. Send a new link.'}</T> : null}
    {email && (email.status || email.stale) ? <T v="small">{invoiceEmailMessage(lang, email)}</T> : null}
    <Button label={c.retry} variant="outline" onPress={() => setAttempt((n) => n + 1)} />
  </Card>;
}
