# KILN app (Expo)

The contractor app for iPhone, Android, and web. It supports example mode and Supabase sign-in. Business settings, prices, customers, and jobs have database save/load paths. Documents, captures, hours, receipt assignments, and approval records currently last for the app session; production document storage, real capture/AI, sending, payments, and signature auditing remain unfinished.

The [trade-review implementation notes](../docs/trade-review-implementation-2026-10-21.md) describe the scope prompts, billing safeguards, receipt splits, and change-order improvements.

## Run it

On Windows, you can double-click **Start KILN.cmd**, **Stop KILN.cmd**, or **KILN Status.cmd** in the repository folder. See [local service controls](../docs/local-services.md) for details. Stop preserves the database and shuts down idle Docker Desktop to free resources.

```bash
cd mobile
npm install
npx expo start          # scan the QR code with the Expo Go app on your phone
npx expo start --web    # or open it in a browser
```

## Check it

```bash
npm test                # money math tests (Node's built-in test runner)
npm run typecheck       # TypeScript
npx expo lint           # lint
```

## Where things are

- `src/app/` — screens (Expo Router: each file is a screen)
- `src/components/` — shared pieces (cards, buttons, sheets, signature pad)
- `src/theme/tokens.ts` — colors, corners, tap sizes, fonts
- `src/i18n/` — English (`en.ts`) and Spanish (`es.ts`) text
- `src/lib/money.ts` — money math, all in integer cents
- `src/data/` — example data, the in-memory store, and read helpers

`AGENTS.md` has Expo's own notes for AI coding tools: check the docs for the installed SDK version before using an API.
