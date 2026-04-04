# 15 — NEW CHAT HANDOFF (copy-paste) — STEP535V baseline

Цель: чтобы новый чат **сразу продолжил текущий процесс**, а не начинал проект заново.

---

## 1) Что загрузить в новый чат

1) **FULL project zip** (актуальный snapshot репозитория)
2) (Опционально) отдельный docs zip
3) (Опционально) актуальный `/api/health` или краткий live runtime recap после деплоя

---

## 2) Что вставить первым сообщением в новом чате

Скопируй целиком:

---
**HANDOFF — CONTINUE FROM CURRENT PROCESS (STEP535V baseline)**

Продолжаем не с нуля, а от **STEP535V baseline**.

Текущий цикл был не про новые фичи, а про **stability + clarity + context correctness + repo hygiene** в ядре:
- Сначала прочитай `docs/00_CURRENT_STATE.md` и `docs/92_PROD_ENV_BASELINE.md`: baseline уже включает web-admin stabilization, runtime/health parity, QStash truth alignment и schema-guard против legacy `profile_contact` drift.
- creator → brand applications
- accept / charge / reply
- deals stage transitions
- local vs global navigation context
- lead / dialog / list / notice consistency
- Telegram-native density cleanup без redesign
- source-guard / preflight honesty
- docs / handoff / repo hygiene / operator health clarity / prompt kernel refresh

### Что уже критично стабилизировано

