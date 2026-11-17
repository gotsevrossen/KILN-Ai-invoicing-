import { useState } from 'react';

import { newUuid } from '@/data/db';
import { workLocked } from '@/data/selectors';
import * as sample from '@/data/sample';
import { applyPackage, packageFromEstimate, validPackage, type PackageLine, type ServicePackage } from '@/data/service-packages';
import { currentState, useStore } from '@/data/store';
import { usePackages } from '@/data/use-packages';
import { useLang, useTFor } from '@/i18n';
import { useFormat } from '@/lib/format';
import { lineTotal } from '@/lib/money';

import { parseDollars, parseQty } from './estimate-parts';
import { Sheet } from './sheet';
import { Button, ButtonRow, Card, Field, Notice, SwitchRow, T } from './ui';

interface EditableLine extends Omit<PackageLine, 'qtyHundredths' | 'unitCents'> { qty: string; price: string }

function PackageEditor({ initial, busy, onSave, onCancel }: { initial: ServicePackage; busy: boolean; onSave: (p: ServicePackage) => Promise<boolean>; onCancel: () => void }) {
  const { t } = useLang();
  const [name, setName] = useState(initial.name);
  const [notes, setNotes] = useState(initial.scope.notes ?? '');
  const [details, setDetails] = useState(initial.scope.details ?? '');
  const [exclusions, setExclusions] = useState(initial.scope.exclusions ?? '');
  const [minimum, setMinimum] = useState(String(initial.minimumCents / 100));
  const [afterHours, setAfterHours] = useState(String(initial.afterHoursCents / 100));
  const [lines, setLines] = useState<EditableLine[]>(initial.lines.map(({ qtyHundredths, unitCents, ...line }) => ({ ...line, qty: String(qtyHundredths / 100), price: unitCents === null ? '' : String(unitCents / 100) })));
  const [invalid, setInvalid] = useState(false);
  const patch = (index: number, value: Partial<EditableLine>) => setLines((old) => old.map((l, i) => i === index ? { ...l, ...value } : l));
  const save = async () => {
    const minimumCents = parseDollars(minimum || '0');
    const afterHoursCents = parseDollars(afterHours || '0');
    const parsed = lines.map(({ qty, price, ...line }) => ({ ...line, qtyHundredths: parseQty(qty) ?? 0, unitCents: price.trim() ? parseDollars(price) : null }));
    const preset = { ...initial, name: name.trim(), lines: parsed, scope: { notes, details, exclusions }, minimumCents, afterHoursCents };
    if (minimumCents === null || afterHoursCents === null || lines.some((l) => l.price.trim() && parseDollars(l.price) === null) || !validPackage(preset)) { setInvalid(true); return; }
    setInvalid(false);
    if (await onSave(preset)) onCancel();
  };
  return <>
    <Field label={t('packages.name')} value={name} onChangeText={setName} maxLength={120} />
    {lines.map((line, index) => <Card key={index} style={{ gap: 8 }}>
      <Field label={t('packages.description')} value={line.description} onChangeText={(description) => patch(index, { description })} maxLength={300} />
      <T v="small" muted>{t(`estimate.units.${line.unit}`)}</T>
      <Field label={t('packages.quantity')} value={line.qty} onChangeText={(qty) => patch(index, { qty })} keyboardType="decimal-pad" />
      <Field label={t('packages.price')} value={line.price} onChangeText={(price) => patch(index, { price })} keyboardType="decimal-pad" />
      <T v="small" muted>{t(`review.${line.kind ?? 'labor'}`)}</T>
      <Button label={t('packages.removeLine')} variant="outline" disabled={busy} onPress={() => setLines((old) => old.filter((_, i) => i !== index))} />
    </Card>)}
    <T v="small" muted>{t('packages.unpriced')}</T>
    <Button label={t('packages.addLine')} variant="outline" disabled={busy || lines.length >= 100} onPress={() => setLines((old) => [...old, { description: '', unit: 'flat', kind: 'labor', qty: '1', price: '' }])} />
    <Field label={t('packages.scope')} value={notes} onChangeText={setNotes} multiline maxLength={2000} />
    <Field label={t('packages.details')} value={details} onChangeText={setDetails} multiline maxLength={2000} />
    <Field label={t('packages.exclusions')} value={exclusions} onChangeText={setExclusions} multiline maxLength={2000} />
    <T v="small" muted>{t('packages.feesHelp')}</T>
    <Field label={t('packages.minimum')} value={minimum} onChangeText={setMinimum} keyboardType="decimal-pad" />
    <Field label={t('packages.afterHoursFee')} value={afterHours} onChangeText={setAfterHours} keyboardType="decimal-pad" />
    {invalid ? <Notice text={t('packages.invalid')} tone="flag" /> : null}
    <Button label={t('packages.save')} disabled={busy} onPress={() => void save()} />
    <Button label={t('packages.cancel')} variant="outline" disabled={busy} onPress={onCancel} />
  </>;
}

