[CmdletBinding()]
param(
    [ValidateSet('Start', 'Stop', 'Status')][string]$Action = 'Status',
    [switch]$KeepDocker,
    [switch]$BackendOnly,
    # Which server the app uses: Laptop (this computer, reached through Tailscale Funnel) or Hosted
    # (Supabase's cloud). Empty keeps the last choice, saved as KILN_SERVER in mobile/.env.local.
    [ValidateSet('', 'Laptop', 'Hosted')][string]$Server = ''
)

$ErrorActionPreference = 'Stop'
$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$MobilePath = Join-Path $RepoRoot 'mobile'
$RuntimePath = Join-Path $RepoRoot '.kiln-runtime'
$StatePath = Join-Path $RuntimePath 'processes.json'
$ProjectId = 'kiln'
$ContainerPattern = '^supabase_.+_' + [regex]::Escape($ProjectId) + '$'
$EnvFile = Join-Path $MobilePath '.env.local'
$HostedEnvFile = Join-Path $MobilePath '.env.hosted.local'
$GateScript = Join-Path $PSScriptRoot 'kiln-gate.mjs'
$GatePort = 54330
# Old Cloudflare quick tunnels are still recognized so Stop can clean them up.
$TunnelPattern = '(?i)--url(?:=|\s+)["'']?http://(?:localhost|127\.0\.0\.1):54321(?:[\s/"'']|$)'
$FunnelPattern = '(?i)(?:^|\s)funnel\s+(?:--\S+\s+)*' + $GatePort + '(?:\s|$)'
# Supabase's built-in local keys are public; the phone address must never open with them in use.
# (The second is split in two so GitHub's secret scanner doesn't mistake this published default for a real key.)
$PublicDefaultKeys = @('super-secret-jwt-token-with-at-least-32-characters-long', ('sb_secret_' + 'N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz'))

function Test-KilnExpoProcess($Process) {
    # A working-directory argument alone does NOT establish ownership (e.g. Codex).
    $command = [string]$Process.CommandLine
    $root = [regex]::Escape($MobilePath)
    return $Process.Name -eq 'node.exe' -and
        $command -match ($root + '[\\/]node_modules[\\/]') -and
        $command -match '[\\/]expo[\\/]bin[\\/]cli(?:["\s]|$)' -and
        $command -match '(?:^|\s)start(?:\s|$)'
}

function Test-KilnTunnelProcess($Process) {
    $command = [string]$Process.CommandLine
    return ($Process.Name -eq 'cloudflared.exe' -and $command -match $TunnelPattern) -or
        ($Process.Name -eq 'tailscale.exe' -and $command -match $FunnelPattern)
}

function Test-KilnGateProcess($Process) {
    return $Process.Name -eq 'node.exe' -and [string]$Process.CommandLine -match ([regex]::Escape($GateScript) + '(?:["\s]|$)')
}

function Test-DockerReady {
    $savedPreference = $ErrorActionPreference
    try {
        # Windows PowerShell turns native stderr into errors even for an expected offline daemon.
        $ErrorActionPreference = 'SilentlyContinue'
        & docker.exe info --format '{{.ServerVersion}}' *> $null
        return $LASTEXITCODE -eq 0
    } finally { $ErrorActionPreference = $savedPreference }
}

function Get-KilnContainers([switch]$All) {
    $arguments = @('ps', '--format', '{{.Names}}')
    if ($All) { $arguments += '-a' }
    $names = @(& docker.exe @arguments)
    if ($LASTEXITCODE -ne 0) { throw 'Could not read Docker containers.' }
    return @($names | Where-Object { $_ -match $ContainerPattern })
}

function Get-AppProcesses {
    return @(Get-CimInstance Win32_Process | Where-Object {
        (Test-KilnExpoProcess $_) -or (Test-KilnTunnelProcess $_) -or (Test-KilnGateProcess $_)
    })
}

