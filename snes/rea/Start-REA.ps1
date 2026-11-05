param([string]$Rom,[string]$Movie,[int]$Port=8900,[int]$StreamPort=8901,[switch]$Diagnostic,[switch]$Mute,[switch]$Wait,[switch]$Paused)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
$emulator = Join-Path $root 'emulator'
$existing = @(Get-Process -Name EmuHawk -ErrorAction SilentlyContinue)
if ($existing.Count) { throw "BizHawk is already running (PID $($existing.Id -join ', ')). Close it before launching another instance." }
$tool = Join-Path $emulator 'ExternalTools/REA.SNES.dll'
if (!(Test-Path $tool)) { & "$PSScriptRoot/Build.ps1" }
if ($Diagnostic) {
 . "$PSScriptRoot/Python.ps1"
 & (Get-ReaPython) "$PSScriptRoot/make_test_rom.py"
 if ($LASTEXITCODE -ne 0) { throw 'Diagnostic ROM generation failed' }
 $Rom = Join-Path $PSScriptRoot 'test-output/rea-diagnostic.sfc'
}
if (!$Rom) { throw 'Supply -Rom C:/path/to/game.sfc or -Diagnostic' }
$Rom = (Resolve-Path -LiteralPath $Rom).Path
if ($Movie) { $Movie = (Resolve-Path -LiteralPath $Movie).Path }
$env:REA_SNES_ROOT = $PSScriptRoot
$env:REA_SNES_HTTP_PORT = "$Port"
$env:REA_SNES_STREAM_PORT = "$StreamPort"
New-Item -ItemType Directory -Force "$PSScriptRoot/session" | Out-Null
New-Item -ItemType Directory -Force "$PSScriptRoot/movies" | Out-Null
New-Item -ItemType Directory -Force "$PSScriptRoot/checkpoints" | Out-Null
$configPath = Join-Path $PSScriptRoot $(if ($Diagnostic) { 'session/diagnostic-config.json' } else { 'session/config.json' })
$config = if (Test-Path $configPath) { Get-Content $configPath -Raw | ConvertFrom-Json -AsHashtable } else { @{} }
if (!$config.PreferredCores) { $config.PreferredCores = @{} }
$config.PreferredCores.SNES = 'BSNESv115+'
$config.LastWrittenFrom = '2.11.1'
$config.LastWrittenFromDetailed = 'Version 2.11.1'
$config.RunInBackground = $true
$config.FrameSkip = 0
$config.StartPaused = [bool]($Diagnostic -or $Paused)
# Trust only the exact local tool binary built from the adjacent reviewable source.
if (!$config.TrustedExtTools) { $config.TrustedExtTools = @{} }
$config.TrustedExtTools[$tool] = 'SHA512:' + (Get-FileHash -LiteralPath $tool -Algorithm SHA512).Hash
if ($Mute) { $config.SoundVolume = 0 }
$config | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $configPath -Encoding utf8NoBOM
$server = Start-Process -FilePath (Get-Command node).Source -ArgumentList @("`"$PSScriptRoot/server.mjs`"") -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput "$PSScriptRoot/session/server.log" -RedirectStandardError "$PSScriptRoot/session/server-error.log" -PassThru
Start-Sleep -Milliseconds 500
if ($server.HasExited) { throw "Inspector server failed. See $PSScriptRoot/session/server-error.log" }
$arguments = @('--config',"`"$configPath`"",'--open-ext-tool-dll','REA.SNES.dll')
if ($Movie) { $arguments += @('--movie',"`"$Movie`"") }
$arguments += "`"$Rom`""
# The emulator window is intentionally visible for playing and recording inputs.
try { $process = Start-Process -FilePath "$emulator/EmuHawk.exe" -ArgumentList $arguments -WorkingDirectory $emulator -RedirectStandardOutput "$PSScriptRoot/session/emulator.log" -RedirectStandardError "$PSScriptRoot/session/emulator-error.log" -PassThru }
catch { if (!$server.HasExited) { $server.Kill() }; throw }
@{ emulatorPid=$process.Id; serverPid=$server.Id; inspector="http://127.0.0.1:$Port"; rom=$Rom } | ConvertTo-Json | Set-Content "$PSScriptRoot/session/last-launch.json"
Write-Output "Inspector: http://127.0.0.1:$Port"
Write-Output "Emulator PID: $($process.Id); server PID: $($server.Id)"
if ($Wait) { try { $process.WaitForExit() } finally { if (!$server.HasExited) { $server.Kill() } } }
