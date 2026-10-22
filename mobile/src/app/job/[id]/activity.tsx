import { router, useLocalSearchParams } from 'expo-router';

import { ActivityDays, useJobActivity } from '@/components/job-activity';
import { PageHeader, Screen, T } from '@/components/ui';
import { jobById } from '@/data/selectors';
import { useLang } from '@/i18n';

/** Everything captured on the job, by day. The job page shows only the latest few. */
export default function JobActivity() {
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
