import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Hair, ListRow, Notice, PageHeader, Screen, T } from '@/components/ui';
import { useAuth } from '@/data/auth';
import type { Job } from '@/data/types';
import { useLang } from '@/i18n';
import { can } from '@/lib/permissions';

import { AssignSheet } from './job-team';
import { teamText } from './text';
import { useUnassignedJobs } from './unassigned-jobs';
import { useTeam } from './use-team';

/** Open jobs that have nobody on them, for owners and managers. Tap one to assign people. */
export function UnassignedScreen() {
  const { lang } = useLang();
  const c = teamText(lang);
  const auth = useAuth();
  const team = useTeam();
  const jobs = useUnassignedJobs();
  const [picked, setPicked] = useState<Job | null>(null);
  const header = <PageHeader title={c.unassigned} back={() => router.back()} />;
  if (!can(auth.role, 'assignJobs')) return <Screen header={header}><Notice text={c.ownerOnly} tone="soft" /></Screen>;
  return (
    <Screen header={header}>
      {team.error ? <><Notice text={c.failed} tone="danger" icon="alert-circle" /><Button label={c.retry} variant="outline" onPress={team.reload} /></> : null}
      {!team.data && !team.error ? <T muted>{c.loading}</T> : null}
      {team.data && !jobs.length ? <Notice text={c.allAssigned} tone="soft" icon="check" /> : null}
      {jobs.length ? <Card style={{ paddingVertical: 4 }}>
        {jobs.map((j, i) => <View key={j.id}>
          {i ? <Hair /> : null}
          <ListRow icon="briefcase" iconTone="accent" title={j.title} sub={j.address} onPress={() => setPicked(j)} />
        </View>)}
      </Card> : null}
      {picked ? (
        <AssignSheet jobId={picked.id} title={picked.title} open onClose={() => setPicked(null)}
          footer={<Button label={c.openJob} variant="outline" onPress={() => { const id = picked.id; setPicked(null); router.push(`/job/${id}`); }} />} />
      ) : null}
    </Screen>
  );
}
