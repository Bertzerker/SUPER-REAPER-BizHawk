param([switch]$Build)
$ErrorActionPreference = 'Stop'
$rea = Split-Path $PSScriptRoot
$snes = Split-Path $rea
if (@(Get-Process EmuHawk -ErrorAction SilentlyContinue).Count) { throw 'Close BizHawk before replacing its native core.' }
if ($Build) {
 . "$rea/Python.ps1"
 & (Get-ReaPython) "$PSScriptRoot/apply_native.py"
 if ($LASTEXITCODE) { throw 'Native patch preparation failed' }
 $workspace = Split-Path $snes
 $linuxWorkspace = (& wsl -d Ubuntu -- wslpath -a $workspace).Trim()
 & wsl -d Ubuntu -- bash "$linuxWorkspace/snes/rea/native/prepare-build.sh" $linuxWorkspace
 if ($LASTEXITCODE) { throw 'Native toolchain preparation failed' }
 & wsl -d Ubuntu -- bash "$linuxWorkspace/snes/rea/native/build-core.sh" $linuxWorkspace
 if ($LASTEXITCODE) { throw 'Native core build failed' }
}
$built = Join-Path $PSScriptRoot 'bsnes-rea.wbx.zst'
if (!(Test-Path $built)) { throw 'Build the native core first.' }
$installed = Join-Path $snes 'emulator/dll/bsnes.wbx.zst'
$stock = Join-Path $PSScriptRoot 'stock-bsnes.wbx.zst'
if (!(Test-Path $stock)) { Copy-Item -LiteralPath $installed -Destination $stock }
Copy-Item -LiteralPath $built -Destination $installed
@{ core='BSNESv115+'; base='BizHawk 2.11.1'; captureInterface=1; sha256=(Get-FileHash $installed -Algorithm SHA256).Hash; stockSha256=(Get-FileHash $stock -Algorithm SHA256).Hash } | ConvertTo-Json | Set-Content "$PSScriptRoot/installed-core.json"
Get-Content "$PSScriptRoot/installed-core.json"
