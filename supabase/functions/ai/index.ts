import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

import { AiError, checkInput, crewOnly, isTask, runTask } from './tasks.ts';

// POST /functions/v1/ai  { task, input }  ->  the task's checked answer, or { error: code }.
// The Claude key lives only here (supabase/.env locally, project secrets when hosted).
// Each request must come from a signed-in owner or manager (crew: receipts only), and counts toward
// the business's daily limit.
// Job text and photos are passed through to Claude and never stored or logged here.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// three photos of about 5 MB each, as text
const MAX_BODY = 22_000_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'bad_request' });

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return reply(503, { error: 'not_set_up' });
  const auth = req.headers.get('Authorization');
  if (!auth) return reply(401, { error: 'signed_out' });

  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) throw new AiError(413, 'too_big');
    let body: { task?: unknown; input?: unknown };
    try {
      body = JSON.parse(raw);
    } catch {
      throw new AiError(400, 'bad_request');
    }
    if (!isTask(body.task)) throw new AiError(400, 'bad_request');
    const input = checkInput(body.task, body.input);

    // as the signed-in user, so the database checks who they are and counts the request
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // crew members may only read and check receipts and use the chat; owners and managers may use every task
    const quota = await supabase.rpc('use_ai_quota_for', { p_task: body.task });
    if (quota.error) {
      if (quota.error.code === 'KL429') throw new AiError(429, 'limit');
      if (quota.error.code === '42501') throw new AiError(403, 'owner_only');
      throw new AiError(401, 'signed_out');
    }

    // the chat asks the database who is calling: crew only ever talk about their assigned jobs, with no money
    let task = input;
    let crew = false;
    if (body.task === 'assistant') {
      const scope = await supabase.rpc('ai_chat_scope');
      if (scope.error) throw new AiError(403, 'owner_only');
      const who = scope.data as { role?: string; jobIds?: string[] | null };
      if (who.role === 'crew') {
        crew = true;
        task = crewOnly(input as Parameters<typeof crewOnly>[0], Array.isArray(who.jobIds) ? who.jobIds : []);
      }
    }

    const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });
    return reply(200, await runTask(client, body.task, task, crew));
  } catch (e) {
    if (e instanceof AiError) return reply(e.status, { error: e.code });
    if (e instanceof Anthropic.RateLimitError) return reply(429, { error: 'busy' });
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      console.error('ai: the Claude key was refused');
      return reply(503, { error: 'key_refused' });
    }
    if (e instanceof Anthropic.APIError) {
      console.error(`ai: Claude error ${e.status}`);
      return reply(502, { error: 'ai_failed' });
    }
    console.error('ai: unexpected error', e instanceof Error ? e.name : typeof e);
    return reply(500, { error: 'ai_failed' });
  }
});
