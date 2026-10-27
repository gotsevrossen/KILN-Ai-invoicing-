$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'kiln-services.ps1')
$checks = 0
function Assert-Check([bool]$Condition, [string]$Message) {
    if (!$Condition) { throw $Message }
    $script:checks++
}
function Fake-Process([string]$Name, [string]$Command) {
    return [pscustomobject]@{ Name = $Name; CommandLine = $Command }
}

$expo = 'node "' + (Join-Path $MobilePath 'node_modules\expo\bin\cli') + '" start --lan --port 8081'
Assert-Check (Test-KilnExpoProcess (Fake-Process 'node.exe' $expo)) 'Should recognize this app Expo CLI.'
Assert-Check (!(Test-KilnExpoProcess (Fake-Process 'node.exe' ('node kernel.js --working-dir "' + $RepoRoot + '"')))) 'Must not kill Codex just because it uses this workspace.'
Assert-Check (!(Test-KilnExpoProcess (Fake-Process 'node.exe' 'node C:\OtherApp\node_modules\expo\bin\cli start'))) 'Must not kill another project.'
Assert-Check (!(Test-KilnExpoProcess (Fake-Process 'node.exe' ($expo -replace ' start ', ' export ')))) 'Must not kill an export/test job as a dev server.'
Assert-Check (!(Test-KilnExpoProcess (Fake-Process 'powershell.exe' $expo))) 'Must not kill a terminal parent.'
Assert-Check (Test-KilnTunnelProcess (Fake-Process 'cloudflared.exe' 'cloudflared tunnel --url http://localhost:54321')) 'Should recognize the backend tunnel.'
Assert-Check (Test-KilnTunnelProcess (Fake-Process 'cloudflared.exe' 'cloudflared tunnel --url="http://127.0.0.1:54321/"')) 'Should recognize quoted loopback address.'
Assert-Check (!(Test-KilnTunnelProcess (Fake-Process 'cloudflared.exe' 'cloudflared tunnel --url http://localhost:9999'))) 'Must preserve another port tunnel.'
Assert-Check (!(Test-KilnTunnelProcess (Fake-Process 'cloudflared.exe' 'cloudflared tunnel --url http://localhost:543210'))) 'Port prefix is not an exact match.'
Assert-Check (!(Test-KilnTunnelProcess (Fake-Process 'node.exe' 'node --url http://localhost:54321'))) 'Only cloudflared owns a tunnel.'
Assert-Check ('supabase_db_kiln' -match $ContainerPattern) 'Should match KILN container.'
Assert-Check ('supabase_db_other' -notmatch $ContainerPattern) 'Must preserve another Supabase project.'
Assert-Check ('supabase_db_kiln2' -notmatch $ContainerPattern) 'Must not match another project suffix.'

$gate = 'node "' + $GateScript + '" 54330 54321'
Assert-Check (Test-KilnGateProcess (Fake-Process 'node.exe' $gate)) 'Should recognize the gatekeeper.'
Assert-Check (!(Test-KilnGateProcess (Fake-Process 'node.exe' 'node C:Otherscriptskiln-gate.mjs'))) 'Must not kill another copy of the gatekeeper.'
Assert-Check (Test-KilnTunnelProcess (Fake-Process 'tailscale.exe' '"C:Program FilesTailscale	ailscale.exe" funnel 54330')) 'Should recognize the Funnel.'
Assert-Check (!(Test-KilnTunnelProcess (Fake-Process 'tailscale.exe' 'tailscale.exe funnel 3000'))) 'Must preserve another Funnel.'
Assert-Check (!(Test-KilnTunnelProcess (Fake-Process 'tailscale.exe' 'tailscale.exe funnel 543300'))) 'Funnel port prefix is not an exact match.'
Assert-Check (!(Test-KilnTunnelProcess (Fake-Process 'tailscale-ipn.exe' 'tailscale-ipn.exe'))) 'Must not stop the Tailscale app.'

$fixture = "# Keep this comment`r`nEXPO_PUBLIC_SUPABASE_URL=https://old.trycloudflare.com`r`nEXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=test-key`r`nOTHER_SETTING=keep-me`r`n"
$updated = Update-KilnEnvContent $fixture @{ EXPO_PUBLIC_SUPABASE_URL = 'https://kiln-pc.tail1234.ts.net'; KILN_SERVER = 'Laptop' }
Assert-Check ($updated.Contains('EXPO_PUBLIC_SUPABASE_URL=https://kiln-pc.tail1234.ts.net') -and $updated.Contains('KILN_SERVER=Laptop')) 'Should set the server address and choice.'
Assert-Check ($updated.Contains('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=test-key') -and $updated.Contains('OTHER_SETTING=keep-me') -and $updated.Contains('# Keep this comment')) 'Must retain keys and other settings.'
Assert-Check ((Update-KilnEnvContent '' @{ EXPO_PUBLIC_SUPABASE_URL = 'https://abcdefghijklmnopqrst.supabase.co' }).Contains('EXPO_PUBLIC_SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co')) 'Should accept a hosted project and create a missing entry.'
Assert-Check ((Get-EnvValue $updated 'KILN_SERVER') -eq 'Laptop' -and (Get-EnvValue $updated 'MISSING') -eq '') 'Should read settings.'
foreach ($bad in @('https://new-test.trycloudflare.com', 'http://kiln-pc.tail1234.ts.net', 'https://evil.com/x.ts.net', 'https://x.supabase.co.evil.com')) {
    $rejected = $false
    try { Update-KilnEnvContent $fixture @{ EXPO_PUBLIC_SUPABASE_URL = $bad } | Out-Null } catch { $rejected = $true }
    Assert-Check $rejected "Must reject server address $bad."
}
$rejected = $false
try { Update-KilnEnvContent ($fixture + "EXPO_PUBLIC_SUPABASE_URL=duplicate`r`n") @{ EXPO_PUBLIC_SUPABASE_URL = 'https://kiln-pc.tail1234.ts.net' } | Out-Null } catch { $rejected = $true }
Assert-Check $rejected 'Must reject duplicate URL entries.'
$rejected = $false
try { Update-KilnEnvContent $fixture @{ KILN_SERVER = "Laptop`nEXPO_PUBLIC_SUPABASE_URL=https://evil" } | Out-Null } catch { $rejected = $true }
Assert-Check $rejected 'Must reject values that add extra lines.'

# Stub Docker before testing shutdown policy: these tests never operate real services.
$script:mockOther = $true
$script:desktopStops = 0
function Test-DockerReady { return $true }
function docker.exe {
    $global:LASTEXITCODE = 0
    if ($args[0] -eq 'ps' -and $script:mockOther) { 'unrelated-container' }
    if ($args[0] -eq 'desktop' -and $args[1] -eq 'stop') { $script:desktopStops++ }
}
Stop-IdleDocker
Assert-Check ($desktopStops -eq 0) 'Must keep Docker running for another container.'
$script:mockOther = $false
Stop-IdleDocker
Assert-Check ($desktopStops -eq 1) 'Should stop Docker when no containers remain.'
$KeepDocker = $true
Stop-IdleDocker
Assert-Check ($desktopStops -eq 1) 'KeepDocker must override shutdown.'
Write-Host "$checks service-safety checks passed. No real services were changed."
