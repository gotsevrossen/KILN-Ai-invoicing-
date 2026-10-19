# KILN — Pages and Features (first version)

Last updated: Oct 19, 2026

This is the list of screens and features for the first version of KILN. Rule for every screen: if it adds admin time for the owner, cut it. Fewer taps wins.

---

## Decisions so far

### Who uses it
- **One login per business for now.** Data is stored under the *business*, not the person, so helpers can be added later without redoing the security rules.
- **Customers:** homeowners, and landlords / property managers (one customer, many addresses, sometimes a work order number on the invoice).
- **Languages:** English and Spanish from the start: app screens, voice notes, AI drafts, and customer pages.
  - The voice-to-text service must handle Spanish well, including notes that mix English and Spanish.
  - The owner's language and each customer's language are set separately. Estimates, invoices, change orders, and customer pages use the **customer's** language. The app uses the **owner's**.

### Inputs
- **Voice notes** are saved and turned into text. KILN also picks out simple commands ("add 2 hours and a $40 faucet to the Smith job") and shows them for the owner to confirm with one tap.
- **Receipts:** photo of a paper receipt, or upload a PDF or screenshot. No email receipts for now.
- **No guessing by location.** Owners buy for many jobs in one store trip, so KILN asks which job **for each receipt item**. Photos and notes also ask "Which job?", with a **New job** option at the top.
- **Photo tags** (before / during / after): the AI guesses, and the owner can fix it.
- **Hours:** typed in by hand on hourly jobs. No timer.

### Layout and look
- **3 tabs: Home, Capture, Jobs.** The Inbox lives in Home. Estimates and invoices live inside each job, plus a list in Home.
- What Home shows first: **not decided yet.**
- Big buttons for gloves and dirty hands, high contrast for sunlight, dark mode, plain and simple design.

### Estimates and pricing
- The owner enters job details (job type, square footage, counts, notes). The AI builds the estimate from the **owner's own price list**. It doesn't make up prices. Items without a price are flagged.
- Customer **signs** by link or on the owner's phone. The signed estimate becomes the job's agreed price.
- **Labor is set per job:** flat price or hourly.
- **Materials on the invoice:** the owner picks itemized or one total, per invoice. Markup is built into prices and never shown as its own line.
- **Sales tax:** the owner sets one rate and switches tax on or off for labor and materials. No automatic state rules yet.
- **Terms and warranty:** written once in settings, added to every estimate and invoice, and editable per job.
- **Design:** 2–3 templates to choose from, plus logo and color.

### Getting paid
- **Payment methods:** card, bank transfer, Apple Pay / Google Pay, and owner marks cash or check as paid.
- **Card fee:** a setting. The owner turns on adding the card fee for customers, or leaves it off and absorbs it.
- **Deposits** when the estimate is signed, **progress payments** on long jobs, and customers can **pay part now, rest later**.
- **Due dates:** the owner picks a default and can change it per invoice. Optional late fee.
- **Reminders:** the owner turns on a schedule. Emails go automatically. For texts, KILN tells the owner and fills in the message.
- **Repeat invoices** for repeat work (weekly mowing, monthly service). No scheduling.
- **Sending:** texts go from the owner's own phone (KILN fills in the text app). Emails are sent by KILN.

### AI
- The invoice draft is built when the owner taps **"Job done"**. Owner gets a notification: "Invoice ready to review."
- AI drafts, owner approves. Nothing is sent or charged without the owner tapping send.

### Other
- **Sign-in options:** email and password, Sign in with Apple, Sign in with Google. Face ID or fingerprint to open the app after that.
- **No signal:** captures (photos, voice, receipts, notes, hours) save on the phone and upload later. Jobs can be viewed offline. AI and sending wait for signal.
- **Storage:** keep everything while the account is active. Full-size photos are shrunk after upload.
- **Exports:** invoice and estimate PDFs, spreadsheet download, one-way sync to QuickBooks.
- **No review requests for now** (removed from the first version).
- **KILN's own price:** leaning toward a monthly subscription. Not needed in the first version.
- **Launch:** test with 5–10 interviewees through Apple's and Google's test programs before a public release.

---

## 1. Contractor app (iPhone + Android)

### Sign-in and setup
| Screen | What it does |
|---|---|
| Welcome / Sign in | Email and password, Apple, or Google. Then turn on Face ID or fingerprint. |
| Setup (3–4 short screens) | Business name, trade, logo, phone, email, license number, language. Defaults: hourly rate, materials markup, tax rate and what's taxed, due date, terms. Payment setup can wait until the first invoice is sent. |

### Home tab
- What it shows first: not decided yet.
- **Inbox:** receipt items not yet assigned, voice commands to confirm, and anything the AI wasn't sure about.
- **Estimates and invoices list:** filtered by status (draft, sent, viewed, signed, part paid, paid, overdue).
- Upload status ("3 items waiting to upload").

