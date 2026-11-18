import * as sample from '@/data/sample';
import { jobGroup } from '@/data/selectors';
import { useStore } from '@/data/store';
import type { Job } from '@/data/types';

import { useTeam } from './use-team';

/** Open jobs nobody is assigned to, for owners and managers. Empty until team data loads. */
export function useUnassignedJobs(): Job[] {
  const { state } = useStore();
  const team = useTeam();
  if (!team.data) return [];
  const assigned = new Set(team.data.assignments.map((a) => a.job_id));
  return sample.jobs.filter((j) => jobGroup(state, j) === 'active' && !assigned.has(j.id));
}
