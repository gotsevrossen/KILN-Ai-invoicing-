import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Platform } from 'react-native';

import { Button, Card, Notice, PageHeader, Screen, T } from '@/components/ui';
import { useAuth } from '@/data/auth';
import { useSubscription } from '@/data/subscription';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';
import { manage, restore, storeReady } from '@/lib/purchases';
import { PLANS, productPlan } from '@/lib/subscription';
import { userError } from '@/lib/user-errors';

/** Settings → Subscription: the plan, the team against it, and the store's own controls. */
export default function SubscriptionSettings() {
  const { t } = useLang();
  const f = useFormat();
  const auth = useAuth();
  const { sub, syncStore } = useSubscription();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const owner = (sub?.role ?? auth.role) === 'owner';
  const phone = Platform.OS !== 'web' && storeReady();
  const day = (iso: string | null) => (iso ? f.date(iso.slice(0, 10)) : '');
  const store = sub?.store === 'apple' || sub?.store === 'google' ? t(`sub.store_${sub.store}`) : t('sub.store_other');

  const status = !sub?.status ? t('sub.statusNone')
    : sub.status === 'comped' ? t('sub.statusComped')
    : sub.status === 'trial' ? t('sub.statusTrial', { date: day(sub.expiresAt) })
    : sub.status === 'active' ? t('sub.statusActive', { date: day(sub.expiresAt) })
    : sub.status === 'grace' ? t('sub.statusGrace', { store, date: day(sub.expiresAt) })
    : t('sub.statusExpired');
  const plan = productPlan(sub?.productId);
  const planName = plan ? `${t(`sub.plan${PLANS.findIndex((p) => p.id === plan.plan) + 1}` as 'sub.plan1')} · ${plan.period === 'yearly' ? t('sub.yearly') : t('sub.monthly')}` : null;
  const people = sub ? (sub.teamLimit ? t('sub.people', { count: sub.teamSize, limit: sub.teamLimit }) : t('sub.peopleNoLimit', { count: sub.teamSize })) : '';
  const paid = sub?.status === 'trial' || sub?.status === 'active' || sub?.status === 'grace';

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try { await work(); } catch (e) { setMessage(userError(t, e)); } finally { setBusy(false); }
  };

  return (
    <Screen header={<PageHeader title={t('sub.title')} back={() => router.back()} />}>
      <Card style={{ gap: 6 }}>
        <T v="h3">{status}</T>
        {planName ? <T>{planName}</T> : null}
        {people ? <T muted>{people}</T> : null}
      </Card>
      {owner && sub?.status !== 'comped' ? (
        <Button label={paid ? t('sub.upgrade') : t('sub.subscribe')} icon="arrow-right" big onPress={() => router.push('/subscribe' as Href)} />
      ) : null}
      {owner && phone && paid && (sub?.store === 'apple' || sub?.store === 'google') ? (
        <Button label={t('sub.manage')} variant="outline" disabled={busy} onPress={() => void run(() => manage(auth.businessId!))} />
      ) : null}
      {owner && phone ? (
        <Button label={t('sub.restore')} variant="ghost" disabled={busy} onPress={() => void run(async () => {
          const found = await restore(auth.businessId!);
          await syncStore();
          setMessage(found ? t('sub.restored') : t('sub.nothingToRestore'));
        })} />
      ) : null}
      {!owner ? <Notice text={t('sub.ownerOnly')} icon="info" tone="soft" /> : null}
      {message ? <Notice text={message} icon="info" tone="soft" /> : null}
    </Screen>
  );
}
