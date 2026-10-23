import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { CommandBox } from '@/components/command-box';
import { JobPicker, Sheet } from '@/components/sheet';
import { VoiceSheet } from '@/components/voice-sheet';
import { Button, ButtonRow, Card, Field, Notice, PageHeader, Row, Screen, T, type IconName } from '@/components/ui';
import { aiReady } from '@/data/ai';
import * as sample from '@/data/sample';
import { jobById } from '@/data/selectors';
import { useStore, type CaptureKind } from '@/data/store';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';
import { voiceAvailable } from '@/lib/voice';
import { font, radius } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

function Tile({ icon, label, onPress, accent }: { icon: IconName; label: string; onPress: () => void; accent?: boolean }) {
  const p = usePalette();
  const fg = accent ? p.onAccent : p.ink;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flex: 1,
        height: 150,
        borderRadius: radius.md,
        padding: 18,
        justifyContent: 'space-between',
        backgroundColor: accent ? p.accent : p.card,
        opacity: pressed ? 0.85 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}>
      <Feather name={icon} size={38} color={fg} />
      <Text style={{ fontFamily: font.black, fontSize: 24, letterSpacing: -0.5, textTransform: 'uppercase', color: fg }}>{label}</Text>
    </Pressable>
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
  const [saved, setSaved] = useState<string | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  // with the phone's speech recognition (not in Expo Go): signed in, KILN checks what was said
  // for hours and work; otherwise the words are saved as a note on the job picked next
  const ai = aiReady(state.mode);
  const startVoice = () => (voiceAvailable ? setVoiceOpen(true) : setMode('voice'));

  const pick = (jobId: string) => {
    if (!mode) return;
    actions.addCapture(jobId, mode, mode === 'note' ? note : undefined);
    setSaved(jobById(jobId).title);
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
        <Tile icon="camera" label={t('capture.photo')} onPress={() => setMode('photo')} />
        <Tile icon="edit-3" label={t('capture.note')} onPress={() => setNoteOpen(true)} />
      </Row>

      {saved ? <Notice text={t('common.savedTo', { job: saved })} /> : null}

      {ai ? <CommandBox voiceOpen={voiceOpen} onVoiceClose={() => setVoiceOpen(false)} /> : (
        <VoiceSheet open={voiceOpen} onClose={() => setVoiceOpen(false)} onDone={(heard) => {
          setVoiceOpen(false);
          setNote(heard);
          // let the voice sheet finish closing before the job sheet opens (iOS shows one modal at a time)
          setTimeout(() => setMode('note'), 400);
        }} />
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
            <ButtonRow gap={10}>
              <Button label={t('capture.addBoth')} icon="check" flex onPress={actions.confirmVoice} />
              <Button label={t('capture.edit')} variant="soft" />
            </ButtonRow>
          </>
        )}
      </Card>
      ) : null}

      <JobPicker
        open={mode !== null}
        onClose={() => setMode(null)}
        onPick={pick}
        title={mode === 'voice' ? t('capture.recording') : mode === 'photo' ? t('capture.camera') : undefined}
      />

      <Sheet open={noteOpen} onClose={() => setNoteOpen(false)} title={t('capture.note')}>
        <Field value={note} onChangeText={setNote} placeholder={t('capture.notePlaceholder')} multiline autoFocus style={{ minHeight: 120, paddingTop: 14, textAlignVertical: 'top' }} />
        <Button
          label={t('common.save')}
          disabled={note.trim().length === 0}
          onPress={() => {
            setNoteOpen(false);
            // let the note sheet finish closing before the job sheet opens (iOS shows one modal at a time)
            setTimeout(() => setMode('note'), 400);
          }}
        />
      </Sheet>
    </Screen>
  );
}
