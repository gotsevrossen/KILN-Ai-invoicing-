// Gatekeeper between the public phone address (Tailscale Funnel) and the local Supabase server.
// Local Supabase also serves developer tools (/mcp runs any SQL, /pg is the dashboard's backend)
// with no login, so only the parts the app uses go through, and never with an admin key.
// Node built-ins only. Usage: node scripts/kiln-gate.mjs [listenPort] [targetPort]
import http from 'node:http';
import { pathToFileURL } from 'node:url';

// No realtime: the app doesn't use it. /auth/v1/admin needs the admin key, refused below anyway.
export const ALLOWED_PREFIXES = ['/auth/v1/', '/rest/v1/', '/storage/v1/', '/functions/v1/'];
const BLOCKED_PREFIXES = ['/auth/v1/admin'];
const USER_ROLES = new Set(['anon', 'authenticated']);

export function pathAllowed(rawUrl) {
  const path = String(rawUrl).split('?')[0];
  // Refuse anything the server might read differently than this check: encoded or doubled slashes, dots, backslashes.
  if (!path.startsWith('/') || /%2e|%2f|%5c|\\|\/\/|\/\.\.?(\/|$)/i.test(path)) return false;
  const lower = path.toLowerCase();
  if (BLOCKED_PREFIXES.some((p) => lower.startsWith(p))) return false;
  return ALLOWED_PREFIXES.some((p) => path.startsWith(p));
}

// A key is fine if it's the public (publishable) key or a sign-in token for a normal user.
// Admin keys (sb_secret_…, service_role tokens) and anything unreadable are refused.
export function keyAllowed(value) {
  if (value === undefined || value === null) return true;
  const token = String(value).replace(/^Bearer\s+/i, '').trim();
  if (token === '') return true;
  if (token.startsWith('sb_publishable_')) return true;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof claims === 'object' && claims !== null && USER_ROLES.has(claims.role);
  } catch {
    return false;
  }
}

export function requestAllowed(req) {
  if (!pathAllowed(req.url)) return false;
  const query = new URLSearchParams(String(req.url).split('?')[1] ?? '');
  const keys = [req.headers.apikey, req.headers.authorization, ...query.getAll('apikey')];
  return keys.every((k) => (Array.isArray(k) ? k.every(keyAllowed) : keyAllowed(k)));
}

export function startGate(listenPort, targetPort) {
  const refuse = (res) => {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  };
  const server = http.createServer((req, res) => {
    if (!requestAllowed(req)) return refuse(res);
    // Not behind Cloudflare, so this header can only be faked; signatures record the signer's address from it.
    const { 'cf-connecting-ip': _faked, ...headers } = req.headers;
    const upstream = http.request(
      { host: '127.0.0.1', port: targetPort, method: req.method, path: req.url, headers },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('KILN server is not reachable');
    });
    req.pipe(upstream);
  });
  // Live connections aren't used by the app; refuse upgrades rather than pass them through unchecked.
  server.on('upgrade', (_req, socket) => socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n'));
  server.headersTimeout = 30_000;
  server.requestTimeout = 300_000;
  server.listen(listenPort, '127.0.0.1');
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const listenPort = Number(process.argv[2] ?? 54330);
  const targetPort = Number(process.argv[3] ?? 54321);
  if (!Number.isInteger(listenPort) || !Number.isInteger(targetPort)) process.exit(2);
  startGate(listenPort, targetPort).on('listening', () => {
    console.log(`KILN gate listening on http://127.0.0.1:${listenPort} -> 127.0.0.1:${targetPort}`);
  });
}
