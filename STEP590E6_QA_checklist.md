# STEP590E6 QA Checklist

- [x] 18 exact live callbacks have one `userServices` owner.
- [x] Ownership is 482 extracted / 78 legacy / 7 aliases / 0 unresolved.
- [x] `a:notice` and `a:founder` remain outside the user-services domain.
- [x] Deleted-user gate remains before post-user dispatch.
- [x] Support expect-text and copy-safety recovery contracts remain canonical.
- [x] Verification feature/role/profile gates remain canonical.
- [x] Sharing/reward DB truth and redemption validation remain canonical.
- [x] Account tombstone/restore and four-key Redis cleanup remain canonical.
- [x] STEP590E6 executable tests PASS.
- [x] Router ownership/reachability PASS.
- [x] Previous domain regression matrix PASS.
- [x] `preflight:source` PASS under temporary execution-only dependency shims.
- [x] Portable critical spine 6/6 PASS.
- [x] No `node_modules` or temporary shims in final artifacts.
- [ ] Operator clean `npm.cmd ci` and `npm.cmd audit`.
- [ ] Operator Git commit/push and Vercel Ready.
- [ ] Bounded Telegram support/verification/share/account smoke.
