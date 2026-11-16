# KILN code review and optimization — November 16, 2026

Reviewed the current working tree, including the recent UI and error-message changes. This pass covers the client save queue, account transitions, photo uploads, startup loading, invoice balances, Jobs rendering, recovery email configuration, and the server payment-start path. It is not a complete security audit or a real-money payment test.

## Remaining findings, in priority order

### P1 — Hosted document operations are missing

**Evidence:** A read-only inspection of the hosted project's `pg_proc` during this review found `record_stripe_payment`, but none of `send_invoice`, `sign_estimate`, `sign_change_order`, or `mark_invoice_paid`. The app calls those functions from `mobile/src/data/db-docs.ts`. Their definitions exist in `supabase/migrations/20261027130000_lock_records.sql` (lines 198, 218, 240, and 276).

**Impact:** Sending an invoice, recording a signature, or marking cash payment fails against the current hosted database. Clear error wording cannot restore these operations.

**Next step:** Review and apply the existing migration to the hosted project, then verify permission rules and each document operation with a test account. This is a database deployment, which `CLAUDE.md` identifies as a decision to approve separately.

### P1 — Concurrent payment starts can create separate payable attempts

**Location:** `supabase/functions/pay/index.ts:102` and `supabase/functions/_shared/stripe.ts:27`.

**Evidence:** Every `start` request reads the outstanding balance and creates a new PaymentIntent. The intent is not reserved on the invoice before returning its client secret. The Stripe wrapper has no idempotency-key option. Two requests can both read an unpaid balance before a webhook records a processing or successful payment, and create separate intents. The current pending-payment check does not close that interval.

**Impact:** Two open invoice tabs or overlapping retries could both offer a payment for the same balance. This is a code-path finding; no customer was charged to test it.

