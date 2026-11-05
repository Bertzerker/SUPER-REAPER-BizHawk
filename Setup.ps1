param([string]$Archive,[string]$SourceArchive,[switch]$WithSource,[switch]$VerifyOnly)
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'Run Setup.ps1 with PowerShell 7 or later.' }
$repo = $PSScriptRoot
$snes = Join-Path $repo 'snes'
$manifest = Get-Content -LiteralPath (Join-Path $repo 'dist/manifest.json') -Raw | ConvertFrom-Json
foreach ($asset in $manifest.assets) {
 $assetPath = Join-Path $repo $asset.path
 if (!(Test-Path -LiteralPath $assetPath)) { throw "Missing bundled asset: $($asset.path)" }
 if ((Get-Item -LiteralPath $assetPath).Length -ne $asset.bytes -or (Get-FileHash -LiteralPath $assetPath -Algorithm SHA256).Hash -ne $asset.sha256) { throw "Bundled asset failed verification: $($asset.path)" }
}
function Assert-Archive([string]$Path,[string]$Hash) {
 if ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -ne $Hash) { throw "Archive hash mismatch: $Path" }
}
$releaseHash = 'DD7CBD5E205B09C5BCE6AFABC4F8AA525ACC0BBEB9753B198A8DB3FE6A5E5717'
$sourceHash = '61A6DAD84C64913E06CC9423920030E55547DA7ED7695B4185FD8C59C5A93E76'
if ($Archive) { Assert-Archive $Archive $releaseHash }
if ($SourceArchive) { Assert-Archive $SourceArchive $sourceHash }
if ($VerifyOnly) { Write-Output 'Bundled assets and supplied archives verified. Nothing installed.'; return }
if (@(Get-Process -Name EmuHawk -ErrorAction SilentlyContinue).Count) { throw 'Close BizHawk before installing or replacing the REA tool/core. Only one instance is supported.' }
$cache = Join-Path $repo '.downloads'
New-Item -ItemType Directory -Force -Path $cache | Out-Null
if (!$Archive) {
 $Archive = Join-Path $cache 'BizHawk-2.11.1-win-x64.zip'
 if (!(Test-Path -LiteralPath $Archive)) { Invoke-WebRequest -Uri 'https://github.com/TASEmulators/BizHawk/releases/download/2.11.1/BizHawk-2.11.1-win-x64.zip' -OutFile $Archive }
 Assert-Archive $Archive $releaseHash
}
$emulator = Join-Path $snes 'emulator'
if (!(Test-Path -LiteralPath (Join-Path $emulator 'EmuHawk.exe'))) {
 if ((Test-Path -LiteralPath $emulator) -and @(Get-ChildItem -LiteralPath $emulator -Force).Count) { throw 'The emulator destination contains a partial/unknown installation. Use a fresh checkout or repair it before setup.' }
 Expand-Archive -LiteralPath $Archive -DestinationPath $emulator
}
if ([System.Diagnostics.FileVersionInfo]::GetVersionInfo((Join-Path $emulator 'EmuHawk.exe')).ProductVersion -notlike '*2.11.1*') { throw 'Existing emulator is not the pinned BizHawk 2.11.1 release.' }
$stock = Join-Path $snes 'rea/native/stock-bsnes.wbx.zst'
if (!(Test-Path -LiteralPath $stock)) { Copy-Item -LiteralPath (Join-Path $emulator 'dll/bsnes.wbx.zst') -Destination $stock }
$external = Join-Path $emulator 'ExternalTools'
New-Item -ItemType Directory -Force -Path $external | Out-Null
Copy-Item -LiteralPath (Join-Path $repo 'dist/REA.SNES.dll') -Destination (Join-Path $external 'REA.SNES.dll')
Copy-Item -LiteralPath (Join-Path $repo 'dist/bsnes-rea.wbx.zst') -Destination (Join-Path $emulator 'dll/bsnes.wbx.zst')
Copy-Item -LiteralPath (Join-Path $repo 'dist/bsnes-rea.wbx.zst') -Destination (Join-Path $snes 'rea/native/bsnes-rea.wbx.zst')
New-Item -ItemType Directory -Force -Path (Join-Path $snes 'roms') | Out-Null
if ($WithSource) {
 if (!$SourceArchive) {
  $SourceArchive = Join-Path $cache 'BizHawk-2.11.1-source.zip'
  if (!(Test-Path -LiteralPath $SourceArchive)) { Invoke-WebRequest -Uri 'https://github.com/TASEmulators/BizHawk/archive/refs/tags/2.11.1.zip' -OutFile $SourceArchive }
  Assert-Archive $SourceArchive $sourceHash
 }
 if (!(Test-Path -LiteralPath (Join-Path $snes 'upstream/BizHawk-2.11.1'))) { Expand-Archive -LiteralPath $SourceArchive -DestinationPath (Join-Path $snes 'upstream') }
}
Write-Output 'SUPER REAPER - BizHawk installed locally. No emulator was launched.'
Write-Output './snes/rea/Start-REA.ps1 -Rom "C:/path/to/game.sfc" -Wait'