function Save-ProcessRecord([string]$Name, [int]$ProcessId) {
    $records = @{}
    if (Test-Path -LiteralPath $StatePath) {
        $old = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
        foreach ($property in $old.PSObject.Properties) { $records[$property.Name] = $property.Value }
    }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId"
    if (!$process) { throw "$Name exited during startup. See $RuntimePath." }
    $records[$Name] = @{ ProcessId = $ProcessId; Created = $process.CreationDate.ToUniversalTime().ToString('o') }
    [IO.File]::WriteAllText($StatePath, ($records | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
}

function Stop-VerifiedProcessTree($RootProcess) {
    # Recheck identity before acting; never kill all node.exe processes or a shell parent.
    $live = Get-CimInstance Win32_Process -Filter "ProcessId=$($RootProcess.ProcessId)"
    if (!$live -or $live.CreationDate -ne $RootProcess.CreationDate) { return }
    if (!(Test-KilnExpoProcess $live) -and !(Test-KilnTunnelProcess $live) -and !(Test-KilnGateProcess $live)) { return }
    $all = @(Get-CimInstance Win32_Process)
    $descendants = [Collections.Generic.List[object]]::new()
    $parents = @($live)
    while ($parents.Count -gt 0) {
        $children = @($all | Where-Object { $_.ParentProcessId -in $parents.ProcessId -and $_.CreationDate -ge $live.CreationDate })
        foreach ($child in $children) { $descendants.Add($child) }
        $parents = $children
    }
    Stop-Process -Id $live.ProcessId -ErrorAction SilentlyContinue
    foreach ($child in @($descendants.ToArray() | Sort-Object CreationDate -Descending)) {
        $now = Get-CimInstance Win32_Process -Filter "ProcessId=$($child.ProcessId)"
        if ($now -and $now.CreationDate -eq $child.CreationDate) {
            Stop-Process -Id $child.ProcessId -ErrorAction SilentlyContinue
        }
    }
    Write-Host "Stopped KILN process $($live.ProcessId) ($($live.Name))."
}

function Stop-IdleDocker {
    if ($KeepDocker) { return }
    if (Test-DockerReady) {
        $others = @(& docker.exe ps --format '{{.Names}}')
        if ($LASTEXITCODE -ne 0) { throw 'Cannot verify that Docker is idle.' }
        if ($others.Count -gt 0) {
            Write-Host 'Other containers are running; Docker Desktop stays on.'
            return
        }
        Write-Host 'Stopping idle Docker Desktop to release its resources...'
        & docker.exe desktop stop --timeout 45
        if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop did not finish stopping. Check Docker Desktop.' }
    }
}

function Stop-Kiln {
    # Close the public address first, then what's behind it.
    foreach ($process in @(Get-AppProcesses | Sort-Object { if (Test-KilnTunnelProcess $_) { 0 } else { 1 } })) { Stop-VerifiedProcessTree $process }
    $until = (Get-Date).AddSeconds(15)
    while (@(Get-AppProcesses).Count -gt 0 -and (Get-Date) -lt $until) { Start-Sleep -Milliseconds 500 }
    if (@(Get-AppProcesses).Count -gt 0) { throw 'Some KILN preview or phone connection processes could not be stopped.' }
    if (Test-DockerReady) {
        $names = @(Get-KilnContainers)
        if ($names.Count -gt 0) {
            & docker.exe stop --timeout 20 @names
            if ($LASTEXITCODE -ne 0) { throw 'Some KILN containers could not be stopped.' }
        }
        if (@(Get-KilnContainers).Count -gt 0) { throw 'KILN containers are still running.' }
    }
    if (Test-Path -LiteralPath $StatePath) { Remove-Item -LiteralPath $StatePath }
    Stop-IdleDocker
    Write-Host 'KILN is off. Database containers and saved volumes were kept.' -ForegroundColor Green
}

function Find-Tailscale {
    $found = Get-Command tailscale.exe -ErrorAction SilentlyContinue
    if ($found) { return $found.Source }
    $candidate = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
    if (Test-Path -LiteralPath $candidate) { return $candidate }
    throw 'Tailscale was not found. Install it (winget install Tailscale.Tailscale) and sign in once.'
}

function Test-ServerUrl([string]$Url) {
    # A Tailscale Funnel address (machine.tailnet.ts.net) or a hosted Supabase project.
    return $Url -match '^https://[a-z0-9-]+\.[a-z0-9-]+\.ts\.net$' -or $Url -match '^https://[a-z0-9]{20}\.supabase\.co$'
}

function Get-EnvValue([string]$Content, [string]$Name) {
    $found = [regex]::Matches($Content, '(?m)^\s*' + [regex]::Escape($Name) + '\s*=(.*)$')
    if ($found.Count -gt 1) { throw "Duplicate $Name settings found." }
    if ($found.Count -eq 0) { return '' }
    return $found[0].Groups[1].Value.Trim().Trim('"')
}

function Update-KilnEnvContent([string]$Content, [hashtable]$Values) {
    if ($Values.ContainsKey('EXPO_PUBLIC_SUPABASE_URL') -and !(Test-ServerUrl $Values['EXPO_PUBLIC_SUPABASE_URL'])) {
        throw 'Invalid server address.'
    }
    foreach ($name in @($Values.Keys | Sort-Object)) {
        $value = [string]$Values[$name]
        if ($value -match '[\r\n]') { throw "Invalid $name value." }
        $pattern = '(?m)^\s*' + [regex]::Escape($name) + '\s*=.*$'
        $count = [regex]::Matches($Content, $pattern).Count
        if ($count -gt 1) { throw "Duplicate $name settings found in mobile/.env.local." }
        if ($count -eq 1) {
            $Content = [regex]::Replace($Content, $pattern, { param($m) "$name=$value" })
        } else {
            if ($Content -ne '' -and !$Content.EndsWith("`n")) { $Content += "`r`n" }
            $Content += "$name=$value`r`n"
        }
    }
    return $Content
}

function Get-ServerChoice {
    if ($Server) { return $Server }
    $content = if (Test-Path -LiteralPath $EnvFile) { [IO.File]::ReadAllText($EnvFile) } else { '' }
    if ((Get-EnvValue $content 'KILN_SERVER') -eq 'Hosted') { return 'Hosted' }
    return 'Laptop'
}

function Assert-PrivateServerKeys {
    # The phone address is public, so refuse to open it while the server uses Supabase's published keys.
    $secrets = Join-Path $RepoRoot 'supabase\.env'
    $content = if (Test-Path -LiteralPath $secrets) { [IO.File]::ReadAllText($secrets) } else { '' }
    foreach ($name in @('KILN_JWT_SECRET', 'KILN_SECRET_KEY')) {
        if ((Get-EnvValue $content $name).Length -lt 32) { throw "$name is missing from supabase/.env. See supabase/.env.example." }
    }
    $names = @(Get-KilnContainers)
    $settings = @(& docker.exe inspect --format '{{range .Config.Env}}{{println .}}{{end}}' @names)
    if ($LASTEXITCODE -ne 0) { throw 'Could not check the server keys.' }
    foreach ($key in $PublicDefaultKeys) {
        if (@($settings | Where-Object { $_.Contains($key) }).Count -gt 0) {
            throw 'The local server still uses Supabase''s public built-in keys. Run npx supabase stop, then npx supabase start, once from the repository.'
        }
    }
}

function Get-LocalPublishableKey {
    $savedPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'SilentlyContinue'
        $status = @(& npx.cmd --no-install supabase status -o env --workdir $RepoRoot 2>$null)
    } finally { $ErrorActionPreference = $savedPreference }
    $key = Get-EnvValue ($status -join "`n") 'PUBLISHABLE_KEY'
    if ($key -notmatch '^sb_publishable_[A-Za-z0-9_-]+$') { throw 'Could not read the local server''s public key (npx supabase status).' }
    return $key
}

function Wait-Url([string]$Url, [int]$Expected, [int]$Seconds) {
    $until = (Get-Date).AddSeconds($Seconds)
    do {
        $code = 0
        try { $code = [int](Invoke-WebRequest -Uri $Url -Method Post -Body '{}' -UseBasicParsing -TimeoutSec 5).StatusCode }
        catch { if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode } }
        if ($code -eq $Expected) { return $true }
        if ($code -ne 0 -and $code -ne 502 -and $code -ne 503) { return $false }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $until)
    return $false
}

