import { db, ok } from './db-client';
import type { Unit } from './types';

export type TeamRole = 'owner' | 'manager' | 'crew';

/** The signed-in person's place in a business. Pending people have no access until approved. */
export interface TeamMembership {
  businessId: string;
  businessName: string;
  role: TeamRole;
  status: 'pending' | 'active';
  name: string;
  crewSeesPrices: boolean;
}

/** Reads only the signed-in person's own membership, before any business data loads. */
export async function loadTeamMembership(): Promise<TeamMembership | null> {
  const rows = ok(await db().rpc('team_me')) as { business_id: string; business_name: string; role: string; status: string; name: string; crew_sees_prices: boolean }[] | null;
  if (!rows?.length) return null;
  const r = rows[0];
  if (rows.length !== 1 || !['owner', 'manager', 'crew'].includes(r.role) || !['pending', 'active'].includes(r.status)) {
    throw Object.assign(new Error('Membership unavailable'), { code: 'owner_only' });
  }
  return { businessId: r.business_id, businessName: r.business_name, role: r.role as TeamRole, status: r.status as 'pending' | 'active', name: r.name, crewSeesPrices: r.crew_sees_prices };
}

// ---------- joining

/** Returns the business name. The person then waits for an owner or manager to approve them. */
export async function requestToJoin(code: string): Promise<string> {
  return ok(await db().rpc('request_to_join', { p_code: code })) as string;
}
export async function leaveTeam() { ok(await db().rpc('leave_team')); }

/** Invite codes look like KILN-7K4P-2QXM-9TRB; people may type them with spaces or in lower case. */
export function cleanCode(text: string): string | null {
  const s = text.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^KILN/, '');
  return /^[A-Z0-9]{12}$/.test(s) ? `KILN-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}` : null;
}

// ---------- owners and managers

export interface TeamMember {
  user_id: string; name: string; email: string; role: TeamRole; status: 'pending' | 'active';
  joined_at: string; last_active: string | null; open_jobs: number;
}
export interface TeamAssignment { user_id: string; job_id: string }
export interface TeamInvite { id: string; name: string; role: 'manager' | 'crew'; expires_at: string; requested_user_id: string | null; revoked_at: string | null }
export interface TeamSettings { hasTeam: boolean; crewSeesPrices: boolean; managersSeeCosts: boolean }
export interface ChangeRequest { id: string; job_id: string; description: string; status: 'open' | 'done' | 'dismissed'; created_by: string | null; created_at: string }
export interface ReviewItem { id: string; name: string; unit: Unit; unit_cents: number | null; created_by: string | null }

export async function loadTeam(businessId: string) {
  const [settings, members, assignments, invites, changes, review] = await Promise.all([
    db().from('businesses').select('has_team, crew_sees_prices, managers_see_costs').eq('id', businessId).maybeSingle<{ has_team: boolean; crew_sees_prices: boolean; managers_see_costs: boolean }>(),
    db().rpc('team_members', { p_business: businessId }),
    db().from('team_job_assignments').select('user_id, job_id').eq('business_id', businessId),
    db().from('team_invites').select('id, name, role, expires_at, requested_user_id, revoked_at').eq('business_id', businessId).is('requested_user_id', null).is('revoked_at', null).order('created_at', { ascending: false }),
    db().from('change_requests').select('id, job_id, description, status, created_by, created_at').eq('business_id', businessId).eq('status', 'open').order('created_at', { ascending: false }),
    db().from('price_list_items').select('id, name, unit, unit_cents, created_by').eq('business_id', businessId).eq('needs_review', true),
  ]);
  const s = ok(settings);
  return {
    settings: { hasTeam: !!s?.has_team, crewSeesPrices: !!s?.crew_sees_prices, managersSeeCosts: !!s?.managers_see_costs } as TeamSettings,
    members: ok(members) as TeamMember[],
    assignments: ok(assignments) as TeamAssignment[],
    invites: (ok(invites) as TeamInvite[]).filter((i) => new Date(i.expires_at) > new Date()),
    changes: ok(changes) as ChangeRequest[],
    review: ok(review) as ReviewItem[],
  };
}

/** Owner only (the server refuses anyone else). */
export async function saveTeamSettings(businessId: string, patch: Partial<TeamSettings>) {
  const row: Record<string, boolean> = {};
  if (patch.hasTeam !== undefined) row.has_team = patch.hasTeam;
  if (patch.crewSeesPrices !== undefined) row.crew_sees_prices = patch.crewSeesPrices;
  if (patch.managersSeeCosts !== undefined) row.managers_see_costs = patch.managersSeeCosts;
  const result = ok(await db().from('businesses').update(row).eq('id', businessId).select('id'));
  if (!result?.length) throw Object.assign(new Error('Owner only'), { code: 'owner_only' });
}

