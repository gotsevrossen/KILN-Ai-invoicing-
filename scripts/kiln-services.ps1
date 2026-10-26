[CmdletBinding()]
param(
    [ValidateSet('Start', 'Stop', 'Status')][string]$Action = 'Status',
    [switch]$KeepDocker,
    [switch]$BackendOnly
)

$ErrorActionPreference = 'Stop'
$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$MobilePath = Join-Path $RepoRoot 'mobile'
$RuntimePath = Join-Path $RepoRoot '.kiln-runtime'
$StatePath = Join-Path $RuntimePath 'processes.json'
$ProjectId = 'kiln'
$ContainerPattern = '^supabase_.+_' + [regex]::Escape($ProjectId) + '$'
$TunnelPattern = '(?i)--url(?:=|\s+)["'']?http://(?:localhost|127\.0\.0\.1):54321(?:[\s/"'']|$)'
$SupabaseEnvPath = Join-Path $RepoRoot 'supabase\.env'
# Supabase's local defaults: the same on every computer and published online, so anyone who
# finds the tunnel address could use them to skip every permission rule.
$DefaultPublishableKey = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
$DefaultJwtSecret = 'super-secret-jwt-token-with-at-least-32-characters-long'

function ConvertTo-Base64Url([byte[]]$Bytes) {
    return [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function New-RandomText([int]$Bytes) {
    $buffer = [byte[]]::new($Bytes)
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($buffer) } finally { $random.Dispose() }
    return ConvertTo-Base64Url $buffer
}

# Gives this computer its own server keys, kept in supabase/.env (git ignores it). The Supabase
# CLI reads them when it creates the containers, so they take effect after one
# "npx supabase stop" and "npx supabase start" (data is kept).
function Initialize-KilnServerKeys {
    $content = if (Test-Path -LiteralPath $SupabaseEnvPath) { [IO.File]::ReadAllText($SupabaseEnvPath) } else { '' }
    $added = @()
    foreach ($name in @('SUPABASE_AUTH_JWT_SECRET', 'SUPABASE_AUTH_SECRET_KEY')) {
        if ($content -match "(?m)^[ \t]*$name[ \t]*=[ \t]*\S") { continue }
        $value = if ($name -eq 'SUPABASE_AUTH_SECRET_KEY') { 'sb_secret_' + (New-RandomText 24) } else { New-RandomText 48 }
        $empty = "(?m)^[ \t]*$name[ \t]*=[ \t]*(?=\r?$)"
        if ($content -match $empty) {
            $content = [regex]::Replace($content, $empty, "$name=$value")
        } else {
            if ($content.Length -gt 0 -and !$content.EndsWith("`n")) { $content += "`r`n" }
            $content += "$name=$value`r`n"
        }
        $added += $name
    }
    if ($added.Count -gt 0) {
        [IO.File]::WriteAllText($SupabaseEnvPath, $content, [Text.UTF8Encoding]::new($false))
        Write-Host "Created this computer's own server keys in supabase/.env ($($added -join ', '))." -ForegroundColor Yellow
    }
}

function Get-HttpStatus([string]$Uri, [hashtable]$Headers) {
    try {
        return [int](Invoke-WebRequest -Uri $Uri -Headers $Headers -UseBasicParsing -TimeoutSec 10).StatusCode
    } catch {
        if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
        throw
    }
}

# The old-style admin token every local Supabase accepts until it has its own secret.
function New-DefaultServiceToken {
    $utf8 = [Text.Encoding]::UTF8
    $unsigned = (ConvertTo-Base64Url $utf8.GetBytes('{"alg":"HS256","typ":"JWT"}')) + '.' +
        (ConvertTo-Base64Url $utf8.GetBytes('{"iss":"supabase-demo","role":"service_role","exp":1983812996}'))
    $hmac = [Security.Cryptography.HMACSHA256]::new($utf8.GetBytes($DefaultJwtSecret))
    try { return $unsigned + '.' + (ConvertTo-Base64Url $hmac.ComputeHash($utf8.GetBytes($unsigned))) } finally { $hmac.Dispose() }
}

# The phone connection puts the server on the internet: only open it once the public
# default keys are refused. (Asks for the user list, which only an admin key can see.)
# Initialize-KilnServerKeys always writes both keys together and the CLI reads both when it
# creates the containers, so a refused default signing secret means the default secret key is gone too.
function Assert-PrivateServerKeys {
    $envFile = Join-Path $MobilePath '.env.local'
    $content = if (Test-Path -LiteralPath $envFile) { [IO.File]::ReadAllText($envFile) } else { '' }
    $publishable = if ($content -match '(?m)^[ \t]*EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY[ \t]*=[ \t]*(\S+)') { $Matches[1] } else { $DefaultPublishableKey }
    $admin = 'http://localhost:54321/auth/v1/admin/users?per_page=1'
    $headers = @{ apikey = $publishable; Authorization = "Bearer $(New-DefaultServiceToken)" }
    $status = $null
    $until = (Get-Date).AddSeconds(30)
    do {
        try { $status = Get-HttpStatus $admin $headers } catch { Start-Sleep -Seconds 1 }
    } while ($null -eq $status -and (Get-Date) -lt $until)
    if ($null -eq $status) { throw 'The backend did not answer, so the phone connection was not opened.' }
    if ($status -eq 200) {
        throw ("The backend still accepts Supabase's public default keys, so the phone connection was not opened " +
            '(anyone with the address could read every business). Fix once: npx supabase stop, then npx supabase start ' +
            '(data is kept), then Start KILN again. Testers sign in again afterwards; the app itself needs no rebuild.')
    }
}

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
    return $Process.Name -eq 'cloudflared.exe' -and [string]$Process.CommandLine -match $TunnelPattern
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
        (Test-KilnExpoProcess $_) -or (Test-KilnTunnelProcess $_)
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
    if (!(Test-KilnExpoProcess $live) -and !(Test-KilnTunnelProcess $live)) { return }
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
    foreach ($process in @(Get-AppProcesses)) { Stop-VerifiedProcessTree $process }
    if (@(Get-AppProcesses).Count -gt 0) { throw 'Some KILN preview or tunnel processes could not be stopped.' }
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

function Find-Cloudflared {
    $found = Get-Command cloudflared.exe -ErrorAction SilentlyContinue
    if ($found) { return $found.Source }
    foreach ($base in @(${env:ProgramFiles(x86)}, $env:ProgramFiles)) {
        if ($base) {
            $candidate = Join-Path $base 'cloudflared\cloudflared.exe'
            if (Test-Path -LiteralPath $candidate) { return $candidate }
        }
    }
    throw 'cloudflared.exe was not found. Install Cloudflare Tunnel or add it to PATH.'
}

function Update-KilnEnvContent([string]$Content, [string]$Url) {
    if ($Url -notmatch '^https://(?!api\.)[a-z0-9-]+\.trycloudflare\.com$') { throw 'Invalid temporary backend address.' }
    $pattern = '(?m)^\s*EXPO_PUBLIC_SUPABASE_URL\s*='
    if ([regex]::Matches($Content, $pattern).Count -gt 1) { throw 'Duplicate Supabase URL settings found in mobile/.env.local.' }
    if ($Content -match $pattern) {
        return [regex]::Replace($Content, '(?m)^\s*EXPO_PUBLIC_SUPABASE_URL\s*=.*$', "EXPO_PUBLIC_SUPABASE_URL=$Url")
    }
    return $Content + "`r`nEXPO_PUBLIC_SUPABASE_URL=$Url`r`n"
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

function Start-Kiln {
    $expoCli = Join-Path $MobilePath 'node_modules\expo\bin\cli'
    if (!(Test-Path -LiteralPath $expoCli)) { throw 'Install the mobile dependencies first: cd mobile; npm install' }
    if (!$BackendOnly) { $cloudflared = Find-Cloudflared }
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $existing = @(Get-AppProcesses)
    if ($existing.Count -gt 0) {
        Write-Host 'A KILN preview or tunnel is already running. Use Stop KILN before a clean restart.'
        Show-KilnStatus
        return
    }
    if (!$BackendOnly -and @(Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue).Count -gt 0) {
        throw 'Port 8081 is occupied. This script will not stop an unrelated process.'
    }
    New-Item -ItemType Directory -Path $RuntimePath -Force | Out-Null
    Initialize-KilnServerKeys
    $dockerWasRunning = Test-DockerReady
    $newContainers = @()
    $newProcesses = @()
    try {
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

        Write-Host 'Starting the phone connection...'
        $tunnelLog = Join-Path $RuntimePath 'tunnel-error.log'
        $tunnel = Start-Process -FilePath $cloudflared -ArgumentList @('tunnel', '--no-autoupdate', '--url', 'http://localhost:54321') -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $RuntimePath 'tunnel.log') -RedirectStandardError $tunnelLog
        $newProcesses += $tunnel.Id
        Save-ProcessRecord 'tunnel' $tunnel.Id
        $until = (Get-Date).AddSeconds(45)
        $url = $null
        do {
            if (!(Get-Process -Id $tunnel.Id -ErrorAction SilentlyContinue)) { throw 'Cloudflare Tunnel exited. See .kiln-runtime/tunnel-error.log.' }
            $text = if (Test-Path -LiteralPath $tunnelLog) { Get-Content -LiteralPath $tunnelLog -Raw } else { '' }
            if ($text -match 'https://(?!api\.)[a-z0-9-]+\.trycloudflare\.com') { $url = $Matches[0]; break }
            Start-Sleep -Seconds 1
        } while ((Get-Date) -lt $until)
        if (!$url) { throw 'Cloudflare did not provide a preview address within 45 seconds.' }
        $envFile = Join-Path $MobilePath '.env.local'
        $content = if (Test-Path -LiteralPath $envFile) { [IO.File]::ReadAllText($envFile) } else { '' }
        $content = Update-KilnEnvContent $content $url
        [IO.File]::WriteAllText($envFile, $content, [Text.UTF8Encoding]::new($false))
        Write-Host 'Updated the phone backend address in mobile/.env.local; other settings were retained.'

        $expo = Start-Process -FilePath $node -ArgumentList @(('"' + $expoCli + '"'), 'start', '--offline', '--port', '8081') `
            -WorkingDirectory $MobilePath -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $RuntimePath 'expo.log') `
            -RedirectStandardError (Join-Path $RuntimePath 'expo-error.log')
        $newProcesses += $expo.Id
        Save-ProcessRecord 'expo' $expo.Id
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
        Write-Host 'Database dashboard: http://localhost:54323'
        Write-Host 'Logs: .kiln-runtime/expo.log and tunnel-error.log'
        $network = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address } | Select-Object -First 1
        if ($network) { Write-Host "Expo Go on the same network: exp://$($network.IPv4Address[0].IPAddress):8081" }
    } catch {
        $reason = $_
        foreach ($processId in $newProcesses) {
            $process = Get-CimInstance Win32_Process -Filter "ProcessId=$processId"
            if ($process) { Stop-VerifiedProcessTree $process }
        }
        if (Test-Path -LiteralPath $StatePath) { Remove-Item -LiteralPath $StatePath }
        if (Test-DockerReady) {
            if ($newContainers.Count -gt 0) { & docker.exe stop --timeout 20 @newContainers | Out-Null }
            if (!$dockerWasRunning) { Stop-IdleDocker }
        }
        throw $reason
    }
}

function Show-KilnStatus {
    $processes = @(Get-AppProcesses)
    Write-Host "KILN preview/tunnel processes: $($processes.Count)"
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
