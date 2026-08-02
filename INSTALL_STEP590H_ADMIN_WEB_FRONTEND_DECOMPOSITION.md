# INSTALL — STEP590H Admin Web Frontend Decomposition

## Baseline

- canonical operator commit: `7331fcb4403618e4f99cd70b98b1cf955ab67982`
- package before: `1.3.36`
- package after: `1.3.37`
- STEP590G1/G2/G3: production accepted

## Scope

`admin.html` continues to load one public module entry: `/scripts/admin-web.js`.
The 4,667-line client implementation is decomposed behind that entry into bounded view/state modules:

- `scripts/admin-web/overview.js`
- `scripts/admin-web/users.js`
- `scripts/admin-web/payments.js`
- `scripts/admin-web/comms.js`
- `scripts/admin-web/founder.js`
- `scripts/admin-web/runtime.js`

The entry keeps shared UI/runtime helpers, authentication, routing, rendering orchestration and event binding. No backend API, auth policy, SQL, ENV, Telegram or Vercel function change is included.

## Apply

Apply exactly one artifact: PATCH or HOTFIX ZIP.

```powershell
cd C:\GitHub\collabkaprbot
git status --short
git rev-parse HEAD
git rev-parse origin/main
```

Expected baseline SHA: `7331fcb4403618e4f99cd70b98b1cf955ab67982`.

## Operator QA

```powershell
npm.cmd ci
npm.cmd audit
npm.cmd run test:admin-web-client-decomposition
npm.cmd run smoke:admin-web-client-compatibility-entry-contract
npm.cmd run smoke:admin-web-client-esm-linkage-contract
npm.cmd run test:critical-spine
npm.cmd run preflight:source
npm.cmd run check:function-budget
git diff --check
```

Then open production `/admin` and verify login, Overview, Users, Runtime, Payments, Communications, Help and Founder navigation on desktop and mobile.

## Commit

```powershell
git add -A
git commit -m "refactor: decompose admin web client views"
git push origin main
```

## Rollback

Revert the STEP590H commit or restore commit `7331fcb4403618e4f99cd70b98b1cf955ab67982`. No DB, ENV or backend rollback is required.
