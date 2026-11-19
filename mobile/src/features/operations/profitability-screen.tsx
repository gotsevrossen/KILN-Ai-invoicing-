import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { RecordGate } from '@/components/record-gate';
import { Button, Card, Chip, Field, Hair, LineRow, Notice, PageHeader, Row, Screen, T } from '@/components/ui';
import * as sample from '@/data/sample';
import { changeOrdersForJob, estimateTotals, hasJob, invoiceForJob, invoiceTotals, jobById, partsCost } from '@/data/selectors';
import { useStore } from '@/data/store';
import { useFormat } from '@/lib/format';
import { documentTotals } from '@/lib/money';
import * as api from './api';
import { centsInput, jobProfitability, type Budget, type LaborCost } from './model';
import { useOperations } from './use-operations';

function Profitability() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const op = useOperations();
  const c = op.copy;
  const f = useFormat();
  const { state } = useStore();
  const job = jobById(id);
  const invoice = invoiceForJob(id);
  const estimate = state.estimates[id];
  const savedEstimate = sample.customerEstimates.find((e) => e.jobId === id);
  const changes = changeOrdersForJob(id).filter((co) => state.signed[co.id]).reduce((sum, co) => sum + co.amountCents, 0);
  const revenue = invoice ? invoiceTotals(state, invoice).subtotal
    : estimate?.lines.length ? estimateTotals(state, id).subtotal + changes
      : savedEstimate ? documentTotals(savedEstimate.lines, { rateBps: 0, labor: false, materials: false }).subtotal + changes : null;
  const entries = state.timeEntries.filter((e) => e.jobId === id);
  const budget = op.data.budgets.find((b) => b.job_id === id);
  const result = jobProfitability(revenue, partsCost(state, id), budget?.actual_other_cents ?? 0, entries, op.data.labor);
  const [labor, setLabor] = useState('0');
  const [material, setMaterial] = useState('0');
  const [other, setOther] = useState('0');
  const [actualOther, setActualOther] = useState('0');
  const [workerId, setWorkerId] = useState('');
  const [entryId, setEntryId] = useState('');
  const [inputError, setInputError] = useState('');
  const initialized = useRef('');
  const key = `${op.businessId}:${id}`;
  useEffect(() => {
    if (!op.ready || initialized.current === key) return;
    initialized.current = key;
    setLabor(((budget?.labor_cents ?? 0) / 100).toFixed(2));
    setMaterial(((budget?.material_cents ?? 0) / 100).toFixed(2));
    setOther(((budget?.other_cents ?? 0) / 100).toFixed(2));
    setActualOther(((budget?.actual_other_cents ?? 0) / 100).toFixed(2));
  }, [op.ready, key, budget]);
  const saveBudget = async () => {
    const values = [labor, material, other, actualOther].map(centsInput);
    if (values.some((v) => v === null)) { setInputError(c.badBudget); return; }
    const next: Budget = { job_id: id, business_id: op.businessId, labor_cents: values[0]!, material_cents: values[1]!, other_cents: values[2]!, actual_other_cents: values[3]! };
    if (await op.run(() => api.saveBudget(next), (d) => ({ ...d, budgets: [...d.budgets.filter((b) => b.job_id !== id), next] }))) setInputError('');
  };
  const assign = async () => {
    const worker = op.data.workers.find((w) => w.id === workerId && !w.archived);
    if (!worker || !entries.some((e) => e.id === entryId)) { setInputError(c.selectHours); return; }
    // The server freezes the authoritative rate too; re-saving the same worker
    // must preserve the previous snapshot in example mode as well.
    const existing = op.data.labor.find((l) => l.time_entry_id === entryId);
    const next: LaborCost = { time_entry_id: entryId, business_id: op.businessId, worker_id: worker.id, loaded_rate_cents: existing?.worker_id === worker.id ? existing.loaded_rate_cents : worker.loaded_rate_cents };
    if (await op.run(() => api.saveLabor(next), (d) => ({ ...d, labor: [...d.labor.filter((l) => l.time_entry_id !== entryId), next] }))) { setEntryId(''); setInputError(''); }
  };
  return <Screen header={<PageHeader title={c.profit} sub={job.title} back={() => router.back()} />}>
    <Notice text={c.profitHelp} icon="lock" tone="soft" />
    {!op.connected ? <Notice text={c.preview} tone="soft" /> : null}
    {op.error ? <><Notice text={op.error} tone="danger" /><Button label={c.retry} variant="outline" disabled={op.busy} onPress={op.retry} /></> : null}
    {!op.ready && !op.error ? <T>{c.loading}</T> : null}
    {op.ready ? <>
      <Card>
        <LineRow label={c.revenue} value={revenue === null ? '—' : f.money(revenue)} strong />
        <T v="small" muted>{revenue === null ? c.noRevenue : invoice ? c.invoiceRevenue : c.estimateRevenue}</T>
        <Hair />
        <LineRow label={c.labor} value={f.money(result.laborCents)} />
        <LineRow label={c.materials} value={f.money(result.materialCents)} />
        <LineRow label={c.otherActual} value={f.money(budget?.actual_other_cents ?? 0)} />
        <LineRow label={result.complete ? c.total : c.partial} value={f.money(result.totalCents)} strong />
        <Hair />
        <LineRow label={c.contribution} value={result.profitCents === null ? '—' : f.money(result.profitCents)} strong />
        <LineRow label={c.margin} value={result.marginBps === null ? '—' : `${f.pct(result.marginBps)}%`} />
        <T v="small" muted>{c.projected}</T>
      </Card>
      {!result.complete ? <Notice text={`${c.missing} (${f.qty(result.uncostedHundredths)} h)`} tone="flag" /> : null}
      <T v="h2">{c.hours}</T>
      <T v="small" muted>{c.frozen}</T>
      {!entries.length ? <T muted>{c.noHours}</T> : null}
      {entries.map((entry) => {
        const cost = op.data.labor.find((l) => l.time_entry_id === entry.id);
        const worker = cost ? op.data.workers.find((w) => w.id === cost.worker_id) : null;
        return <Card key={entry.id}>
          <T v="label">{f.date(entry.date)} · {f.qty(entry.hundredths)} h</T>
          {entry.note ? <T>{entry.note}</T> : null}
          <T v="small" muted>{cost ? `${worker?.name ?? c.worker} · ${f.money(cost.loaded_rate_cents)}/h` : c.notAssigned}</T>
          {op.canEditCosts ? <Chip label={entryId === entry.id ? c.selected : c.attribute} selected={entryId === entry.id} onPress={() => { if (!op.busy) setEntryId(entry.id); }} /> : null}
          {op.canEditCosts && cost ? <Button label={c.unassign} variant="outline" disabled={op.busy} onPress={() => void op.run((bid) => api.removeLabor(entry.id, bid), (d) => ({ ...d, labor: d.labor.filter((l) => l.time_entry_id !== entry.id) }))} /> : null}
        </Card>;
      })}
      {op.canEditCosts && entryId ? <Card>
        <T v="label">{c.chooseWorker}</T>
        <Row style={{ flexWrap: 'wrap' }}>{op.data.workers.filter((w) => !w.archived).map((worker) => <Chip key={worker.id} label={worker.name} selected={workerId === worker.id} onPress={() => { if (!op.busy) setWorkerId(worker.id); }} />)}</Row>
        {!op.data.workers.some((w) => !w.archived) ? <Button label={c.addWorker} variant="outline" onPress={() => router.push('/operations')} /> : null}
        <Button label={op.busy ? c.saving : c.attribute} disabled={op.busy} onPress={() => void assign()} />
      </Card> : null}
      <Hair />
      <T v="h2">{c.budget}</T>
      <Card>
        {op.canEditCosts ? <>
          <Field label={c.budgetLabor} value={labor} onChangeText={setLabor} keyboardType="decimal-pad" editable={!op.busy} />
          <Field label={c.budgetMaterials} value={material} onChangeText={setMaterial} keyboardType="decimal-pad" editable={!op.busy} />
          <Field label={c.budgetOther} value={other} onChangeText={setOther} keyboardType="decimal-pad" editable={!op.busy} />
          <Field label={c.otherActual} value={actualOther} onChangeText={setActualOther} keyboardType="decimal-pad" editable={!op.busy} />
          <Button label={op.busy ? c.saving : c.save} disabled={op.busy} onPress={() => void saveBudget()} />
        </> : budget ? <>
          <LineRow label={c.budgetLabor} value={f.money(budget.labor_cents)} />
          <LineRow label={c.budgetMaterials} value={f.money(budget.material_cents)} />
          <LineRow label={c.budgetOther} value={f.money(budget.other_cents)} />
        </> : null}
        {budget ? <>
          <LineRow label={c.budgetTotal} value={f.money(budget.labor_cents + budget.material_cents + budget.other_cents)} />
          <LineRow label={c.variance} value={f.money(budget.labor_cents + budget.material_cents + budget.other_cents - result.totalCents)} />
        </> : <T v="small" muted>{c.noBudget}</T>}
      </Card>
      {inputError ? <Notice text={inputError} tone="danger" /> : null}
    </> : null}
  </Screen>;
}
export function ProfitabilityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecordGate found={() => hasJob(id)}><Profitability /></RecordGate>;
}
