import * as Print from 'expo-print';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useMemo, useState } from 'react';
import { Platform, View } from 'react-native';

import { Button, Card, Field, Hair, ListRow, Notice, PageHeader, Row, Screen, T } from '@/components/ui';
import { useAuth } from '@/data/auth';
import * as api from '@/data/job-cleanup';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';
import { savedDocHtml, savedTotals, type SavedDocLabels } from '@/lib/saved-doc';
import { userError } from '@/lib/user-errors';

import { cleanupText, type CleanupText } from './text';

const typeName = (c: CleanupText, type: api.SavedDocType) => (type === 'estimate' ? c.estimate : type === 'invoice' ? c.invoice : c.changeOrder);

/** Documents kept from removed jobs, grouped by job, newest first. Owners and managers. */
export function SavedDocumentsScreen() {
  const { lang, t } = useLang();
  const c = cleanupText(lang);
  const f = useFormat();
  const auth = useAuth();
  const [docs, setDocs] = useState<api.SavedDocument[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const businessId = auth.businessId;

  const load = useCallback(() => {
    if (!businessId) return () => {};
    let live = true;
    api.loadSavedDocuments(businessId).then((d) => { if (live) { setDocs(d); setError(''); } }, (e: unknown) => { if (live) setError(userError(t, e)); });
    return () => { live = false; };
  }, [businessId, t]);
  useFocusEffect(load);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = (docs ?? []).filter((d) => !q || [d.jobTitle, d.customerName, d.jobAddress, d.number ?? ''].some((x) => x.toLowerCase().includes(q)));
    const byJob = new Map<string, api.SavedDocument[]>();
    for (const d of shown) byJob.set(d.jobId, [...byJob.get(d.jobId) ?? [], d]);
    return [...byJob.values()];
  }, [docs, query]);

  return (
    <Screen header={<PageHeader title={c.savedTitle} back={() => router.back()} />}>
      {!businessId ? <Notice text={c.failed} tone="soft" /> : null}
      {error ? <><Notice text={c.failed} tone="danger" icon="alert-circle" /><Button label={c.retry} variant="outline" onPress={() => load()} /></> : null}
      {!docs && !error && businessId ? <T muted>{c.loading}</T> : null}
      {docs && docs.length ? <Field value={query} onChangeText={setQuery} placeholder={c.search} accessibilityLabel={c.search} returnKeyType="search" /> : null}
      {docs && !docs.length ? <Notice text={c.savedEmpty} tone="soft" icon="archive" /> : null}
      {groups.map((group) => {
        const first = group[0];
        return <Card key={first.jobId} style={{ paddingVertical: 6, gap: 2 }}>
          <T v="label" style={{ paddingTop: 6 }}>{first.jobTitle}</T>
          <T v="small" muted>{[first.customerName, first.jobAddress, c.removedOn.replace('%{when}', f.date(first.savedAt.slice(0, 10)))].filter(Boolean).join(' · ')}</T>
          {group.map((d) => <View key={d.id}>
            <Hair />
            <ListRow icon="file-text" title={`${typeName(c, d.type)}${d.number ? ` ${d.number}` : ''}`}
              sub={d.issuedAt ? f.date(d.issuedAt.slice(0, 10)) : undefined} chevron onPress={() => router.push(`/saved-documents/${d.id}`)} />
          </View>)}
        </Card>;
      })}
    </Screen>
  );
}

