import { router } from 'expo-router';
import { useState } from 'react';

import { Sheet } from '@/components/sheet';
import { Button, Card, Checkbox, ListRow, Notice, T } from '@/components/ui';
import { useAuth } from '@/data/auth';
import * as api from '@/data/team-access';
import { useLang } from '@/i18n';
import { can } from '@/lib/permissions';

import { useTeamAction } from './team-screen';
import { teamText } from './text';
import { useTeam } from './use-team';

/** Job page: who works on this job. Owners and managers with a team pick crew members here. */
export function JobTeam({ jobId }: { jobId: string }) {
  const { lang } = useLang();
  const c = teamText(lang);
  const auth = useAuth();
  const team = useTeam();
  const action = useTeamAction();
  const [open, setOpen] = useState(false);
  if (!team.showTab || !team.data || !can(auth.role, 'assignJobs')) return null;
  const crew = team.data.members.filter((m) => m.role === 'crew' && m.status === 'active');
  const onJob = new Set(team.data.assignments.filter((a) => a.job_id === jobId).map((a) => a.user_id));
  const names = crew.filter((m) => onJob.has(m.user_id)).map((m) => m.name);
  const changes = team.data.changes.filter((r) => r.job_id === jobId);
  return <>
    <Card style={{ paddingVertical: 6 }}>
      <ListRow icon="users" iconTone={names.length ? 'soft' : 'accent'} title={c.assignedTo} sub={names.length ? names.join(', ') : c.nobody} onPress={() => setOpen(true)} />
    </Card>
    {changes.map((r) => <Card key={r.id} tone="flag" style={{ gap: 8 }}>
      <T v="label">{c.changeFrom.replace('%{name}', team.nameOf(r.created_by) ?? c.someone)}</T>
      <T>{r.description}</T>
      <Button label={c.markDone} variant="dark" disabled={action.busy} onPress={() => void action.run(() => api.closeChangeRequest(r.id, 'done'))} />
    </Card>)}
    <Sheet open={open} onClose={() => setOpen(false)} title={c.whoWorks}>
      {action.error ? <Notice text={action.error} tone="danger" icon="alert-circle" /> : null}
      {crew.length ? crew.map((m) => (
        <Checkbox key={m.user_id} label={m.name} value={onJob.has(m.user_id)}
          onChange={(on) => { if (team.businessId) void action.run(() => api.assignJob(team.businessId!, m.user_id, jobId, on)); }} />
      )) : <>
        <T muted>{c.noCrew}</T>
        <Button label={c.teamTitle} variant="outline" onPress={() => { setOpen(false); router.push('/team'); }} />
      </>}
      <Button label={c.done} onPress={() => setOpen(false)} />
    </Sheet>
  </>;
}

/** Home: people waiting to join and things crew sent in, one tap from the Team tab. */
export function TeamInbox() {
  const { lang } = useLang();
  const c = teamText(lang);
  const team = useTeam();
  if (!team.showTab || !team.data) return null;
  const waiting = team.data.members.filter((m) => m.status === 'pending').length;
  const toCheck = team.data.review.length + team.data.changes.length;
  if (!waiting && !toCheck) return null;
  return (
    <Card style={{ paddingVertical: 6 }}>
      {waiting ? <ListRow icon="user-plus" iconTone="accent" title={c.needsApproval} sub={String(waiting)} onPress={() => router.push('/team')} /> : null}
      {toCheck ? <ListRow icon="check-square" iconTone="flag" title={c.review} sub={String(toCheck)} onPress={() => router.push('/team')} /> : null}
    </Card>
  );
}
