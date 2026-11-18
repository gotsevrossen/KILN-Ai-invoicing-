# KILN unfinished feature backlog

**Audited November 17, 2026.** This covers features in KILN’s roadmap, later implementation notes, and the attached session that could be checked against this workspace. Hosted checks were read-only. Customer delivery, Stripe settlement, and physical-phone behavior still need end-to-end verification.

**Implementation update, November 18.** The web export contains the invoice, quote, collection, recovery, and Stripe return routes. The launch table reflects the latest workspace changes. Hosted findings are from the November 17 audit.

To roll out this work, apply the invoice-email and estimate-decline migrations, deploy the updated `payments`, `pay`, `stripe-webhook`, and `estimate-access` Edge Functions, and publish the reviewed web export. The release script checks the required routes and accepts `-ExportOnly` for a build without publishing. Add the exact hosted `/reset-password` URL to the Supabase Auth redirect allowlist. For direct email, configure `KILN_INVOICE_FROM_EMAIL` with a verified Resend sender and `KILN_RESEND_API_KEY` with access to send and retrieve delivery status. Finish Stripe in a sandbox before switching to live keys. [Web release script](../scripts/deploy-pay-page.ps1) · [Stripe setup](online-payments-2026-10-26.md)

## Finish before relying on customer billing

| Feature | What works today | What remains |
| --- | --- | --- |
| **Send invoice** | KILN can email an issued invoice to a saved customer address and display provider delivery status. The phone’s SMS, email app, and share sheet are still available. | Configure the email provider and test send, receive, open, and resend with a real recipient on iOS and Android. |
| **Stripe payments** | Stripe Connect onboarding, Apple Pay and Google Pay, ACH checkout, webhook processing, and payment status updates are implemented. The app checks matching key modes and the wallet domain’s enabled status. | The hosted project showed none of the three Stripe credentials required by the payment functions. Configure test-mode Stripe, verify Connect, the checkout domain, and signed webhooks, then exercise wallet and bank payments through settlement and confirm that the correct invoice balance updates. |
| **Send and sign estimates online** | Estimates can be signed in person. Secure customer links support acceptance or decline of the issued copy. A decline prevents later signing. The estimate screen shows when the customer link has expired. | The hosted `/quote/[token]` route returned the same 404 page as an unknown URL. Publish it and test sharing, signing, declining, expiration, and the resulting job status. A revision workflow and sending a downloadable signed copy are still open. |
| **Collect deposits and milestone advances** | Fixed advance requests, secure collection links, cash confirmation, and crediting settled advances against the final invoice are implemented. | The hosted `/collect/[token]` route returned the same 404 page as an unknown URL. Publish it, then test signing an estimate, paying its deposit or a later milestone, and seeing the correct credit on the final invoice. |
| **Hosted account recovery** | The hosted recovery email opens a password reset page. The code-entry flow also remains available for projects that send a code. | Publish the page, allowlist its URL in Supabase Auth, and test email delivery and password recovery with an ordinary user account. |

