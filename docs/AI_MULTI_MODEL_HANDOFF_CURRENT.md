# AI Multi-Model Handoff — Current Collabka Truth

**Current baseline:** STEP586C — Applications, Dialogs and Deals Lifecycle  
**Parent:** STEP586B — Home, Menu and Role Navigation Contract  
**Live status:** not reverified in STEP586C

## Verified now

- visible lifecycle is `оффер / профиль → заявка → диалог → сделка → этап / закрытие`;
- `💬 Диалоги`, `📨 Заявки` and `🤝 Сделки` keep their existing callback destinations;
- creator application cards derive their title from state;
- a deal requires both accepted-user evidence and a deal stage;
- direct deal-stage mutation verifies application access before writing;
- SQL deal lists and stage writes enforce the accepted-only invariant;
- canonical source preflight plus lifecycle, callback, dependency/runtime and targeted source contracts pass locally.

## Security finding resolved

A forged `a:brand_deal_set` callback previously reached the stage writer without the same explicit access assertion used by the surrounding application flows. STEP586C adds actor access verification plus runtime and SQL accepted-deal guards.

## Not verified

- live Telegram creator/brand traversal;
- mobile text/button wrapping;
- Vercel/Neon/Redis/QStash production behavior;
- remote STEP584 staging evidence;
- real-user comprehension.

## Immediate next STEP

`STEP586D_INVITE_CENTER_LANGUAGE_AND_MECHANISM_HONESTY`

Keep reward math, eligibility, anti-abuse rules, callback IDs and ledger behavior unchanged. Fix language only against source truth, with security review for incentive abuse paths.

## Do not do yet

- callback renaming;
- global monetization taxonomy migration;
- broad status-machine redesign;
- claim live UX verification from source checks.

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
2. `docs/audit/STEP586C_APPLICATIONS_DIALOGS_DEALS_LIFECYCLE_REPORT.md`
3. `docs/product/COLLABKA_COPY_SYSTEM.md`
4. `docs/product/TERMINOLOGY_REGISTRY.md`
5. `docs/roadmap/STEP586_COPY_REFACTOR_ROADMAP.md`
6. `docs/process/07_WORK_HISTORY_STEP586C.md`
