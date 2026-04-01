# STEP504 — Web Admin Runtime / founder diagnostics polish

## Цель

Сделать `/admin/runtime` не просто страницей со статусами, а коротким founder/operator diagnostic surface, который за несколько секунд отвечает:

- всё ли живо;
- где проблема — DB / Redis / QStash / config / payments / admin-web auth;
- что missing / degraded;
- куда смотреть дальше.

## Что добавлено

- `Общий статус` с normalized state: `ok / degraded / missing / unknown`;
- `Last updated` и overall runtime label;
- service cards для:
  - DB
  - Redis
  - QStash
  - Payments
  - Config
  - Admin Web
- компактный блок `Предупреждения` вместо сырого списка notes;
- `Конфигурация` как presence matrix без утечки secret values;
- founder/operator `Подсказки`;
- `Последние runtime-сигналы` как короткий диагностический trace.

## Что принципиально НЕ делали

- writes из runtime page;
- retry / reconfigure / env editing;
- live logs viewer;
- raw env dump;
- secret leakage;
- polling / cron dependency.

## Hobby-safe инвариант

Runtime остаётся read-first поверхностью:

- один основной read request: `GET /api/admin-web-read?section=runtime`;
- no polling;
- no cron dependency;
- никаких дополнительных service-specific fan-out requests из UI.

## Security

- page показывает только presence / status, а не значения env;
- runtime state intentionally normalized в понятные founder/operator labels;
- secrets, stack traces и raw dumps наружу не выводятся.
