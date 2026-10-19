import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import * as sample from '@/data/sample';
import { customerOf } from '@/data/selectors';
import { useLang } from '@/i18n';
import { radius, space } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

import { Button, IconButton, ListRow, Row, T } from './ui';

/** Bottom sheet: a white card that slides up over a dimmed screen. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const p = usePalette();
  const { t } = useLang();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
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
      </View>
    </Modal>
  );
}

/** "Which job?" list of active jobs, with New job at the top. */
export function JobPicker({ open, onClose, onPick, title }: { open: boolean; onClose: () => void; onPick: (jobId: string) => void; title?: string }) {
  const { t } = useLang();
  const active = sample.jobs.filter((j) => j.group === 'active');
  return (
    <Sheet open={open} onClose={onClose} title={title ?? t('common.whichJob')}>
      <Button label={t('common.newJob')} icon="plus" variant="outline" />
      {active.map((job) => (
        <ListRow key={job.id} icon="briefcase" title={job.title} sub={`${customerOf(job).name} · ${job.address}`} onPress={() => onPick(job.id)} />
      ))}
    </Sheet>
  );
}
