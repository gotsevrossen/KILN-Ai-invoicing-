# Team roles plan (draft for review, Nov 17 2026)

Goal: one KILN business can have an owner, managers and field workers. Each person signs in on their own phone. The business shares one price list. Owners and managers see what everyone is doing from a new **Team** tab.

Nothing here is built yet. This plan changes two earlier decisions in `CLAUDE.md`: "One login per business for now" and "helper/team logins" being out of scope. Update `CLAUDE.md` once this plan is approved.

## 1. The three roles

Name for the regular employee: **Crew member** (Spanish: *Miembro del equipo*). It's the word trades use, and it's short on buttons. Other options: "Tech", "Field worker".

| | Owner | Manager | Crew member |
|---|---|---|---|
| **Jobs** | | | |
| See all jobs | ✅ | ✅ | Only jobs assigned to them |
| Create, edit, delete jobs | ✅ | ✅ | ❌ |
| Assign workers to jobs | ✅ | ✅ | ❌ |
| **Work on a job** | | | |
| Add work done | ✅ | ✅ | ✅ on assigned jobs |
| Add hours, photos, notes, voice notes | ✅ | ✅ | ✅ on assigned jobs |
| Add receipts and sort items to jobs | ✅ | ✅ | ✅ to assigned jobs only |
| Suggest a scope change (no price, not sent) | ✅ | ✅ | ✅ (a manager prices it and sends it) |
| Remove their own uploads before the invoice is sent | ✅ | ✅ | ✅ (only their own) |
| **Customers** | | | |
| See the customer list | ✅ | ✅ | ❌ |
| See the customer's name, address and phone on an assigned job | ✅ | ✅ | ✅ |
| Private customer notes | ✅ | ✅ | ❌ |
| **Estimates, change orders, invoices** | | | |
| Create, edit, send | ✅ | ✅ | ❌ |
| Customer signs on this phone | ✅ | ✅ | ✅ on an estimate or change order a manager already made (so the crew can collect a signature on site) |
| View them | ✅ | ✅ | ✅ on assigned jobs, read only (prices hidden unless the owner turns them on) |
| Mark paid in cash or check | ✅ | ✅ | ❌ |
| **Price list and packages** | | | |
| Add a new price list item | ✅ | ✅ | ✅ (marked "Added by Maria" for a manager to check) |
| Change or delete prices and items | ✅ | ✅ | ❌ |
| Use service packages | ✅ | ✅ | ❌ (packages add billable lines) |
| Create or edit service packages | ✅ | ✅ | ❌ |
| **Team** | | | |
| Team tab | ✅ | ✅ | ❌ |
| Invite crew members | ✅ | ✅ | ❌ |
| Invite managers, change roles | ✅ | ❌ | ❌ |
| Remove someone | ✅ anyone | ✅ crew members only | ❌ |
| Worker pay rates, job costs and profit | ✅ | ❌ unless the owner turns it on | ❌ |
| **Business** | | | |
| Business settings (name, logo, tax, terms, due dates) | ✅ | ❌ | ❌ |
| Stripe and getting paid online | ✅ | ❌ | ❌ |
| Overdue invoices and money totals on Home | ✅ | ✅ | ❌ |
| AI helpers (Tell KILN, receipt scan, photo tags) | ✅ | ✅ | ✅ uses the business's daily AI limit |
| AI for estimates and customer text | ✅ | ✅ | ❌ |
| Delete the business | ✅ | ❌ | ❌ |

Rules that apply to everyone:
- The server enforces every rule above. Hiding a button in the app is never the only protection.
- Removing someone takes away their access right away. Their photos, notes, hours and work stay on the jobs.
- One person belongs to one business for now (same as today).
- Everything a person adds records who added it.

## 2. What each person sees

