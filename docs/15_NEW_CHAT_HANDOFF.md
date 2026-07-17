# STEP582 CURRENT TRUTH OVERRIDE

Use this block over older runtime claims below.

- Current baseline: STEP582 Preflight Truth Restoration.
- Callback consistency: PASS, 0 unresolved.
- Dependency/runtime preflight: PASS.
- Syntax: PASS through parallel `node --check` across the project JS surface.
- Security dependency audit: 0 vulnerabilities.
- Canonical serial `preflight:source`: did not complete inside the tool time limit; no remaining assertion failure was observed and the residual checks passed separately.
- Live production runtime: not reverified.
- Next STEP: STEP583 Runtime Proof Spine.

Read first:
1. `docs/00_CURRENT_STATE.md`
2. `docs/process/07_WORK_HISTORY_STEP582.md`
3. `docs/audit/STEP581_FULL_PROJECT_AUDIT_2026_07_17.md`
4. `docs/roadmap/COLLABKA_EXECUTION_ROADMAP_AFTER_STEP581.md`
5. `docs/AI_MULTI_MODEL_HANDOFF_CURRENT.md`

---

# STEP581 CURRENT TRUTH OVERRIDE

Use this block over older runtime claims below.

- Current baseline: STEP581 audit pack on STEP580 docs / STEP579 runtime.
- Source syntax: verified clean for 211 JS files.
- Dependency audit: 0 vulnerabilities.
- Preflight status: **NOT GREEN**. Callback consistency has 21 unresolved references. Dependency preflight has a false-negative resolver.
- Vercel function budget: 11/12.
- Live runtime status: **not reverified in STEP581**; older `System=OK` claims are historical snapshots, not current proof.
- Next STEP: STEP582 Preflight Truth Restoration.

Read first:
1. `docs/audit/STEP581_FULL_PROJECT_AUDIT_2026_07_17.md`
2. `docs/roadmap/COLLABKA_EXECUTION_ROADMAP_AFTER_STEP581.md`
3. `docs/AI_MULTI_MODEL_HANDOFF_CURRENT.md`

---

# 15 — NEW CHAT HANDOFF (copy-paste) — STEP580 baseline

Цель: чтобы новый чат продолжил **текущий рабочий baseline**, включая STEP579 runtime hardening и STEP580 CogniForge/Creator OS documentation layer.

---

### STEP580 latest narrow baseline note
- STEP579 remains the latest runtime-code delta: timing-safe public secret checks, explicit giveaway lock handling, and unchanged invite/reward semantics
- STEP580 is documentation/continuity only; it adds CogniForge project governance, system invariants, risk registry, and Creator OS thesis
- canonical project contracts now include `docs/AI_NATIVE_WORKFLOW.md`, `docs/SYSTEM_INVARIANTS.md`, `docs/RISK_REGISTRY.md`, and `docs/CREATOR_OS_THESIS.md`
- runtime code, DB, callbacks, invite/reward math, giveaway, auth, webhook, cron, payments, and admin behavior are unchanged in STEP580
- Creator OS thesis is a north star, not permission for broad redesign; every product change still requires a scoped STEP


## 1) Что загрузить в новый чат

1. Актуальный **FULL project zip**
2. При необходимости свежий `/api/health` или краткий live runtime recap
3. Опционально — hotfix/patch последнего шага, если новый чат должен разбирать именно дельту

---

## 2) Что вставить первым сообщением в новом чате

Скопируй целиком:

---
**HANDOFF — CONTINUE FROM CURRENT PROCESS (STEP580 baseline)**

Продолжаем не с нуля, а от **STEP580 baseline** (STEP580 docs/governance on top of STEP579 runtime source).

Сначала прочитай по порядку:
1. `docs/README.md`
2. `docs/00_BOOT.md`
3. `docs/00_CURRENT_STATE.md`
4. `docs/91_PROD_LAUNCH_30MIN.md`
5. `docs/15_NEW_CHAT_HANDOFF.md`
6. `docs/AI_NATIVE_WORKFLOW.md`
7. `docs/SYSTEM_INVARIANTS.md`
8. `docs/RISK_REGISTRY.md`
9. `docs/CREATOR_OS_THESIS.md`

