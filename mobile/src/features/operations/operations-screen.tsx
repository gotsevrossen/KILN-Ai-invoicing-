import { router } from 'expo-router';
import { useState } from 'react';
import { Button, Card, Field, LineRow, Notice, PageHeader, Row, Screen, T } from '@/components/ui';
import { newUuid } from '@/data/db';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';
import * as api from './api';
import { centsInput, type Worker } from './model';
import { useOperations } from './use-operations';
import { teamText } from '@/features/team/text';

export function OperationsScreen() {
  const op = useOperations();
  const c = op.copy;
  const f = useFormat();
  const { lang } = useLang();
  const [workerOpen, setWorkerOpen] = useState(false);
  const [editWorker, setEditWorker] = useState<Worker | null>(null);
  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const [inputError, setInputError] = useState('');
  const saveWorker = async () => {
    const value = centsInput(rate);
    if (!name.trim() || value === null) { setInputError(c.workerName); return; }
    const worker: Worker = { id: editWorker?.id ?? newUuid(), business_id: op.businessId, name: name.trim(), loaded_rate_cents: value, archived: editWorker?.archived ?? false };
    if (await op.run(() => api.saveWorker(worker), (d) => ({ ...d, workers: [...d.workers.filter((w) => w.id !== worker.id), worker] }))) {
      setWorkerOpen(false); setEditWorker(null); setName(''); setRate(''); setInputError('');
    }
  };
  return <Screen header={<PageHeader title={c.title} back={() => router.back()} />}>
    {op.canEditCosts ? <Notice text={c.ownerHelp} icon="lock" tone="soft" /> : null}
    {op.connected && op.ready ? <Button label={teamText(lang).teamTitle} icon="users" variant="outline" onPress={() => router.push('/team')} /> : null}
    {!op.connected ? <Notice text={c.preview} tone="soft" /> : null}
    {op.error ? <><Notice text={op.error} tone="danger" /><Button label={c.retry} variant="outline" disabled={op.busy} onPress={op.retry} /></> : null}
    {!op.ready && !op.error ? <T>{c.loading}</T> : null}
    {op.ready ? <>
      <T v="h2">{c.workers}</T>
      {!op.data.workers.length ? <T muted>{c.noWorkers}</T> : null}
      {op.data.workers.map((worker) => <Card key={worker.id}>
        <LineRow label={worker.name} value={f.money(worker.loaded_rate_cents)} />
        <T v="small" muted>{c.rate}</T>
        {op.canEditCosts ? <Row style={{ flexWrap: 'wrap' }}>
          <Button label={c.edit} variant="outline" disabled={op.busy} onPress={() => { setEditWorker(worker); setName(worker.name); setRate((worker.loaded_rate_cents / 100).toFixed(2)); setWorkerOpen(true); setInputError(''); }} />
          <Button label={worker.archived ? c.restore : c.archive} variant="outline" disabled={op.busy} onPress={() => {
            const next = { ...worker, archived: !worker.archived };
            void op.run(() => api.saveWorker(next), (d) => ({ ...d, workers: d.workers.map((w) => w.id === worker.id ? next : w) }));
          }} />
        </Row> : null}
      </Card>)}
      {op.canEditCosts ? !workerOpen ? <Button label={c.addWorker} icon="plus" variant="outline" disabled={op.busy} onPress={() => { setEditWorker(null); setName(''); setRate(''); setInputError(''); setWorkerOpen(true); }} /> : <Card>
        <Field label={c.name} value={name} onChangeText={setName} maxLength={120} editable={!op.busy} />
        <Field label={c.rate} value={rate} onChangeText={setRate} keyboardType="decimal-pad" editable={!op.busy} />
        <T v="small" muted>{c.rateHelp}</T>
        <Button label={op.busy ? c.saving : c.save} disabled={op.busy} onPress={() => void saveWorker()} />
        <Button label={c.cancel} variant="outline" disabled={op.busy} onPress={() => { setWorkerOpen(false); setInputError(''); }} />
      </Card> : null}
      {inputError ? <Notice text={inputError} tone="danger" /> : null}
    </> : null}
  </Screen>;
}