### Capture tab (big center button)
- **Voice note:** record, turn into text, pick the job. Any commands found are shown to confirm.
- **Photo:** take the photo and pick the job. The AI tags it before/during/after, and location and time are saved.
- **Receipt:** snap or upload. The AI reads each line item. The **review screen** goes item by item: pick a job (or **New job**), split across jobs, mark personal/overhead, or add markup. Skipped items go to the Inbox. Blurry or unclear items are flagged, never guessed.
- **Typed note:** a quick text box, then pick the job.

### Jobs tab
- **Job list:** active, done, paid, with search.
- **New job:** customer (from phone contacts or new), address, title, flat or hourly, optional work order number.
- **Job detail:** a timeline of everything (voice notes, photos, receipt items, notes, hours, estimate, change orders, invoices, payments). Buttons: **Build estimate**, **Log hours**, **Change order**, **Job done**.
- **Private notes:** gate code, "dog in yard". Never shown to the customer.
- **Log hours:** date, hours, optional note.
- **Customer:** name, phone, email, language (English or Spanish), one or more addresses (for property managers). No customer management system.

### Estimates
- **Estimate builder:** job type, measurements, notes/voice/photos. The AI makes line items from the price list and flags items with no price. The owner edits, sets a deposit if wanted, previews, and sends.
- **Estimate detail:** status (draft, sent, viewed, signed, declined, expired), resend, sign in person.

### Invoices
- **Invoice editor:** the AI drafts from the job (signed estimate, change orders, receipt items, hours, notes). The owner edits items, markup, tax, materials itemized or one total, and due date. Shows **"Possibly missed"** notes. Deposits already paid are subtracted.
- **Progress invoice:** bill part of the job (e.g. 50% at rough-in).
- **Proof of work:** pick photos, an AI job summary, and a switch to show location or not.
- **Customer preview** and **Send** (text and/or email). Nothing goes out without this tap.
- **Sent invoice detail:** status, payments received, reminder schedule, resend, mark paid (cash/check), cancel invoice, download PDF.
- **Repeat invoice setup:** customer, items, how often. KILN drafts each one for the owner to approve, or sends automatically if the owner turns that on.

### Change orders
- **New change order:** voice or photo on site. The AI drafts the description, price, and new total. The owner edits.
- **Get it signed:** send a link, or hand the phone to the customer.
- Once signed, it's added to the invoice automatically.

### Settings
Business profile, logo, color, and invoice template; **price list** (item, unit, price); rates and defaults; tax; terms and warranty; payment setup and card fee choice; due date and late fee; reminder schedule; language; notifications; security (Face ID, signed-in devices); exports (spreadsheet, QuickBooks); delete account.

---

## 2. Customer web pages (no app, no account, secure link only, English or Spanish)
| Page | What it does |
|---|---|
| Estimate | Business branding, line items, terms, total, deposit due. Customer signs to accept (and pays the deposit), or declines. |
| Invoice | Line items, signed change orders, proof of work, amount paid so far, amount due. **Pay** button. |
| Payment | Card, bank transfer, Apple Pay / Google Pay. Pay the full amount or part. Confirmation and receipt. |
| Sign change order | Description, price, new total. Type name, draw signature, agree, get a copy. |
| Link expired / not valid | Says to contact the business. Shows no details. |

---

## 3. Behind the scenes (no screens)
- **Server-side AI:** reads receipts, drafts estimates, invoices, and change orders, writes job summaries, finds voice commands, turns voice into text (English and Spanish). All AI output is checked before saving.
- **Customer links:** long and unguessable, expire, and open one document only.
- **Payments:** Stripe records payments, deposits, and partial payments.
- **Reminders and repeat invoices:** run on a schedule.
- **Notifications to the owner:** viewed, signed, paid, invoice ready to review.
- **Photos:** location removed from customer copies unless it's being shown as proof of work. Shrunk after upload.
- **Records:** a history of every estimate, invoice, change order, and payment event. Signature proof (name, time, internet address, device, and a fingerprint of the signed document).
- **QuickBooks sync:** one-way, invoices and payments only.

---

## Build order (each step works on its own)
1. Sign in, setup, jobs, and customers, in English and Spanish from day one
2. Capture photos, notes, and voice notes, working without signal
3. Invoice editor by hand: hours, tax, terms, templates, PDF. Tests for all the money math
4. Customer invoice page and payments (all methods, partial payments, mark cash/check)
5. Estimates: price list, AI estimate builder, customer signing, deposits
6. Receipts: AI reading, item-by-item job picking, Inbox
7. AI invoice drafts on "Job done", "Possibly missed" notes, voice commands
8. Change orders (reuses signing) and progress invoices
9. Proof of work, payment reminders, repeat invoices
10. Exports: spreadsheet and QuickBooks

**Later (after the first version):** review requests, helpers/team logins, the desktop web version.

---

## Still open
- What Home shows first
- Which voice-to-text service to use (must handle English, Spanish, and a mix of both)
- Stripe setup details
- KILN's exact price
- Automatic sales tax by state
- When to build the desktop web version
