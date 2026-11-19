import { router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';

import { DueDaysPicker, PercentRow } from '@/components/settings-rows';
import { Button, Card, Field, Hair, LineRow, Notice, PageHeader, Screen, SwitchRow, T } from '@/components/ui';
import { useAuth } from '@/data/auth';
import { PayFailed, type OnlinePay } from '@/data/db-pay';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { alternativeMethods, invoicePaymentCopy, type AlternativeMethods } from '@/lib/invoice-payment';
import { userError } from '@/lib/user-errors';

export default function PaymentSettings() {
  const { t, lang } = useLang();
  const c = invoicePaymentCopy[lang];
  const auth = useAuth();
  const { state, actions } = useStore();
  const s = state.settings;
  const connected = state.mode === 'connected';
  const editable = !connected || auth.role === 'owner';
  const businessId = state.businessId;
  const [checked, setChecked] = useState<{ businessId: string | null; value: OnlinePay } | null>(null);
  const online = checked?.businessId === businessId ? checked.value : state.online;
  const checkVersion = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reason = (e: unknown) => e instanceof PayFailed ? t(`payErrors.${e.code}`) : userError(t, e);

  // coming back from Stripe's page (or opening this screen) asks Stripe what's ready now
  const { checkStripe } = actions;
  const refresh = useCallback(async (recheck = false) => {
    const version = ++checkVersion.current;
    const result = await checkStripe(recheck);
    if (result && version === checkVersion.current) setChecked({ businessId, value: result });
  }, [businessId, checkStripe]);
  useFocusEffect(useCallback(() => {
    if (!connected || !editable) return;
    refresh().catch((e: unknown) => setError(t('online.failed', { reason: e instanceof PayFailed ? t(`payErrors.${e.code}`) : userError(t, e) })));
  }, [connected, editable, refresh, t]));

  const setUp = async () => {
    setError(null);
    setBusy(true);
    try {
      await WebBrowser.openBrowserAsync(await actions.stripeSetupUrl());
      await refresh();
    } catch (e) {
      setError(t('online.failed', { reason: reason(e) }));
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    setError(null);
    setBusy(true);
    try {
      await refresh(true);
    } catch (e) {
      setError(t('online.failed', { reason: reason(e) }));
    } finally {
      setBusy(false);
    }
  };

  const status = online.configured === false ? t('online.serverOff')
    : !online.connected ? t('online.notSetUp')
    : online.cardReady || online.bankReady ? t('online.ready', { what: c.stripe })
    : online.testMode && online.checkoutEnabled === false ? t('online.sandboxOff') : t('online.waiting');
  const walletStatus = (ready?: boolean) => t(online.walletCheckFailed || ready === undefined ? 'online.unverified' :
    online.testMode && online.checkoutEnabled === false ? 'online.sandboxOff' : ready ? 'online.methodReady' : 'online.methodUnavailable');

  if (!editable) return <Screen header={<PageHeader title={t('settings.payments')} back={() => router.back()} />}><Notice text={c.askOwner} /></Screen>;
  return (
    <Screen header={<PageHeader title={t('settings.payments')} back={() => router.back()} />}>
      <Card style={{ gap: 12 }}>
        <T v="h3">{t('online.title')}</T>
        <T v="small" muted>{t('online.help')}</T>
        {connected ? (
          <>
            <T v="label">{status}</T>
            {online.testMode ? <Notice text={c.test} tone="flag" /> : null}
            {online.connected ? <>
              <LineRow label="Apple Pay" value={walletStatus(online.applePayReady)} />
              <LineRow label="Google Pay" value={walletStatus(online.googlePayReady)} />
              {!online.testMode && online.payoutsReady !== undefined ?
                <LineRow label={t('online.payouts')} value={t(online.payoutsReady ? 'online.methodReady' : 'online.methodUnavailable')} /> : null}
              {online.walletDomain ? <T v="small" muted>{t('online.walletDomain', { host: online.walletDomain })}</T> : null}
              {online.walletCheckFailed ? <Notice text={t('online.walletCheckFailed')} tone="flag" /> : null}
              {!online.testMode && online.payoutsReady === false ? <Notice text={t('online.payoutRequired')} tone="flag" /> : null}
              {online.testMode && online.checkoutEnabled === false ? <Notice text={t('online.sandboxOffHelp')} tone="soft" /> : null}
              {online.walletDomainEnabled === false && online.checkoutEnabled && !online.walletCheckFailed && online.cardReady
                ? <Notice text={t('online.walletDomainDisabled')} tone="flag" /> : null}
            </> : null}
            {online.configured !== false && (!online.connected || (!online.testMode && online.payoutsReady === false)
              || (!online.cardReady && online.checkoutEnabled !== false)) ? (
              <Button label={online.connected ? t('online.finish') : t('online.setUp')} icon="external-link" disabled={busy} onPress={setUp} />
            ) : null}
            {online.connected || online.configured === false ? <Button label={t('online.check')} icon="refresh-cw" variant="outline" disabled={busy} onPress={check} /> : null}
            {error ? <Notice text={error} tone="danger" icon="alert-circle" /> : null}
          </>
        ) : (
          <T v="label">{t('online.signIn')}</T>
        )}
      </Card>
      <AlternativeSettings key={state.businessId ?? state.mode} />
      <Card style={{ gap: 14 }}>
        <DueDaysPicker days={s.dueDays} onChange={(dueDays) => actions.updateSettings({ dueDays })} />
        <Hair />
        <PercentRow label={t('settings.deposit')} bps={s.depositBps} onChange={(depositBps) => actions.updateSettings({ depositBps })} />
      </Card>
    </Screen>
  );
}

function AlternativeSettings() {
  const { t, lang } = useLang();
  const c = invoicePaymentCopy[lang];
  const { state, actions } = useStore();
  const saved = state.settings.alternativeMethods ?? {};
  const [draft, setDraft] = useState<AlternativeMethods | null>(null);
  const methods = draft ?? saved;
  return <Card style={{ gap: 10 }}>
    <T v="h3">{c.settingsTitle}</T>
    <T v="small" muted>{c.settingsHelp}</T>
    <View>
      {alternativeMethods.map((method, index) => (
        <View key={method}>
          {index > 0 ? <Hair /> : null}
          <SwitchRow label={c.methods[method]} value={methods[method] !== undefined} onChange={(enabled) => {
            const next = { ...methods };
            if (enabled) next[method] = ''; else delete next[method];
            setDraft(next);
          }} />
          {methods[method] !== undefined ? <View style={{ paddingBottom: 10 }}>
            <Field label={c.instructions} value={methods[method]} maxLength={240}
              onChangeText={(text) => setDraft({ ...methods, [method]: text })} />
          </View> : null}
        </View>
      ))}
    </View>
    <Button label={t('common.save')} disabled={!draft} onPress={() => {
      if (draft) actions.setAlternativeMethods(Object.fromEntries(Object.entries(draft).map(([key, text]) => [key, text.trim()])));
      setDraft(null);
    }} />
  </Card>;
}
