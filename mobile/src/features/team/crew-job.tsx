import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { Button, Card, Chip, Field, Hair, IconButton, ListRow, Notice, PageHeader, Row, Screen, Segmented, T } from '@/components/ui';
import { useAuth } from '@/data/auth';
import { newUuid } from '@/data/db';
import * as api from '@/data/team-access';
import { onLiveRefresh } from '@/data/live-events';
import { priceOnly } from '@/data/trades';
import type { Unit } from '@/data/types';
import { useLang } from '@/i18n';
import { assistantCopy } from '@/i18n/assistant';
import { FlameIcon } from '@/components/flame-icon';
import { callNumber, dialable, textNumber } from '@/lib/contact';
import { useFormat } from '@/lib/format';
import { pickJobPhotos, type NewPhoto } from '@/lib/job-photos';
import { removeFromPhone } from '@/lib/photo-file';
import { userError } from '@/lib/user-errors';
import { radius } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

import { cachedAssignment, crewRead } from './crew-cache';
import { CrewSyncStatus, useCrewOutbox } from './crew-outbox';
import { fill, teamText } from './text';

// no 'hour': hours go through the Hours button and are billed at the job's rate
const UNITS: Unit[] = ['flat', 'each', 'sq_ft', 'linear_ft', 'board', 'cu_yd'];
type SheetName = 'work' | 'hours' | 'note' | 'photo' | 'change' | null;

const parseHundredths = (text: string) => (/^\d{1,6}([.,]\d{1,2})?$/.test(text.trim()) ? Math.round(Number(text.trim().replace(',', '.')) * 100) : null);

function PhotoThumb({ path }: { path: string }) {
  const p = usePalette();
  const { t } = useLang();
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void api.photoLink(path).then((url) => { if (live) setUri(url); }, () => undefined);
    return () => { live = false; };
  }, [path]);
  return (
    <View style={{ width: 92, height: 92, borderRadius: radius.xs, overflow: 'hidden', backgroundColor: p.placeholder }}>
      {uri ? <Image source={{ uri, cacheKey: path }} style={{ flex: 1 }} accessibilityLabel={t('photos.photo')} accessibilityIgnoresInvertColors /> : null}
    </View>
  );
}

