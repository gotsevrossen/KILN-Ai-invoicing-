import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { aiReady, readCommand, type Command } from '@/data/ai';
import { customerOf, jobById, workLocked } from '@/data/selectors';
import { currentState, useStore } from '@/data/store';
import { useLang } from '@/i18n';
import { hoursNotWork } from '@/lib/ai-check';
import { useFormat } from '@/lib/format';
import { lineTotal } from '@/lib/money';
import { usePalette } from '@/theme/use-palette';

import { aiErrorText } from './ai-parts';
import { parseDollars } from './estimate-parts';
import { Sheet } from './sheet';
import { Button, Card, Field, Hair, Notice, Row, T } from './ui';

type Found = Extract<Command, { type: 'work' | 'hours' }> & { key: number; price: string };

const copy = {
  en: {
    title: 'Work in this note', reading: 'KILN is reading your note…', none: 'No work found in this note. It was saved as a note.',
    help: 'KILN found this work in your note. Charge for it, or just list it as done (it shows on the invoice at no charge).',
    charge: 'Charge %{amount}', chargeNoPrice: 'Charge', list: 'Just list it', skip: 'Skip', price: 'Price', hours: '%{hours} h',
    logHours: 'Log %{hours} h', done: 'Done', added: 'Added', listed: 'Listed, no charge', logged: 'Hours logged', needsPrice: 'Type a price to charge for it.',
  },
  es: {
    title: 'Trabajo en esta nota', reading: 'KILN está leyendo tu nota…', none: 'No hay trabajo en esta nota. Se guardó como nota.',
    help: 'KILN encontró este trabajo en tu nota. Cóbralo o solo anótalo como hecho (aparece en la factura sin costo).',
    charge: 'Cobrar %{amount}', chargeNoPrice: 'Cobrar', list: 'Solo anotarlo', skip: 'Omitir', price: 'Precio', hours: '%{hours} h',
    logHours: 'Registrar %{hours} h', done: 'Listo', added: 'Agregado', listed: 'Anotado, sin costo', logged: 'Horas registradas', needsPrice: 'Escribe un precio para cobrarlo.',
  },
};
const fill = (text: string, values: Record<string, string>) => text.replace(/%\{(\w+)\}/g, (_, k: string) => values[k] ?? '');

/**
 * After a note is saved to a job, KILN reads it for work that was done ("I removed the carpet and
 * changed the baseboards") and asks, item by item, whether to charge for it or just list it as
 * done. Nothing is added without a tap. Hours said in the note go to Log hours at the job's rate.
 */
