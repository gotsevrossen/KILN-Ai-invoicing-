import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { useAuth } from '@/data/auth';
import * as api from '@/data/team-access';
import { can } from '@/lib/permissions';

type TeamData = Awaited<ReturnType<typeof api.loadTeam>>;
interface TeamState { businessId: string | null; data: TeamData | null; error: unknown; busy: boolean }

// One copy for the whole app, so the tab bar, Home, Team and the job page agree.
let current: TeamState = { businessId: null, data: null, error: null, busy: false };
let request = 0;
const listeners = new Set<() => void>();
const set = (next: Partial<TeamState>) => { current = { ...current, ...next }; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

async function load(businessId: string) {
  const token = ++request;
  set({ businessId, busy: true, error: null, ...(current.businessId === businessId ? {} : { data: null }) });
  try {
    const data = await api.loadTeam(businessId);
    if (token === request) set({ data, busy: false });
  } catch (error) {
    if (token === request) set({ error, busy: false });
  }
}

/**
 * Team data for owners and managers: people, invites, assignments, things to check, and the
 * owner's team switches. Nothing loads for crew, example mode, or before sign-in.
 */
export function useTeam() {
  const auth = useAuth();
  const state = useSyncExternalStore(subscribe, () => current);
  const businessId = can(auth.role, 'teamTab') && auth.role ? auth.businessId : null;
  useEffect(() => {
    if (businessId && current.businessId !== businessId) void load(businessId);
    if (!businessId && current.businessId) { request++; set({ businessId: null, data: null, error: null, busy: false }); }
  }, [businessId]);
  const reload = useCallback(() => { if (businessId) void load(businessId); }, [businessId]);
  const data = state.businessId === businessId ? state.data : null;
  const nameOf = useCallback((userId: string | null | undefined) =>
    data?.members.find((m) => m.user_id === userId)?.name ?? null, [data]);
  return {
    businessId,
    data,
    error: state.businessId === businessId ? state.error : null,
    busy: state.busy,
    reload,
    nameOf,
    /** The Team tab shows for managers, and for owners who said they have a team. */
    showTab: !!businessId && (auth.role === 'manager' || !!data?.settings.hasTeam),
  };
}

/** After a team change, refresh what everyone sees. */
export function refreshTeam() {
  if (current.businessId) void load(current.businessId);
}
