import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { useLang } from '@/i18n';
import { font, radius, tap } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

import { Chip, Row, T } from './ui';

const DUE_CHOICES = [0, 7, 15, 30];

/** "7.25" -> 725 bps. 0 to 100, up to two decimals; else null. */
function parsePercent(text: string): number | null {
  const s = text.trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n >= 0 && n <= 100 ? Math.round(n * 100) : null;
}

/** "45" -> 45. Whole days, 1 to 365 (the database allows 0 to 365; 0 is "On receipt"); else null. */
function parseDays(text: string): number | null {
  const s = text.trim();
  if (!/^\d{1,3}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= 365 ? n : null;
}

/** The small number box used on settings pages. */
function NumberBox({ value, onChangeText, label, whole }: { value: string; onChangeText: (v: string) => void; label: string; whole?: boolean }) {
  const p = usePalette();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      keyboardType={whole ? 'number-pad' : 'decimal-pad'}
      accessibilityLabel={label}
      selectTextOnFocus
      style={{ width: 84, minHeight: tap.min, borderRadius: radius.xs, backgroundColor: p.ground, textAlign: 'right', paddingHorizontal: 12, fontFamily: font.bold, fontSize: 18, color: p.ink }}
    />
  );
}

/** A labeled percent box. Saves as soon as the number is valid. */
export function PercentRow({ label, help, bps, onChange }: { label: string; help?: string; bps: number; onChange: (bps: number) => void }) {
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
          <NumberBox
            value={text}
            label={label}
            onChangeText={(v) => {
              setText(v);
              const next = parsePercent(v);
              if (next !== null) onChange(next);
            }}
          />
          <T v="h3">%</T>
        </Row>
      </Row>
      {bad ? <T v="small" color={p.danger}>{t('settings.percentBad')}</T> : null}
    </View>
  );
}

/** Payment due: quick choices, or Custom for any number of days. Saves as soon as the number is valid. */
export function DueDaysPicker({ days, onChange }: { days: number; onChange: (days: number) => void }) {
  const p = usePalette();
  const { t } = useLang();
  const [custom, setCustom] = useState(!DUE_CHOICES.includes(days));
  const [text, setText] = useState(DUE_CHOICES.includes(days) ? '' : String(days));
  const bad = custom && text !== '' && parseDays(text) === null;

  return (
    <View style={{ gap: 10 }}>
      <T v="label" style={{ fontSize: 16 }}>{t('settings.due')}</T>
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {DUE_CHOICES.map((d) => (
          <Chip
            key={d}
            label={d === 0 ? t('settings.dueOnReceipt') : t('settings.dueDays', { days: d })}
            selected={!custom && days === d}
            onPress={() => {
              setCustom(false);
              onChange(d);
            }}
          />
        ))}
        <Chip label={t('settings.dueCustom')} selected={custom} onPress={() => setCustom(true)} />
      </Row>
      {custom ? (
        <View style={{ gap: 6 }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center' }} gap={12}>
            <T v="label" style={{ flex: 1, fontSize: 16 }}>{t('settings.dueCustomLabel')}</T>
            <Row gap={6}>
              <NumberBox
                value={text}
                label={t('settings.dueCustomLabel')}
                whole
                onChangeText={(v) => {
                  setText(v);
                  const next = parseDays(v);
                  if (next !== null) onChange(next);
                }}
              />
              <T v="body">{t('settings.dueCustomUnit')}</T>
            </Row>
          </Row>
          {bad ? <T v="small" color={p.danger}>{t('settings.dueCustomBad')}</T> : null}
        </View>
      ) : null}
    </View>
  );
}
