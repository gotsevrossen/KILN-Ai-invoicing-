import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { PriceListEditor } from '@/components/price-list-editor';
import { TradePicker } from '@/components/trade-picker';
import { Button, Field, IconButton, Notice, Row, Screen, Segmented, T } from '@/components/ui';
import { useAuth } from '@/data/auth';
import { useStore } from '@/data/store';
import { ITEM_UNITS, starterItemIds, suggestedPricing, type TradeId } from '@/data/trades';
import type { PriceItem } from '@/data/types';
import { useLang } from '@/i18n';
import { radius } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

const STEPS = 4;

function parseDollars(text: string): number | null {
  const s = text.replace(/[$,\s]/g, '');
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(s)) return null;
  const n = Math.round(Number(s) * 100);
  return n > 0 ? n : null;
}

/** First-run setup: who you are, what work you do, how you charge, your prices. */
export default function Setup() {
  const p = usePalette();
  const { t, lang, setLang } = useLang();
  const { state, actions } = useStore();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [trades, setTrades] = useState<TradeId[]>([]);
  const [pricing, setPricing] = useState<'hourly' | 'flat'>(state.profile.pricing);
  const [rateText, setRateText] = useState((state.profile.rateCents / 100).toFixed(0));
  const [items, setItems] = useState<PriceItem[]>([]);
  const rateCents = parseDollars(rateText);
  const auth = useAuth();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const toggleTrade = (id: TradeId) => setTrades((ts) => (ts.includes(id) ? ts.filter((x) => x !== id) : [...ts, id]));

  /** The starter price list for the chosen trades, keeping any price the owner already has. */
  const buildItems = (): PriceItem[] => {
    const have = new Map(state.priceList.map((i) => [i.id, i]));
    const starter = starterItemIds(trades).map((id) => ({
      id,
      name: have.get(id)?.name ?? t(`items.${id}` as `items.trip`),
      unit: ITEM_UNITS[id],
      unitCents: have.get(id)?.unitCents ?? (id === 'labor' && pricing === 'hourly' ? rateCents : null),
    }));
    // keep the owner's own custom items too
    const custom = state.priceList.filter((i) => !(i.id in ITEM_UNITS));
    return [...starter, ...custom];
  };

  const canNext = [name.trim().length > 1, trades.length > 0, pricing === 'flat' || rateCents !== null, true][step];

  const next = () => {
    if (step === 1) setPricing(suggestedPricing(trades));
    if (step === 2) setItems(buildItems());
    if (step < STEPS - 1) {
      setStep(step + 1);
      return;
    }
    setSaving(true);
    setSaveError(null);
    actions
      .completeSetup({ businessName: name, phone, trades, pricing, rateCents: rateCents ?? state.profile.rateCents, priceList: items })
      .then(() => router.replace('/'))
      .catch((e: unknown) => setSaveError(e instanceof Error ? e.message : String(e)))
      .finally(() => setSaving(false));
  };

  return (
    <Screen
      header={
        <View style={{ gap: 10 }}>
          <Row style={{ justifyContent: 'space-between', minHeight: 48 }}>
            {step > 0 ? <IconButton icon="chevron-left" label={t('setup.back')} onPress={() => setStep(step - 1)} /> : <View />}
            <T v="small" muted>{t('setup.stepOf', { n: step + 1, total: STEPS })}</T>
          </Row>
          <View accessible accessibilityRole="progressbar" accessibilityLabel={t('setup.stepOf', { n: step + 1, total: STEPS })} style={{ flexDirection: 'row', gap: 6 }}>
            {Array.from({ length: STEPS }, (_, i) => (
              <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i <= step ? p.accent : p.line }} />
            ))}
          </View>
        </View>
      }
      footer={
        <>
          {saveError ? <Notice text={t('auth.setupFailed', { reason: saveError })} tone="danger" icon="alert-circle" /> : null}
          <Button label={saving ? t('auth.saving') : step === STEPS - 1 ? t('setup.finish') : t('setup.next')} icon={step === STEPS - 1 ? 'check' : 'arrow-right'} big disabled={!canNext || saving} onPress={next} />
          {step === 0 && !auth.configured ? (
            <Button
              label={t('setup.skip')}
              variant="outline"
              onPress={() => {
                actions.skipSetup();
                router.replace('/');
              }}
            />
          ) : null}
        </>
      }>
      {step === 0 ? (
        <>
          <T v="title">{t('setup.welcome')}</T>
          <T v="body" muted>{t('setup.welcomeBody')}</T>
          <T v="label">{t('setup.language')}</T>
          <Segmented
            label={t('setup.language')}
            value={lang}
            onChange={setLang}
            options={[
              { key: 'en', label: 'English' },
              { key: 'es', label: 'Español' },
            ]}
          />
          <Field label={t('setup.businessName')} value={name} onChangeText={setName} placeholder={t('setup.businessPlaceholder')} autoCapitalize="words" />
          <Field label={t('setup.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
        </>
      ) : null}

      {step === 1 ? (
        <>
          <T v="title">{t('setup.tradesTitle')}</T>
          <T v="body" muted>{t('setup.tradesBody')}</T>
          <TradePicker value={trades} onToggle={toggleTrade} />
        </>
      ) : null}

      {step === 2 ? (
        <>
          <T v="title">{t('setup.pricingTitle')}</T>
          <T v="body" muted>{t('setup.pricingBody')}</T>
          <Segmented
            label={t('setup.pricingTitle')}
            value={pricing}
            onChange={setPricing}
            options={[
              { key: 'hourly', label: t('newJob.hourly') },
              { key: 'flat', label: t('newJob.flat') },
            ]}
          />
          {pricing === 'hourly' ? (
            <View style={{ gap: 6 }}>
              <Field label={t('setup.rate')} value={rateText} onChangeText={setRateText} keyboardType="decimal-pad" placeholder="85" />
              {rateCents === null ? <T v="small" color={p.danger}>{t('estimate.priceBad')}</T> : null}
            </View>
          ) : null}
        </>
      ) : null}

      {step === 3 ? (
        <>
          <T v="title">{t('setup.pricesTitle')}</T>
          <T v="body" muted>{t('setup.pricesBody')}</T>
          <View style={{ backgroundColor: p.card, borderRadius: radius.md, padding: 18 }}>
            <PriceListEditor items={items} onChange={(id, cents) => setItems((all) => all.map((i) => (i.id === id ? { ...i, unitCents: cents } : i)))} />
          </View>
          <T v="small" muted style={{ textAlign: 'center' }}>{t('setup.later')}</T>
        </>
      ) : null}
    </Screen>
  );
}
