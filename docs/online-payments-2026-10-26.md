# Sending invoices and getting paid online (Oct 26, 2026)

## What it does

- **Send.** On a finished invoice, **Send to [name]** offers **Text**, **Email**, and **Share link**. KILN freezes the invoice as sent, makes a private link, and opens the phone's texting or email app (or the share menu) with a short message in the customer's language. The owner taps send there. **Send again** on a sent invoice makes a fresh link; older links keep working until they expire (90 days).
- **The customer's page** is at `https://kiln.expo.app/pay/<code>`. There's no app or account: the link's code opens that one sent invoice. It shows the business, the invoice as sent (lines, tax, total, scope, summary, before/after photos), and how to pay. Location shows only if the owner turned it on. Private notes, the customer's phone and email, and other invoices are never sent to the page.
- **Paying.** **Apple Pay / Google Pay** buttons are the only wallet choices: no typed-in card, Link, PayPal, or others. **Pay from your bank account** is ACH through Stripe: the customer picks their bank and logs in on Stripe's page. Bank payments take up to 4 business days. The amount is always what's left on the invoice, worked out on the server from the sent copy. When Stripe isn't set up, the page tells the customer to contact the business and shows a call link.
- **Paid, by itself.** Stripe tells KILN's server when a payment goes through (`stripe-webhook`). The pay page also checks right after paying. When the paid total reaches the invoice total, the invoice is marked paid. The app checks every 15 seconds while a sent, unpaid invoice is open, and when the app opens. It shows:
  - "[name] opened it [date]."
  - "Bank payment of $X on its way."
  - "Paid with Apple Pay / Google Pay." or "Paid from a bank account."
- **Cash.** **Paid in cash** works as before. It records a cash payment for whatever is left after online payments.
- **Owner setup.** Settings → Payments → **Set up with Stripe** opens Stripe's own sign-up for the business's own Stripe account. The money goes there, and Stripe bills its fees to the owner: about 2.9% + 30¢ for Apple Pay / Google Pay, and 0.8% (up to $5) for bank. KILN pays nothing and keeps only the account id. The screen shows what's ready. **Check again** asks Stripe.

## Pieces

| Piece | Where |
|---|---|
| Database: `stripe_accounts`, link `opened_at`, payment `status`, `record_stripe_payment()` | `supabase/migrations/20261027120000_online_payments.sql` |
| Owner: Stripe setup, status, invoice links (signed in) | `supabase/functions/payments` |
| Customer page: view, start payment, check payment (link code only) | `supabase/functions/pay` |
| Stripe's payment notices (signature checked) | `supabase/functions/stripe-webhook` |
| Shared: Stripe requests, signature check, link codes, totals | `supabase/functions/_shared/` (`money.ts` is a copy of `mobile/src/lib/money.ts`; a test fails if they differ) |
| App: send sheet, invoice status, Settings → Payments | `components/send-invoice.tsx`, `app/invoice/[id]/index.tsx`, `app/settings/payments.tsx`, `data/db-pay.ts` |
| Web page and Stripe's payment pieces | `app/pay/[token].tsx`, `components/stripe-pay.web.tsx`, `app/stripe-done.tsx` |
| Publish the web page | `scripts/deploy-pay-page.ps1` (Expo hosting, built against the hosted server) |

## Security

- Link codes are 32 random bytes. Only their SHA-256 hash is stored. Every failure (bad, expired, revoked, or unsent) gives the same "not found".
- Only the server makes links, Stripe accounts, and online payments. Row rules let owners add **cash/check** payments only, and nobody can change or delete a payment from the app.
- Webhooks must carry a valid Stripe signature that's less than 5 minutes old. The payment must name an invoice and business that KILN started, on that business's own Stripe account.
- A payment reported twice is saved once. A late "on its way" notice never undoes a payment that went through.
- Tests:
  - `supabase/tests/database/rls.test.sql` (86 checks)
  - `supabase/functions/_shared/shared.test.ts` (run from that folder: `npx deno@2.9.6 test shared.test.ts`)
  - `mobile/src/lib/money-copy.test.ts`

## Setup (test mode first; no real money moves)

1. **Stripe account.** Sign up at dashboard.stripe.com and stay in test mode (a sandbox).
2. **Connect.** In Stripe, open Connect → Get started, and fill in the platform profile. KILN is a software platform whose users take payments, with **Stripe handling pricing and fees** and **the full Stripe Dashboard** for each business.
3. **Keys.** Developers → API keys: the publishable key (`pk_test_…`) and the secret key (`sk_test_…`).
4. **Webhook.** Developers → Webhooks → Add destination:
   - Events from: **Connected accounts**
   - Events: `payment_intent.processing`, `payment_intent.succeeded`, `payment_intent.payment_failed`
   - Endpoint: `https://ssjshfjkkgcqjvvsjsnk.supabase.co/functions/v1/stripe-webhook`

   Copy its signing secret (`whsec_…`).
5. **Hosted server secrets.** Put these four lines in `supabase/.env.hosted.local` (git ignores it):
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   KILN_PAY_URL=https://kiln.expo.app
   ```
   Then run this from the repository folder: `npx supabase secrets set --env-file supabase/.env.hosted.local`
6. **Laptop server (optional).** Add the same Stripe lines to `supabase/.env`, with `KILN_PAY_URL=https://idddjz8-rosseng-8081.exp.direct` (Expo's tunnel address), then run `npx supabase stop` and `npx supabase start`. Links then open the pay page from the running Expo, so they work only while Expo is running with `--tunnel`. Links are made even without Stripe keys; the page then shows the call-the-business option. Webhooks need `stripe listen --forward-connect-to <address>/functions/v1/stripe-webhook` and that command's `whsec_` secret.
7. **Try it.**
   1. Start KILN with `-Server Hosted` and sign up (the hosted server has its own accounts).
   2. Go to Settings → Payments → Set up with Stripe. Test-mode sign-up accepts test details:
      - phone code `000000`
      - SSN `000-00-0000`
      - routing `110000000`
      - account `000123456789`
   3. Back in KILN, check that Settings shows "Ready: Apple Pay / Google Pay and bank account."
   4. Make a job and invoice, then **Send → Text** to your own phone.
   5. Open the link in Safari on an iPhone (Apple Pay; in test mode a real card in Wallet isn't charged) or Chrome on Android (Google Pay), or pick **Pay from your bank account** and the test bank.
   6. The invoice in KILN shows paid within about 15 seconds.

## Limits (for now)

- Only the whole amount left can be paid online: no partial payments yet, and deposits on estimates aren't collected.
- The app doesn't save customer emails yet, so **Email** opens the email app with the subject and message filled in, and the owner adds the address. Emails sent by KILN itself wait for KILN's domain and email service.
- The "Card fee for customers" setting doesn't add a fee to online payments yet.
- The owner's terms and warranty aren't on the customer page yet (they aren't saved anywhere yet).
- Refunds and disputes are handled in the owner's Stripe Dashboard. KILN doesn't show them yet.
- Expo hosting builds the whole web app, so the owner's sign-in page is also reachable at kiln.expo.app (same rules and data as the phone app).
