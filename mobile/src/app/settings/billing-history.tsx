import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { Button, Card, Field, LineRow, Notice, PageHeader, Screen, Segmented, T } from '@/components/ui';
import { invoiceRegisterCsv, loadInvoiceRegister, paymentRegisterCsv } from '@/data/billing-export';
import { currentState, useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';
import { localDate } from '@/lib/invoice-aging';
import { shareCsv } from '@/lib/share-csv';

export default function BillingHistoryRoute() {
  const { state } = useStore();
  const { lang } = useLang();
  const title = lang === 'es' ? 'Historial de facturación' : 'Billing history';
  return <Screen header={<PageHeader title={title} back={() => router.back()} />}>
    {state.mode === 'connected' && state.businessId ? <BillingHistory key={state.businessId} businessId={state.businessId} />
      : <T>{lang === 'es' ? 'Inicia sesión para consultar el historial.' : 'Sign in to view billing history.'}</T>}
  </Screen>;
}

function BillingHistory({ businessId }: { businessId: string }) {
  const { lang, t } = useLang();
  const f = useFormat();
  const es = lang === 'es';
  const [rows, setRows] = useState<Awaited<ReturnType<typeof loadInvoiceRegister>> | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'paid'>('all');
  const [limit, setLimit] = useState(80);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const focused = useRef(false);
  useFocusEffect(useCallback(() => {
    void attempt;
    let active = true;
    focused.current = true;
    void loadInvoiceRegister(businessId).then((result) => { if (active) { setRows(result); setError(false); } }, () => { if (active) setError(true); });
    return () => { active = false; focused.current = false; };
  }, [businessId, attempt]));
  const q = query.trim().toLowerCase();
  const shown = rows?.filter(({ data }) => (filter === 'all' || (filter === 'paid' ? data.status === 'paid' : data.status !== 'paid')) &&
    `${data.number} ${data.customer} ${data.job}`.toLowerCase().includes(q)) ?? [];
  const exportRecords = async (kind: 'invoices' | 'payments') => {
    setBusy(true); setError(false);
    try {
      const csv = kind === 'invoices' ? invoiceRegisterCsv((await loadInvoiceRegister(businessId)).map(({ data }) => data)) : await paymentRegisterCsv(businessId);
      if (focused.current && currentState().businessId === businessId) await shareCsv(`kiln-${kind}.csv`, csv);
    } catch { if (focused.current) setError(true); }
    finally { setBusy(false); }
  };
  return <>
    <Button label={es ? 'Exportar facturas CSV' : 'Export invoices CSV'} icon="download" variant="outline" disabled={busy} onPress={() => exportRecords('invoices')} />
    <Button label={es ? 'Exportar pagos CSV' : 'Export payments CSV'} icon="download" variant="outline" disabled={busy} onPress={() => exportRecords('payments')} />
    {error ? <>
      <Notice text={es ? 'No se pudo completar. Revisa tu conexión e inténtalo de nuevo.' : 'Could not finish. Check your connection and try again.'} tone="danger" />
      <Button label={es ? 'Actualizar historial' : 'Reload history'} variant="outline" onPress={() => setAttempt((value) => value + 1)} />
    </> : null}
    <Field label={es ? 'Buscar facturas' : 'Search invoices'} value={query} onChangeText={setQuery} />
    <Segmented label={es ? 'Estado' : 'Status'} value={filter} onChange={setFilter} options={[
      { key: 'all', label: es ? 'Todas' : 'All' }, { key: 'open', label: es ? 'Pendientes' : 'Open' }, { key: 'paid', label: es ? 'Pagadas' : 'Paid' },
    ]} />
    {!rows && !error ? <T>{t('common.loading')}</T> : null}
    {rows && !shown.length ? <T muted>{es ? 'No hay facturas para mostrar.' : 'No matching invoices.'}</T> : null}
    {shown.slice(0, limit).map(({ record_id, data, archived }) => <Card key={record_id} style={{ gap: 6 }}>
      <T v="label">{data.number} · {data.customer}</T>
      <T v="small" muted>{data.job}</T>
      {data.dueOn ? <T v="small" muted>{f.date(data.dueOn)}</T> : null}
      <LineRow label={data.status === 'paid' ? (es ? 'Pagada' : 'Paid')
        : data.dueOn && data.dueOn < localDate() ? (es ? 'Vencida' : 'Overdue') : (es ? 'Saldo' : 'Balance due')}
        value={f.money(data.status === 'paid' ? data.paid : Math.max(0, data.total - data.paid))} />
      <Button label={es ? 'Abrir factura' : 'Open invoice'} variant="outline" onPress={() => router.push(archived ? `/saved-documents/${record_id}` : `/invoice/${record_id}`)} />
    </Card>)}
    {shown.length > limit ? <Button label={es ? 'Mostrar más' : 'Show more'} variant="outline" onPress={() => setLimit(limit + 80)} /> : null}
  </>;
}
