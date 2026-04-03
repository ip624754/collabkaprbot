# STEP535E — Web admin Runtime semantics + actionability

Date: 2026-04-03

## Goal
Сделать `/admin/runtime` не просто списком статусов, а читаемой operator-surface, где видно:
- что в `OK`;
- что требует проверки;
- что именно не настроено;
- что является только справочным сигналом;
- и какой следующий шаг нужен по каждому важному контуру.

## What changed
- В `src/lib/adminWeb/runtime.js` добавлен единый semantic/actionability слой:
  - `semanticLabelForState()`
  - `actionabilityForState()`
  - `actionabilityLabel()`
  - `nextStepForSource()`
  - `decorateRuntimeItem()`
  - `decorateConfigPresence()`
- `statusHierarchy`, `incidentStrip`, `controlSnapshot`, `queueClarity`, `retrySignals` и `configPresence` теперь получают:
  - `semanticLabel`
  - `actionability`
  - `actionLabel`
  - `meaning`
  - `nextStep`
- `/admin/runtime` в `scripts/admin-web.js` перестроен как operator-readable surface:
  - верхний summary теперь разделяет `OK / Нужна проверка / Не настроено / Справочно`;
  - runtime cards показывают не только статус, но и `Нужно ли действие` + `Следующий шаг`;
  - incident strip теперь явно показывает семантику и actionability;
  - queue / retry cards разведены по смыслу, а не только по raw status;
  - control plane объясняет, что paused / override — это operator-mode, а не silent bug;
  - config presence matrix перестала путать `missing` и `optional/not_enabled`.
- В Runtime добавлен короткий локальный reading-layer (`Paused ≠ silent bug`, `Missing ≠ degraded`, `Users vs Runtime`) плюс ссылка на `/admin/help`.
- Обновлён admin asset cache-bust до `step535e`.

## Acceptance
- Runtime теперь читается как control plane, а не как dump карточек.
- `missing`, `degraded`, `paused/operator`, `unknown/info` не смешиваются визуально и смыслово.
- У ключевых контуров есть явный `Следующий шаг`.
- Scope остался read-only: без новых routes, polling, write-actions и backend rewrites.

## QA
- `node --check src/lib/adminWeb/runtime.js`
- `node --check scripts/admin-web.js`
- `npm run smoke:admin-web-runtime-contract`
- `npm run smoke:admin-web-runtime-hierarchy-contract`
- `npm run smoke:admin-web-runtime-semantics-contract`
