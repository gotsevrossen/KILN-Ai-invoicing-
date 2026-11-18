import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';

import { Sheet } from '@/components/sheet';
import { Button, Card, Checkbox, ListRow, Notice, T } from '@/components/ui';
import { useAuth } from '@/data/auth';
import * as api from '@/data/team-access';
import { useLang } from '@/i18n';
import { can } from '@/lib/permissions';

import { useTeamAction } from './team-screen';
import { teamText } from './text';
import { useTeam } from './use-team';

/** Everyone who can be put on a job: owner, then managers, then crew. Pending people can't. */
export function assignablePeople(members: api.TeamMember[]) {
  const order = { owner: 0, manager: 1, crew: 2 } as const;
  return members.filter((m) => m.status === 'active').sort((a, b) => order[a.role] - order[b.role]);
}

/**
 * "Who works on this job?" Owners and managers put anyone on the team on a job, themselves included.
 * For the owner and managers it only marks who looks after the job; crew get access to it.
 */
export function AssignSheet({ jobId, title, open, onClose, footer }: {
  jobId: string; title?: string; open: boolean; onClose: () => void; footer?: ReactNode;
}) {
  const { lang } = useLang();
  const c = teamText(lang);
  const auth = useAuth();
  const team = useTeam();
  const action = useTeamAction();
  if (!team.data) return null;
  const me = auth.session?.user.id;
  const people = assignablePeople(team.data.members);
  const onJob = new Set(team.data.assignments.filter((a) => a.job_id === jobId).map((a) => a.user_id));
  const label = (m: api.TeamMember) =>
    `${m.name}${m.user_id === me ? ` (${c.you})` : ''}${m.role === 'crew' ? '' : ` · ${m.role === 'owner' ? c.owner : c.manager}`}`;
  return (
    <Sheet open={open} onClose={onClose} title={title ?? c.whoWorks}>
      {title ? <T v="small" muted>{c.whoWorks}</T> : null}
      {action.error ? <Notice text={action.error} tone="danger" icon="alert-circle" /> : null}
      {people.map((m) => (
        <Checkbox key={m.user_id} label={label(m)} value={onJob.has(m.user_id)}
          onChange={(on) => { if (team.businessId) void action.run(() => api.assignJob(team.businessId!, m.user_id, jobId, on)); }} />
      ))}
      {people.length < 2 ? <>
        <T muted>{c.noCrew}</T>
        <Button label={c.teamTitle} variant="outline" onPress={() => { onClose(); router.push('/team'); }} />
      </> : null}
      {footer}
      <Button label={c.done} onPress={onClose} />
    </Sheet>
  );
}

/** Job page: who works on this job, and crew suggestions waiting on it. */
export function JobTeam({ jobId }: { jobId: string }) {
  const { lang } = useLang();
  const c = teamText(lang);
  const auth = useAuth();
  const team = useTeam();
  const action = useTeamAction();
  const [open, setOpen] = useState(false);
  if (!team.showTab || !team.data || !can(auth.role, 'assignJobs')) return null;
  const me = auth.session?.user.id;
  const onJob = new Set(team.data.assignments.filter((a) => a.job_id === jobId).map((a) => a.user_id));
  const names = assignablePeople(team.data.members).filter((m) => onJob.has(m.user_id)).map((m) => (m.user_id === me ? c.you : m.name));
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
    <AssignSheet jobId={jobId} open={open} onClose={() => setOpen(false)} />
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
