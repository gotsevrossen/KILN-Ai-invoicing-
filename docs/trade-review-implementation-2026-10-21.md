# Changes from the trade review

October 21, 2026

This implements a focused group of the [review panels' recommendations](trade-review-2026-10-21.md) within the current app. It adds no dependencies, paid services, or database schema changes.

## Trade-specific scope and content

The estimate builder now has a short customer-visible description with trade-specific prompts. Additional location, agreed-work/materials, and excluded/deferred-work details stay folded unless wanted. They appear on customer estimate and invoice previews. Private access notes are never copied into scope.

| Trade | Prompt coverage |
|---|---|
| Handyman | Task list, rooms/unit, customer-supplied materials, and unfinished repairs |
| Plumbing | Fixture/room, agreed repair, supplied parts, and return visits |
| Electrical | Device/room, replacement versus new location, diagnosis-only versus repair |
| HVAC | Optional unit/model identity, service outcome, and diagnostic-fee treatment |
| Drywall | Patch sizes/locations and texture/primer/paint boundaries |
| Painting | Surface measurement basis, prep, agreed coats/color/product and supply responsibility |
| Flooring | Installed area versus purchased quantity, removal, transitions, preparation, and disposal |
| Carpentry/decks | Dimensions/material, replaced versus retained sections, and finishing/disposal |
| Lawn | Confirmed service dates, skipped visits, and per-visit versus period billing wording |
| Landscaping | Bed/zone, plant/material identity, installed/purchased quantities, and delivery/preparation |

All prompts and controls have English/Spanish text. Starter line descriptions use the customer's language. Owner-authored text is retained verbatim and editable, with a reminder to write it in the customer's language; there is no automatic translation service.

These are owner-written scope details, not automated measurements, diagnostic judgments, a task tracking system, an equipment registry, or recurring-service automation.

## Billing and document changes

- Estimates cannot be issued or accepted with unresolved included prices, invalid/empty quantities, or blank included descriptions. An owner may explicitly exclude an item; its description remains visible as excluded scope. Draft previews identify unresolved scope and cannot be signed.
- Line descriptions, quantities (including fee counts), prices and labor/material/fee categories are editable. Zero-price items are allowed when entered deliberately. Changing a draft price does not automatically change the owner's whole price list; saving to the list is a separate action.
- Trip, diagnostic, haul-away and other template extras are offered as optional additions. They are no longer automatically inserted. Re-adding an excluded fee restores the existing line rather than contradicting the exclusion with a duplicate.
- Accepted hourly estimates support an explicit choice between logged hours and agreed hours. Logged hours replace estimated hourly labor rather than being appended to it. Missing actual hours/rate blocks sending when it would otherwise drop quoted hourly labor.
- Receipt materials default to included costs when there is an accepted estimate. Owners can choose separately billed materials and must confirm that labor/materials are charged once before issue. This does not automatically infer which receipt was covered by a particular package.
- Estimate line categories are preserved for configured taxes. Estimates and invoices use the same configured tax basis; issued tax settings are copied rather than following later settings edits.
- Owner-edited invoice summaries survive navigation and appear in the customer preview. Issuing an invoice copies its lines, tax, scope/exclusions, summary, display mode, address/work order and due-date settings. Later hours, receipt or settings edits do not recalculate that issued copy. Issued estimates are locked against later line/scope edits.
- The draft-input copy now describes the available job record without claiming that the rule-based builder interpreted voice/photos.

## Receipts, properties, and changes

- Receipt splitting supports equal shares or owner-entered quantities/ratios, with a live cost preview. A 3:1 split preserves the full cost including receipt tax to the cent. Invalid or duplicate job assignments are rejected. Partial unused remainders and returns are still future work.
- Existing customers show explicit property choices from their prior jobs. Changing customer clears the previous address, work order and private access text. No address is silently borrowed from an arbitrary previous job. This does not add a separate saved-address database table.
- Active work and unsent invoice drafts offer **New change order**, even without a preexisting example change. The owner enters the description and additional price, then uses the current hand-the-phone review flow. Approval includes it once; decline leaves it unbilled. Pending changes must be resolved before invoice issue, and additional changes cannot rewrite an already issued invoice. Change totals are labeled before tax.
- New local record IDs use the existing UUID helper to avoid collisions with example records. The existing typed Settings-route error was corrected.

## Verification and limits

Automated checks cover unresolved/excluded estimate scope, invalid quantities/prices, zero prices, material tax classification, actual versus estimated hours, included versus additional receipts, duplicate receipt suggestions, unequal allocation/rounding, missing actual hours, and isolation of issued copies from later edits.

An additional in-memory check exercised the actual store actions and selectors with React/database stubs: send/sign guards, locked estimates, billing confirmation, pending/declined/approved changes, unchanged issued totals after later hours/tax edits, summary retention, and weighted receipt allocation. This is not a live database or UI test.

Verification results:

- `npm test`: **34 tests passed**.
- `npm run typecheck`: **passed**, including the Settings navigation correction.
- `npm run lint`: **passed**, with no lint warnings.
- `npx expo export --platform web`: **passed**, producing the web bundle and 19 route entries in a temporary output directory.
- Actual-store action/selector check with React/database stubs: **passed**.
- `git diff --check`: **passed**.

Interactive browser verification was unavailable because the browser tool listed no connected browsers. A local route returned HTTP 200, but the server response contained the initial app shell rather than rendered screen content; it was not counted as a screen test. Phone/browser layout and interaction remain unverified. No live database or payment operation was exercised.

**Storage and integrations:** these document changes follow the existing session storage model. They are not durable across restart or devices. Secure customer links, server-enforced document versions and approval auditing, real media capture, AI drafting, message delivery, payment processing, exports and recurring invoice execution remain unfinished. The current screens are a prototype; this change does not make them production billing/signing infrastructure.

**Deposit preview limitation — accepted for the preview:** the estimate displays a requested deposit, but the payment action is a demonstration. No deposit or partial payment is recorded or deducted from the invoice balance. Before real billing, deduct confirmed payments from the full invoice total and display the amount already paid and remaining balance. Signing an estimate or requesting a deposit alone must never count as payment. Rossen approved leaving this behavior as-is for the preview, provided it is documented.

**Still to validate or build separately:** structured task completion, reusable saved scope bundles, a true equipment/property directory, partial receipt remainders and returns, completed recurring-visit records, measurement worksheets, and document revision/credit workflows. Larger-company scheduling, dispatch, team accounts, payroll and inventory stay outside first-version scope.
