import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Share } from 'react-native';

import { newUuid } from '@/data/db';
import { loadFinishTemplates, loadTradeTools, saveFinishTemplate, saveTradeTools } from '@/data/trade-tools';
import { customerOf, jobById } from '@/data/selectors';
import { currentState, useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { tradeToolsCopy } from '@/i18n/trade-tools';
import { emptyWorksheet, surfaceLine, surfaceTotals, validElectrical, type ElectricalRecord, type FinishSpec, type Surface, type TradeWorksheet } from '@/lib/trade-tools';
import { useFormat } from '@/lib/format';

import { Button, Card, Checkbox, Chip, Field, Notice, PageHeader, Row, Screen, T } from './ui';

const examples = new Map<string, TradeWorksheet>();
const exampleTemplates = new Map<string, FinishSpec>();
const blankSurface = (): Surface => ({ id: '', room: '', surface: '', width: 0, height: 0, openings: 0, coats: 2, coverage: 350, priceItemId: '' });
const blankRecord = (): ElectricalRecord => ({ circuit: '', test: '', result: 'not_tested', measured: '', technician: '', date: new Date().toISOString().slice(0, 10), permit: '', inspection: '', notes: '', photoIds: [] });

export function TradeTools({ jobId }: { jobId: string }) {
  const { state } = useStore();
  return <TradeToolsEditor key={`${state.mode}:${state.businessId ?? 'example'}:${jobId}`} jobId={jobId} />;
}

function TradeToolsEditor({ jobId }: { jobId: string }) {
  const { state, actions } = useStore();
  const { lang } = useLang();
  const c = tradeToolsCopy[lang];
  const f = useFormat();
  const job = jobById(jobId);
  const connected = state.mode === 'connected';
  const ownerKey = `${state.mode}:${state.businessId ?? 'example'}:${jobId}`;
  const [sheet, setSheet] = useState<TradeWorksheet>(emptyWorksheet);
  const [templates, setTemplates] = useState<FinishSpec[]>([]);
  const [surface, setSurface] = useState(blankSurface);
  const [record, setRecord] = useState(blankRecord);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  const [reviewed, setReviewed] = useState(false);
  const [shareReview, setShareReview] = useState(false);
  const revision = useRef(0);
  const draft = state.estimates[jobId];
  const locked = !!draft?.sent || !!draft?.signed;
  const active = () => { const s = currentState(); return `${s.mode}:${s.businessId ?? 'example'}:${jobId}` === ownerKey; };
  useEffect(() => {
    let live = true;
    const load = connected && state.businessId
      ? Promise.all([loadTradeTools(state.businessId, jobId), loadFinishTemplates(state.businessId)])
      : Promise.resolve([examples.get(ownerKey) ?? emptyWorksheet(), [...exampleTemplates.values()]] as [TradeWorksheet, FinishSpec[]]);
    load.then(([next, specs]) => {
      if (live) { setSheet(next); setTemplates(specs); setLoaded(true); }
    }).catch(() => { if (live) setMessage('load_error'); });
    return () => { live = false; };
  }, [ownerKey, connected, state.businessId, jobId, retry]);
  const edit = (next: TradeWorksheet) => { revision.current++; setSheet(next); setReviewed(false); setShareReview(false); setMessage(''); };
  const run = async (task: () => Promise<void>, success: string) => {
    if (!active() || !loaded || busy) return;
    const version = revision.current;
    setBusy(true); setMessage('');
    try { await task(); if (active()) setMessage(version === revision.current ? success : c.unsaved); }
    catch { if (active()) setMessage(c.error); }
    finally { if (active()) setBusy(false); }
  };
  const save = () => run(async () => {
    if (connected && state.businessId) await saveTradeTools(state.businessId, jobId, sheet);
    else examples.set(ownerKey, JSON.parse(JSON.stringify(sheet)) as TradeWorksheet);
  }, connected ? c.saved : c.exampleSaved);
  const numeric = (key: 'width' | 'height' | 'openings' | 'coats' | 'coverage', label: string) =>
    <Field key={key} label={label} value={surface[key] === 0 ? '' : String(surface[key])} keyboardType="decimal-pad"
      onChangeText={(value) => setSurface({ ...surface, [key]: value.trim() === '' ? 0 : Number(value.replace(',', '.')) })} />;
  const lineFor = (s: Surface) => { const item = state.priceList.find((p) => p.id === s.priceItemId); return item ? surfaceLine(s, item) : null; };
  const lines = sheet.surfaces.map((s) => { try { return lineFor(s); } catch { return null; } });
  const newLines = lines.filter((l) => l && !draft?.lines.some((old) => old.description === l.description && old.qtyHundredths === l.qtyHundredths && old.priceItemId === l.priceItemId));
  const setSpec = (key: keyof FinishSpec, value: string) => edit({ ...sheet, spec: { ...sheet.spec, [key]: value } });
  const customerCopy = tradeToolsCopy[customerOf(job).lang];
  const handover = [customerCopy.handoverTitle, job.title, job.address, customerCopy.warning, ...sheet.electrical.map((r) =>
    [r.circuit, `${customerCopy.test}: ${r.test}`, `${customerCopy.result}: ${customerCopy[r.result as 'pass' | 'fail' | 'not_tested']}`,
      `${customerCopy.measured}: ${r.measured}`, `${customerCopy.technician}: ${r.technician}`, r.date,
      `${customerCopy.permit}: ${r.permit}`, `${customerCopy.inspection}: ${r.inspection}`, r.notes,
      `${customerCopy.photoRefs}: ${r.photoIds.join(', ')}`].join('\n'))].join('\n\n');

  return <Screen header={<PageHeader title={c.title} sub={job.title} back={() => router.back()} />}>
    <Notice text={c.unsaved} tone="soft" />
    {message ? <Notice text={message === 'load_error' ? c.error : message} /> : null}
    {!loaded ? <><T>{c.loading}</T><Button label={c.retry} onPress={() => { setLoaded(false); setMessage(''); setRetry(retry + 1); }} /></> : <>
      <T v="h3">{c.paint}</T><T>{c.help}</T>
      <Card>
        <Field label={c.room} value={surface.room} maxLength={120} onChangeText={(room) => setSurface({ ...surface, room })} />
        <Field label={c.surface} value={surface.surface} maxLength={120} onChangeText={(value) => setSurface({ ...surface, surface: value })} />
        {numeric('width', c.width)}{numeric('height', c.height)}{numeric('openings', c.openings)}{numeric('coats', c.coats)}{numeric('coverage', c.coverage)}
        <T>{c.rate}</T>
        {state.priceList.filter((p) => p.unit === 'sq_ft' && p.unitCents !== null).map((p) =>
          <Chip key={p.id} label={`${p.name} · ${f.money(p.unitCents!)}`} selected={surface.priceItemId === p.id} onPress={() => setSurface({ ...surface, priceItemId: p.id })} />)}
        <T v="small">{c.rateHelp}</T>
        <Button label={c.addSurface} onPress={() => {
          try {
            if (!active() || !loaded) return;
            const next = { ...surface, id: newUuid() };
            if (!lineFor(next) || sheet.surfaces.length >= 100) throw new Error();
            edit({ ...sheet, surfaces: [...sheet.surfaces, next] }); setSurface(blankSurface());
          } catch { setMessage(c.invalid); }
        }} />
      </Card>
      {!sheet.surfaces.length ? <T>{c.empty}</T> : sheet.surfaces.map((s, i) => {
        const totals = surfaceTotals(s); const line = lines[i];
        return <Card key={s.id}><T v="h3">{s.room} · {s.surface}</T>
          <T>{c.area}: {totals.areaHundredths / 100} sq ft · {c.coats}: {s.coats}</T>
          <T>{c.gallons}: {totals.gallons}</T><T>{line ? `${f.money(line.unitCents)} / sq ft` : c.invalid}</T>
          <Button label={c.remove} variant="outline" onPress={() => edit({ ...sheet, surfaces: sheet.surfaces.filter((x) => x.id !== s.id) })} />
        </Card>;
      })}
      {locked ? <Notice text={c.locked} /> : <>
        <Checkbox label={c.review} value={reviewed} onChange={setReviewed} />
        <Button label={c.addEstimate} disabled={!reviewed || !newLines.length || lines.some((l) => !l)} onPress={() => {
          if (!active() || currentState().estimates[jobId]?.sent || currentState().estimates[jobId]?.signed) return;
          actions.addLines(jobId, newLines.filter((l): l is NonNullable<typeof l> => !!l)); setReviewed(false); setMessage(c.added);
        }} />
      </>}
      <T v="h3">{c.spec}</T>
      <Card>{(['name', 'prep', 'finish', 'exclusions'] as const).map((key) => <Field key={key} label={c[key]} value={sheet.spec[key]} maxLength={key === 'name' ? 120 : 2000} multiline onChangeText={(value) => setSpec(key, value)} />)}
        <Button label={c.saveTemplate} disabled={!sheet.spec.name.trim() || busy} onPress={() => run(async () => {
          if (connected && state.businessId) await saveFinishTemplate(state.businessId, sheet.spec);
          else exampleTemplates.set(sheet.spec.name, JSON.parse(JSON.stringify(sheet.spec)) as FinishSpec);
          if (active()) setTemplates((old) => [...old.filter((x) => x.name !== sheet.spec.name), sheet.spec]);
        }, c.templateSaved)} />
        {templates.map((spec) => <Button key={spec.name} label={`${c.useTemplate}: ${spec.name}`} variant="outline" onPress={() => edit({ ...sheet, spec: { ...spec } })} />)}
        <Button label={c.applyScope} disabled={locked || !sheet.spec.prep.trim() && !sheet.spec.finish.trim() && !sheet.spec.exclusions.trim()} onPress={() => {
          if (!active() || currentState().estimates[jobId]?.sent || currentState().estimates[jobId]?.signed) return;
          const scope = currentState().estimates[jobId]?.scope ?? {};
          const detail = [sheet.spec.prep, sheet.spec.finish].filter(Boolean).join('\n');
          actions.updateEstimate(jobId, { scope: { ...scope, details: [scope.details, detail].filter(Boolean).join('\n'), exclusions: [scope.exclusions, sheet.spec.exclusions].filter(Boolean).join('\n') } });
          setMessage(c.scopeAdded);
        }} />
      </Card>
      <T v="h3">{c.electrical}</T><Notice text={c.warning} />
      <Card>{(['circuit', 'test', 'measured', 'technician', 'date', 'permit', 'inspection', 'notes'] as const).map((key) =>
        <Field key={key} label={c[key]} value={record[key]} maxLength={2000} multiline={key === 'notes'} onChangeText={(value) => setRecord({ ...record, [key]: value })} />)}
        <Row>{(['pass', 'fail', 'not_tested'] as const).map((value) => <Chip key={value} label={c[value]} selected={record.result === value} onPress={() => setRecord({ ...record, result: value })} />)}</Row>
        <T>{c.photos}</T>{state.photos.filter((p) => p.jobId === jobId).map((p) => <Checkbox key={p.id} label={`${p.tag} · ${p.takenAt} · ${p.id}`} value={record.photoIds.includes(p.id)} onChange={(on) => setRecord({ ...record, photoIds: on ? [...record.photoIds, p.id] : record.photoIds.filter((id) => id !== p.id) })} />)}
        <Button label={c.keepRecord} disabled={!validElectrical(record)} onPress={() => {
          if (sheet.electrical.length >= 100) { setMessage(c.invalid); return; }
          edit({ ...sheet, electrical: [...sheet.electrical, record] }); setRecord(blankRecord());
        }} />
      </Card>
      {!sheet.electrical.length ? <T>{c.noRecords}</T> : sheet.electrical.map((r, i) => <Card key={i}>
        <T>{r.circuit} · {r.test} · {c[r.result as 'pass' | 'fail' | 'not_tested']}</T><T>{r.measured} · {r.technician} · {r.date}</T>
        <T>{r.permit} · {r.inspection}</T><T>{r.notes}</T>
        <Button label={c.remove} variant="outline" onPress={() => edit({ ...sheet, electrical: sheet.electrical.filter((_, index) => i !== index) })} />
      </Card>)}
      <Button label={c.save} big disabled={busy} onPress={save} />
      {sheet.electrical.length ? <><T>{c.shareReview}</T><T>{handover}</T>
        <Checkbox label={c.review} value={shareReview} onChange={setShareReview} />
        <Button label={c.handover} disabled={!shareReview} onPress={() => run(async () => { await Share.share({ message: handover }); }, '')} />
      </> : null}
    </>}
  </Screen>;
}
