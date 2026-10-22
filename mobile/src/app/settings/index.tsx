import { router } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { PriceListEditor } from '@/components/price-list-editor';
import { Button, Card, Chip, Hair, Notice, PageHeader, Row, Screen, Segmented, SwitchRow, T } from '@/components/ui';
import { useAuth } from '@/data/auth';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { font, radius, tap } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

const DUE_CHOICES = [0, 7, 15, 30];

/** "7.25" -> 725 bps. 0 to 100, up to two decimals; else null. */
function parsePercent(text: string): number | null {
  const s = text.trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n >= 0 && n <= 100 ? Math.round(n * 100) : null;
}

/** A labeled percent box. Saves as soon as the number is valid. */
function PercentRow({ label, help, bps, onChange }: { label: string; help?: string; bps: number; onChange: (bps: number) => void }) {
  const p = usePalette();
  const { t } = useLang();
  const [text, setText] = useState(String(bps / 100));
  const bad = parsePercent(text) === null;
  return (
    <View style={{ gap: 6 }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }} gap={12}>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="label" style={{ fontSize: 16 }}>{label}</T>
          {help ? <T v="small" muted>{help}</T> : null}
        </View>
        <Row gap={6}>
          <TextInput
            value={text}
            onChangeText={(v) => {
              setText(v);
              const next = parsePercent(v);
              if (next !== null) onChange(next);
            }}
            keyboardType="decimal-pad"
            accessibilityLabel={label}
            selectTextOnFocus
            style={{ width: 84, minHeight: tap.min, borderRadius: radius.xs, backgroundColor: p.ground, textAlign: 'right', paddingHorizontal: 12, fontFamily: font.bold, fontSize: 18, color: p.ink }}
          />
          <T v="h3">%</T>
        </Row>
      </Row>
      {bad ? <T v="small" color={p.danger}>{t('settings.percentBad')}</T> : null}
    </View>
  );
}

export default function Settings() {
  const { t, lang, setLang } = useLang();
  const { state, actions } = useStore();
  const auth = useAuth();
  const s = state.settings;

  return (
    <Screen
      header={
        <PageHeader title={t('settings.title')} back={() => router.back()} />
      }>

      <Card style={{ gap: 12 }}>
        <T v="eyebrow">{t('settings.language')}</T>
        <Segmented
          label={t('settings.language')}
          value={lang}
          onChange={setLang}
          options={[
            { key: 'en', label: 'English' },
            { key: 'es', label: 'Español' },
          ]}
        />
        <T v="small" muted>{t('settings.languageHelp')}</T>
      </Card>

      <Card style={{ gap: 14 }}>
        <T v="eyebrow">{t('settings.pricing')}</T>
        <PercentRow label={t('settings.markup')} help={t('settings.markupHelp')} bps={s.markupBps} onChange={(markupBps) => actions.updateSettings({ markupBps })} />
        <Hair />
        <PercentRow label={t('settings.taxRate')} bps={s.tax.rateBps} onChange={(rateBps) => actions.updateSettings({ tax: { ...s.tax, rateBps } })} />
        <SwitchRow label={t('settings.taxLabor')} value={s.tax.labor} onChange={(labor) => actions.updateSettings({ tax: { ...s.tax, labor } })} />
        <SwitchRow label={t('settings.taxMaterials')} help={t('settings.taxMaterialsHelp')} value={s.tax.materials} onChange={(materials) => actions.updateSettings({ tax: { ...s.tax, materials } })} />
        <Hair />
        <PercentRow label={t('settings.deposit')} help={t('settings.depositHelp')} bps={s.depositBps} onChange={(depositBps) => actions.updateSettings({ depositBps })} />
        <Hair />
        <T v="label" style={{ fontSize: 16 }}>{t('settings.due')}</T>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {DUE_CHOICES.map((days) => (
            <Chip
              key={days}
              label={days === 0 ? t('settings.dueOnReceipt') : t('settings.dueDays', { days })}
              selected={s.dueDays === days}
              onPress={() => actions.updateSettings({ dueDays: days })}
            />
          ))}
        </Row>
      </Card>

      <Card style={{ gap: 8 }}>
        <T v="eyebrow">{t('settings.payments')}</T>
        <SwitchRow label={t('settings.cardFee')} help={t('settings.cardFeeHelp')} value={state.cardFee} onChange={actions.setCardFee} />
      </Card>

      <Card style={{ gap: 12 }}>
        <T v="eyebrow">{t('settings.priceList')}</T>
        <PriceListEditor items={state.priceList} onChange={actions.setPrice} />
      </Card>

      <Card style={{ gap: 8 }}>
        <T v="eyebrow">{t('settings.business')}</T>
        <T v="h3">{state.profile.businessName}</T>
        {state.profile.phone ? <T v="small" muted>{state.profile.phone}</T> : null}
        <T v="small" muted>
          {t('settings.trades')}: {state.profile.trades.map((id) => t(`trades.${id}`)).join(', ')}
        </T>
        {auth.configured ? (
          <Button label={t('auth.signOut')} icon="log-out" variant="outline" onPress={() => auth.signOut().then(() => router.replace('/sign-in'))} />
        ) : (
          <Button
            label={t('settings.redoSetup')}
            icon="refresh-cw"
            variant="outline"
            onPress={() => {
              actions.redoSetup();
              router.replace('/setup');
            }}
          />
        )}
      </Card>

      <Hair />
      <Notice text={t('settings.about')} icon="info" tone="soft" />
    </Screen>
  );
}
