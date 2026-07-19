# Collabka Backoffice — текущая поверхность

**Baseline:** STEP586H1
**Audit STEP:** STEP588
**Статус:** source-confirmed inventory

## 1. Что уже существует

Collabka уже имеет полноценный web-admin. Это не заготовка и не один dashboard.

Текущая реализация:

```text
admin.html
  → scripts/admin-web.js
  → styles/admin-web.css
  → /api/admin-web-auth
  → /api/admin-web-read
  → /api/admin-web-write
  → src/lib/adminWeb/*
  → canonical DB/query/runtime services
```

Фактический размер поверхности:

| Компонент | Размер |
|---|---:|
| `scripts/admin-web.js` | 4 575 строк |
| `styles/admin-web.css` | 2 268 строк |
| `src/lib/adminWeb/readModels.js` | 1 166 строк |
| `src/lib/adminWeb/runtime.js` | 1 150 строк |
| serverless API entrypoints | 3 |
| client view functions | 9 |
| client functions | 180 |
| CSS class selectors | 283 |
| admin-web smoke contracts | 48 |
| historical web-admin docs | 56 |

## 2. Маршруты

| Route | Пользовательская задача | Server read model | Write surface |
|---|---|---|---|
| `/admin/login` | безопасный вход | auth challenge/session | login challenge, OTP/Telegram approval |
| `/admin` | общий статус и следующий шаг | `getOverviewSummary()` | нет |
| `/admin/users` | поиск, фильтры, когорты, экспорт, сравнение | `getUsersList()` | нет; экспорт/copy только audit side effect |
| `/admin/users/:id` | карточка пользователя | `getUserDetail()` | note create/update/clear |
| `/admin/runtime` | infra/config/queues/retry truth | `getRuntimeSummary()` | нет |
| `/admin/payments` | read-only платёжный разбор | `getPaymentsSummary()` | нет |
| `/admin/payments/:id` | payment drilldown и follow-up | `getPaymentDetail()` | нет |
| `/admin/comms` | черновики и preview | `getCommsSummary()` | draft create/update, founder test-send |
| `/admin/help` | операторская справка | client-only | нет |
| `/admin/founder` | founder read layer и session control | `getFounderSummary()` | revoke all web sessions |

## 3. Read API

Единый endpoint:

```text
GET /api/admin-web-read?section=<section>
```

Поддерживаемые секции:

- `overview`
- `users`
- `users_export`
- `users_bulk`
- `user`
- `payments`
- `payment`
- `comms`
- `founder`
- `runtime`
- `control_surface`

Это правильное решение для текущего Vercel budget: новый backoffice не должен создавать отдельную serverless function на каждый экран.

## 4. Write API

Единый endpoint:

```text
POST /api/admin-web-write?action=<action>
```

Текущие действия:

| Action | Gate | Side effect | Audit |
|---|---|---|---|
| `set_note` | session | сохранить заметку пользователя | да |
| `clear_note` | session | удалить заметку пользователя | да |
| `create_notice_draft` | session | создать draft | да |
| `update_notice_draft` | session | обновить draft | да |
| `test_send_notice` | founder | отправить preview самому фаундеру | да |

Отдельный auth action:

- `revoke_all` — founder-only, завершает все web-сессии.

Массовая рассылка, payment apply, entitlement mutation, giveaway draw, access/ban и runtime toggles намеренно не доступны через web-admin.

## 5. Auth architecture

Web-admin использует:

- обязательный `ADMIN_WEB_SECRET`;
- Redis challenge с коротким TTL;
- подтверждение в Telegram или одноразовый код;
- HMAC-подписанную decision URL;
- Redis session;
- `HttpOnly`, `Secure`, `SameSite=Strict` cookie;
- founder role по `SUPER_ADMIN_TG_IDS`;
- global session revoke marker.

Fail-closed поведение сохранено: без Redis/session/config доступ не открывается.

## 6. Что уже сделано хорошо

### Overview

- честный главный статус;
- один рекомендуемый следующий шаг;
- runtime/payment/user shortcuts;
- ручное обновление вместо fake realtime;
- visible control-surface snapshot.

### Users

Это самая зрелая часть web-admin:

- поиск и сегменты;
- URL-persisted working views;
- filters draft/apply contract;
- сортировки и когорты;
- готовые operator presets;
- compare/pin rail;
- basket и bulk copy;
- CSV export;
- sticky pagination;
- user detail;
- заметки;
- mobile-specific contracts.

### Runtime

- разделены `OK`, `Нужна проверка`, `Не настроено`, `Справочно`;
- incident strip;
- queue/retry/cooldown truth;
- control snapshot;
- env presence без раскрытия секретов;
- current state и operator next step.

### Payments

- applied/pending/fallback/failed taxonomy;
- read-only review;
- detail page;
- user follow-up route;
- отказ от скрытого ручного apply через web.

### Communications

- draft editor;
- audience preview;
- founder-only test send;
- без массового publish path.

## 7. Чего сейчас нет

Web-admin пока не покрывает четыре центральные операционные задачи:

1. **Коллаборации** — офферы, заявки, диалоги, сделки и зависшие lifecycle-состояния.
2. **Приглашения** — attribution, activation, pending/available/redeemed и anti-abuse review.
3. **Розыгрыши и модерация** — active/ending/draw/publish/claim evidence в одном web workspace.
4. **Единая очередь внимания** — список конкретных задач, а не только агрегированные warnings.

## 8. ORM

ORM в проекте не используется.

Текущий стек:

```text
node-postgres (`pg`)
→ query modules
→ admin read models
→ collapsed read/write API
→ static SPA
```

Это не дефект и не причина для миграции. ORM сейчас не даст достаточного выигрыша, но создаст:

- второй query layer;
- риск расхождения с существующими SQL invariants;
- большой migration/refactor blast radius;
- дополнительную цену в serverless cold path.

Решение STEP588: **не внедрять ORM и не переписывать текущий query core**. Новые admin read models должны использовать существующие canonical queries либо узкие параметризованные SQL-запросы с source contracts.