export function NoteWorkSheet({ jobId, text, onClose }: { jobId: string; text: string | null; onClose: () => void }) {
  const p = usePalette();
  const { t, lang } = useLang();
  const k = copy[lang];
  const f = useFormat();
  const { state, actions } = useStore();
  const [rows, setRows] = useState<Found[] | null>(null);
  const [answered, setAnswered] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!text) return;
    let live = true;
    const s = currentState();
    const job = jobById(jobId);
    readCommand({
      lang,
      text: text.slice(0, 1000),
      jobs: [{ id: job.id, title: job.title.slice(0, 200), customer: customerOf(job).name.slice(0, 120), address: job.address.slice(0, 300) }],
      items: s.priceList.slice(0, 400).map((i) => ({ id: i.id, name: i.name.slice(0, 160), unit: i.unit })),
    }).then((found) => {
      if (!live) return;
      const priceOf = (itemId: string | null) => (itemId ? s.priceList.find((i) => i.id === itemId)?.unitCents ?? null : null);
      setRows(hoursNotWork(found, s.priceList).flatMap((c, key): Found[] => {
        if (c.type === 'note') return [];
        if (c.type === 'hours') return [{ ...c, jobId, key, price: '' }];
        const cents = c.unitCents ?? priceOf(c.itemId);
        return [{ ...c, jobId, key, unitCents: cents, price: cents === null ? '' : (cents / 100).toFixed(2) }];
      }));
    }, (e: unknown) => { if (live) setError(aiErrorText(t, e)); });
    return () => { live = false; };
  }, [text, jobId, lang, t]);

  const addWork = (r: Extract<Found, { type: 'work' }>, cents: number) => {
    const item = state.priceList.find((i) => i.id === r.itemId);
    return actions.addWorkItem(jobId, { priceItemId: item?.id, description: r.description, unit: item?.unit ?? 'flat',
      qtyHundredths: r.qtyHundredths, unitCents: cents, kind: r.kind });
  };
  const open = text !== null;
  const left = rows?.filter((r) => !answered[r.key]) ?? [];

  return <Sheet open={open} onClose={onClose} title={k.title}>
    {error ? <Notice text={error} tone="danger" icon="alert-circle" /> : rows === null ? <T muted>{k.reading}</T>
      : rows.length === 0 ? <T muted>{k.none}</T> : <>
        <T v="small" muted>{k.help}</T>
        <Card style={{ gap: 10 }}>
          {rows.map((r, i) => {
            const cents = r.type === 'work' ? parseDollars(r.price) : null;
            return <View key={r.key} style={{ gap: 8 }}>
              {i ? <Hair /> : null}
              {r.type === 'hours' ? <>
                <T v="label">{r.note || fill(k.hours, { hours: f.qty(r.hundredths) })}</T>
                {answered[r.key] ? <T v="small" muted>{answered[r.key]}</T> : <Row gap={8} style={{ flexWrap: 'wrap' }}>
                  <Button label={fill(k.logHours, { hours: f.qty(r.hundredths) })} icon="clock" flex onPress={() => {
                    actions.logHours(jobId, r.hundredths, r.note); setAnswered((a) => ({ ...a, [r.key]: k.logged }));
                  }} />
                  <Button label={k.skip} variant="outline" onPress={() => setAnswered((a) => ({ ...a, [r.key]: k.skip }))} />
                </Row>}
              </> : <>
                <T v="label">{r.qtyHundredths !== 100 ? `${r.description} × ${f.qty(r.qtyHundredths)}` : r.description}</T>
                {answered[r.key] ? <T v="small" muted>{answered[r.key]}</T> : <>
                  <Field label={k.price} value={r.price} keyboardType="decimal-pad" placeholder={t('estimate.pricePlaceholder')}
                    onChangeText={(price) => setRows((all) => all?.map((x) => (x.key === r.key ? { ...x, price } : x)) ?? null)} />
                  {cents === null && r.price.trim() ? <T v="small" color={p.danger}>{t('estimate.priceBad')}</T> : null}
                  <Row gap={8} style={{ flexWrap: 'wrap' }}>
                    <Button label={cents ? fill(k.charge, { amount: f.money(lineTotal(r.qtyHundredths, cents)) }) : k.chargeNoPrice} icon="dollar-sign" flex
                      disabled={!cents} onPress={() => { if (cents && addWork(r, cents)) setAnswered((a) => ({ ...a, [r.key]: k.added })); }} />
                    <Button label={k.list} variant="outline" flex onPress={() => { if (addWork(r, 0)) setAnswered((a) => ({ ...a, [r.key]: k.listed })); }} />
                  </Row>
                  {!cents ? <T v="small" muted>{k.needsPrice}</T> : null}
                </>}
              </>}
            </View>;
          })}
        </Card>
      </>}
    <Button label={left.length && rows?.length ? k.skip : k.done} variant={left.length ? 'outline' : 'dark'} onPress={onClose} />
  </Sheet>;
}

/** Notes are read for work only where work can still be added: signed in, on a job not yet invoiced. */
export function canReadNoteForWork(mode: Parameters<typeof aiReady>[0], jobId: string): boolean {
  return aiReady(mode) && !workLocked(currentState(), jobId);
}
