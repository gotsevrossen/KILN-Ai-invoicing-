# Turn KILN on and off on Windows

Double-click the launchers in the repository folder:

| Launcher | What it does |
|---|---|
| **Start KILN.cmd** | Starts Docker Desktop, resumes KILN's saved backend containers, starts the phone connection (gatekeeper + Tailscale Funnel), and starts Expo on port 8081. With the hosted server chosen, it starts only Expo. |
| **Stop KILN.cmd** | Stops KILN's Expo process and its child workers, its phone connection (Funnel first, then the gatekeeper), and its running containers. Stops Docker Desktop too when no other containers are running. |
| **KILN Status.cmd** | Shows which server the app uses, KILN's preview/phone connection processes, and running backend containers without starting them. |

Wait for the start/stop operation to finish before closing its window. Start can take a minute or two, especially while Docker starts. Closing the launcher after it reports success does not stop the background services; use **Stop KILN** when finished.

Your database containers and Docker volumes are preserved. These scripts do not reset the database, delete volumes, stop unrelated containers, kill every Node process, or shut down unrelated WSL distributions. They do not stop Codex or VS Code. Stopping the preview does end its in-memory session, so document drafts that were never saved to the database can still be lost, as described in the app's preview limitations.

## When KILN is on

- Browser preview: <http://localhost:8081>
- Database dashboard: <http://localhost:54323>
- Development email inbox: <http://localhost:54324>
- The launcher prints an `exp://...:8081` address for Expo Go on the same network when Windows reports a suitable network address.

## The phone address (laptop server)

Phones reach the laptop's server at a permanent address, `https://<computer>.<tailnet>.ts.net`, through **Tailscale Funnel**. It's the same after every restart, so Android test builds keep working. The address is only reachable while KILN is on: Stop closes it.

The address is public, so phones never reach Supabase directly. They go through a gatekeeper, `scripts/kiln-gate.mjs` (Node, port 54330, tests in `scripts/kiln-gate.test.mjs`; run with `node --test scripts/kiln-gate.test.mjs`). It lets through only sign-in, data, photo storage and the AI helper (`/auth/v1`, `/rest/v1`, `/storage/v1`, `/functions/v1`). It refuses everything else, including Supabase's developer tools (`/mcp` can run any SQL and `/pg` is the dashboard's backend; both have no login), live updates (unused), and any request carrying an admin key or admin login. Start checks from the internet side that `/mcp` is refused and closes the address again if it isn't.

Supabase's built-in local keys are published in its docs, so KILN uses its own: `KILN_JWT_SECRET` and `KILN_SECRET_KEY` in `supabase/.env` (see `supabase/.env.example`), used by `supabase/config.toml`. Start refuses to open the phone address if they're missing or if the running server still uses the public ones. After changing them, run `npx supabase stop` then `npx supabase start` once. Everyone signs in again.

Start writes the address, the local publishable key and `KILN_SERVER=Laptop` to `mobile/.env.local`; other settings are kept.

One-time Tailscale setup: install it (`winget install Tailscale.Tailscale`), open it from the Start menu, and sign in. The first Start may print a link to turn on Funnel for your account; open it, allow it, and start again.

## Hosted server (Supabase's cloud)

To have the app use a hosted Supabase project instead, put its address and publishable key in `mobile/.env.hosted.local` (git-ignored):

```
EXPO_PUBLIC_SUPABASE_URL=https://<project-id>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

KILN's hosted project is `ssjshfjkkgcqjvvsjsnk` and this file already exists. To update the hosted project after a change: `npx supabase db push --linked` for database changes, `npx supabase functions deploy ai` for the AI helper. Send sign-in settings with `npx supabase config push` only after reading its preview: it also sends local test values, and the free plan refuses the email template.

Then start once with `-Server Hosted` (see below). The choice is remembered as `KILN_SERVER` in `mobile/.env.local` until you start with `-Server Laptop`. With the hosted server, Start runs only Expo: no Docker, no phone connection. An Android build uses whichever server `mobile/.env.local` points at when it's built.

Expo runs in LAN/offline-CLI mode to avoid startup delays from Expo's remote checks. This does not disable your app's backend connection or the separate phone connection. Expo Go must be on the laptop's network for the Expo preview address.

Logs and process records live in the ignored `.kiln-runtime/` folder. For startup problems, check `expo.log`, `expo-error.log`, `gate-error.log`, and `funnel.log` there.

The unused `supabase_analytics_kiln` and `supabase_vector_kiln` logging containers are not resumed by Start. Vector was restarting and analytics consumed substantial memory. The app backend, Studio, test email, storage, authentication, realtime, and Edge Functions runtime still start. Studio's centralized log views are unavailable while those optional logging containers are off.

## Optional terminal commands

Run from the repository folder:

```powershell
# Full preview
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\kiln-services.ps1 -Action Start

# Use the hosted server (remembered), or switch back to the laptop server
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .scriptskiln-services.ps1 -Action Start -Server Hosted
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .scriptskiln-services.ps1 -Action Start -Server Laptop

# Backend only, without Expo or the phone connection
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\kiln-services.ps1 -Action Start -BackendOnly

# Stop KILN but keep Docker Desktop available for other development
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\kiln-services.ps1 -Action Stop -KeepDocker

# Status, without starting services
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\kiln-services.ps1 -Action Status

# Safe ownership/shutdown-policy checks; do not operate real services
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-services.ps1
```

The execution-policy override applies only to that PowerShell process; it does not change your machine's permanent execution policy. Docker Desktop, Node, Tailscale (signed in), and the installed mobile dependencies must already be available. The scripts resume the existing containers for `project_id = "kiln"`; they do not download or install new dependencies. If those containers were manually removed, initialize the backend once with `npx supabase start` from the repository before using the launcher again.

If port 8081 belongs to another program, Start reports the conflict rather than stopping it. If a KILN tunnel or preview is already running, Start reports that rather than launching duplicates; use Stop followed by Start for a clean restart. A failed startup attempts to stop only processes and containers it started, leaving already-running backend containers alone.

## Android builds (APK)

Build the Android test app on this computer:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-android.ps1
```

- The result is `builds/android/kiln-preview.apk` (the previous one is kept next to it with its date). A cloud build saved by hand goes next to it as `kiln-preview-cloud.apk`. `builds/` is not in git.
- Run **Start KILN** first: the server address from `mobile/.env.local` is built into the app. The laptop's Tailscale address and a hosted project's address don't change, so rebuild only when switching servers. A laptop-server build works only while KILN is on.
- Java 17 and the Android SDK live in `%LOCALAPPDATA%\KILN-build`. Nothing is installed system-wide and no environment variables are changed; delete that folder to remove them.
- Only modern 64-bit phones (arm64-v8a) are built for, which is nearly every Android phone in use.
- The first build downloads Android parts and is slow; later builds reuse them.
- The script runs `expo prebuild`, which makes `mobile/android` from `app.json`. That folder is not in git and is never edited by hand.
- A local APK is signed with this computer's test key, and one from Expo's cloud (`npx eas-cli build -p android --profile preview` in `mobile/`) with the key Expo stores. Android won't install one over the other: uninstall KILN from the phone first.

To install: copy the APK to the phone (USB, Google Drive, or email), open it, and allow installing apps from that source when Android asks.
