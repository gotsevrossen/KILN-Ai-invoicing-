import { useEffect, useRef, useState } from 'react';
import { Button, Card, Chip, Field, Notice, PageHeader, Row, Screen, Segmented, T } from '@/components/ui';
import { useAuth } from '@/data/auth';
import { newUuid } from '@/data/db';
import * as api from '@/data/team-access';
import { useLang } from '@/i18n';
import { callNumber, dialable } from '@/lib/contact';
import { useFormat } from '@/lib/format';
import { pickJobPhotos, type NewPhoto } from '@/lib/job-photos';
import { removeFromPhone } from '@/lib/photo-file';
import { userError } from '@/lib/user-errors';
import { centsInput } from '@/features/operations/model';
import { teamText } from './text';

function TeamWorkAccount() {
  const auth = useAuth();
  const { lang, setLang, t } = useLang();
  const c = teamText(lang);
  const f = useFormat();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.loadTeamWork>> | null>(null);
  const [jobId, setJobId] = useState('');
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const [tag, setTag] = useState<'before' | 'during' | 'after'>('during');
  const [photos, setPhotos] = useState<NewPhoto[]>([]);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const alive = useRef(true);
  const inFlight = useRef(false);
  const hourId = useRef('');
  const noteId = useRef('');
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    api.loadTeamWork().then((next) => { if (!cancelled) { setData(next); setError(''); } }, (e: unknown) => { if (!cancelled) setError(userError(t, e)); });
    return () => { cancelled = true; };
  }, [attempt, t]);
  const job = data?.jobs.find((j) => j.id === jobId);
  const run = async (work: () => Promise<void | boolean>, message: string) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); setStatus('');
    try {
      const completed = await work();
      if (!alive.current) return;
      if (completed !== false) setStatus(message);
      setAttempt((a) => a + 1);
    } catch (e) { if (alive.current) setError((e as { code?: string }).code === 'camera_denied' ? c.cameraDenied : userError(t, e)); }
    finally { if (alive.current) { inFlight.current = false; setBusy(false); } }
  };
  const saveHours = () => {
    const hundredths = centsInput(hours);
    if (!job?.is_open) { setError(c.selectJob); return; }
    if (hundredths === null || hundredths < 1 || hundredths > 2400) { setError(c.badHours); return; }
    if (!hourId.current) hourId.current = newUuid();
    void run(async () => {
      await api.logTeamHours(hourId.current, job.id, hundredths, note.trim());
      if (alive.current) { hourId.current = ''; setHours(''); setNote(''); }
    }, c.saved);
  };
  const saveNote = () => {
    if (!job?.is_open) { setError(c.selectJob); return; }
    if (!note.trim()) { setError(c.badNote); return; }
    if (!noteId.current) noteId.current = newUuid();
    void run(async () => {
      await api.addTeamNote(noteId.current, job.id, note.trim());
      if (alive.current) { noteId.current = ''; setNote(''); }
    }, c.saved);
  };
  const upload = async (pending: NewPhoto[]) => {
    if (!job?.is_open || !auth.businessId) throw Object.assign(new Error('job unavailable'), { code: 'owner_only' });
    for (const photo of pending) {
      await api.saveTeamPhoto(auth.businessId, job.id, photo, tag);
      removeFromPhone(photo.localUri);
      if (alive.current) setPhotos((old) => old.filter((p) => p.id !== photo.id));
    }
  };
  const capture = (camera: boolean) => {
    if (!job?.is_open) { setError(c.selectJob); return; }
    void run(async () => {
      const picked = await pickJobPhotos(camera, false);
      if (!alive.current) return;
      if (picked.problem) throw Object.assign(new Error('Camera denied'), { code: 'camera_denied' });
      if (!picked.photos.length) return false;
      setPhotos(picked.photos);
      await upload(picked.photos);
    }, c.photosSaved);
  };
  return <Screen header={<PageHeader title={c.title} right={<Button label={c.signOut} variant="outline" disabled={busy} onPress={() => void auth.signOut()} />} />}>
    <Notice text={c.help} tone="soft" />
    <Segmented label={c.language} value={lang} onChange={setLang} options={[{ key: 'en', label: 'English' }, { key: 'es', label: 'Español' }]} />
    {error ? <><Notice text={error} tone="danger" /><Button label={c.retry} variant="outline" disabled={busy} onPress={() => setAttempt((a) => a + 1)} /></> : null}
    {status ? <Notice text={status} tone="accent" /> : null}
    {!data && !error ? <T>{c.loading}</T> : null}
    {data?.jobs.length === 0 ? <T muted>{c.noJobs}</T> : null}
    {data?.jobs.length ? <>
      <T v="h2">{c.chooseJob}</T>
      {data.jobs.map((j) => <Chip key={j.id} label={`${j.title} · ${j.address}`} selected={jobId === j.id} onPress={() => { if (!busy && !photos.length) { setJobId(j.id); setNote(''); setHours(''); hourId.current = ''; noteId.current = ''; setStatus(''); setError(''); } }} />)}
      {job ? <>
        <Card>
          <T v="h2">{job.title}</T><T>{job.address}</T><T muted>{job.customer_name}</T>
          {dialable(job.customer_phone) ? <Button label={c.call} variant="outline" onPress={() => callNumber(job.customer_phone)} /> : null}
          {!job.is_open ? <Notice text={c.closed} tone="soft" /> : null}
        </Card>
        {job.is_open ? <Card>
          <T v="small" muted>{c.noConnection}</T>
          <Field label={c.hoursField} value={hours} onChangeText={(v) => { setHours(v); hourId.current = ''; }} keyboardType="decimal-pad" editable={!busy} />
          <Field label={c.note} value={note} onChangeText={(v) => { setNote(v); hourId.current = ''; noteId.current = ''; }} multiline maxLength={1000} editable={!busy} />
          <Button label={busy ? c.saving : c.hours} disabled={busy} onPress={saveHours} />
          <Button label={busy ? c.saving : c.addNote} variant="outline" disabled={busy} onPress={saveNote} />
          <Segmented label={c.photoTag} value={tag} onChange={setTag} options={[{ key: 'before', label: c.before }, { key: 'during', label: c.during }, { key: 'after', label: c.after }]} />
          <Row style={{ flexWrap: 'wrap' }}>
            <Button label={c.photo} icon="camera" variant="outline" disabled={busy || photos.length > 0} onPress={() => capture(true)} />
            <Button label={c.library} icon="image" variant="outline" disabled={busy || photos.length > 0} onPress={() => capture(false)} />
          </Row>
          {photos.length ? <><Notice text={c.pendingPhotos} tone="flag" /><Button label={c.retryPhotos} disabled={busy} onPress={() => void run(() => upload(photos), c.photosSaved)} /><Button label={c.discardPhotos} variant="outline" disabled={busy} onPress={() => { photos.forEach((photo) => removeFromPhone(photo.localUri)); setPhotos([]); }} /></> : null}
        </Card> : null}
        <T v="h2">{c.myHours}</T>
        <T v="small" muted>{c.ownRecords}</T>
        {data.hours.filter((e) => e.job_id === job.id).map((entry) => <Card key={entry.id}><T v="label">{f.date(entry.worked_on)} · {f.qty(entry.hundredths)} h</T>{entry.note ? <T>{entry.note}</T> : null}</Card>)}
        <T v="h2">{c.myNotes}</T>
        {data.notes.filter((e) => e.job_id === job.id).map((entry) => <Card key={entry.id}><T>{entry.body}</T></Card>)}
      </> : null}
    </> : null}
  </Screen>;
}
export function TeamWorkScreen() {
  const auth = useAuth();
  const { lang } = useLang();
  const c = teamText(lang);
  if (!auth.ready) return <Screen><T>{c.loading}</T></Screen>;
  if (!auth.session || auth.role !== 'helper') return <Screen><Notice text={c.noAccess} tone="soft" /></Screen>;
  return <TeamWorkAccount key={`${auth.session.user.id}:${auth.businessId}`} />;
}
