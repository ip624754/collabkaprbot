# STEP482A — Telegram copy hotfix wave 1

## Scope

Узкий runtime copy hotfix только для:
- `🎛 Фильтры брендов` → `renderBrandDirFilters(...)`
- `🏷 Каталог брендов` header + empty / no-results
- `🎛 Фильтры креаторов` → `renderBxFilters(...)`
- `📰 Лента креаторов` header + no-results
- nearby zero-result helper in `bxSmartPrefillText(...)`

Вне scope:
- accept / charge / unlock / reply / stage flows
- callbacks / money paths
- DB schema
- новые hot-path DB reads
- broad wording sweep по всему боту

## What changed

### 1) Brand directory filters
- header split into separate lines:
  - `Режим: 🎬 Креатор`
  - `Каталог: 🏷 Бренды`
- removed robotic line `Фильтруем бренды по тому, что бренд заполнил в профиле.`
- filter summary is now multiline instead of one dense row
- `Совпадений брендов` → `Найдено брендов`
- helper changed from `увидеть выдачу` to `открыть список`

### 2) Brand catalog header + zero-state
- removed systemy copy about `4/4` and internal mechanics
- replaced with short human header copy:
  - `Показываем бренды по данным из их профиля.`
- empty/no-results copy shortened:
  - `По этим фильтрам бренды пока не найдены.`
  - `Ослабь 1–2 фильтра или нажми «♻️ Сброс».`
- positive state CTA simplified to `Выбери бренд из списка:`

### 3) BX / creator feed filters
- header split into separate lines:
  - `Режим: 🏷 Бренд`
  - `Лента: 🎬 Креаторы`
- removed robotic line `Фильтруем креаторов по тому, что они указали в оффере.`
- tag matching helper rewritten into plain language:
  - `Для тегов достаточно совпадения по любому выбранному значению.`
- filter summary is now multiline instead of one dense row
- helper changed from `увидеть выдачу` to `открыть ленту`

### 4) BX feed zero-state
- removed flat `Пока нет офферов по этим фильтрам.`
- new zero-state gives next-step guidance:
  - `По этим фильтрам креаторы пока не найдены.`
  - `Ослабь 1–2 фильтра или нажми «♻️ Сбросить».`

### 5) Smart prefill zero-results helper
- `Сейчас 0 результатов...` replaced with friendlier wording:
  - `По этим фильтрам сейчас нет результатов...`

## Source guards

Added source-level smoke:
- `scripts/smoke-copy-wave1-contract.js`
- `npm run smoke:copy-wave1-contract`

Wired into:
- `package.json`
- `scripts/preflight.js`

## Acceptance

Step is correct only if:
- headers are visually split into short readable lines
- dense filter summaries are not printed as one glued row on targeted screens
- `увидеть выдачу` / `Совпадений брендов` / other flagged robotic phrases are removed from targeted surfaces
- zero-state copy offers a clear next step
- no callbacks, routing, DB reads, or monetization paths change
