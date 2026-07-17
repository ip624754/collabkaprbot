# AI Multi-Model Handoff — Current Collabka Truth

**Current baseline:** STEP586D — Invite Center Language and Mechanism Honesty  
**Parent:** STEP586C — Applications, Dialogs and Deals Lifecycle  
**Live status:** not reverified in STEP586D

## Verified now

- ordinary-user module is `Приглашения`; user invite screens no longer expose `pts`, `join`, ledger or mixed English reward terms;
- persisted event meanings are explicit: first eligible bot start creates invitation attribution; main profile completion creates activation;
- shared source-of-truth exports define `+2 / 24h`, `+10 / 48h`, `100 / 7d` and `250 / 30d`;
- DB backfill logic and Telegram copy consume the same constants; no economic value changed;
- pending points are not spendable; available and used balances are distinct;
- exclusion, uniqueness and redeem-lock controls remain in storage code;
- redeem confirmation shows cost and remaining balance; success shows the actual target;
- dedicated and targeted invite source contracts pass locally.

## Trust finding resolved

Old copy said points were awarded only for activation. Runtime also awards two points for the first eligible start. STEP586D removes the contradiction and prevents future amount/window drift through a shared rule catalog plus source smoke.

## Not verified

- live Telegram invite traversal and wrapping;
- production 24h/48h confirmation timing;
- live Neon reward convergence and redemption;
- remote STEP584 staging evidence;
- real-user comprehension.

## Immediate next STEP

`STEP586E_MONETIZATION_AND_PAID_PRODUCT_CLARITY`

Keep provider, prices, callbacks, entitlement logic, ledgers and exactly-once boundaries unchanged. Align visible product names and claims with source truth.

## Do not do yet

- admin/operator vocabulary migration (STEP586G);
- callback renaming;
- reward or payment mechanic changes hidden inside copy;
- broad `bot.js` rewrite;
- claim live-green from source checks.

## Working lenses

- Jobs: one clear outcome, no UX debris.
- Vitalik: mechanism truth and auditable evidence.
- Woz: smallest reliable engineering surface.
- Durov: Telegram-native speed and leverage.
- Toly: ship under real constraints.
- Armani: coherent, polished artifacts.
- samczsun: abuse paths and adversarial review.
- Hasu: sober risk, incentives and cost of error.

## Canonical files

1. `docs/00_CURRENT_STATE.md`
2. `docs/audit/STEP586D_INVITE_CENTER_LANGUAGE_MECHANISM_HONESTY_REPORT.md`
3. `docs/product/COLLABKA_COPY_SYSTEM.md`
4. `docs/product/TERMINOLOGY_REGISTRY.md`
5. `docs/roadmap/STEP586_COPY_REFACTOR_ROADMAP.md`
6. `docs/process/07_WORK_HISTORY_STEP586D.md`