/** A crew member's view of one assigned job: what to do, what's agreed, and adding their work. */
export function CrewJobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = usePalette();
  const { lang, t } = useLang();
  const c = teamText(lang);
  const f = useFormat();
  const auth = useAuth();
  const outbox = useCrewOutbox();
  const me = auth.session?.user.id;
  const memberScope = `${me}:${auth.businessId}`;
  const cacheScope = `${memberScope}:${auth.crewSeesPrices}`;
  const [data, setData] = useState<api.CrewJobDetail | null>(null);
  const [loadError, setLoadError] = useState('');
  const loadRequest = useRef(0);
  const [open, setOpen] = useState<SheetName>(null);
  // each opening starts the sheet fresh (a new key remounts it)
  const [opened, setOpened] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  // stable ids, so retrying after a dropped connection never saves twice
  const pendingId = useRef('');

  const reload = useCallback(() => {
    const request = ++loadRequest.current;
    crewRead(cacheScope, `job:${id}`, () => api.loadCrewJob(id), () => cachedAssignment(memberScope, id)).then((d) => { if (request === loadRequest.current) { setData(d); setLoadError(''); } },
      (e: unknown) => { if (request === loadRequest.current) { setData(null); setLoadError(userError(t, e)); } });
  }, [cacheScope, memberScope, id, t]);
  useFocusEffect(useCallback(() => {
    reload();
    const unsubscribe = onLiveRefresh(reload);
    return () => { loadRequest.current++; unsubscribe(); };
  }, [reload]));

  /** Saves one thing; closes the sheet and reloads the job when it worked. */
  const run = async (work: (rowId: string) => Promise<unknown>, done: string): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true; setBusy(true); setError(''); setStatus('');
    if (!pendingId.current) pendingId.current = newUuid();
    try {
      await work(pendingId.current);
      pendingId.current = '';
      setStatus(done); setOpen(null); reload();
      return true;
    } catch (e) {
      setError((e as { code?: string }).code === 'camera_denied' ? c.cameraDenied : userError(t, e));
      return false;
    } finally { inFlight.current = false; setBusy(false); }
  };
  const openSheet = (name: SheetName) => { pendingId.current = ''; setError(''); setStatus(''); setOpened((n) => n + 1); setOpen(name); };

  const header = <PageHeader title={data?.job.title ?? c.jobs} sub={data?.job.address} back={() => router.back()}
    right={data ? <>
      <IconButton icon="zap" tone="accent" glyph={(color) => <FlameIcon color={color} />} label={assistantCopy[lang].open} onPress={() => router.push(`/crew/assistant?job=${data.job.id}`)} />
      {dialable(data.job.customer_phone) ? <>
        <IconButton icon="phone" label={c.call} onPress={() => callNumber(data.job.customer_phone)} />
        <IconButton icon="message-square" label={c.text} onPress={() => textNumber(data.job.customer_phone)} />
      </> : null}
    </> : undefined} />;
  if (!data) return <Screen header={header}><CrewSyncStatus />
    {loadError ? <><Notice text={loadError} tone="danger" icon="alert-circle" /><Button label={c.retry} variant="outline" onPress={reload} /></> : <T muted>{c.loading}</T>}
  </Screen>;

  const job = data.job;
  const who = (userId: string | null) => (userId === me ? c.you : data.people.find((x) => x.user_id === userId)?.name || c.someone);
  const money = (cents: number | null) => (cents === null ? '' : ` · ${f.money(cents)}`);
  const unitLabel = (u?: Unit) => (!u || u === 'flat' ? '' : ` ${t(`estimate.units.${u}` as 'estimate.units.each')}`);
  const mine = (createdBy: string | null) => job.is_open && createdBy === me;
  const scope = data.estimate?.scope ?? {};

  return (
    <Screen header={header}><CrewSyncStatus />
      {status ? <Notice text={status} tone="accent" /> : null}
      {error && !open ? <Notice text={error} tone="danger" icon="alert-circle" /> : null}

      <Card style={{ gap: 6 }}>
        <T v="h3">{job.customer_name}</T>
        <T muted>{job.address}</T>
        {job.private_note ? <><Hair /><T v="small" muted>{c.officeNote}</T><T>{job.private_note}</T></> : null}
      </Card>

      {job.is_open ? <>
        <Row style={{ flexWrap: 'wrap' }}>
          <Button label={c.addWork} icon="tool" variant="soft" stacked style={{ backgroundColor: p.card }} onPress={() => openSheet('work')} />
          <Button label={c.addHours} icon="clock" variant="soft" stacked style={{ backgroundColor: p.card }} onPress={() => openSheet('hours')} />
        </Row>
        <Row style={{ flexWrap: 'wrap' }}>
          <Button label={c.photos} icon="camera" variant="soft" stacked style={{ backgroundColor: p.card }} onPress={() => openSheet('photo')} />
          <Button label={c.addNote} icon="file-text" variant="soft" stacked style={{ backgroundColor: p.card }} onPress={() => openSheet('note')} />
        </Row>
        <Button label={t('capture.receipt')} icon="file-text" variant="outline"
          onPress={() => router.push({ pathname: '/crew/receipt', params: { job: job.id, title: job.title } })} />
        <Button label={c.suggest} icon="edit-3" variant="outline" onPress={() => openSheet('change')} />
      </> : <Notice text={c.closed} tone="soft" icon="lock" />}

      {data.estimate ? <Card style={{ gap: 8 }}>
        <T v="eyebrow">{fill(c.estimate, { number: data.estimate.number })}</T>
        <T v="small" muted>{data.estimate.signed ? c.signed : data.estimate.sent ? c.notSigned : c.notSent}</T>
        {scope.notes ? <><T v="label">{c.agreed}</T><T>{scope.notes}</T></> : null}
        {scope.details ? <><T v="label">{c.details}</T><T>{scope.details}</T></> : null}
        {scope.exclusions ? <><T v="label">{c.exclusions}</T><T>{scope.exclusions}</T></> : null}
        <Hair />
        {data.estimate.lines.map((l, i) => <T key={i} muted={l.excluded}>
          {l.excluded ? `${c.excluded}: ` : ''}{f.qty(l.qty_hundredths)}{unitLabel(l.unit)} × {l.description}{money(l.unit_cents)}
        </T>)}
        {!job.prices ? <T v="small" muted>{c.pricesHidden}</T> : null}
      </Card> : null}

      {data.invoice ? <Card style={{ gap: 8 }}>
        <T v="eyebrow">{fill(c.invoice, { number: data.invoice.number })}</T>
        <T v="small" muted>{data.invoice.paid ? c.paid : data.invoice.sent ? c.unpaid : c.notSent}</T>
        {data.invoice.lines.map((l, i) => <T key={i}>{f.qty(l.qty_hundredths)} × {l.description}{money(l.unit_cents)}</T>)}
        {!job.prices ? <T v="small" muted>{c.pricesHidden}</T> : null}
      </Card> : null}

      {data.photos.length ? <Card style={{ gap: 10 }}>
        <T v="eyebrow">{c.photos}</T>
        <Row style={{ flexWrap: 'wrap' }}>{data.photos.map((ph) => <PhotoThumb key={ph.id} path={ph.storage_path} />)}</Row>
      </Card> : null}

      {data.receipts?.length ? <Card style={{ gap: 10 }}>
        <T v="eyebrow">{t('job.receipts')}</T>
        {data.receipts.map((receipt) => <View key={receipt.id} style={{ gap: 4 }}>
          <T v="label">{t('job.receiptLine', { store: receipt.store, count: receipt.items })}</T>
          <T v="small" muted>{who(receipt.created_by)}{receipt.purchased_on ? ` · ${f.date(receipt.purchased_on)}` : ''}</T>
        </View>)}
      </Card> : null}

      <Entries title={c.workTitle} rows={data.work.map((w) => ({
        id: w.id, title: `${w.qty_hundredths !== 100 ? `${f.qty(w.qty_hundredths)}${unitLabel(w.unit)} × ` : ''}${w.description}${money(w.unit_cents)}`,
        sub: who(w.created_by), removable: mine(w.created_by), kind: 'work' as const }))} onRemove={(kind, rowId) => void run(() => api.crewRemoveMine(kind, rowId), c.saved)} busy={busy} />
      <Entries title={c.hoursTitle} rows={data.hours.map((h) => ({
        id: h.id, title: `${fill(c.hours, { hours: f.qty(h.hundredths) })}${h.note ? ` · ${h.note}` : ''}`,
        sub: `${who(h.created_by)} · ${f.date(h.worked_on)}`, removable: mine(h.created_by), kind: 'hours' as const }))} onRemove={(kind, rowId) => void run(() => api.crewRemoveMine(kind, rowId), c.saved)} busy={busy} />
      <Entries title={c.notes} rows={data.notes.map((n) => ({
        id: n.id, title: n.body, sub: `${who(n.created_by)} · ${f.date(n.created_at.slice(0, 10))}`, removable: mine(n.created_by), kind: 'note' as const }))}
        onRemove={(kind, rowId) => void run(() => api.crewRemoveMine(kind, rowId), c.saved)} busy={busy} />
      <Entries title={c.changes} rows={data.changes.map((r) => ({
        id: r.id, title: r.description, sub: who(r.created_by), removable: mine(r.created_by) && r.status === 'open', kind: 'change' as const }))}
        onRemove={(kind, rowId) => void run(() => api.crewRemoveMine(kind, rowId), c.saved)} busy={busy} />

      <WorkSheet cacheScope={cacheScope} key={`work-${opened}`} open={open === 'work'} onClose={() => setOpen(null)} prices={job.prices} busy={busy} error={error}
        onAdd={(item, qty) => run((id) => outbox.save([{ kind: 'work', id, job: job.id, item: item.id, quantity: qty }]), c.savedOnDevice)}
        onNewItem={(name, unit, cents) => run((rowId) => api.crewAddPriceItem(rowId, name, unit, cents), c.itemAdded)} />
      <HoursSheet key={`hours-${opened}`} open={open === 'hours'} onClose={() => setOpen(null)} busy={busy} error={error}
        onSave={(hundredths, note) => run((id) => outbox.save([{ kind: 'hours', id, job: job.id, hours: hundredths, note }]), c.savedOnDevice)} />
      <TextSheet key={`note-${opened}`} open={open === 'note'} onClose={() => setOpen(null)} title={c.addNote} label={c.noteField} busy={busy} error={error}
        onSave={(body) => run((id) => outbox.save([{ kind: 'note', id, job: job.id, text: body }]), c.savedOnDevice)} />
      <TextSheet key={`change-${opened}`} open={open === 'change'} onClose={() => setOpen(null)} title={c.suggest} help={c.suggestHelp} label={c.suggestion} busy={busy} error={error}
        onSave={(body) => run((id) => outbox.save([{ kind: 'change', id, job: job.id, text: body }]), c.savedOnDevice)} />
      <PhotoSheet open={open === 'photo'} onClose={() => setOpen(null)} jobId={job.id} onSaved={() => { setStatus(c.savedOnDevice); setOpen(null); reload(); }} />
    </Screen>
  );
}

