# Publishes KILN's invoice, estimate, collection, recovery and Stripe return pages on
# Expo's free hosting, connected to the hosted Supabase project. Run again after changing them.
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-pay-page.ps1
# The hosted server's address and public key come from mobile\.env.hosted.local; they override
# mobile\.env.local (the laptop server) for this build only.

param([switch]$ExportOnly)

$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$mobile = Join-Path $repo 'mobile'
$hostedFile = Join-Path $mobile '.env.hosted.local'

if (-not (Test-Path $hostedFile)) { throw "Missing $hostedFile (the hosted Supabase address and public key)." }
$values = @{}
foreach ($line in Get-Content $hostedFile) {
  if ($line -match '^\s*(EXPO_PUBLIC_[A-Z_]+)\s*=\s*(.+?)\s*$') { $values[$Matches[1]] = $Matches[2] }
}
foreach ($name in 'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY') {
  if (-not $values[$name]) { throw "$name is missing from $hostedFile." }
}
if ($values['EXPO_PUBLIC_SUPABASE_URL'] -notmatch '^https://[a-z0-9]{20}\.supabase\.co$') {
  throw 'The hosted address must look like https://<project>.supabase.co.'
}

# Shell values win over .env files when Expo builds. Restore them when called in an existing session.
$names = @('EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'EXPO_PUBLIC_PASSWORD_RESET_URL')
$before = @{}
foreach ($name in $names) {
  $before[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
  [Environment]::SetEnvironmentVariable($name, $values[$name], 'Process')
}

Push-Location $mobile
try {
  npx expo export --platform web --clear
  if ($LASTEXITCODE -ne 0) { throw 'The web build failed.' }
  $routes = Get-Content -LiteralPath 'dist/server/_expo/routes.json' -Raw | ConvertFrom-Json
  foreach ($page in '/pay/[token]', '/quote/[token]', '/collect/[token]', '/reset-password', '/stripe-done') {
    if ($page -notin $routes.htmlRoutes.page) { throw "Web export is missing $page." }
  }
  if ($ExportOnly) { Write-Host 'Exported and verified customer routes.'; return }
  npx --yes eas-cli deploy --prod --non-interactive
  if ($LASTEXITCODE -ne 0) { throw 'Publishing to Expo hosting failed.' }
}
finally {
  Pop-Location
  foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $before[$name], 'Process') }
}
Write-Host 'Published. Set KILN_PAY_URL on the hosted server to the production address shown above (no slash at the end).'
