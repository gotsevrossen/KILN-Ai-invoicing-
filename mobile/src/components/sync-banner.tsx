import Feather from '@expo/vector-icons/Feather';
import { View } from 'react-native';

import { useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { radius } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

import { Button, T, toneColors } from './ui';

/**
 * How saving is going, in plain words: changes waiting for signal, or a change the server
 * turned down. Shows nothing while saves go through (or in example mode, which saves nothing).
 */
export function SyncBanner() {
  const p = usePalette();
  const { t } = useLang();
  const { state, actions } = useStore();
  if (!state.offline && !state.syncError) return null;
  const flag = toneColors(p, 'flag');
  const danger = toneColors(p, 'danger');
  return (
    <View style={{ gap: 10 }}>
      {state.offline ? (
        <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: flag.bg, borderRadius: radius.sm, padding: 14 }}>
          <Feather name="wifi-off" size={20} color={flag.fg} />
          <T v="label" color={flag.fg} style={{ flex: 1 }}>{t('sync.offline', { count: state.pendingSaves })}</T>
        </View>
      ) : null}
      {state.syncError ? (
        <View accessibilityLiveRegion="polite" style={{ gap: 10, backgroundColor: danger.bg, borderRadius: radius.sm, padding: 14 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Feather name="alert-circle" size={20} color={danger.fg} />
            <T v="label" color={danger.fg} style={{ flex: 1 }}>{t('sync.refused')}</T>
          </View>
          {/* the server's own words, for when the owner asks for help */}
          <T v="small" color={danger.fg} numberOfLines={3}>{state.syncError}</T>
          <Button label={t('sync.dismiss')} variant="outlineInverse" onPress={actions.clearSyncError} style={{ borderColor: danger.fg, alignSelf: 'flex-start', minHeight: 48 }} />
        </View>
      ) : null}
    </View>
  );
}