function Entries({ title, rows, onRemove, busy }: {
  title: string; busy: boolean;
  rows: { id: string; title: string; sub: string; removable: boolean; kind: 'work' | 'hours' | 'note' | 'change' }[];
  onRemove: (kind: 'work' | 'hours' | 'note' | 'change', id: string) => void;
}) {
  const { lang } = useLang();
  const c = teamText(lang);
  if (!rows.length) return null;
  return <>
    <T v="eyebrow">{title}</T>
    <Card style={{ paddingVertical: 4 }}>
      {rows.map((r, i) => <View key={r.id}>
        {i ? <Hair /> : null}
        <ListRow title={r.title} sub={r.sub} right={r.removable ? <Button label={c.remove} variant="ghost" disabled={busy} onPress={() => onRemove(r.kind, r.id)} /> : undefined} />
      </View>)}
    </Card>
  </>;
}

function WorkSheet({ open, onClose, prices, busy, error, onAdd, onNewItem, cacheScope }: {
  open: boolean; onClose: () => void; prices: boolean; busy: boolean; error: string; cacheScope: string;
  onAdd: (item: api.CrewPriceItem, qtyHundredths: number) => Promise<boolean>;
  onNewItem: (name: string, unit: Unit, cents: number | null) => Promise<boolean>;
}) {
  const p = usePalette();
  const { lang, t } = useLang();
  const c = teamText(lang);
  const f = useFormat();
  const [items, setItems] = useState<api.CrewPriceItem[] | null>(null);
  const [listError, setListError] = useState('');
  const [picked, setPicked] = useState<api.CrewPriceItem | null>(null);
  const [qty, setQty] = useState('1');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<Unit>('each');
  const [price, setPrice] = useState('');
  const [bad, setBad] = useState('');
  useEffect(() => {
    if (!open) return;
    let live = true;
    crewRead(cacheScope, 'price-list', api.loadCrewPriceList).then((list) => { if (live) { setItems(list); setListError(''); } }, (e: unknown) => { if (live) setListError(userError(t, e)); });
    return () => { live = false; };
  }, [cacheScope, open, t]);
  const unitName = (u: Unit) => (u === 'flat' ? t('estimate.unitFlat') : t(`estimate.units.${u}` as 'estimate.units.each'));
  return (
    <Sheet open={open} onClose={onClose} title={c.addWork}>
      {error ? <Notice text={error} tone="danger" icon="alert-circle" /> : null}
      {adding ? <>
        <Field label={c.itemName} value={name} onChangeText={setName} maxLength={160} autoCapitalize="sentences" />
        <T v="label">{c.unit}</T>
        <Row style={{ flexWrap: 'wrap' }}>{UNITS.map((u) => <Chip key={u} label={unitName(u)} selected={unit === u} onPress={() => setUnit(u)} />)}</Row>
        <Field label={c.price} value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
        {bad ? <T v="small" color={p.danger}>{bad}</T> : null}
        <Button label={busy ? c.saving : c.save} disabled={busy} onPress={() => {
          const cents = price.trim() ? parseHundredths(price.replace('$', '')) : null;
          if (!name.trim() || (price.trim() && cents === null)) { setBad(c.badItem); return; }
          void onNewItem(name.trim(), unit, cents);
        }} />
        <Button label={c.cancel} variant="outline" onPress={() => setAdding(false)} />
      </> : picked ? <>
        <T v="h3">{picked.name}</T>
        {picked.unit_cents !== null ? <T muted>{f.money(picked.unit_cents)}</T> : null}
        {priceOnly(picked.ref) ? null : <Field label={`${c.qty}${picked.unit === 'flat' ? '' : ` (${unitName(picked.unit)})`}`} value={qty} onChangeText={setQty} keyboardType="decimal-pad" />}
        {bad ? <T v="small" color={p.danger}>{bad}</T> : null}
        <Button label={busy ? c.saving : c.addWork} icon="plus" disabled={busy} onPress={() => {
          const q = priceOnly(picked.ref) ? 100 : parseHundredths(qty);
          if (!q) { setBad(c.badQty); return; }
          void onAdd(picked, q);
        }} />
        <Button label={c.cancel} variant="outline" onPress={() => setPicked(null)} />
      </> : <>
        {listError ? <Notice text={listError} tone="danger" icon="alert-circle" /> : null}
        {!items && !listError ? <T muted>{c.loading}</T> : null}
        <T v="label">{c.pickItem}</T>
        {items?.filter((item) => item.unit !== 'hour').map((item) => <ListRow key={item.id} title={item.name}
          sub={!item.priced ? c.needsPrice : prices && item.unit_cents !== null ? `${f.money(item.unit_cents)}${item.unit === 'flat' ? '' : ` / ${unitName(item.unit)}`}` : unitName(item.unit)}
          onPress={item.priced ? () => { setPicked(item); setBad(''); } : undefined} />)}
        <Button label={c.addItem} icon="plus" variant="outline" onPress={() => { setAdding(true); setName(''); setPrice(''); setBad(''); }} />
      </>}
    </Sheet>
  );
}

