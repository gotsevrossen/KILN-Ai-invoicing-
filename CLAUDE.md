# KILN — CLAUDE.md

Guide for Claude when working on KILN, in the codebase (Claude Code) and in planning chats (claude.ai Project). Keep this file updated when decisions change.

## What KILN is

KILN is an AI invoicing tool for solo and very small trades businesses: plumbers, handymen, electricians, lawn care. It turns what happens on a job (voice notes, photos, receipts, quick typed notes) into a finished, professional invoice, and helps the owner get paid.

## Who it's for

- Owner-operators running 1–3 person businesses.
- Phone-first, not techy, and they do invoices at night or on weekends.
- Jobs range from about $100 to $6,000.
- Their pains: forgetting billable items, scope changes that never get written down, customer disputes, slow payment, and admin time.
- Their customers: homeowners, and landlords / property managers (one customer, many addresses).

**Design rule:** if a step adds admin time for the owner, it's wrong. Fewer taps always wins.

## Current stage (Oct 2026)

- The app has example mode and connected Supabase sign-in. Business/setup, settings, prices, customers, and jobs have database save/load paths. Document drafts, hours, receipt sorting, change approvals, and invoice snapshots still live in the app session; they are not yet durable across restarts or devices.
- Trade-review improvements (Oct 21): optional customer-visible scope prompts for all 10 trades in English/Spanish; explicit exclusion of unpriced estimate items; editable descriptions, quantities, prices and labor/material/fee classification; optional fees; invoice labor/material reconciliation; issued-document copies; weighted receipt splits; explicit property selection; owner-created change proposals with approve/decline. See `docs/trade-review-implementation-2026-10-21.md` for coverage and limits.
- Deposit preview limitation (accepted by Rossen): estimates display the requested deposit, but the preview does not collect or record it, and invoices do not deduct deposit or partial payments yet. This is acceptable for the preview. Before real billing, confirmed payments must be linked to the job/invoice and subtracted from the balance due; requesting a deposit or signing an estimate must not count as payment.
- Y Combinator one-page pitch drafted.
- Customer discovery in progress: interviews with local trades businesses.
- Pages, features, and build order outlined in `docs/app-outline.md`. That file has the full screen list.

## First version scope

1. **Invoice builder from inputs.** Voice, photos, receipts, and typed notes become a draft invoice. The draft is built when the owner taps "Job done". The owner reviews, edits, and sends it. The AI flags items that look missed.
2. **Receipt to job assignment.** The owner snaps a receipt photo (or uploads a PDF or screenshot) and the AI pulls out each line item. The app asks which job **each item** is for. No guessing by location: owners buy for many jobs in one store trip. The owner can:
   - assign an item to one job (or create a new job),
   - split an item across jobs,
   - mark it as personal or overhead,
   - apply a markup.
   Unassigned items wait in an inbox until they're sorted. Nothing gets dropped.
3. **Change orders.** The owner captures a scope change on site by voice or photo. KILN writes up the change order with a price, the customer signs by web link or on the owner's phone, and the change is added to the invoice automatically.
4. **Proof-of-work invoices.** Before/after photos (the AI guesses the tag, the owner can fix it), GPS location, timestamps, and a short AI job summary are attached to the invoice.
5. **Send and get paid.** Invoice link; card, bank transfer, Apple Pay / Google Pay; owner can mark cash or check as paid. Deposits, progress payments, and partial payments. Payment reminders on a schedule the owner turns on. Repeat invoices for repeat work (weekly mowing, monthly service).
6. **Estimates.** The owner enters job details (job type, square footage, counts, notes) and the AI builds an estimate from the **owner's own price list**. It never makes up prices; unpriced items are flagged. The customer signs by link or on the owner's phone, and the signed estimate becomes the job's agreed price. Built right after invoices, reusing the same line items and customer link.
7. **Voice commands.** Voice notes are saved as notes, and KILN also picks out simple actions ("add 2 hours and a $40 faucet to the Smith job") for the owner to confirm with one tap.
8. **English and Spanish** from the start: app screens, voice notes, AI drafts, and customer pages. The owner's language and each customer's language are set separately. Customer documents use the customer's language.
9. **Exports.** Invoice and estimate PDFs, spreadsheet download, and a one-way sync of invoices and payments to QuickBooks.

**Job flow:** every job moves through Create → Estimate (can be skipped for small or hourly jobs) → Work (photos, receipts, notes, hours) → Invoice (built on "Job done" from the signed estimate, signed change orders, hours, and sorted receipts) → Paid. The job screen shows this as a progress bar and always offers one big next-step button.

