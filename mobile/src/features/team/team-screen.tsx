import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Share } from 'react-native';

import { Sheet } from '@/components/sheet';
import { Button, ButtonRow, Card, Chip, Field, Hair, ListRow, Notice, PageHeader, Row, Screen, T } from '@/components/ui';
import { useAuth } from '@/data/auth';
import * as sample from '@/data/sample';
import * as api from '@/data/team-access';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';
import { can, canManagePerson } from '@/lib/permissions';
import { userError } from '@/lib/user-errors';
import { usePalette } from '@/theme/use-palette';

import { fill, teamText } from './text';
import { useUnassignedJobs } from './unassigned-jobs';
import { refreshTeam, useTeam } from './use-team';

/** Runs one team action at a time and keeps its error for the screen. */
export function useTeamAction() {
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const run = async (work: () => Promise<unknown>): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true; setBusy(true); setError('');
    try { await work(); refreshTeam(); return true; }
    catch (e) { setError(userError(t, e)); return false; }
    finally { inFlight.current = false; setBusy(false); }
  };
  return { busy, error, run, clearError: () => setError('') };
}

export function InviteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const p = usePalette();
  const { lang } = useLang();
  const c = teamText(lang);
  const auth = useAuth();
  const action = useTeamAction();
  const [name, setName] = useState('');
  const [role, setRole] = useState<'crew' | 'manager'>('crew');
  const [code, setCode] = useState('');
  const [bad, setBad] = useState(false);
  const close = () => { onClose(); setTimeout(() => { setName(''); setRole('crew'); setCode(''); setBad(false); }, 300); };
  const make = () => {
    if (!name.trim() || !auth.businessId) { setBad(true); return; }
    setBad(false);
    const bid = auth.businessId;
    void action.run(async () => setCode(await api.createInvite(bid, name.trim(), role)));
  };
  const message = fill(c.shareMessage, { business: auth.businessName, code });
  return (
    <Sheet open={open} onClose={close} title={c.inviteTitle}>
      {code ? <>
        <T>{fill(c.codeReady, { name: name.trim() })}</T>
        <Card tone="accent" style={{ alignItems: 'center' }}><T v="h2">{code}</T></Card>
        {/* closing the share menu without sending isn't an error */}
        <Button label={c.send} icon="send" onPress={() => void Share.share({ message }).catch(() => undefined)} />
        <Button label={c.done} variant="outline" onPress={close} />
      </> : <>
        <Field label={c.theirName} value={name} onChangeText={setName} autoCapitalize="words" maxLength={120} editable={!action.busy} />
        {bad ? <T v="small" color={p.danger}>{c.badName}</T> : null}
        <T v="label">{c.role}</T>
        <Row style={{ flexWrap: 'wrap' }}>
          <Chip label={c.crew} selected={role === 'crew'} onPress={() => setRole('crew')} />
          {can(auth.role, 'inviteManager') ? <Chip label={c.manager} selected={role === 'manager'} onPress={() => setRole('manager')} /> : null}
        </Row>
        <T v="small" muted>{role === 'manager' ? c.managerHelp : c.crewHelp}</T>
        {action.error ? <Notice text={action.error} tone="danger" icon="alert-circle" /> : null}
        <Button label={action.busy ? c.saving : c.makeCode} disabled={action.busy} onPress={make} />
      </>}
    </Sheet>
  );
}

