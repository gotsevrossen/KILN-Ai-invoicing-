import { router, useLocalSearchParams } from 'expo-router';

import { ActivityDays, useJobActivity } from '@/components/job-activity';
import { RecordGate } from '@/components/record-gate';
import { PageHeader, Screen, T } from '@/components/ui';
import { hasJob, jobById } from '@/data/selectors';
import { useLang } from '@/i18n';

/** Everything captured on the job, by day. The job page shows only the latest few. */
function JobActivity() {
  const { t } = useLang();
  const { id } = useLocalSearchParams<{ id: string }>();
  const job = jobById(id);
  const activity = useJobActivity(job.id);

  return (
    <Screen header={<PageHeader title={t('job.activity')} sub={job.title} back={() => router.back()} />}>
      {activity.length === 0 ? <T v="body" muted>{t('job.noTimeline')}</T> : <ActivityDays items={activity} />}
    </Screen>
  );
}

/** Waits for the record to load (a link or refresh can arrive first) instead of crashing. */
export default function JobActivityRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecordGate found={() => hasJob(id)}><JobActivity /></RecordGate>;
}