function HoursSheet({ open, onClose, busy, error, onSave }: {
  open: boolean; onClose: () => void; busy: boolean; error: string; onSave: (hundredths: number, note: string) => Promise<boolean>;
}) {
  const p = usePalette();
  const { lang } = useLang();
  const c = teamText(lang);
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const [bad, setBad] = useState(false);
  return <Sheet open={open} onClose={onClose} title={c.addHours}>
    {error ? <Notice text={error} tone="danger" icon="alert-circle" /> : null}
    <Field label={c.hoursField} value={hours} onChangeText={setHours} keyboardType="decimal-pad" autoFocus />
    {bad ? <T v="small" color={p.danger}>{c.badHours}</T> : null}
    <Field label={c.noteField} value={note} onChangeText={setNote} multiline maxLength={1000} />
    <Button label={busy ? c.saving : c.save} disabled={busy} onPress={() => {
      const h = parseHundredths(hours);
      if (!h || h > 2400) { setBad(true); return; }
      void onSave(h, note.trim());
    }} />
  </Sheet>;
}

function TextSheet({ open, onClose, title, help, label, busy, error, onSave }: {
  open: boolean; onClose: () => void; title: string; help?: string; label: string; busy: boolean; error: string; onSave: (text: string) => Promise<boolean>;
}) {
  const p = usePalette();
  const { lang } = useLang();
  const c = teamText(lang);
  const [text, setText] = useState('');
  const [bad, setBad] = useState(false);
  return <Sheet open={open} onClose={onClose} title={title}>
    {help ? <T muted>{help}</T> : null}
    {error ? <Notice text={error} tone="danger" icon="alert-circle" /> : null}
    <Field label={label} value={text} onChangeText={setText} multiline maxLength={2000} autoFocus autoCapitalize="sentences" />
    {bad ? <T v="small" color={p.danger}>{c.badNote}</T> : null}
    <Button label={busy ? c.saving : c.save} disabled={busy} onPress={() => { if (!text.trim()) { setBad(true); return; } void onSave(text.trim()); }} />
  </Sheet>;
}

