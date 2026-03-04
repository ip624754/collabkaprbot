# 30 — Redis TTL hygiene gate — 2026-03-04

Цель: убрать риск появления **"immortal" Redis keys** (TTL = -1) из‑за случайных `redis.set(a, b)` без TTL.

Почему важно:
- В serverless‑режиме любые "вечные" ключи — прямые расходы (memory) и источник stale state.
- Ранее похожая проблема проявлялась для `INCR + EXPIRE` в fallback‑ветках (потенциально оставляло ключи без TTL).

## Что сделано

1) Добавлен dev‑guardrail: `scripts/lint-redis-ttl.js`.
   - Сканирует runtime‑код (`src/**`, `api/**`) и **падает**, если находит однострочный паттерн `redis.set(a, b)` (двухаргументный set) без TTL.
   - Исключения допускаются только при явной пометке комментарием `TTL-LINT: ...`.

2) `npm run preflight` теперь включает `lint:redis-ttl`.

3) Явно помечены текущие intentional‑persistent set‑точки:
   - runtime system flags/objects (через `setSysBool` / `setSysObj`) — без TTL по дизайну.
   - admin user notes (`adminUserNoteKey`) — без TTL по дизайну (очистка вручную).
   - internal wrapper `redisSetSafe` — может вызывать `redis.set(a, b)` только если opts не переданы; это допустимо внутри helper’а, но callers должны передавать `{ ex: ... }`.

## Что считать нормой

- Для **временных** ключей всегда задаём TTL (`{ ex: ttlSec }`) или используем специализированные helpers (`incrWithExpire...`, locks `SET NX EX`, и т.д.).
- Для **персистентных** ключей (runtime flags, admin notes) допускаем отсутствие TTL, но **только с явной пометкой** `TTL-LINT: allow-persistent`.

## QA

- `npm run preflight` проходит.
- В коде нет новых `redis.set(a, b)` без TTL, кроме помеченных intentional‑persistent точек.

Риск регрессий: **нулевой** (dev‑guardrail + комментарии; runtime‑логика не менялась).