/** The Team tab: who's waiting to join, what to check, everyone on the team, and unused codes. */
export function TeamScreen() {
  const { lang } = useLang();
  const c = teamText(lang);
  const f = useFormat();
  const auth = useAuth();
  const team = useTeam();
  const action = useTeamAction();
  const [inviteOpen, setInviteOpen] = useState(false);
  const unassigned = useUnassignedJobs();
  const data = team.data;
  const pending = data?.members.filter((m) => m.status === 'pending') ?? [];
  const active = data?.members.filter((m) => m.status === 'active') ?? [];
  const who = (id: string | null) => (id === auth.session?.user.id ? c.you : team.nameOf(id) ?? c.someone);
  const roleName = (r: api.TeamRole) => (r === 'owner' ? c.owner : r === 'manager' ? c.manager : c.crew);
  const jobTitle = (id: string) => sample.jobs.find((j) => j.id === id)?.title ?? '';

  return (
    <Screen tabs header={<PageHeader title={c.teamTitle} />}>
      <Button label={c.invite} icon="user-plus" onPress={() => setInviteOpen(true)} />
      <InviteSheet open={inviteOpen} onClose={() => setInviteOpen(false)} />
      {team.error ? <><Notice text={c.failed} tone="danger" icon="alert-circle" /><Button label={c.retry} variant="outline" onPress={team.reload} /></> : null}
      {action.error ? <Notice text={action.error} tone="danger" icon="alert-circle" /> : null}
      {!data && !team.error ? <T muted>{c.loading}</T> : null}

      {pending.length ? <>
        <T v="eyebrow">{c.needsApproval}</T>
        {pending.map((m) => <Card key={m.user_id} style={{ gap: 8 }}>
          <T v="h3">{m.name}</T>
          <T v="small" muted>{m.email} · {roleName(m.role)}</T>
          {canManagePerson(auth.role, m.role) ? <ButtonRow>
            <Button label={c.approve} icon="check" disabled={action.busy} onPress={() => void action.run(() => api.approveMember(team.businessId!, m.user_id))} />
            <Button label={c.decline} variant="outline" disabled={action.busy} onPress={() => void action.run(() => api.declineMember(team.businessId!, m.user_id))} />
          </ButtonRow> : <T v="small" muted>{c.ownerOnly}</T>}
        </Card>)}
      </> : null}

      {data && (data.review.length || data.changes.length) ? <>
        <T v="eyebrow">{c.review}</T>
        {data.changes.map((r) => <Card key={r.id} style={{ gap: 8 }}>
          <T v="small" muted>{fill(c.changeFrom, { name: who(r.created_by) })} · {jobTitle(r.job_id)}</T>
          <T>{r.description}</T>
          <ButtonRow>
            <Button label={c.openJob} variant="soft" onPress={() => router.push(`/job/${r.job_id}`)} />
            <Button label={c.markDone} variant="outline" disabled={action.busy} onPress={() => void action.run(() => api.closeChangeRequest(r.id, 'done'))} />
          </ButtonRow>
        </Card>)}
        {data.review.map((item) => <Card key={item.id} style={{ gap: 8 }}>
          <T v="small" muted>{fill(c.newItem, { name: who(item.created_by) })}</T>
          <T v="label">{item.name} · {item.unit_cents === null ? c.noPrice : f.money(item.unit_cents)}</T>
          <ButtonRow>
            <Button label={c.looksGood} variant="soft" disabled={action.busy} onPress={() => void action.run(() => api.clearPriceReview(item.id))} />
            <Button label={c.editPrices} variant="outline" onPress={() => router.push('/settings/prices')} />
          </ButtonRow>
        </Card>)}
      </> : null}

      {data && can(auth.role, 'assignJobs') ? (
        <Card style={{ paddingVertical: 6 }}>
          <ListRow icon="briefcase" iconTone={unassigned.length ? 'accent' : 'soft'} title={c.unassigned}
            sub={unassigned.length ? String(unassigned.length) : c.allAssigned} onPress={() => router.push('/team/unassigned')} />
        </Card>
      ) : null}

      {data ? <>
        <T v="eyebrow">{c.people}</T>
        <Card style={{ paddingVertical: 4 }}>
          {active.map((m, i) => <PersonRow key={m.user_id} first={i === 0} member={m} me={m.user_id === auth.session?.user.id} />)}
        </Card>
        {active.length < 2 ? <T muted>{c.noPeople}</T> : null}
      </> : null}

      {data?.invites.length ? <>
        <T v="eyebrow">{c.invites}</T>
        {data.invites.map((invite) => <Card key={invite.id} style={{ gap: 6 }}>
          <T v="label">{invite.name} · {roleName(invite.role)}</T>
          <T v="small" muted>{fill(c.expires, { date: f.date(invite.expires_at.slice(0, 10)) })}</T>
          {canManagePerson(auth.role, invite.role) ? <Button label={c.cancelInvite} variant="outline" disabled={action.busy} onPress={() => void action.run(() => api.revokeInvite(invite.id))} /> : null}
        </Card>)}
      </> : null}

      {can(auth.role, 'seeCosts', { managersSeeCosts: data?.settings.managersSeeCosts }) ? (
        <Card style={{ paddingVertical: 6 }}>
          <ListRow icon="dollar-sign" title={c.workerCosts} onPress={() => router.push('/operations')} />
        </Card>
      ) : null}
    </Screen>
  );
}

function PersonRow({ member, me, first }: { member: api.TeamMember; me: boolean; first: boolean }) {
  const { lang } = useLang();
  const c = teamText(lang);
  const f = useFormat();
  const role = member.role === 'owner' ? c.owner : member.role === 'manager' ? c.manager : c.crew;
  const last = member.last_active ? fill(c.lastActive, { when: f.date(member.last_active.slice(0, 10)) }) : c.noActivity;
  const jobs = member.open_jobs ? ` · ${fill(c.openJobs, { count: member.open_jobs })}` : '';
  return <>
    {first ? null : <Hair />}
    <ListRow icon={member.role === 'crew' ? 'user' : 'shield'} iconTone={member.role === 'owner' ? 'accent' : 'soft'}
      title={me ? `${member.name} (${c.you})` : member.name} sub={`${role}${jobs} · ${last}`}
      onPress={() => router.push(`/team/${member.user_id}`)} />
  </>;
}
