<#
    build-apk.ps1 — build a debug APK of Vittova with this session's changes.

    Run from the repo root:

        cd D:\paisa-buddy
        powershell -ExecutionPolicy Bypass -File .\build-apk.ps1

    Stops at the first failing step and says what broke. Safe to re-run.

    Produces a DEBUG apk, signed with Android's auto-generated debug key. That
    is installable on your phone and correct for testing, but it is NOT the
    artifact you upload to Play — see RELEASE.md for the signed release bundle.
#>

$ErrorActionPreference = 'Stop'

function Step($n, $text) { Write-Host "`n=== [$n] $text ===" -ForegroundColor Cyan }
function Ok($text)       { Write-Host "    OK  $text" -ForegroundColor Green }
function Warn($text)     { Write-Host "    !   $text" -ForegroundColor Yellow }

# PowerShell does not treat a non-zero exit code from a native command as an
# error, so every external call has to be checked by hand.
function Invoke-Checked($what) {
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`nFAILED: $what (exit code $LASTEXITCODE)" -ForegroundColor Red
        Write-Host "Nothing after this step ran. Fix the error above and re-run this script." -ForegroundColor Red
        exit 1
    }
}

$root = $PSScriptRoot
if (-not (Test-Path (Join-Path $root 'frontend\package.json'))) {
    Write-Host "This script must sit in the repo root next to frontend\. Found: $root" -ForegroundColor Red
    exit 1
}
Set-Location $root


# ── 0. JDK ──────────────────────────────────────────────────────────────────
# gradle.properties used to pin org.gradle.java.home to an absolute Windows
# path, which broke the build on every other machine. It was removed, so
# Gradle now needs JAVA_HOME — set it here for this run if it is missing.
Step 0 'Locating a JDK'
if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
    Ok "JAVA_HOME = $env:JAVA_HOME"
} else {
    $candidates = @(
        'C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot',
        'C:\Program Files\Eclipse Adoptium',
        'C:\Program Files\Java',
        (Join-Path $env:USERPROFILE '.jdks')
    )
    $found = $null
    foreach ($c in $candidates) {
        if (-not (Test-Path $c)) { continue }
        if (Test-Path (Join-Path $c 'bin\java.exe')) { $found = $c; break }
        $sub = Get-ChildItem $c -Directory -ErrorAction SilentlyContinue |
               Where-Object { Test-Path (Join-Path $_.FullName 'bin\java.exe') } |
               Sort-Object Name -Descending | Select-Object -First 1
        if ($sub) { $found = $sub.FullName; break }
    }
    if ($found) {
        $env:JAVA_HOME = $found
        Ok "JAVA_HOME set for this run: $found"
        Warn 'This is temporary. Set JAVA_HOME permanently, or put'
        Warn "  org.gradle.java.home=$($found -replace '\\','/')"
        Warn '  in frontend\android\local.properties (git-ignored).'
    } else {
        Write-Host 'No JDK found. Install JDK 21 or set JAVA_HOME, then re-run.' -ForegroundColor Red
        exit 1
    }
}


# ── 1. Remove the three dead files ──────────────────────────────────────────
Step 1 'Removing dead files'
$dead = @(
    'frontend\src\components\ProtectedRoute.jsx',
    'frontend\public\vite.svg',
    'frontend\src\assets\react.svg'
)
foreach ($f in $dead) {
    $p = Join-Path $root $f
    if (Test-Path $p) { Remove-Item $p -Force; Ok "deleted $f" }
    else { Ok "already gone: $f" }
}


# ── 2. Dependencies ─────────────────────────────────────────────────────────
# @capacitor/browser was added for the Custom Tab OAuth fix. Without it the
# vite build fails outright on an unresolved import in AuthContext.jsx.
Step 2 'Installing npm dependencies'
Set-Location (Join-Path $root 'frontend')
npm install
Invoke-Checked 'npm install'
if (-not (Test-Path 'node_modules\@capacitor\browser')) {
    Write-Host '@capacitor/browser is still missing after npm install.' -ForegroundColor Red
    Write-Host 'Check that frontend\package.json lists it under dependencies.' -ForegroundColor Red
    exit 1
}
Ok '@capacitor/browser present'


# ── 3. Web build ────────────────────────────────────────────────────────────
Step 3 'Building the web bundle'
npm run build
Invoke-Checked 'npm run build'
Ok 'dist/ written'


# ── 4. Capacitor sync ───────────────────────────────────────────────────────
# Copies dist/ into the Android assets and regenerates the native plugin
# registration, which is what makes @capacitor/browser available to the app.
Step 4 'Syncing the Android project'
npx cap sync android
Invoke-Checked 'npx cap sync android'
Ok 'android project synced'


# ── 5. Unit tests ───────────────────────────────────────────────────────────
# The 32 notification-parser tests. These were verified on a plain JVM in the
# cloud sandbox; this is the first time they run under the project's real
# Gradle/JUnit setup, so a failure here is informative rather than surprising.
Step 5 'Running Android unit tests'
Set-Location (Join-Path $root 'frontend\android')
.\gradlew.bat testDebugUnitTest --console=plain
if ($LASTEXITCODE -ne 0) {
    Warn 'Unit tests failed. Continuing to the APK so you still get an artifact,'
    Warn 'but read the report before trusting UPI detection:'
    Warn '  frontend\android\app\build\reports\tests\testDebugUnitTest\index.html'
    $testsFailed = $true
} else {
    Ok 'all unit tests passed'
    $testsFailed = $false
}


# ── 6. APK ──────────────────────────────────────────────────────────────────
Step 6 'Assembling the debug APK'
.\gradlew.bat assembleDebug --console=plain
Invoke-Checked 'gradlew assembleDebug'

$apk = Join-Path $root 'frontend\android\app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path $apk)) {
    Write-Host "Gradle reported success but no APK is at:`n  $apk" -ForegroundColor Red
    exit 1
}

$size = [math]::Round((Get-Item $apk).Length / 1MB, 1)
Write-Host "`n────────────────────────────────────────────────────────" -ForegroundColor Green
Write-Host " APK built: $apk" -ForegroundColor Green
Write-Host " Size: $size MB" -ForegroundColor Green
if ($testsFailed) {
    Write-Host " WARNING: unit tests failed - see step 5 above" -ForegroundColor Yellow
}
Write-Host "────────────────────────────────────────────────────────" -ForegroundColor Green

Write-Host @"

Install it:
    adb install -r "$apk"
  or copy the file to the phone and open it.

Before the app will work end to end:
  1. Run supabase\v1_1_launch_hardening.sql in the Supabase SQL Editor.
     The backend now queries expenses.occurred_at, which that migration
     creates. Skip it and every report errors.
  2. Add  spendly://login-callback  to Supabase -> Authentication ->
     URL Configuration -> Redirect URLs. Without it Google sign-in still
     lands on the website.

Then work through DEVICE_TEST_CHECKLIST.md - the Google sign-in and UPI
notification sections especially. Those are the two things that changed
most and could be verified least.
"@
