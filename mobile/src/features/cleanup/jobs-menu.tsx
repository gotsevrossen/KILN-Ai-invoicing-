import { router } from 'expo-router';
import { useState } from 'react';

import { aiErrorText } from '@/components/ai-parts';
import { Button, Card, Chip, Field, ListRow, Notice, Row, T } from '@/components/ui';
import { aiReady, findJobs } from '@/data/ai';
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
  /** Jobs KILN found for a search, with the words searched. */
  ai: { query: string; ids: string[] } | null;
}

export const NO_FILTERS: JobFilters = { customerId: null, personId: null, tradeId: null, jobTypeId: null, ai: null };

export const filtersOn = (f: JobFilters) => !!(f.customerId || f.personId || f.tradeId || f.jobTypeId || f.ai);

const scopeOf = (state: State, job: Job) => state.estimates[job.id]?.scope;

/** True when the job passes every filter that's set. */
export function useJobFilter(filters: JobFilters) {
  const { state } = useStore();
  const team = useTeam();
  const assignments = team.data?.assignments ?? [];
  const aiIds = filters.ai ? new Set(filters.ai.ids) : null;
  return (job: Job) => {
    if (filters.customerId && job.customerId !== filters.customerId) return false;
    if (filters.personId) {
      const people = assignments.filter((a) => a.job_id === job.id).map((a) => a.user_id);
      if (filters.personId === 'none' ? people.length > 0 : !people.includes(filters.personId)) return false;
    }
    const scope = scopeOf(state, job);
    if (filters.tradeId && scope?.tradeId !== filters.tradeId) return false;
    if (filters.jobTypeId && scope?.jobTypeId !== filters.jobTypeId) return false;
    if (aiIds && !aiIds.has(job.id)) return false;
    return true;
  };
}

/**
 * The Jobs page's menu: narrow the list by customer, person, trade or job type, ask KILN to find
 * jobs by the kind of work ("sink repair" also finds drain cleaning and leak fixes), and open the
 * documents saved from removed jobs.
 */
export function JobsMenu({ filters, onChange, shown, total }: { filters: JobFilters; onChange: (f: JobFilters) => void; shown: number; total: number }) {
  const { lang, t } = useLang();
  const c = cleanupText(lang);
  const you = teamText(lang).you;
  const { state } = useStore();
  const auth = useAuth();
  const team = useTeam();
  const [query, setQuery] = useState(filters.ai?.query ?? '');
  const [finding, setFinding] = useState(false);
  const [aiError, setAiError] = useState('');
  const set = (patch: Partial<JobFilters>) => onChange({ ...filters, ...patch });

  const jobs = sample.jobs;
  const customers = [...new Map(jobs.map((j) => [j.customerId, customerOf(j)])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const trades = [...new Set(jobs.map((j) => scopeOf(state, j)?.tradeId).filter((x): x is TradeId => !!x))];
  const types = [...new Set(jobs
    .filter((j) => !filters.tradeId || scopeOf(state, j)?.tradeId === filters.tradeId)
    .map((j) => scopeOf(state, j)?.jobTypeId).filter((x): x is string => !!x))];
  const people = team.showTab && team.data ? team.data.members.filter((m) => m.status === 'active') : [];
  const canAi = aiReady(state.mode);

  const find = async () => {
    const q = query.trim();
    if (!q) { set({ ai: null }); return; }
    setFinding(true);
    setAiError('');
    try {
      const ids = await findJobs({
        query: q,
        // what describes the work only: no customer names, prices or private notes
        jobs: jobs.slice(0, 300).map((j) => {
          const draft = state.estimates[j.id];
          const scope = draft?.scope;
          const text = [scope?.details, scope?.location, ...(draft?.lines ?? []).slice(0, 8).map((l) => l.description)].filter(Boolean).join('; ');
          return {
            id: j.id, title: j.title.slice(0, 200),
            trade: scope?.tradeId ? t(`trades.${scope.tradeId}`) : '',
            jobType: scope?.jobTypeId ? t(`jobTypes.${scope.jobTypeId}` as 'jobTypes.leak').slice(0, 80) : '',
            scope: text.slice(0, 600),
          };
        }),
      });
      set({ ai: { query: q, ids } });
    } catch (e) {
      setAiError(aiErrorText(t, e));
    } finally {
      setFinding(false);
    }
  };

  return (
    <Card style={{ gap: 12 }}>
      <T v="eyebrow">{c.aiSearch}</T>
      {canAi ? <>
        <Field value={query} onChangeText={setQuery} placeholder={c.aiSearchHint} accessibilityLabel={c.aiSearch} returnKeyType="search" onSubmitEditing={() => void find()} />
        <Button label={finding ? c.aiFinding : c.aiFind} icon="search" variant="dark" disabled={finding || !query.trim()} onPress={() => void find()} />
        {filters.ai ? <Notice text={(filters.ai.ids.length ? c.aiFound : c.aiNone).replace('%{count}', String(filters.ai.ids.length)).replace('%{query}', filters.ai.query)} tone="soft" icon="search" /> : null}
        {aiError ? <Notice text={aiError} tone="danger" icon="alert-circle" /> : null}
      </> : <T v="small" muted>{c.aiOff}</T>}

      <T v="eyebrow">{c.filters}</T>
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
          {types.map((id) => <Chip key={id} label={t(`jobTypes.${id}` as 'jobTypes.leak')} selected={filters.jobTypeId === id} onPress={() => set({ jobTypeId: id })} />)}
        </Row>
      </> : null}

      {filtersOn(filters) ? <>
        <T v="small" muted>{c.showing.replace('%{count}', String(shown)).replace('%{total}', String(total))}</T>
        <Button label={c.clear} icon="x" variant="outline" onPress={() => { setQuery(''); onChange(NO_FILTERS); }} />
      </> : null}

      {state.mode === 'connected' && (auth.role === 'owner' || auth.role === 'manager') ? (
        <ListRow icon="archive" title={c.savedDocs} sub={c.savedDocsHelp} chevron onPress={() => router.push('/saved-documents')} />
      ) : null}
    </Card>
  );
}
