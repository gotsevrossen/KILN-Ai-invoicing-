# Team roles: what was built (Nov 17 2026)

Built from `docs/team-roles-plan-2026-11-17.md`. Deployed to the hosted server (`ssjshfjkkgcqjvvsjsnk`) the same day, together with the 9 earlier migrations that weren't there yet. Backups taken first: `builds/backups/hosted-schema-2026-11-17.sql` and `hosted-data-2026-11-17.sql` (git-ignored).

## Roles

- **Owner:** everything. Only the owner changes business settings (name, trades, pricing, payments, AI switch), roles, managers, pay rates and Stripe.
- **Manager:** runs jobs, customers, estimates, change orders, invoices, payments, the price list and packages. Invites, approves and removes crew. Can be assigned jobs by the owner, another manager or themselves; the assignment only marks the jobs they look after, since managers already see and edit every job. Sees pay rates and profit only when the owner turns on "Managers see pay and profit".
- **Crew member:** sees only jobs assigned to them. Adds work done (from the price list, with the list's price), hours, photos, notes and scope-change suggestions. Can remove their own entries until the invoice is sent. Adds new price list items (marked for review), never changes existing ones. Sees the estimate and invoice read-only; prices only when the owner turns on "Crew see prices".

The rules live in `lib/permissions.ts` (app, with tests) and `supabase/migrations/20261117120000_team_roles.sql` (server). The server is the boundary.

## How it differs from the plan

- **Crew don't read business tables.** Instead of opening each table to crew, crew use narrow server functions (`team_job`, `team_assigned_jobs`, `team_price_list`, `team_add_work`, `team_add_price_item`, `team_suggest_change`, `team_remove_mine`, plus the existing hours, note and photo functions). These choose exactly which columns crew see. Crew have their own screens under `app/crew/`.
- **Managers use the existing rules.** `is_owner()` and `is_member()` now mean "owner or active manager". Owner-only things use the new `is_business_owner()`. Pay rates and budgets use `can_see_costs()`.
- **Typed-in work without a price** isn't possible for crew. They add the item to the price list (optionally with a price), and a manager prices it.
- **No "More" tab.** Capture moved out of the bar, so teams get Home · Jobs · Team with Capture as the round button on the right.
- **Crew Capture completed:** the same Receipt, Voice, Photo and Note tiles as the owner, using only assigned open jobs. Voice becomes a reviewed note. Photos retain their IDs and remaining files when an upload needs retrying. Receipts use the shared form and the same mandatory work-only AI review as owner receipts. Crew may call only the receipt-reading and receipt-review AI tasks.
- **Not built yet:** crew signature collection on site, other crew AI helpers, "added by" labels on the owner's job page (the person page on the Team tab shows everything they added), an example team in example mode, and push notifications. These are separate from the completed Capture request.

## Joining

Owner or manager taps **Invite someone** on the Team tab, types a name and picks a role. KILN makes a one-time code such as `KILN-7K4P-2QXM-9TRB` (about 59 random bits; only its hash is stored; 7 days). The worker signs up, taps **I was invited to a team**, types the code, and waits on the **Waiting for approval** page. The owner or manager taps **Approve** on the Team tab (Home shows a card). Approving creates the worker's planning and pay-rate record (rate 0) for the owner. The old email-code join and the `team-join` function were removed.

## Database (`20261117120000_team_roles.sql`)

- `business_members`: roles `owner`, `manager`, `crew` (old `helper` rows became `crew`); `name`, `status` (`pending`, `active`), `invited_by`, `approved_by`, `approved_at`.
- `businesses`: `has_team`, `crew_sees_prices`, `managers_see_costs`.
- `created_by` on customers, jobs, price list items, hours, notes, photos, voice notes, estimates, change orders, receipts, invoices and work items. A trigger always sets it to the signed-in person; the app can't fake it. Existing rows were set to the business owner (or the helper who added them).
- `price_list_items.needs_review`; new `change_requests` table.
- `team_invites`: `role`, `name`, `created_by`, `requested_user_id`, `requested_at`. Earlier unused invites were cancelled.
- Functions: `create_team_invite`, `request_to_join`, `team_me`, `approve_member`, `decline_member`, `change_member_role`, `remove_member`, `leave_team`, `team_members`, `assign_team_job`, plus the crew functions above.

Tests: `supabase/tests/database/team_roles.test.sql` (53 checks: owner, manager, crew, pending, removed and another business). The old `team_access.test.sql` was replaced. Also `src/lib/permissions.test.ts`.

## Capture completion and deployment

`20261117130000_crew_capture.sql` is deployed to the same hosted project. It adds `team_add_receipt` (one transaction, assigned open jobs only), `use_ai_quota_for` (crew limited to `receipt` and `receiptReview`), receipt summaries on crew jobs, and receipt timestamps in team activity. Changed retries, missing prices and null items are rejected without partial records. Crew summaries expose no complete receipt total that could include another job's costs. The owner's person page includes uploaded receipts, linked to their jobs.

The `ai` Edge Function is deployed and active at version 7, including the work-only policy and task-aware quota check. The hosted service-packages table is also present. Backups immediately before this deployment are `builds/backups/hosted-schema-before-capture-2026-11-17.sql` and `hosted-data-before-capture-2026-11-17.sql`.

Validation: 308 database assertions in an isolated local test database (including 19 Capture assertions), 155 app tests, and 26 AI task tests passed. Lint and TypeScript checks passed after regenerating the local route declarations. A visual browser check was blocked by Computer Use because it could not verify the Windows browser URL; phone camera, microphone and gesture testing remains manual.

## Tab bar

`components/tab-bar.tsx`: a floating white card holding the pages, with an orange slider that springs to the selected page, and Capture as a separate round black button on the right (orange while you're on Capture). Used by both the owner tabs and the crew tabs.

## To check on a real phone

Sign up a second account, join with a code, approve it, assign a job, add work, hours, photos and a note as crew, then check the Team tab person page as the owner. Also check the tab bar on iPhone and Android, in light and dark mode.

## Manager assignments (Nov 17, later)

`20261117150000_manager_assignments.sql` lets `assign_team_job` put an active manager on a job, not only crew. The owner or any active manager can do it, including assigning themselves. The owner and pending people can't be assigned. A manager's assignment gives no crew access (`team_can_work()` still requires the crew role). The job page's "Who works on this job?" sheet lists managers first, then crew, with "(You)" on the signed-in person; a manager's person page shows their assigned jobs and the Assign button. Tests: `supabase/tests/database/job_assignments.test.sql`. Deployed to the hosted server the same day; backups taken first: `builds/backups/hosted-schema-before-manager-assign-2026-11-17.sql` and `hosted-data-before-manager-assign-2026-11-17.sql`.

## Owner assignments, Unassigned page, swipe between tabs (Nov 17, later)

- `20261117160000_owner_assignments.sql`: the owner can be assigned too (by themselves or a manager). Same rule as managers: it only marks who looks after the job; `team_can_work()` still requires the crew role. `job_assignments.test.sql` now has 14 checks. Deployed to the hosted server the same day (backups `hosted-schema-before-owner-assign-2026-11-17.sql`, `hosted-data-before-owner-assign-2026-11-17.sql`).
- One shared "Who works on this job?" sheet (`AssignSheet` in `features/team/job-team.tsx`): owner, then managers, then crew, with "(You)" and role labels.
- **Unassigned jobs** page (`app/team/unassigned.tsx`, `features/team/unassigned-screen.tsx`): active jobs nobody is on, for owners and managers, opened from the top of the Team tab (shows the count). Tapping a job opens the assign sheet with an "Open job" button. Every person's page now shows their assigned jobs; the Team list shows open-job counts for anyone who has some.
- Swipe between tabs: a clear sideways swipe on a tab page moves to the next page (left) or the previous one (right), in the bar's order, ending with Capture. The tab bar registers the order (`components/tab-swipe.ts`); `Screen` with `tabs` holds the gesture (25-point start, gives way to vertical scrolling, off while a sheet is open and on the web).