### Что уже стабилизировано в текущей волне

### Что добавлено в STEP580
- project-specific CogniForge mode routing and STEP/Truth Boundary contract
- cross-system invariant registry
- living risk registry
- Creator Collaboration Operating System thesis with explicit non-goals
- continuity baseline repair from contradictory older/current references to STEP580


#### Bot/runtime correctness (STEP536–542)
- callback ack / feedback contract hardened
- orphan/stale callback surfaces cleaned up
- input-state boundary hardened
- callback consistency guard added to source preflight
- `gw_access*` extracted from monolith and aligned with project lifecycle truth
- `gw_access` prompt/truth boundary hardened

#### Web-admin mobile + runtime truth (STEP543A–545)
- mobile shell / drawer / shared responsive surfaces landed
- Users mobile working slice landed
- mobile consistency follow-up landed
- stale retry signal now downgraded correctly in `System`
- `Overview` now uses the same runtime truth contract as `System`

### Current live-confirmed reading
- `System = OK`
- `Overview = OK`
- `Runtime warnings = 0`
- stale retry signal is historical/info, not active degraded
- mobile admin pass is in place and usable

### Что подтверждено source/snapshot-level
- STEP536–545 source smokes and preflight were run during the wave
- docs canon updated step-by-step
- current read-model truth in `Overview` and `System` is aligned

### Что ещё требует обычного live observation
- normal production observation after deploy
- manual admin/mobile checks on real phone as needed
- ordinary Telegram runtime spot-checks after future changes

### Что сейчас НЕ надо делать
- не возвращаться к QStash/DB/profile_contact расследованию как к активной аварии
- не делать новый широкий bot/router rewrite
- не делать новый большой admin redesign
- не ломать mobile/admin shell ради косметики
- не поднимать stale retry breadcrumb обратно в active warning lane

### Как должен выглядеть первый ответ ассистента
- подтвердить, что работа продолжается от **STEP580 baseline**
- кратко перечислить, что стабилизировано в STEP536–545
- отдельно разделить source-confirmed vs live-confirmed
- назвать ровно **один** следующий микро-шаг с наибольшим leverage
- не предлагать redesign без source/runtime повода

---

## 3) Мини-smoke, который новый чат должен предложить первым

1. `System` / `Overview` / `Обновить`
2. один mobile admin pass: Overview → Users → Runtime
3. короткий Telegram pass по критичным работающим путям после любого нового runtime/bot патча
4. `/api/health` / runtime recap only if новая задача реально затрагивает prod-runtime truth

---

## 4) Canonical prompt kernel

Используй:
- `docs/17_START_NEW_CHAT_PROMPT.md`

Он остаётся главным behavioral kernel: baseline-first, docs-first, narrow patching, audit → patch → QA → artifacts.

---

## 5) Production docs

- `docs/91_PROD_LAUNCH_30MIN.md`
- `docs/92_PROD_ENV_BASELINE.md`
- `docs/93_PROD_DEPLOY_CHECKLIST.md`
- `docs/94_PROD_READINESS_PACK.md`
- `docs/ops/03_LIVE_RUNTIME_PASS_STEP471.md`

---

## 6) Главная установка

Новый чат должен продолжать от **реального текущего baseline**:
- bot/runtime hardening wave landed
- web-admin mobile/runtime truth wave landed
- open known defect class сейчас не зафиксирован
- следующий ход выбирается только по свежему source/runtime сигналу, а не по устаревшему handoff-контексту

## STEP583 delta

- Current baseline: STEP583 Runtime Proof Spine.
- Local proof command: `npm run smoke:runtime-proof-spine`.
- Verified locally: webhook auth and callback dispatch, Redis degradation fallback, QStash ping convergence.
- Not verified live: Vercel, Telegram, Neon, Upstash Redis, QStash.
- Next STEP: STEP584 Staging Runtime Acceptance Pack.

## Current next action after STEP584

Deploy the STEP584 baseline to preview/staging, run `npm run acceptance:staging` first in observe-only mode, then optionally with `ACCEPTANCE_QSTASH_PUBLISH=1`. Preserve generated evidence. Do not claim staging GO until that remote evidence and one manual Telegram creator/brand navigation smoke exist.
