# Owner planning, job cost and controlled helper access

This implementation is code for local review. No invitations have been sent, no real memberships created, and no migration or Edge Function has been deployed by this work.

## Owner planning and actual costs

Settings → Team & schedule opens `/operations`: add workers, enter loaded labor costs (wages plus employer burden, separately from the selling rate), archive/restore workers, and create/edit/remove dated visits. One visit assigns one worker; a crew uses multiple visits. The server serializes visit checks on the worker row and blocks overlapping windows; adjacent visits are valid. Times are entered and displayed in the device's local time and stored as timestamps.

The job's Profitability page uses existing billed time entries, not a duplicate hour ledger. Owners attribute entries to a worker; the server freezes that worker's loaded rate. Future rate changes do not rewrite old attributions. An uncosted entry makes contribution/margin unavailable until assigned. Current invoice/estimate revenue excludes sales tax; assigned receipt costs include purchase tax and do not include selling markup. Additional actual costs and labor/material/other cost budgets are editable. Results are gross job contribution against recorded costs, before general overhead/payment fees; absent receipts or hours can still overstate that position. Selling-price work items are not treated as costs. These are owner-only RLS tables; a hidden button is not the security boundary.

## Helper invitations and access

Owners open Helper access from Team & schedule, choose an existing worker, and create a seven-day invitation bound to a normalized email. The server stores only the hash of a random 64-character token. The owner shares the returned link using the device share sheet; KILN does not automatically email the invitation. Invitations can be revoked. Owners assign specific jobs and can remove helper access immediately; historical work remains.

The invitation page accepts `?join` return routing through sign-in. Acceptance requires a signed-in account AND a fresh email OTP sent to that exact Auth account email. Hosted signup currently auto-confirms accounts, so `email_confirmed_at` alone is deliberately not accepted as proof of inbox ownership. The `team-join` Edge Function calls Auth `verifyOtp` for email, verifies the returned user matches the original signed-in caller, then calls a service-only SQL acceptance function. Authenticated/anonymous clients have no EXECUTE grant on that acceptance function. No client-supplied role or user ID chooses the new membership. The membership role is fixed to `helper`. An account already belonging to a business cannot join another.

Helpers open a separate `/team-work` surface. Narrow RPC result columns expose only assigned job title/address/customer contact, open/closed status, and the helper's own hours/notes. Helpers can log their own hours, write notes, and upload new JPEG evidence on assigned open jobs. They cannot issue/send documents, change rates, read company/internal costs, list other jobs, or grant assignments. Helper hour capture inserts the existing time entry and frozen owner-cost attribution in one transaction; stable IDs make retries safe. Helpers' photo capture does not request or store GPS. New media is retained locally for a retry while the helper screen remains open; this surface does not claim a complete durable offline queue.

## Database permission boundary

`is_member()` was the legacy whole-business authorization check used by owner data policies and owner functions. It now delegates to `is_owner()`, so existing broad financial/table/storage policies remain owner-only when helpers exist. `has_membership()` is the literal membership check for future team features. Helpers use isolated security-definer RPCs with explicit assignment + helper-membership checks; they do not receive a raw jobs/customers SELECT policy, which would leak private notes or rates. The helper role can still select its own `business_members` row to choose its app surface.

`use_ai_quota()` now requires an owner. Service-role Edge Functions must independently authorize owner actions because service-role access bypasses RLS. The owner payment handler is gated by role in the root integration. Future functions must not infer ownership from any membership row.

Operations workers, cost attributions, budgets and visits use owner-only RLS. Composite foreign keys prevent cross-business job/time/worker references. Helper account mappings and assignments cascade when membership is removed, leaving historic hours, costs and photos intact. Existing short-lived signed file URLs cannot be recalled; helpers have no company-file listing or raw photo read policy and only their own currently assigned evidence can get a new signed URL.

## Runtime setup and validation

Apply migrations through `20261116180000_team_access.sql`, and deploy `team-join` with bearer validation inside the handler (`verify_jwt=false` in the local function config). Publish the Expo routes `/join/[token]`, `/team-work` and `/team-admin`. `EXPO_PUBLIC_TEAM_URL` optionally sets the invitation site's origin; it defaults to the same `https://kiln.expo.app` origin used by the payment pages.

Local Auth's magic-link template should use `supabase/templates/team-otp.html` so `signInWithOtp` actually displays `.Token`. The unchanged hosted default provider/template may send a link instead, has restricted recipient/rate limits, and cannot be assumed to support this code-entry flow. Hosted rollout needs a supported custom email template and functioning email delivery (custom SMTP or an appropriate Supabase plan/configuration). Do not advertise live helper onboarding until a real email-code/acceptance flow is tested on the selected backend.

Tests added: operations money/input/overlap tests; `operations.test.sql` (24 assertions for owner/helper/isolation/cost snapshots/scheduling); `team_access.test.sql` (30 assertions for invitation grants, email binding, role isolation, own hours, job assignment and revocation); `team-join/input.test.ts` for bounded Edge input. The SQL suite must be run against migrations; input tests alone are not a full Auth/email integration test. A real-device camera/permission test and email-provider end-to-end test remain necessary before release.