**Trades and setup:** first-run setup asks the business name, language, which trades they do (pick all that apply: plumbing, electrical, HVAC, drywall, painting, flooring, handyman, carpentry/decks, lawn care, landscaping), and how they usually charge. Job types, estimate questions, and the starter price list come from the trades (`mobile/src/data/trades.ts`). Starter items have **no prices**; the owner types their own.

**Current estimate/invoice safeguards:** every included estimate item needs a valid quantity, description, and owner-entered price (zero is allowed). Explicitly excluded lines remain visible as excluded scope. Template fees are opt-in and their quantities are editable. On invoices with an accepted estimate, the owner confirms whether to use agreed or actual hourly labor and whether receipt materials are included or additional; estimated and actual hourly labor are not both appended. A missing actual-hours entry cannot silently replace quoted hours. Issued estimate content is locked, and issued invoices copy their lines, tax, scope, summary, materials display and due-date settings within the current session. Production storage, customer-link versioning and signature audit remain unfinished.

**Receipt tax:** when receipt items are sorted to jobs, each item's cost includes its share of the receipt's tax (split by price, to the cent). Markup applies to that cost, so invoices don't add sales tax on materials by default (owner can turn it on in Settings).

**Labor:** set per job, either flat price or hourly. Hourly jobs use hours the owner types in by hand (no timer).

**Pricing details:** materials shown itemized or as one total (owner picks per invoice); markup is built into prices and never shown as its own line. Card fee for customers is an on/off setting. Due date is a default the owner can change per invoice, with an optional late fee. Saved terms and warranty are added to every estimate and invoice. 2–3 invoice templates plus logo and color.

**Out of scope for the first version:** full bookkeeping and taxes, payroll, scheduling/CRM, financing, supplier price integrations or store accounts, importing receipts from email, review requests, helper/team logins, lien tools. Don't build these unless Rossen says so.

## Platforms

| Surface | Who uses it | Notes |
|---|---|---|
| Contractor app (iPhone + Android) | Owner | Main product. Built with Expo. Three tabs: Home, Capture, Jobs. |
| Customer web pages | Customer | View estimate or invoice, sign, pay. No app or account; secure link only. |
| Contractor web dashboard | Owner | Later phase. Same Expo codebase exported to web, for desk work. |

**Look and feel:** same family as Rossen's LightHouse and Bloom apps: light gray ground, white cards with big rounded corners, black text, heavy uppercase titles, one strong color card. Tuned for trades: buttons at least 48–56 px tall for gloves, high contrast for sunlight, dark mode. Main color is "kiln orange" `#F0844C` with black text on it. Headings and money use **Archivo** (ExtraBold/Bold); body text uses the phone's own font. All tokens live in `mobile/src/theme/tokens.ts`.

**Launch:** test with 5–10 interviewees through Apple's and Google's test programs before a public release.

## Tech stack

- **App:** Expo SDK 57 (React Native) + TypeScript (strict), Expo Router, in `mobile/`. On SDK 57, not 58, so the App Store's Expo Go can open it; upgrade to 58 once Expo Go supports it (expected early Nov 2026) with `npx expo install expo@~58 --fix`. One codebase for iOS, Android, and web. Read `mobile/AGENTS.md` and the versioned Expo docs before touching an Expo API. Add packages with `npx expo install`.
- **Backend:** Supabase: Postgres, Auth, Storage, Row Level Security, Edge Functions. For pre-release it runs **locally in Docker** on Rossen's computer (`npx supabase start` in the repo root; project id `kiln`, because the folder name ends in "-" which breaks Docker hostnames). Schema in `supabase/migrations/`; permission tests in `supabase/tests/database/` (`npx supabase test db`). The app reads the server address from `mobile/.env.local` (git-ignored; template in `.env.example`); with no address it runs in example mode. Server secrets go in `supabase/.env` (git-ignored), never in the app. Phones reach the local server through a Cloudflare Tunnel.
- **Sign-in:** email and password, Sign in with Apple, Sign in with Google. Face ID or fingerprint to open the app after that. **To add later:** after signing up with email, the owner verifies their email by typing a 6-digit code KILN emails them (a code, not a link, so they never leave the app). Supabase supports this; it needs the email sending service from "Decided" first. Until then, sign-up works without verifying.
- **AI:** Claude API for reading receipts (vision), drafting estimates, invoices, change orders, and job summaries, and finding voice commands. Called only from the server (Edge Functions), never from the app directly.
- **Speech-to-text:** not decided yet. Must handle English, Spanish, and notes that mix both.
- **Languages:** all app text kept in translation files (`mobile/src/i18n/en.ts` and `es.ts`, using `i18n-js` + `expo-localization`). TypeScript checks that both files have the same keys. No hard-coded strings in screens.
- **Tests:** money math tests run on Node's built-in test runner (`npm test` in `mobile/`), no test library needed.
- **Payments:** Stripe. Exact setup (e.g. Connect) not decided yet.
- **E-signature:** built in-house for the first version (signature capture + audit trail). Revisit a provider later.
- **Sending:** texts go from the owner's own phone (KILN opens the text app with the message and link filled in). Emails are sent by KILN.
- **Offline:** photos, voice notes, receipts, notes, and hours queue locally and sync when the phone is back online. Jobs can be viewed offline. AI and sending wait for signal.
- **Storage:** keep everything while the account is active. Shrink full-size photos after upload.