export async function createInvite(businessId: string, name: string, role: 'manager' | 'crew'): Promise<string> {
  return ok(await db().rpc('create_team_invite', { p_business: businessId, p_name: name, p_role: role })) as string;
}
export async function revokeInvite(id: string) { ok(await db().rpc('revoke_team_invite', { p_id: id })); }
export async function approveMember(businessId: string, userId: string) { ok(await db().rpc('approve_member', { p_business: businessId, p_user: userId })); }
export async function declineMember(businessId: string, userId: string) { ok(await db().rpc('decline_member', { p_business: businessId, p_user: userId })); }
export async function changeRole(businessId: string, userId: string, role: 'manager' | 'crew') { ok(await db().rpc('change_member_role', { p_business: businessId, p_user: userId, p_role: role })); }
export async function removeMember(businessId: string, userId: string) { ok(await db().rpc('remove_member', { p_business: businessId, p_user: userId })); }
export async function assignJob(businessId: string, userId: string, jobId: string, assigned: boolean) {
  ok(await db().rpc('assign_team_job', { p_business: businessId, p_user: userId, p_job: jobId, p_assigned: assigned }));
}
export async function closeChangeRequest(id: string, status: 'done' | 'dismissed') {
  ok(await db().from('change_requests').update({ status }).eq('id', id));
}
export async function clearPriceReview(id: string) {
  ok(await db().from('price_list_items').update({ needs_review: false }).eq('id', id));
}

/** What one person added, newest first, for their page on the Team tab. */
export interface Activity { kind: 'photo' | 'note' | 'hours' | 'work' | 'receipt'; id: string; jobId: string; at: string; text: string; amount?: number; storagePath?: string }
export async function loadActivity(businessId: string, userId: string): Promise<Activity[]> {
  const [photos, notes, hours, work, receipts] = await Promise.all([
    db().from('photos').select('id, job_id, storage_path, tag, created_at').eq('business_id', businessId).eq('created_by', userId).order('created_at', { ascending: false }).limit(60),
    db().from('notes').select('id, job_id, body, created_at').eq('business_id', businessId).eq('created_by', userId).order('created_at', { ascending: false }).limit(60),
    db().from('time_entries').select('id, job_id, hundredths, note, created_at').eq('business_id', businessId).eq('created_by', userId).order('created_at', { ascending: false }).limit(60),
    db().from('work_items').select('id, job_id, description, qty_hundredths, created_at').eq('business_id', businessId).eq('created_by', userId).order('created_at', { ascending: false }).limit(60),
    db().from('receipts').select('id,store,created_at,receipt_items(receipt_item_jobs(job_id))').eq('business_id', businessId).eq('created_by', userId).order('created_at', { ascending: false }).limit(60),
  ]);
  type P = { id: string; job_id: string; storage_path: string; tag: string | null; created_at: string };
  type N = { id: string; job_id: string; body: string; created_at: string };
  type H = { id: string; job_id: string; hundredths: number; note: string; created_at: string };
  type W = { id: string; job_id: string; description: string; qty_hundredths: number; created_at: string };
  type R = { id: string; store: string; created_at: string; receipt_items: { receipt_item_jobs: { job_id: string }[] }[] };
  return [
    ...(ok(photos) as P[]).map((r): Activity => ({ kind: 'photo', id: r.id, jobId: r.job_id, at: r.created_at, text: r.tag ?? '', storagePath: r.storage_path })),
    ...(ok(notes) as N[]).map((r): Activity => ({ kind: 'note', id: r.id, jobId: r.job_id, at: r.created_at, text: r.body })),
    ...(ok(hours) as H[]).map((r): Activity => ({ kind: 'hours', id: r.id, jobId: r.job_id, at: r.created_at, text: r.note, amount: r.hundredths })),
    ...(ok(work) as W[]).map((r): Activity => ({ kind: 'work', id: r.id, jobId: r.job_id, at: r.created_at, text: r.description, amount: r.qty_hundredths })),
    ...(ok(receipts) as R[]).flatMap((r): Activity[] => [...new Set(r.receipt_items.flatMap((item) => item.receipt_item_jobs.map((job) => job.job_id)))]
      .map((jobId) => ({ kind: 'receipt', id: `${r.id}:${jobId}`, jobId, at: r.created_at, text: r.store }))),
  ].sort((a, b) => b.at.localeCompare(a.at));
}

/** A short-lived link to show a private job photo. */
export async function photoLink(path: string): Promise<string> {
  const { data, error } = await db().storage.from('job-photos').createSignedUrl(path, 600);
  if (error) throw error;
  return data.signedUrl;
}

