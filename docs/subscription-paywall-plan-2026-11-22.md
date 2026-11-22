# Subscription paywall plan (Nov 22, 2026)

Branch: `subscription-paywall`.

## Built so far (Nov 22)

The paywall is **switched off** (`subscriptions_enforced()` returns false), so nothing changes for anyone until the stores are set up and tested. Every business that exists today is marked free (`comped`) until public launch.

- Database: migration `20261122130000_subscriptions.sql` (table, access and team-size rules, new-work blocking on 12 tables, AI and member-approval checks, `my_subscription()` for the app, `save_business_subscription()` for the server only). Tests: `supabase/tests/database/subscriptions.test.sql` (switches the paywall on inside the test).
- Server: `supabase/functions/subscriptions` (RevenueCat webhook + the app's "check my purchase now"), tests in `plan.test.ts`. The `ai` function answers `subscription_needed`.
- App: `react-native-purchases`; `lib/subscription.ts` (plans, notices; tests), `lib/purchases.ts` (stores; `purchases.web.ts` for the web), `data/subscription.tsx` (state, `useRequireAccess`), `app/subscribe.tsx` (plans, 14 days free, restore, manage, terms/privacy), Settings → Subscription, a Home notice (owner and crew), and gates on the + menu and New job. A new owner who never subscribed is sent to the subscribe screen once the paywall is on. English and Spanish.

## Still to do, in order

1. Stores and RevenueCat setup (below): Apple paid apps agreement, the 6 products (3 plans × monthly/yearly) with 14-day free trials, Google Play the same, RevenueCat project with entitlement `kiln_pro` and one offering.
2. Secrets: `REVENUECAT_SECRET_KEY`, `REVENUECAT_WEBHOOK_AUTH`, `KILN_REVENUECAT_SANDBOX=true` (testing) on the server; `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `_ANDROID_KEY`, `EXPO_PUBLIC_TERMS_URL` / `_PRIVACY_URL` in the app. Terms and privacy pages need to exist first.
3. Deploy the migration and the `subscriptions` function; point RevenueCat's webhook at it.
4. A development build (APK / EAS) and store test accounts: buy, trial, upgrade, downgrade, restore, cancel.
5. Switch the paywall on (a migration making `subscriptions_enforced()` return true), turn `KILN_REVENUECAT_SANDBOX` off, and end the testers' free access at launch.

Before going live, check against RevenueCat's current docs: the subscriber API answer the server reads (`GET /v1/subscribers/{id}`), and the Google Play plan-change call (`oldProductIdentifier`).

Goal: KILN is a monthly subscription priced by team size. Without an active subscription, the business can't do new work in the app.

| Team size (owner, managers and crew counted together) | Price | Store product |
|---|---|---|
| 1–3 people | $5.99 a month | `kiln_team_1_3` |
| 4–6 people | $7.99 a month | `kiln_team_4_6` |
| 7 or more | $9.99 a month | `kiln_team_7_plus` |

Every plan starts with a **14-day free trial with a card added up front** (decided Nov 22).

## The short version

- **Who pays:** the business. The owner subscribes once; managers and crew on that business are covered. They never see a paywall, only a "your owner's subscription ended" notice.
- **Who counts as a person:** everyone with an active place on the team: the owner, managers and crew. Join requests still waiting for approval don't count.
- **How they pay:** through Apple (iPhone) and Google Play (Android). Inside a phone app, a subscription that unlocks the app has to go through the store's own billing (Apple rule 3.1.1, and Google Play's billing rule). Stripe can't be used for this inside the app.
- **The tool that ties it together:** RevenueCat (`react-native-purchases`). It talks to both stores, tells the app and our server who is subscribed, and adds Stripe web billing later for the desk dashboard. We don't write store receipt checking ourselves.
- **The server decides, not the app:** a subscription record that only the server writes, checked by the database rules and by the AI function. The paywall screen is just the friendly front door; a hacked app still can't create jobs or use AI without a subscription.
- **Free trial:** 14 days, set up as a free introductory offer on each plan in both stores. The store asks for the card when the trial starts and charges on day 15 unless the owner cancels; the stores handle all of it, no extra code. The trial can be used once per Apple ID or Google account across all three plans (they share one subscription group), so switching plans doesn't restart it.
- **Changing plans:** all three plans sit in one subscription group, so moving between them is an upgrade or downgrade, never a second subscription. Upgrades start right away (the store credits the unused part of the old plan); downgrades start at the next renewal on iPhone.
- **Customers are never blocked:** pay links, estimate links and change-order links keep working even if the owner's subscription lapses. An owner's customers paying them is never held hostage.

## Money

| Per business per month | 1–3 people | 4–6 people | 7+ people |
|---|---|---|---|
| Price | $5.99 | $7.99 | $9.99 |
| Store fee (15%: Apple Small Business Program under $1M a year; Google Play subscriptions) | −$0.90 | −$1.20 | −$1.50 |
| Claude AI (about $0.10 per person using it; each person has their own daily limits) | about −$0.10 to −$0.30 | about −$0.40 to −$0.60 | about −$0.70 and up |
| **KILN keeps (before RevenueCat)** | **about $4.80–5.00** | **about $6.20–6.40** | **about $7.80 at 7 people** |

RevenueCat is free up to a revenue threshold, then takes a small percentage (check revenuecat.com/pricing before deciding).

The 7+ plan has no top, so a very large team costs more in AI than it pays. AI cost grows with the people who actually use it (owner and managers use the most; crew only receipts and the chat), and the per-person daily limits cap the worst case. Watch it with the token logs; a 15+ plan can come later if real teams that big show up.

Fixed costs to plan for at launch: Supabase Pro ($25 a month, the free plan pauses and has low limits), Apple Developer Program ($99 a year), Google Play developer account ($25 once). Server costs are covered at about 6 paying businesses.

US link-out option: since 2025, US iPhone apps may also link to a web checkout. Whether Apple can charge a fee on those link-out sales was still in court as of August 2026 (Apple proposed 15%). Not worth the extra work for $5.99 now; revisit when the web dashboard exists.

## What each state allows

| | Trial / subscribed | Lapsed (expired, refunded, payment failed after the store's grace period) |
|---|---|---|
| See jobs, customers, documents | yes | yes |
| Export / download PDFs and spreadsheets | yes | yes (never hold their data hostage) |
| Customers open links, sign, pay | yes | yes |
| Record a payment on an invoice already sent (cash, check) | yes | yes |
| New jobs, estimates, invoices, change orders, receipts, photos, hours | yes | no, shows the paywall |
| AI helpers and the KILN chat | yes | no |
| Crew and managers | full team access | read only, with "ask your owner to renew" |

Store billing problems: Apple and Google give a grace period while they retry a failed card. RevenueCat reports it; treat grace period as still subscribed.

### Team bigger than the plan

- **Adding people:** approving a join request that would take the team past the plan's size is refused by the server. The owner sees "Your plan covers 3 people. Upgrade to add more" with an Upgrade button. Managers who approve people see "Ask your owner to upgrade the plan".
- **Over the size anyway** (the owner downgraded while the team was still big, or a plan change hasn't reached us yet): the owner keeps full access. A banner asks them to upgrade or remove people. Nobody new can be approved, and after 7 days the people beyond the plan's size become read only. Everyone keeps seeing their jobs.
- **Smaller team:** when people are removed, Settings → Subscription offers the cheaper plan. KILN never moves an owner to a different plan on its own; plan changes always go through the store so the owner sees the price.

## How it fits into KILN

### Stores and RevenueCat (setup, no code)

1. Apple: paid apps agreement, tax and bank details, one subscription group "KILN" with three products ranked from largest to smallest: `kiln_team_7_plus` $9.99, `kiln_team_4_6` $7.99, `kiln_team_1_3` $5.99, each with a 14-day free introductory offer. Join the App Store Small Business Program (15%).
2. Google Play: one subscription per plan (same ids and prices), each with a monthly base plan and a 14-day free trial offer. Plan changes use Google's upgrade/downgrade (replace) flow.
3. RevenueCat project: both apps, one entitlement `kiln_pro` attached to all three products, one offering with the three packages. Webhook pointed at our server function with a long secret in its Authorization header.

### Database (new migration, needs your OK as a schema change)

- `business_subscriptions`: one row per business: `status` (trial, active, grace, expired), `expires_at`, `store` (apple, google, web), `product_id`, `team_limit` (3, 6 or null for 7+), `over_limit_since`, `updated_at`. Row-level security: members read their own business's row; **no one** writes it except the webhook function (service role).
- `business_has_access(bid uuid) returns boolean`: true when the row is trial, active or grace and `expires_at` is in the future (plus a few hours of slack for clock and webhook delays).
- `team_limit_for(product_id)`: the plan's size, fixed in SQL (never sent by the app). `business_team_size(bid)`: active members.
- The approve-member function refuses when `business_team_size + 1` is over `team_limit`. A trigger sets `over_limit_since` when the team is over the plan's size and clears it when it fits again; after 7 days, write rules treat the people beyond the size (newest approvals first; never the owner) as read only.
- Add `business_has_access(business_id)` to the insert and update rules on the tables that hold new work: jobs, estimates, estimate lines, invoices, invoice lines, change orders, work items, time entries, receipts and receipt items, photos, notes. Leave select rules alone. Leave the payment-recording and customer-link functions alone.
- `use_ai_quota_for()` refuses with a new code when the business has no access, so the AI function stops too.
- Existing businesses: give each a starting row (trial ending at launch day plus 14 days, or "comped" for your interviewees; see open questions).

### Server functions

- New `subscription-webhook`: checks RevenueCat's Authorization header in constant time (same pattern as `job-cleanup`), reads the event, asks RevenueCat's API for the subscriber's current state rather than trusting the event body alone, and writes `business_subscriptions`. Events can arrive twice or out of order, so it always writes the latest state, never "add a month".
- The `ai` function: map the new quota error to `subscription_needed`.

### App

- New package `react-native-purchases` (and `react-native-purchases-ui` if we use RevenueCat's ready-made paywall screen). Needs your OK as a new dependency. Install with `npx expo install`. In Expo Go it runs in a "preview" mode with pretend purchases; real purchases need a development build (APK or EAS, like the Face ID lock).
- Sign the owner in to RevenueCat with the **business id** as its user id, so the purchase belongs to the business, not the phone.
- `data/subscription.tsx`: reads `business_subscriptions` (and live updates), exposes `hasAccess`, `status`, `expiresAt`.
- Paywall screen `app/subscribe.tsx`: what KILN does, the three plans with the one that fits the current team picked (smaller plans that don't fit are shown but can't be chosen), "14 days free, then $X a month. Cancel anytime before day 15 and you won't be charged", Start free trial, **Restore purchases**, links to terms and privacy (Apple requires all three, and the price after the trial must be clear). English and Spanish.
- Gates: the + / Capture button, New job, Create estimate/invoice, Tell KILN and the chat open the paywall when there's no access. One `requireAccess()` helper, not scattered checks.
- Settings → Subscription: plan, team size against the plan's size ("4 of 6 people"), trial end or renewal date, Change plan, "Manage subscription" (opens the store's own page), Restore purchases.
- Team tab: approving a join request that doesn't fit opens the upgrade prompt first.
- Crew/manager screens: a banner when the business has no access.
- Errors: server refusals map to a plain "Your KILN subscription has ended" message with a Subscribe button (owner) or "Ask your owner" (team), through `lib/user-errors.ts`.

## Build order (each step runs on its own)

1. Migration + tests: `business_subscriptions`, `business_has_access()`, a temporary rule that gives every business access (so nothing changes yet), database tests for who can read and write the table.
2. Webhook function + tests (fake RevenueCat events: new, renew, cancel, expire, refund, duplicate, out of order).
3. App: read the subscription state; Settings → Subscription screen (read only).
4. App: RevenueCat package, paywall screen, purchase and restore, in a development build against store sandbox accounts.
5. Turn enforcement on: switch the access rule to the real check, add it to the write rules and the AI quota, gate the buttons. Tests for lapsed businesses (can read, can't write, customers can still pay).
6. Team size: plan limits on approving members, the over-the-size banner and 7-day read-only rule, the upgrade prompt in the Team tab. Tests: a 3-person plan can't approve a 4th; upgrading allows it; a downgrade with too many people keeps the owner working.
7. Existing testers: starting rows (comped or trial).
8. Store review prep: screenshots of the paywall, review notes with a test account, privacy details for purchase data.

## Decided (Nov 22)

- Price by team size: 1–3 people $5.99, 4–6 $7.99, 7+ $9.99 a month.
- Yearly plans too: $59.99, $79.99, $99.99 (`kiln_team_1_3_yearly` and so on).
- 14-day free trial with the card added up front (the stores' introductory offer).
- Interview testers: free until public launch.
- Lapsed: read only, plus exports, plus recording payments on invoices already sent; customer links keep working.
- Over the plan's size: 7 days before the extra people become read only.

## Sources checked

- RevenueCat Expo install guide and Expo Go preview mode: https://www.revenuecat.com/docs/getting-started/installation/expo
- Expo + RevenueCat guide: https://expo.dev/blog/expo-revenuecat-in-app-purchase-tutorial
- Apple link-out fees still in court (Dec 2025 appeal; Aug 2026 proposal): https://www.macrumors.com/2025/12/11/apple-app-store-fees-external-payment-links/ and https://www.macrumors.com/2026/08/13/app-store-fees-apple-link-outs/
