import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View, useWindowDimensions, type KeyboardEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import * as sample from '@/data/sample';
import { customerOf } from '@/data/selectors';
import { useLang } from '@/i18n';
import { radius, space } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

import { NewJobForm } from './new-job';
import { sheetShown } from './sheet-state';
import { Button, IconButton, ListRow, Row, T } from './ui';

const ios = Platform.OS === 'ios';
/** Close to the curve iOS moves its keyboard with, so the sheet and keyboard move as one. */
const KEYBOARD_EASING = Easing.bezier(0.38, 0.7, 0.125, 1);

/**
 * Bottom sheet: a white card that slides up over a dimmed screen.
 * The dim shows at once and only the card slides (the built-in slide moved the dim too).
 *
 * Both the slide and the keyboard lift run in Reanimated. (Mixing React Native's Animated slide
 * with a layout animation for the keyboard could reset the card to its starting position below
 * the screen, leaving the note box under the keyboard.)
 */
export function Sheet({ open, onClose, title, children, scroll = true }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode;
  /** Off when the children scroll on their own, so a top part can stay in place. */
  scroll?: boolean;
}) {
  const p = usePalette();
  const { t } = useLang();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // stays true while the card slides down, so it isn't cut off mid-slide
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  // 1 = card below the screen, 0 = card fully up
  const slide = useSharedValue(open ? 0 : 1);
  // iPhone: how much of the screen the keyboard covers, moved with the keyboard
  const keyboard = useSharedValue(0);

  useEffect(() => {
    if (open) {
      slide.set(withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) }));
    } else {
      slide.set(withTiming(1, { duration: 200, easing: Easing.in(Easing.cubic) }, (finished) => {
        // reopened before the slide finished: stay shown
        if (finished) scheduleOnRN(setShown, false);
      }));
    }
  }, [open, slide]);

  // counted while showing, so the page underneath leaves the keyboard to this sheet
  useLayoutEffect(() => (shown ? sheetShown() : undefined), [shown]);

  // a layout effect, so the listener is on before the text box's own focus raises the keyboard
  useLayoutEffect(() => {
    if (!ios || !shown) return;
    // the keyboard may already be up when the sheet opens
    keyboard.set(Keyboard.isVisible() ? (Keyboard.metrics()?.height ?? 0) : 0);
    const follow = (e: KeyboardEvent, to: number) =>
      keyboard.set(withTiming(to, { duration: Math.max(e.duration, 10), easing: KEYBOARD_EASING }));
    const subs = [
      Keyboard.addListener('keyboardWillShow', (e) => follow(e, e.endCoordinates.height)),
      Keyboard.addListener('keyboardWillHide', (e) => follow(e, 0)),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [shown, keyboard]);

  const bottomInset = insets.bottom;
  // the keyboard covers the home bar, so the card only rises by the part above it
  const lift = useAnimatedStyle(() => ({ paddingBottom: Math.max(keyboard.get() - bottomInset, 0) }));
  const card = useAnimatedStyle(() => ({ transform: [{ translateY: slide.get() * height }] }));
  const head = (
    <Row style={{ justifyContent: 'space-between' }}>
      <T v="h2" accessibilityRole="header">{title}</T>
      <IconButton icon="x" label={t('common.close')} onPress={onClose} />
    </Row>
  );

  return (
    <Modal visible={shown} transparent animationType="none" onRequestClose={onClose}>
      {/* lifts the sheet above the keyboard so the text box stays visible
          (iPhone: the lift above; Android keeps the built-in view) */}
      <KeyboardAvoidingView enabled={!ios} behavior="height" style={{ flex: 1 }}>
        <Animated.View style={[{ flex: 1, justifyContent: 'flex-end' }, lift]}>
          <Pressable accessibilityLabel={t('common.close')} onPress={onClose} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)' }} />
          <Animated.View style={[{ backgroundColor: p.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '85%' }, card]}>
            <View style={{ flexShrink: 1, paddingBottom: bottomInset }}>
              {scroll ? (
                <ScrollView contentContainerStyle={{ padding: space.xl, gap: 14 }} keyboardShouldPersistTaps="handled">
                  {head}
                  {children}
                </ScrollView>
              ) : (
                // the children scroll their own part (e.g. a list under a search box that stays put)
                <View style={{ flexShrink: 1, padding: space.xl, gap: 14 }}>
                  {head}
                  {children}
                </View>
              )}
            </View>
          </Animated.View>
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
