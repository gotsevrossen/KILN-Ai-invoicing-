import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import * as sample from '@/data/sample';
import { customerOf } from '@/data/selectors';
import { useLang } from '@/i18n';
import { radius, space } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

import { NewJobForm } from './new-job';
import { Button, IconButton, ListRow, Row, T } from './ui';

// the browser can't run these animations natively; it runs them in JavaScript instead
const nativeDriver = Platform.OS !== 'web';

/**
 * Bottom sheet: a white card that slides up over a dimmed screen.
 * The dim shows at once and only the card slides (the built-in slide moved the dim too).
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const p = usePalette();
  const { t } = useLang();
  const { height } = useWindowDimensions();
  // stays true while the card slides down, so it isn't cut off mid-slide
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  // 0 = card below the screen, 1 = card fully up. Made once and kept.
  const [slide] = useState(() => new Animated.Value(open ? 1 : 0));

  useEffect(() => {
    if (open) {
      Animated.timing(slide, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: nativeDriver }).start();
    } else {
      Animated.timing(slide, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: nativeDriver }).start(({ finished }) => {
        // reopened before the slide finished: stay shown
        if (finished) setShown(false);
      });
    }
  }, [open, slide]);

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });

  return (
    <Modal visible={shown} transparent animationType="none" onRequestClose={onClose}>
      {/* lifts the sheet above the keyboard so the text box stays visible */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel={t('common.close')} onPress={onClose} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)' }} />
        <Animated.View style={{ backgroundColor: p.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '85%', transform: [{ translateY }] }}>
          <SafeAreaView edges={['bottom']} style={{ flexShrink: 1 }}>
            <ScrollView contentContainerStyle={{ padding: space.xl, gap: 14 }} keyboardShouldPersistTaps="handled">
              <Row style={{ justifyContent: 'space-between' }}>
                <T v="h2" accessibilityRole="header">{title}</T>
                <IconButton icon="x" label={t('common.close')} onPress={onClose} />
              </Row>
              {children}
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
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
