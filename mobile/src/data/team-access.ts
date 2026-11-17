import { db, ok } from './db-client';

export type TeamMembership = { businessId: string; role: 'owner' | 'helper' };
/** Reads only the signed-in user's own role before choosing an app surface. */
export async function loadTeamMembership(): Promise<TeamMembership | null> {
  const identity = await db().auth.getUser();
  if (identity.error) throw identity.error;
  const user = identity.data.user;
  if (!user) return null;
  const rows = ok(await db().from('business_members').select('business_id,role').eq('user_id', user.id).limit(2));
  if (!rows?.length) return null;
  if (rows.length !== 1 || !['owner', 'helper'].includes(rows[0].role)) throw Object.assign(new Error('Membership unavailable'), { code: 'owner_only' });
  return { businessId: rows[0].business_id as string, role: rows[0].role as 'owner' | 'helper' };
}
export interface TeamJob { id: string; title: string; address: string; customer_name: string; customer_phone: string; customer_lang: 'en' | 'es'; is_open: boolean }
export interface TeamHours { id: string; job_id: string; worked_on: string; hundredths: number; note: string }
export interface TeamNote { id: string; job_id: string; body: string }
export interface TeamMember { user_id: string; worker_id: string; name: string; email: string }
export interface TeamAssignment { business_id: string; user_id: string; job_id: string }
export interface TeamInvite { id: string; email: string; worker_id: string; expires_at: string; accepted_at: string | null; revoked_at: string | null }
export async function loadTeamWork() {
  const [jobs, hours, notes] = await Promise.all([db().rpc('team_assigned_jobs'), db().rpc('team_my_hours'), db().rpc('team_my_notes')]);
  return { jobs: ok(jobs) as TeamJob[], hours: ok(hours) as TeamHours[], notes: ok(notes) as TeamNote[] };
}
export async function loadTeamAdmin(businessId: string) {
  const [members, assignments, invites] = await Promise.all([
    db().rpc('team_members', { p_business: businessId }),
    db().from('team_job_assignments').select('*').eq('business_id', businessId),
    db().from('team_invites').select('id,email,worker_id,expires_at,accepted_at,revoked_at').eq('business_id', businessId).order('created_at', { ascending: false }),
  ]);
  return { members: ok(members) as TeamMember[], assignments: ok(assignments) as TeamAssignment[], invites: ok(invites) as TeamInvite[] };
}
export async function inviteWorker(businessId: string, workerId: string, email: string): Promise<string> { return ok(await db().rpc('create_team_invite', { p_business: businessId, p_worker: workerId, p_email: email })) as string; }
export async function revokeInvite(id: string) { ok(await db().rpc('revoke_team_invite', { p_id: id })); }
export async function removeMember(businessId: string, userId: string) { ok(await db().rpc('remove_team_member', { p_business: businessId, p_user: userId })); }
export async function assignJob(businessId: string, userId: string, jobId: string, assigned: boolean) { ok(await db().rpc('assign_team_job', { p_business: businessId, p_user: userId, p_job: jobId, p_assigned: assigned })); }
export async function logTeamHours(id: string, jobId: string, hundredths: number, note: string) { ok(await db().rpc('team_log_hours', { p_id: id, p_job: jobId, p_hundredths: hundredths, p_note: note })); }
export async function addTeamNote(id: string, jobId: string, body: string) { ok(await db().rpc('team_add_note', { p_id: id, p_job: jobId, p_body: body })); }
export async function joinTeam(action: 'send_code' | 'accept', token: string, code?: string) {
  const response = await db().functions.invoke('team-join', { body: { action, token, ...(code ? { code } : {}) } });
  if (response.error) {
    let detail: { error?: string } | null = null;
    try { detail = await response.error.context?.json(); } catch { /* no raw server error enters product copy */ }
    throw Object.assign(new Error('Team join failed'), { code: detail?.error ?? 'failed' });
  }
  return response.data as { sent?: boolean; businessId?: string; role?: 'helper' };
}

export async function saveTeamPhoto(businessId: string, jobId: string, photo: { id: string; localUri: string; takenAt: string }, tag: 'before' | 'during' | 'after') {
  const { photoBytes } = await import('@/lib/photo-file');
  const path = `${businessId}/${jobId}/${photo.id}.jpg`;
  const upload = await db().storage.from('job-photos').upload(path, await photoBytes(photo.localUri), { contentType: 'image/jpeg', upsert: false });
  if (upload.error && !/exist|duplicate/i.test(upload.error.message)) throw upload.error;
  ok(await db().rpc('team_save_photo', { p_id: photo.id, p_job: jobId, p_taken_at: photo.takenAt, p_tag: tag }));
}
