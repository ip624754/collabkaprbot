# STEP504 QA checklist

## Confirmed
- [x] `node --check scripts/admin-web.js`
- [x] `node --check src/lib/adminWeb/runtime.js`
- [x] `npm run smoke:admin-web-runtime-contract`
- [x] `npm run smoke:admin-web-shell-contract`
- [x] `npm run check:function-budget` -> 11 deployable API entrypoints
- [x] Runtime page remains read-only / hobby-safe (one primary read, no polling, no writes)
- [x] Runtime summary normalizes states into `ok / degraded / missing / unknown`
- [x] Config presence matrix exposes only safe presence/status, not secret values
- [x] Stale split admin-web routes removed again from `api/`

## Not live-verified here
- [ ] Browser walkthrough on deployed `/admin/runtime`
- [ ] Production env-specific warning/hint combinations
- [ ] Live Redis/DB/QStash degraded-path screenshots
