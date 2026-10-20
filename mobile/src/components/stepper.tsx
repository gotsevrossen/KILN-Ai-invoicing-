import Feather from '@expo/vector-icons/Feather';
import { Text, View } from 'react-native';

import type { Stage } from '@/data/selectors';
import { useLang } from '@/i18n';
import { font } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

const STEPS: Stage[] = ['estimate', 'work', 'invoice', 'paid'];

/** Estimate · Work · Invoice · Paid, with done steps checked and the current step in orange. */
export function Stepper({ stage }: { stage: Stage }) {
  const p = usePalette();
  const { t } = useLang();
  const current = STEPS.indexOf(stage);
  // a paid job has every step done
  const doneUpTo = stage === 'paid' ? STEPS.length : current;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('flow.stepOf', { n: current + 1, name: t(`flow.${stage}`) })}
      style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      {STEPS.map((step, i) => {
        const done = i < doneUpTo;
        const now = i === current && stage !== 'paid';
        const bg = done ? p.inverse : now ? p.accent : 'transparent';
        const fg = done ? p.onInverse : now ? p.onAccent : p.muted;
        return (
          <View key={step} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
              <View style={{ flex: 1, height: 2, backgroundColor: i === 0 ? 'transparent' : i <= doneUpTo ? p.inverse : p.line }} />
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: bg,
                  borderWidth: done || now ? 0 : 2,
                  borderColor: p.line,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                {done ? (
                  <Feather name="check" size={17} color={fg} />
                ) : (
                  <Text style={{ fontFamily: font.bold, fontSize: 14, color: fg }}>{i + 1}</Text>
                )}
              </View>
              <View style={{ flex: 1, height: 2, backgroundColor: i === STEPS.length - 1 ? 'transparent' : i < doneUpTo ? p.inverse : p.line }} />
            </View>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={{ fontFamily: now ? font.bold : font.medium, fontSize: 13, color: done || now ? p.ink : p.muted }}>
              {t(`flow.${step}`)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
