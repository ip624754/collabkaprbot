# STEP590H Handoff Notes

- Canonical baseline: production-accepted STEP590G3 commit `7331fcb4403618e4f99cd70b98b1cf955ab67982`, package `1.3.36`.
- Current source result: package `1.3.37`.
- `admin.html` still exposes one public module entry `/scripts/admin-web.js`.
- `scripts/admin-web.js` keeps shared helpers, auth, routing, render orchestration and bindings; six bounded modules own Overview, Users, Payments, Communications, Founder and Runtime views/state.
- Exact moved-source SHA parity is recorded in `docs/architecture/STEP590H_ADMIN_WEB_MODULE_MANIFEST.json`.
- Existing admin-web source contracts now read the aggregate entry/module source through `scripts/lib/admin-web-source-reader.js`.
- No backend API, SQL, migration, ENV, Telegram, auth-policy, CSS or Vercel function change.
- QA: H 154 PASS; real ESM graph PASS; 57 admin contracts PASS; G3/G2/G1/F regressions PASS; critical spine 6/6 and source preflight PASS; PATCH/HOTFIX/FULL exact parity PASS.
- Operator gates: clean npm install/audit, commit/push, Vercel Ready, production login and all-section desktop/mobile browser acceptance.
- Do not begin STEP590I until STEP590H production/browser acceptance.
