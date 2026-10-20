import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import * as sample from '@/data/sample';
import { customerOf } from '@/data/selectors';
import { useLang } from '@/i18n';
import { radius, space } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

import { NewJobForm } from './new-job';
import { Button, IconButton, ListRow, Row, T } from './ui';

/** Bottom sheet: a white card that slides up over a dimmed screen. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const p = usePalette();
  const { t } = useLang();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      {/* lifts the sheet above the keyboard so the text box stays visible */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel={t('common.close')} onPress={onClose} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)' }} />
        <SafeAreaView edges={['bottom']} style={{ backgroundColor: p.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '85%' }}>
          <ScrollView contentContainerStyle={{ padding: space.xl, gap: 14 }} keyboardShouldPersistTaps="handled">
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="h2" accessibilityRole="header">{title}</T>
              <IconButton icon="x" label={t('common.close')} onPress={onClose} />
            </Row>
            {children}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** "Which job?" list of active jobs, with New job at the top. */
export function JobPicker({ open, onClose, onPick, title }: { open: boolean; onClose: () => void; onPick: (jobId: string) => void; title?: string }) {
  const { t } = useLang();
  const [creating, setCreating] = useState(false);
  const active = sample.jobs.filter((j) => j.group === 'active');
  const close = () => {
    setCreating(false);
    onClose();
  };
  // one sheet, two views: the job list, or the New job form (iOS shows one pop-up at a time)
  return (
    <Sheet open={open} onClose={close} title={creating ? t('newJob.title') : (title ?? t('common.whichJob'))}>
      {creating ? (
        <NewJobForm
          onCreated={(id) => {
            setCreating(false);
            onPick(id);
          }}
        />
      ) : (
        <>
          <Button label={t('common.newJob')} icon="plus" variant="outline" onPress={() => setCreating(true)} />
          {active.map((job) => (
            <ListRow key={job.id} icon="briefcase" title={job.title} sub={`${customerOf(job).name} · ${job.address}`} onPress={() => onPick(job.id)} />
          ))}
        </>
      )}
    </Sheet>
  );
}
