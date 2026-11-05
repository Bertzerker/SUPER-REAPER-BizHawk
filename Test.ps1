$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/snes/rea/Python.ps1"
$env:REA_PYTHON = Get-ReaPython
$tests = @(Get-ChildItem -LiteralPath "$PSScriptRoot/snes/rea/test" -Filter '*.test.mjs' | ForEach-Object FullName)
& node --test @tests
if ($LASTEXITCODE) { throw 'SNES regression checks failed.' }

