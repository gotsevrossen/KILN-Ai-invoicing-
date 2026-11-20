import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { Tile } from '@/components/capture-tile';
import { PhotoSourceSheet } from '@/components/job-photos';
import { Sheet } from '@/components/sheet';
import { Button, Field, Hair, Notice, PageHeader, Row, Screen, Segmented, T } from '@/components/ui';
import { VoiceSheet } from '@/components/voice-sheet';
import { newUuid } from '@/data/db';
import type * as api from '@/data/team-access';
import { useLang } from '@/i18n';
import type { NewPhoto } from '@/lib/job-photos';
import { removeFromPhone } from '@/lib/photo-file';
import { userError } from '@/lib/user-errors';

import { CrewSyncStatus, useCrewOutbox } from './crew-outbox';
import { teamText } from './text';

/** The same four Capture tiles as the office, with saves limited to assigned jobs. */
export function CrewCaptureScreen({ jobs, error, retry }: {
  jobs: api.CrewJob[] | null; error: string; retry: () => void;
}) {
  const { t, lang } = useLang();
  const c = teamText(lang);
  const outbox = useCrewOutbox();
  const [mode, setMode] = useState<'receipt' | 'note' | 'photo' | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<NewPhoto[]>([]);
  const [tag, setTag] = useState<'before' | 'during' | 'after'>('during');
  const [saved, setSaved] = useState('');
  const [saveError, setSaveError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const waiting = useRef<NewPhoto[]>([]);
  const live = useRef(true);
  const transition = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      if (transition.current) clearTimeout(transition.current);
      if (!inFlight.current) for (const photo of waiting.current) removeFromPhone(photo.localUri);
    };
  }, []);

  // iOS shows one sheet at a time; allow the source sheet to close first.
  const pickJobAfterSheet = (next: 'note' | 'photo') => {
    if (transition.current) clearTimeout(transition.current);
    transition.current = setTimeout(() => { if (live.current) setMode(next); }, 400);
  };
  const closePicker = () => {
    if (inFlight.current) return;
    for (const photo of waiting.current) removeFromPhone(photo.localUri);
    waiting.current = []; setPhotos([]);
    setMode(null); setSaveError('');
  };
  const pick = async (job: api.CrewJob) => {
    if (!mode || inFlight.current || !job.is_open) return;
    if (mode === 'receipt') {
      setMode(null);
      router.push({ pathname: '/crew/receipt', params: { job: job.id, title: job.title } });
      return;
    }
    inFlight.current = true; setBusy(true); setSaveError('');
    try {
      if (mode === 'photo') {
        await outbox.save(waiting.current.map(({ id, localUri, takenAt }) => ({
          kind: 'photo', id, job: job.id, photo: { id, localUri, takenAt }, tag,
        })));
        waiting.current = [];
        if (live.current) setPhotos([]);
      } else {
        await outbox.save([{ kind: 'note', id: newUuid(), job: job.id, text: note.trim() }]);
      }
      if (live.current) { setSaved(job.title); setNote(''); setMode(null); }
    } catch (e: unknown) {
      if (live.current) setSaveError(userError(t, e));
    } finally {
      inFlight.current = false;
      if (live.current) setBusy(false);
      else for (const photo of waiting.current) removeFromPhone(photo.localUri);
    }
  };
  const openJobs = (jobs ?? []).filter((job) => job.is_open);

  return <Screen floatingBar header={<PageHeader title={t('capture.title')} sub={t('capture.sub')} back={() => router.navigate('/crew')} />}>
    <CrewSyncStatus />
    <Row gap={12}>
      <Tile icon="file-text" label={t('capture.receipt')} accent onPress={() => { setSaveError(''); setMode('receipt'); }} />
      <Tile icon="mic" label={t('capture.voice')} onPress={() => setVoiceOpen(true)} />
    </Row>
    <Row gap={12}>
      <Tile icon="camera" label={t('capture.photo')} onPress={() => setPhotoOpen(true)} />
      <Tile icon="edit-3" label={t('capture.note')} onPress={() => setNoteOpen(true)} />
    </Row>
    {saved ? <Notice text={c.savedOnDevice} /> : null}
    {error ? <><Notice text={error} tone="danger" icon="alert-circle" /><Button label={c.retry} variant="outline" onPress={retry} /></> : null}
    {!jobs && !error ? <T muted>{c.loading}</T> : null}
    {jobs && !jobs.some((job) => job.is_open) ? <Notice text={c.noJobs} tone="soft" icon="info" /> : null}

    <VoiceSheet open={voiceOpen} onClose={() => setVoiceOpen(false)} onDone={(text) => {
      setVoiceOpen(false); setNote(text); setSaveError('');
      pickJobAfterSheet('note');
    }} />
    <PhotoSourceSheet open={photoOpen} onClose={() => setPhotoOpen(false)} onPicked={(picked) => {
      setPhotoOpen(false); waiting.current = picked; setPhotos(picked); setSaveError('');
      setTag('during'); pickJobAfterSheet('photo');
    }} />
    <Sheet open={noteOpen} onClose={() => setNoteOpen(false)} title={t('capture.note')}>
      <Field value={note} onChangeText={setNote} placeholder={t('capture.notePlaceholder')} multiline maxLength={2000}
        autoFocus style={{ minHeight: 120 }} />
      <Button label={t('common.save')} disabled={!note.trim()} onPress={() => {
        setNoteOpen(false); setSaveError(''); pickJobAfterSheet('note');
      }} />
    </Sheet>
    <Sheet open={mode !== null} onClose={closePicker} title={c.pickJob}>
      {mode === 'photo' ? <>
        <Segmented label={c.stage} value={tag} onChange={(value) => { if (!inFlight.current) setTag(value); }}
          options={[{ key: 'before', label: c.before }, { key: 'during', label: c.during }, { key: 'after', label: c.after }]} />
        <T muted>{photos.length} · {c.photos}</T>
      </> : null}
      {saveError ? <Notice text={saveError} tone="danger" icon="alert-circle" /> : null}
      {error ? <><Notice text={error} tone="danger" icon="alert-circle" /><Button label={c.retry} variant="outline" onPress={retry} /></> : null}
      {!jobs && !error ? <T muted>{c.loading}</T> : null}
      {jobs && !openJobs.length ? <Notice text={c.noJobs} tone="soft" icon="info" /> : null}
      {openJobs.map((job) => <Row key={job.id}>
        <Button label={busy ? c.saving : job.title} icon="briefcase" variant="outline" flex disabled={busy}
          onPress={() => void pick(job)} />
      </Row>)}
      <Hair />
      <Button label={c.cancel} variant="ghost" disabled={busy} onPress={closePicker} />
    </Sheet>
  </Screen>;
}
