import { useCallback } from 'react';
import { View } from 'react-native';

import { Button, Chip, Row, T } from '@/components/ui';
import { useAuth } from '@/data/auth';
import * as sample from '@/data/sample';
import { customerOf } from '@/data/selectors';
import { useStore, type State } from '@/data/store';
import type { TradeId } from '@/data/trades';
import type { Job } from '@/data/types';
import { teamText } from '@/features/team/text';
import { useTeam } from '@/features/team/use-team';
import { useLang } from '@/i18n';

import { cleanupText } from './text';

/** What the Jobs list is narrowed to. Null means "any". */
export interface JobFilters {
  customerId: string | null;
  /** A person's id, or 'none' for jobs nobody is assigned to. */
  personId: string | null;
  tradeId: TradeId | null;
  jobTypeId: string | null;
}

export const NO_FILTERS: JobFilters = { customerId: null, personId: null, tradeId: null, jobTypeId: null };

export const filtersOn = (f: JobFilters) => !!(f.customerId || f.personId || f.tradeId || f.jobTypeId);

const scopeOf = (state: State, job: Job) => state.estimates[job.id]?.scope;

/** True when the job passes every filter that's set. */
export function useJobFilter(filters: JobFilters) {
  const { state } = useStore();
  const team = useTeam();
  const assignments = team.data?.assignments;
  return useCallback((job: Job) => {
    if (filters.customerId && job.customerId !== filters.customerId) return false;
    if (filters.personId) {
      const assigned = assignments?.some((a) => a.job_id === job.id && (filters.personId === 'none' || a.user_id === filters.personId));
      if (filters.personId === 'none' ? assigned : !assigned) return false;
    }
    const scope = scopeOf(state, job);
    if (filters.tradeId && scope?.tradeId !== filters.tradeId) return false;
    if (filters.jobTypeId && scope?.jobTypeId !== filters.jobTypeId) return false;
    return true;
  }, [assignments, filters, state]);
}

/** Narrow the Jobs list by customer, person, trade or job type. */
export function JobsMenu({ filters, onChange, shown, total }: {
  filters: JobFilters; onChange: (f: JobFilters) => void; shown: number; total: number;
}) {
  const { lang, t } = useLang();
  const c = cleanupText(lang);
  const you = teamText(lang).you;
  const { state } = useStore();
  const auth = useAuth();
  const team = useTeam();
  const set = (patch: Partial<JobFilters>) => onChange({ ...filters, ...patch });

  const jobs = sample.jobs;
  const customers = [...new Map(jobs.map((j) => [j.customerId, customerOf(j)])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const trades = [...new Set(jobs.map((j) => scopeOf(state, j)?.tradeId).filter((x): x is TradeId => !!x))];
  const types = [...new Set(jobs
    .filter((j) => !filters.tradeId || scopeOf(state, j)?.tradeId === filters.tradeId)
    .map((j) => scopeOf(state, j)?.jobTypeId).filter((x): x is string => !!x))];
  const people = team.showTab && team.data ? team.data.members.filter((m) => m.status === 'active') : [];
  // a job type the owner made up has no catalog name
  const typeName = (id: string) => (id === 'custom' ? t('estimate.customType') : t(`jobTypes.${id}` as 'jobTypes.leak'));

  return (
    <View style={{ gap: 12 }}>
      <T v="label">{c.customer}</T>
      <Row style={{ flexWrap: 'wrap' }} gap={8}>
        <Chip label={c.any} selected={!filters.customerId} onPress={() => set({ customerId: null })} />
        {customers.map((cu) => <Chip key={cu.id} label={cu.name} selected={filters.customerId === cu.id} onPress={() => set({ customerId: cu.id })} />)}
      </Row>
      {people.length ? <>
        <T v="label">{c.person}</T>
        <Row style={{ flexWrap: 'wrap' }} gap={8}>
          <Chip label={c.any} selected={!filters.personId} onPress={() => set({ personId: null })} />
          {people.map((m) => <Chip key={m.user_id} label={m.user_id === auth.session?.user.id ? `${m.name} (${you})` : m.name}
            selected={filters.personId === m.user_id} onPress={() => set({ personId: m.user_id })} />)}
          <Chip label={c.unassigned} selected={filters.personId === 'none'} onPress={() => set({ personId: 'none' })} />
        </Row>
      </> : null}
      {trades.length ? <>
        <T v="label">{c.trade}</T>
        <Row style={{ flexWrap: 'wrap' }} gap={8}>
          <Chip label={c.any} selected={!filters.tradeId} onPress={() => set({ tradeId: null, jobTypeId: null })} />
          {trades.map((id) => <Chip key={id} label={t(`trades.${id}`)} selected={filters.tradeId === id} onPress={() => set({ tradeId: id, jobTypeId: null })} />)}
        </Row>
      </> : null}
      {types.length ? <>
        <T v="label">{c.jobType}</T>
        <Row style={{ flexWrap: 'wrap' }} gap={8}>
          <Chip label={c.any} selected={!filters.jobTypeId} onPress={() => set({ jobTypeId: null })} />
          {types.map((id) => <Chip key={id} label={typeName(id)} selected={filters.jobTypeId === id} onPress={() => set({ jobTypeId: id })} />)}
        </Row>
      </> : null}

      {filtersOn(filters) ? <>
        <T v="small" muted>{c.showing.replace('%{count}', String(shown)).replace('%{total}', String(total))}</T>
        <Button label={c.clear} icon="x" variant="outline" onPress={() => onChange(NO_FILTERS)} />
      </> : null}
    </View>
  );
}
