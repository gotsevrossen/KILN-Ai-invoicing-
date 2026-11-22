import { BodyTooLarge, readObject } from '../_shared/request.ts';
import { createClient } from '@supabase/supabase-js';
import { cors, hashToken, newToken, reply, serviceClient, setting, tokenShape } from '../_shared/invoice.ts';
import { validAcceptance } from './input.ts';

// Public actions require an unguessable, expiring, document-scoped token. Prepare requires
// a verified owner session and the SQL function checks ownership + server issuance again.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'failed' });
  try {
    const body = await readObject(req, 10_000);
    if (body.action === 'prepare') {
      if (typeof body.jobId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.jobId)) return reply(400, { error: 'failed' });
      const auth = req.headers.get('authorization') ?? '';
      const owner = createClient(setting('SUPABASE_URL'), setting('SUPABASE_ANON_KEY'), {
        global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false },
      });
      const me = await owner.auth.getUser(auth.replace(/^Bearer /, ''));
      if (me.error || !me.data.user) return reply(401, { error: 'signed_out' });
      const base = setting('KILN_PAY_URL');
      if (!/^https:\/\/[^/\s]+$/.test(base)) return reply(503, { error: 'not_set_up' });
      const token = newToken();
      const made = await owner.rpc('prepare_estimate_access', { p_job_id: body.jobId, p_hash: await hashToken(token) });
      if (made.error) return reply(409, { error: 'not_ready' });
      const link = await owner.from('estimate_access_links').select('estimate_id,expires_at').eq('id', made.data).single();
      if (link.error) return reply(500, { error: 'failed' });
      return reply(200, { url: `${base}/quote/${token}`, documentId: link.data.estimate_id, expiresAt: link.data.expires_at });
    }
    if (!tokenShape(body.token)) return reply(404, { error: 'not_found' });
    const db = serviceClient();
    const hash = await hashToken(body.token);
    if (body.action === 'changeView') {
      const result = await db.rpc('view_change_order_link', { p_hash: hash });
      return result.error ? reply(404, { error: 'not_found' }) : reply(200, result.data);
    }
    if (body.action === 'changeAnswer') {
      if (typeof body.hash !== 'string' || !/^[0-9a-f]{64}$/.test(body.hash) || typeof body.accept !== 'boolean' ||
        (body.accept && (body.agreed !== true || typeof body.name !== 'string' || body.name.length > 120))) {
        return reply(400, { error: 'not_ready' });
      }
      const result = await db.rpc('answer_change_order_link', { p_hash: hash, p_snapshot_hash: body.hash,
        p_name: body.accept ? body.name : null, p_accept: body.accept });
      return result.error ? reply(409, { error: 'not_ready' }) : reply(200, result.data);
    }
    if (body.action === 'view') {
      const result = await db.rpc('view_estimate_access', { p_hash: hash });
      return result.error ? reply(404, { error: 'not_found' }) : reply(200, result.data);
    }
    if (body.action === 'deposit') {
      const base = setting('KILN_PAY_URL');
      if (!/^https:\/\/[^/\s]+$/.test(base)) return reply(503, { error: 'not_set_up' });
      const token = newToken();
      const made = await db.rpc('deposit_for_estimate_access', { p_hash: hash, p_request_id: crypto.randomUUID(), p_token_hash: await hashToken(token) });
      return made.error ? reply(409, { error: 'not_ready' }) : reply(200, { url: `${base}/collect/${token}` });
    }
    if (body.action === 'accept') {
      if (!validAcceptance(body)) return reply(400, { error: 'not_ready' });
      const result = await db.rpc('accept_estimate_access', { p_hash: hash, p_snapshot_hash: body.hash,
        p_name: (body.name as string).trim(), p_consent: body.consent,
        p_device: (req.headers.get('user-agent') ?? '').slice(0, 200),
        p_ip: (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0] ?? '').slice(0, 64) });
      return result.error ? reply(409, { error: 'not_ready' }) : reply(200, { acceptedAt: result.data });
    }
    if (body.action === 'decline') {
      if (typeof body.hash !== 'string' || !/^[0-9a-f]{64}$/.test(body.hash)) return reply(400, { error: 'not_ready' });
      const result = await db.rpc('decline_estimate_access', { p_hash: hash, p_snapshot_hash: body.hash });
      return result.error ? reply(409, { error: 'not_ready' }) : reply(200, { declinedAt: result.data });
    }
    return reply(400, { error: 'failed' });
  } catch (e) {
    if (e instanceof BodyTooLarge) return reply(413, { error: 'bad_request' });
    return reply(400, { error: 'failed' });
  }
});
