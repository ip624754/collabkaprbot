# STEP586D — Invite Center Language and Mechanism Honesty Report

**Date:** 2026-07-18  
**Status:** IMPLEMENTED / LOCAL QA  
**Mode:** HEAVY  
**Baseline:** STEP586C FULL  
**Next STEP:** STEP586E — Monetization and Paid Product Clarity

## 1. Outcome

STEP586D gives the ordinary-user invite surface one Russian product language and makes every incentive claim derive from the same constants used by the reward ledger.

Canonical user terms:

- `Приглашения` — the module;
- `приглашён` — a new user completed the first bot start through the link and attribution was stored;
- `активирован` — the invited user completed the main brand or channel profile;
- `в ожидании` — earned points are inside the confirmation window and are not spendable;
- `доступно` — confirmed earned points minus used points;
- `использовано` — points already spent on a reward.

Callbacks, thresholds, ledger schema, attribution rules and redeem mechanics remain unchanged.

## 2. Source-confirmed mismatch fixed

The old points explanation stated that points were awarded only for activation. Runtime source did not work that way.

The actual mechanism was and remains:

- first eligible bot start through the invite link: `+2` points, pending for `24` hours;
- completed main profile: additional `+10` points, pending for `48` hours;
- `100` available points: `7 days PRO`;
- `250` available points: `30 days PRO`.

This was a P1 trust defect in copy. A user could not infer why a two-point pending entry existed or when it would become spendable.

STEP586D exports immutable `INVITE_REWARD_PUBLIC_RULES` and `INVITE_REWARD_CATALOG` from `src/db/queries.js`. Both the DB backfill code and Telegram copy now read the same source-of-truth objects. No numeric value changed.

## 3. User-facing changes

### 3.1 Invite center

The active user surface now uses:

- `📨 Приглашения`;
- `📊 Статистика приглашений`;
- `📄 История приглашений`;
- `💎 Баллы за приглашения`;
- `🎁 Награды за приглашения`;
- `🧾 Карточка приглашения`;
- `Код приглашения`.

Old user-facing `Инвайты`, `pts`, `join`, `completed profile`, `invite ledger`, `Pro-target`, mixed `days Pro` and `Обменяно` wording was removed from the bounded ordinary-user invite surface.

Admin/operator invite diagnostics are intentionally deferred to STEP586G. Their internal shorthand remains available for operational density.

### 3.2 Eligibility and exclusions

The UI now states what is counted:

- the first bot start by a new user through the invite link;
- completion of the main brand or channel profile.

It also states what is not counted:

- opening the link without starting the bot;
- self-referral;
- an account that already existed before the invite transition;
- an incomplete profile for the activation reward.

The copy also states that one invited user can generate each earn reward only once.

### 3.3 Balance semantics

Every invite balance screen separates:

- `В ожидании` — not spendable;
- `Доступно` — spendable now;
- `Использовано` — already spent.

The reward center states that points cannot be withdrawn as money or transferred to another user.

### 3.4 History

History entries now show:

- the event that created the points;
- the point amount;
- the user-readable status;
- the applicable confirmation window for pending entries;
- the reward consumed by a redeem entry.

### 3.5 Redeem confirmation and result

Before confirmation the user sees:

- reward duration;
- exact point cost;
- available balance;
- remaining balance;
- pending balance exclusion;
- the current target-selection rule;
- the irreversible-action warning.

After success the user sees the actual target returned by the storage layer and the new balances.

## 4. Mechanism and abuse-path review

Preserved source controls:

- self-referral rejection;
- existing-user exclusion;
- one attribution per invited user;
- unique earn ledger entries;
- confirmation windows before spendability;
- available balance computed from confirmed earn minus redeemed entries;
- advisory transaction lock during redeem;
- reward target resolved inside the transaction;
- ledger record for every redeem.

No new client-supplied amount, duration, target or balance input was introduced.

## 5. Source enforcement

Added:

```bash
npm run smoke:invite-language-mechanism-honesty-contract
```

The guard checks:

- canonical public terminology;
- absence of stale mixed-language terms inside the user invite block;
- exact `2 / 24h` and `10 / 48h` rules;
- exact `100 / 7d` and `250 / 30d` catalog;
- shared DB/UI source-of-truth constants;
- self/existing-user and duplicate protections;
- pending/available/used boundaries;
- redeem cost, remaining balance and actual target copy;
- unchanged callback identities and ledger enum contract.

The command is included in `preflight:source`.

Existing invite copy contracts were updated only where they asserted the superseded public language.

## 6. Preserved invariants

STEP586D does not change:

- callback IDs or destinations;
- invite URL and attribution format;
- activation eligibility logic;
- point amounts or confirmation windows;
- reward costs or durations;
- available-balance formula;
- ledger schema or migration;
- redeem target-selection order;
- anti-abuse locks and uniqueness rules;
- payments, applications, deals or other product flows.

## 7. Truth Boundary

### Verified locally

- dedicated STEP586D source contract: PASS;
- all invite smoke scripts: PASS;
- home and first-role invite entrypoint contracts: PASS;
- callback consistency: 553 refs, 0 unresolved;
- dependency/runtime preflight: PASS;
- runtime proof spine and staging-acceptance source contract: PASS;
- STEP586A–C regression contracts: PASS;
- complete parallel syntax sweep: 219 JavaScript files PASS;
- package-lock consistency: PASS;
- dependency audit: 0 vulnerabilities;
- unchanged migration reward/status enum contract: PASS.

The canonical serial `npm run preflight:source` passed every assertion, registry and generator gate, including STEP586D. It then exceeded the execution limit during its long sequential `node --check` sweep and did not print the final PASS line. The complete JavaScript surface and residual optional invariants were executed separately and passed.

### Not verified

- live Telegram rendering and mobile wrapping;
- real invite creation against production data;
- 24-hour and 48-hour passage in production;
- live Neon ledger convergence;
- live reward redemption;
- real-user comprehension;
- remote STEP584 staging evidence.

Source checks prove the implementation contract, not live platform behavior.

## 8. Decision

STEP586D is bounded and ready for browser application after the attached QA pack is reviewed.

The next scoped implementation is:

> **STEP586E — Monetization and Paid Product Clarity**

Do not mix admin vocabulary cleanup or payment mechanism changes into STEP586E.