// ---------- crew

export interface CrewJob { id: string; title: string; address: string; customer_name: string; customer_phone: string; customer_lang: 'en' | 'es'; is_open: boolean; created_at: string }
export interface CrewLine { description: string; unit?: Unit; kind?: string; qty_hundredths: number; unit_cents: number | null; excluded?: boolean }
export interface CrewJobDetail {
  job: { id: string; title: string; address: string; private_note: string; customer_name: string; customer_phone: string; customer_lang: 'en' | 'es'; is_open: boolean; prices: boolean };
  people: { user_id: string; name: string }[];
  photos: { id: string; storage_path: string; tag: string | null; taken_at: string; created_by: string | null }[];
  notes: { id: string; body: string; created_at: string; created_by: string | null }[];
  hours: { id: string; worked_on: string; hundredths: number; note: string; created_by: string | null }[];
  work: { id: string; description: string; unit: Unit; qty_hundredths: number; unit_cents: number | null; kind: string; created_by: string | null; created_at: string }[];
  changes: { id: string; description: string; status: string; created_by: string | null; created_at: string }[];
  receipts?: { id: string; store: string; purchased_on: string | null; items: number; created_by: string | null }[];
  estimate: { number: string; sent: boolean; signed: boolean; scope: { notes?: string; details?: string; exclusions?: string; location?: string }; lines: CrewLine[] } | null;
  invoice: { number: string; sent: boolean; paid: boolean; lines: CrewLine[] } | null;
}
export interface CrewPriceItem { id: string; ref: string; name: string; unit: Unit; unit_cents: number | null; priced: boolean; needs_review: boolean }

export async function loadCrewJobs(): Promise<CrewJob[]> { return ok(await db().rpc('team_assigned_jobs')) as CrewJob[]; }
export async function loadCrewJob(jobId: string): Promise<CrewJobDetail> { return ok(await db().rpc('team_job', { p_job: jobId })) as CrewJobDetail; }
export async function loadCrewPriceList(): Promise<CrewPriceItem[]> { return ok(await db().rpc('team_price_list')) as CrewPriceItem[]; }
export async function crewAddWork(id: string, jobId: string, itemId: string, qtyHundredths: number) {
  ok(await db().rpc('team_add_work', { p_id: id, p_job: jobId, p_item: itemId, p_qty: qtyHundredths }));
}
export async function crewAddPriceItem(id: string, name: string, unit: Unit, cents: number | null) {
  ok(await db().rpc('team_add_price_item', { p_id: id, p_name: name, p_unit: unit, p_cents: cents }));
}
/** A receipt for one assigned job: every item goes to that job. */
export async function crewAddReceipt(id: string, jobId: string, r: { store: string; number: string; date: string; taxCents: number; items: { id: string; name: string; costCents: number }[] }) {
  ok(await db().rpc('team_add_receipt', {
    p_id: id, p_job: jobId, p_store: r.store, p_number: r.number, p_date: r.date, p_tax_cents: r.taxCents,
    p_items: r.items.map((i) => ({ id: i.id, name: i.name, cost_cents: i.costCents })),
  }));
}
export async function crewSuggestChange(id: string, jobId: string, description: string) {
  ok(await db().rpc('team_suggest_change', { p_id: id, p_job: jobId, p_description: description }));
}
export async function crewRemoveMine(kind: 'hours' | 'note' | 'work' | 'change', id: string) {
  ok(await db().rpc('team_remove_mine', { p_kind: kind, p_id: id }));
}
export async function logTeamHours(id: string, jobId: string, hundredths: number, note: string) {
  ok(await db().rpc('team_log_hours', { p_id: id, p_job: jobId, p_hundredths: hundredths, p_note: note }));
}
export async function addTeamNote(id: string, jobId: string, body: string) {
  ok(await db().rpc('team_add_note', { p_id: id, p_job: jobId, p_body: body }));
}
export async function saveTeamPhoto(businessId: string, jobId: string, photo: { id: string; localUri: string; takenAt: string }, tag: 'before' | 'during' | 'after') {
  const { photoBytes } = await import('@/lib/photo-file');
  const path = `${businessId}/${jobId}/${photo.id}.jpg`;
  const upload = await db().storage.from('job-photos').upload(path, await photoBytes(photo.localUri), { contentType: 'image/jpeg', upsert: false });
  if (upload.error && !/exist|duplicate/i.test(upload.error.message)) throw upload.error;
  ok(await db().rpc('team_save_photo', { p_id: photo.id, p_job: jobId, p_taken_at: photo.takenAt, p_tag: tag }));
}
