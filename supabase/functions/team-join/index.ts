import { createClient } from '@supabase/supabase-js';
import { cors, hashToken, reply, serviceClient, setting } from '../_shared/invoice.ts';
import { joinInput } from './input.ts';

// No membership is created on an email address or signup claim alone. The caller
// must be signed in AND prove fresh possession of that exact account's email inbox.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'failed' });
  try {
    if (Number(req.headers.get('content-length') ?? 0) > 2048) return reply(413, { error: 'failed' });
    const raw = await req.text();
    if (raw.length > 2048) return reply(413, { error: 'failed' });
    const input = joinInput(JSON.parse(raw));
    if (!input) return reply(400, { error: 'failed' });
    const auth = req.headers.get('authorization') ?? '';
    const caller = createClient(setting('SUPABASE_URL'), setting('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false },
    });
    const identity = await caller.auth.getUser(auth.replace(/^Bearer /i, ''));
    const user = identity.data.user;
    if (identity.error || !user?.email) return reply(401, { error: 'signed_out' });
    const service = serviceClient();
    const invite = await service.from('team_invites').select('email,expires_at,accepted_at,revoked_at').eq('token_hash', await hashToken(input.token)).maybeSingle();
    if (invite.error || !invite.data || invite.data.revoked_at || Date.parse(invite.data.expires_at) <= Date.now() || invite.data.email !== user.email.toLowerCase()) return reply(404, { error: 'invitation_unavailable' });
    // A separate Auth client has no inherited caller session and cannot change it.
    const emailAuth = createClient(setting('SUPABASE_URL'), setting('SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
    if (input.action === 'send_code') {
      if (invite.data.accepted_at) return reply(409, { error: 'invitation_unavailable' });
      const sent = await emailAuth.auth.signInWithOtp({ email: user.email, options: { shouldCreateUser: false } });
      if (sent.error) return reply(sent.error.status === 429 ? 429 : 503, { error: sent.error.status === 429 ? 'too_many' : 'email_unavailable' });
      return reply(200, { sent: true });
    }
    const verified = await emailAuth.auth.verifyOtp({ email: user.email, token: input.code, type: 'email' });
    if (verified.error || verified.data.user?.id !== user.id || verified.data.user.email?.toLowerCase() !== user.email.toLowerCase()) return reply(400, { error: 'bad_code' });
    const accepted = await service.rpc('accept_team_invite', { p_token: input.token, p_user: user.id });
    if (accepted.error) return reply(409, { error: accepted.error.code === '23514' && accepted.error.message === 'account already has a business' ? 'account_has_business' : 'invitation_unavailable' });
    return reply(200, { businessId: accepted.data, role: 'helper' });
  } catch {
    return reply(400, { error: 'failed' });
  }
});