/** Settings and the estimate builder share package management; adding always requires preview and confirmation. */
export function ServicePackages({ jobId, target = 'estimate' }: { jobId?: string; target?: 'estimate' | 'work' }) {
  const { t } = useLang();
  const f = useFormat();
  const { state, actions } = useStore();
  const packages = usePackages();
  const [editing, setEditing] = useState<ServicePackage | null>(null);
  const [removing, setRemoving] = useState<ServicePackage | null>(null);
  const [selected, setSelected] = useState<ServicePackage | null>(null);
  const [afterHours, setAfterHours] = useState(false);
  const [replaceScope, setReplaceScope] = useState(false);
  const [added, setAdded] = useState(false);
  const [minimumWarning, setMinimumWarning] = useState(false);
  const draft = jobId ? state.estimates[jobId] : undefined;
  const job = jobId ? sample.jobs.find((j) => j.id === jobId) : undefined;
  const customer = job ? sample.customers.find((c) => c.id === job.customerId) : undefined;
  const tc = useTFor(customer?.lang ?? 'en');
  const account = state.mode === 'connected' ? state.businessId : 'example';
  const [editorAccount, setEditorAccount] = useState(account);
  const sameAccount = editorAccount === account;
  const existing = target === 'work' ? state.workItems.filter((w) => w.jobId === jobId) : draft?.lines ?? [];
  const preview = selected ? applyPackage(selected, existing, afterHours, { afterHours: tc('packages.afterHoursFee'), minimum: tc('packages.minimumLine') }) : null;
  const canApply = !!jobId && (target === 'work' ? !workLocked(state, jobId) && !draft?.signed : !draft?.sent && !draft?.signed);
  const edit = (preset: ServicePackage) => { setEditorAccount(account); setEditing(preset); };
  return <Card style={{ gap: 12 }}>
    <T v="h3">{t('packages.title')}</T>
    <T muted>{t(target === 'work' ? 'packages.workHelp' : 'packages.help')}</T>
    <Button label={t('packages.create')} variant="outline" disabled={packages.busy} onPress={() => edit({ id: newUuid(), name: '', lines: [{ description: '', unit: 'flat', qtyHundredths: 100, unitCents: null, kind: 'labor' }], scope: {}, minimumCents: 0, afterHoursCents: 0 })} />
    {state.mode === 'example' ? <T v="small" muted>{t('packages.example')}</T> : null}
    {packages.busy ? <T muted>{t('packages.loading')}</T> : null}
    {packages.error ? <><Notice text={t('packages.failed')} tone="danger" /><Button label={t('packages.retry')} variant="outline" onPress={() => void packages.reload()} /></> : null}
    {!packages.busy && !packages.items.length ? <T muted>{t('packages.empty')}</T> : null}
    {packages.items.map((preset) => <Card key={preset.id} style={{ gap: 8 }}>
      <T v="label">{preset.name}</T>
      <ButtonRow>
        {canApply ? <Button label={t('packages.apply')} variant="outline" onPress={() => { setEditorAccount(account); setSelected(preset); setAfterHours(false); setReplaceScope(false); }} /> : null}
        <Button label={t('packages.edit')} variant="soft" disabled={packages.busy} onPress={() => edit(preset)} />
      </ButtonRow>
      <Button label={t('packages.remove')} variant="outline" disabled={packages.busy} onPress={() => { setEditorAccount(account); setRemoving(preset); }} />
    </Card>)}
    {target === 'estimate' && canApply && draft?.lines.some((l) => !l.excluded) ? <Button label={t('packages.saveCurrent')} variant="outline" disabled={packages.busy} onPress={() => edit(packageFromEstimate(newUuid(), '', draft.lines, draft.scope))} /> : null}
    {added ? <Notice text={t('packages.added')} tone="accent" /> : null}
    {minimumWarning ? <Notice text={t('packages.minimumUnknown')} tone="flag" /> : null}
    <Sheet open={!!editing && sameAccount} onClose={() => setEditing(null)} title={t('packages.edit')}>
      {packages.error ? <Notice text={t('packages.failed')} tone="danger" /> : null}
      {editing && sameAccount ? <PackageEditor key={editing.id} initial={editing} busy={packages.busy} onSave={packages.save} onCancel={() => setEditing(null)} /> : null}
    </Sheet>
    <Sheet open={!!removing && sameAccount} onClose={() => setRemoving(null)} title={t('packages.remove')}>
      <T>{t('packages.confirmRemove')}</T>
      {packages.error ? <Notice text={t('packages.failed')} tone="danger" /> : null}
      <Button label={t('packages.confirmDelete')} variant="danger" disabled={packages.busy} onPress={() => { if (removing) void packages.remove(removing).then((ok) => { if (ok) setRemoving(null); }); }} />
      <Button label={t('packages.cancel')} variant="outline" onPress={() => setRemoving(null)} />
    </Sheet>
    <Sheet open={!!selected && sameAccount} onClose={() => setSelected(null)} title={selected?.name ?? t('packages.title')}>
      {selected && preview ? <>
        <SwitchRow label={t('packages.afterHours')} value={afterHours} onChange={setAfterHours} />
        {target === 'estimate' ? <SwitchRow label={t('packages.replaceScope')} help={t('packages.scopeHelp')} value={replaceScope} onChange={setReplaceScope} /> : null}
        <T muted>{[selected.scope.notes, selected.scope.details, selected.scope.exclusions].filter(Boolean).join('\n') || t('packages.noScope')}</T>
        {preview.lines.map((line, i) => <T key={i}>{line.description} · {f.qty(line.qtyHundredths)} × {line.unitCents === null ? t('estimate.needsPrice') : f.money(line.unitCents)}{line.unitCents === null ? '' : ` = ${f.money(lineTotal(line.qtyHundredths, line.unitCents))}`}</T>)}
        <T v="small" muted>{t('packages.minimumReview')}</T>
        {preview.unresolvedMinimum ? <Notice text={t('packages.minimumUnknown')} tone="flag" /> : null}
        <Button label={t('packages.add')} disabled={!canApply || packages.busy || (target === 'work' && preview.lines.some((line) => line.unitCents === null))} onPress={() => {
          const now = currentState();
          if (!jobId || !sameAccount || (now.mode === 'connected' ? now.businessId : 'example') !== account || (target === 'work' ? workLocked(now, jobId) || now.estimates[jobId]?.signed : now.estimates[jobId]?.sent || now.estimates[jobId]?.signed)) return;
          const result = applyPackage(selected, target === 'work' ? now.workItems.filter((w) => w.jobId === jobId) : now.estimates[jobId]?.lines ?? [], afterHours, { afterHours: tc('packages.afterHoursFee'), minimum: tc('packages.minimumLine') });
          if (target === 'work') {
            if (result.lines.some((line) => line.unitCents === null) || !actions.addWorkItems(jobId, result.lines.map((line) => ({ ...line, unitCents: line.unitCents!, kind: line.kind ?? 'labor' })))) return;
          } else actions.addLines(jobId, result.lines);
          if (target === 'estimate' && replaceScope) actions.updateEstimate(jobId, { scope: { ...now.estimates[jobId]?.scope, notes: selected.scope.notes ?? '', details: selected.scope.details ?? '', exclusions: selected.scope.exclusions ?? '' } });
          setSelected(null); setAdded(true); setMinimumWarning(result.unresolvedMinimum);
        }} />
      </> : null}
    </Sheet>
  </Card>;
}
