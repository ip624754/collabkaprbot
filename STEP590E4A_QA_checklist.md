# STEP590E4A QA Checklist

## Artifact/application

- [ ] Applied on exact STEP590E3C commit `858a0b1` or byte-equivalent baseline
- [ ] No unexpected deleted files
- [ ] Package version is `1.3.24`
- [ ] `git diff --check` PASS

## Dependency and registry gates

- [ ] `npm.cmd ci` PASS
- [ ] `npm.cmd audit` reviewed
- [ ] package-lock consistency PASS
- [ ] Registry `560/560`
- [ ] Ownership `323 extracted / 237 legacy`
- [ ] Aliases `7`, unresolved `0`

## Domain gates

- [ ] STEP590E4A executable tests PASS
- [ ] STEP590E4A source contract PASS
- [ ] Brand directory owns exactly 10 actions
- [ ] Brand profile owns exactly 28 actions
- [ ] No moved branch remains in `bot.js`
- [ ] Missing dependencies fail closed
- [ ] Creator application local Brand return remains exact

## Exclusion/invariant gates

- [ ] `a:brand_buy` remains payment-owned
- [ ] `a:brand_plan_buy` remains payment-owned
- [ ] Brand applications/deals retain STEP590E1 owners
- [ ] Brand team actions remain legacy for STEP590E4B
- [ ] Curator actions remain legacy for STEP590E4C
- [ ] Directory filters retain state/limits
- [ ] Public Brand card has no contact leak
- [ ] Profile reset remains confirm-first and singular
- [ ] Brand Pass/Plan screens do not mutate prices or fulfillment

## Regression gates

- [ ] STEP590E3A/B/C PASS
- [ ] Applications/Leads PASS
- [ ] Barter PASS
- [ ] Payment PASS
- [ ] Giveaway PASS
- [ ] Broadcast PASS
- [ ] Navigation/shared UX PASS
- [ ] Critical spine 6/6 PASS
- [ ] `preflight:source` PASS

## Deployment

- [ ] Commit equals origin/main
- [ ] Vercel Production built from exact commit
- [ ] Deployment `Ready`
- [ ] Bounded read-only Brand directory/profile canary PASS
- [ ] Disposable profile mutation only with explicit operator intent
- [ ] No reject markers, duplicate writes or payment interception
