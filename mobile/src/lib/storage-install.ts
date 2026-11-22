// Web: the browser already has localStorage. Phones use storage-install.native.ts.
// Hosted signup links confirm the email on the server. Discard the returned
// credentials before navigation can leave them in the browser's history.
if (typeof window !== 'undefined' && window.location.pathname === '/') {
  const confirmation = new URLSearchParams(window.location.hash.slice(1));
  if (confirmation.has('access_token') || confirmation.has('refresh_token')) {
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  }
}
export const authStorage = typeof localStorage !== 'undefined' ? localStorage : undefined;
