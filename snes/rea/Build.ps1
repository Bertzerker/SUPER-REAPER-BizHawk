$ErrorActionPreference = 'Stop'
if (@(Get-Process EmuHawk -ErrorAction SilentlyContinue).Count) { throw 'Close BizHawk before rebuilding its loaded inspection tool.' }
$root = Split-Path $PSScriptRoot
$emulator = Join-Path $root 'emulator'
$sdk = (& dotnet --list-sdks | Select-Object -Last 1).Split(' ')[0]
$compiler = "C:/Program Files/dotnet/sdk/$sdk/Roslyn/bincore/csc.dll"
$framework = 'C:/Program Files (x86)/Reference Assemblies/Microsoft/Framework/.NETFramework/v4.8'
$refs = @('mscorlib','System','System.Core','System.Drawing','System.Windows.Forms') | ForEach-Object { "/reference:$framework/$_.dll" }
$refs += "/reference:$framework/Facades/netstandard.dll"
$refs += @('BizHawk.Client.Common','BizHawk.Common','BizHawk.Emulation.Common','BizHawk.Emulation.Cores','BizHawk.WinForms.Controls','BizHawk.Bizware.Graphics','Newtonsoft.Json') | ForEach-Object { "/reference:$emulator/dll/$_.dll" }
$refs += "/reference:$emulator/EmuHawk.exe"
$sources = @(Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.cs' | ForEach-Object FullName)
& dotnet $compiler /nologo /target:library /unsafe /langversion:latest /optimize+ "/out:$emulator/ExternalTools/REA.SNES.dll" @refs @sources
if ($LASTEXITCODE -ne 0) { throw 'REA SNES tool compilation failed' }
