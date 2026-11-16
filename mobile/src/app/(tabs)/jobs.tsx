import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Card, Field, Hair, IconButton, Notice, PageHeader, Pill, Row, Screen, Segmented, T, type Tone } from '@/components/ui';
import * as sample from '@/data/sample';
import { customerOf, hoursFor, jobAmount, jobGroup, jobOverdueDays, jobStatus, type JobStatus } from '@/data/selectors';
import { useStore } from '@/data/store';
import type { Job, JobGroup } from '@/data/types';
import { useLang } from '@/i18n';
import { useFormat } from '@/lib/format';
import { font } from '@/theme/tokens';

const statusTone: Record<JobStatus, Tone | 'outline'> = {
  invoiceReady: 'accent',
  sent: 'outline',
  needsSignature: 'flag',
  inProgress: 'soft',
  estimateSent: 'soft',
  overdue: 'danger',
  repeat: 'soft',
  viewed: 'outline',
  paid: 'inverse',
  needsEstimate: 'flag',
};

export default function Jobs() {
  const { t } = useLang();
  const f = useFormat();
  const { state } = useStore();
  const [group, setGroup] = useState<JobGroup>('active');
  const [query, setQuery] = useState('');

  // Group once per data change; search reuses prices/status for only the selected tab.
  const grouped = useMemo(() => {
    const groups: Record<JobGroup, Job[]> = { active: [], done: [], paid: [] };
    for (const job of sample.jobs) groups[jobGroup(state, job)].push(job);
    return groups;
  }, [state]);
  const rows = useMemo(() => grouped[group].map((job) => {
    const customer = customerOf(job);
    const status = jobStatus(state, job);
    return { job, customer, status, amount: jobAmount(state, job),
      hours: job.pricing === 'hourly' ? hoursFor(state, job.id) : 0,
      overdueDays: status === 'overdue' ? jobOverdueDays(state, job) : 0,
      search: [job.title, job.address, customer.name].join('\n').toLowerCase() };
  }), [state, grouped, group]);
  const q = query.trim().toLowerCase();
  const list = q ? rows.filter((row) => row.search.includes(q)) : rows;

  const kindLine = (job: Job, hours: number) => {
    if (job.repeatWeekday !== undefined) return t('jobs.repeatsEvery', { day: f.weekday(job.repeatWeekday) });
    if (job.pricing === 'hourly') return t('jobs.hourly', { hours: f.qty(hours) });
    return t('jobs.flat');
  };

  const statusLabel = (status: JobStatus, overdueDays: number) =>
    status === 'overdue' ? t('home.overdueDays', { count: overdueDays }) : t(`jobs.status.${status}`);

  return (
    <Screen
      header={
        <PageHeader title={t('jobs.title')} right={<IconButton icon="plus" label={t('common.newJob')} tone="accent" onPress={() => router.push('/new-job')} />} />
      } tabs>
      <Field value={query} onChangeText={setQuery} placeholder={t('jobs.search')} accessibilityLabel={t('jobs.search')} returnKeyType="search" />
      <Segmented
        label={t('jobs.title')}
        value={group}
        onChange={setGroup}
        options={[
          { key: 'active', label: `${t('jobs.active')} ${grouped.active.length}` },
          { key: 'done', label: `${t('jobs.done')} ${grouped.done.length}` },
          { key: 'paid', label: `${t('jobs.paid')} ${grouped.paid.length}` },
        ]}
      />

      {list.length === 0 ? <Notice text={t('jobs.noResults')} icon="search" tone="soft" /> : null}

      {list.map(({ job, customer, status, overdueDays, amount, hours }) => {
        return (
          <Card key={job.id} onPress={() => router.push(`/job/${job.id}`)} label={job.title}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }} gap={10}>
              <T style={{ flex: 1, fontFamily: font.bold, fontSize: 19, lineHeight: 24 }}>{job.title}</T>
              <Pill label={statusLabel(status, overdueDays)} tone={statusTone[status]} />
            </Row>
            <T v="small" muted>
              {customer.name} · {job.workOrder ? t('job.workOrder', { number: job.workOrder }) : job.address}
            </T>
            <Hair />
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="small" muted>{kindLine(job, hours)}</T>
              <T v="money">{f.money(amount)}</T>
            </Row>
          </Card>
        );
      })}
      <View />
    </Screen>
  );
}
