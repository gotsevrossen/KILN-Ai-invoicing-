import { router } from 'expo-router';
import { useState } from 'react';

import { DocumentTermsEditor } from '@/components/job-scope';
import { Button, Card, Field, Notice, PageHeader, Screen, T } from '@/components/ui';
import { useAuth } from '@/data/auth';
import { useStore } from '@/data/store';
import { accountText, emailOk } from '@/features/account/text';
import { useLang } from '@/i18n';
import { can } from '@/lib/permissions';

/** The owner edits the business's name and contact details. Saved like other settings (works offline). */
export default function BusinessDetails() {
  const { lang } = useLang();
  const c = accountText(lang);
  const { state, actions } = useStore();
  const auth = useAuth();
  const owner = can(auth.role, 'businessSettings');
  const profile = state.profile;
  const [name, setName] = useState(profile.businessName);
  const [phone, setPhone] = useState(profile.phone);
  const [email, setEmail] = useState(profile.email ?? '');
  const [address, setAddress] = useState(profile.address ?? '');
  const [terms, setTerms] = useState(profile.documentTerms?.terms ?? '');
  const [warranty, setWarranty] = useState(profile.documentTerms?.warranty ?? '');
  const [problem, setProblem] = useState('');
  const [saved, setSaved] = useState(false);
  const changed = name !== profile.businessName || phone !== profile.phone || email !== (profile.email ?? '') || address !== (profile.address ?? '') ||
    terms !== (profile.documentTerms?.terms ?? '') || warranty !== (profile.documentTerms?.warranty ?? '');

  const save = () => {
    setSaved(false);
    if (!name.trim()) return setProblem(c.needName);
    if (email.trim() && !emailOk(email.trim())) return setProblem(c.badEmail);
    setProblem('');
    actions.setBusinessDetails({ name, phone, email, address, terms, warranty });
    setSaved(true);
  };

  return (
    <Screen header={<PageHeader title={c.businessTitle} sub={c.businessHelp} back={() => router.back()} />}>
      {!owner ? <Notice text={c.ownerOnly} tone="soft" icon="lock" /> : null}
      <Card style={{ gap: 14 }}>
        <Field label={c.businessName} value={name} onChangeText={(v) => { setName(v); setSaved(false); }} editable={owner} maxLength={120} autoComplete="organization" />
        <Field label={c.businessPhone} value={phone} onChangeText={(v) => { setPhone(v); setSaved(false); }} editable={owner} maxLength={40} keyboardType="phone-pad" autoComplete="tel" />
        <Field label={c.businessEmail} value={email} onChangeText={(v) => { setEmail(v); setSaved(false); }} editable={owner} maxLength={254}
          keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" />
        <Field label={c.businessAddress} value={address} onChangeText={(v) => { setAddress(v); setSaved(false); }} editable={owner} maxLength={300}
          multiline autoComplete="street-address" />
      </Card>
      <DocumentTermsEditor values={{ terms, warranty }} editable={owner} onChange={(key, text) => {
        (key === 'terms' ? setTerms : setWarranty)(text ?? '');
        setSaved(false);
      }} />
      {problem ? <Notice text={problem} tone="danger" icon="alert-circle" /> : null}
      {saved && !changed ? <T v="small" muted>{c.saved}</T> : null}
      {owner ? <Button label={c.saveDetails} icon="check" disabled={!changed} onPress={save} /> : null}
    </Screen>
  );
}