**Owner and manager**
- Bottom menu: **Home · Jobs · (+) Capture · Team · More**. More holds Settings, so the orange Capture button stays in the middle. A business that works alone keeps today's three tabs.
- **Home:** today's work for the whole team, things waiting for review (new price items added by crew, scope change suggestions, work added since the last invoice), and overdue invoices (managers see these too, but no profit numbers).
- **Jobs:** all jobs, with a filter by worker. Each job shows who it's assigned to.
- **Team tab:**
  1. List of people: name, role, jobs today, last thing they uploaded, and when.
  2. Tap a person: their assigned jobs (open first, then recent) and a timeline of what they added (photos, notes, hours, work, receipts).
  3. Tap one of their jobs: the normal job page, with a "Show only Maria's uploads" filter.
  4. Buttons: **Invite**, **Change role** (owner only), **Remove**, **Assign to a job**.
- **Job page:** a new "Assigned to" row to add or remove workers. Every photo, note, hours entry, work item and receipt shows who added it.
- **Invoice review:** work added by crew is labeled with their name, so the manager checks it before sending.

**Crew member**
- Bottom menu: **Home · (+) Capture · Jobs**. No money anywhere.
- **Home:** "Your jobs today" and "Your other jobs". Only jobs assigned to them. No jobs they aren't on, no amounts owed, no overdue invoices.
- **Jobs:** assigned jobs only.
- **Job page:** customer name, address, tap to call or text, the customer-visible scope, the job's private note (the internal one, not customer notes), photos, and notes. Buttons: Work done, Receipt, Photo, Note, Hours, Suggest a change. The estimate and invoice open read-only. No Job done, Send, change order pricing or packages.
- **Capture:** the job picker lists only their assigned jobs.
- **Settings:** language, theme, voice language, sign out, leave team.

## 3. Onboarding and joining

**New owner (setup):** a new question after the trades step: **"Do you work alone or with a team?"**
- *Just me*: today's app, no Team tab. They can switch on "I have a team" in Settings later.
- *Me and a team*: shows the Team tab, then an optional "Invite your crew now" step (skippable).

**Invited worker:**
1. The owner or manager taps Invite, types the worker's name, and picks Manager or Crew member. KILN makes a one-time invite link with a short code (for example `KILN-7K4P-2Q`). It's sent by text from the owner's phone, like invoices are.
2. The worker installs KILN, taps **"I was invited to a team"** on the sign-in screen, and creates an account (or signs in).
3. The worker types the code or opens the link. KILN shows "Waiting for Mike's Plumbing to approve you".
4. The owner or manager gets an **Approve / Decline** card on Home and in the Team tab, showing the worker's name and email. After approval the worker's app opens in their role.

Why approval and not an email code: email codes need KILN's own email sending service (Resend), and that isn't set up yet. Today's helper invite needs a fresh email code, which hosted Supabase can't send. With approval, a leaked code is useless without the owner tapping Approve. An email code can be added later on top.

Invites expire after 7 days and can only be used once. At most 50 can be waiting at a time. The owner can cancel one that's waiting.

## 4. Database changes

All new database changes are added as new migration files, after the 9 that aren't on the hosted server yet. Those 9 must be deployed first.

**Roles and membership**
- `business_members.role`: allow `owner`, `manager`, `crew`. Change existing `helper` rows to `crew`. Add `name`, `status` (`pending`, `active`, `removed`), `invited_by`, `approved_by`, `approved_at`, `created_at`.
- `businesses.has_team boolean default false` (the answer from onboarding) and `businesses.crew_sees_prices boolean default false`, `managers_see_costs boolean default false`.
- `team_invites`: add `role`, `short_code_hash`, `requested_user_id`, `requested_at`. Remove the need to create a planning worker first (`worker_id` becomes optional; the worker record is created on approval).
- Keep `team_worker_accounts` (links a login to the pay-rate record in `operations_workers`; owner-only).
- `team_job_assignments`: add `assigned_by`, `assigned_at`.

**Who added what**
- Add `created_by uuid default auth.uid()` to: `jobs`, `customers`, `estimates`, `line_items`, `change_orders`, `invoices`, `work_items`, `time_entries`, `notes`, `photos`, `voice_notes`, `receipts`, `receipt_items`, `price_list_items`, `service_packages`. The existing `worker_user_id` columns are copied into `created_by` and then dropped.
- `price_list_items.needs_review boolean` (true when a crew member adds it; a manager clears it).
- New `change_requests` table for crew "Suggest a change": `id, business_id, job_id, created_by, description, photo ids, status (open, priced, dismissed), change_order_id`. Price and sending stay with managers through the existing change orders.