- **STEP433** — QStash dedup hotfix (`DeduplicationId cannot contain ':'`)
- **STEP434** — super-admin OPS COPY вынесен под отдельный env-gated flow
- **STEP435** — post-accept UX cleanup, убран misleading переход после accept
- **STEP436** — accept completion hardening: sync-first completion, async только как fallback
- **STEP437** — critical SQL fix for accept (`could not determine data type of parameter $2`)
- **STEP438** — template quick-buttons relabel на brand side
- **STEP439** — deals stage + local/global context
- **STEP440–456** — signal-first list/card/dialog/notice/footer consistency pass на обеих сторонах
- **STEP457** — creator-side `🏷 Каталог брендов` open-path cleanup без blink на normal path
- **STEP458** — accept SQL family hardening + accept smoke wired in preflight
- **STEP459** — brand quick-reply preview dedupe cleanup
- **STEP460** — creator application dialog / composer / local-return clarity pass
- **STEP461** — canonical new-chat docs kernel refresh (`15` + `17`)
- **STEP462–466** — creator/brand reply receipts, inbox empty-state, brand applications list density cleanup
- **STEP467** — accept SQL family typed-params hardening
- **STEP468** — stale smoke sync sweep
- **STEP469** — preflight split: `source-only` vs `deps/runtime`
- **STEP470** — remaining list dedupe pass (`📨 Мои заявки`, `📨 Заявки брендов`)
- **STEP471** — terminology consistency pass (`Новый диалог`)
- **STEP472** — home copy cleanup + first-run / returning split
- **STEP473** — repo hygiene cleanup (removed confirmed stale files)
- **STEP474** — parked IG OAuth libs moved out of active `src/lib` into `_ig_oauth_parked/`, handoff/docs canon refresh
- **STEP475** — `/api/health` two-tier contract: full-tier kept intact, added fast operator tier (`?tier=fast`, `?view=ops`, `?view=operator`) with `X-Health-Tier` header
- **STEP476** — upgraded canonical new-chat prompt kernel in `docs/17_START_NEW_CHAT_PROMPT.md`: stronger anti-regression, audit/patch/QA/artifacts discipline, explicit source-vs-runtime separation, added Toly / Armani / samczsun / Hasu lenses
- **STEP477** — added `docs/25_TELEGRAM_UI_PATTERN_REUSE.md`: canonical reusable note on how the Collabka single-surface Telegram UI works and how to reproduce it in another bot without losing Back/Menu/Home, `ret`, edit-first, and push-vs-edit invariants
- **STEP478** — added `docs/26_SELECTION_UI_CONTRACT_RU.md`: canonical Russian selection UI contract for picker/filter surfaces (`мультивыбор`, `один выбор`, `вкл/выкл`, separate bottom action block) so future Collabka menus do not mix selection, actions, and navigation
- **STEP479** — added `docs/27_SELECTION_SURFACE_INVENTORY_STEP479.md`: source-level inventory of active selection surfaces + frozen first pilot targets (`Workspace Profile → 🎬 Форматы`, `Workspace Profile → 🧩 Режим`) for future low-risk runtime rollout
- **STEP480** — implemented the first runtime selection pilot on those same two creator-side profile surfaces: `🎬 Форматы` now uses checkbox-style multi-select markers (`☑️/⬜️`) with a separated clear row, and `🧩 Режим` now uses radio-style single-choice markers (`🔘/⚪️`) with instant apply preserved; added `scripts/smoke-selection-pilot-contract.js` and wired it into source preflight
- **STEP481** — added `docs/28_TELEGRAM_COPY_CLARITY_SWEEP_STEP481.md`: source-first copy review of active creator/brand-facing Telegram screens, with explicit tags for `robotized / dense / ambiguous / needs newline / zero-state hint`, concrete rewrite candidates for brand/catalog/BX filter screens, and a frozen narrow runtime hotfix scope for text-only cleanup
- **STEP482A** — applied the first narrow runtime Telegram copy hotfix wave on brand/catalog/BX filter surfaces only: split dense headers into short lines, moved glued filter summaries to multiline blocks, removed robotized phrases (`увидеть выдачу`, `Совпадений брендов`, internal-mechanics explanations), shortened zero-state copy, and added the source guard `scripts/smoke-copy-wave1-contract.js`
- **STEP483** — added `docs/spec/STEP483_LANDING_FAQ_SPEC_RU.md`: Russian source spec for a one-page public landing + FAQ, with fixed structure, tone boundary, CTA rules, FAQ scope, and “what not to promise” limits
- **STEP484** — implemented the public Russian landing in repo root (`index.html`, `styles/landing.css`, `scripts/landing.js`, assets/*) with Hero, roles, workflow, inside-bot accordion, why-better block, screen previews, FAQ, final CTA, and `scripts/smoke-landing-contract.js`

### Что сейчас уже не надо делать

- заново переписывать accept / charge
- сливать applications / deals / inbox в один super-section
- делать большой IA redesign
- трогать working paths без явной причины
- возвращать parked IG OAuth в active tree без отдельного revival-step

### Что уже стабилизировано

- selection contract canon + source inventory + first runtime pilot already applied on `Workspace Profile → 🎬 Форматы` and `Workspace Profile → 🧩 Режим`
- accept / charge ядро
- local vs global deal context
- list / card / dialog density на обеих сторонах
- notice / receipt слой на обеих сторонах
- input / fallback / recovery слой на обеих сторонах
- footer / back / list-return semantics
- creator-side catalog open blink cleanup
- creator-side application composer / local return clarity
- source-only regression sweep и честный deps/runtime split
- role-aware home и short first-run split
- repo hygiene / docs kernel / current handoff canon
- operator health fast-path / one-screen ops summary contract
- stronger start-new-chat behavior kernel for follow-up work
- canonical reusable UI-pattern doc for cloning the Collabka Telegram navigation model in another bot
- canonical Russian selection-surface contract for future picker/filter/profile-selector screens

### Что ещё требует live runtime verification

Проверить руками после deploy:
- creator → brand application
- brand open application
- accept
- creator dialog open
- creator reply
- brand reply
- local `📌 Стадия сделки`
- stage transitions
- local back
- global deals path
- creator leads flow
- brand leads flow
- unlock / follow-ups
- empty states
- catalog open path без blink
- creator application local return (`⬅️ К диалогу #…` / `⬅️ К заявке #…`)
- home / first-run copy in real Telegram
- latest list cleanups (`📨 Мои заявки`, `📨 Заявки брендов`, `📨 Заявки от креаторов`)
- `/api/health?tier=fast` against live deploy: header + summary contract + no heavy drill-down blocks in operator fast-path
- any new picker/filter/profile-selector surface against `docs/26_SELECTION_UI_CONTRACT_RU.md` before expanding rollout beyond the STEP480 pilot

### Как работать в новом чате

Новый чат должен:
- подтвердить, что продолжает от STEP480, а не с нуля
- прочитать docs как обычно
- кратко перечислить, что уже стабилизировано
- отдельно назвать, что подтверждено source/snapshot-level
- отдельно назвать, что ещё нужно проверить живьём в Telegram
- не предлагать новый redesign
- следующим ходом делать только:
  - live runtime triage
  - или **STEP480+ micro-hotfix** по реальному хвосту

### Что нельзя делать

- не начинать “новую архитектуру”
- не трогать accept / charge без очень сильной причины
- не добавлять лишние DB reads в hot UI paths
- не устраивать массовую “чистку ради красоты”
- не ломать локальный контекст возврата
- не менять working terminology без причины
- не возвращать parked IG OAuth helpers в active `src/lib/*` без отдельного revival-плана

### Какой должен быть первый ответ ассистента

Ожидаемый формат:
- подтвердить, что baseline = STEP482A
- кратко перечислить, что было стабилизировано в STEP433–478
- отдельно назвать:
  - что подтверждено source/snapshot-level
  - что ещё нужно проверить живьём в Telegram
- предложить только один следующий микро-шаг:
  - runtime verification / triage
  - либо micro-hotfix по реальному хвосту
---

---

## 3) Мини-smoke, который ассистент должен предложить

- `/api/health` full-tier (legacy operator JSON)
- `/api/health?tier=fast` fast-tier operator summary + `X-Health-Tier` header
- creator → brand application → brand accept → creator reply → brand reply
- local `📌 Стадия сделки` → stage transition → local back
- `🏷 Каталог брендов` fast path без blink
- creator application flow: `✍️ Ответить бренду` → composer → `⬅️ К диалогу #…` / `📨 К заявкам`
- home / first-run copy: creator, brand, new user role gate

---

## 3.5) Reuse doc для другого Telegram-бота

Если задача в новом чате — **повторить именно Collabka-style UI-паттерн** в другом боте, используй дополнительно:
- `docs/25_TELEGRAM_UI_PATTERN_REUSE.md`
- `docs/26_SELECTION_UI_CONTRACT_RU.md`

Этот файл объясняет не только текст промпта, а именно архитектурную модель:
- single-surface Telegram UI
- `safeEditOrReply(...)` / edit-first rendering
- `Back` vs `Menu` vs `Home`
- explicit `ret` / local return-context
- push new UI surface для receipts/service-origin flows
- durable truth vs ephemeral UI state
- DB-light menu paths

---

## 4) Быстрый шаблон промпта

Используй файл:
`docs/17_START_NEW_CHAT_PROMPT.md`

Он является canonical behavior kernel:
- Jobs / Vitalik / Woz / Durov / Toly / Armani / samczsun / Hasu
- docs-first + baseline-first
- audit → patch → QA → artifacts
- small-surface-area patching
- Telegram-native clarity
- strict source-vs-runtime separation
- local-context-first UX

---

## 5) Production docs (read before going live)

- `docs/91_PROD_LAUNCH_30MIN.md`
- `docs/92_PROD_ENV_BASELINE.md`
- `docs/93_PROD_DEPLOY_CHECKLIST.md`
- `docs/94_PROD_READINESS_PACK.md`
- `docs/ops/03_LIVE_RUNTIME_PASS_STEP471.md`
- `docs/26_SELECTION_UI_CONTRACT_RU.md`


- Added public Russian landing + FAQ in repo root (`index.html`, `styles/landing.css`, `scripts/landing.js`, assets) as the lowest-cost conversion/explainer layer before entering `@collabkaprbot`; public-site only, no bot runtime changes.


## STEP485 — Landing accordion hotfix

Status: source-confirmed.

What changed:
- landing accordion cards no longer render open by default;
- hidden accordion copy no longer bleeds out of collapsed cards;
- scope stayed landing-only (`index.html`, `styles/landing.css`, landing smoke).

Live note:
- manual browser verification required after deploy for `Что внутри бота` and `FAQ`.


## STEP486 — Landing visual polish pack

Status: source-confirmed.

What changed:
- `Как это выглядит` now uses four polished product cards built from real bot screens instead of mixed raw/schematic placeholders.
- New polished landing assets:
  - `home-surface-polished.png`
  - `catalog-surface-polished.png`
  - `filters-surface-polished.png`
  - `deal-surface-polished.png`
- Landing smoke now guards against returning to placeholder preview cards or the old raw screenshot reference.

Live note:
- browser verification required after deploy for the landing visuals only.


## STEP487 — Landing surface gallery / modal polish

Status: source-confirmed.

What changed:
- `Как это выглядит` now uses a gallery + modal contract instead of trying to keep full explanation inside each grid card.
- Each of the four surfaces (`Домашняя`, `Каталог брендов`, `Фильтры брендов`, `Диалог и стадия сделки`) now renders as one symmetric preview card with one real screenshot.
- Clicking a card opens a dedicated modal with a larger screenshot plus three short explanation blocks: `Что видно`, `Почему это важно`, `Следующий шаг`.
- `Диалог и стадия сделки` now uses one strong real working-card screenshot instead of a two-screen composite.
- Landing JS now supports click/tap open, Esc/backdrop close, focus return, and a simple focus trap.

Live note:
- browser verification required after deploy for gallery symmetry, modal open/close on desktop/mobile, and reduced clutter inside the screens section.


[STEP489] Landing icon system polish: replaced emoji landing icons with a consistent SVG icon set, added /assets/icons/landing/*.svg, and tightened landing icon spacing/styling without changing section structure or CTA behavior.


- STEP489: landing icon hardening only; no landing structure change, no bot runtime change. Inline icon sprite + size guards fixed icon overflow/sprawl on live landing.


## STEP490 note
- Landing icon system is hardened via fixed-size CSS background glyphs; do not reintroduce inline sprite icons in landing cards/labels without checking live overflow behavior first.