/** One saved document: the key facts here, and the full copy as a PDF to share or keep. */
export function SavedDocumentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { lang, t } = useLang();
  const c = cleanupText(lang);
  const f = useFormat();
  const auth = useAuth();
  const [item, setItem] = useState<{ doc: api.SavedDocument; snapshot: api.SavedSnapshot } | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useFocusEffect(useCallback(() => {
    let live = true;
    if (id) api.loadSavedDocument(id).then((x) => { if (live) setItem(x); }, (e: unknown) => { if (live) setError(userError(t, e)); });
    return () => { live = false; };
  }, [id, t]));

  const header = <PageHeader title={item ? `${typeName(c, item.doc.type)}${item.doc.number ? ` ${item.doc.number}` : ''}` : c.savedTitle} back={() => router.back()} />;
  if (error) return <Screen header={header}><Notice text={c.failed} tone="danger" icon="alert-circle" /></Screen>;
  if (item === undefined) return <Screen header={header}><T muted>{c.loading}</T></Screen>;
  if (!item) return <Screen header={header}><Notice text={c.savedEmpty} tone="soft" /></Screen>;

  const s = item.snapshot;
  const totals = savedTotals(s);
  // the document is in the customer's language, like the one they were sent
  const docLang = s.customer.lang === 'es' ? 'es' : s.customer.lang === 'en' ? 'en' : lang;
  const dc = cleanupText(docLang);
  const methods: Record<string, string> = { cash: dc.cash, check: dc.check, card: dc.card, bank: dc.bank, wallet: dc.wallet, other: dc.other };
  const labels: SavedDocLabels = {
    title: typeName(dc, s.type), billTo: dc.billTo, job: dc.job, workOrder: dc.workOrder, issued: dc.issued, paidOn: dc.paidOn,
    signed: dc.signed, declined: dc.declined, description: dc.description, qty: dc.qty, price: dc.price, amount: dc.amount, excluded: dc.excluded,
    subtotal: dc.subtotal, tax: dc.tax, total: dc.total, paid: dc.paid, due: dc.due, base: dc.base, newTotal: dc.newTotal,
    payments: dc.payments, signatures: dc.signatures, fingerprint: dc.fingerprint,
    method: (m) => methods[m] ?? dc.other, signedBy: (name) => dc.signedBy.replace('%{name}', name),
  };

  const share = async () => {
    setBusy(true);
    setError('');
    try {
      const html = savedDocHtml(s, labels, docLang);
      if (Platform.OS === 'web') { await Print.printAsync({ html }); return; }
      const file = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: labels.title });
    } catch (e) {
      setError(userError(t, e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteSavedDocument(item.doc.id);
      router.back();
    } catch (e) {
      setError(userError(t, e));
      setBusy(false);
    }
  };

  return (
    <Screen header={header}>
      <Card style={{ gap: 6 }}>
        <T v="label">{s.job.title}</T>
        <T v="small" muted>{[s.customer.name, s.job.address].filter(Boolean).join(' · ')}</T>
        {item.doc.issuedAt ? <T v="small" muted>{c.issued}: {f.date(item.doc.issuedAt.slice(0, 10))}</T> : null}
        {item.doc.paidAt ? <T v="small" muted>{c.paidOn}: {f.date(item.doc.paidAt.slice(0, 10))}</T> : null}
      </Card>
      {s.lines.length ? <Card style={{ paddingVertical: 4 }}>
        {s.lines.map((l, i) => <View key={i}>
          {i ? <Hair /> : null}
          <Row style={{ justifyContent: 'space-between', paddingVertical: 10 }} gap={12}>
            <T style={{ flex: 1 }}>{l.description}</T>
            <T v="label">{l.excluded || l.unit_cents === null ? c.excluded : f.money(Math.round((l.qty_hundredths * l.unit_cents) / 100))}</T>
          </Row>
        </View>)}
      </Card> : null}
      <Card style={{ gap: 6 }}>
        {s.type === 'change_order' ? <>
          {typeof s.document.description === 'string' ? <T>{s.document.description}</T> : null}
          <Row style={{ justifyContent: 'space-between' }}><T>{c.change}</T><T v="label">{f.money(totals.total)}</T></Row>
        </> : <>
          <Row style={{ justifyContent: 'space-between' }}><T>{c.subtotal}</T><T v="label">{f.money(totals.subtotal)}</T></Row>
          {totals.tax ? <Row style={{ justifyContent: 'space-between' }}><T>{c.tax}</T><T v="label">{f.money(totals.tax)}</T></Row> : null}
          <Row style={{ justifyContent: 'space-between' }}><T v="h3">{c.total}</T><T v="h3">{f.money(totals.total)}</T></Row>
          {totals.paid ? <Row style={{ justifyContent: 'space-between' }}><T>{c.paid}</T><T v="label">{f.money(totals.paid)}</T></Row> : null}
          {s.type === 'invoice' ? <Row style={{ justifyContent: 'space-between' }}><T>{c.due}</T><T v="label">{f.money(totals.due)}</T></Row> : null}
        </>}
      </Card>
      {s.signatures.map((sig, i) => <Notice key={i} text={`${c.signedBy.replace('%{name}', sig.name)}${sig.signedAt ? ` · ${f.date(sig.signedAt.slice(0, 10))}` : ''}`} tone="soft" icon="edit-3" />)}
      {error ? <Notice text={error} tone="danger" icon="alert-circle" /> : null}
      <Button label={c.sharePdf} icon="share" disabled={busy} onPress={() => void share()} />
      {auth.role === 'owner' ? (confirm ? <>
        <Notice text={c.deleteHelp} tone="flag" icon="alert-triangle" />
        <Button label={c.deleteConfirm} variant="danger" disabled={busy} onPress={() => void remove()} />
        <Button label={c.cancel} variant="outline" onPress={() => setConfirm(false)} />
      </> : <Button label={c.deleteDoc} icon="trash-2" variant="outline" onPress={() => setConfirm(true)} />) : null}
    </Screen>
  );
}
