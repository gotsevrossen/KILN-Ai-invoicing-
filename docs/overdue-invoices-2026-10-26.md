# Overdue invoice visibility

October 26, 2026

## Why this change

The [trade review](trade-review-2026-10-21.md#finish-existing-promises-before-expanding-broadly) prioritizes completing the planned billing flow, preserving issued documents, and making content truthful. The [first-version outline](app-outline.md) calls for overdue invoice status and amounts on Home. The current source already saves invoice issue dates, payment terms, lines and tax, so this step needs no new database schema, dependency or service.

Before this change, `jobStatus()` returned `sent` for every live sent invoice, regardless of its due date. Home's overdue cards selected only the fixed overdue example. An owner's real overdue invoice therefore remained absent from the overdue count/list. The example Remind button only displayed a notice claiming the text app had opened.

## Behavior

- Sent, unpaid invoices with a positive balance become overdue on the calendar day after their saved due date. Due-on-receipt invoices become overdue the following day, rather than immediately on the issue date.
- Home's count, overdue amount and cards use the same status calculation as Jobs. Cards show the saved invoice total and correct overdue days, and open the invoice for review; the fixed example without an invoice opens its job.
- Payment terms come from the issued copy. Changing the Settings default does not postpone or accelerate an already-issued invoice. Marking it paid removes it from overdue and outstanding amounts.
- Drafts, paid invoices, zero/negative balances, absent issued records and invalid date/term data do not generate overdue notices. Missing data is not replaced with guessed issue dates or current Settings terms.
- Signed-in businesses use the phone's current local date on each calculation. A newly sent invoice uses that date, even after an overnight session, and draft due-date previews agree. Returning to the foreground refreshes date-dependent lists. Example mode retains its fixed demonstration date.
- Calendar arithmetic handles month/year boundaries, leap years and daylight-saving changes without treating a 23/25-hour day as a fractional overdue day. Existing English/Spanish pluralized labels are reused.

The old demonstration Remind action has been replaced with navigation to the invoice. No reminder, message or payment is sent by this change. Deposits and partial payments retain the accepted preview limitation.

## Verification

- `npm test`: 77 passed, including 14 new calendar/aging and actual-selector regression tests. Cases include paid/draft/zero balances, saved terms versus changed defaults, Home totals, fixed examples, current signed-in dates, daylight-saving boundaries, leap years and invalid data.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npx expo export --platform web --max-workers 2 --output-dir ../.kiln-runtime/overdue-web`: passed, with 35 static routes. The output is kept in the ignored local runtime folder.
- `git diff --check`: passed.

The selectors run directly against in-memory invoice fixtures in the automated tests; this is not a live database or phone interaction test. No schema change, database mutation, notification, payment operation or APK rebuild was performed. Existing preview/backend processes from the previous session were left running; this work did not launch another preview or restart them.
