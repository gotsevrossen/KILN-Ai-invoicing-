# KILN improvement plan (Nov 16, 2026)

From the Nov 16 audit. This pass covers fixes, save reliability, and motion that need **no new packages, no database changes, and no server changes**. Everything is in `mobile/`.

## Rules for every step

- Read `CLAUDE.md` and `mobile/AGENTS.md` first. Check the versioned Expo / Reanimated docs before using an API; don't guess.
- No new dependencies. `react-native-reanimated` 4.5, `react-native-gesture-handler`, and `react-native-worklets` are already installed. Follow the Reanimated style already used in `mobile/src/components/sheet.tsx` (`useSharedValue`, `.set()` / `.get()`, `scheduleOnRN`).
- Every visible string goes in both `mobile/src/i18n/en.ts` and `es.ts` (TypeScript checks the keys match). No hard-coded strings in screens.
- Don't touch money math (`lib/money.ts`, `lib/billing.ts`, totals in `data/selectors.ts`), migrations, or `supabase/functions`.
- Tap targets stay at least 48 px. Colors, radii, spacing come from `mobile/src/theme/tokens.ts`.
- After each phase, from `mobile/`: `npm test`, `npm run typecheck`, `npm run lint` must all pass. Then look at the changed screens in the web version in example mode (`npx expo start --web --port 8099`, Playwright at 390×844, tap "Skip · use the example business" on the setup page first; a page reload resets example mode back to setup, so move between pages by tapping, not by loading URLs).
- One commit per phase.

## Phase 1: small fixes

### 1.1 Home shows everything that needs the owner
File: `mobile/src/app/(tabs)/index.tsx`.
- Today `receipt`, `invoice`, and `co` each use `.find`, so only the first one of each shows. Change to lists: every receipt with unsorted items, every invoice not yet sent, every change order that is neither signed nor declined. One card each, same look as now.
- The receipt card's subtitle hard-codes "Today"; show the receipt's own date (use `f.date`, and keep "Today" only when it is today).
- `nothing` (the all-clear notice) is true only when all lists are empty.
- New account with no jobs at all: instead of the all-clear notice, show a card with a short line and one big "Create your first job" button that opens `/new-job`.

### 1.2 Confirm before marking paid
Files: new `mobile/src/components/confirm-paid.tsx`; used in `mobile/src/app/job/[id]/index.tsx` (the `invoiceSent` footer action) and `mobile/src/app/invoice/[id]/index.tsx` (the "Paid in cash" button).
- A `Sheet` titled "Mark as paid?" showing the amount still owed (invoice total minus `paidOnline(state, id).paid`, the same number `markPaid` records), one line saying this can't be undone, a big confirm button, and Cancel.
- Both places open the sheet instead of calling `actions.markPaid` directly.

### 1.3 Button labels never cut off
File: `mobile/src/components/ui.tsx` (`Button`), plus `flow.backToWork` in both language files.
- Shorten `flow.backToWork` to just "Back to work" (and the Spanish equivalent); the explanation already belongs in the card's body text (`flow.invoiceDraftBody`), add it there if it's missing.
- In `Button`, non-stacked labels may wrap to two centered lines instead of ending in "…" (keep the shrink-to-fit first; add vertical padding so a two-line label has room). Check the estimate footer, invoice footer, and send sheet in Spanish still look right.

### 1.4 Sign-in errors in the owner's language
Files: `mobile/src/data/auth.tsx`, `mobile/src/app/sign-in.tsx`, language files.
- `signIn` / `signUp` return Supabase's English `error.message`. Map `error.code` (wrong email or password, account already exists, weak password, too many tries, no connection) to translation keys, with one general fallback. Follow the existing `resetProblem` pattern in the same file.

### 1.5 A way out when loading fails
Files: `mobile/src/data/auth.tsx`, `mobile/src/app/(tabs)/_layout.tsx`.
- Add `reload()` to the auth context (re-runs the business load for the signed-in user).
- When `auth.loadError` is set, show a plain message ("Couldn't load your business. Check your signal."), a big "Try again" button, and a "Sign out" button, instead of a spinner with the raw error.

