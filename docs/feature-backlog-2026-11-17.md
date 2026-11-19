# KILN unfinished feature backlog

**Audited November 17, 2026.** This covers features in KILN’s roadmap, later implementation notes, and the attached session that could be checked against this workspace. Hosted checks were read-only. Customer delivery, Stripe settlement, and physical-phone behavior still need end-to-end verification.

**Updated November 18, 2026.** The hosted invoice, quote, collection, recovery, and Stripe return routes responded during the read-only audit. The integrations below are implemented in the workspace and need release and provider verification before live customer use.

The new invoice flow is implemented in the workspace. It uses the same payment choices in preview and on the customer page, requires owner-configured alternatives at issuance, and returns signatures to owners and managers. New invoices retain the configured methods and instructions that were in effect when sent. An off-app payment promise leaves the balance open until the business records receipt. [Invoice acceptance migration](../supabase/migrations/20261118130000_invoice_acceptance_and_payment_choices.sql)

## Integrated in the workspace

- **Invoice payments and corrections in progress.** Customers can pay part of the balance through Stripe. Owners and authorized managers can record partial off-app payments. They can also release an abandoned invoice checkout after the server confirms cancellation with Stripe. Confirmed payments reduce the balance, and pending payments prevent a second collection.
- **Due dates, reminders, and proof.** Set a due period for each invoice, or use the business default. Share a manual reminder through text or send it through the configured email provider. Choose which before-and-after photos the customer sees.
- **Change orders and customer documents.** Customers can sign or decline a change order by private link. Invoice, estimate, and change-order links have a print or save-as-PDF action. Customers can save a receipt for confirmed invoice payments. Business defaults and per-job terms and warranty text appear on the customer copies and are frozen at issuance.
- **Billing history and reporting.** Open Settings → Billing history to filter current and archived invoices and export invoices or payments as CSV. Older archived records can only export the payment details retained at the time of archival.
- **Receipt capture and invoice review.** Owners and crew can open a receipt PDF and save an unfinished receipt locally. Submission still requires the work-only review. Invoice drafts can use recorded work and notes to propose a customer summary and private billing questions. The business chooses whether to use the summary.
- **Manager cost access.** Managers with the owner’s cost permission can read job costs and profitability. Pay-rate and cost-setting changes remain owner actions.

