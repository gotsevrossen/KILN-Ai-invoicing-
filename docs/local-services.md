# Turn KILN on and off on Windows

Double-click the launchers in the repository folder:

| Launcher | What it does |
|---|---|
| **Start KILN.cmd** | Starts Docker Desktop, resumes KILN's saved backend containers, starts the Cloudflare phone connection, and starts Expo on port 8081. |
| **Stop KILN.cmd** | Stops KILN's Expo process and its child workers, its backend tunnel, and its running containers. Stops Docker Desktop too when no other containers are running. |
| **KILN Status.cmd** | Shows KILN's preview/tunnel processes and running backend containers without starting them. |

Wait for the start/stop operation to finish before closing its window. Start can take a minute or two, especially while Docker starts. Closing the launcher after it reports success does not stop the background services; use **Stop KILN** when finished.

Your database containers and Docker volumes are preserved. These scripts do not reset the database, delete volumes, stop unrelated containers, kill every Node process, or shut down unrelated WSL distributions. They do not stop Codex or VS Code. Stopping the preview does end its in-memory session, so document drafts that were never saved to the database can still be lost, as described in the app's preview limitations.

## When KILN is on

- Browser preview: <http://localhost:8081>
- Database dashboard: <http://localhost:54323>
- Development email inbox: <http://localhost:54324>
- The launcher prints an `exp://...:8081` address for Expo Go on the same network when Windows reports a suitable network address.

The temporary Cloudflare backend address changes on restart. Start automatically updates only `EXPO_PUBLIC_SUPABASE_URL` in `mobile/.env.local` before launching Expo; the publishable key and other settings are retained. It does not create a new permanent tunnel or change firewall settings. The preview/tunnel must stay running for a phone to use them.

**Server keys (Oct 26).** The tunnel puts the local Supabase server on the internet. Supabase's default local keys are the same on every computer and published online, so Start gives this computer its own keys in `supabase/.env` (`SUPABASE_AUTH_JWT_SECRET`, `SUPABASE_AUTH_SECRET_KEY`, random, git-ignored) and refuses to open the tunnel while the backend still accepts the defaults. The keys take effect when the containers are created: after they're first added, run `npx supabase stop` then `npx supabase start` once (data is kept), then Start again. The publishable key doesn't change, so phones and APKs keep working; testers sign in again.

Expo runs in LAN/offline-CLI mode to avoid startup delays from Expo's remote checks. This does not disable your app's backend connection or the separate Cloudflare tunnel. Expo Go must be on the laptop's network for the Expo preview address.

Logs and process records live in the ignored `.kiln-runtime/` folder. For startup problems, check `expo.log`, `expo-error.log`, and `tunnel-error.log` there. Logs may contain temporary connection URLs; keep them local.

The unused `supabase_analytics_kiln` and `supabase_vector_kiln` logging containers are not resumed by Start. Vector was restarting and analytics consumed substantial memory. The app backend, Studio, test email, storage, authentication, realtime, and Edge Functions runtime still start. Studio's centralized log views are unavailable while those optional logging containers are off.

## Optional terminal commands

Run from the repository folder:

```powershell
# Full preview
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\kiln-services.ps1 -Action Start

# Backend only, without Expo or Cloudflare
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\kiln-services.ps1 -Action Start -BackendOnly

# Stop KILN but keep Docker Desktop available for other development
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\kiln-services.ps1 -Action Stop -KeepDocker

# Status, without starting services
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\kiln-services.ps1 -Action Status

# Safe ownership/shutdown-policy checks; do not operate real services
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-services.ps1
```

The execution-policy override applies only to that PowerShell process; it does not change your machine's permanent execution policy. Docker Desktop, Node, cloudflared, and the installed mobile dependencies must already be available. The scripts resume the existing containers for `project_id = "kiln"`; they do not download or install new dependencies. If those containers were manually removed, initialize the backend once with `npx supabase start` from the repository before using the launcher again.

If port 8081 belongs to another program, Start reports the conflict rather than stopping it. If a KILN tunnel or preview is already running, Start reports that rather than launching duplicates; use Stop followed by Start for a clean restart. A failed startup attempts to stop only processes and containers it started, leaving already-running backend containers alone.

## Android builds (APK)

Build the Android test app on this computer:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-android.ps1
```

- The result is `builds/android/kiln-preview.apk` (the previous one is kept next to it with its date). A cloud build saved by hand goes next to it as `kiln-preview-cloud.apk`. `builds/` is not in git.
- Run **Start KILN** first: the current server address from `mobile/.env.local` is built into the app, and the temporary Cloudflare address changes on every restart. After a restart, build again.
- Java 17 and the Android SDK live in `%LOCALAPPDATA%\KILN-build`. Nothing is installed system-wide and no environment variables are changed; delete that folder to remove them.
- Only modern 64-bit phones (arm64-v8a) are built for, which is nearly every Android phone in use.
- The first build downloads Android parts and is slow; later builds reuse them.
- The script runs `expo prebuild`, which makes `mobile/android` from `app.json`. That folder is not in git and is never edited by hand.
- A local APK is signed with this computer's test key, and one from Expo's cloud (`npx eas-cli build -p android --profile preview` in `mobile/`) with the key Expo stores. Android won't install one over the other: uninstall KILN from the phone first.

To install: copy the APK to the phone (USB, Google Drive, or email), open it, and allow installing apps from that source when Android asks.
