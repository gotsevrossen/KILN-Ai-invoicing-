import { router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';

import { DueDaysPicker, PercentRow } from '@/components/settings-rows';
import { Button, Card, Hair, Notice, PageHeader, Screen, SwitchRow, T } from '@/components/ui';
import { PayFailed } from '@/data/db-pay';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';

export default function PaymentSettings() {
  const { t } = useLang();
  const { state, actions } = useStore();
  const s = state.settings;
  const connected = state.mode === 'connected';
  const { online } = state;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reason = (e: unknown) => t(`payErrors.${e instanceof PayFailed ? e.code : 'failed'}`);

  // coming back from Stripe's page (or opening this screen) asks Stripe what's ready now
  const { checkStripe } = actions;
  useFocusEffect(useCallback(() => {
    if (!connected) return;
    checkStripe().catch(() => {});
  }, [connected, checkStripe]));

  const setUp = async () => {
    setError(null);
    setBusy(true);
    try {
      await WebBrowser.openBrowserAsync(await actions.stripeSetupUrl());
      await actions.checkStripe();
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
      await actions.checkStripe();
    } catch (e) {
      setError(t('online.failed', { reason: reason(e) }));
    } finally {
      setBusy(false);
    }
  };

  const ready = [online.walletReady ? t('online.wallet') : null, online.bankReady ? t('online.bank') : null].filter((x): x is string => !!x);
  const status = !online.connected ? t('online.notSetUp')
    : ready.length === 2 ? t('online.ready', { what: t('online.and', { a: ready[0], b: ready[1] }) })
      : ready.length === 1 ? t('online.ready', { what: ready[0] }) : t('online.waiting');

  return (
    <Screen header={<PageHeader title={t('settings.payments')} back={() => router.back()} />}>
      <Card style={{ gap: 12 }}>
        <T v="h3">{t('online.title')}</T>
        <T v="small" muted>{t('online.help')}</T>
        {connected ? (
          <>
            <T v="label">{status}</T>
            {ready.length < 2 ? (
              <Button label={online.connected ? t('online.finish') : t('online.setUp')} icon="external-link" disabled={busy} onPress={setUp} />
            ) : null}
            {online.connected ? <Button label={t('online.check')} icon="refresh-cw" variant="outline" disabled={busy} onPress={check} /> : null}
            {error ? <Notice text={error} tone="danger" icon="alert-circle" /> : null}
          </>
        ) : (
          <T v="label">{t('online.signIn')}</T>
        )}
        <T v="small" muted>{t('online.cash')}</T>
      </Card>
      <Card style={{ gap: 14 }}>
        <DueDaysPicker days={s.dueDays} onChange={(dueDays) => actions.updateSettings({ dueDays })} />
        <Hair />
        <PercentRow label={t('settings.deposit')} help={t('settings.depositHelp')} bps={s.depositBps} onChange={(depositBps) => actions.updateSettings({ depositBps })} />
        <Hair />
        <SwitchRow label={t('settings.cardFee')} help={t('settings.cardFeeHelp')} value={state.cardFee} onChange={actions.setCardFee} />
      </Card>
    </Screen>
  );
}