### 1.6 Crash screen
File: `mobile/src/app/_layout.tsx` (Expo Router's exported `ErrorBoundary`; check the SDK 57 router docs for the exact shape).
- A simple page in the app's style: "Something went wrong", "Try again" (retry), and "Go to Home". Text in the phone's language; it must not depend on the store.

### 1.7 Remove the dead button
File: `mobile/src/app/(tabs)/capture.tsx`: remove the "Edit" button in the example voice card (it has no action), and its unused translation key if nothing else uses it.

## Phase 2: saves that survive a bad connection

Today (`mobile/src/data/store.tsx`, `persist`): a change shows at once, the save runs in a one-at-a-time queue, and any failure only sets `syncError` (shown on Home with the raw message). Nothing is retried.

### 2.1 Save queue with retry
- New pure module `mobile/src/data/save-queue.ts` (no React Native imports, timers passed in, so it runs under `node --test`). It keeps tasks in order and runs one at a time.
- A failure is sorted into two kinds:
  - **No connection** (the request never got an answer: fetch/network errors, timeouts). The task stays at the front and is tried again after 2 s, 5 s, 15 s, then every 30 s, and immediately when the app comes back to the foreground. Later tasks wait behind it so order is kept.
  - **The server said no** (any real answer with an error). Reported as today (`syncError`) and the queue moves on.
- Look at how `db.ts`, `db-docs.ts`, `db-pay.ts`, `db-photos.ts` throw to tell the two apart reliably; when unsure, treat it as "server said no" (never retry forever something the server refused).
- The store exposes `pendingSaves` (how many are waiting) and `offline` (waiting on a connection).
- `persistSoon` / `flushSoon` keep working through the new queue. `signedOut` clears the queue.
- `invoiceLink` currently awaits the queue; it must fail fast with the existing "no connection" style error when saves are waiting on signal, never hang.
- Tests in `mobile/src/data/save-queue.test.ts`: order kept, retry after no-connection, refusal reported and skipped, clear on sign-out, back-off times.

### 2.2 One banner, everywhere, in plain words
- New `mobile/src/components/sync-banner.tsx`, shown at the top of Home and Jobs and on the job page:
  - waiting on signal: "No signal. 3 changes will save when you're back online. Keep KILN open." (flag tone)
  - server refused: "A change couldn't be saved." plus the reason in small text, with "Dismiss" (`actions.clearSyncError`, which exists but nothing calls).
- Remove the old notice from Home.

Known limit, to state in `CLAUDE.md`: changes still waiting when the app is fully closed are lost; a queue saved on the phone comes after live data moves out of `data/sample.ts`.

## Phase 3: sheets

File: `mobile/src/components/sheet.tsx`.
- **Backdrop fades** with the card (it pops in at full darkness today): drive its opacity from the same `slide` value.
- **`onClosed` callback**, called when the close slide finishes. Replace every `setTimeout(..., 400)` that waits for a sheet to close before opening another sheet or page (`capture.tsx`, `job/[id]/index.tsx`, and any others: `grep -rn "setTimeout" mobile/src --include=*.tsx`) with it. Timers that aren't about sheets stay.

## Phase 4: motion

Create `mobile/src/theme/motion.ts`: shared durations (fast 120, base 200, slow 320), one press spring, one standard easing, and a `useMotion()` helper that returns "reduced" when the phone's Reduce Motion is on (Reanimated's `useReducedMotion`). With Reduce Motion, movement and scaling are skipped and only quick fades remain.

1. **Press feel.** One `PressableScale` in `ui.tsx` (springs to about 0.97 and back, on the UI thread) used by `Button`, pressable `Card`, `IconButton`, `Chip`, `ListRow`, the Capture tiles, and the tab bar's Capture button. Replaces the `styles.pressed` opacity/scale style.
2. **Segmented control.** The black selected block slides between options instead of jumping.
3. **Checkbox and paid check.** The check mark pops in (scale 0.6 to 1).
4. **Job progress bar** (`components/stepper.tsx`). When the stage changes while the page is open, the line fills and the circle changes color over about 300 ms, and the new check pops in. No animation on first show.
5. **Lists.** Items fade/slide in when added and fade out when removed, and neighbors move smoothly (Reanimated layout animations): Home's "Needs you" cards, estimate lines, receipt items, work items and activity on the job. Keep it subtle (under 250 ms). First render of a page doesn't stagger.
6. **Toasts.** New `mobile/src/components/toast.tsx`: a provider in the root layout and `useToast().show(text, icon?)`. A small dark pill that slides up above the tab bar / footer, stays about 2.5 s, announces itself to screen readers. Use it for "Saved to <job>" on Capture, "Photo added" and hours/note saved on the job page, replacing the inline notices that never go away.
7. **Home total.** "Owed to you" counts from its old value to the new one (about 400 ms) when it changes while Home is open; no count-up on first show.
8. **Loading.** Gray placeholder cards with a soft pulse, in the app's card shapes, instead of the bare spinner in `(tabs)/_layout.tsx` and `components/record-gate.tsx`.

Check each on web in light and dark mode. Native-only behavior that can't be checked in the browser goes in the final report as "to verify on a phone".

## Not in this pass (needs Rossen's decision or bigger work)

- Vibration on Save / Send / Paid (new package `expo-haptics`).
- Whether an invoice locks only after the owner confirms it was actually sent.
- Drag down to close a sheet (needs testing on real phones).
- Moving live data out of `data/sample.ts`, splitting `store.tsx`, and a save queue kept on the phone.
- Customer links for estimates and change orders; deposits and partial payments; reminders; PDFs; repeat invoices; Face ID; automatic checks on every push.