/** Photos upload one by one; any that fail stay on the phone to retry. */
function PhotoSheet({ open, onClose, jobId, onSaved }: { open: boolean; onClose: () => void; jobId: string; onSaved: () => void }) {
  const { lang, t } = useLang();
  const c = teamText(lang);
  const outbox = useCrewOutbox();
  const [tag, setTag] = useState<'before' | 'during' | 'after'>('during');
  const [waiting, setWaiting] = useState<NewPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const go = async (camera: boolean | 'retry') => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      let photos = waiting;
      if (camera !== 'retry') {
        const picked = await pickJobPhotos(camera);
        if (picked.problem) { setError(c.cameraDenied); return; }
        if (!picked.photos.length) return;
        photos = picked.photos;
        setWaiting(photos);
      }
      await outbox.save(photos.map(({ id, localUri, takenAt }) => ({
        kind: 'photo', id, job: jobId, photo: { id, localUri, takenAt }, tag,
      })));
      setWaiting([]);
      onSaved();
    } catch (e) { setError(userError(t, e)); }
    finally { setBusy(false); }
  };
  return <Sheet open={open} onClose={() => {
    if (busy) return;
    for (const photo of waiting) removeFromPhone(photo.localUri);
    setWaiting([]);
    onClose();
  }} title={c.photos}>
    <Segmented label={c.stage} value={tag} onChange={setTag} options={[{ key: 'before', label: c.before }, { key: 'during', label: c.during }, { key: 'after', label: c.after }]} />
    {error ? <Notice text={error} tone="danger" icon="alert-circle" /> : null}
    {waiting.length ? <>
      <Notice text={c.pendingPhotos} tone="flag" icon="alert-triangle" />
      <Button label={busy ? c.saving : c.retryPhotos} disabled={busy} onPress={() => void go('retry')} />
    </> : <>
      <Button label={busy ? c.saving : c.takePhoto} icon="camera" disabled={busy} onPress={() => void go(true)} />
      <Button label={c.choosePhotos} icon="image" variant="outline" disabled={busy} onPress={() => void go(false)} />
    </>}
  </Sheet>;
}
