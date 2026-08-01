# STEP590C4 — Broadcast Callback Domain Rollout Runbook

## Preconditions

- apply only to the exact STEP590C3 baseline or use the STEP590C4 FULL package;
- no SQL or ENV change belongs to this STEP;
- preserve current broadcast jobs, recipient logs, delivery receipts and audit evidence;
- do not send a real broadcast merely to test callback routing;
- do not pause, resume, stop or toggle QStash fanout on a live operation unless explicitly approved.

## Apply from Downloads

```powershell
$ErrorActionPreference = "Stop"

$zip = "C:\Users\lukma\Downloads\collabkaprbot_STEP590C4_BROADCAST_DOMAIN_EXTRACTION_HOTFIX.zip"
$project = "C:\GitHub\collabkaprbot"
$temp = Join-Path $env:TEMP "COLLABKA_STEP590C4_HOTFIX"

Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $temp -Force | Out-Null
Expand-Archive -LiteralPath $zip -DestinationPath $temp -Force

$installer = Get-ChildItem -LiteralPath $temp -Filter "APPLY_STEP590C4.ps1" -File -Recurse |
  Select-Object -First 1

if (-not $installer) { throw "APPLY_STEP590C4.ps1 not found" }

powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File $installer.FullName `
  -ProjectRoot $project

if ($LASTEXITCODE -ne 0) { throw "STEP590C4 installer failed: $LASTEXITCODE" }
Remove-Item -LiteralPath $temp -Recurse -Force
```

## Local gate

```powershell
cd C:\GitHub\collabkaprbot

npm.cmd ci
npm.cmd run test:broadcast-domain-extraction
npm.cmd run smoke:broadcast-domain-extraction-contract
npm.cmd run callbacks:ownership
npm.cmd run callbacks:check
npm.cmd run actions:check
npm.cmd run test:broadcast-delivery-unknown-critical
npm.cmd run test:critical-spine
npm.cmd run preflight:source
```

Expected minimum:

```text
Broadcast domain:             161 PASS
Callback ownership:          2440 PASS
Extracted executable owners:   57
Legacy owners:                503
Unresolved callbacks:           0
Critical spine:               6/6 PASS
```

## Bounded production canary

Safe checks:

1. Open Communications and start the simple composer.
2. Enter or reuse non-sensitive test text.
3. Open media and button pickers, then return without creating a recipient send.
4. Select an audience and verify the remembered selection.
5. Send preview only to the operator.
6. Open the send-confirmation screen and press Cancel.
7. Open the broadcast list and one existing broadcast card.
8. Open its blocked/diagnostic report if available.
9. Leave active broadcast statuses and `broadcast_qstash_fanout` unchanged.

A real `a:bc_confirm` canary requires an explicitly approved disposable/test audience and deliberate delivery observation. It is not part of the default routing canary.

## Log acceptance

Must not appear:

```text
unknown_callback
callback_dispatch.missing_handler
callback_dispatch.phase_not_reached
callback_dispatch.extracted_handler_contract
broadcast_domain.missing_dependency
broadcast_domain.unreachable_composer_action
broadcast_domain.unreachable_audience_action
broadcast_domain.unreachable_dispatch_action
broadcast_domain.unreachable_operations_action
[ADMIN] broadcast confirm error
```

Expected tested callbacks complete with `update.ok` and webhook HTTP 200.

## Rollback

No schema or ENV rollback is needed. Code rollback to STEP590C3 is possible. Before rollback, preserve broadcast records, recipient logs, delivery receipts, QStash/cron evidence and Vercel logs. Never blindly resend a delivery with an unknown outcome as part of rollback.
