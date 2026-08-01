# STEP590E3B QA Checklist

## Source and ownership

- [x] 18 profile actions owned by `workspace_profile`
- [x] 9 Instagram/share actions owned by `workspace_social`
- [x] 27 moved branches absent from legacy `bot.js`
- [x] 560/560 actions registered
- [x] 275 extracted / 285 legacy / 7 aliases / 0 unresolved
- [x] `a:ws_pro_buy` remains payment-owned
- [x] `a:wsp_lead_new` remains lead-owned
- [x] STEP590E3C public/directory actions remain outside scope

## Focused QA verified

- [x] Workspace profile/social tests: 166 assertions PASS
- [x] Workspace control/folders tests: 224 assertions PASS
- [x] Callback ownership/reachability: 2,762 assertions PASS
- [x] Payment, giveaway, applications/leads and Barter regressions PASS
- [x] Copy-safety taxonomy contract PASS after multi-module source adaptation
- [x] Package-lock consistency PASS
- [x] 338/338 JavaScript syntax checks PASS
- [x] PATCH/HOTFIX/FULL parity PASS

## Environment/operator gate

- [ ] `npm ci` in operator repository
- [ ] `npm audit` reports zero unacceptable vulnerabilities
- [ ] `npm run preflight:source` completes
- [ ] `npm run test:critical-spine` reports 6/6 PASS
- [ ] Git HEAD/origin/worktree identity confirmed
- [ ] Exact Vercel deployment Ready
- [ ] Bounded profile/contacts/share/Instagram Telegram smoke PASS

## Truth boundary

Implementation-environment `npm ci` is blocked by a package-mirror 404 for `xtend@4.0.2`. Source preflight and portable spine stop only on missing `dotenv` after all dependency-free STEP590E3B gates pass.
