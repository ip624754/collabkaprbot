# STEP590E3C QA Checklist

## Artifact/application

- [ ] Applied on exact STEP590E3B_R2 baseline
- [ ] No unexpected deleted files
- [ ] Package version is `1.3.23`
- [ ] `git diff --check` PASS

## Dependency and registry gates

- [ ] `npm.cmd ci` PASS
- [ ] `npm.cmd audit` reports 0 vulnerabilities or findings are explicitly reviewed
- [ ] `npm.cmd run check:package-lock` PASS
- [ ] Actions registry `560/560`
- [ ] Callback ownership `285 extracted / 275 legacy`
- [ ] Aliases `7`, unresolved `0`

## Domain gates

- [ ] STEP590E3C executable tests PASS
- [ ] STEP590E3C source contract PASS
- [ ] Directory search owns exactly 6 actions
- [ ] Public Workspace owns exactly 4 actions
- [ ] `a:wsp_lead_new` remains lead-owned
- [ ] `a:wsp_contact_unlock` remains `pay / queue_first`
- [ ] No moved direct branches remain in `bot.js`
- [ ] Missing dependencies fail closed

## Financial/contact invariants

- [ ] Owner path never charges
- [ ] Already-unlocked path never charges
- [ ] Queue-first path enqueues once and avoids synchronous debit
- [ ] Successful sync path invokes canonical durable helper once
- [ ] Repeat click does not double-charge
- [ ] Contacts stay hidden before preview/owner/unlock authority
- [ ] Redis/QStash state does not override inconsistent durable DB truth

## Regression gates

- [ ] Workspace E3A PASS
- [ ] Workspace E3B PASS
- [ ] Applications/Leads PASS
- [ ] Barter PASS
- [ ] Payment PASS
- [ ] Giveaway PASS
- [ ] Broadcast PASS
- [ ] Navigation/shared UX PASS
- [ ] Critical spine 6/6 PASS
- [ ] `preflight:source` PASS

## Deployment

- [ ] Commit and origin/main exact parity
- [ ] Vercel Production deployment built from exact commit
- [ ] Deployment `Ready`
- [ ] Bounded read-only directory/public Workspace canary PASS
- [ ] Disposable unlock canary performed only with explicit intent
- [ ] No reject markers or duplicate debit/unlock evidence
