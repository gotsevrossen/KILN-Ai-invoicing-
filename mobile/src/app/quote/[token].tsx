import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, View } from 'react-native';

import { Button, Card, Checkbox, Field, LineRow, Notice, Screen, T } from '@/components/ui';
import { CustomerDocumentExport } from '@/components/customer-document-export';
import { DocumentTermsText } from '@/components/job-scope';
import { onLiveRefresh } from '@/data/live-events';
import { acceptEstimateAccess, declineEstimateAccess, prepareQuoteDeposit, viewEstimateAccess, type QuoteAccess } from '@/data/document-delivery';
import { useLang, useTFor } from '@/i18n';
import { formatters } from '@/lib/format';
import { documentTotals, lineTotal, percentOf } from '@/lib/money';

/** No account or app is required. This page uses only the bearer link's fixed public copy. */
export default function QuoteRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <CustomerQuote key={token} />;
}
function CustomerQuote() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { lang } = useLang();
  const [page, setPage] = useState<QuoteAccess | null>(null);
  const tc = useTFor(page?.snapshot.lang ?? lang);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const load = useCallback(async () => {
    setFailed(false); setPage(null); setName(''); setAgreed(false); setConfirmDecline(false);
    try { setPage(await viewEstimateAccess(String(token))); } catch { setFailed(true); }
  }, [token]);
  useEffect(() => {
    let live = true;
    viewEstimateAccess(String(token)).then((result) => { if (live) setPage(result); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [token]);
  // pull down: re-read the estimate without clearing what the customer typed
  useEffect(() => onLiveRefresh(() => { viewEstimateAccess(String(token)).then(setPage, () => {}); }), [token]);
  const es = (page?.snapshot.lang ?? lang) === 'es';
  if (!page) return <Screen><T>{failed ? es ? 'No pudimos abrir este presupuesto. Puede haber caducado. Comprueba tu conexión o pide otro enlace.' : 'We could not open this estimate. It may have expired. Check your connection or ask for a new link.' : es ? 'Abriendo presupuesto…' : 'Opening estimate…'}</T>
    {failed ? <Button label={es ? 'Reintentar' : 'Try again'} onPress={load} /> : null}</Screen>;
  const q = page.snapshot;
  const f = formatters(q.lang);
  const included = q.lines.filter((l) => !l.excluded);
  const totals = documentTotals(included.map((l) => ({ kind: l.kind, qtyHundredths: l.qty_hundredths, unitCents: l.unit_cents })),
    { rateBps: q.tax.rate_bps ?? 0, labor: !!q.tax.labor, materials: !!q.tax.materials });
  const consent = es ? 'Acepto este presupuesto exacto y uso mi nombre escrito como firma electrónica.' : 'I accept this exact estimate and use my typed name as my electronic signature.';
  return <Screen><View style={{ maxWidth: 640, width: '100%', alignSelf: 'center', gap: 16 }}>
    <T v="title">{q.business_name}</T><T>{q.business_phone}</T>
    <T v="h3">{es ? 'Presupuesto' : 'Estimate'} {q.number}</T>
    <T>{q.customer_name} · {q.address}</T><T>{q.title}</T>
    <Card><T>{q.scope?.location}</T><T>{q.scope?.notes}</T><T>{q.scope?.details}</T>
      {q.scope?.exclusions ? <T>{es ? 'No incluido: ' : 'Excluded: '}{q.scope.exclusions}</T> : null}
      {q.lines.filter((l) => l.excluded).map((l, i) => <T key={i}>{es ? 'No incluido: ' : 'Excluded: '}{l.description}</T>)}
      <DocumentTermsText values={q.scope} t={tc} />
    </Card>
    <Card>{included.map((l, i) => <LineRow key={i} label={l.description} sub={`${f.qty(l.qty_hundredths)} × ${f.money(l.unit_cents)}`} value={f.money(lineTotal(l.qty_hundredths, l.unit_cents))} />)}
      <LineRow label={es ? 'Subtotal' : 'Subtotal'} value={f.money(totals.subtotal)} />
      <LineRow label={es ? 'Impuesto' : 'Tax'} value={f.money(totals.tax)} />
      <LineRow label="Total" value={f.money(totals.total)} strong />
      {q.deposit_on ? <LineRow label={es ? 'Depósito solicitado (no pagado)' : 'Requested deposit (not paid)'} value={f.money(percentOf(totals.total, q.deposit_bps))} /> : null}
    </Card>
    <T v="small" muted>{es ? 'El enlace caduca: ' : 'Link expires: '}{f.date(page.expiresAt.slice(0, 10))}</T>
    {page.acceptedAt ? <Notice text={es ? `Presupuesto aceptado el ${f.date(page.acceptedAt.slice(0, 10))}. La firma no registra ningún pago.` : `Estimate accepted on ${f.date(page.acceptedAt.slice(0, 10))}. Signing does not record a payment.`} /> : page.declinedAt ?
      <Notice text={es ? `Presupuesto rechazado el ${f.date(page.declinedAt.slice(0, 10))}.` : `Estimate declined on ${f.date(page.declinedAt.slice(0, 10))}.`} /> : <>
      <T>{es ? 'No se guarda una firma dibujada. Tu nombre escrito, consentimiento, copia exacta y fecha se guardan como evidencia de aceptación.' : 'No drawn signature is collected. Your typed name, consent, exact copy and time are saved as evidence of acceptance.'}</T>
      <Field label={es ? 'Tu nombre completo' : 'Your full name'} value={name} maxLength={120} onChangeText={setName} />
      <Checkbox label={consent} value={agreed} onChange={setAgreed} />
      <Button label={busy ? es ? 'Guardando…' : 'Saving…' : es ? 'Aceptar presupuesto' : 'Accept estimate'} disabled={busy || confirmDecline || !agreed || name.trim().length < 2} onPress={async () => {
        setBusy(true); setFailed(false);
        try { const acceptedAt = await acceptEstimateAccess(String(token), page.hash, name.trim(), consent);
          setPage({ ...page, acceptedAt });
          await viewEstimateAccess(String(token)).then(setPage, () => {}); }
        catch { setFailed(true); } finally { setBusy(false); }
      }} />
      {confirmDecline ? <Card style={{ gap: 8 }}>
        <T>{es ? 'Si rechazas este presupuesto, ya no podrás aceptarlo desde el enlace.' : 'Declining closes this estimate to acceptance.'}</T>
        <Button label={es ? 'Confirmar rechazo' : 'Confirm decline'} disabled={busy} onPress={async () => {
          setBusy(true); setFailed(false);
          try {
            const declinedAt = await declineEstimateAccess(String(token), page.hash);
            setPage({ ...page, declinedAt });
            setConfirmDecline(false);
          } catch { setFailed(true); } finally { setBusy(false); }
        }} />
        <Button label={es ? 'Cancelar' : 'Cancel'} variant="outline" disabled={busy} onPress={() => setConfirmDecline(false)} />
      </Card> : <Button label={es ? 'Rechazar presupuesto' : 'Decline estimate'} variant="outline" disabled={busy} onPress={() => setConfirmDecline(true)} />}
    </>}
    {page.acceptedAt && q.deposit_on && percentOf(totals.total, q.deposit_bps) > 0 ? <>
      <Button label={es ? 'Abrir pago del depósito' : 'Open deposit payment'} disabled={busy} onPress={async () => {
        setBusy(true); setFailed(false);
        try { const result = await prepareQuoteDeposit(String(token)); await Linking.openURL(result.url); }
        catch { setFailed(true); } finally { setBusy(false); }
      }} />
      <T v="small" muted>{es ? 'Si ya pagaste o el pago está en proceso, no pagues de nuevo. Consulta a la empresa.' : 'If already paid or processing, do not pay again. Check with the business.'}</T>
    </> : null}
    <CustomerDocumentExport lang={q.lang} snapshot={{
      type: 'estimate', business: { name: q.business_name, phone: q.business_phone },
      customer: { name: q.customer_name, lang: q.lang, phone: null, email: null }, job: { title: q.title, address: q.address, workOrder: null },
      document: { number: q.number, sent_at: q.issued_at, signed_at: page.acceptedAt, declined_at: page.declinedAt,
        tax_rate_bps: q.tax.rate_bps, tax_labor: q.tax.labor, tax_materials: q.tax.materials,
        scope: q.scope, summary: [q.scope?.location, q.scope?.notes, q.scope?.details, q.scope?.exclusions].filter(Boolean).join('\n') },
      lines: q.lines, payments: [], signatures: page.signature ? [{ ...page.signature, signedAt: page.acceptedAt, hash: page.hash }] : [],
    }} />
    {failed ? <>
      <Notice text={es ? 'No pudimos completar la acción. Actualiza el estado para continuar.' : 'We could not complete that action. Refresh the estimate to continue.'} tone="danger" />
      <Button label={es ? 'Actualizar estado' : 'Refresh estimate'} variant="outline" onPress={load} />
    </> : null}
  </View></Screen>;
}
