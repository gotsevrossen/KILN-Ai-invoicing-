// Run: node --test scripts/kiln-gate.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { pathAllowed, keyAllowed, requestAllowed, startGate } from './kiln-gate.mjs';

const jwt = (claims) => ['e30', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'sig'].join('.');
const user = jwt({ role: 'authenticated', sub: 'u1' });
const admin = jwt({ role: 'service_role' });

test('only the parts of the server the app uses are reachable', () => {
  for (const ok of ['/auth/v1/token?grant_type=password', '/rest/v1/jobs?select=*', '/storage/v1/object/job-photos/a/b.jpg', '/functions/v1/ai']) {
    assert.ok(pathAllowed(ok), ok);
  }
  for (const bad of ['/mcp', '/pg/tables', '/pg/query', '/graphql/v1', '/realtime/v1/websocket', '/', '/auth/v1/admin/users', '/AUTH/V1/admin/users', '/rest/v1/../../pg/query', '/rest/v1/%2e%2e/pg', '/rest/v1//x', '/rest/v1\\..\\pg', '/rest/v1/./x', 'http://evil/rest/v1/']) {
    assert.ok(!pathAllowed(bad), bad);
  }
});

test('admin keys are refused, user keys pass', () => {
  assert.ok(keyAllowed(undefined));
  assert.ok(keyAllowed('sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'));
  assert.ok(keyAllowed(`Bearer ${user}`));
  assert.ok(keyAllowed(jwt({ role: 'anon' })));
  assert.ok(!keyAllowed('sb_secret_abc'));
  assert.ok(!keyAllowed(`Bearer ${admin}`));
  assert.ok(!keyAllowed(jwt({ role: 'supabase_admin' })));
  assert.ok(!keyAllowed(jwt({ sub: 'no-role' })));
  assert.ok(!keyAllowed('a.not-json.c'));
  assert.ok(!keyAllowed('anything-else'));
});

test('admin keys are refused in any header or the query', () => {
  const req = (url, headers = {}) => ({ url, headers });
  assert.ok(requestAllowed(req('/rest/v1/jobs', { apikey: 'sb_publishable_x', authorization: `Bearer ${user}` })));
  assert.ok(!requestAllowed(req('/rest/v1/jobs', { apikey: 'sb_publishable_x', authorization: `Bearer ${admin}` })));
  assert.ok(!requestAllowed(req('/rest/v1/jobs', { apikey: 'sb_secret_abc' })));
  assert.ok(!requestAllowed(req('/rest/v1/jobs?apikey=sb_secret_abc')));
  assert.ok(!requestAllowed(req('/rest/v1/jobs?apikey=sb_publishable_x&apikey=sb_secret_abc')));
});

test('the gate forwards allowed requests and refuses the rest', async () => {
  const seen = [];
  const backend = http.createServer((req, res) => { seen.push(req.url); res.end('ok'); }).listen(0, '127.0.0.1');
  await new Promise((r) => backend.on('listening', r));
  const gate = startGate(0, backend.address().port);
  await new Promise((r) => gate.on('listening', r));
  const base = `http://127.0.0.1:${gate.address().port}`;
  try {
    assert.equal((await fetch(`${base}/rest/v1/jobs`)).status, 200);
    assert.equal((await fetch(`${base}/mcp`, { method: 'POST', body: '{}' })).status, 404);
    assert.equal((await fetch(`${base}/rest/v1/jobs`, { headers: { apikey: 'sb_secret_abc' } })).status, 404);
    assert.deepEqual(seen, ['/rest/v1/jobs']);
  } finally {
    gate.close();
    backend.close();
  }
});
