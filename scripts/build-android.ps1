# Builds KILN's Android test app (APK) on this computer, without Expo's cloud.
#
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-android.ps1
#
# Uses the Java 17 and Android SDK kept in %LOCALAPPDATA%\KILN-build (nothing installed
# system-wide; delete that folder to remove them). Builds for modern 64-bit phones only
# (arm64-v8a), which is nearly every Android phone and about half the compiling.
# The first build downloads Android parts and takes a while; later ones are much faster.
#
# The server address in mobile/.env.local is built into the app. Run Start KILN first so it's
# the current one. Result: builds/android/kiln-preview.apk (the previous one is kept, dated).
#
# This APK is signed with this computer's own test key. Android won't install it over one from
# Expo's cloud (different key): uninstall the old KILN from the phone first.

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$mobile = Join-Path $repo 'mobile'
$tools = Join-Path $env:LOCALAPPDATA 'KILN-build'

$jdk = Get-ChildItem -Path $tools -Directory -Filter 'jdk-17*' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $jdk) { throw "Java 17 isn't in $tools. See docs/local-services.md (Android builds)." }
$sdk = Join-Path $tools 'sdk'
if (-not (Test-Path (Join-Path $sdk 'cmdline-tools\latest\bin\sdkmanager.bat'))) { throw "The Android SDK isn't in $sdk." }

# Gradle downloads the Android parts it needs (like the NDK) only once the Android SDK license is
# accepted. Running this script accepts it, the way build servers do: the license's ID in a file.
$licenses = Join-Path $sdk 'licenses'
if (-not (Test-Path (Join-Path $licenses 'android-sdk-license'))) {
    New-Item -ItemType Directory -Force -Path $licenses | Out-Null
    Set-Content -Path (Join-Path $licenses 'android-sdk-license') -Value "`n24333f8a63b6825ea9c5514f83c2829b004d1fee" -NoNewline -Encoding ascii
}

# only for this build, so nothing else on the computer changes
$env:JAVA_HOME = $jdk.FullName
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:Path = "$($jdk.FullName)\bin;$sdk\platform-tools;$env:Path"

Push-Location $mobile
try {
    # the android folder is made from app.json each time (Expo's prebuild); it isn't kept in git
    Write-Host 'Making the Android project from app.json...' -ForegroundColor Cyan
    # prebuild rewrites package.json's android/ios shortcuts for native builds (Expo Go uses the old
    # ones) and can copy the plugins' permissions into app.json: both are put back as they were
    $kept = @{}
    foreach ($name in 'package.json', 'app.json') {
        $kept[$name] = [System.IO.File]::ReadAllText((Join-Path $mobile $name))
    }
    try {
        & npx expo prebuild --platform android --no-install
        if ($LASTEXITCODE -ne 0) { throw 'expo prebuild failed' }
    } finally {
        foreach ($name in $kept.Keys) { [System.IO.File]::WriteAllText((Join-Path $mobile $name), $kept[$name]) }
    }

    Write-Host 'Building the APK...' -ForegroundColor Cyan
    Push-Location (Join-Path $mobile 'android')
    try {
        & .\gradlew.bat assembleRelease '-PreactNativeArchitectures=arm64-v8a' --console=plain
        if ($LASTEXITCODE -ne 0) { throw 'The Gradle build failed (see the messages above).' }
    } finally {
        Pop-Location
    }

    $built = Join-Path $mobile 'android\app\build\outputs\apk\release\app-release.apk'
    $outDir = Join-Path $repo 'builds\android'
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null
    $out = Join-Path $outDir 'kiln-preview.apk'
    if (Test-Path $out) {
        $stamp = (Get-Item $out).LastWriteTime.ToString('yyyy-MM-dd-HHmm')
        Move-Item -Force $out (Join-Path $outDir "kiln-preview-$stamp.apk")
    }
    Copy-Item $built $out
    Write-Host "Done: $out" -ForegroundColor Green
} finally {
    Pop-Location
}
