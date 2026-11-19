# App integration audit — November 19, 2026

Reviewed the current Expo app, persistence adapters, Edge functions, and SQL migrations. This is a source-level audit with local app checks, not a live customer checkout or physical-device test. No application behavior or hosted configuration was changed.

## Highest-priority gaps

### 1. Stripe refunds and disputes do not update KILN's ledger

**Impact:** A payment refunded or disputed through Stripe can continue to count as received in KILN, leaving balances, paid status, receipts, and billing exports out of step with the provider. Partial refunds have no reconciliation path either.

**Evidence:** [`stripe-webhook/index.ts:18`](../supabase/functions/stripe-webhook/index.ts#L18) recognizes only PaymentIntent processing, success, and failure events. Other events are acknowledged and ignored at line 44. There is no refund/dispute handling elsewhere in the Edge functions.

**Next step:** Define how refunds and disputes affect recorded money and document status, then add idempotent provider reconciliation and an owner-visible history. Until that exists, treat refund/dispute management as incomplete.

### 2. Crew field capture lacks durable offline recovery

**Impact:** A crew member's unsent notes and photo retry list do not survive a screen unmount or app restart. Crew Capture explicitly removes pending photo files when leaving, so a failed upload can lose its retryable copy.

**Evidence:** [`crew-capture.tsx:40`](../mobile/src/features/team/crew-capture.tsx#L40) keeps waiting photos in a React ref and deletes their files in the unmount cleanup at line 49. Notes call the server directly at line 85. [`crew-job.tsx:308`](../mobile/src/features/team/crew-job.tsx#L308) keeps its photo retry list in component state. These paths do not use the owner's [`offline-commands.ts`](../mobile/src/data/offline-commands.ts) journal.

**Boundary:** Receipt forms already save account/job-scoped local drafts; owner ordinary edits already have an offline journal. This finding concerns crew notes, hours/work submissions, and photo recovery, not every capture flow.

**Next step:** Persist crew drafts and pending files with stable IDs, account/job ownership, and permission checks when replaying.

## Partially connected features

| Feature | Confirmed gap | Source | Suggested completion |
| --- | --- | --- | --- |
| Card-fee switch | The screen promises customers will pay the card fee. The value is saved and loaded, but no checkout or total calculation reads it. | [`payments.tsx:115`](../mobile/src/app/settings/payments.tsx#L115), [`store.tsx:1147`](../mobile/src/data/store.tsx#L1147), [`db.ts:199`](../mobile/src/data/db.ts#L199) | Hide or clearly disable the switch until fee calculation and checkout behavior are implemented. |
| Receipt attachments | Scanning saves extracted fields, then discards the original photo/PDF bytes. Saved receipts cannot reopen the source attachment. | [`receipt-form.tsx:199`](../mobile/src/components/receipt-form.tsx#L199), [`types.ts:112`](../mobile/src/data/types.ts#L112) | Store private receipt attachments and connect them to saved receipt records. |
| Original voice recordings | Voice capture returns text only; there is no saved audio or playback for real recordings. | [`voice-sheet.tsx:19`](../mobile/src/components/voice-sheet.tsx#L19), [`voice-sheet.tsx:90`](../mobile/src/components/voice-sheet.tsx#L90) | Add durable audio capture/storage if playback and original evidence are required. |
| Visit scheduling and crew assignments | Saving a visit changes `operations_visits`, while crew job visibility depends on separate `team_job_assignments`. Planning a visit does not grant job access, and crew screens do not load visit times. | [`api.ts:17`](../mobile/src/features/operations/api.ts#L17), [`team_roles.sql:67`](../supabase/migrations/20261117120000_team_roles.sql#L67), [`team_roles.sql:387`](../supabase/migrations/20261117120000_team_roles.sql#L387) | Connect visit planning to an explicit assignment action and expose the appropriate schedule to crew. |
| Business contact details on documents | Business email/address are editable, but quote/change-link snapshot types and saved-document snapshots contain only business name/phone. PDF rendering also uses only name/phone. | [`document-delivery.ts:48`](../mobile/src/data/document-delivery.ts#L48), [`job-cleanup.ts:68`](../mobile/src/data/job-cleanup.ts#L68), [`saved-doc.ts:101`](../mobile/src/lib/saved-doc.ts#L101) | Carry the selected business contact details through public and archived document copies. |
| Invoice email replies | Direct email sending has no business-specific `reply_to`; it sends the configured sender, recipient, subject, and text only. Business name is in the subject/body, while the sender is the configured value. | [`invoice-email.ts:25`](../supabase/functions/payments/invoice-email.ts#L25), [`invoice-email.ts:97`](../supabase/functions/payments/invoice-email.ts#L97) | Connect the business contact email to Reply-To and the intended business display name to the sender. |
| Paid-job cleanup | Cleanup is requested from the owner's Home view. There is no repository-defined background schedule. Cleanup errors are swallowed as zero removals. | [`leaving-card.tsx:41`](../mobile/src/features/cleanup/leaving-card.tsx#L41), [`leaving-card.tsx:61`](../mobile/src/features/cleanup/leaving-card.tsx#L61) | Add scheduled cleanup that preserves the existing warning rules, plus visible failure reporting. |

Approved staff **are** linked to operations worker records by the approval SQL, and crew hours are automatically connected to labor costs. The scheduling gap above is specifically the visit-to-assignment and crew-schedule flow, not a complete absence of a team/cost link.

## Remaining demo controls

- [`capture.tsx:119`](../mobile/src/app/(tabs)/capture.tsx#L119): the example voice-command **Edit** button has no press handler.
- [`job-activity.tsx:132`](../mobile/src/components/job-activity.tsx#L132): the example voice-note **Play** icon has no press handler.

These are example-data paths. They should work or look explicitly noninteractive, but they do not establish a broken signed-in voice-command flow.

## Implemented features that still need release verification

The repository contains implementation paths for invoice email, invoice signatures and payment choices, partial payments, estimate acceptance/decline, deposit and milestone collection, change-order links, and password recovery. This audit did not establish their current hosted migration/function/web versions or provider configuration.

Before calling these fully integrated, verify:

- Current migrations, Edge functions, and customer web routes are deployed together.
- Invoice email has a verified sender and working `KILN_RESEND_API_KEY` / `KILN_INVOICE_FROM_EMAIL`, with delivery status checked against an actual message.
- Stripe checkout, signed webhooks, wallet availability, merchant readiness, and payout status work in the intended environment.
- A customer can accept an estimate, pay an advance, receive the final credit, make a partial payment, and return a signed invoice through valid links.
- Account recovery and permission-sensitive owner/manager/crew flows work on actual iOS and Android devices.

These are **unverified here**, not confirmed broken or confirmed undeployed.

## Backlog corrections

The November 17/18 backlog and README contain stale statements:

- Owner voice-command extraction and confirmation already exist in [`command-box.tsx:52`](../mobile/src/components/command-box.tsx#L52), including the VoiceSheet handoff at line 142. Crew Capture still turns speech into a reviewed note.
- Owner automatic photo tagging already exists in [`store.tsx:675`](../mobile/src/data/store.tsx#L675), with manual override protection at line 486. Crew photo tagging remains manual.
- The README's statement that documents only last for the app session no longer matches `db-docs.ts`, the offline journal, and the document migrations.

Other roadmap work remains separate from the partial integrations above: recurring invoices, standalone progress invoices, scheduled reminders, push notifications, customer property/equipment records, accounting sync, social sign-in, and account deletion.

## Verification performed

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm test` — 172 tests passed; no failures.
- Static RPC-name cross-check — every literal RPC call in app/Edge production source has a matching function declaration somewhere in the migration history (120 declared function names). This checks names only, not final signatures, grants, deployment, or runtime behavior.

Database integration tests, live provider transactions, browser interaction, and native-device flows were not run. Passing local checks does not prove those integrations work end to end.
