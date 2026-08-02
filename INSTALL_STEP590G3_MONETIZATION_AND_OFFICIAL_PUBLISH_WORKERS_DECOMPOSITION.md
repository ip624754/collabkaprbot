# INSTALL STEP590G3 — Monetization and Official Publish Workers Decomposition

## Baseline

- commit: `e88ad931bf49c5bb9ebd55d134411d8aaf3a2e9a`
- package: `1.3.35`
- STEP590G2: production accepted

## Result

Package `1.3.36`. The four existing QStash API files remain at the same URLs as thin compatibility handlers. Existing worker bodies are moved to bounded modules under `src/jobs/` without product-semantic changes.

## Apply

Use exactly one method: HOTFIX overlay or `git apply STEP590G3.patch`.

## Required QA

```powershell
npm.cmd ci
npm.cmd audit
npm.cmd run test:qstash-monetization-official-publish-worker-decomposition
npm.cmd run smoke:qstash-monetization-official-publish-compatibility-handlers-contract
npm.cmd run smoke:qstash-monetization-official-publish-esm-linkage-contract
npm.cmd run smoke:runtime-proof-spine
npm.cmd run test:critical-spine
npm.cmd run preflight:source
npm.cmd run check:function-budget
git diff --check
```

## Commit

```powershell
git add -A
git commit -m "refactor: decompose monetization and official publish workers"
git push origin main
```

## Production gates

1. All four unsigned endpoints return `401 signature_missing`.
2. Signed `/api/qstash/ping` canary reaches `DELIVERED / 200`.
3. Signed monetization payload with an unknown action reaches `DELIVERED / 200` and returns/skips `unknown_action` without payment or Telegram mutation.
4. Do not execute a live official publish delivery canary with a real offer solely for architecture acceptance.
