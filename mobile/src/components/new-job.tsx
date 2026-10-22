import { useState } from 'react';
import { Pressable, View } from 'react-native';

import * as sample from '@/data/sample';
import { useStore } from '@/data/store';
import { useLang, type Lang } from '@/i18n';
import { radius, tap } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

import { Button, Chip, Field, Hair, Icon, ListRow, Row, Segmented, T } from './ui';

/** "85" or "$85.50" -> cents, or null. */
function parseDollars(text: string): number | null {
  const n = Number(text.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n > 0 && n < 100000 ? Math.round(n * 100) : null;
}

/** New job: customer and address, what the job is, how you charge. Optional extras stay folded away. */
export function NewJobForm({ onCreated }: { onCreated: (jobId: string) => void }) {
  const p = usePalette();
  const { t } = useLang();
  const { state, actions } = useStore();
  const DEFAULT_RATE = state.profile.rateCents;

  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [lang, setLang] = useState<Lang>('en');
  const [title, setTitle] = useState('');
  const [address, setAddress] = useState('');
  const [pricing, setPricing] = useState<'flat' | 'hourly'>(state.profile.pricing);
  const [rateText, setRateText] = useState(String(DEFAULT_RATE / 100));
  const [more, setMore] = useState(false);
  const [workOrder, setWorkOrder] = useState('');
  const [note, setNote] = useState('');

  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const digits = q.replace(/\D/g, '');
  // newest customers first; search by name or phone; never a full list
  const matches = [...sample.customers]
    .reverse()
    .filter((c) => !q || c.name.toLowerCase().includes(q) || (digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits)))
    .slice(0, q ? 8 : 5);
  const picked = customerId ? sample.customers.find((c) => c.id === customerId) : undefined;
  const properties = [...new Set(sample.jobs.filter((job) => job.customerId === customerId)
    .map((job) => job.address.trim()).filter(Boolean))];

  const clearProperty = () => { setAddress(''); setWorkOrder(''); setNote(''); };

  const rateCents = parseDollars(rateText);
  const hasCustomer = mode === 'existing' ? customerId !== null : name.trim().length > 1;
  const ready = title.trim().length > 1 && address.trim().length > 2 && hasCustomer && (pricing === 'flat' || rateCents !== null);

  const pickCustomer = (id: string) => {
    setCustomerId(id);
    clearProperty();
  };

  const create = () => {
    if (!ready) return;
    const id = actions.addJob({
      title,
      address,
      pricing,
      rateCents: pricing === 'hourly' ? (rateCents ?? DEFAULT_RATE) : undefined,
      workOrder,
      privateNote: note,
      customer: mode === 'existing' && customerId ? { id: customerId } : { name, phone, lang },
    });
    onCreated(id);
  };

  const addressField = (
    <Field label={t('newJob.address')} value={address} onChangeText={setAddress} placeholder={t('newJob.addressPlaceholder')} autoComplete="street-address" />
  );

  return (
    <View style={{ gap: 14 }}>
      <T v="eyebrow">{t('newJob.customer')}</T>
      <Segmented
        label={t('newJob.customer')}
        value={mode}
        onChange={(value) => { setMode(value); setCustomerId(null); clearProperty(); }}
        options={[
          { key: 'existing', label: t('newJob.existing') },
          { key: 'new', label: t('newJob.newCustomer') },
        ]}
      />
      {mode === 'existing' ? (
        picked ? (
          <Row style={{ backgroundColor: p.ground, borderRadius: radius.sm, padding: 12 }} gap={12}>
            <Icon name="user" />
            <View style={{ flex: 1 }}>
              <T v="label" style={{ fontSize: 16 }}>{picked.name}</T>
              {picked.phone ? <T v="small" muted>{picked.phone}</T> : null}
            </View>
            <Button label={t('newJob.change')} variant="outline" onPress={() => { setCustomerId(null); clearProperty(); }} style={{ minHeight: tap.min }} />
          </Row>
        ) : (
          <View style={{ gap: 6 }}>
            <Field value={query} onChangeText={setQuery} placeholder={t('newJob.searchCustomer')} accessibilityLabel={t('newJob.searchCustomer')} autoCorrect={false} />
            {!q ? <T v="small" muted>{t('newJob.recent')}</T> : null}
            {matches.map((c) => (
              <ListRow key={c.id} icon="user" title={c.name} sub={c.phone || undefined} onPress={() => pickCustomer(c.id)} />
            ))}
            {q && matches.length === 0 ? (
              <>
                <T v="small" muted>{t('newJob.noMatch', { q: query.trim() })}</T>
                <Button
                  label={t('newJob.addNew', { q: query.trim() })}
                  icon="user-plus"
                  variant="outline"
                  onPress={() => {
                    // a phone number goes in the phone box, anything else is the name
                    if (/^[\d\s()+-]+$/.test(query.trim())) setPhone(query.trim());
                    else setName(query.trim());
                    setMode('new');
                  }}
                />
              </>
            ) : null}
          </View>
        )
      ) : (
        <>
          <Field label={t('newJob.name')} value={name} onChangeText={setName} autoComplete="name" autoCapitalize="words" />
          <T v="label">{t('newJob.customerLang')}</T>
          <Segmented
            label={t('newJob.customerLang')}
            value={lang}
            onChange={setLang}
            options={[
              { key: 'en', label: 'English' },
              { key: 'es', label: 'Español' },
            ]}
          />
          {addressField}
          <Field label={t('newJob.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
        </>
      )}
      {mode === 'existing' && picked && properties.length ? <View style={{ gap: 10 }}>
        <T v="label">{t('review.savedProperties')}</T>
        {properties.map((property) => <Chip key={property} label={property} selected={address === property}
          onPress={() => { setAddress(property); setWorkOrder(''); setNote(''); }} />)}
        <T v="small" muted>{t('review.propertyHelp')}</T>
      </View> : null}
      {mode === 'existing' ? addressField : null}

      <Hair />
      <Field label={t('newJob.jobTitle')} value={title} onChangeText={setTitle} placeholder={t('newJob.jobTitlePlaceholder')} autoCapitalize="sentences" />

      <T v="label">{t('newJob.pricing')}</T>
      <Segmented
        label={t('newJob.pricing')}
        value={pricing}
        onChange={setPricing}
        options={[
          { key: 'flat', label: t('newJob.flat') },
          { key: 'hourly', label: t('newJob.hourly') },
        ]}
      />
      {pricing === 'hourly' ? (
        <View style={{ gap: 6 }}>
          <Field label={t('newJob.rate')} value={rateText} onChangeText={setRateText} keyboardType="decimal-pad" placeholder="85" />
          {rateCents === null ? <T v="small" color={p.danger}>{t('logHours.bad')}</T> : null}
        </View>
      ) : null}

      {more ? (
        <>
          <Field label={t('newJob.workOrder')} value={workOrder} onChangeText={setWorkOrder} />
          <Field label={t('newJob.note')} value={note} onChangeText={setNote} placeholder={t('newJob.notePlaceholder')} />
        </>
      ) : (
        <Pressable onPress={() => setMore(true)} accessibilityRole="button" style={{ minHeight: tap.min, justifyContent: 'center' }}>
          <T v="label" style={{ textDecorationLine: 'underline' }}>+ {t('newJob.more')}</T>
        </Pressable>
      )}

      <Button label={t('newJob.create')} icon="check" big disabled={!ready} onPress={create} />
      {!ready ? <T v="small" muted style={{ textAlign: 'center' }}>{t('newJob.needMore')}</T> : null}
    </View>
  );
}
