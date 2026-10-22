# KILN trade review and feature ideas

October 21, 2026

Implementation follow-up: [changes made from this review](trade-review-implementation-2026-10-21.md). Findings and ratings below describe the source before those changes.

KILN's strongest next addition is **optional trade-specific scope detail inside the existing job flow**. The app already has the right basic structure for small trades businesses. Its starter catalog changes by trade, but the questions, descriptions, and billing decisions need to reflect the actual work more closely.

## How this review was done

Three actual subagents each performed an independent review for every supported trade: **10 panels, 30 persona reviews**. The session allowed only three reviewer threads, so the same reviewers adopted new trade-specific personas for each panel. For every trade, the perspectives were a solo operator, a three-person owner-led business, and an established company with roughly 6–10 people. Reviewers then read each other's findings, directly challenged priorities, and reconciled a consensus. Each panel below preserves their individual feedback and ratings.

These are **simulated customer perspectives grounded in source code**, not interviews, market research, or hands-on app testing. Occupational assumptions and proposed workflows need validation with real owners. Scores measure **design fit**, not production readiness: workflow coverage 0–4, trade-specific content 0–3, and low administrative burden 0–3. Consensus scores judge the intended 1–3-person customer; they are reasoned panel judgments rather than averages of incompatible company sizes. Small differences between scores are subjective.

Reviewed sources include the trade catalog, English/Spanish content, onboarding, price list, job creation/detail, capture, estimates, receipts, invoices, customer pages, state/selectors, and database paths. Source takes precedence over stale stage descriptions in the README and CLAUDE.md. This report proposes work; it does not implement features or change the product's agreed scope.

## Most useful additions across trades

| Priority | Addition or improvement | Concrete behavior | Best initial fit |
|---|---|---|---|
| 1 | Optional scope details tailored to the trade | Show a few relevant prompts after choosing a job type; let the owner skip them or dictate one short note. Use those details in the reviewed customer description. | All trades |
| 2 | Explicit included-versus-extra choices | Mark labor, materials, visits, and fees as included in agreed price or separately approved additions. Show why each charge appears. | Service trades, handyman, installations |
| 3 | Save an owner's repeatable scope | Reuse a task bundle, descriptions, quantities, and the owner's price list; confirm changed quantities and prices. Custom estimate lines already exist, so the new value is persistence and reuse. | Handyman turnovers, painting, flooring, lawn |
| 4 | More accurate material allocation | Keep equal splitting as a shortcut, with quantity/amount allocation and an explicit treatment for unused or returned materials. Never assign by location automatically. | Plumbing, handyman, carpentry, landscaping |
| 5 | Measurements that explain what is being priced | Distinguish wall area from floor area, installed area from purchased material, and boards from their dimensions. Show owner-entered assumptions; do not invent waste factors or prices. | Painting, flooring, drywall, carpentry, landscaping |
| 6 | Work performed and work left | Optional task/area completion detail feeding one editable customer summary. Deferred work must not silently become a charge or a claim of completion. | Handyman, drywall, multi-visit work |
| 7 | Property/equipment context without a full management system | Select the right property/unit and work order; optionally identify a fixture, circuit, or HVAC unit within that property. Reuse relevant context on the next job. | Property maintenance, plumbing, electrical, HVAC |
| 8 | Record completed recurring visits | For per-visit billing, draft from confirmed billable visits and service dates. Keep fixed-period agreements distinct; a skipped visit must not automatically trigger proration or a changed charge. Recurring invoices are already planned; visit records and billing-basis clarity are the refinement. | Lawn care, recurring maintenance |

These are priorities for validation, not a commitment to build eight features together. Start with one trade and one recurring omission, then reuse the smallest useful pattern. Preserve the short path for a simple hourly repair.

## Finish existing promises before expanding broadly

The panels repeatedly identified work already in the plan. It should not be counted as new feature ideation:

- **Capture, AI, delivery, payments, offline support, signatures, and exports:** substantial parts remain demonstrations or unverified. For example, capture records a kind/job in state; estimate `build()` converts entered quantities rather than interpreting the notes/photos; invoice send changes a state flag; customer payment shows a demonstration notice. Authentication and selected business/customer/job/price-list persistence paths do exist. It would be inaccurate to describe the whole app as either fully connected or wholly unsaved.
- **Unpriced scope must be resolved deliberately:** estimate Send uses `hasPriced`, meaning at least one priced line, while `estimateDocLines()` omits unpriced lines from the customer view. Require pricing or an explicit exclusion before sending, so work does not disappear silently.
- **Reconcile signed estimates with actual billing:** `invoiceLines()` combines signed-estimate lines, actual hourly labor, and allocated receipt materials. There is a source-grounded risk of charging again for something already included. This is a scenario to fix and verify, not a claim that a customer was double-charged.
- **Preserve issued documents:** the reviewed invoice flow derives lines from current job state. Implement explicit issued versions and adjustments so later job edits do not silently change an agreement or bill. The production snapshot flow was not exercised.
- **Review estimate/invoice tax consistency:** estimate lines are mapped to labor and estimates use zero tax, while invoice totals apply configured tax rules. Preserve appropriate line categories and make the owner's settings consistent across documents. This is product behavior to review, not jurisdiction-specific tax advice.
- **Make fee assumptions editable:** the estimate builder fixes trips at one and adds extras from templates. Let owners choose visits and whether diagnostics, travel, disposal, or other charges are included, waived, or additional. Do not silently add fees.
- **Make content truthful and persistent:** do not say voice/photos were used when the builder did not interpret them. Save owner-edited summaries, selected evidence, and customer-visible wording. Translate new prompts in both languages; the panels' sample Spanish is draft copy for owner testing.
- **Localize the actual scope as well as page labels:** customer estimate rows render stored `line.description` text, while surrounding labels use the customer's language. Translation-file coverage alone does not establish that descriptions written in the owner's language are translated. Finish the planned customer-language documents with reviewable descriptions, clear trade terms, and explicit units.

## Trade panels