function Wait-Containers([string[]]$Names) {
    $until = (Get-Date).AddSeconds(90)
    do {
        $statuses = @(& docker.exe inspect --format '{{.Name}}|{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' @Names)
        if ($LASTEXITCODE -ne 0) { throw 'Could not inspect KILN container health.' }
        if (@($statuses | Where-Object { $_ -notmatch '\|running\|(healthy|none)$' }).Count -eq 0) { return }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $until)
    throw 'KILN backend did not become healthy within 90 seconds. Run KILN Status.cmd and inspect Docker Desktop.'
}

function Start-AppProcess([string]$Name, [string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory) {
    $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $RuntimePath "$Name.log") -RedirectStandardError (Join-Path $RuntimePath "$Name-error.log")
    Save-ProcessRecord $Name $process.Id
    return $process
}

function Start-PhoneAddress([string]$Node, [string]$Tailscale) {
    # Phones reach the laptop server only through the gatekeeper (scripts/kiln-gate.mjs), never directly.
    Write-Host 'Starting the phone connection...'
    $state = & $Tailscale status --json | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or $state.BackendState -ne 'Running') {
        throw 'Tailscale is not signed in or is turned off. Open Tailscale from the Start menu and sign in, then try again.'
    }
    $url = 'https://' + ([string]$state.Self.DNSName).TrimEnd('.')
    if (!(Test-ServerUrl $url)) { throw 'Tailscale did not report this computer''s address.' }

    $gate = Start-AppProcess 'gate' $Node @(('"' + $GateScript + '"'), $GatePort, '54321') $RepoRoot
    $script:newProcesses += $gate.Id
    if (!(Wait-Url "http://127.0.0.1:$GatePort/mcp" 404 15)) { throw 'The gatekeeper did not start. See .kiln-runtime/gate-error.log.' }

    $funnel = Start-AppProcess 'funnel' $Tailscale @('funnel', $GatePort) $RepoRoot
    $script:newProcesses += $funnel.Id
    $until = (Get-Date).AddSeconds(30)
    do {
        if (!(Get-Process -Id $funnel.Id -ErrorAction SilentlyContinue)) { throw 'Tailscale Funnel exited. See .kiln-runtime/funnel-error.log and funnel.log.' }
        $text = (Get-Content -LiteralPath (Join-Path $RuntimePath 'funnel.log') -Raw -ErrorAction SilentlyContinue) + ''
        if ($text -match 'https://login\.tailscale\.com\S*') {
            throw "Funnel isn't turned on for your Tailscale account yet. Open this link, allow it, then start again: $($Matches[0])"
        }
        if ($text.Contains($url)) { break }
        Start-Sleep -Seconds 1
    } while ((Get-Date) -lt $until)
    if (!$text.Contains($url)) { throw 'Tailscale Funnel did not start within 30 seconds. See .kiln-runtime/funnel.log.' }

    # Check from the internet side that the database's developer tools stay closed.
    if (!(Wait-Url "$url/mcp" 404 90)) { throw 'The public address did not answer as expected, so it was closed again. See .kiln-runtime/.' }
    return $url
}

