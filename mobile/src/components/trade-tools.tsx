import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Share, View } from 'react-native';

import { newUuid } from '@/data/db';
import { loadTradeTools, saveTradeTools } from '@/data/trade-tools';
import { customerOf, jobById } from '@/data/selectors';
import { currentState, useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { tradeToolsCopy } from '@/i18n/trade-tools';
import { useFormat } from '@/lib/format';
import { lineTotal } from '@/lib/money';
import { emptyWorksheet, surfaceLine, surfaceTotals, validElectrical, type ElectricalRecord, type Surface, type TradeWorksheet } from '@/lib/trade-tools';

import { Button, Card, Checkbox, Chip, Field, Hair, IconButton, ListCard, ListRow, Notice, PageHeader, Row, Screen, T } from './ui';

const examples = new Map<string, TradeWorksheet>();
const blankRecord = (): ElectricalRecord => ({ circuit: '', test: '', result: 'not_tested', measured: '', technician: '', date: new Date().toISOString().slice(0, 10), permit: '', inspection: '', notes: '', photoIds: [] });
/** "12" or "12.5" feet; anything else is not a size. */
const feet = (text: string) => (/^\d{1,5}([.,]\d{1,2})?$/.test(text.trim()) ? Number(text.trim().replace(',', '.')) : 0);

const copy = {
  en: { title: 'Measurements', help: 'Type a room and its size. KILN works out the square feet and adds it to the estimate at your price.',
    room: 'Room or area', width: 'Width (ft)', length: 'Length or height (ft)', add: 'Add to estimate', added: 'Added to the estimate.',
    noPrice: 'Add a price per square foot to your price list first.', openPrices: 'Open price list', locked: 'The estimate was sent, so measurements can’t be added to it.',
    electrical: 'Electrical test records', failed: 'Could not save. Check your connection and try again.' },
  es: { title: 'Medidas', help: 'Escribe un cuarto y su tamaño. KILN calcula los pies cuadrados y lo agrega al presupuesto a tu precio.',
    room: 'Cuarto o área', width: 'Ancho (pies)', length: 'Largo o alto (pies)', add: 'Agregar al presupuesto', added: 'Agregado al presupuesto.',
    noPrice: 'Primero agrega un precio por pie cuadrado a tu lista de precios.', openPrices: 'Abrir lista de precios', locked: 'El presupuesto ya se envió; no se pueden agregar medidas.',
    electrical: 'Registros de pruebas eléctricas', failed: 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.' },
};

export function TradeTools({ jobId }: { jobId: string }) {
  const { state } = useStore();
  return <TradeToolsEditor key={`${state.mode}:${state.businessId ?? 'example'}:${jobId}`} jobId={jobId} />;
}

/** Measurements: room, width, length, price. One tap adds the line to the estimate. */
function TradeToolsEditor({ jobId }: { jobId: string }) {
  const { state, actions } = useStore();
  const { lang } = useLang();
  const k = copy[lang];
  const c = tradeToolsCopy[lang];
  const f = useFormat();
  const job = jobById(jobId);
  const connected = state.mode === 'connected';
  const ownerKey = `${state.mode}:${state.businessId ?? 'example'}:${jobId}`;
  const sqftItems = state.priceList.filter((p) => p.unit === 'sq_ft' && p.unitCents !== null);
  const [sheet, setSheet] = useState<TradeWorksheet>(emptyWorksheet);
  const [room, setRoom] = useState('');
  const [width, setWidth] = useState('');
  const [length, setLength] = useState('');
  const [itemId, setItemId] = useState(sqftItems[0]?.id ?? '');
  const [record, setRecord] = useState(blankRecord);
  const [electricalOpen, setElectricalOpen] = useState(false);
  const [shareReview, setShareReview] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  const saving = useRef(Promise.resolve());
  const draft = state.estimates[jobId];
  const locked = !!draft?.sent || !!draft?.signed;
  const active = () => { const s = currentState(); return `${s.mode}:${s.businessId ?? 'example'}:${jobId}` === ownerKey; };
  useEffect(() => {
    let live = true;
    const load = connected && state.businessId ? loadTradeTools(state.businessId, jobId) : Promise.resolve(examples.get(ownerKey) ?? emptyWorksheet());
    load.then((next) => { if (live) { setSheet(next); setLoaded(true); } }).catch(() => { if (live) setMessage(c.error); });
    return () => { live = false; };
  }, [ownerKey, connected, state.businessId, jobId, retry, c.error]);

  // every change saves on its own, one after another; no Save button
  const commit = (next: TradeWorksheet) => {
    setSheet(next);
    saving.current = saving.current.then(async () => {
      if (connected && state.businessId) await saveTradeTools(state.businessId, jobId, next);
      else examples.set(ownerKey, JSON.parse(JSON.stringify(next)) as TradeWorksheet);
    }).catch(() => { if (active()) setMessage(k.failed); });
  };

  // a plain room measurement: no openings; coats and coverage only matter for paint gallons, not price
  const surface: Surface = { id: '', room: room.trim(), surface: room.trim(), width: feet(width), height: feet(length), openings: 0, coats: 1, coverage: 350, priceItemId: itemId };
  const item = sqftItems.find((p) => p.id === itemId);
  let line: ReturnType<typeof surfaceLine> | null = null;
  try { line = item ? surfaceLine(surface, item) : null; } catch { line = null; }

  const addMeasurement = () => {
    if (!line || locked || !active() || !loaded || currentState().estimates[jobId]?.sent || currentState().estimates[jobId]?.signed) return;
    actions.addLines(jobId, [{ ...line, description: room.trim() }]);
    commit({ ...sheet, surfaces: [...sheet.surfaces, { ...surface, id: newUuid() }].slice(-100) });
    setRoom(''); setWidth(''); setLength(''); setMessage(k.added);
  };

  const customerCopy = tradeToolsCopy[customerOf(job).lang];
  const handover = [customerCopy.handoverTitle, job.title, job.address, customerCopy.warning, ...sheet.electrical.map((r) =>
    [r.circuit, `${customerCopy.test}: ${r.test}`, `${customerCopy.result}: ${customerCopy[r.result as 'pass' | 'fail' | 'not_tested']}`,
      `${customerCopy.measured}: ${r.measured}`, `${customerCopy.technician}: ${r.technician}`, r.date,
      `${customerCopy.permit}: ${r.permit}`, `${customerCopy.inspection}: ${r.inspection}`, r.notes].join('\n'))].join('\n\n');
  const showElectrical = state.profile.trades.includes('electrical') || sheet.electrical.length > 0;

  return <Screen header={<PageHeader title={k.title} sub={job.title} back={() => router.back()} />}>
    {!loaded ? <>
      <T muted>{message || c.loading}</T>
      {message ? <Button label={c.retry} variant="outline" onPress={() => { setMessage(''); setRetry(retry + 1); }} /> : null}
    </> : <>
      {locked ? <Notice text={k.locked} icon="lock" tone="soft" /> : sqftItems.length === 0 ? <>
        <Notice text={k.noPrice} icon="info" tone="soft" />
        <Button label={k.openPrices} variant="outline" onPress={() => router.push('/settings/prices')} />
      </> : <Card style={{ gap: 12 }}>
        <T v="small" muted>{k.help}</T>
        <Field label={k.room} value={room} onChangeText={setRoom} maxLength={120} autoCapitalize="sentences" />
        <Row gap={10} style={{ alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}><Field label={k.width} value={width} onChangeText={setWidth} keyboardType="decimal-pad" /></View>
          <View style={{ flex: 1 }}><Field label={k.length} value={length} onChangeText={setLength} keyboardType="decimal-pad" /></View>
        </Row>
        {sqftItems.length > 1 ? <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {sqftItems.map((p) => <Chip key={p.id} label={`${p.name} · ${f.money(p.unitCents!)}`} selected={itemId === p.id} onPress={() => setItemId(p.id)} />)}
        </Row> : null}
        {line ? <T v="label">{`${f.qty(line.qtyHundredths)} sq ft × ${f.money(line.unitCents)} = ${f.money(lineTotal(line.qtyHundredths, line.unitCents))}`}</T> : null}
        <Button label={k.add} icon="plus" big disabled={!line || !room.trim()} onPress={addMeasurement} />
      </Card>}
      {message && loaded ? <Notice text={message} tone={message === k.failed ? 'danger' : 'soft'} /> : null}

      {sheet.surfaces.length ? <ListCard>
        {sheet.surfaces.map((s, i) => {
          let area = '';
          try { area = `${f.qty(surfaceTotals(s).areaHundredths)} sq ft`; } catch { area = ''; }
          return <View key={s.id}>
            {i ? <Hair /> : null}
            <ListRow icon="maximize" title={s.room} sub={area}
              right={<IconButton icon="trash-2" label={`${c.remove} ${s.room}`} onPress={() => commit({ ...sheet, surfaces: sheet.surfaces.filter((x) => x.id !== s.id) })} />} />
          </View>;
        })}
      </ListCard> : null}

      {showElectrical ? <Card style={{ gap: 10 }}>
        <ListRow icon="zap" title={k.electrical} sub={String(sheet.electrical.length)} onPress={() => setElectricalOpen(!electricalOpen)} />
        {electricalOpen ? <>
          <Notice text={c.warning} />
          {(['circuit', 'test', 'measured', 'technician', 'date'] as const).map((key) =>
            <Field key={key} label={c[key]} value={record[key]} maxLength={2000} onChangeText={(value) => setRecord({ ...record, [key]: value })} />)}
          <Row>{(['pass', 'fail', 'not_tested'] as const).map((value) => <Chip key={value} label={c[value]} selected={record.result === value} onPress={() => setRecord({ ...record, result: value })} />)}</Row>
          <Button label={c.keepRecord} disabled={!validElectrical(record) || sheet.electrical.length >= 100} onPress={() => {
            commit({ ...sheet, electrical: [...sheet.electrical, record] }); setRecord(blankRecord()); setShareReview(false);
          }} />
          {sheet.electrical.map((r, i) => <ListRow key={i} icon="check-square" title={`${r.circuit} · ${c[r.result as 'pass' | 'fail' | 'not_tested']}`}
            sub={`${r.test} · ${r.date}`}
            right={<IconButton icon="trash-2" label={`${c.remove} ${r.circuit}`} onPress={() => commit({ ...sheet, electrical: sheet.electrical.filter((_, index) => index !== i) })} />} />)}
          {sheet.electrical.length ? <>
            <Checkbox label={c.review} value={shareReview} onChange={setShareReview} />
            <Button label={c.handover} variant="outline" icon="share" disabled={!shareReview} onPress={() => { void Share.share({ message: handover }); }} />
          </> : null}
        </> : null}
      </Card> : null}
    </>}
  </Screen>;
}