Rollout requires the pending database migrations, the updated `payments`, `pay`, `stripe-webhook`, `estimate-access`, and `ai` functions, and the reviewed web export. Live checkout needs matching live credentials, a connected merchant with payouts enabled, and wallet registration for the payment domain. `KILN_STRIPE_TEST_CHECKOUT=true` enables simulated checkout only in a dedicated test environment. [Web release script](../scripts/deploy-pay-page.ps1) · [Stripe direct charges](https://docs.stripe.com/connect/direct-charges)

## Finish before relying on customer billing

| Feature | What works today | What remains |
| --- | --- | --- |
| **Send invoice and return signature** | Saved customer email, direct send and delivery status, phone sharing, and signed invoice return are implemented. | Deploy the new invoice flow. Direct email still needs `KILN_INVOICE_FROM_EMAIL`, `KILN_RESEND_API_KEY`, and delivery tests with a verified sender. Test send, view, sign, and signature return across iPhone, Android, and owner/manager accounts. |
| **Stripe payments and payouts** | Settings checks Apple Pay, Google Pay, and payouts separately. The test merchant's checkout domain has both wallets active. A simulated direct card charge reached the connected merchant's Stripe balance and was refunded. PaymentIntent creation uses Stripe's supported allowlist parameter. | Deploy the wallet migration and updated Edge functions and web checkout. Verify wallet authorization on iPhone Safari and Android Chrome. Live checkout requires live keys and matching signed webhooks, completed merchant onboarding and payout setup, and an enabled live checkout domain. |
| **Send and sign estimates online** | In-person and link-based acceptance or decline with expiration, plus a printable signed copy. | Verify with a valid test link on the updated deployment. Estimate revisions remain open. |
| **Collect deposits and milestone advances** | Fixed advances, secure links, cash confirmation, and crediting settled advances are implemented. The hosted `/collect/[token]` page responds. | Test the full sequence from accepting the estimate through paying an advance and seeing the final invoice credit. |
| **Hosted account recovery** | Code entry and link-based recovery are implemented. The hosted reset page responds. | Verify the hosted redirect allowlist and delivery to an ordinary user with a real reset request. |

[Invoice sharing](../mobile/src/components/send-invoice.tsx) · [Payment function](../supabase/functions/pay/index.ts) · [Stripe account mode](https://docs.stripe.com/api/v2/core/accounts/object) · [Estimate access](../supabase/functions/estimate-access/index.ts) · [Payment and signing implementation](trade-review-implementation-2026-11-16.md) · [Hosted Auth notes](../CLAUDE.md#tech-stack)

## Billing and customer documents

- **Invoice corrections and payment recovery.** Add voiding and replacement with an audit trail, plus refund and dispute workflows.
- **Payment options.** The card-fee setting is stored and has no checkout behavior. Zelle, Venmo, Cash App, cash, and checks are coordinated and recorded manually.
- **Progress and repeat invoices.** Give owners a standalone progress invoice for a portion of the agreed job total. The current milestone advances go toward the final invoice. Add repeat invoices for ongoing service, with owner approval or optional automatic sending.
- **Collections.** Automatic reminder schedules and optional late fees remain open. Verify the manual email reminder with a configured sender.
- **Document defaults and status.** Logo and color settings, templates, and a combined history for all document types remain open. Invoice history can already be filtered.
- **Customer records.** Add phone-contact import and a reusable list of properties or addresses per customer. Saved email is now editable on the customer page. Job-level addresses and work order numbers already exist.
- **Accounting.** One-way QuickBooks sync remains open.

[Original feature outline](app-outline.md) · [Invoice due-date options](../mobile/src/app/invoice/%5Bid%5D/options.tsx) · [Current invoice payment screen](../mobile/src/app/invoice/%5Bid%5D/index.tsx) · [Overdue invoices](overdue-invoices-2026-10-26.md)

## Capture, AI, and field work

- **Receipt capture.** Permanent storage and retrieval of original receipt attachments remain open. Verify PDF recognition with the deployed AI function and local draft recovery on actual devices.
- **Receipt reconciliation.** Extend the existing split-by-quantity screen to retain an unused remainder or record a return. Today the split distributes the full cost across selected jobs.
- **Voice notes and photos.** Preserve original voice audio, extract simple commands for the user to confirm, and suggest before/during/after photo tags with a manual override. Transcription and manual photo tagging exist. Broader offline crew capture and recovery still need work.
- **AI estimate and change-order intake.** Bring reviewed voice notes and selected photos into drafting where they add context. The estimate builder uses structured details and notes and does not directly interpret voice recordings or photos. Change-order drafts use text.
- **Trade follow-ups.** The trade review still calls for reusable property and equipment records, completed-visit billing for repeat services, and lightweight completion checklists where the trade needs them. Service packages, the paint worksheet, and electrical handover records already exist.

[Work-only receipts](receipt-work-policy.md) · [Offline recovery](offline-recovery-2026-11-16.md) · [Estimate inputs](../mobile/src/app/estimate/%5BjobId%5D/details.tsx) · [Trade review](trade-review-2026-10-21.md)

## Teams, account settings, and release validation

- **Crew permissions and activity.** Let crew collect signatures on prepared documents, add permitted unpriced work without creating a price-list entry first, and remove their own eligible photo and receipt uploads before billing. Show who added each entry on the owner’s job page. The Team person page already shows activity by person.
- **Crew AI and example mode.** Add the planned crew voice commands and photo tagging, and an example team or crew preview for onboarding. Crew receipt scanning and review already work.
- **Notifications.** Add push notifications for assignments, approvals, estimate activity, invoice signatures and drafts, and payments. The signed invoice updates in the app when the owner or manager opens the invoice or receives a live update.
- **Account and business setup.** Business contact email and address, and personal name, email and password settings exist in the workspace. Add Apple and Google sign-in, biometric locking, signed-in device management, account deletion, business license fields and hosted signup email verification if keeping the original roadmap requirement.
- **Paid-job cleanup and saved documents.** The warning, save/discard choice, automatic-save setting, saved-document library, PDF export, and cleanup function exist. The current cleanup runs when the owner opens Home, so scheduling and warning notifications are still open. [Paid-job cleanup notes](paid-job-cleanup-2026-11-17.md)
- **Physical-phone and pilot testing.** Verify menu swipe haptics, camera and microphone permissions, mixed English/Spanish transcription, cold restart and offline recovery, and owner-to-crew syncing on actual iOS and Android devices. Hosted live sync already passed a two-client integration test. The repo does not establish completion of the planned external pilot through Apple and Google’s test programs.

[Team implementation](team-roles-implementation-2026-11-17.md) · [Team plan](team-roles-plan-2026-11-17.md) · [Operations access check](../mobile/src/features/operations/api.ts) · [Paid-job cleanup migration](../supabase/migrations/20261117170000_paid_job_cleanup.sql) · [Live updates](live-updates-2026-11-17.md)

## Later product decisions

The roadmap deferred review requests and a desktop app. Broader dispatch, payroll, inventory, supplier integrations, and full bookkeeping were outside the first version. Subscription pricing and ownership transfer also remain open decisions. [Original feature outline](app-outline.md) · [Trade review](trade-review-2026-10-21.md) · [Team plan](team-roles-plan-2026-11-17.md)
