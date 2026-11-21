import { useCallback, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { InvoiceAcceptance } from '@/data/pay-page';
import type { Lang } from '@/i18n';
import { formatters } from '@/lib/format';
import { localDate } from '@/lib/invoice-aging';
import { alternativeMethods, invoicePaymentCopy, type AlternativeMethod, type AlternativeMethods } from '@/lib/invoice-payment';
import { usePalette } from '@/theme/use-palette';

import { SignaturePad, type SignatureInk } from './signature-pad';
import { Button, Card, Checkbox, Chip, Field, Notice, T } from './ui';

export function InvoiceSignature({ value, lang }: { value: InvoiceAcceptance; lang: Lang }) {
  const c = invoicePaymentCopy[lang];
  const p = usePalette();
  return <Card style={{ gap: 8 }}>
    <T v="label">{c.accepted}</T>
    <T>{value.name} · {formatters(lang).date(localDate(value.signedAt))}</T>
    {value.alternativeMethod ? <T v="small">{c.promised} {c.methods[value.alternativeMethod]}</T> : null}
    <Svg width="100%" height={100} viewBox="0 0 320 100" accessibilityLabel={`${c.accepted} ${value.name}`}>
      {value.ink.map((stroke, i) => <Path key={i} d={stroke.map(([x, y], j) => `${j ? 'L' : 'M'}${x * 320} ${y * 100}`).join(' ')}
        fill="none" stroke={p.ink} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />)}
    </Svg>
  </Card>;
}

export function InvoicePaymentChoices({ lang, methods, wallet, card, bank, testMode, canPay, alternativesOnHold = false, acceptance, online, onSign, onDrawing, signable = true }: {
  lang: Lang;
  methods: AlternativeMethods;
  wallet: boolean;
  card: boolean;
  bank: boolean;
  testMode?: boolean;
  canPay: boolean;
  alternativesOnHold?: boolean;
  acceptance: InvoiceAcceptance | null;
  online?: (choice: 'wallet' | 'stripe') => ReactNode;
  onSign?: (name: string, ink: SignatureInk, method: AlternativeMethod | null) => Promise<void>;
  onDrawing?: (drawing: boolean) => void;
  /** Invoices can be signed here; a deposit is paid only (its estimate was already accepted). */
  signable?: boolean;
}) {
  const c = invoicePaymentCopy[lang];
  const stripe = card || bank;
  const bankLabel = card && bank ? c.bankOrCard : card ? c.card : c.bank;
  const [choice, setChoice] = useState<'wallet' | 'stripe' | 'alternative' | 'sign' | null>(null);
  const [method, setMethod] = useState<AlternativeMethod | null>(null);
  const enabled = alternativeMethods.filter((item) => methods[item] !== undefined);
  const selected = method && enabled.includes(method) ? method : null;
  const signing = signable && !acceptance && (choice === 'sign' || (canPay && !alternativesOnHold && choice === 'alternative' && !!selected));
  const choose = (next: NonNullable<typeof choice>) => {
    setChoice(next === choice ? null : next);
    setMethod(next === 'alternative' ? acceptance?.alternativeMethod ?? null : null);
  };
  return <>
    {canPay ? <Card style={{ gap: 10 }}>
      {testMode ? <Notice text={c.test} tone="flag" /> : null}
      {/* Bank transfer (and card, when on), Apple Pay / Google Pay, Alternate: the same three everywhere */}
      <Button label={stripe ? bankLabel : `${bankLabel} · ${c.unavailable}`} icon="briefcase" disabled={!stripe} variant={choice === 'stripe' ? 'dark' : 'outline'} onPress={() => choose('stripe')} />
      <Button label={wallet ? c.wallet : `${c.wallet} · ${c.unavailable}`} icon="smartphone" disabled={!wallet} variant={choice === 'wallet' ? 'dark' : 'outline'} onPress={() => choose('wallet')} />
      <Button label={enabled.length && !alternativesOnHold ? c.alternative : `${c.alternative} · ${c.unavailable}`} disabled={!enabled.length || alternativesOnHold}
        icon="dollar-sign" variant={choice === 'alternative' ? 'dark' : 'outline'} onPress={() => choose('alternative')} />
      {(choice === 'wallet' && wallet) || (choice === 'stripe' && stripe) ? online?.(choice) ?? <>
        {choice === 'stripe' && card ? <Button label={c.card} variant="outline" disabled /> : null}
        {choice === 'stripe' && bank ? <Button label={c.bank} variant="outline" disabled /> : null}
        <T v="small" muted>{c.preview}</T>
      </> : null}
      {choice === 'alternative' && enabled.length && !alternativesOnHold ? <>
        <View accessibilityRole="radiogroup" accessibilityLabel={c.alternative} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {enabled.map((id) => <Chip key={id} label={c.methods[id]} selected={id === selected} onPress={() => setMethod(id)} />)}
        </View>
        {selected ? <>
          <T v="small">{c.external}</T>
          {methods[selected] ? <T>{methods[selected]}</T> : null}
        </> : null}
      </> : null}
    </Card> : null}
    {!signable ? null : acceptance ? <InvoiceSignature value={acceptance} lang={lang} /> : <>
      {choice === 'sign' ? null : <Button label={c.sign} icon="edit-3" variant="outline" onPress={() => choose('sign')} />}
      {signing ? onSign ? <SignInvoice key={selected ?? 'invoice'} lang={lang} method={selected} onSign={onSign} onDrawing={onDrawing} />
        : <Notice text={c.preview} tone="soft" /> : null}
    </>}
  </>;
}

function SignInvoice({ lang, method, onSign, onDrawing }: { lang: Lang; method: AlternativeMethod | null;
  onSign: NonNullable<Parameters<typeof InvoicePaymentChoices>[0]['onSign']>; onDrawing?: (drawing: boolean) => void }) {
  const c = invoicePaymentCopy[lang];
  const [name, setName] = useState('');
  const [ink, setInk] = useState<SignatureInk>([]);
  const [agreed, setAgreed] = useState(false);
  const [pad, setPad] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const inFlight = useRef(false);
  const drawing = useCallback((active: boolean) => onDrawing?.(active), [onDrawing]);
  const hasInk = ink.some((stroke) => stroke.length > 1);
  return <Card style={{ gap: 10 }}>
    <Field label={c.name} value={name} onChangeText={setName} maxLength={120} editable={!busy} />
    <SignaturePad key={pad} placeholder={c.draw} label={c.draw} onInk={noOp} onDrawing={drawing} onChange={setInk} />
    <Button label={c.clear} variant="ghost" disabled={!ink.length || busy} onPress={() => { setInk([]); setPad(pad + 1); }} />
    <Checkbox label={method ? c.promise : c.consent} value={agreed} onChange={setAgreed} />
    {error ? <Notice text={c.failure} tone="danger" /> : null}
    <Button label={c.sendSigned} icon="send" disabled={busy || !agreed || name.trim().length < 2 || !hasInk} onPress={async () => {
      if (inFlight.current) return;
      inFlight.current = true; setBusy(true); setError(false);
      try { await onSign(name.trim(), ink, method); }
      catch { setError(true); }
      finally { inFlight.current = false; setBusy(false); }
    }} />
  </Card>;
}

function noOp() {}
