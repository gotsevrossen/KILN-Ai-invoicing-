import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
  type KeyboardEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as sample from '@/data/sample';
import { customerOf } from '@/data/selectors';
import { useLang } from '@/i18n';
import { radius, space } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

import { NewJobForm } from './new-job';
import { Button, IconButton, ListRow, Row, T } from './ui';

// the browser can't run these animations natively; it runs them in JavaScript instead
const nativeDriver = Platform.OS !== 'web';
const ios = Platform.OS === 'ios';

/**
 * iPhone: the keyboard's height while the sheet is open, set the moment the keyboard starts to move
 * and animated with the keyboard's own timing, so the card rises together with it.
 * (React Native's KeyboardAvoidingView waits until it has measured itself, so a sheet that opened
 * with the keyboard, like the note sheet, trailed a few frames behind it.)
 */
function useKeyboardHeight(active: boolean) {
  // the keyboard may already be up when the sheet opens
  const now = () => (ios && Keyboard.isVisible() ? (Keyboard.metrics()?.height ?? 0) : 0);
  const [height, setHeight] = useState(() => (active ? now() : 0));
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (active) setHeight(now());
  }
  // a layout effect, so the listener is on before the text box's own focus raises the keyboard
  useLayoutEffect(() => {
    if (!ios || !active) return;
    let last = Keyboard.isVisible() ? (Keyboard.metrics()?.height ?? 0) : 0;
    const follow = (e: KeyboardEvent, next: number) => {
      if (next === last) return;
      last = next;
      const duration = Math.max(e.duration, 10);
      LayoutAnimation.configureNext({ duration, update: { type: LayoutAnimation.Types.keyboard, duration } });
      setHeight(next);
    };
    const subs = [
      Keyboard.addListener('keyboardWillShow', (e) => follow(e, e.endCoordinates.height)),
      Keyboard.addListener('keyboardWillHide', (e) => follow(e, 0)),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [active]);
  return active ? height : 0;
}

/**
 * Bottom sheet: a white card that slides up over a dimmed screen.
 * The dim shows at once and only the card slides (the built-in slide moved the dim too).
 */
export function Sheet({ open, onClose, title, children, scroll = true }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode;
  /** Off when the children scroll on their own, so a top part can stay in place. */
  scroll?: boolean;
}) {
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
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight(shown);
  const head = (
    <Row style={{ justifyContent: 'space-between' }}>
      <T v="h2" accessibilityRole="header">{title}</T>
      <IconButton icon="x" label={t('common.close')} onPress={onClose} />
    </Row>
  );

  return (
    <Modal visible={shown} transparent animationType="none" onRequestClose={onClose}>
      {/* lifts the sheet above the keyboard so the text box stays visible
          (iPhone: the keyboard height above; Android keeps the built-in view) */}
      <KeyboardAvoidingView enabled={!ios} behavior="height" style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: keyboard }}>
        <Pressable accessibilityLabel={t('common.close')} onPress={onClose} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)' }} />
        <Animated.View style={{ backgroundColor: p.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '85%', transform: [{ translateY }] }}>
          {/* the keyboard covers the home bar, so its space is only kept while the keyboard is down */}
          <View style={{ flexShrink: 1, paddingBottom: keyboard > 0 ? 0 : insets.bottom }}>
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
