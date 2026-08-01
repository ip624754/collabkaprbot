param([Parameter(Mandatory = $true)][string]$ProjectRoot)
$ErrorActionPreference = 'Stop'
$PatchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path $ProjectRoot).Path
Get-ChildItem -Path $PatchRoot -Recurse -File | ForEach-Object {
  $relative = $_.FullName.Substring($PatchRoot.Length).TrimStart('\','/')
  if ($relative -in @('APPLY_STEP590C1.ps1','DELETE_FILES.txt','README.md')) { return }
  $target = Join-Path $ProjectRoot $relative
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
  Copy-Item -Force $_.FullName $target
}
Get-Content (Join-Path $PatchRoot 'DELETE_FILES.txt') | Where-Object { $_ -and -not $_.StartsWith('#') } | ForEach-Object {
  $target = Join-Path $ProjectRoot $_
  if (Test-Path $target) { Remove-Item -Force $target }
}
Write-Host 'STEP590C1 hotfix applied.'
