# Backoffice Authorization and Mutation Matrix

**Статус:** target contract for STEP589+

## 1. Roles

| Role | Source | Web scope |
|---|---|---|
| Operator | approved admin Telegram ID | read surfaces, notes, draft preparation |
| Founder | `SUPER_ADMIN_TG_IDS` | operator scope + founder read layer + tightly bounded sensitive actions |
| Telegram-only operator | bot admin guards | current authoritative path for risky mutations |

Не создавать новые web roles, пока нет реальной команды с разными обязанностями.

## 2. Current write boundary

Разрешено сейчас:

- user note set/clear;
- notice draft create/update;
- founder test-send to self;
- founder revoke all web sessions.

Запрещено сейчас:

- payment apply/refund;
- grant/revoke plan or credits;
- ban/unban;
- deal-stage mutation;
- giveaway draw/claim mutation;
- mass broadcast start;
- runtime toggle;
- invite ledger correction;
- destructive data operation.

## 3. Gate for any new write

Новый web-write допускается только когда одновременно есть:

1. canonical service shared with Telegram/admin or isolated transaction service;
2. explicit role gate;
3. object-level authorization;
4. idempotency key or transaction guard where applicable;
5. confirmation screen with exact effect;
6. durable PostgreSQL audit record;
7. old/new state capture;
8. bounded rollback or compensating action;
9. source contract;
10. live operator acceptance evidence.

## 4. Audit truth

Текущий `admin_web` audit хранится в Redis:

```text
max 100 entries
TTL 14 days
```

Этого достаточно для текущих мягких действий, но недостаточно для:

- payment/entitlement mutation;
- access changes;
- deal or giveaway mutation;
- permanent operational accountability.

**Release gate:** до первого нового money/access/state-changing web action создать durable audit sink в PostgreSQL или использовать существующий canonical DB audit ledger.

## 5. CSRF and request provenance

Текущая защита:

- `SameSite=Strict`;
- `HttpOnly`;
- `Secure`;
- same-origin fetch;
- no-store responses.

До расширения write surface добавить:

- strict `Origin`/`Host` validation;
- per-session CSRF token или signed action nonce;
- rate limit для login challenge;
- action-specific replay guard.

Это не требуется для docs-only STEP588 и не должно внедряться скрыто внутри UI-шага.

## 6. Two-person rule

Двухэтапное подтверждение имеет смысл только для действий с высокой ценой ошибки:

- массовая рассылка;
- выдача/отмена entitlement;
- ручная payment correction;
- draw override;
- global access/session revoke.

Для заметок и черновиков оно создаст лишнюю бюрократию и не нужно.
