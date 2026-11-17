import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Share } from 'react-native';
import { Button, Card, Checkbox, Chip, Field, Notice, PageHeader, Row, Screen, T } from '@/components/ui';
import { useAuth } from '@/data/auth';
import * as sample from '@/data/sample';
import * as api from '@/data/team-access';
import { useLang } from '@/i18n';
import { userError } from '@/lib/user-errors';
import { useOperations } from '@/features/operations/use-operations';
import { teamText } from './text';

function TeamAdminAccount() {
  const auth = useAuth();
  const op = useOperations();
  const { lang, t } = useLang();
  const c = teamText(lang);
  const [data, setData] = useState<Awaited<ReturnType<typeof api.loadTeamAdmin>> | null>(null);
  const [email, setEmail] = useState('');
  const [workerId, setWorkerId] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [removeId, setRemoveId] = useState('');
  const [attempt, setAttempt] = useState(0);
  const inFlight = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    if (!auth.businessId) return;
    api.loadTeamAdmin(auth.businessId).then((next) => { if (!cancelled) { setData(next); setError(''); } }, (e: unknown) => { if (!cancelled) setError(userError(t, e)); });
    return () => { cancelled = true; };
  }, [auth.businessId, attempt, t]);
  const run = async (work: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try { await work(); if (alive.current) setAttempt((a) => a + 1); }
    catch (e) { if (alive.current) setError(userError(t, e)); }
    finally { if (alive.current) { inFlight.current = false; setBusy(false); } }
  };
  const workers = op.data.workers.filter((w) => !w.archived && !data?.members.some((m) => m.worker_id === w.id));
  const create = () => {
    if (!auth.businessId || !workers.some((w) => w.id === workerId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError(c.badInvite); return; }
    const bid = auth.businessId;
    void run(async () => {
      const token = await api.inviteWorker(bid, workerId, email.trim());
      if (!alive.current) return;
      const base = process.env.EXPO_PUBLIC_TEAM_URL ?? 'https://kiln.expo.app';
      setUrl(`${base.replace(/\/$/, '')}/join/${token}`);
      setEmail(''); setWorkerId('');
    });
  };
  return <Screen header={<PageHeader title={c.admin} back={() => router.back()} />}>
    <Notice text={c.adminHelp} icon="lock" tone="soft" />
    {error || op.error ? <><Notice text={error || op.error || ''} tone="danger" /><Button label={c.retry} variant="outline" disabled={busy} onPress={() => { op.retry(); setAttempt((a) => a + 1); }} /></> : null}
    {!data || !op.ready ? <T>{c.loading}</T> : <>
      <T v="h2">{c.invite}</T>
      <Card>
        <T v="small" muted>{c.inviteHelp}</T>
        {!workers.length ? <Button label={c.plan} variant="outline" onPress={() => router.push('/operations')} /> : null}
        <T v="label">{c.chooseWorker}</T>
        <Row style={{ flexWrap: 'wrap' }}>{workers.map((w) => <Chip key={w.id} label={w.name} selected={workerId === w.id} onPress={() => { if (!busy) setWorkerId(w.id); }} />)}</Row>
        <Field label={c.email} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" maxLength={254} editable={!busy} />
        <Button label={busy ? c.saving : c.createLink} disabled={busy || !workers.length} onPress={create} />
      </Card>
      {url ? <Card><T>{c.linkReady}</T><Field value={url} editable={false} accessibilityLabel={c.share} selectTextOnFocus /><Button label={c.share} disabled={busy} onPress={() => void Share.share({ message: url }).catch((e: unknown) => setError(userError(t, e)))} /></Card> : null}
      <T v="h2">{c.members}</T>
      {!data.members.length ? <T muted>{c.none}</T> : null}
      {data.members.map((member) => <Card key={member.user_id}>
        <T v="h3">{member.name}</T><T muted>{member.email}</T>
        <T v="label">{c.assign}</T>
        {sample.jobs.map((job) => <Checkbox key={job.id} label={`${job.title} · ${job.address}`} value={data.assignments.some((a) => a.user_id === member.user_id && a.job_id === job.id)} onChange={(assigned) => { if (!busy && auth.businessId) void run(() => api.assignJob(auth.businessId!, member.user_id, job.id, assigned)); }} />)}
        {removeId === member.user_id ? <><Notice text={c.removeHelp} tone="flag" /><Button label={c.removeConfirm} variant="danger" disabled={busy} onPress={() => { if (auth.businessId) void run(async () => { await api.removeMember(auth.businessId!, member.user_id); if (alive.current) setRemoveId(''); }); }} /><Button label={c.cancel} variant="outline" disabled={busy} onPress={() => setRemoveId('')} /></> : <Button label={c.remove} variant="outline" disabled={busy} onPress={() => setRemoveId(member.user_id)} />}
      </Card>)}
      <T v="h2">{c.pending}</T>
      {data.invites.filter((invite) => !invite.accepted_at && !invite.revoked_at).map((invite) => <Card key={invite.id}>
        <T v="label">{invite.email}</T><T muted>{op.data.workers.find((w) => w.id === invite.worker_id)?.name}</T>
        <T v="small" muted>{new Date(invite.expires_at) <= new Date() ? c.expired : new Date(invite.expires_at).toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US')}</T>
        <Button label={c.revoke} variant="outline" disabled={busy} onPress={() => void run(() => api.revokeInvite(invite.id))} />
      </Card>)}
    </>}
  </Screen>;
}
export function TeamAdminScreen() {
  const auth = useAuth();
  const { lang } = useLang();
  const c = teamText(lang);
  if (!auth.session || auth.role !== 'owner') return <Screen><Notice text={c.noPreview} tone="soft" /></Screen>;
  return <TeamAdminAccount key={`${auth.session.user.id}:${auth.businessId}`} />;
}
