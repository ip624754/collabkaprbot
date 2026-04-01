# STEP499 — Web Admin page contracts

## Общий контракт

Web admin v1 — это **snapshot console**, а не live dashboard.

Каждый экран:

- делает один основной read request;
- не использует background polling;
- не зависит от cron;
- не делает hidden fan-out по нескольким endpoints.

## `/admin`

Overview page показывает:

- базовые counters;
- runtime snapshot;
- recent admin-web audit list.

Источник данных:

- `GET /api/admin-web/overview`

## `/admin/users`

Users page показывает:

- search;
- segment filter (`all/brands/creators/curators/managers`);
- compact rows;
- note marker.

Источник данных:

- `GET /api/admin-web/users`

## `/admin/users/:id`

User card показывает:

- identity;
- role / plan / credits;
- workspaces / curator memberships;
- brand profile summary;
- payment summary light;
- admin note.

Read source:

- `GET /api/admin-web/user?id=...`

Write source:

- `POST /api/admin-web/user-note`

## `/admin/runtime`

Runtime page показывает:

- DB status;
- Redis status;
- admin-web readiness;
- PUBLIC_BASE_URL presence;
- note/warning list.

Источник данных:

- `GET /api/admin-web/runtime`

## `/admin/login`

Login page показывает:

- secret input;
- pending challenge state;
- code fallback input;
- explicit no-access-before-approve rule.

API:

- `POST /api/admin-web/auth/start`
- `GET /api/admin-web/auth/status`
- `POST /api/admin-web/auth/verify-code`

## Hobby-safe invariants

Эти страницы не должны эволюционировать в:

- live auto-refresh dashboards;
- heavy analytics fan-out;
- mutation-heavy console;
- queue/job runner UI.

Если понадобится расширение, оно должно идти отдельным STEP и с явным risk review.
