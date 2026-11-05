function Get-ReaPython {
 $candidate = $env:REA_PYTHON
 if (!$candidate) {
  $command = Get-Command -Name python.exe -ErrorAction SilentlyContinue
  if ($command -and $command.Source -notmatch 'WindowsApps') { $candidate = $command.Source }
 }
 if (!$candidate -or $candidate -match 'WindowsApps' -or !(Test-Path -LiteralPath $candidate -PathType Leaf)) { throw 'Set REA_PYTHON to the absolute path of an installed Python 3 interpreter. Windows Store aliases are not supported.' }
 return (Resolve-Path -LiteralPath $candidate).Path
}

