import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { Button, Card, Checkbox, Hair, ListRow, Notice, PageHeader, Row, Screen, T, type IconName } from '@/components/ui';
import { useAuth } from '@/data/auth';
import * as sample from '@/data/sample';
import * as api from '@/data/team-access';
import { onLiveRefresh } from '@/data/live-events';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';
import { can, canManagePerson } from '@/lib/permissions';
import { userError } from '@/lib/user-errors';
import { radius } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';

import { useTeamAction } from './team-screen';
import { fill, teamText } from './text';
import { useTeam } from './use-team';

/** A private job photo, shown through a short-lived link. */
export function PhotoThumb({ path, size = 92, onPress }: { path: string; size?: number; onPress?: () => void }) {
  const p = usePalette();
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    api.photoLink(path).then((u) => { if (live) setUri(u); }, () => undefined);
    return () => { live = false; };
  }, [path]);
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : 'image'}
      style={{ width: size, height: size, borderRadius: radius.xs, overflow: 'hidden', backgroundColor: p.placeholder }}>
      {uri ? <Image source={{ uri }} style={{ width: size, height: size }} accessibilityIgnoresInvertColors /> : null}
    </Pressable>
  );
}

/** One person on the team: their jobs, what they added, and (for the owner) their role. */
export function PersonScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { lang, t } = useLang();
  const c = teamText(lang);
  const f = useFormat();
  const auth = useAuth();
  const team = useTeam();
  const action = useTeamAction();
  const [activity, setActivity] = useState<api.Activity[] | null>(null);
  const [activityError, setActivityError] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const member = team.data?.members.find((m) => m.user_id === userId);
  const businessId = team.businessId;

  useFocusEffect(useCallback(() => {
    if (!businessId || !userId) return;
    let live = true;
    let request = 0;
    const reload = () => {
      const token = ++request;
      api.loadActivity(businessId, userId).then((a) => { if (live && token === request) { setActivity(a); setActivityError(''); } },
        (e: unknown) => { if (live && token === request) setActivityError(userError(t, e)); });
    };
    reload();
    const unsubscribe = onLiveRefresh(reload);
    return () => { live = false; unsubscribe(); };
  }, [businessId, userId, t]));

  const header = <PageHeader title={member?.name ?? c.teamTitle} sub={member ? `${member.role === 'owner' ? c.owner : member.role === 'manager' ? c.manager : c.crew} · ${member.email}` : undefined} back={() => router.back()} />;
  if (!member) return <Screen header={header}>{team.data ? <Notice text={c.notOnTeam} tone="soft" /> : <T muted>{c.loading}</T>}</Screen>;

  const assigned = new Set(team.data!.assignments.filter((a) => a.user_id === userId).map((a) => a.job_id));
  const jobs = sample.jobs.filter((j) => assigned.has(j.id));
  const jobTitle = (id: string) => sample.jobs.find((j) => j.id === id)?.title ?? '';
  const manage = canManagePerson(auth.role, member.role) && member.user_id !== auth.session?.user.id;
  const photos = activity?.filter((a) => a.kind === 'photo') ?? [];
  const other = activity?.filter((a) => a.kind !== 'photo') ?? [];
  const icon: Record<api.Activity['kind'], IconName> = { photo: 'camera', note: 'file-text', hours: 'clock', work: 'tool', receipt: 'file-text' };
  const title = (a: api.Activity) =>
    a.kind === 'hours' ? `${fill(c.hours, { hours: f.qty(a.amount ?? 0) })}${a.text ? ` · ${a.text}` : ''}`
      : a.kind === 'work' ? `${a.amount && a.amount !== 100 ? `${f.qty(a.amount)} × ` : ''}${a.text}` : a.text;

  return (
    <Screen header={header}>
      {action.error ? <Notice text={action.error} tone="danger" icon="alert-circle" /> : null}

      {member.status === 'active' ? <>
        {member.role === 'manager' ? <Notice text={c.managerSeesAll} tone="soft" icon="info" /> : null}
        <T v="eyebrow">{c.assigned}</T>
        <Card style={{ paddingVertical: 4 }}>
          {jobs.length ? jobs.map((j, i) => <View key={j.id}>
            {i ? <Hair /> : null}
            <ListRow icon="briefcase" title={j.title} sub={j.address} onPress={() => router.push(`/job/${j.id}`)} />
          </View>) : <T muted style={{ paddingVertical: 12 }}>{c.notAssigned}</T>}
        </Card>
        {can(auth.role, 'assignJobs') ? <Button label={c.assign} icon="plus" variant="outline" onPress={() => setAssignOpen(true)} /> : null}
        <Sheet open={assignOpen} onClose={() => setAssignOpen(false)} title={c.assign}>
          {sample.jobs.filter((j) => j.group !== 'done' || assigned.has(j.id)).map((j) => (
            <Checkbox key={j.id} label={`${j.title} · ${j.address}`} value={assigned.has(j.id)}
              onChange={(on) => { if (businessId) void action.run(() => api.assignJob(businessId, member.user_id, j.id, on)); }} />
          ))}
          <Button label={c.done} onPress={() => setAssignOpen(false)} />
        </Sheet>
      </> : null}

      <T v="eyebrow">{c.activity}</T>
      {activityError ? <Notice text={activityError} tone="danger" icon="alert-circle" /> : null}
      {!activity && !activityError ? <T muted>{c.loading}</T> : null}
      {activity && !activity.length ? <T muted>{c.nothingYet}</T> : null}
      {photos.length ? <Card style={{ gap: 10 }}>
        <T v="label">{c.photos}</T>
        <Row style={{ flexWrap: 'wrap' }}>
          {photos.slice(0, 24).map((a) => <PhotoThumb key={a.id} path={a.storagePath!} onPress={() => router.push(`/photo/${a.id}`)} />)}
        </Row>
      </Card> : null}
      {other.length ? <Card style={{ paddingVertical: 4 }}>
        {other.map((a, i) => <View key={`${a.kind}:${a.id}`}>
          {i ? <Hair /> : null}
          <ListRow icon={icon[a.kind]} title={title(a)} sub={`${fill(c.onJob, { job: jobTitle(a.jobId) })} · ${f.date(a.at.slice(0, 10))}`}
            onPress={() => router.push(`/job/${a.jobId}`)} />
        </View>)}
      </Card> : null}

      {manage ? <Card style={{ gap: 10 }}>
        {can(auth.role, 'changeRoles') ? (
          <Button label={member.role === 'crew' ? c.makeManager : c.makeCrew} icon="shield" variant="outline" disabled={action.busy}
            onPress={() => { if (businessId) void action.run(() => api.changeRole(businessId, member.user_id, member.role === 'crew' ? 'manager' : 'crew')); }} />
        ) : null}
        {confirmRemove ? <>
          <Notice text={c.removeHelp} tone="flag" icon="alert-triangle" />
          <Button label={c.removeConfirm} variant="danger" disabled={action.busy} onPress={() => {
            if (businessId) void action.run(() => api.removeMember(businessId, member.user_id)).then((ok) => { if (ok) router.back(); });
          }} />
          <Button label={c.cancel} variant="outline" onPress={() => setConfirmRemove(false)} />
        </> : <Button label={c.removePerson} icon="user-x" variant="outline" onPress={() => setConfirmRemove(true)} />}
      </Card> : null}
    </Screen>
  );
}