function Start-Kiln {
    $expoCli = Join-Path $MobilePath 'node_modules\expo\bin\cli'
    if (!(Test-Path -LiteralPath $expoCli)) { throw 'Install the mobile dependencies first: cd mobile; npm install' }
    $choice = Get-ServerChoice
    $hosted = $choice -eq 'Hosted' -and !$BackendOnly
    if ($hosted) {
        $saved = if (Test-Path -LiteralPath $HostedEnvFile) { [IO.File]::ReadAllText($HostedEnvFile) } else { '' }
        $hostedValues = @{
            EXPO_PUBLIC_SUPABASE_URL = Get-EnvValue $saved 'EXPO_PUBLIC_SUPABASE_URL'
            EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = Get-EnvValue $saved 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
            KILN_SERVER = 'Hosted'
        }
        if ($hostedValues.EXPO_PUBLIC_SUPABASE_URL -notmatch '\.supabase\.co$' -or $hostedValues.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY -notmatch '^sb_publishable_') {
            throw 'Put the hosted project''s address and publishable key in mobile/.env.hosted.local first (see docs/local-services.md).'
        }
    }
    if (!$BackendOnly -and !$hosted) { $tailscale = Find-Tailscale }
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $existing = @(Get-AppProcesses)
    if ($existing.Count -gt 0) {
        Write-Host 'A KILN preview or phone connection is already running. Use Stop KILN before a clean restart.'
        Show-KilnStatus
        return
    }
    if (!$BackendOnly -and @(Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue).Count -gt 0) {
        throw 'Port 8081 is occupied. This script will not stop an unrelated process.'
    }
    New-Item -ItemType Directory -Path $RuntimePath -Force | Out-Null
    $dockerWasRunning = $hosted -or (Test-DockerReady)
    $newContainers = @()
    $script:newProcesses = @()
    try {
        if ($hosted) {
            Write-Host 'Using the hosted server; the laptop server stays off.'
            $values = $hostedValues
        } else {
            if (!$dockerWasRunning) {
                Write-Host 'Starting Docker Desktop...'
                & docker.exe desktop start --timeout 60
                if ($LASTEXITCODE -ne 0 -or !(Test-DockerReady)) { throw 'Docker Desktop did not start.' }
            }
            $all = @(Get-KilnContainers -All)
            if ($all -notcontains 'supabase_db_kiln') {
                throw 'Existing KILN containers were not found. Initialize them once with npx supabase start from the repository, then use this launcher.'
            }
            # The unused analytics stack consumed considerable RAM and its log collector was restarting.
            $wanted = @($all | Where-Object { $_ -notmatch '^supabase_(analytics|vector)_kiln$' })
            $running = @(Get-KilnContainers)
            $newContainers = @($wanted | Where-Object { $_ -notin $running })
            if ($running -notcontains 'supabase_db_kiln') {
                & docker.exe start supabase_db_kiln
                if ($LASTEXITCODE -ne 0) { throw 'Database could not start.' }
                Wait-Containers @('supabase_db_kiln')
            }
            $remaining = @($newContainers | Where-Object { $_ -ne 'supabase_db_kiln' })
            if ($remaining.Count -gt 0) {
                & docker.exe start @remaining
                if ($LASTEXITCODE -ne 0) { throw 'Some backend containers could not start.' }
            }
            Wait-Containers $wanted
            if ($BackendOnly) { Write-Host 'KILN backend is running.' -ForegroundColor Green; return }
            Assert-PrivateServerKeys
            $values = @{
                EXPO_PUBLIC_SUPABASE_URL = Start-PhoneAddress $node $tailscale
                EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = Get-LocalPublishableKey
                KILN_SERVER = 'Laptop'
            }
        }
        $content = if (Test-Path -LiteralPath $EnvFile) { [IO.File]::ReadAllText($EnvFile) } else { '' }
        [IO.File]::WriteAllText($EnvFile, (Update-KilnEnvContent $content $values), [Text.UTF8Encoding]::new($false))
        Write-Host "The app uses the $($choice.ToLower()) server: $($values.EXPO_PUBLIC_SUPABASE_URL)"

        $expo = Start-AppProcess 'expo' $node @(('"' + $expoCli + '"'), 'start', '--offline', '--port', '8081') $MobilePath
        $script:newProcesses += $expo.Id
        $until = (Get-Date).AddSeconds(120)
        $ready = $false
        do {
            if (!(Get-Process -Id $expo.Id -ErrorAction SilentlyContinue)) { throw 'Expo exited. See .kiln-runtime/expo-error.log.' }
            try {
                $status = Invoke-WebRequest -Uri 'http://localhost:8081/status' -UseBasicParsing -TimeoutSec 2
                $body = if ($status.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($status.Content) } else { [string]$status.Content }
                if ($body -match '^packager-status:running$') { $ready = $true; break }
            } catch { }
            Start-Sleep -Seconds 1
        } while ((Get-Date) -lt $until)
        if (!$ready) { throw 'Expo did not become ready within 120 seconds.' }
        Write-Host 'KILN is running. Browser preview: http://localhost:8081' -ForegroundColor Green
        if (!$hosted) { Write-Host 'Database dashboard: http://localhost:54323' }
        Write-Host 'Logs: .kiln-runtime/'
        $network = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address } | Select-Object -First 1
        if ($network) { Write-Host "Expo Go on the same network: exp://$($network.IPv4Address[0].IPAddress):8081" }
    } catch {
        $reason = $_
        foreach ($processId in $script:newProcesses) {
            $process = Get-CimInstance Win32_Process -Filter "ProcessId=$processId"
            if ($process) { Stop-VerifiedProcessTree $process }
        }
        if (Test-Path -LiteralPath $StatePath) { Remove-Item -LiteralPath $StatePath }
        if (!$hosted -and (Test-DockerReady)) {
            if ($newContainers.Count -gt 0) { & docker.exe stop --timeout 20 @newContainers | Out-Null }
            if (!$dockerWasRunning) { Stop-IdleDocker }
        }
        throw $reason
    }
}