[Invoice sharing](../mobile/src/components/send-invoice.tsx) · [Payment function](../supabase/functions/pay/index.ts) · [Estimate access](../supabase/functions/estimate-access/index.ts) · [Payment and signing implementation](trade-review-implementation-2026-11-16.md) · [Hosted Auth notes](../CLAUDE.md#tech-stack)

## Billing and customer documents

- **Invoice corrections and payment recovery.** Add a void or replace flow that preserves the original, plus a way to resolve a pending checkout that prevents collection by another method. Refunds and disputes currently have no KILN workflow.
- **Payment options.** Let customers choose a partial invoice payment. Add a separate check payment and support recording a partial offline payment. Cash recording currently uses the remaining balance. The card-fee setting is stored but checkout does not apply it. Typed card entry was deliberately excluded from the current wallet and ACH design and would require a product decision.
- **Progress and repeat invoices.** Give owners a standalone progress invoice for a portion of the agreed job total. The current milestone advances go toward the final invoice. Add repeat invoices for ongoing service, with owner approval or optional automatic sending.
- **Due dates and collections.** Add invoice-specific due dates and optional late fees. Overdue indicators exist. Automatic reminder emails, a reminder schedule, and prompts with a prefilled reminder text are still open.
- **Change orders.** Send a customer link, accept or decline remotely, and give the customer a signed copy. In-person signing and approved credits already feed the invoice.
- **PDFs and receipts.** Generate downloadable estimates, invoices, and signed change orders. Give customers a downloadable payment receipt.
- **Document defaults and status.** Add reusable terms and warranty text with per-job changes, logo and color settings, templates, and a cross-job list filtered by document status. Jobs already have a document list.
- **Customer records.** Add phone-contact import and a reusable list of properties or addresses per customer. Saved email is now editable on the customer page. Job-level addresses and work order numbers already exist.
- **Exports.** Add a spreadsheet or CSV export and one-way QuickBooks sync for invoices and payments.

[Original feature outline](app-outline.md) · [Invoice due-date options](../mobile/src/app/invoice/%5Bid%5D/options.tsx) · [Current invoice payment screen](../mobile/src/app/invoice/%5Bid%5D/index.tsx) · [Overdue invoices](overdue-invoices-2026-10-26.md)

## Capture, AI, and field work

- **Receipt capture.** Add PDF import and preserve the original receipt image. Allow owners and crew to keep a local draft during an outage and submit it to the mandatory work-only AI review once online. Approved receipt data already syncs for owners. The food and personal-item block is implemented for both roles.
- **Receipt reconciliation.** Extend the existing split-by-quantity screen to retain an unused remainder or record a return. Today the split distributes the full cost across selected jobs.
- **Voice notes and photos.** Preserve original voice audio, extract simple commands for the user to confirm, and suggest before/during/after photo tags with a manual override. Transcription and manual photo tagging exist. Broader offline crew capture and recovery still need work.
- **AI estimate and change-order intake.** Bring reviewed voice notes and selected photos into drafting where they add context. The estimate builder uses structured details and notes and does not directly interpret voice recordings or photos. Change-order drafts use text.
- **AI invoice review and proof of work.** Build the planned job summary and “possibly missed” review from recorded work and notes, and allow owners to choose the specific proof photos that appear on an invoice. The current invoice draft already builds from recorded job and billing data.
- **Trade follow-ups.** The trade review still calls for reusable property and equipment records, completed-visit billing for repeat services, and lightweight completion checklists where the trade needs them. Service packages, the paint worksheet, and electrical handover records already exist.

[Work-only receipts](receipt-work-policy.md) · [Offline recovery](offline-recovery-2026-11-16.md) · [Estimate inputs](../mobile/src/app/estimate/%5BjobId%5D/details.tsx) · [Trade review](trade-review-2026-10-21.md)

## Teams, account settings, and release validation

- **Manager pay and profit access.** The owner can enable manager access and the database has a cost permission. The app’s Operations API still checks for the `owner` role, leaving the promised manager workflow unfinished.
- **Crew permissions and activity.** Let crew collect signatures on prepared documents, add permitted unpriced work without creating a price-list entry first, and remove their own eligible photo and receipt uploads before billing. Show who added each entry on the owner’s job page. The Team person page already shows activity by person.
- **Crew AI and example mode.** Add the planned crew voice commands and photo tagging, and an example team or crew preview for onboarding. Crew receipt scanning and review already work.
- **Notifications.** Add push notifications for job assignments and approval requests, and owner alerts for estimate views and signatures, invoice drafts ready for review, and payments. In-app updates while KILN is open already sync for hosted users.
- **Account and business setup.** Add Apple and Google sign-in, biometric locking, signed-in device management, and account deletion. Complete business email and license fields and hosted signup email verification if keeping the original roadmap requirement.
- **Paid-job cleanup and saved documents.** The mobile warning, save/discard choice, automatic-save setting, saved-document library, and cleanup function exist in the workspace. Hosted rollout is pending, and the current cleanup only runs when the owner opens Home. [Paid-job cleanup notes](paid-job-cleanup-2026-11-17.md)
- **Physical-phone and pilot testing.** Verify menu swipe haptics, camera and microphone permissions, mixed English/Spanish transcription, cold restart and offline recovery, and owner-to-crew syncing on actual iOS and Android devices. Hosted live sync already passed a two-client integration test. The repo does not establish completion of the planned external pilot through Apple and Google’s test programs.

[Team implementation](team-roles-implementation-2026-11-17.md) · [Team plan](team-roles-plan-2026-11-17.md) · [Operations access check](../mobile/src/features/operations/api.ts) · [Paid-job cleanup migration](../supabase/migrations/20261117170000_paid_job_cleanup.sql) · [Live updates](live-updates-2026-11-17.md)

## Later product decisions

The roadmap deferred review requests and a desktop app. Broader dispatch, payroll, inventory, supplier integrations, and full bookkeeping were outside the first version. Subscription pricing and ownership transfer also remain open decisions. [Original feature outline](app-outline.md) · [Trade review](trade-review-2026-10-21.md) · [Team plan](team-roles-plan-2026-11-17.md)
