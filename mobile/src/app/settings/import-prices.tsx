import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { aiErrorText } from '@/components/ai-parts';
import { Button, ButtonRow, Card, Checkbox, Field, Hair, Notice, PageHeader, Pill, Row, Screen, T } from '@/components/ui';
import { readPrices, type ImportedPrice } from '@/data/ai';
import { useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';
import { pickPhotos, type PickedPhoto } from '@/lib/photo-pick';
import { radius } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

const MAX_PHOTOS = 3;

/**
 * Fills in the price list from the owner's old invoices, estimates, or a price sheet.
 * KILN reads the prices; nothing is saved until the owner checks them and taps Save.
 */
export default function ImportPrices() {
  const p = usePalette();
  const { t } = useLang();
  const f = useFormat();
  const { state, actions } = useStore();
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [text, setText] = useState('');
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<ImportedPrice[] | null>(null);
  const [keep, setKeep] = useState<boolean[]>([]);

  const unitLabel = (u: ImportedPrice['unit']) => (u === 'flat' ? '' : ` / ${t(`estimate.units.${u}`)}`);
  // an item already on the price list with the same name counts as a match too
  const existing = (x: ImportedPrice) => state.priceList.find((i) => i.id === x.matchId) ??
    state.priceList.find((i) => i.name.trim().toLowerCase() === x.name.toLowerCase());

  const addPhotos = async (camera: boolean) => {
    setError(null);
    const picked = await pickPhotos(camera, MAX_PHOTOS - photos.length);
    if (picked.problem) setError(t(picked.problem === 'denied' ? 'ai.cameraDenied' : 'ai.photoTooBig'));
    setPhotos((ps) => [...ps, ...picked.photos].slice(0, MAX_PHOTOS));
  };

  const read = () => {
    setReading(true);
    setError(null);
    readPrices({
      text: text.slice(0, 20000),
      images: photos.map(({ mediaType, data }) => ({ mediaType, data })),
      items: state.priceList.slice(0, 400).map((i) => ({ id: i.id, name: i.name.slice(0, 160), unit: i.unit })),
    })
      .then((prices) => {
        setFound(prices);
        // hard-to-read prices start unchecked
        setKeep(prices.map((x) => !x.unclear));
      }, (e: unknown) => setError(aiErrorText(t, e)))
      .finally(() => setReading(false));
  };

  const startOver = () => {
    setFound(null);
    setKeep([]);
    setPhotos([]);
    setText('');
  };

  const save = () => {
    found?.forEach((x, i) => {
      if (!keep[i]) return;
      const item = existing(x);
      if (item) actions.setPrice(item.id, x.unitCents);
      else actions.addPriceItem(x.name, x.unit, x.unitCents);
    });
    router.back();
  };

  const count = keep.filter(Boolean).length;
  const header = <PageHeader title={t('ai.importTitle')} back={() => router.back()} />;

  if (found) {
    return (
      <Screen header={header} footer={found.length ? (
        <ButtonRow gap={10}>
          <Button label={t('ai.startOver')} variant="outline" onPress={startOver} />
          <Button label={t('ai.save', { count })} icon="check" flex big disabled={count === 0} onPress={save} />
        </ButtonRow>
      ) : <Button label={t('ai.startOver')} big onPress={startOver} />}>
        {found.length ? <>
          <T v="h3">{t('ai.found', { count: found.length })}</T>
          <T v="small" muted>{t('ai.foundHelp')}</T>
          <Card style={{ gap: 4 }}>
            {found.map((x, i) => {
              const item = existing(x);
              const note = !item ? t('ai.newItem')
                : item.unitCents === null ? t('ai.fills', { item: item.name })
                : t('ai.updates', { item: item.name, price: f.money(item.unitCents) });
              return (
                <View key={i} style={{ gap: 4 }}>
                  {i > 0 ? <Hair /> : null}
                  <Checkbox label={`${x.name} · ${f.money(x.unitCents)}${unitLabel(x.unit)}`} value={!!keep[i]}
                    onChange={(v) => setKeep((k) => k.map((old, j) => (j === i ? v : old)))} />
                  <Row gap={8} style={{ paddingLeft: 40, paddingBottom: 6, flexWrap: 'wrap' }}>
                    {x.unclear ? <Pill label={t('ai.unclear')} tone="flag" /> : null}
                    <T v="small" muted style={{ flexShrink: 1 }}>{note}</T>
                  </Row>
                </View>
              );
            })}
          </Card>
        </> : <Notice text={t('ai.foundNone')} tone="soft" icon="info" />}
      </Screen>
    );
  }

  return (
    <Screen header={header} footer={
      <Button label={reading ? t('ai.readingPrices') : t('ai.read')} icon="zap" big
        disabled={reading || (photos.length === 0 && !text.trim())} onPress={read} />
    }>
      <T v="body">{t('ai.importHelp')}</T>
      <Card style={{ gap: 12 }}>
        <ButtonRow gap={10}>
          <Button label={t('ai.takePhoto')} icon="camera" variant="dark" flex disabled={reading || photos.length >= MAX_PHOTOS} onPress={() => addPhotos(true)} />
          <Button label={t('ai.choosePhotos')} icon="image" variant="outline" flex disabled={reading || photos.length >= MAX_PHOTOS} onPress={() => addPhotos(false)} />
        </ButtonRow>
        {photos.length ? <>
          <Row gap={10}>
            {photos.map((photo, i) => (
              <Image key={i} source={{ uri: photo.uri }} contentFit="cover" accessibilityIgnoresInvertColors
                style={{ width: 84, height: 84, borderRadius: radius.xs, backgroundColor: p.ground }} />
            ))}
          </Row>
          <Row gap={10} style={{ justifyContent: 'space-between' }}>
            <T v="small" muted>{t('ai.photoCount', { count: photos.length })}</T>
            <Button label={t('ai.removePhotos')} icon="x" variant="outline" disabled={reading} onPress={() => setPhotos([])} />
          </Row>
        </> : null}
      </Card>
      <Field label={t('ai.pasteLabel')} value={text} onChangeText={setText} placeholder={t('ai.pastePlaceholder')}
        multiline maxLength={20000} editable={!reading} style={{ minHeight: 120, paddingTop: 14, textAlignVertical: 'top' }} />
      {error ? <T v="small" color={p.danger}>{error}</T> : null}
    </Screen>
  );
}