function Show-KilnStatus {
    $content = if (Test-Path -LiteralPath $EnvFile) { [IO.File]::ReadAllText($EnvFile) } else { '' }
    Write-Host "The app uses the $((Get-ServerChoice).ToLower()) server: $(Get-EnvValue $content 'EXPO_PUBLIC_SUPABASE_URL')"
    $processes = @(Get-AppProcesses)
    Write-Host "KILN preview/phone connection processes: $($processes.Count)"
    $processes | Select-Object Name, ProcessId | Format-Table -AutoSize
    if (Test-DockerReady) {
        $names = @(Get-KilnContainers)
        Write-Host "Running KILN containers: $($names.Count)"
        if ($names.Count) { & docker.exe inspect --format '{{.Name}}: {{.State.Status}}' @names }
    } else { Write-Host 'Docker engine: off or unavailable.' }
}

if ($MyInvocation.InvocationName -ne '.') {
    try {
        if (!(Get-Command docker.exe -ErrorAction SilentlyContinue)) { throw 'Docker Desktop is not installed or docker.exe is not on PATH.' }
        switch ($Action) {
            'Start' { Start-Kiln }
            'Stop' { Stop-Kiln }
            'Status' { Show-KilnStatus }
        }
    } catch { Write-Error $_ -ErrorAction Continue; exit 1 }
}
