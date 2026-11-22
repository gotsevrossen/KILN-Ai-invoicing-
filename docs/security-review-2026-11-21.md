# KILN security review · November 21, 2026

The review covered the mobile and web apps, Supabase permissions and functions, the payment ledger, customer links, the laptop gateway, and dependency advisories. The hosted database migration, six Edge Functions and web app are deployed.

| Finding | Fix |
| --- | --- |
| A removed manager could reopen the previous business's cached jobs and pending edits. Private deep links could also mount before sign-in finished. | The app checks the user and business before restoring or replaying the journal. Private screens wait for authentication. Offline crew job details require a cached assignment, and a server denial invalidates the cached detail. |
| A receipt or voice note could point cleanup at a file in another business's folder. Managers could write fields reserved for the owner's deletion decision. | The database checks the source business when collecting and queuing storage keys. Only the cleanup procedures can change the warning and decision fields. |
| A client could set a sent invoice's paid time directly, submit audit entries, or add signature records outside the current signing flow. | Settlement requires a payment procedure. Database triggers record document activity, and signing requires a server procedure with validated evidence. The database also removes client privileges to truncate tables or install triggers. |
| Native refresh tokens lived in ordinary SQLite storage. The local Auth configuration also allowed sign-in before email confirmation. | The native app migrates session records to AES-GCM encryption with a device-protected key. Signup supports emailed confirmation codes, and the local Auth configuration requires confirmation and recent authentication for password changes. |
| Public functions read entire bodies before applying size limits. The laptop proxy forwarded client-supplied identity headers. | Functions enforce byte limits while reading. The proxy strips routing and identity headers. Private JSON responses request no caching and customer photo URLs are capped by invoice-link expiry. |
| Disabling checkout could discard a later Stripe settlement. Concurrent views could record multiple first-open events. | Signed settlement can finish against an existing payment even with new checkout disabled. Invoice first-open events are recorded in the same database transaction as the first view. |
| The mobile dependency tree contained packages with known advisories. | The lockfile selects patched versions for the affected Expo, lint and development-tunnel dependencies. |

## Verification

The local run passed 471 database assertions on an isolated Supabase schema, 184 mobile tests, 46 Edge Function tests, five gateway tests and 36 service-script checks. TypeScript and lint passed. Expo exported Android, iOS and web bundles. npm and Deno reported zero known vulnerabilities in the dependency graphs checked.

Browser checks used a fresh signed-out profile and mocked remote services. They covered a private account deep link, signup confirmation, and an unauthenticated customer invoice link. A separate storage check exercised session migration, Unicode data, a temporarily locked key store, and sign-out during a pending write. Hosted checks are recorded below.

## Hosted release verification

- The hosted database accepted migration `20261121140000`. Read-only checks confirmed that signed-in clients cannot truncate invoices, insert signatures directly, or invoke legacy signing. The current signature procedure remains usable. The preserved legacy file-deletion queue contained zero entries at rollout.
- Supabase reports all six updated functions active. Anonymous requests to the two private functions required authentication. The public invoice and estimate functions returned a non-cacheable response for a missing customer link.
- The web app at [kiln.expo.app](https://kiln.expo.app) served the expected release bytes and security headers on the checked routes. A fresh Chrome profile reached sign-in from a private account deep link and cleared confirmation credentials from the landing URL.
- Team testing uses Supabase's built-in confirmation link. An isolated account could sign in only after redeeming its link, and was removed after the check. The test generated the link through Auth administration and did not exercise inbox delivery. Hosted password changes require recent authentication. The default site and recovery redirects use the published HTTPS site. Existing accounts keep their earlier confirmation status.
- The laptop launcher now checks Docker port bindings before starting its local backend. The separate local development database had an older schema and a non-loopback port binding when checked. See [local backend port bindings](local-services.md#local-backend-port-bindings) before using laptop mode.

Older clients calling the three-argument signing procedures need an update to sign. Existing signature records and historical audit entries retain their original evidence. Offline job data remains available on a previously authorized device during a connection loss. The app learns about remote revocation when it next reaches the server.
