import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { CustomerDocumentExport } from '@/components/customer-document-export';
import { Button, Card, Checkbox, Field, LineRow, Notice, Screen, T } from '@/components/ui';
import { answerChangeOrder, viewChangeOrder, type ChangeOrderAccess } from '@/data/document-delivery';
import { useLang, useTFor } from '@/i18n';
import { formatters } from '@/lib/format';

export default function CustomerChangeRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <CustomerChange key={token} token={String(token)} />;
}

function CustomerChange({ token }: { token: string }) {
  const { lang } = useLang();
  const [page, setPage] = useState<ChangeOrderAccess | null>(null);
  const [revision, setRevision] = useState(0);
  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void viewChangeOrder(token).then((result) => { if (active) { setPage(result); setFailed(false); } }, () => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [token, revision]);
  const language = page?.snapshot.lang ?? lang;
  const es = language === 'es';
  const t = useTFor(language);
  const f = formatters(language);
  const reload = () => { setRevision((value) => value + 1); setAgreed(false); setDeclining(false); };
  const error = failed ? <>
    <Notice text={es ? 'No se pudo abrir o guardar la orden. Actualízala o pide un enlace nuevo.' : 'Could not open or save the change order. Refresh it or ask for a new link.'} tone="danger" />
    <Button label={es ? 'Reintentar' : 'Try again'} variant="outline" onPress={reload} />
  </> : null;
  if (!page) return <Screen>{error ?? <T>{t('common.loading')}</T>}</Screen>;
  const co = page.snapshot;
  const title = t('changeOrder.title', { n: co.number });
  const consent = es ? 'Acepto esta orden de cambio y uso mi nombre escrito como firma electrónica.' : 'I accept this change order and use my typed name as my electronic signature.';
  const respond = async (accept: boolean) => {
    setBusy(true); setFailed(false);
    try { setPage(await answerChangeOrder(token, page.hash, accept, name.trim())); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  };
  return <Screen><View style={{ alignSelf: 'center', width: '100%', maxWidth: 600, gap: 14 }}>
    <T v="label">{co.business_name}</T>
    <T v="title">{title}</T>
    <T muted>{[co.customer_name, co.address].filter(Boolean).join(' · ')}</T>
    <Card style={{ gap: 8 }}>
      <T>{co.description}</T>
      <LineRow label={t('changeOrder.signedEstimate')} value={f.money(co.base_cents)} />
      <LineRow label={t('changeOrder.thisChange')} value={f.money(co.amount_cents)} />
      <LineRow label={t('changeOrder.newTotal')} value={f.money(co.base_cents + co.amount_cents)} strong />
    </Card>
    {page.signedAt ? <Notice text={t('changeOrder.signedBy', { name: page.signature?.name ?? co.customer_name })} />
      : page.declinedAt ? <Notice text={t('review.changeDeclined')} /> : <>
        <Field label={t('changeOrder.fullName')} value={name} onChangeText={setName} autoComplete="name" maxLength={120} />
        <Checkbox label={consent} value={agreed} onChange={setAgreed} />
        <Button label={t('changeOrder.signApprove')} disabled={busy || declining || !agreed || name.trim().length < 2} onPress={() => respond(true)} />
        {declining ? <>
          <Button label={es ? 'Confirmar rechazo' : 'Confirm decline'} disabled={busy} onPress={() => respond(false)} />
          <Button label={t('common.cancel')} variant="outline" disabled={busy} onPress={() => setDeclining(false)} />
        </> : <Button label={t('customer.decline')} variant="outline" disabled={busy} onPress={() => setDeclining(true)} />}
      </>}
    {error}
    <CustomerDocumentExport lang={language} snapshot={{
      type: 'change_order', business: { name: co.business_name, phone: co.business_phone },
      customer: { name: co.customer_name, lang: language, phone: null, email: null },
      job: { title: co.job_title, address: co.address, workOrder: co.work_order },
      document: { number: String(co.number), sent_at: co.issued_at, signed_at: page.signedAt, declined_at: page.declinedAt,
        description: co.description, amount_cents: co.amount_cents, base_cents: co.base_cents },
      lines: [], payments: [], signatures: page.signature ? [{ ...page.signature, signedAt: page.signedAt, hash: page.hash }] : [],
    }} />
  </View></Screen>;
}
