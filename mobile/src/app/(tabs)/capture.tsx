import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { CommandBox } from '@/components/command-box';
import { PhotoSourceSheet } from '@/components/job-photos';
import { JobPicker, Sheet } from '@/components/sheet';
import { useToast } from '@/components/toast';
import { VoiceSheet } from '@/components/voice-sheet';
import { Button, Card, Field, Notice, PageHeader, PressableScale, Row, Screen, T, type IconName } from '@/components/ui';
import { aiReady } from '@/data/ai';
import * as sample from '@/data/sample';
import { jobById } from '@/data/selectors';
import { useStore, type CaptureKind } from '@/data/store';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';
import type { NewPhoto } from '@/lib/job-photos';
import { removeFromPhone } from '@/lib/photo-file';
import { font, radius } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

function Tile({ icon, label, onPress, accent }: { icon: IconName; label: string; onPress: () => void; accent?: boolean }) {
  const p = usePalette();
  const fg = accent ? p.onAccent : p.ink;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        flex: 1,
        height: 150,
        borderRadius: radius.md,
        padding: 18,
        justifyContent: 'space-between',
        backgroundColor: accent ? p.accent : p.card,
      }}>
      <Feather name={icon} size={38} color={fg} />
      <Text style={{ fontFamily: font.black, fontSize: 24, letterSpacing: -0.5, textTransform: 'uppercase', color: fg }}>{label}</Text>
    </PressableScale>
  );
}

export default function Capture() {
  const p = usePalette();
  const { t } = useLang();
  const f = useFormat();
  const { state, actions } = useStore();
  const [mode, setMode] = useState<CaptureKind | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const toast = useToast();
  const saved = (jobId: string) => toast.show(t('common.savedTo', { job: jobById(jobId).title }));
  const [voiceOpen, setVoiceOpen] = useState(false);
  // what to open once the sheet on screen has fully gone (iOS shows one pop-up at a time)
  const next = useRef<(() => void) | null>(null);
  const thenOpen = () => {
    const open = next.current;
    next.current = null;
    open?.();
  };
  // signed in, KILN checks what was said for hours and work; otherwise the words are saved as
  // a note on the job picked next. Without speech recognition (Expo Go) the owner types it.
  const ai = aiReady(state.mode);
  const startVoice = () => setVoiceOpen(true);

  // photos are taken (or chosen) first, then the job is picked, like a note
  const [photoOpen, setPhotoOpen] = useState(false);
  const [picked, setPicked] = useState<NewPhoto[]>([]);
  const dropPicked = () => {
    for (const photo of picked) removeFromPhone(photo.localUri);
    setPicked([]);
  };

  const pick = (jobId: string) => {
    if (!mode) return;
    if (mode === 'photo') {
      if (actions.addPhotos(jobId, picked)) saved(jobId);
      else dropPicked();
      setPicked([]);
      setMode(null);
      return;
    }
    actions.addCapture(jobId, mode, mode === 'note' ? note : undefined);
    saved(jobId);
    setMode(null);
    setNote('');
  };

  // example voice command: only in example mode (the Park job doesn't exist in a real account)
  const parkJob = sample.jobs.find((j) => j.id === 'park');

  return (
    <Screen
      header={
        <PageHeader title={t('capture.title')} sub={t('capture.sub')} />
      } tabs>

      {/* same order as a job's capture buttons, with Voice in Log hours' place */}
      <Row gap={12}>
        {/* scanned or typed in on the form; it links to receipts waiting to sort */}
        <Tile icon="file-text" label={t('capture.receipt')} accent onPress={() => router.push('/receipt/new')} />
        <Tile icon="mic" label={t('capture.voice')} onPress={startVoice} />
      </Row>
      <Row gap={12}>
        <Tile icon="camera" label={t('capture.photo')} onPress={() => setPhotoOpen(true)} />
        <Tile icon="edit-3" label={t('capture.note')} onPress={() => setNoteOpen(true)} />
      </Row>

      {ai ? <CommandBox voiceOpen={voiceOpen} onVoiceClose={() => setVoiceOpen(false)} /> : (
        <VoiceSheet open={voiceOpen} onClose={() => setVoiceOpen(false)} onDone={(heard) => {
          setVoiceOpen(false);
          setNote(heard);
          next.current = () => setMode('note');
        }} onClosed={thenOpen} />
      )}

      {parkJob ? (
      <Card tone="inverse" style={{ gap: 12, marginTop: 6 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="eyebrow" color={p.onInverseMuted}>{t('capture.heard')}</T>
          <T v="small" color={p.onInverseMuted}>0:42</T>
        </Row>
        <T v="h3" color={p.onInverse} style={{ fontSize: 19, lineHeight: 26 }}>
          “Log two and a half hours on the Park job, and add a trip fee.”
        </T>
        {state.voiceConfirmed ? (
          <Notice text={t('capture.added', { job: parkJob.title })} tone="accent" />
        ) : (
          <>
            <View style={{ gap: 8 }}>
              {[
                { label: t('capture.hoursOn', { job: parkJob.title }), value: `${f.qty(250)} h` },
                { label: t('capture.tripFee'), value: f.money(4500) },
              ].map((row) => (
                <Row key={row.label} style={{ justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: radius.xs, padding: 12 }}>
                  <T v="body" color={p.onInverse} style={{ flex: 1 }}>{row.label}</T>
                  <T v="money" color={p.onInverse}>{row.value}</T>
                </Row>
              ))}
            </View>
            <Button label={t('capture.addBoth')} icon="check" onPress={actions.confirmVoice} />
          </>
        )}
      </Card>
      ) : null}

      <PhotoSourceSheet open={photoOpen} onClose={() => setPhotoOpen(false)} onPicked={(photos) => {
        setPhotoOpen(false);
        setPicked(photos);
        next.current = () => setMode('photo');
      }} onClosed={thenOpen} />

      <JobPicker
        open={mode !== null}
        onClose={() => {
          // photos taken but never given a job aren't kept
          if (mode === 'photo') dropPicked();
          setMode(null);
        }}
        onPick={pick}
        title={mode === 'voice' ? t('capture.recording') : undefined}
      />

      <Sheet open={noteOpen} onClose={() => setNoteOpen(false)} onClosed={thenOpen} title={t('capture.note')}>
        <Field value={note} onChangeText={setNote} placeholder={t('capture.notePlaceholder')} multiline autoFocus style={{ minHeight: 120, paddingTop: 14, textAlignVertical: 'top' }} />
        <Button
          label={t('common.save')}
          disabled={note.trim().length === 0}
          onPress={() => {
            next.current = () => setMode('note');
            setNoteOpen(false);
          }}
        />
      </Sheet>
    </Screen>
  );
}
