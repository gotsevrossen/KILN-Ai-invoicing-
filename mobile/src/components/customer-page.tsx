import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useStore } from '@/data/store';
import { useLang, type TFn } from '@/i18n';
import { tap } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

import { Card, Hair, Icon, Row, Screen, T } from './ui';

/**
 * Frame for previewing a customer web page inside the app. The black strip is
 * in the owner's language; the page itself is in the customer's.
 */
export function CustomerPage({
  who,
  tc,
  expires,
  scrollEnabled = true,
  children,
}: {
  who: string;
  tc: TFn;
  expires: string;
  scrollEnabled?: boolean;
  children: ReactNode;
}) {
  const p = usePalette();
  const { t } = useLang();
  const { state } = useStore();
  return (
    <View style={{ flex: 1, backgroundColor: p.ground }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: p.inverse }}>
        <Row style={{ justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 6 }}>
          <Row gap={8} style={{ flex: 1 }}>
            <Icon name="eye" size={16} color={p.onInverse} />
            <T v="small" color={p.onInverse} style={{ flex: 1 }}>{t('customer.preview', { name: who })}</T>
          </Row>
          <Pressable onPress={() => router.back()} accessibilityRole="button" style={{ minHeight: tap.min, justifyContent: 'center', paddingHorizontal: 8 }}>
            <T v="label" color={p.onInverse}>{t('common.close')}</T>
          </Pressable>
        </Row>
      </SafeAreaView>
      <Screen noTopInset scrollEnabled={scrollEnabled}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: p.ground, borderWidth: 1.5, borderStyle: 'dashed', borderColor: p.muted, alignItems: 'center', justifyContent: 'center' }}>
            <T v="small" muted>Logo</T>
          </View>
          <View style={{ flex: 1 }}>
            <T v="h3">{state.profile.businessName}</T>
            <T v="small" muted>{state.profile.phone}</T>
          </View>
        </Card>
        {children}
        <Card tone="soft" style={{ gap: 6, paddingHorizontal: 0 }}>
          <T v="label">{tc('customer.terms')}</T>
          <T v="small" muted>{tc('customer.termsPlaceholder')}</T>
        </Card>
        <Hair />
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Row gap={6}>
            <Icon name="lock" size={14} color={p.muted} />
            <T v="small" muted>{tc('customer.privateLink', { date: expires })}</T>
          </Row>
          <T v="small" muted>{tc('customer.sentWith')}</T>
        </View>
      </Screen>
    </View>
  );
}