**Next step:** Reserve and reuse one active payment attempt per invoice balance, enforce it atomically on the server, and use Stripe idempotency for retries. Test concurrent starts, changed payment methods, network retries, failed attempts, and webhook timing in a sandbox. [Stripe's PaymentIntent guidance](https://docs.stripe.com/payments/payment-intents) describes reusing an intent and idempotency protection.

### P1 — Other final document states still precede server confirmation

**Location:** `mobile/src/data/store.tsx:652` (`sendEstimate`), `:670` (`sign`), `:677` (`declineChange`), `:729` (`signEstimate`), and `:831` (`markPaid`).

**Trigger:** The owner signs, declines, sends an estimate, or marks cash paid while the request fails or the hosted function is missing.

**Impact:** These actions still change the in-memory final state first. The screen can appear signed or paid even though the server rejected the action. Invoice sending was corrected in this pass; these other flows need the same confirmation behavior, together with pending-state controls and error handling in their customer/owner screens.

**Next step:** Extend the tested `SaveQueue.commit` pattern to those actions and their screen handlers, and verify that failures leave the document retryable and the customer sees no success confirmation.

### P1 — Ordinary edits do not have durable offline recovery

**Location:** `mobile/src/lib/save-queue.ts` and callers in `mobile/src/data/store.tsx:277`.

**Evidence:** Ordinary edits remain optimistic, and the save queue and its failure record are held in memory. Photos have a separate on-device queue, but jobs, notes, hours, receipts, and document edits do not. Some saves use multiple requests (`createBusiness`, `saveEstimate`, `insertReceipt`, and receipt assignment), so failure between requests can also leave a partial server record.

**Impact:** Closing the app after a failed edit can lose the unsaved change. Reopening loads the saved server data. A partial multi-request save can require reconciliation.

A cold launch also calls `loadAll` over the network; there is no durable per-account job cache. The offline job viewing described in `CLAUDE.md` is therefore not complete.

**Mitigation added:** A failed prerequisite save now blocks invoice sending. Its message tells the owner to copy unsaved edits before reopening and reviewing the saved job. A later unrelated successful save does not silently erase the failed prerequisite.

**Next step:** Design a durable per-account outbox with safe retries and reconciliation, and move multi-record changes into transactions where needed. Do not automatically retry non-idempotent inserts or final document operations.

### P1 — Password recovery email and reset screen disagree

**Location:** `mobile/src/data/auth.tsx:120` and `mobile/src/app/sign-in.tsx`.

**Evidence:** The hosted configuration was inspected read-only during this review. It uses the default email provider; the recovery template contains `ConfirmationURL`, and does not contain `Token`. The app requests an email and then requires a six-digit code. URL session detection is disabled in `mobile/src/lib/supabase.ts`.

**Impact:** A user receiving the current reset link cannot complete the code-based recovery screen as designed.

**Next step:** Choose a supported code-email setup or implement the default provider's link recovery flow. The current default email choice was explicitly requested earlier, so this review preserves that choice and records the mismatch.

### P2 — Startup queries can silently stop at the server row limit

**Location:** `mobile/src/data/db.ts:96`, `mobile/src/data/db-docs.ts:116`, `mobile/src/data/db-photos.ts:26`, and `mobile/src/data/db-pay.ts:80`.

**Evidence:** The loaders issue single queries without pagination and treat the returned arrays as the complete account history. Supabase documents a default maximum of 1,000 returned rows. This review did not change or verify this project's configured cap. [Supabase's query guidance](https://supabase.com/docs/reference/javascript/v1/select) describes the server cap and pagination.

**Impact:** A larger business can load only part of its history. Truncated invoice lines, receipt assignments, or payments are especially risky because totals depend on complete data.

**Next step:** Add stable, paged reads or server summaries, and test more than one page of invoice lines, receipts, payments, and jobs. Increasing the server limit alone is not a complete solution.

### P2 — Large lists still mount every card

**Location:** `mobile/src/app/(tabs)/jobs.tsx` and `mobile/src/components/ui.tsx` (`Screen`).

**Evidence:** Jobs uses a `ScrollView` and maps every filtered result to a card. Other screens subscribe to the entire store context, so unrelated state changes can also trigger work across mounted screens.

**Next step:** Measure on a phone with representative large accounts, introduce virtualized lists for long collections, and consider selective store subscriptions. Avoid broad memoization changes without that measurement.

## Changes completed in this pass

- Added a tested save queue with ordered writes, typing debounce, prerequisite-failure tracking, and session invalidation. Old queued writes and delayed typing saves are canceled on account transitions. Errors from old requests cannot become the new account's sync error.
- Invoice sending now waits for prior saves and the server send before freezing the local invoice. A failure leaves it editable. The sharing flow awaits that send and handles its error.
- Added account-scope checks to returning payment refreshes, Stripe setup checks, photo uploads, setup completion, and invoice-link requests. Old photo results do not delete the local copy when an account changes mid-upload.
- Reset the previous account's profile and preferences when clearing connected data. Avoided store notifications when an action returns the same state object.
- Corrected invoice and Home outstanding balances to subtract confirmed payments once. Pending bank payments do not count as settled money; overpayment does not produce a negative amount due.
- Jobs now groups records once per state change and caches derived rows for the selected tab. Typing a search does not recalculate invoice amounts, status, or hours for each card. Hidden tabs do not eagerly calculate every invoice amount.
- Startup now loads photos and documents alongside prices, customers, and jobs after the business lookup, removing two serial read phases.
- Document hydration appends into grouped arrays instead of repeatedly copying each group's earlier lines, removing quadratic copying within large groups.
- Root font imports now use the four Archivo weight subpaths actually used by the app, instead of the package entry point that includes all 18 font files. The exported Archivo payload is 483,472 bytes instead of 2,277,236 bytes: 1,793,764 fewer font bytes per platform. The final iOS asset manifest contains five font files (four Archivo weights plus Feather), versus 19 before; the final web output contains four Archivo files. This is an asset reduction, not a measured startup-time or application-binary percentage improvement.

These are reductions in unnecessary work and fixes for specific failures. No percentage speed improvement is claimed without device profiling.

## Validation

- `npm test`: 101 tests passed, including regressions for save ordering, debounce, account changes, failed sends, late old-account completions, preservation of a confirmed send when a later edit fails, partial payments, overpayments, and plain-language save recovery.
- `npm run lint` and `npm run typecheck`: both passed on the final code.
- `npx expo-doctor`: 20 of 20 checks passed.
- Hosted inspection: read-only function existence and email-template checks only; no customer record mutation or payment submission.
- Final iOS and web production export passed: `npx expo export --platform ios --platform web --max-workers 2 --output-dir ../.kiln-runtime/review-export`. The iOS export includes a Hermes bundle; this is not an installed iPhone app test. Build output and font-count evidence are in the ignored `.kiln-runtime` directory.
- Changes are available in the workspace for review. This pass did not publish a new hosted app version.
- Real-device performance, offline recovery, signatures, and concurrent sandbox payments still require end-to-end verification. Unit tests and export success do not establish that these complete journeys work.
