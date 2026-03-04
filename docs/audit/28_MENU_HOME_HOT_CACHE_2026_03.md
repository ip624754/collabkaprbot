# 28 — Menu/Home hot UI cache (Redis TTL) — 2026-03-04

Цель: убрать лишние обращения к Neon в **горячих UI путях** `📋 Меню` / `🏠 Home`.

Проблема (из внешнего аудита):
- `getRoleFlags()` делал 2–3 SQL на каждый клик `📋 Меню`/`🏠 Home` (moderator/editor/curator).
- В creator‑hub `renderRoleHub()` вызывал `db.listWorkspaces()` на каждый клик меню (+ ещё один SQL).
- В сумме это нарушало BOOT инвариант «не бить Neon на рендер меню».

Решение (STEP298): best‑effort Redis‑кеш (TTL 5 минут) для:
1) **Role flags** (`moderator/editor/curator`) — ключ `cache:role_flags:<user_id>:<editors_enabled>`
2) **Creator workspaces list** — ключ `cache:ws_list:<user_id>`

Семантика:
- **Redis OK:** берём из кеша → меню/хаб рендерятся без SQL.
- **Redis degraded:** кеш пропускаем (try/catch), работаем по DB‑truth как раньше (fail‑open, без блокировки пользователя).
- Кеш по workspaces **инвалидируется** при успешном подключении нового канала (ws_created).

Что именно поменяли
- `src/bot/bot.js`:
  - добавлены helpers: `getRoleFlagsCached()`, `listWorkspacesCached()`, `invalidateWorkspacesCache()`
  - `a:menu` / `a:menu_push` / `a:home` / `a:home_hint_ack` используют `getRoleFlagsCached()`
  - `renderRoleHub()` (creator path) использует `listWorkspacesCached()`
  - `renderWsOpen()` принимает `opts.showCurator` и не делает лишний SQL, если флаг уже известен
  - при `setup_forward` (подключение канала) делаем `invalidateWorkspacesCache(user_id)`

Риск регрессий
- Низкий: кеш влияет только на **рендер меню/хабов** (UI), права по критичным действиям по‑прежнему проверяются внутри flow/DB.
- Возможна краткая задержка отражения роли/списка каналов (до 5 минут) при ручных изменениях, но:
  - workspaces кеш инвалится при создании,
  - TTL маленький,
  - безопасность не ухудшается (кнопка ≠ право).

QA (ручной)
1) Открыть `📋 Меню` 5–10 раз подряд: в логах Neon/DB должно быть заметно меньше запросов (после первого прогрева).
2) `🏠 Home` 5–10 раз подряд: аналогично.
3) Подключить новый канал (setup_forward) → сразу открыть `📋 Меню`/`📣 Мои каналы`: новый канал виден (кеш сброшен).
4) Эмулировать Redis down (или временно отключить) → меню продолжает работать (DB‑fallback), без crash.
