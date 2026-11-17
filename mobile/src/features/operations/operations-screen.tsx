import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Chip, Field, Hair, LineRow, Notice, PageHeader, Row, Screen, T } from '@/components/ui';
import { newUuid } from '@/data/db';
import * as sample from '@/data/sample';
import { useStore } from '@/data/store';
import { useLang, localeFor } from '@/i18n';
import { useFormat } from '@/lib/format';
import * as api from './api';
import { centsInput, visitOverlaps, visitTimeInput, type Worker, type Visit } from './model';
import { useOperations } from './use-operations';
import { teamText } from '@/features/team/text';

export function OperationsScreen() {
  const op = useOperations();
  const c = op.copy;
  const f = useFormat();
  const { lang } = useLang();
  const { state } = useStore();
  const [workerOpen, setWorkerOpen] = useState(false);
  const [editWorker, setEditWorker] = useState<Worker | null>(null);
  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const [visitOpen, setVisitOpen] = useState(false);
  const [editVisitId, setEditVisitId] = useState<string | undefined>(undefined);
  const [jobId, setJobId] = useState('');
  const [workerId, setWorkerId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [note, setNote] = useState('');
  const [query, setQuery] = useState('');
  const [inputError, setInputError] = useState('');
  // Reading version subscribes the job picker to newly created jobs.
  void state.version;
  const workers = op.data.workers.filter((w) => !w.archived);
  const workerName = (id: string) => op.data.workers.find((w) => w.id === id)?.name ?? c.worker;
  const jobName = (id: string) => sample.jobs.find((j) => j.id === id)?.title ?? c.job;
  const dateTime = (iso: string) => new Date(iso).toLocaleString(localeFor(lang), { dateStyle: 'medium', timeStyle: 'short' });
  const q = query.trim().toLocaleLowerCase();
  const visits = op.data.visits.filter((v) => !q || `${workerName(v.worker_id)} ${jobName(v.job_id)} ${v.note}`.toLocaleLowerCase().includes(q));
  const saveWorker = async () => {
    const value = centsInput(rate);
    if (!name.trim() || value === null) { setInputError(c.workerName); return; }
    const worker: Worker = { id: editWorker?.id ?? newUuid(), business_id: op.businessId, name: name.trim(), loaded_rate_cents: value, archived: editWorker?.archived ?? false };
    if (await op.run(() => api.saveWorker(worker), (d) => ({ ...d, workers: [...d.workers.filter((w) => w.id !== worker.id), worker] }))) {
      setWorkerOpen(false); setEditWorker(null); setName(''); setRate(''); setInputError('');
    }
  };
  const saveVisit = async () => {
    const begins = visitTimeInput(start), ends = visitTimeInput(end);
    if (!sample.jobs.some((j) => j.id === jobId) || !workers.some((w) => w.id === workerId) || !begins || !ends || Date.parse(ends) <= Date.parse(begins) || Date.parse(ends) - Date.parse(begins) > 7 * 86400000) { setInputError(c.badVisit); return; }
    if (visitOverlaps(op.data.visits, workerId, begins, ends, editVisitId)) { setInputError(c.overlap); return; }
    const visit: Visit = { id: editVisitId ?? newUuid(), business_id: op.businessId, job_id: jobId, worker_id: workerId, starts_at: begins, ends_at: ends, note: note.trim() };
    if (await op.run(() => api.saveVisit(visit), (d) => ({ ...d, visits: [...d.visits.filter((v) => v.id !== visit.id), visit].sort((a, b) => a.starts_at.localeCompare(b.starts_at)) }))) {
      setVisitOpen(false); setEditVisitId(undefined); setStart(''); setEnd(''); setNote(''); setInputError('');
    }
  };
  return <Screen header={<PageHeader title={c.title} back={() => router.back()} />}>
    <Notice text={c.ownerHelp} icon="lock" tone="soft" />
    {op.connected && op.ready ? <Button label={teamText(lang).admin} icon="users" variant="outline" onPress={() => router.push('/team-admin')} /> : null}
    {!op.connected ? <Notice text={c.preview} tone="soft" /> : null}
    {op.error ? <><Notice text={op.error} tone="danger" /><Button label={c.retry} variant="outline" disabled={op.busy} onPress={op.retry} /></> : null}
    {!op.ready && !op.error ? <T>{c.loading}</T> : null}
    {op.ready ? <>
      <T v="h2">{c.workers}</T>
      {!op.data.workers.length ? <T muted>{c.noWorkers}</T> : null}
      {op.data.workers.map((worker) => <Card key={worker.id}>
        <LineRow label={worker.name} value={f.money(worker.loaded_rate_cents)} />
        <T v="small" muted>{c.rate}</T>
        <Row style={{ flexWrap: 'wrap' }}>
          <Button label={c.edit} variant="outline" disabled={op.busy} onPress={() => { setEditWorker(worker); setName(worker.name); setRate((worker.loaded_rate_cents / 100).toFixed(2)); setWorkerOpen(true); setInputError(''); }} />
          <Button label={worker.archived ? c.restore : c.archive} variant="outline" disabled={op.busy} onPress={() => {
            const next = { ...worker, archived: !worker.archived };
            void op.run(() => api.saveWorker(next), (d) => ({ ...d, workers: d.workers.map((w) => w.id === worker.id ? next : w) }));
          }} />
        </Row>
      </Card>)}
      {!workerOpen ? <Button label={c.addWorker} icon="plus" variant="outline" disabled={op.busy} onPress={() => { setEditWorker(null); setName(''); setRate(''); setInputError(''); setWorkerOpen(true); }} /> : <Card>
        <Field label={c.name} value={name} onChangeText={setName} maxLength={120} editable={!op.busy} />
        <Field label={c.rate} value={rate} onChangeText={setRate} keyboardType="decimal-pad" editable={!op.busy} />
        <T v="small" muted>{c.rateHelp}</T>
        <Button label={op.busy ? c.saving : c.save} disabled={op.busy} onPress={() => void saveWorker()} />
        <Button label={c.cancel} variant="outline" disabled={op.busy} onPress={() => { setWorkerOpen(false); setInputError(''); }} />
      </Card>}
      <Hair />
      <T v="h2">{c.visits}</T>
      <Field value={query} onChangeText={setQuery} placeholder={c.filter} accessibilityLabel={c.filter} />
      {!sample.jobs.length ? <T muted>{c.noJobs}</T> : null}
      {!visitOpen ? <Button label={c.addVisit} icon="plus" disabled={op.busy || !workers.length || !sample.jobs.length} onPress={() => { setEditVisitId(undefined); setStart(''); setEnd(''); setNote(''); setVisitOpen(true); setInputError(''); }} /> : <Card>
        <T v="label">{c.chooseJob}</T>
        <View style={{ gap: 8 }}>{sample.jobs.map((job) => <Chip key={job.id} label={`${job.title} · ${job.address}`} selected={jobId === job.id} onPress={() => { if (!op.busy) setJobId(job.id); }} />)}</View>
        <T v="label">{c.chooseWorker}</T>
        <Row style={{ flexWrap: 'wrap' }}>{workers.map((worker) => <Chip key={worker.id} label={worker.name} selected={workerId === worker.id} onPress={() => { if (!op.busy) setWorkerId(worker.id); }} />)}</Row>
        <T v="small" muted>{c.localTime}</T>
        <Field label={c.start} value={start} onChangeText={setStart} autoCapitalize="none" placeholder="2026-11-20T09:00" editable={!op.busy} />
        <Field label={c.end} value={end} onChangeText={setEnd} autoCapitalize="none" placeholder="2026-11-20T10:00" editable={!op.busy} />
        <Field label={c.note} value={note} onChangeText={setNote} multiline maxLength={1000} editable={!op.busy} />
        <Button label={op.busy ? c.saving : c.save} disabled={op.busy} onPress={() => void saveVisit()} />
        <Button label={c.cancel} variant="outline" disabled={op.busy} onPress={() => { setVisitOpen(false); setInputError(''); }} />
      </Card>}
      {inputError ? <Notice text={inputError} tone="danger" /> : null}
      {!visits.length ? <T muted>{q ? c.noMatches : c.noVisits}</T> : null}
      {visits.map((visit) => <Card key={visit.id}>
        <T v="h3">{jobName(visit.job_id)}</T>
        <T>{workerName(visit.worker_id)}</T>
        <T v="small" muted>{dateTime(visit.starts_at)} – {dateTime(visit.ends_at)}</T>
        {visit.note ? <T>{visit.note}</T> : null}
        <Row style={{ flexWrap: 'wrap' }}>
          <Button label={c.edit} variant="outline" disabled={op.busy} onPress={() => {
            const localValue = (iso: string) => { const d = new Date(iso); const pad = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
            setEditVisitId(visit.id); setJobId(visit.job_id); setWorkerId(visit.worker_id); setStart(localValue(visit.starts_at)); setEnd(localValue(visit.ends_at)); setNote(visit.note); setVisitOpen(true); setInputError('');
          }} />
          <Button label={c.viewJob} variant="outline" onPress={() => router.push(`/job/${visit.job_id}`)} />
          <Button label={c.remove} variant="outline" disabled={op.busy} onPress={() => void op.run((bid) => api.removeVisit(visit.id, bid), (d) => ({ ...d, visits: d.visits.filter((v) => v.id !== visit.id) }))} />
        </Row>
      </Card>)}
    </> : null}
  </Screen>;
}
