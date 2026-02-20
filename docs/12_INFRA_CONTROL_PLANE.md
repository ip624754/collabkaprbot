# 12 — Control Plane Infra (Cron / Serverless)

## Проблема serverless
На Vercel один и тот же cron/endpoint может стартовать параллельно:
- повтор вызова,
- холодный старт + ещё одна копия,
- сетевые повторы.

Это ведёт к:
- двойному draw победителей,
- двойной рассылке,
- race conditions и лишним CU в Neon.

## Решение (двойной locking)
### 1) Redis lock (Upstash)
Глобальный замок на tick:
- `lock:giveaways_tick`
- `lock:broadcast_tick`

Если уже занят → быстро выходим без нагрузки на Neon.

### 2) Postgres advisory lock (transaction scoped)
Для *критических* операций внутри БД (особенно draw winners):
- `pg_try_advisory_xact_lock(giveaway_id)`
- плюс `SELECT ... FOR UPDATE` по строке giveaway

Гарантия:
- один giveaway может быть “нарисован” только один раз,
- даже если Redis вырубится или будет race на уровне функций.

## Deterministic winners
Победители выбираются на стороне SQL:
- `seed = giveaway_id + ':' + ends_at_iso`
- `ORDER BY sha256(seed + ':' + user_id)` (через `pgcrypto.digest`)
- fallback: `md5` если pgcrypto ещё не стоит (временно).

Плюсы:
- 0 PRNG в Node
- 0 вытягивания 50k user_id в память
- воспроизводимо (audit-friendly)

## Audit logs и стоимость Neon
`workspace_audit` и `giveaway_audit` пишутся в Postgres. При активной работе (особенно lead/folders) частые `INSERT` могут заметно жечь CU на Neon.

### Рекомендованный guardrail (без влияния на UX)
Включаем write-shedding только для «шумных» действий через Redis rate-limit (остальные действия логируются как раньше).

ENV:
- `AUDIT_DB_ENABLED=true` — включить/выключить DB-аудит целиком.
- `AUDIT_DB_THROTTLE_ENABLED=true` — включить троттлинг.
- `AUDIT_DB_THROTTLE_LIMIT=60` + `AUDIT_DB_THROTTLE_WINDOW_SEC=60` — максимум записей на (workspace × prefix) в окно.
- `AUDIT_DB_THROTTLE_PREFIXES=lead.,folders.,ws.profile_` — какие действия считаем «шумными».

Стратегия: сначала включаем троттлинг на проде, смотрим логи/метрики и при необходимости поднимаем лимиты.
