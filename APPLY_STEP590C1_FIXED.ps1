param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRoot
)

$ErrorActionPreference = 'Stop'

function Get-NormalizedPath {
  param([Parameter(Mandatory = $true)][string]$Path)
  return [System.IO.Path]::GetFullPath($Path).TrimEnd('\', '/')
}

$PatchRoot = Get-NormalizedPath (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ProjectRoot = Get-NormalizedPath ((Resolve-Path $ProjectRoot).Path)

$requiredPayload = @(
  'src\bot\domains\adminAuth\actions.js',
  'src\bot\domains\adminAuth\callbacks.js',
  'src\bot\domains\adminAuth\index.js',
  'src\bot\domains\adminAuth\policy.js',
  'src\bot\domains\adminAuth\route.js',
  'src\bot\domains\adminAuth\service.js',
  'src\bot\domains\adminAuth\views.js',
  'src\bot\router\callbackContracts.js',
  'src\bot\router\callbackOwnership.js',
  'src\bot\router\callbackRouter.js'
)

$pathsEqual = [System.StringComparer]::OrdinalIgnoreCase.Equals($PatchRoot, $ProjectRoot)

if ($pathsEqual) {
  Write-Host 'STEP590C1 payload is already inside ProjectRoot; self-copy is skipped.'

  $missing = @(
    $requiredPayload | Where-Object {
      -not (Test-Path -LiteralPath (Join-Path $ProjectRoot $_) -PathType Leaf)
    }
  )

  if ($missing.Count -gt 0) {
    throw "HOTFIX payload is incomplete in ProjectRoot. Missing: $($missing -join ', '). Re-extract the HOTFIX into a separate directory and run the installer from there."
  }
}
else {
  Get-ChildItem -LiteralPath $PatchRoot -Recurse -File | ForEach-Object {
    $relative = $_.FullName.Substring($PatchRoot.Length).TrimStart('\', '/')

    if ($relative -in @(
      'APPLY_STEP590C1.ps1',
      'APPLY_STEP590C1_FIXED.ps1',
      'DELETE_FILES.txt',
      'README.md'
    )) {
      return
    }

    $target = Join-Path $ProjectRoot $relative
    $sourceFull = Get-NormalizedPath $_.FullName
    $targetFull = Get-NormalizedPath $target

    if ([System.StringComparer]::OrdinalIgnoreCase.Equals($sourceFull, $targetFull)) {
      return
    }

    $targetParent = Split-Path -Parent $target
    if ($targetParent) {
      New-Item -ItemType Directory -Force -Path $targetParent | Out-Null
    }

    Copy-Item -LiteralPath $_.FullName -Destination $target -Force
  }
}

$deleteManifest = Join-Path $PatchRoot 'DELETE_FILES.txt'
if (-not (Test-Path -LiteralPath $deleteManifest -PathType Leaf)) {
  throw "DELETE_FILES.txt is missing from HOTFIX root: $PatchRoot"
}

Get-Content -LiteralPath $deleteManifest |
  Where-Object { $_ -and -not $_.StartsWith('#') } |
  ForEach-Object {
    $target = Join-Path $ProjectRoot $_
    if (Test-Path -LiteralPath $target) {
      Remove-Item -LiteralPath $target -Force
      Write-Host "Deleted legacy file: $_"
    }
  }

Write-Host 'STEP590C1 hotfix applied successfully.'