**Permission helpers (server functions)**
- `member_role(business)` returns the signed-in person's role, or null.
- `is_manager(business)`: owner or manager.
- `can_see_job(job)`: manager, or crew member assigned to that job.
- `can_add_to_job(job)`: `can_see_job` and the job's invoice isn't sent yet.
- The existing `is_owner()` stays for owner-only things (business settings, Stripe, roles, costs).

**Permission rules, table by table** (today every table is owner-only)

| Tables | Read | Add | Change or delete |
|---|---|---|---|
| businesses | all members (crew get a narrow view: name, logo, language) | – | owner |
| business settings, Stripe accounts, payouts | owner | owner | owner |
| customers, customer_addresses | managers; crew only through their assigned jobs (name, address, phone; no private notes) | managers | managers |
| jobs | managers; crew on assigned jobs | managers | managers |
| estimates, line_items, change_orders, invoices, payments | managers; crew read-only on assigned jobs (amounts removed unless `crew_sees_prices`) | managers | managers (the existing locks on sent and signed documents still apply) |
| work_items, time_entries, notes, photos, voice_notes | managers; crew on assigned jobs | managers; crew on assigned, unsent jobs | managers; crew only their own, before the invoice is sent |
| receipts, receipt_items | managers; crew see their own receipts | managers; crew | managers; crew only their own, items only to assigned jobs |
| price_list_items | all members (crew can't see cost fields) | all members | managers |
| service_packages | managers | managers | managers |
| change_requests | managers; crew their own | managers; crew on assigned jobs | managers |
| operations_* (pay rates, budgets, labor costs) | owner (managers when `managers_see_costs`) | owner | owner |
| team_invites, business_members, team_job_assignments | managers; crew see only their own membership | through server functions only | through server functions only |
| audit_log | owner | server only | never |

For crew, parts of a row (like prices on an invoice or a customer's private notes) are hidden through narrow server views or functions, because the database's row rules can't hide single columns.

**Server functions to change**
- `sign_estimate`, `sign_change_order`, `send_invoice`, `mark_invoice_paid`, cash payment, deposit and estimate-sharing functions: allow managers, not just owners. Crew can only use signing, and only when a manager prepared the document.
- `payments` (Stripe onboarding): owner only.
- `ai` function and `use_ai_quota()`: count any active member against the business's 300-a-day limit. Crew can only use receipt scanning, Tell KILN and photo tags.
- `team-join`: replace the email code check with code plus owner approval. New functions: `request_to_join(code)`, `approve_member(user, role)`, `decline_member(user)`, `change_role(user, role)` (owner only), `remove_member(user)` (managers can remove crew only), `leave_team()`.
- Existing `team_*` helper-only functions (`team_assigned_jobs`, `team_log_hours`, and others) are retired once crew use the normal app. Keep them until the new app version is released.

**Tests (pgTAP, in `supabase/tests/database/`)**
For every table and function: owner, manager, crew assigned to the job, crew not assigned, removed member, pending member, and a person from another business. Check read, add, change and delete. This is the most important test file in this plan.

## 5. App changes

- **Role in the app:** load the role with the business (`data/auth.ts`, `data/store.tsx`). One permissions file, `lib/permissions.ts`, with `can(role, action)` for every action in section 1, plus a test file. Screens use it to hide buttons. The server still decides.
- **Loading data:** the same loaders work for crew, because the server only returns rows they're allowed to see. Screens must handle missing pieces (no customer list, no prices).
- **Saving offline:** crew changes go through the same save queue. If the server refuses a change (for example the role changed while offline), show a plain English and Spanish message from `user-errors.ts` and drop that change.
- **Tabs:** `(tabs)/_layout.tsx` picks the tabs by role and `has_team`. New tabs: `team.tsx` and `more.tsx`.
- **New screens:** `team/index` (list), `team/[userId]` (person: jobs and timeline), `team/invite`, `team/requests`, and an assignment sheet on the job page. Today's Team & schedule screens (`operations.tsx`, `team-admin.tsx`) move into the Team tab.
- **Changed screens:** Home (crew version), Jobs (filter by worker; crew version), job page (assigned-to row, "added by" labels, crew buttons), Capture (crew job picker), estimate and invoice (read-only crew view), price list (crew can add only; "Added by" review badge), Settings (sections by role), setup (alone or team question), sign-in ("I was invited").
- **Remove:** the separate helper screen (`team-work.tsx`) and its redirect in `_layout.tsx`, once crew use the normal app.
- **Example mode:** an example team (one manager, two crew members) so the Team tab can be tried without signing in, plus a "View as crew member" switch.
- **Languages:** every new label in `en.ts` and `es.ts`.

## 6. Build steps (each step runs on its own)

1. **Deploy the 9 waiting database changes** to the hosted server (back up first), so the team work starts from the real database.
2. **Roles in the database:** new role values, membership fields, `created_by` columns, permission helpers. Owners see no change. Tests.
3. **Permission rules by role:** rewrite each table's rules and the signing, sending and payment functions for owner, manager and crew. Full role tests. Owners still see no change.
4. **Roles in the app:** load the role, add `lib/permissions.ts` and its tests, hide buttons by role. Owners still see no change.
5. **Onboarding and joining:** the "alone or team" question, invite with role, join code, approval, change role, remove, leave.
6. **Team tab:** people list, person page with jobs and timeline, job filter by person, assigning workers from the job page and Team tab.
7. **Crew experience:** crew Home, Jobs, job page, Capture, read-only estimate and invoice, price list add-only, Suggest a change. Retire the old helper screen.
8. **Manager details:** review cards (new price items, change suggestions, crew work), invoice review labels, cost access switch.
9. **Example mode, Spanish check, docs, `CLAUDE.md` update.** Build an Android test app and test with three accounts on real phones (owner, manager, crew), including offline crew uploads.

Steps 2–4 change nothing owners can see, so they can be released on their own. Steps 5–8 are the visible feature.

## 7. Decisions for Rossen

Each has a recommendation. Change any you disagree with.

1. **Name for the regular role:** *Crew member*. Other options: "Tech", "Field worker".
2. **Crew see prices on estimates and invoices?** Hidden by default, with an owner switch. Many owners don't want crew seeing what the customer pays.
3. **Crew adding work done:** pick from the price list (price filled in, can't be changed) or type a new item with no price (a manager prices it before the invoice).
4. **Crew adding price list items:** name, unit and an optional price, marked for review. They can't edit items that already exist.
5. **Managers see pay rates and profit?** No by default, with an owner switch.
6. **Who can invite managers?** Only the owner. Managers invite crew members.
7. **How joining is verified:** owner or manager approval now, email code later once KILN's email service exists.
8. **Crew see the customer's phone on assigned jobs?** Yes (to call on the way), but no customer list or other history.
9. **Crew collect signatures on site?** Yes, but only on documents a manager already made.
10. **Tab layout for teams:** Home · Jobs · (+) · Team · More.
11. **Crew use AI helpers?** Receipt scan, Tell KILN and photo tags only, counted in the business's daily limit.
12. **Push notifications** ("You were assigned to the Lee job", "Maria wants to join"): useful, but they need a new package (`expo-notifications`) and Apple and Google setup. Leave them for after this plan.
13. **KILN's price for teams** (per person or per business): still open. No billing needed to build this.
14. **More than one owner, or handing ownership to someone else:** not in this plan.

## 8. Risks

- **Permission rules are the main risk.** Today every table is owner-only, and this plan opens most of them by role. A mistake could show one worker's data to another, or let crew change billing. That's why it needs the full role tests in step 3, before any screens.
- **Offline edits and role changes:** a crew member removed while offline will have their queued uploads refused. The app has to say so clearly and not keep retrying.
- **Joining depends on approval** until email codes are possible.
- **App size:** the job page and Home get role versions. Keep the role checks in `lib/permissions.ts`, not scattered through screens.
