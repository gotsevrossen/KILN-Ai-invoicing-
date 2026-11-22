import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useSubscription } from '@/data/subscription';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';
import { banner } from '@/lib/subscription';

import { Button, Notice } from './ui';

/** Home's one subscription notice (ended, trial ending, team bigger than the plan). Nothing while the paywall is off. */
export function SubscriptionBanner() {
  const { t } = useLang();
  const f = useFormat();
  const { sub } = useSubscription();
  // the time Home opened is close enough for a days-away notice
  const [now] = useState(() => Date.now());
  const b = banner(sub, now);
  if (!b) return null;
  const day = (d: Date) => f.date(d.toISOString().slice(0, 10));
  const owner = sub?.role === 'owner';
  const text = b.kind === 'lapsed' ? (b.owner ? t('sub.bannerLapsed') : t('sub.bannerLapsedTeam'))
    : b.kind === 'readOnly' ? t('sub.bannerReadOnly')
    : b.kind === 'overLimit' ? t('sub.bannerOverLimit', { count: b.count, limit: b.limit, date: day(b.by) })
    : t('sub.bannerTrialEnds', { date: day(b.on) });
  return (
    <View style={{ gap: 8 }}>
      <Notice text={text} icon="alert-circle" tone={b.kind === 'trialEnds' ? 'soft' : 'flag'} />
      {owner && b.kind !== 'trialEnds' ? (
        <Button label={b.kind === 'lapsed' ? t('sub.subscribe') : t('sub.upgrade')} icon="arrow-right" onPress={() => router.push('/subscribe' as Href)} />
      ) : null}
    </View>
  );
}
