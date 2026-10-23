import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { aiErrorText } from '@/components/ai-parts';
import { parseDollars } from '@/components/estimate-parts';
import { RecordGate } from '@/components/record-gate';
import { Button, ButtonRow, Card, Chip, Field, Hair, IconButton, ListRow, Notice, PageHeader, Pill, Row, Screen, T } from '@/components/ui';
import { aiReady, scanReceipt, type ScannedReceipt } from '@/data/ai';
import * as sample from '@/data/sample';
import { hasJob, jobById, unsortedItems } from '@/data/selectors';
import { useStore } from '@/data/store';
import { useLang, type Lang } from '@/i18n';
import { addDays, useFormat } from '@/lib/format';
import { pickPhotos } from '@/lib/photo-pick';
import { usePalette } from '@/theme/use-palette';

/** "10/20/2026" (English) or "20/10/2026" (Spanish) to "2026-10-20". Null if it isn't a real day. */
function parseDay(text: string, lang: Lang): string | null {
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text.trim());
  if (!m) return null;
  const [month, day] = lang === 'es' ? [Number(m[2]), Number(m[1])] : [Number(m[1]), Number(m[2])];
  const iso = `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

/** "2026-10-20" back to how the owner types it: 10/20/2026, or 20/10/2026 in Spanish. */
function typedDay(iso: string, lang: Lang): string {
  const [y, m, d] = iso.split('-').map(Number);
  return lang === 'es' ? `${d}/${m}/${y}` : `${m}/${d}/${y}`;
}

type Day = 'today' | 'yesterday' | 'other';
/** `unclear`: KILN couldn't read this line well from the photo. Cleared once the owner edits it. */
interface Line { key: number; name: string; price: string; unclear?: boolean }

/**
 * A receipt, scanned from a photo (KILN fills in the form; the owner checks it) or typed in by hand.
 * From a job, every item goes to that job; from Capture, the items go to the Inbox and the
 * sorting page opens next. KILN never guesses which job an item is for.
 */
function NewReceipt() {
  const p = usePalette();
  const { t, lang } = useLang();
  const f = useFormat();
  const { state, actions } = useStore();
  const { job: jobId } = useLocalSearchParams<{ job?: string }>();
  const job = jobId ? jobById(jobId) : null;

  const [store, setStore] = useState('');
  const [number, setNumber] = useState('');
  const [day, setDay] = useState<Day>('today');
  const [dayText, setDayText] = useState('');
  const [lines, setLines] = useState<Line[]>([{ key: 1, name: '', price: '' }]);
  const [tax, setTax] = useState('');

  const date = day === 'today' ? sample.TODAY : day === 'yesterday' ? addDays(sample.TODAY, -1) : parseDay(dayText, lang);
  const dateBad = day === 'other' && dayText.trim().length > 0 && (date === null || date > sample.TODAY);
  const priced = lines.map((l) => ({ name: l.name.trim(), cents: parseDollars(l.price) }));
  // a line left completely empty is skipped, so an extra blank row doesn't block saving
  const filled = priced.filter((l, i) => l.name || lines[i].price.trim());
  const taxCents = tax.trim() ? parseDollars(tax) : 0;
  const priceBad = lines.some((l) => l.price.trim() && parseDollars(l.price) === null) || taxCents === null;
  const ready = !!store.trim() && date !== null && !dateBad && filled.length > 0 && !priceBad &&
    filled.every((l) => l.name && l.cents !== null);
  const total = filled.reduce((a, l) => a + (l.cents ?? 0), 0) + (taxCents ?? 0);
  const waiting = sample.receipts.reduce((a, r) => a + unsortedItems(state, r).length, 0);
  const firstWaiting = sample.receipts.find((r) => unsortedItems(state, r).length > 0);

  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch, unclear: false } : l)));

  // scanning: the photo fills in the form below, then everything is checked like a typed receipt
  const canScan = aiReady(state.mode);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scannedTotal, setScannedTotal] = useState<number | null | undefined>(undefined);
  const fill = (r: ScannedReceipt) => {
    if (r.store) setStore(r.store);
    if (r.number) setNumber(r.number);
    const yesterday = addDays(sample.TODAY, -1);
    if (r.date === sample.TODAY) setDay('today');
    else if (r.date === yesterday) setDay('yesterday');
    else if (r.date && r.date < sample.TODAY) {
      setDay('other');
      setDayText(typedDay(r.date, lang));
    }
    if (r.items.length) {
      setLines(r.items.map((item, i) => ({ key: i + 1, name: item.name, price: (item.costCents / 100).toFixed(2), unclear: item.unclear })));
    }
    setTax(r.taxCents ? (r.taxCents / 100).toFixed(2) : '');
    setScannedTotal(r.totalCents);
  };
  const scan = async (camera: boolean) => {
    setScanError(null);
    // a long receipt can take two photos from the library
    const picked = await pickPhotos(camera, camera ? 1 : 2);
    if (picked.problem) setScanError(t(picked.problem === 'denied' ? 'ai.cameraDenied' : 'ai.photoTooBig'));
    if (!picked.photos.length) return;
    setScanning(true);
    scanReceipt(picked.photos.map(({ mediaType, data }) => ({ mediaType, data })))
      .then(fill, (e: unknown) => setScanError(aiErrorText(t, e)))
      .finally(() => setScanning(false));
  };
  const mismatch = typeof scannedTotal === 'number' && total !== scannedTotal;

  const save = () => {
    if (!ready || date === null || taxCents === null) return;
    const id = actions.addReceipt({
      store, number, date, taxCents,
      items: filled.map((l) => ({ name: l.name, costCents: l.cents ?? 0 })),
    }, job?.id ?? null);
    if (!id) return;
    if (job) router.back();
    else router.replace(`/receipt/${id}`);
  };

  return (
    <Screen
      header={<PageHeader title={t('newReceipt.title')} sub={job?.title} back={() => router.back()} />}
      footer={<Button label={t('newReceipt.save')} icon="check" big disabled={!ready} onPress={save} />}>
      {!job && firstWaiting ? (
        <Card style={{ paddingVertical: 6 }}>
          <ListRow icon="inbox" iconTone="flag" title={t('newReceipt.waiting', { count: waiting })} onPress={() => router.push(`/receipt/${firstWaiting.id}`)} />
        </Card>
      ) : null}
      {canScan ? (
        <Card style={{ gap: 12 }}>
          <T v="eyebrow">{t('ai.scanTitle')}</T>
          <ButtonRow gap={10}>
            <Button label={t('ai.takePhoto')} icon="camera" variant="dark" flex disabled={scanning} onPress={() => scan(true)} />
            <Button label={t('ai.choosePhoto')} icon="image" variant="outline" flex disabled={scanning} onPress={() => scan(false)} />
          </ButtonRow>
          <T v="small" muted>{scanning ? t('ai.scanning') : t('ai.scanHelp')}</T>
          {scanError ? <T v="small" color={p.danger}>{scanError}</T> : null}
        </Card>
      ) : <Notice text={t('newReceipt.scanSoon')} icon="info" tone="soft" />}
      {scannedTotal !== undefined ? <Notice text={t('ai.scanned')} icon="info" tone="flag" /> : null}

      <Card style={{ gap: 14 }}>
        <Field label={t('newReceipt.store')} value={store} onChangeText={setStore} placeholder={t('newReceipt.storePlaceholder')}
          autoCapitalize="words" maxLength={120} />
        <T v="label">{t('newReceipt.date')}</T>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {(['today', 'yesterday', 'other'] as const).map((d) => (
            <Chip key={d} label={t(`newReceipt.${d === 'other' ? 'otherDay' : d}`)} selected={day === d} onPress={() => setDay(d)} />
          ))}
        </Row>
        {day === 'other' ? (
          <>
            <Field value={dayText} onChangeText={setDayText} placeholder={t('newReceipt.datePlaceholder')}
              accessibilityLabel={t('newReceipt.date')} keyboardType="numbers-and-punctuation" maxLength={10} autoFocus />
            {dateBad ? <T v="small" color={p.danger}>{t('newReceipt.dateBad')}</T> : null}
          </>
        ) : null}
        <Field label={t('newReceipt.number')} value={number} onChangeText={setNumber} maxLength={60} autoCapitalize="none" />
      </Card>

      <T v="eyebrow" style={{ marginTop: 8 }}>{t('newReceipt.items')}</T>
      <Card style={{ gap: 14 }}>
        {lines.map((line, i) => (
          <View key={line.key} style={{ gap: 10 }}>
            {i ? <Hair /> : null}
            <Row gap={8} style={{ alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                {line.unclear ? <Pill label={t('ai.unclear')} tone="flag" /> : null}
                <Field label={t('newReceipt.item', { n: i + 1 })} value={line.name} onChangeText={(name) => setLine(line.key, { name })}
                  placeholder={t('newReceipt.itemPlaceholder')} autoCapitalize="sentences" maxLength={160} />
              </View>
              {lines.length > 1 ? (
                <IconButton icon="trash-2" label={t('newReceipt.removeItem', { n: i + 1 })}
                  onPress={() => setLines((ls) => ls.filter((l) => l.key !== line.key))} />
              ) : null}
            </Row>
            <Field label={t('newReceipt.itemPrice')} value={line.price} onChangeText={(price) => setLine(line.key, { price })}
              placeholder="0.00" keyboardType="decimal-pad" />
          </View>
        ))}
        <Button label={t('newReceipt.addItem')} icon="plus" variant="outline"
          onPress={() => setLines((ls) => [...ls, { key: Math.max(...ls.map((l) => l.key)) + 1, name: '', price: '' }])} />
      </Card>

      <Card style={{ gap: 10 }}>
        <Field label={t('newReceipt.tax')} value={tax} onChangeText={setTax} placeholder="0.00" keyboardType="decimal-pad" />
        {priceBad ? <T v="small" color={p.danger}>{t('newReceipt.priceBad')}</T> : null}
        <Hair />
        <T v="money" style={{ fontSize: 19 }}>{t('newReceipt.total', { amount: f.money(total) })}</T>
        {mismatch ? <Notice text={t('ai.scanMismatch', { sum: f.money(total), total: f.money(scannedTotal) })} icon="alert-triangle" tone="flag" /> : null}
      </Card>

      <Notice text={job ? t('newReceipt.goesTo', { job: job.title }) : t('newReceipt.goesToInbox')} icon={job ? 'briefcase' : 'inbox'} tone="soft" />
      {!ready && (store.trim() || filled.length > 0) ? <T v="small" muted>{t('newReceipt.needMore')}</T> : null}
    </Screen>
  );
}

/** From a job link, waits for the job to load (a link or refresh can arrive first) instead of crashing. */
export default function NewReceiptRoute() {
  const { job } = useLocalSearchParams<{ job?: string }>();
  return <RecordGate found={() => !job || hasJob(job)}><NewReceipt /></RecordGate>;
}
