import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { NewJobForm } from '@/components/new-job';
import { Sheet } from '@/components/sheet';
import { Card, Field, Hair, IconButton, Notice, PageHeader, Pill, Row, Screen, Segmented, T, type Tone } from '@/components/ui';
import * as sample from '@/data/sample';
import { customerOf, hoursFor, jobAmount, jobGroup, jobStatus, type JobStatus } from '@/data/selectors';
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
  const [newOpen, setNewOpen] = useState(false);

  const q = query.trim().toLowerCase();
  const matches = (job: Job) =>
    !q || [job.title, job.address, customerOf(job).name].some((s) => s.toLowerCase().includes(q));
  // jobs move between tabs as they go: invoice sent -> Done, paid -> Paid
  const count = (g: JobGroup) => sample.jobs.filter((j) => jobGroup(state, j) === g).length;
  const list = sample.jobs.filter((j) => jobGroup(state, j) === group && matches(j));

  const kindLine = (job: Job) => {
    if (job.repeatWeekday !== undefined) return t('jobs.repeatsEvery', { day: f.weekday(job.repeatWeekday) });
    if (job.pricing === 'hourly') return t('jobs.hourly', { hours: f.qty(hoursFor(state, job.id)) });
    return t('jobs.flat');
  };

  const statusLabel = (job: Job, status: JobStatus) =>
    status === 'overdue' ? t('home.overdueDays', { count: job.overdueDays ?? 0 }) : t(`jobs.status.${status}`);

  return (
    <Screen
      header={
        <PageHeader title={t('jobs.title')} right={<IconButton icon="plus" label={t('common.newJob')} tone="dark" onPress={() => setNewOpen(true)} />} />
      } tabs>
      <Field value={query} onChangeText={setQuery} placeholder={t('jobs.search')} accessibilityLabel={t('jobs.search')} returnKeyType="search" />
      <Segmented
        label={t('jobs.title')}
        value={group}
        onChange={setGroup}
        options={[
          { key: 'active', label: `${t('jobs.active')} ${count('active')}` },
          { key: 'done', label: `${t('jobs.done')} ${count('done')}` },
          { key: 'paid', label: `${t('jobs.paid')} ${count('paid')}` },
        ]}
      />

      {list.length === 0 ? <Notice text={t('jobs.noResults')} icon="search" tone="soft" /> : null}

      {list.map((job) => {
        const status = jobStatus(state, job);
        return (
          <Card key={job.id} onPress={() => router.push(`/job/${job.id}`)} label={job.title}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }} gap={10}>
              <T style={{ flex: 1, fontFamily: font.bold, fontSize: 19, lineHeight: 24 }}>{job.title}</T>
              <Pill label={statusLabel(job, status)} tone={statusTone[status]} />
            </Row>
            <T v="small" muted>
              {customerOf(job).name} · {job.workOrder ? t('job.workOrder', { number: job.workOrder }) : job.address}
            </T>
            <Hair />
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="small" muted>{kindLine(job)}</T>
              <T v="money">{f.money(jobAmount(state, job))}</T>
            </Row>
          </Card>
        );
      })}
      <View />
      <Sheet open={newOpen} onClose={() => setNewOpen(false)} title={t('newJob.title')}>
        <NewJobForm
          onCreated={(id) => {
            setNewOpen(false);
            setGroup('active');
            router.push(`/job/${id}`);
          }}
        />
      </Sheet>
    </Screen>
  );
}
