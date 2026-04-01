# STEP504 — Web Admin Runtime data contract

## Read endpoint

`GET /api/admin-web-read?section=runtime`

## Response shape

```json
{
  "updatedAt": "...",
  "overall": {
    "state": "ok",
    "label": "Система выглядит стабильно"
  },
  "services": {
    "db": { "state": "ok", "label": "DB configured", "hint": "..." },
    "redis": { "state": "ok", "label": "Redis configured", "hint": "..." },
    "qstash": { "state": "missing", "label": "QStash not configured", "hint": "..." },
    "payments": { "state": "ok", "label": "Payments fallback guarded", "hint": "..." },
    "config": { "state": "ok", "label": "Core config present", "hint": "..." },
    "adminWeb": { "state": "ok", "label": "Admin web auth configured", "hint": "..." }
  },
  "configPresence": [
    { "key": "BOT_TOKEN", "state": "configured" },
    { "key": "PUBLIC_BASE_URL", "state": "configured" },
    { "key": "UPSTASH_REDIS_REST_URL", "state": "configured" },
    { "key": "ADMIN_WEB_SECRET", "state": "configured" }
  ],
  "warnings": [
    { "level": "info", "message": "Явных предупреждений нет", "source": "runtime" }
  ],
  "hints": [
    { "kind": "info", "message": "Базовый infra/config слой выглядит собранным." }
  ],
  "recentRuntimeEvents": [
    { "kind": "info", "source": "runtime", "message": "...", "at": "..." }
  ]
}
```

## Back-compat fields

Для STEP499–STEP503 shell compatibility read model также сохраняет lightweight legacy fields:

- `env`
- `publicBaseUrl`
- `adminWebConfigured`
- `db.ok`
- `redis.configured`
- `redis.ok`
- `qstash.configured`
- `notes`

Это позволяет полировать Runtime без одновременного слома более старых overview/runtime зависимостей.

## Status normalization

Все диагностические состояния нормализуются в 4 статуса:

- `ok`
- `degraded`
- `missing`
- `unknown`

UI не должен плодить отдельные нестабильные формулировки вне этого контракта.

## Not in contract

- env values / secrets;
- retry controls;
- write actions;
- live logs;
- raw stack traces.
