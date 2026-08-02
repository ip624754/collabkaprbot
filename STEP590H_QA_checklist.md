# STEP590H QA Checklist

## Source architecture

- [x] `admin.html` keeps one public module entry URL.
- [x] `scripts/admin-web.js` remains the compatibility entry and orchestration surface.
- [x] Overview, Users, Payments, Communications, Founder and Runtime implementations moved to bounded modules.
- [x] Exact moved-source SHA parity is executable through the STEP590H manifest.
- [x] Shared dependency surface is explicit per module.
- [x] CSS remains unchanged.
- [x] Backend API URLs, auth policy, routes and write semantics remain unchanged.

## Executed QA

- [x] STEP590H decomposition: 154 assertions PASS.
- [x] Compatibility entry contract PASS.
- [x] Real ESM graph with login-shell render PASS.
- [x] Existing admin-web source contracts: 57 PASS.
- [x] STEP590G3 regression: 99 assertions PASS.
- [x] STEP590G2 regression: 108 assertions PASS.
- [x] STEP590G1 regression: 162 assertions PASS.
- [x] STEP590F repository regression: 278 assertions PASS.
- [x] Portable critical spine: 6/6 PASS.
- [x] `preflight:source` PASS.
- [x] Function budget: 11, unchanged.
- [x] Package-lock parity PASS.
- [x] `git diff --check` PASS.
- [x] PATCH/HOTFIX/FULL exact tree parity PASS (1,081 files).

## Not verified in artifact environment

- [ ] Clean `npm ci` — blocked by internal mirror 404 for `xtend@4.0.2`.
- [ ] `npm audit` after clean operator install.
- [ ] Real browser acceptance against deployed static module files.
- [ ] Vercel deployment Ready and production `/admin` acceptance.
- [ ] Desktop/mobile visual regression evidence.
