import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RecordGate } from '@/components/record-gate';
import { SignaturePad } from '@/components/signature-pad';
import { Button, Card, Checkbox, Field, Hair, Icon, LineRow, Notice, PhotoTile, Row, Screen, T } from '@/components/ui';
import { changeOrderById, changeOrderTotal, customerOf, hasChangeOrder, jobById } from '@/data/selectors';
import { useStore } from '@/data/store';
import { useLang, useTFor } from '@/i18n';
import { formatters } from '@/lib/format';
import { font, radius, tap } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

/** Hand-the-phone signing. Everything below the black strip is in the customer's language. */
function ChangeOrderSign() {
  const p = usePalette();
  const { t } = useLang();
  const { state, actions } = useStore();
  const { id } = useLocalSearchParams<{ id: string }>();
  const co = changeOrderById(id)!;
  const job = jobById(co.jobId);
  const customer = customerOf(job);
  const tc = useTFor(customer.lang);
  const fc = formatters(customer.lang);

  const [name, setName] = useState(customer.name);
  const [hasInk, setHasInk] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [padKey, setPadKey] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const signed = state.signed[co.id];
  const ready = name.trim().length > 1 && hasInk && agreed;
  const newTotal = fc.money(changeOrderTotal(co));

  return (
    <View style={{ flex: 1, backgroundColor: p.ground }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: p.inverse }}>
        <Row style={{ justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 }}>
          <Row gap={8} style={{ flex: 1 }}>
            <Icon name="lock" size={16} color={p.onInverse} />
            <T v="small" color={p.onInverse} style={{ flex: 1 }}>{t('changeOrder.customerView', { name: customer.firstName })}</T>
          </Row>
          <Pressable onPress={() => router.back()} accessibilityRole="button" style={{ minHeight: tap.min, justifyContent: 'center', paddingHorizontal: 8 }}>
            <T v="label" color={p.onInverse}>{t('changeOrder.exit')}</T>
          </Pressable>
        </Row>
      </SafeAreaView>

      {state.declinedChanges.includes(co.id) ? <Screen noTopInset>
        <Notice text={tc('review.changeDeclined')} tone="soft" />
        <Button label={tc('changeOrder.giveBack')} onPress={() => router.back()} />
      </Screen> : signed ? (
        <Screen scroll={false} noTopInset>
          <View style={{ flex: 1, justifyContent: 'center', gap: 18 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: p.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="check" size={40} color={p.onAccent} />
            </View>
            <T v="title">{tc('changeOrder.signedTitle', { name: customer.firstName })}</T>
            <T v="body">{tc('changeOrder.signedBody', { n: co.number, amount: newTotal })}</T>
            <Card style={{ gap: 4 }}>
              <T v="small" muted>{tc('changeOrder.signedBy', { name: signed.name })}</T>
              <T v="small" muted>{new Date(signed.at).toLocaleString(customer.lang === 'es' ? 'es-US' : 'en-US')}</T>
              <T v="small" muted>{tc('changeOrder.addedTo', { job: job.title })}</T>
            </Card>
            <Button label={tc('changeOrder.giveBack')} variant="dark" big onPress={() => router.back()} />
          </View>
        </Screen>
      ) : (
        <Screen noTopInset scrollEnabled={!drawing}>
          <View style={{ gap: 4 }}>
            <T v="small" muted>{state.profile.businessName}</T>
            <T v="title">{tc('changeOrder.title', { n: co.number })}</T>
            <T v="small" muted>{job.title} · {job.address}</T>
          </View>

          <Card style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
            <View style={{ width: 96 }}>
              <PhotoTile height={96} flex={false} />
            </View>
            <T v="body" style={{ flex: 1 }}>{co.description}</T>
          </Card>

          <Card style={{ gap: 6 }}>
            <LineRow label={tc('changeOrder.signedEstimate')} value={fc.money(co.baseCents)} />
            <LineRow label={tc('changeOrder.thisChange')} value={`+${fc.money(co.amountCents)}`} strong />
            <Row style={{ justifyContent: 'space-between', backgroundColor: p.inverse, borderRadius: radius.sm, padding: 16, marginTop: 6 }}>
              <T v="eyebrow" color={p.onInverse}>{tc('changeOrder.newTotal')}</T>
              <T v="money" color={p.onInverse} style={{ fontFamily: font.black, fontSize: 26 }}>{newTotal}</T>
            </Row>
          </Card>

          <Field label={tc('changeOrder.fullName')} value={name} onChangeText={setName} autoComplete="name" />

          <View style={{ gap: 6 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="label">{tc('changeOrder.signFinger')}</T>
              <Pressable onPress={() => { setPadKey((k) => k + 1); setHasInk(false); }} accessibilityRole="button" style={{ minHeight: tap.min, justifyContent: 'center', paddingHorizontal: 8 }}>
                <T v="label" style={{ textDecorationLine: 'underline' }}>{tc('changeOrder.clear')}</T>
              </Pressable>
            </Row>
            <SignaturePad key={padKey} placeholder={tc('changeOrder.signHere')} label={tc('changeOrder.signFinger')} onInk={() => setHasInk(true)} onDrawing={setDrawing} />
          </View>

          <Checkbox label={tc('changeOrder.approve', { amount: newTotal })} value={agreed} onChange={setAgreed} />

          <Button label={tc('changeOrder.signApprove')} big disabled={!ready} onPress={() => actions.sign(co.id, name.trim())} />
          <Button label={tc('customer.decline')} variant="outline" onPress={() => actions.declineChange(co.id)} />
          {!ready ? <T v="small" muted style={{ textAlign: 'center' }}>{tc('changeOrder.needAll')}</T> : null}
          <Hair />
          <T v="small" muted>{tc('changeOrder.privacy', { business: state.profile.businessName })}</T>
        </Screen>
      )}
    </View>
  );
}

/** Waits for the record to load (a link or refresh can arrive first) instead of crashing. */
export default function ChangeOrderSignRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecordGate found={() => hasChangeOrder(id)}><ChangeOrderSign /></RecordGate>;
}
