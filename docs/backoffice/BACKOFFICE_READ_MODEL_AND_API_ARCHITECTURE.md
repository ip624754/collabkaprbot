# Backoffice Read Model and API Architecture

## Decision

Сохранить текущую архитектуру:

```text
static SPA
+ collapsed API
+ canonical services/read models
+ PostgreSQL/Redis/QStash truth
```

Не переходить на новый framework или ORM в STEP589.

## 1. Почему collapsed API остаётся

Активный Vercel function budget уже близок к пределу:

```text
11 / 12
```

Поэтому новые backoffice domains добавляются как новые `section`/`action` внутри существующих endpoints:

```text
/api/admin-web-read?section=collaborations
/api/admin-web-read?section=operations
/api/admin-web-write?action=<bounded_action>
```

Не добавлять:

```text
/api/admin/offers
/api/admin/applications
/api/admin/deals
/api/admin/invites
...
```

## 2. Target read-model modules

Текущие крупные файлы не переписывать целиком. Использовать strangler extraction при изменении конкретного домена.

Целевая структура:

```text
src/lib/adminWeb/
  readModels.js                 # compatibility facade
  readModels/
    overview.js
    users.js
    collaborations.js
    payments.js
    communications.js
    operations.js
    founder.js
  runtime.js                    # compatibility facade
  runtime/
    health.js
    queues.js
    config.js
    incidents.js
  actions/
    notes.js
    drafts.js
    collaborationActions.js    # only after durable audit gate
```

Facade exports сохраняют текущие imports и уменьшают blast radius.

## 3. Target client modules

`scripts/admin-web.js` уже 4 575 строк. Не делать framework rewrite.

Постепенная структура:

```text
scripts/admin-web.js            # entrypoint/router
scripts/admin-web/
  shell.js
  api.js
  state.js
  views/overview.js
  views/users.js
  views/collaborations.js
  views/runtime.js
  views/payments.js
  views/comms.js
  components/*.js
```

Extraction выполняется только вместе с изменяемым экраном. Никакого one-shot split.

## 4. Read model rules

Каждый model возвращает:

```json
{
  "updatedAt": "ISO timestamp",
  "overall": { "state": "ok|warning|degraded|unknown", "label": "..." },
  "summary": {},
  "attention": [],
  "items": [],
  "hints": [],
  "truthBoundary": { "source": "db|redis|qstash|derived", "stale": false }
}
```

Не обязательно применять структуру к старым моделям сразу. Она обязательна для новых STEP589 models.

## 5. Query rules

- parameterized SQL only;
- bounded `limit`;
- no N+1 on list pages;
- no new hot-path DB read from shell/header;
- aggregation query separated from detail query;
- source timestamp included;
- stale/unknown shown explicitly;
- read model does not mutate business state;
- export/bulk audit side effect documented separately.

## 6. Cache policy

- auth/session/control flags: Redis;
- authoritative business state: PostgreSQL;
- UI state: URL/local JS state;
- no hidden browser cache for sensitive API (`Cache-Control: no-store`);
- no fake live polling by default;
- manual refresh remains acceptable until real operator demand proves otherwise.
