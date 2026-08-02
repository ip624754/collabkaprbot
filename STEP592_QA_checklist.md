# STEP592 QA Checklist

## Source and model

- [x] Cohort state is bounded to 50 members.
- [x] Mutations use a token-owned Redis lock.
- [x] Mutation read fails closed; storage failure cannot overwrite state with an empty fallback.
- [x] Read model exposes Redis and active-offer evidence availability.
- [x] Only creators can become cohort members.
- [x] Candidate discovery requires a connected channel.
- [x] Launch readiness requires creator, channel, three review flags, no blocker and manual ready state.
- [x] Active offers count only `status=ACTIVE`.
- [x] Offer evidence failure blocks exit readiness.
- [x] Canary PASS has a timestamp and expires from readiness after 14 days.
- [x] Next-review date must be in the future.
- [x] Writes are founder-only and audited.
- [x] No direct `fetch()` exists inside the bounded Users view module.

## Regression

- [x] STEP591 rebaseline contracts.
- [x] STEP590I architecture gates and mutation tests.
- [x] STEP590H admin-web decomposition and real ESM graph.
- [x] STEP590G1/G2/G3 and STEP590F decomposition suites.
- [x] Critical spine 6/6.
- [x] Full `preflight:source`.
- [x] Function budget 11/12.
- [x] `git diff --check`.

## Operator-only

- [ ] Clean `npm ci` and `npm audit` on the canonical workstation.
- [ ] Commit/push and Vercel Ready.
- [ ] Health `200 / ready / GO`.
- [ ] Founder Users workspace desktop/mobile render.
- [ ] Config save survives refresh.
- [ ] Candidate add/remove canary survives refresh and has no side effects.
- [ ] Actual product exit: 10 launch-ready creators, 5 ACTIVE offers, zero blockers, fresh canary, owner and future review.
