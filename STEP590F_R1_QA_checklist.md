# STEP590F_R1 QA Checklist

- [x] missing internal named export reproduced from production stack trace
- [x] helper exported only from `bartersRepository.js`
- [x] public `queries.js` façade remains 328 exports
- [x] reconstructed moved-body SHA parity PASS
- [x] all repository named imports resolve to actual exports
- [x] real `queries.js` ESM instantiation PASS under execution-only shims
- [x] STEP590F executable test PASS
- [x] STEP590F façade smoke PASS
- [x] JavaScript syntax PASS
- [x] `git diff --check` PASS
- [ ] operator `npm ci` / `npm audit`
- [ ] commit/push
- [ ] Vercel Ready
- [ ] `/api/webhook` recovery
- [ ] web-admin login recovery
