# KILN app (Expo)

The contractor app for iPhone, Android, and web. This build uses example data so every screen can be tried; nothing is saved yet.

## Run it

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