| Trade | Consensus design fit | Main trade-specific opportunity |
|---|---:|---|
| [Handyman](#handyman) | 6.5/10 | Optional mixed-task punch list and property/unit clarity |
| [Plumbing](#plumbing) | 6.75/10 | Fixture/location/outcome detail and included repair costs |
| [Electrical](#electrical) | 6.25/10 | Device/room scope, diagnosis-only outcomes, and new-change creation |
| [HVAC](#hvac) | 6.25/10 | Optional unit identity and diagnostic/repair fee treatment |
| [Drywall](#drywall) | 6.5/10 | Patch sizes/locations and explicit texture/paint boundaries |
| [Painting](#painting) | 6.5/10 | Surface measurement basis and owner-authored room scope |
| [Flooring](#flooring) | 6.5/10 | Installed area versus purchased material and optional add-ons |
| [Carpentry and decks](#carpentry-and-decks) | 6.5/10 | Board dimensions/material and replaced-versus-retained scope |
| [Lawn care](#lawn-care) | 6.25/10 | Completed service dates and per-visit versus fixed-period billing |
| [Landscaping](#landscaping) | 6.25/10 | Bed/material identity, quantity basis, and unequal bulk usage |

### Handyman

Three simulated customer perspectives reviewed source independently, then directly accepted and challenged each other's priorities. These are occupational hypotheses, not customer interviews. No app runtime, payment flow, or production readiness was tested.

#### Individual perspectives

- **Impatient solo generalist: 6.5/10** — workflow 2.5/4, trade content 1.5/3, low administration 2.5/3. Homeowner repairs need fast capture, estimate skipping, and one bill for actual hours. This reviewer uniquely emphasized estimated-versus-actual labor reconciliation, optional minimum-charge defaults, and editable visits.
- **Three-person owner-led property-turnover business: 6.5/10** — 2.5/4, 1.5/3, 2.5/3. The owner handles billing without helper accounts. This reviewer emphasized distinguishing individual repairs, selecting the correct property/unit/work order, and unequal materials allocation between units.
- **Eight-person company with office administrator: 6/10** — 2.5/4, 1.8/3, 1.7/3. This expansion lens valued reusable turnover bundles and traceable draft inputs. Office/field handoffs lack support, but those larger-company needs are outside v1.

**Consensus design fit: 6.5/10**, comprising workflow **2.5/4**, content **1.5/3**, and low administration **2.5/3**. This judgment applies to KILN's 1–3-person target, rather than averaging incompatible company sizes. The basic job flow fits; generic repair descriptions and unresolved billing choices reduce fit.

#### Current coverage and reconciliation

`mobile/src/data/trades.ts::TRADES` provides Hourly work, Mounting, Assembly, and Small repairs. Starter items are labor, trip, mount, assembly, and small-repair, with owner-entered prices. English/Spanish labels include “Small repairs” / “Reparaciones pequeñas” and “Furniture assembly” / “Armar muebles.” Hours, private access notes, work orders, receipt allocation, and customer-language documents provide useful foundations.

The owner-led reviewer accepted the solo reviewer's challenge to rank billing reconciliation ahead of property shortcuts. All accepted the growth reviewer's requirement that drafts show what inputs actually contributed; bundles moved down the list. The growth reviewer challenged mandatory done/deferred steps. All agreed to optional task detail and one editable summary, preserving a fast one-hour repair path. Both peers confirmed agreement; the retained limitation is weak operational fit for a larger company needing multiple users.

#### Ranked recommendations

1. **Finish planned — make capture, drafting, delivery, and payment real; resolve missing scope explicitly.** These are existing promises, not new ideas. `estimate/[jobId].tsx::build` converts selected quantities while ignoring notes/photos; `estimate.alsoUsing` overstates their use. Its `hasPriced` enables sending when only one line is priced, while `data/selectors.ts::estimateDocLines` drops unpriced lines. Show “Price needed” with **Set price** or **Exclude from this estimate**, requiring an explicit choice. Acceptance: an unpriced door repair cannot silently disappear; the owner sees which notes were actually used. `customer/invoice/[id].tsx` currently displays `payDemo`, so payment capability remains unfinished.

2. **Improve existing — reconcile agreed scope, actual labor/materials, and fees.** `data/selectors.ts::invoiceLines` combines signed-estimate lines, logged labor, and receipt materials. This creates a source-grounded duplication risk, not an observed double-charge incident. Ask whether labor/materials are already included or additional; hourly estimates remain context when billing actual hours. Make `ESTIMATED_TRIPS = 1` editable and fees optional. Acceptance: estimated labor plus actual hours never become two labor charges without an intentional owner decision. Preserve issued document revisions and consistent owner tax settings.

3. **New idea plus Improve existing — optional mixed-task summary with clear property context.** Offer room/task rows inside one job: “Kitchen latch—done; bedroom shelf—deferred.” Deferred work must not silently create charges. `components/new-job.tsx::pickCustomer` currently fills one matching job's address; offer saved property/unit choices instead. Acceptance: switching from Unit 2A to 2B shows the correct address and work order on preview. Prompt: “What did you finish, what is left, and what materials did the customer supply?” / “¿Qué terminaste, qué quedó pendiente y qué materiales puso el cliente?”

4. **Improve existing — unequal receipt splits.** `data/selectors.ts::shareOf` uses equal weights. Support quantities or amounts: three doorstops for one unit, one for another. Acceptance: allocations retain the receipt total, including tax, to the cent.

5. **New idea, validation-gated refinement — owner-saved task bundles.** Reuse descriptions and units for turnovers, then review quantities and prices. Test whether reuse saves time before adding setup.

Defer scheduling, dispatch, crew accounts, payroll, and office approval layers. Validate with real owners whether optional task detail prevents omissions without increasing invoice time.

---

### Plumbing

**Consensus design fit: 6.75/10 — workflow 2.75/4, trade content 1.75/3, low admin burden 2.25/3.** This is a source-based simulated customer panel, not interviews, runtime testing, or production-readiness certification. Occupational assumptions and proposed improvements need validation with owners.

#### Current coverage

`mobile/src/data/trades.ts::TRADES` includes leak repair, drain clearing, water-heater work, and fixture installation. Leak work asks for labor; drains use a clearing count; water heaters use installation count; fixtures combine installation and shutoff-valve counts. Trip fees appear across these templates, with haul-away on heaters. Starter prices are blank and owner-controlled. English/Spanish labels include “Shutoff valve replacement” / “Cambiar llave de paso,” but “Fixture install” / “Instalar accesorio” lacks the fixture and room. Estimate skipping, private access notes, hours, receipt allocation, and work-order numbers are useful for service visits.

#### What each reviewer contributed

- **Solo urgent-service owner: 7/10** (2.75 workflow, 2 trade, 2.25 admin). Emphasized short homeowner calls, owner-controlled call fees, labor counted once, and optional repair-location/outcome chips. Actual voice capture matters because typing after urgent calls undermines the promise.
- **Three-person service/remodel firm: 6.5/10** (2.5, 1.8, 2.2). Prioritized package inclusions versus extras, fixture/location and supplied-by details, and editable return visits. One owner still handles billing; this persona does not require helper accounts.
- **Eight-person service shop: 6/10** (2.5, 2, 1.5). Wanted the exact approved scope preserved, clear completed/deferred work, and issued documents that do not change when underlying job data changes. Office coordination is an expansion concern, outside v1.

The consensus favors the target solo/small firm rather than mechanically averaging the larger shop's administration penalty. Existing job types cover much ordinary service work; generic descriptions and ambiguous billing inclusions reduce trade-content fit.

#### Collaboration and reconciliation

All three accepted optional fixture/location/outcome detail and package-once billing. The solo reviewer challenged default model fields: typing equipment records should not become a condition of finishing a small leak call. The small and growth reviewers agreed to hide model/serial detail behind optional text/photo. The small reviewer strengthened the shared priority to preserve approved scope and document versions. No dissent remains; mandatory asset records, diagnostic-credit policies, and extra service fees were rejected as defaults.

#### Ranked recommendations

1. **Improve existing: show included versus additional charges before invoicing.** `mobile/src/data/selectors.ts::invoiceLines` appends signed-estimate lines, actual hourly labor, and receipt materials; `mobile/src/app/estimate/[jobId].tsx::build` also adds trips. Give each proposed cost an owner-confirmed treatment: included in agreed repair, additional approved work, or job cost only. Make trips editable, optional, and owner-priced. **Acceptance example:** a fixed faucet-install price including labor and fittings stays that price when hours and a fitting receipt are logged. A separate owner-approved extra appears once. This is a source-identified risk, not an observed overcharge.

2. **New idea: optional fixture/location and outcome card.** Keep one job with short rows such as “kitchen faucet; customer supplied; installed” and “bathroom shutoff; deferred.” Reuse selected wording in the customer summary after review. **Acceptance example:** three fixtures produce distinguishable room/fixture descriptions, while a one-hour leak repair can skip the card completely. Do not infer that deferred work was completed or billable.

3. **Finish planned: real discovered-work approval and stable customer records.** Complete the already planned capture/change/sign/send path. The owner describes and prices an additional repair, sees the revised total, obtains approval, and includes it once. Current estimate `build()` ignores notes/photos; invoice lines regenerate from live state. **Acceptance example:** an approved shutoff addition stays traceable to its original scope; editing a later receipt does not silently rewrite the issued invoice.

**Better prompt:** “Which fixture and room? Who supplies it? What did you finish, what remains, and is a return visit included?” / “¿Qué accesorio y habitación? ¿Quién lo proporciona? ¿Qué terminaste y qué queda pendiente?”

**Validate next:** Does fixture/location plus inclusion wording reduce customer follow-up enough to earn its taps? **Later expansion:** dispatch, technician accounts, office approval queues, inventory, and supplier catalogs. Reject generated warranties, automatic technical findings, and mandatory repair procedures.

---

### Electrical

**Consensus design fit: 6.25/10 — workflow 2.5/4, trade content 1.5/3, low admin burden 2.25/3.** The panel reviewed source as simulated owners. It did not conduct interviews or run the app/backend, and these scores do not establish production readiness. Occupational needs below are hypotheses.

#### Current coverage

`mobile/src/data/trades.ts::TRADES` offers outlets/switches, lighting/fans, panel upgrade, and troubleshooting. Device counts, a flat panel line, hourly labor, and trip fees provide a useful vocabulary without invented starter prices. English “Outlets and switches” maps clearly to Spanish “Enchufes e interruptores,” while the same `outlet` item combines two different customer descriptions. “Troubleshooting” / “Diagnóstico” recognizes diagnosis work. Work orders, private access notes, hours, and optional estimate skipping suit residential service.

#### What each reviewer contributed

- **Solo repair/troubleshooting owner: 6.5/10** (2.5 workflow, 1.75 trade, 2.25 admin). Wanted diagnosis-only, repaired, and return-needed outcomes; room/device wording; and a clear distinction between hourly labor and installed-device prices. A diagnosis should be billable as agreed without implying a repair happened.
- **Three-person additions/service firm: 6.2/10** (2.4, 1.6, 2.2). Wanted device/room variations and real owner-initiated change creation. In `mobile/src/app/job/[id]/index.tsx`, the change-order button is conditional on an existing sample change order, leaving the ordinary new-addition path incomplete.
- **Six-person residential contractor: 5.5/10** (2, 2, 1.5). Emphasized replacement versus new location, explicit treatment of every proposed unpriced item, and capture evidence behind additions. Its estimating handoffs and team coordination exceed v1's size target.

The consensus preserves reasonable small-job workflow coverage but rates trade specificity conservatively: combined device labels and vague completion descriptions do not explain actual agreed work. It does not average in large-company approval needs as v1 requirements.

#### Collaboration and reconciliation

All accepted optional room/device descriptions. The solo reviewer challenged showing circuit references or model detail by default; the growth reviewer clarified these should remain hidden and optional, not mandatory records. The small reviewer accepted diagnosis-only outcomes and clarified that “diagnosis completed; repair not included” must not create a repair charge. All accepted its concrete missing new-change path and the growth reviewer's requirement to resolve unpriced scope. No dissent remains.

#### Ranked recommendations

1. **Improve existing: explicit device scope and complete price/exclude review.** Offer optional room, outlet versus switch, replacement versus new location, supplied-by, and completed/diagnosis-only/deferred wording. Keep free text and a skip path. Then require every included proposed item to be priced, explicitly excluded, or left in draft. `mobile/src/app/estimate/[jobId].tsx::hasPriced` enables send after any priced line, while `mobile/src/data/selectors.ts::estimateDocLines` filters null-priced lines. **Acceptance example:** an unpriced ceiling fan cannot silently disappear from an accepted lighting scope; the owner prices it or confirms that it is excluded. An optional outcome says “bedroom fault investigated; repair not included” only when owner-approved.

2. **Improve existing: reconcile installed-device prices, hours, and materials.** Estimate `build()` can add hourly labor alongside count-based installation items, and `selectors.ts::invoiceLines` appends logged labor and receipt materials to signed lines. Show what the fixed price includes and what is additional. **Acceptance example:** a fixed installed-light price including labor remains one charge when the owner records time. Customer-supplied fixtures remain clearly described and do not become billed material. Owner-selected call fees remain optional.

3. **Finish planned: start and approve added work from the active job.** Complete a new-change action independent of sample data, real note/photo capture, owner-written prices, customer approval, and preserved document versions. Do not infer required work from pictures. **Acceptance example:** the customer requests another light; the owner adds its room/device description and price, reviews the new total, obtains approval, and includes the addition once. A later note cannot silently alter that agreement.

**Better prompt:** “Which room and device? Replacement or new location? What was completed, and is this diagnosis only?” / “¿Qué habitación y dispositivo? ¿Reemplazo o ubicación nueva? ¿Se reparó o solo se hizo el diagnóstico?” Replace the universal deck-oriented estimate example.

**Validate next:** Can optional location/outcome wording prevent clarification without slowing a quick replacement? **Later expansion:** crew assignment, dispatch, office approvals, inventory, and inspection workflow. Reject automated code-compliance conclusions, required procedures, and AI safety certifications.

---

### HVAC

**Consensus design fit: 6.25/10 — workflow 2.5/4, trade content 1.5/3, low admin burden 2.25/3.** This source-based panel simulates three owner perspectives. No interviews, app runtime, connected backend, or production-readiness testing occurred. Occupational assumptions require validation.

#### Current coverage

`mobile/src/data/trades.ts::TRADES` includes tuneup, hvacRepair, and hvacInstall: tune-up counts, hourly repair labor, equipment installation counts, duct length, and diagnostic/trip/haul fees. Prices start blank and stay owner-controlled. English “Tune-up” / Spanish “Mantenimiento” is accessible; “AC or furnace repair” / “Reparar aire o calefacción” identifies the broad work category. “New system” / “Sistema nuevo” does not identify a particular unit. Private notes, photos, materials, hours, and customer-language previews are useful foundations for service work.

#### What each reviewer contributed

- **Solo service/tune-up owner: 6.25/10** (2.5 workflow, 1.5 trade, 2.25 admin). Wanted an optional unit/location label and nameplate photo, deliberate diagnostic-fee inclusion/credit, and persistence of the approved work summary. A quick tune-up should not require building an equipment database.
- **Three-person repair/small-install firm: 6.1/10** (2.4, 1.5, 2.2). Wanted unit identity carried into invoices, customer-supplied parts and deferred work described, and diagnostic/trip/haul decisions visible together. The owner bills without requiring technician accounts.
- **Ten-person service/install shop: 5.5/10** (2, 2, 1.5). Wanted equipment identity reused only after confirming the same unit, included-versus-extra reconciliation, explicit unpriced-scope decisions, and stable issued documents. Dispatch and office coordination remain outside v1.

The consensus prioritizes the owner doing a small service call. Existing categories cover the main billing shapes, but equipment ambiguity and generic scope reduce content fit. The larger shop's administrative penalty does not justify expanding the product into service management.

#### Collaboration and reconciliation

All three independently proposed optional unit/location context and owner-controlled fee treatment. The solo lead challenged serial/model fields as default intake. Both peers agreed: lead with a unit label or optional photo; hide more detail and avoid a required asset registry. The small reviewer reinforced that customer-supplied parts and unresolved scope must survive preview. The growth reviewer accepted target-owner scoring and rejected the idea that its larger staff requires team functionality now. No dissent remains.

#### Ranked recommendations

1. **New idea: optional unit identity and work-outcome card.** Add a short label such as “upstairs furnace,” location, optional owner-entered model/serial or label photo, supplied-by note, and completed/deferred work. `mobile/src/data/types.ts::Job` currently has no equipment identity. Reuse only after owner confirmation, and keep private access notes separate. **Acceptance example:** two units at one property get distinguishable customer summaries; a simple one-unit tune-up can skip the fields. Do not infer a diagnosis from a nameplate or photo.

2. **Improve existing: one owner review of diagnostic/trip/labor/material inclusions.** `mobile/src/app/estimate/[jobId].tsx::build` adds a trip to hourly jobs and template extras can add diagnosis. `mobile/src/data/selectors.ts::invoiceLines` then combines signed lines, actual time, and receipt materials. Let the owner mark a fee separate, included, waived, or credited at an entered amount. **Acceptance example:** an owner-approved diagnostic credit appears explicitly against the repair, while an included part remains job cost rather than another customer charge. No default diagnostic-credit policy, required fee, or inferred additional charge.

3. **Finish planned: actual inputs and an approved summary that reaches the customer.** Complete real capture and reviewed drafting; current estimate `build()` ignores notes/photos despite `estimate.alsoUsing`. In `mobile/src/app/invoice/[id].tsx`, summary edits are local, while `customer/invoice/[id].tsx` displays `invoice.summary`. Persist the reviewed wording, explicitly resolve unpriced work, and preserve issued versions. **Acceptance example:** “Unit serviced; owner deferred the additional repair” appears identically in preview and issued document. Deferred work is not automatically charged or claimed completed. A later receipt or rate edit cannot silently rewrite the approved bill.

**Better prompt:** “Which unit and location? What work was approved and completed, what remains, and which charges are included?” / “¿Qué equipo y ubicación? ¿Qué trabajo se aprobó y terminó, qué queda pendiente y qué cargos se incluyen?”

**Validate next:** Does a unit label plus photo avoid enough follow-up to earn the capture step, or are model fields seldom useful? **Later expansion:** maintenance-contract administration, dispatch, technician accounts, warehouse inventory, and supplier connections. Reject automatic technical findings, warranty text, safety claims, and mandatory inspection checklists.

---

### Drywall

This panel combines independent source reviews by a solo patch specialist, a three-person owner-led patch/room-finishing firm, and a six-person drywall company. These are simulated perspectives and occupational hypotheses. No interviews or runtime/readiness testing occurred.

#### The three reviews

- **Solo specialist: 6.5/10** — workflow 2.5/4, trade content 1.75/3, low administration 2.25/3. Most concerned with patch sizes, finish boundaries, real before/after evidence, and keeping a small repair quick.
- **Three-person firm: 6.2/10** — workflow 2.5/4, content 1.5/3, administration 2.2/3. Emphasized distinguishing patch dimensions and locations, patch-plus-texture scope, and owner-controlled return visits. The owner handles invoicing without separate worker logins.
- **Six-person growth company: 6/10** — workflow 2.5/4, content 2/3, administration 1.5/3. Valued grouped ceiling/patch/texture descriptions, approved discoveries, and stable signed revisions. Crew production tracking and office coordination fall outside the 1–3-person target.

**Consensus design fit: 6.5/10** — workflow **2.5/4**, content **1.75/3**, low administration **2.25/3**. Existing area/count units and a short job flow fit bounded repairs. The main content weakness is that a repair count does not explain its size or finished condition. This target-audience judgment is not a mechanical average of the three businesses.

#### Coverage and collaborative decisions

`mobile/src/data/trades.ts::TRADES` includes Patch, Hang and finish, Texture, and Ceiling repair. `dw-patch` is each; hanging, texture, and ceiling repairs use square feet, with haul-away available for hanging. Starter prices remain blank. `mobile/src/i18n/en.ts` and `es.ts` provide task labels, including “Ceiling repair” / “Reparar techo.” Work orders, private access notes, a job timeline, and customer-language documents provide useful foundations.

The reviewers agreed on optional size/location context. The solo reviewer challenged compulsory measurements and any implication that another visit automatically earns an extra charge; the lead accepted free text or owner-defined size categories, with inclusion decisions left to the owner. The lead accepted the growth reviewer's signed-revision concern and classified approved additions/progress billing as finishing existing plans. Both peers accepted the final ranking and score without remaining dissent; the growth reviewer reinforced avoiding texture-match guarantees or underlying-damage diagnoses. The shared result favors three focused changes over a larger estimating form.

#### Ranked recommendations

1. **Improve existing — let a count explain which repairs it represents.** Add optional location and size/category beside patch quantities: “bedroom, two small openings” or owner-entered dimensions. Keep free text available and leave fields hidden on a quick patch. `trades.ts` currently asks only `dw-patch`, so four small holes and four larger openings can present the same quantity. Owner-defined categories may have owner-entered prices; photos must not determine quantities or prices automatically. **Acceptance:** two differently described repairs can appear distinctly on preview while a simple one-patch job still needs only count and price.

2. **New idea / Improve existing — an optional finish-and-boundary summary.** Ask what is included: patch only, owner-described texture, primer, paint, or work left for another visit. These are scope descriptions rather than compulsory stages or automatic billable items. `mobile/src/app/estimate/[jobId].tsx` selects one `jobTypeId`; mixed patch/texture/ceiling work needs clear grouping and owner additions. Keep one agreed repair price unless the owner approves an extra. **Acceptance:** “Hall ceiling patched; texture included; painting excluded” survives to customer preview; an unpriced included texture item must be priced or explicitly excluded before send.

3. **Finish planned — preserve approved evidence and discoveries.** Complete actual photo capture and persist the owner-approved summary to the customer document. `mobile/src/app/invoice/[id].tsx` holds summary edits in local component state, while the customer invoice displays `invoice.summary`. A newly discovered area should become owner-described, owner-priced additional scope with real approval and a preserved original revision. `data/selectors.ts::invoiceLines` currently derives live lines rather than evidencing an issued snapshot. **Acceptance:** adding a later ceiling repair does not silently change an already accepted patch estimate.

**Better prompt:** “Which wall or ceiling, what patch sizes, and does this price include texture or paint?” / “¿Qué pared o techo, de qué tamaño son los parches y se incluye textura o pintura?” Replace the universal deck example in `estimate.notesPlaceholder`.

Defer drying schedules, room scanning, crew production tracking, payroll, and automatic underlying-damage or finish guarantees. Validate whether optional size categories and one finish sentence reduce clarification without increasing small-job administration. Media/delivery/payment completion remains a shared prerequisite, not a new drywall feature.

---

### Painting

Three independent source reviews considered a solo interior painter, a three-person interior/property-turnover firm, and an eight-person repaint company with office assistance. The personas and trade needs are hypotheses, not interviews. Runtime behavior and production readiness were not tested.

#### The three reviews

- **Solo painter: 6.75/10** — workflow 2.75/4, trade content 1.75/3, low administration 2.25/3. Prioritized clear measurement basis, an optional owner-written scope card, and persistent approved content that cannot silently lose unpriced trim.
- **Three-person firm: 6.4/10** — workflow 2.5/4, content 1.7/3, administration 2.2/3. Owner handles billing. Prioritized room/surface details, preparation/coats/product wording, and preventing included paint receipts from becoming additional charges.
- **Eight-person growth company: 6/10** — workflow 2.5/4, content 2/3, administration 1.5/3. Emphasized different inclusions by room, supplied-by context, unequal paint/consumable use, and explicit color/scope revisions. Multi-crew assignments and office approvals are outside v1.

**Consensus design fit: 6.5/10** — workflow **2.5/4**, content **1.75/3**, low administration **2.25/3**. The basic quantity-based proposal fits small painting work, but surface labels and agreed preparation remain too generic. The score reflects the 1–3-person audience and skip-friendly interaction, rather than averaging in a larger company's missing coordination tools.

#### Coverage and reconciliation

`mobile/src/data/trades.ts::TRADES` offers Interior, Exterior, and Fence. Interior walls, ceilings, and exterior walls use square feet; trim and fences use linear feet. Owner-set prices, materials presentation, deposits, receipts, photos, and work-order context are useful foundations. `mobile/src/i18n/en.ts` and `es.ts` include “Paint interior walls” / “Pintar paredes interiores” and “Paint trim and baseboards” / “Pintar molduras y zócalos.”

The lead accepted the solo reviewer's clear measurement basis and the growth reviewer's unequal-use priority. The solo reviewer accepted moving trade-specific material reconciliation ahead of richer drafting, changing its initial ranking. Both peers challenged compulsory room forms and automatic coverage/waste assumptions; the panel chose a few optional fields plus free text. The growth reviewer added that measurement help must remain clear even when room rows are skipped. Both confirmed the final ranking and score without remaining dissent; their original ratings remain separate above.

#### Ranked recommendations

1. **Improve existing — explain the quantity being priced.** Label wall surface area explicitly and optionally group quantities by room/surface. `mobile/src/app/estimate/[jobId].tsx` currently shows an item and unit but not measurement basis. Do not transform floor area into wall area or assume opening deductions. **Acceptance:** the owner can enter measured wall surface area, skip room grouping, and still see the same basis on preview. A ceiling and trim may be included in one room and excluded in another without an ambiguous shared total.

2. **New idea — an optional owner-authored scope card.** Capture included surfaces/preparation, owner-agreed coating scope, color/product text, exclusions, and who supplies paint. Offer reuse only on request and preserve a short touch-up path. `mobile/src/data/types.ts::EstimateDraft` currently has priced lines and deposit/status rather than structured scope. The content describes the owner's agreement; it must not prescribe coats or guarantee coverage. **Acceptance:** “Bedroom walls: agreed prep and two coats; ceiling excluded; owner supplies paint” can be reviewed in the customer's language without creating separate fees for every phrase.

3. **Improve existing — reconcile material ownership, inclusion, and actual use.** `mobile/src/data/selectors.ts::invoiceLines` appends receipt materials alongside signed estimate lines, while `shareOf` divides assigned items equally. Let purchased paint be included job cost, an explicitly approved addition, overhead, or customer-supplied context. Allow owner-entered unequal quantities/amounts where relevant; leave unused remainder visible rather than silently distributing everything. **Acceptance:** paint already included in a quoted room price does not appear as a second customer charge; material split between two jobs preserves total cost to the cent.

4. **Finish planned — retain approved content and resolve missing prices.** Make notes/photos contribute only when actually supported, persist the approved summary to preview/send, and preserve accepted color/scope revisions. `estimate/[jobId].tsx::build` ignores notes/photos; `data/selectors.ts::estimateDocLines` filters unpriced lines. **Acceptance:** included trim cannot disappear merely because its price is blank; the owner must price it or intentionally exclude it. A color-change addition retains the original agreement and its approved adjustment.

**Better prompt:** “Which rooms and surfaces? Enter measured wall surface area, then describe agreed preparation and finish. Who supplies paint?” / “¿Qué habitaciones y superficies? Escribe el área de las paredes y la preparación acordada.” Replace deck-specific `estimate.notesPlaceholder`.

Defer automated room scanning, automatic coverage pricing, supplier ordering, scheduling, and crew approvals. Test which two optional scope fields prevent the most clarification, and whether saved owner text is faster than a voice note. Core operational completion remains a shared prerequisite.

---

### Flooring

The panel reviewed source through three simulated perspectives: a solo LVP installer, a three-person LVP/tile room-installation firm, and a seven-person installation company. These are occupational hypotheses. No interviews, runtime testing, or production-readiness verification occurred.

#### The three reviews

- **Solo installer: 6.5/10** — workflow 2.5/4, trade content 1.75/3, low administration 2.25/3. Prioritized explicit removal/trim/haul inclusion, installed-versus-purchased quantities, and owner-reviewed extra preparation. Questioned whether a short note might beat another structured field.
- **Three-person firm: 6.3/10** — workflow 2.5/4, content 1.7/3, administration 2.1/3. Owner measures, purchases, and bills without helper accounts. Emphasized measured installation area versus purchase quantity, optional transitions/preparation, and materials ownership/returns.
- **Seven-person growth company: 6/10** — workflow 2.5/4, content 2/3, administration 1.5/3. Emphasized unequal use, leftovers/returns, and stable accepted scope with deposits/progress payments. Warehouse, office/crew handoffs, and installer logins are outside v1.

**Consensus design fit: 6.5/10** — workflow **2.5/4**, content **1.75/3**, low administration **2.25/3**. Separate installation/removal and trim units provide a credible small-job base. Scope inclusion and material quantities need clarification before more estimating automation. The score judges the 1–3-person audience, not a numerical average of businesses with different coordination needs.

#### Coverage and peer reconciliation

`mobile/src/data/trades.ts::TRADES` includes Vinyl plank, Tile, and Carpet. LVP asks installation/removal square feet and baseboard linear feet; tile/carpet ask installation/removal, with haul-away extras. Owner-entered prices, deposits, receipt sorting, and materials presentation fit room jobs. `mobile/src/i18n/en.ts` and `es.ts` include “Vinyl plank” / “Piso vinílico” and “Remove old flooring” / “Quitar piso viejo.”

The lead accepted the solo reviewer's explicit-add-on concern and growth reviewer's unequal-use priority. The solo reviewer challenged a visible default waste percentage: the panel agreed that owner text or quantity comes first and must not inflate installation area. The lead challenged adding compulsory carton/box units or warehouse tooling before validating simpler packaging descriptions. Both peers accepted free-text packaging plus reviewed quantity allocation; both confirmed the score/ranking without remaining dissent. Material ownership and inclusion outrank saved variants.

#### Ranked recommendations

1. **New idea / Improve existing — distinguish measured installation area from purchased quantity.** Add optional room/location and purchased-material context while labeling the installation quantity clearly. `mobile/src/app/estimate/[jobId].tsx` currently shows generic quantity boxes; `mobile/src/data/types.ts::Unit` has square feet but no carton unit, while receipt `qtyLabel` is free text. Start with owner-entered quantities and packaging descriptions. **Acceptance:** a measured room and extra purchased boxes remain distinct; entering more purchased material never increases billable installation area automatically. No assumed waste percentage or price.

2. **Improve existing — make included work and supply responsibility explicit.** Offer owner-selected removal, baseboard, haul-away, transitions, underlayment, preparation, and material supplied-by context. These are optional scope choices with owner-defined descriptions/prices. `trades.ts` lacks transitions/preparation items, and `estimate/[jobId].tsx::build` automatically adds extras such as haul. **Acceptance:** a labor-only LVP job with customer-supplied material can exclude removal and disposal; no fee becomes due solely because a template added it. Simple jobs retain a skip path.

3. **Improve existing — allocate actual material use without an inventory system.** `mobile/src/data/selectors.ts::shareOf` currently uses equal weights, and assignment shapes represent selected jobs rather than usage or returns. Allow owner-entered unequal quantities/amounts and a visible remainder; track a returned item as an explicit correction, not a quiet edit to an issued bill. **Acceptance:** purchased cartons can be used unequally across two jobs, with leftovers visible and original receipt cost reconciled to the cent. Customer-supplied materials remain context rather than a fabricated business purchase.

4. **Finish planned / Improve existing — preserve accepted scope and approved additions.** Complete owner-priced, customer-approved additional preparation or transitions, and reconcile quoted materials versus extra receipts. `data/selectors.ts::invoiceLines` combines signed estimate lines with receipts and actual labor, creating a duplication risk rather than proving an observed overcharge. Preserve issued revisions, deposits, and explicit adjustments. **Acceptance:** material already included in a supply/install price is not charged again; later approved preparation appears once and does not rewrite the accepted original scope. Photos cannot infer hidden floor conditions.

**Better prompt:** “Which rooms and measured installation area? Who supplies flooring? Are removal, transitions, and preparation included?” / “¿Qué habitaciones y área de instalación? ¿Quién proporciona el piso? ¿Se incluye retirar el anterior?”

Defer supplier inventory/order integration, automatic waste optimization, crew scheduling, and installation-compliance claims. Validate whether separate purchased/installed quantities save rework on small jobs or whether an optional owner note suffices. Finish operational capture/delivery/payment as shared prerequisites.

---

### Carpentry and decks

This panel reviewed source, not a running app or real customer interviews. Its occupational assumptions require validation. The target remains an owner-led 1–3-person business doing $100–$6,000 jobs; the six-person perspective tests future fit without changing v1 scope. Scores measure design fit, not production readiness.

#### Current coverage and individual feedback

The existing template is unusually concrete: deck repair, fence repair, and trim, with deck-board counts, railing/fence/trim linear feet, wash/seal square feet, and haul-away extras. English “Deck repair” and Spanish “Reparar terraza,” plus the shared deck-oriented notes example, fit this trade. Owner-controlled prices and units are valuable foundations; planned change orders, deposits, and progress invoices must still become operational.

- **Solo repair owner: 6.75/10** — workflow 2.5/4, trade content 2/3, administration 2.25/3. Emphasized board dimensions/material, photo-backed discovered work, and an optional repair-boundary summary identifying replaced versus retained components. Questioned whether saved board variants beat a short note.
- **Three-person repair firm: 6.5/10** — 2.5/4, 1.8/3, 2.2/3. Emphasized meaningful board variations, optional disposal/sealing, and comparing original scope with additional owner-selected repairs. Did not assume worker accounts were needed.
- **Six-person deck/trim company: 6/10** — 2.5/4, 2/3, 1.5/3. Emphasized location/material descriptions, purchased versus replaced quantities, included costs, and preserving agreed revisions. Crew/office handoffs explain weaker administration fit and remain later expansion.

#### Reconciliation and consensus

All reviewers independently favored dimensioned scope and owner-chosen inclusions. During collaboration, the growth reviewer accepted the solo repair-boundary card and challenged making saved variants an initial setup requirement. The solo reviewer agreed: free text first, saved variants only as an optional validated refinement. The panel distinguishes finishing existing change orders from adding a new optional repair-boundary presentation. The small-team reviewer accepted that classification correction and free-text-first approach. No dissent remains. Discovered work never establishes a structural finding merely because a photo exists.

**Consensus: 6.5/10 — workflow 2.5/4, trade content 2/3, low administration 2/3.** Useful trade units support this score, but broad board counts and inclusion ambiguity limit content fit. Optional details preserve speed; mandatory dimensions, crew forms, or technical checklists would lower it. This is a target-audience judgment, not an average of the personas.

#### Ranked recommendations

1. **Improve existing: identify the actual repair pieces.** Offer optional location, material, dimensions, and owner-written variation beside board/length counts. Keep purchased lengths separate from replaced pieces. Example: “Rear steps: replace three owner-described boards; existing adjacent boards retained.” Acceptance: details survive estimate, customer preview, and invoice; the owner can quote a tiny trim repair without completing extra fields. Do not derive dimensions from photographs or assign a price to a variation automatically.

2. **Improve existing: make finishing and disposal explicit.** Give wash/seal, railing work, removal, haul-away, and supplied materials included/excluded/additional choices. One repair total can include purchased boards; those receipts remain costs unless the owner deliberately bills an extra. Acceptance: a board-only repair can exclude sealing and disposal, and a fixed supply/install price appears once. No default fee entitlement or assumed repair procedure.

3. **Finish planned: approve newly discovered work against the original agreement.** Show original scope, proposed additional description, owner price, and revised total before customer decision. Retain the original agreement and approved revision. Acceptance: a larger repair exposed during work remains an unsent proposal until reviewed and approved, then reaches the invoice once. Photos support the description without diagnosing damage or engineering suitability.

4. **New idea: an optional repair-boundary summary.** Let the owner describe what is replaced, retained, included in finishing, and deferred. Produce one editable customer paragraph instead of mandatory per-board task tracking. Acceptance: “Railing retained; sealing excluded” is visible to the customer, while gate/access notes stay private. Suggested prompt: “Which sections, materials, and dimensions? What stays? Is finish included?” Spanish: “¿Qué secciones, materiales y medidas? ¿Qué se conserva? ¿Se incluye acabado?”

Validate whether dimension notes reduce clarification enough to justify their capture, and whether owners repeatedly reuse variants. Defer structural advice, automatic takeoffs, cut-list optimization, supplier integrations, scheduling, and team approvals. No operational readiness claim is made.

**Source anchors:** `mobile/src/data/trades.ts::TRADES/ITEM_UNITS`; `mobile/src/app/estimate/[jobId].tsx::build`; `mobile/src/data/selectors.ts::invoiceLines`; `mobile/src/app/invoice/[id].tsx` summary state; English/Spanish `jobTypes.deck` and `items.deck-board`.

---

### Lawn care

This source-based panel simulated three business perspectives; it did not interview owners or run the app. Occupational assumptions require validation. KILN’s core remains 1–3 people and $100–$6,000 jobs. The larger company is an expansion lens, not a request to build route management. Ratings measure design fit rather than launch readiness.

#### Existing coverage and individual feedback

Lawn templates cover mowing visits and hedge counts, with flat leaf cleanup and aeration. English “Mowing visit” and Spanish “Visita de corte” already use the right service vocabulary. Owner prices, estimate skipping, private gate/pet notes, and property work orders are useful. Repeat invoices are already planned; recurrence labels alone do not establish completed recurring billing.

- **Solo weekly mowing owner: 6.5/10** — workflow 2.5/4, trade content 1.75/3, low administration 2.25/3. Wanted completed service dates reviewed before billing, “visits” instead of generic “ea,” and quick confirmed property selection. Asked whether billing per visit or monthly better suits owners.
- **Three-person property-service firm: 6.2/10** — 2.3/4, 1.7/3, 2.2/3. Emphasized grouped completed dates, landlord property/unit context, and optional owner-written inclusions distinguishing mowing from extras. Proposed no worker accounts or route calendar.
- **Ten-person recurring-service business: 5.5/10** — 2/4, 2/3, 1.5/3. Wanted explicit billable occurrences, completed/skipped status, owner-approved repeat drafts, and separation of normal service from additional leaf work. Route/office demands are outside v1 and lower this persona’s administration fit.

#### What changed through collaboration

All reviewers agreed a repeating weekday cannot prove work happened. The growth reviewer challenged wording that universally leaves skipped visits unbilled: a fixed-period agreement can differ from per-visit billing. The solo reviewer explicitly accepted the correction and limited that original wording to their per-visit persona. The small-team reviewer also accepted explicit billing basis and rejected automatic proration assumptions. All accepted optional inclusions without turning them into compulsory checklists. There is no remaining dissent.

**Consensus: 6.25/10 — workflow 2.5/4, trade content 1.75/3, low administration 2/3.** The per-visit template fits well, but the source lacks a sufficiently explicit completed-service billing record and property selection. Optional factual service confirmation earns a better core fit than an expansive scheduling product. The score is a reasoned target-audience assessment, not a mechanical persona average.

#### Ranked recommendations

1. **Finish planned: recurring drafts from an explicit billing basis.** Before approval, show whether the owner bills completed visits or an agreed period amount. For per-visit billing, let the owner confirm actual dates and exceptions; never turn a calendar repeat into a performed service. For period billing, use the owner’s agreement rather than inferred proration. Acceptance: three completed visits and one skipped date do not silently become four per-visit charges. No weather planner or scheduling calendar is required.

2. **Improve existing: describe services in the customer’s vocabulary.** Use “visits” next to mowing quantities, with date/property context and owner-reviewed service description. Keep flat leaf cleanup and aeration distinguishable from mowing counts. Acceptance: a reviewed bill reads “Mowing visits: Oct 2, 9, 16 — [property]” instead of an unexplained “Mowing × 3”; no service date is invented. Preserve separate owner-priced approved add-ons.

3. **Improve existing: confirm the property rather than borrowing an address.** Selecting a landlord should offer that customer’s saved properties, address/unit, and optional work order. Keep access notes private and show property context during bill review. Acceptance: switching customers or properties cannot carry a stale address into a service bill unnoticed. Confirmation belongs at selection/change, not as a repeated dialog for every line.

4. **New idea: optional saved service inclusions.** Reuse owner-written wording for mowing and any specifically included edging, blowing, or clipping removal. The owner decides what belongs in their service; seasonal hedge/leaf work remains separate unless explicitly included. Acceptance: a draft can reuse “Mow only” or the owner’s chosen bundle without silently adding services or changing price. Suggested prompt: “Which property and completed dates? What was included? What billing basis applies?” Spanish: “¿Qué propiedad y fechas de servicio? ¿Qué se incluye y cómo se cobra?”

Test per-visit versus period billing frequency, whether confirming dates saves corrections, and which two inclusion details owners actually reuse. Defer route optimization, weather dispatch, crew tracking, helper accounts, payroll, and service-plan management. Complete the shared delivery/payment foundations before claiming automatic collection.

**Source anchors:** `mobile/src/data/trades.ts::TRADES`; `mobile/src/data/types.ts::Job.repeatWeekday`; `mobile/src/data/selectors.ts::jobStage`; `mobile/src/components/new-job.tsx::pickCustomer`; English/Spanish `items.mow` and generic `estimate.units.each`. No runtime, backend, or recurring-job readiness was tested.

---

### Landscaping

This panel reviewed source through hypothetical business personas, without field interviews or runtime testing. Its occupational assumptions need validation. Recommendations serve the 1–3-person v1 audience and $100–$6,000 jobs. The larger firm illustrates future operational limits; it does not justify expanding into dispatch, stock management, or design services. Scores measure design fit, not production readiness.

#### Current coverage and distinct feedback

Templates already cover mulch/beds, planting, and sod. Mulch uses cubic yards, bed preparation and sod use square feet, and planting uses each; sod includes haul-away extras. This is a meaningful trade vocabulary. English “Mulch and beds” / Spanish “Mantillo y jardineras,” plus “Césped en rollo,” identify core work. Owner-set prices, receipts, deposits, and proof-photo plans are useful foundations.

- **Solo mulch/planting owner: 6.5/10** — workflow 2.5/4, trade content 1.75/3, low administration 2.25/3. Wanted material/plant identity, actual unequal quantity allocation, and no duplicate receipt charge when supply is included in a fixed installation price. Questioned whether saved variations are more useful than free text.
- **Three-person installation firm: 6.3/10** — 2.5/4, 1.7/3, 2.1/3. Wanted bed/zone labels, named plant/material variations, supply/inclusion choices, and an optional measurement worksheet with fully visible owner inputs. Rejected default depth, waste, and price assumptions.
- **Eight-person installation/maintenance company: 6/10** — 2.5/4, 2/3, 1.5/3. Emphasized purchased versus installed supplies, delivery/preparation/removal choices, unequal bulk usage, and preserving accepted scope. Office and crew coordination remain later expansion.

#### Collaboration and score

The growth reviewer accepted the peers’ bed/material labels and unequal use priorities, but challenged a depth-conversion worksheet as an immediate top-three addition. The solo reviewer agreed: explain quantity basis first, without a calculator, coverage assumption, or stock system. The small-team reviewer explicitly demoted the worksheet behind units, supply responsibility, and actual usage. All agreed named variations should be optional; free text remains a fast path. No dissent remains.

**Consensus: 6.25/10 — workflow 2.5/4, trade content 1.75/3, low administration 2/3.** Good units and owner prices provide useful coverage, but anonymous plant counts and ambiguous supply/inclusion weaken the customer agreement. Optional labels and allocation choices help core owners; mandatory horticultural forms would add friction. This score reflects target-audience fit rather than an average of the three ratings.

#### Ranked recommendations

1. **Improve existing: identify material, location, and quantity basis.** Offer optional bed/zone, owner-entered material or plant name/size, and supplied-by. Label whether a quantity is installed or purchased; keep those quantities separate. Acceptance: a planting line can distinguish owner-described shrubs in the front bed from customer-supplied plants beside the driveway. No species, material suitability, area, depth, waste, or price is inferred. A simple mulch quote can skip extra fields.

2. **Improve existing: choose delivery, preparation, and removal inclusions.** Let owners include, exclude, or price these separately, rather than treating a template extra as an obligation. Match receipts against the accepted supply/install agreement before adding customer charges. Acceptance: a mulch installation that includes material shows the quoted price once; a purchased mulch receipt remains a cost. Customer-supplied plants do not become an owner material charge. Newly approved work preserves the original scope and revised total.

3. **Improve existing: allocate actual bulk usage without full inventory.** Permit owner-entered quantity or amount splits, with visible unused/unassigned remainder and deliberate treatment of returns. Acceptance: one purchase used unequally across two beds/jobs can be assigned 3:1 while money, receipt tax, and owner markup still reconcile. The owner can leave a remainder for later review rather than force it onto a customer. Issued documents require explicit adjustments rather than silent recalculation.

4. **Finish planned: carry approved descriptive scope through capture, changes, and customer documents.** Notes and real photos should support a reviewable draft and owner-priced added work. Acceptance: an extra bed is proposed with its description and price, approved, and included once; the approved material/area description persists into customer preview. Do not claim photos established plant health or required work. Suggested prompt: “Which beds, materials, and quantities? Who supplies them? Are delivery and preparation included?” Spanish: “¿Qué jardineras, materiales y cantidades? ¿Quién los proporciona? ¿Se incluyen entrega y preparación?”

Validate whether zone labels, supply responsibility, or unequal usage save the most clarification. Keep owner-authored saved variations and an optional measurement worksheet as later validated refinements. Defer irrigation design, plant-care warranties, supplier ordering, scheduling, and crew permissions.

**Source anchors:** `mobile/src/data/trades.ts::TRADES/ITEM_UNITS`; `mobile/src/app/estimate/[jobId].tsx::build`; `mobile/src/data/selectors.ts::shareOf/invoiceLines`; `mobile/src/data/types.ts::Assignment`; English/Spanish `jobTypes.mulch` and `items.plants`. No operational capture, delivery, payment, or persistence guarantee was verified.

## Suggested first validation cycle

Use the already planned 5–10 discovery/test owners to compare a simple repair visit, a multi-task visit, an estimate with an unpriced item, a signed estimate with actual hours/materials, and a recurring visit that was skipped. Include English- and Spanish-speaking owners. Ask owners to bring their own recent examples and prices.

For each prototype idea, compare time to a sendable invoice, corrections required, forgotten billable work, and whether the customer description accurately communicates scope. Record current behavior before setting targets. A feature succeeds when it prevents an omission or dispute without making routine invoicing slower. Scores above are hypotheses to test, not measured results.

Keep scheduling, dispatch, crew logins, payroll, full bookkeeping, financing, supplier connections, lien tools, and other explicit first-version exclusions as later expansion unless the product scope is deliberately changed. Larger-company reviewers help identify limits; their needs should not set the first-version roadmap.

## Evidence and checks

- [Product intent and scope](../CLAUDE.md), [planned screens and build order](app-outline.md).
- [Trade templates and starter units](../mobile/src/data/trades.ts), [English content](../mobile/src/i18n/en.ts), [Spanish content](../mobile/src/i18n/es.ts).
- [Estimate builder](../mobile/src/app/estimate/[jobId]/index.tsx), [billing and document selectors](../mobile/src/data/selectors.ts), [state actions](../mobile/src/data/store.tsx).
- [Job creation](../mobile/src/components/new-job.tsx), [capture](../mobile/src/app/(tabs)/capture.tsx), [invoice editor](../mobile/src/app/invoice/[id].tsx), [customer invoice](../mobile/src/app/customer/invoice/[id].tsx), [customer estimate](../mobile/src/app/customer/estimate/[id].tsx).
- [Connected data paths](../mobile/src/data/db.ts), [authentication](../mobile/src/data/auth.tsx), [types](../mobile/src/data/types.ts).

No application code changed. Existing verification: **18 tests passed; lint passed. Typecheck failed** at `mobile/src/app/(tabs)/index.tsx:42`: `router.push('/settings')` is rejected by the generated route types, which list `/settings/index`. This was present before the report changes and was left outside the ideation task. No live backend, phone UI, offline synchronization, or payment testing was performed.
