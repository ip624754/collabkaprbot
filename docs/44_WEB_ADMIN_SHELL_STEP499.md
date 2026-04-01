# STEP499 — Web Admin Shell v1 (Hobby-safe)

## Что реально сделано

В репо добавлен первый web-admin surface для Collabka как **узкий owner/operator cockpit**:

- `admin.html` — один shell entrypoint;
- `styles/admin-web.css` — отдельный admin-only стиль;
- `scripts/admin-web.js` — client shell/router без polling;
- `/api/admin-web/*` — узкие JSON endpoints;
- Redis-backed auth/session/audit foundation;
- DB-truth read models для Overview / Users / User Card / Runtime;
- один safe write: `set note / clear note`.

## Почему так

Шаг сделан под **Hobby-safe** ограничения:

- без нового framework слоя;
- без SSR fan-out;
- без cron зависимости;
- без hidden polling;
- без hot-path mutating actions;
- без миграций ради auth/session storage.

Это не полная “новая админка на всё”, а **read-first web shell** поверх уже существующего Telegram-admin контракта.

## Что входит в surface

### UI routes

Через Vercel rewrite `/admin` и `/admin/*` ведут в `admin.html`.

Shell внутри читает `location.pathname` и рендерит:

- `/admin`
- `/admin/users`
- `/admin/users/:id`
- `/admin/runtime`
- `/admin/login`

### API routes

- `POST /api/admin-web/auth/start`
- `GET /api/admin-web/auth/status`
- `POST /api/admin-web/auth/verify-code`
- `GET /api/admin-web/auth/me`
- `POST /api/admin-web/auth/logout`
- `POST /api/admin-web/auth/revoke-all`
- `GET /api/admin-web/auth/decision?...`
- `GET /api/admin-web/overview`
- `GET /api/admin-web/users`
- `GET /api/admin-web/user?id=...`
- `POST /api/admin-web/user-note`
- `GET /api/admin-web/runtime`

## Read models

Шиппятся 4 агрегированных read model:

- `overviewSummary`
- `usersList`
- `userDetail`
- `runtimeSummary`

Правило v1: **одна страница = один основной read request**.

## Write surface v1

Разрешён только один узкий write surface:

- note set / clear на user card.

Note хранится в Redis на том же key contract, что и текущая Telegram-admin заметка. Это deliberate reuse: не вводим вторую правду и не ломаем уже работающий operator note layer.

## Что сознательно не включено

- payments mutation
- queue retry / job replay
- founder destructive toggles
- deal stage mutation
- payout/release flows
- live user dialog actions
- bulk destructive actions

## Основной инженерный компромисс

Изначальный STEP499 contract предполагал отдельные DB tables для login challenges / sessions / audit.

Для реальной v1 реализации выбран **ещё более узкий и безопасный** путь:

- challenges — Redis
- sessions — Redis
- admin-web recent audit — Redis list

Почему:

- нет миграций в hot baseline;
- rollout проще;
- rollback проще;
- sidecar auth/session не требует нового DB schema риска.

Это честное v1 решение, а не “идеальная архитектура потом”.

## Acceptance

STEP499 считается выполненным, потому что:

- web shell поднимается;
- auth gate работает через secret + Telegram approve/code;
- есть secure session cookie;
- есть Overview / Users / User Card / Runtime;
- есть safe note write;
- нет polling;
- нет cron dependency;
- нет high-risk writes.

## Collateral low-risk fix

Во время source QA обнаружился старый drift в `index.html`: meta всё ещё смотрела на несуществующий `assets/social/collabka-og.png` и размеры `1730x908`.

Чтобы repo оставался shipping-consistent после STEP499, path был возвращён на реально шиппящий asset `assets/social/collabka-og-1200x630.png` и размерный meta-contract `1200x630`. Это не связано с web-admin логикой, но оставлено в шаге как низкорисковая consistency-fix.
