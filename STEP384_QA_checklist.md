# STEP384 QA Checklist

## Scope
- Add preflight guardrail for Vercel Hobby function budget.
- Do not change business logic, DB schema, payments, unlock, broadcast delivery logic, or hot UI DB paths.

## Code checks run
- `node scripts/check-function-budget.js` ✅
- `node scripts/check-package-lock.js` ✅
- `node --check scripts/check-function-budget.js` ✅
- `node --check scripts/preflight.js` ✅
- `node scripts/actions-registry-check.js` ✅

## Observed function budget on baseline
- Current deployable `api/*` entrypoints: **8**
- Listed by script:
  - `api/cron_router.js`
  - `api/health.js`
  - `api/qstash/broadcast-deliver.js`
  - `api/qstash/monetization-retry.js`
  - `api/qstash/official-publish-deliver.js`
  - `api/qstash/official-publish-verify.js`
  - `api/qstash/ping.js`
  - `api/webhook.js`
- Default budget thresholds:
  - warning: `>=9`
  - fail: `>=11`

## Preflight
- `npm run preflight` reaches the new function-budget gate and passes it. ✅
- In this sandbox it then stops at smoke stage because runtime dependency install is unavailable here (`ERR_MODULE_NOT_FOUND: @upstash/redis`).
- This is an environment limitation of the sandbox, not a syntax/regression signal from STEP384.

## Manual prod checks after deploy
- `npm run check:function-budget`
- `npm run preflight`
- Confirm `api/*` surface still below Hobby budget.
- Confirm parked/disabled routes are not restored under `api/`.
- Verify `/api/health` remains `system_status: GO`.
