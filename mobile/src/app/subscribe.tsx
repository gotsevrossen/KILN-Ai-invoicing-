import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';

import { Button, Card, Notice, PageHeader, Screen, Segmented, T, type Tone } from '@/components/ui';
import { useAuth } from '@/data/auth';
import { useSubscription } from '@/data/subscription';
import { useLang } from '@/i18n';
import { buy, loadPlans, manage, restore, storeReady, type StorePlan } from '@/lib/purchases';
import { fits, planForTeam, PLANS, productPlan, type Period, type PlanId } from '@/lib/subscription';
import { userError } from '@/lib/user-errors';
import { space } from '@/theme/tokens';

const TERMS = process.env.EXPO_PUBLIC_TERMS_URL;
const PRIVACY = process.env.EXPO_PUBLIC_PRIVACY_URL;

/**
 * KILN's plans by team size, monthly or yearly, each starting with 14 days free (the store takes the
 * card now and charges on day 15). Only the owner subscribes; the plan that fits the team is picked,
 * and smaller ones can't be chosen. The server checks the purchase with RevenueCat before anything unlocks.
 */
export default function Subscribe() {
  const { t } = useLang();
  const auth = useAuth();
  const { sub, syncStore } = useSubscription();
  const owner = (sub?.role ?? auth.role) === 'owner';
  const businessId = auth.businessId;
  const canBuy = Platform.OS !== 'web' && storeReady() && owner && !!businessId;
  const [period, setPeriod] = useState<Period>('monthly');
  const [plans, setPlans] = useState<StorePlan[] | null>(null);
  const [picked, setPicked] = useState<PlanId | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: Tone } | null>(null);

  useEffect(() => {
    if (!canBuy || !businessId) return;
    let live = true;
    loadPlans(businessId)
      .then((found) => { if (live) setPlans(found); })
      .catch((e) => { if (live) setMessage({ text: userError(t, e), tone: 'danger' }); });
    return () => { live = false; };
  }, [canBuy, businessId, t]);

  const teamSize = Math.max(sub?.teamSize ?? 1, 1);
  const choice = picked ?? planForTeam(teamSize).id;
  const current = productPlan(sub?.productId);
  const paid = !!sub && (sub.status === 'trial' || sub.status === 'active' || sub.status === 'grace');
  const storePlan = (plan: PlanId) => plans?.find((p) => p.plan === plan && p.period === period) ?? null;
  const chosen = storePlan(choice);
  const chosenIsCurrent = paid && current?.plan === choice && current.period === period;
  const per = period === 'monthly' ? t('sub.month') : t('sub.year');

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try { await work(); }
    catch (e) { setMessage({ text: userError(t, e), tone: 'danger' }); }
    finally { setBusy(false); }
  };

  const start = () => run(async () => {
    if (!chosen || !businessId) return;
    if (await buy(businessId, chosen, paid ? sub?.productId ?? null : null) === 'cancelled') return;
    const now = await syncStore();
    if (now?.hasAccess) router.replace('/' as Href);
  });

  const restoreNow = () => run(async () => {
    if (!businessId) return;
    const found = await restore(businessId);
    await syncStore();
    setMessage(found ? { text: t('sub.restored'), tone: 'soft' } : { text: t('sub.nothingToRestore'), tone: 'flag' });
  });

  return (
    <Screen header={<PageHeader title={t('sub.title')} back={router.canGoBack() ? () => router.back() : undefined} />}>
      <T>{t('sub.pitch')}</T>
      <T muted>{t('sub.trial')}</T>

      {Platform.OS === 'web' ? <Notice text={t('sub.phoneOnly')} icon="smartphone" tone="soft" />
        : !owner ? <Notice text={t('sub.ownerOnly')} icon="info" tone="soft" />
        : !storeReady() ? <Notice text={t('sub.notReady')} icon="info" tone="soft" />
        : null}

      <Segmented label={t('sub.title')} value={period} onChange={setPeriod}
        options={[{ key: 'monthly', label: t('sub.monthly') }, { key: 'yearly', label: t('sub.yearly') }]} />
      <T v="small" muted>{t('sub.teamNow', { count: teamSize })}</T>

      {PLANS.map((plan, i) => {
        const fit = fits(plan, teamSize);
        const price = storePlan(plan.id)?.price;
        const isCurrent = paid && current?.plan === plan.id && current.period === period;
        return (
          <Card key={plan.id} tone={choice === plan.id ? 'accent' : 'plain'} label={t(`sub.plan${i + 1}` as 'sub.plan1')}
            onPress={fit && canBuy ? () => setPicked(plan.id) : undefined} style={{ opacity: fit ? 1 : 0.5, gap: 4 }}>
            <T v="h3">{t(`sub.plan${i + 1}` as 'sub.plan1')}</T>
            {price ? <T v="label">{`${price} / ${per}`}</T> : null}
            {isCurrent ? <T v="small">{t('sub.current')}</T> : !fit ? <T v="small">{t('sub.tooSmall')}</T> : null}
          </Card>
        );
      })}

      {canBuy ? <>
        {chosen && !paid ? <T v="small" muted>{t('sub.afterTrial', { price: chosen.price, period: per })}</T> : null}
        <Button label={busy ? t('sub.working') : paid ? t('sub.change') : t('sub.start')} icon="check" big
          disabled={busy || !chosen || chosenIsCurrent} onPress={() => void start()} />
        <Button label={t('sub.restore')} variant="outline" disabled={busy} onPress={() => void restoreNow()} />
        {paid && (sub?.store === 'apple' || sub?.store === 'google') ? (
          <Button label={t('sub.manage')} variant="ghost" disabled={busy} onPress={() => void run(() => manage(businessId!))} />
        ) : null}
      </> : null}

      {message ? <Notice text={message.text} tone={message.tone} icon={message.tone === 'danger' ? 'alert-circle' : 'info'} /> : null}

      {TERMS || PRIVACY ? (
        <View style={{ flexDirection: 'row', gap: space.lg, justifyContent: 'center' }}>
          {TERMS ? <Button label={t('sub.terms')} variant="ghost" onPress={() => void Linking.openURL(TERMS)} /> : null}
          {PRIVACY ? <Button label={t('sub.privacy')} variant="ghost" onPress={() => void Linking.openURL(PRIVACY)} /> : null}
        </View>
      ) : null}
      {!router.canGoBack() ? <Button label={t('lock.signOut')} variant="ghost" onPress={() => void auth.signOut().catch(() => {})} /> : null}
    </Screen>
  );
}