Check current docs before using a library. Don't guess versions or APIs.

## Data model (starting point)

- `businesses`, `contractors` (one login per business for now, but all data belongs to the business so helpers can be added later)
- `customers` (with language), `customer_addresses` (property managers have many), `jobs` (flat or hourly, optional work order number, private notes)
- `price_list_items`, `estimates`, `time_entries`
- `invoices`, `line_items`, `recurring_invoices`
- `receipts`, `receipt_items` (`job_id` is empty until the owner assigns it)
- `change_orders`, `signatures`
- `photos` (job, before/after, GPS, taken_at)
- `voice_notes`
- `payments` (many per invoice: deposits, progress, partial, cash/check)

Store money as integer cents. Never use floats for money.

## Security and privacy (non-negotiable)

Rossen is a cybersecurity student with Security+. Security is part of KILN's pitch, so treat it as a feature.

- Row Level Security on every table. A business only ever sees its own data.
- API keys and secrets stay on the server. Never ship them in the app.
- Customer links use long, unguessable tokens, expire, and only open one document.
- Signatures record signer name, timestamp, IP/device info, and a hash of the signed document.
- GPS photos are sensitive. Strip location data from customer-facing copies unless it's meant to be shown (proof of work).
- Private job notes are never shown on customer pages.
- Validate all AI output before saving it.
- Keep an audit log of estimate, invoice, change order, and payment events. Collect only the personal data needed.

## AI behavior rules (inside the product)

- **AI drafts, the owner approves.** Nothing is sent to a customer or charged without the owner tapping send. Voice commands are confirmed before they change anything.
- When the AI isn't sure (blurry receipt, unclear job, no price in the price list), flag it and ask. Don't guess.
- Estimate, invoice, and change-order language should be plain, clear, and professional, in the customer's language.
- The AI never writes legal terms or warranties. Those come from the owner's saved terms.

## How to work with Rossen

- Rossen is a solo founder and full-time Purdue cybersecurity student building KILN part-time.
- Explain tradeoffs briefly, then give a recommendation.
- Use plain language. No jargon or abbreviations in questions and explanations.
- Ask before big decisions: new dependencies, schema changes, paid services, anything hard to undo.
- Build in small, working steps. Each step should run.
- Write tests for money math (totals, markup, tax, splits, deposits, partial payments) and for permission rules.
- When writing as Rossen (pitch, emails, interview notes), keep it simple and direct, the way he'd say it. Short sentences, no fluff.

## Decided

- One login per business for now. Design for helpers later.
- Sending: texts from the owner's phone, emails from KILN. Automatic reminders go by email; text reminders are one tap for the owner.
- KILN's emails come from KILN's own automated address, never the owner's or customer's email. "From" shows the business name (e.g. "Mike's Plumbing (via KILN)"), and Reply-To is the owner's email so customer replies reach them. Not a true "noreply" address. Set up later in development: a KILN domain with a separate sending sub-address, SPF/DKIM/DMARC records, and a sending service called only from an Edge Function. The same service also sends sign-in emails (password reset). Until then, local Supabase catches all emails at http://127.0.0.1:54324.
- Sales tax for the first version: the owner sets one rate and switches tax on or off for labor and materials.
- KILN's own pricing: leaning toward a monthly subscription. No billing needed in the first version.

## Open decisions

- What the Home screen shows first
- Speech-to-text provider (English, Spanish, and mixed)
- Stripe setup details
- KILN's exact price
- Automatic sales tax by state
- When to build the contractor web dashboard
- KILN's domain and email sending service (leaning Resend to start; Postmark is the backup)
