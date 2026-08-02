# STEP590G1 QA Checklist

## Source and compatibility

- [x] baseline `cron.js` SHA-256 and line count recorded
- [x] baseline `cron_router.js` SHA-256 and line count recorded
- [x] `src/bot/cron.js` reduced to compatibility façade
- [x] 12/12 public exports preserved
- [x] 4/4 router job names preserved
- [x] `api/cron_router.js` byte-identical to baseline
- [x] exact moved declaration-body parity PASS
- [x] package-lock consistency PASS
- [x] package bumped to `1.3.34`

## Critical invariants

- [x] Redis lock names and TTL source parity PASS
- [x] giveaway transaction/advisory-lock source parity PASS
- [x] broadcast cooldown and hard-skip source parity PASS
- [x] retry/failure classification source parity PASS
- [x] duplicate-alert suppression source parity PASS
- [x] no SQL or migration change
- [x] no ENV change
- [x] no API route or function-count change
- [x] no Telegram copy or callback-key change

## Executable QA

- [x] `test:cron-tick-decomposition` PASS — 162 assertions
- [x] `smoke:cron-compatibility-facade-contract` PASS
- [x] `smoke:cron-esm-linkage-contract` PASS — real façade import, 12/12 callable exports
- [x] `test:queries-repository-decomposition` PASS — 263 assertions
- [x] focused cron/giveaway/broadcast/payment/QStash/source contracts PASS
- [x] portable critical spine 6/6 PASS under temporary execution-only dependency shims
- [x] `preflight:source` PASS under temporary execution-only dependency shims
- [x] temporary shims and `node_modules` removed before packaging
- [x] function budget PASS — 11 deployable API entrypoints, unchanged
- [x] `git diff --check` PASS
- [x] PATCH/HOTFIX/FULL exact parity PASS

## Operator/runtime gates

- [ ] clean operator `npm ci`
- [ ] operator `npm audit`
- [ ] commit and push
- [ ] Vercel production deployment Ready
- [ ] bounded production cron-health evidence for all four router jobs
- [ ] live Redis/PostgreSQL/Telegram side-effect canary where safe
