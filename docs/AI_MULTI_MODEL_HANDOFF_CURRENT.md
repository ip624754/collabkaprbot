# AI Multi-Model Handoff — Current Collabka Truth

**Current baseline:** STEP586F — Access, Error and Empty-State Recovery
**Parent:** STEP586E — Monetization and Paid Product Clarity
**Live status:** not reverified in STEP586F

## Verified now

- a shared immutable recovery taxonomy covers channel, application, dialog, offer, giveaway, folder, role and generic failures;
- ordinary-user recovery does not disclose whether a private object exists, was deleted or belongs to another actor;
- recovery buttons return to existing list/menu surfaces and do not bypass authoritative access checks;
- selected empty states include a title, a source-backed reason and one next action;
- selected infrastructure details are removed from user copy and retained in structured `[copy_safety]` diagnostics;
- non-admin curator workspace rendering proves membership in the requested workspace before unrestricted detail lookup;
- the legacy curator workspace route has an explicit curator/admin gate;
- callback identities, schema, payment mechanics, invite economics, deal mechanics and giveaway mechanics are unchanged;
- STEP586F and regression contracts pass locally; the full 223-file JavaScript syntax surface passes separately.

## Security finding resolved

The curator workspace renderer previously loaded unrestricted workspace details before proving membership in that specific workspace. A crafted callback could therefore confirm private workspace detail before the intended boundary. STEP586F moves specific membership proof ahead of unrestricted lookup for non-admin actors and returns neutral recovery on failure. Live exploitation was not tested.

## Not verified

- live Telegram traversal or mobile wrapping;
- Vercel Preview/production;
- live Neon/Redis/QStash behavior;
- production stale-data combinations;
- remote STEP584 staging evidence;
- real-user comprehension.

## Immediate next STEP

`STEP586G_ADMIN_OPERATOR_VOCABULARY`

Make primary operator actions readable while preserving exact diagnostic vocabulary. Do not redesign controls or change privileges.

## Do not do yet

- broad admin redesign;
- global replacement of remaining `Нет доступа.` strings;
- permission changes hidden inside copy cleanup;
- payment, invite, deal or giveaway mechanism changes;
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
2. `docs/audit/STEP586F_ACCESS_ERROR_EMPTY_STATE_RECOVERY_REPORT.md`
3. `docs/product/COLLABKA_COPY_SYSTEM.md`
4. `docs/product/TERMINOLOGY_REGISTRY.md`
5. `docs/roadmap/STEP586_COPY_REFACTOR_ROADMAP.md`
6. `docs/process/07_WORK_HISTORY_STEP586F.md`
