import { useEffect, useState } from 'react';
import { db, ok, one } from '@/data/db-client';
import { useStore } from '@/data/store';
import type { DeliveryEvent } from '@/data/document-delivery';
import { useLang } from '@/i18n';
import { Button, Card, T } from './ui';
const copy = {
  en: { title: 'Sharing status', issued: 'Issued — delivery not confirmed', link_prepared: 'Private link prepared — delivery not confirmed', share_opened: 'Messaging app opened — delivery not confirmed', owner_confirmed_shared: 'You confirmed sharing — no delivery receipt', customer_viewed: 'Customer link opened', retry: 'Refresh sharing status', failed: 'Sharing status unavailable. Delivery has not been confirmed.' },
  es: { title: 'Estado del envío', issued: 'Emitido — entrega sin confirmar', link_prepared: 'Enlace preparado — entrega sin confirmar', share_opened: 'Aplicación de mensajes abierta — entrega sin confirmar', owner_confirmed_shared: 'Confirmaste el envío — sin recibo de entrega', customer_viewed: 'Enlace del cliente abierto', retry: 'Actualizar estado del envío', failed: 'Estado no disponible. No se confirmó la entrega.' },
};
export function DeliveryStatus({ invoiceId, jobId }: { invoiceId?: string; jobId?: string }) {
  const { state } = useStore();
  if (state.mode !== 'connected' || !state.businessId) return null;
  return <Status key={`${state.businessId}:${invoiceId ?? jobId}`} invoiceId={invoiceId} jobId={jobId} />;
}
function Status({ invoiceId, jobId }: { invoiceId?: string; jobId?: string }) {
  const { lang } = useLang(); const c = copy[lang];
  const [event, setEvent] = useState<DeliveryEvent | null>(null);
  const [failed, setFailed] = useState(false); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const type = invoiceId ? 'invoice' : 'estimate';
        const id = invoiceId ?? one<{ id: string }>(await db().from('estimates').select('id').eq('job_id', jobId!).single()).id;
        const events = ok(await db().from('document_delivery_events').select('document_type,document_id,stage,created_at').eq('document_type', type).eq('document_id', id).order('created_at', { ascending: false }).limit(50)) as DeliveryEvent[];
        const rank = { customer_viewed: 4, owner_confirmed_shared: 3, share_opened: 2, link_prepared: 1 };
        const latest = events.reduce<DeliveryEvent | null>((best, item) => !best || rank[item.stage] > rank[best.stage] ? item : best, null);
        if (live) { setEvent(latest); setFailed(false); }
      } catch { if (live) setFailed(true); }
    })();
    return () => { live = false; };
  }, [invoiceId, jobId, attempt]);
  return <Card style={{ gap: 8 }}><T v="label">{c.title}</T><T v="small">{failed ? c.failed : event ? c[event.stage] : c.issued}</T>
    <Button label={c.retry} variant="outline" onPress={() => setAttempt((n) => n + 1)} />
  </Card>;
}
