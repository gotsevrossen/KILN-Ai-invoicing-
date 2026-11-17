import { db, ok } from '@/data/db-client';
import { emptyOperations, type Budget, type LaborCost, type Operations, type Visit, type Worker } from './model';

/** Check access before rendering any internal costs. RLS also enforces every query. */
export async function loadOperations(businessId: string): Promise<Operations> {
  const result = await db().auth.getUser();
  if (result.error || !result.data.user) throw new Error('signed out');
  const user = result.data.user;
  const membership = ok(await db().from('business_members').select('role').eq('business_id', businessId).eq('user_id', user.id).maybeSingle());
  if (membership?.role !== 'owner') throw Object.assign(new Error('owner only'), { code: 'owner_only' });
  const [workers, visits, labor, budgets] = await Promise.all([
    db().from('operations_workers').select('*').eq('business_id', businessId).order('name'),
    db().from('operations_visits').select('*').eq('business_id', businessId).order('starts_at'),
    db().from('operations_labor_costs').select('*').eq('business_id', businessId),
    db().from('operations_budgets').select('*').eq('business_id', businessId),
  ]);
  return { workers: ok(workers) as Worker[], visits: ok(visits) as Visit[], labor: ok(labor) as LaborCost[], budgets: ok(budgets) as Budget[] };
}
export async function saveWorker(worker: Worker): Promise<void> { ok(await db().from('operations_workers').upsert(worker)); }
export async function saveVisit(visit: Visit): Promise<void> { ok(await db().from('operations_visits').upsert(visit)); }
export async function removeVisit(id: string, businessId: string): Promise<void> { ok(await db().from('operations_visits').delete().eq('id', id).eq('business_id', businessId)); }
export async function saveLabor(cost: LaborCost): Promise<void> { ok(await db().from('operations_labor_costs').upsert(cost)); }
export async function removeLabor(id: string, businessId: string): Promise<void> { ok(await db().from('operations_labor_costs').delete().eq('time_entry_id', id).eq('business_id', businessId)); }
export async function saveBudget(budget: Budget): Promise<void> { ok(await db().from('operations_budgets').upsert(budget)); }

/** Example changes last for this app session and never become real company records. */
let example: Operations = emptyOperations();
export function exampleOperations(): Operations { return example; }
export function setExampleOperations(next: Operations): void { example = next; }
