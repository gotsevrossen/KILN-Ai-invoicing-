import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { RecordGate } from '@/components/record-gate';
import { Button, ButtonRow, Card, Field, Hair, Icon, ListRow, PageHeader, Screen, T } from '@/components/ui';
import * as sample from '@/data/sample';
import { customerOf, hasJob, jobById } from '@/data/selectors';
import { useStore } from '@/data/store';
import type { Customer } from '@/data/types';
import { useLang } from '@/i18n';
import { callNumber, dialable, textNumber } from '@/lib/contact';
import { validEmailAddress } from '@/lib/email-address';
import { usePalette } from '@/theme/use-palette';

/** Who the job is for and where: phone, address, language, the private note, and their other jobs. */
function JobCustomer() {
  const p = usePalette();
  const { t } = useLang();
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = jobById(id);
  const customer = customerOf(job);
  // property managers have many jobs (and addresses) under one customer
  const others = sample.jobs.filter((j) => j.customerId === customer.id && j.id !== job.id);
  const phone = dialable(customer.phone);

  return (
    <Screen header={<PageHeader title={t('job.customerPage')} sub={job.title} back={() => router.back()} />}>
      <Card style={{ gap: 4 }}>
        <T v="h2">{customer.name}</T>
        <ListRow icon="phone" title={customer.phone || '—'} sub={t('newJob.phone')} />
        <Hair />
        <CustomerEmail key={`${customer.id}:${customer.email ?? ''}`} customer={customer} />
        <Hair />
        <ListRow icon="map-pin" title={job.address}
          sub={job.workOrder ? `${t('newJob.address')} · ${t('job.workOrder', { number: job.workOrder })}` : t('newJob.address')} />
        <Hair />
        <ListRow icon="globe" title={customer.lang === 'es' ? 'Español' : 'English'} sub={t('newJob.customerLang')} />
      </Card>

      {/* opens the owner's own phone or text app; nothing is sent from KILN */}
      <ButtonRow>
        <Button label={t('job.call', { name: customer.firstName })} icon="phone" variant="outline" flex disabled={!phone}
          onPress={() => callNumber(phone)} />
        <Button label={t('job.text', { name: customer.firstName })} icon="message-square" variant="outline" flex disabled={!phone}
          onPress={() => textNumber(phone)} />
      </ButtonRow>

      {job.privateNote ? (
        <Card tone="flag" style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Icon name="lock" color={p.onFlag} />
          <View style={{ flex: 1, gap: 2 }}>
            <T v="label" color={p.onFlag}>{job.privateNote}</T>
            <T v="small" color={p.onFlag}>{t('common.privateNote')}</T>
          </View>
        </Card>
      ) : null}

      {others.length ? (
        <>
          <T v="eyebrow" style={{ marginTop: 8 }}>{t('job.otherJobs', { name: customer.firstName })}</T>
          <Card style={{ gap: 4 }}>
            {others.map((j, i) => (
              <View key={j.id}>
                {i ? <Hair /> : null}
                <ListRow icon="briefcase" title={j.title} sub={j.address} onPress={() => router.push(`/job/${j.id}`)} />
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function CustomerEmail({ customer }: { customer: Customer }) {
  const { lang } = useLang();
  const { actions } = useStore();
  const es = lang === 'es';
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(customer.email ?? '');
  const value = email.trim();
  const label = es ? 'Correo electrónico del cliente' : 'Customer email';
  if (!editing) return <ListRow icon="mail" title={customer.email || (es ? 'Añadir correo' : 'Add email')} sub={label} onPress={() => setEditing(true)} />;
  return <>
    <Field label={label} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" maxLength={254} />
    <ButtonRow>
      <Button label={es ? 'Guardar correo' : 'Save email'} disabled={!!value && !validEmailAddress(value)} onPress={() => {
        actions.setCustomerEmail(customer.id, value);
        setEditing(false);
      }} />
      <Button label={es ? 'Cancelar' : 'Cancel'} variant="outline" onPress={() => { setEmail(customer.email ?? ''); setEditing(false); }} />
    </ButtonRow>
  </>;
}

/** Waits for the record to load (a link or refresh can arrive first) instead of crashing. */
export default function JobCustomerRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecordGate found={() => hasJob(id)}><JobCustomer /></RecordGate>;
}
