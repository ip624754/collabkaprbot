# STEP586G — Admin and Operator Vocabulary

**Date:** 2026-07-18
**Mode:** STANDARD with operational and authorization review
**Baseline:** STEP586F
**Status:** IMPLEMENTED / LOCAL QA PASS / LIVE OPERATOR UX NOT VERIFIED

## 1. Objective

Make Telegram admin and web-admin surfaces readable without removing the technical detail needed to operate production.

The STEP separates three layers:

1. **status** — what is happening now;
2. **diagnosis** — exact runtime, state or reason code;
3. **operator action** — what to open, approve, retry, export or inspect next.

This is a vocabulary and presentation STEP. It is not an admin redesign and does not change privileges, callback values, delivery mechanics or payment behavior.

## 2. Truth Boundary

### Verified from source and local execution

- primary Telegram operator labels use readable Russian terms for communications, outgoing messages, direct messages, moderation, audits, giveaways and delivery skips;
- web-admin communication labels use the same product terms as Telegram admin;
- exact diagnostics such as Redis, QStash, raw broadcast statuses, reason codes, callback IDs and database table names remain available in diagnostic blocks;
- admin-web login decisions show `Одобрить / Отклонить`, while machine decisions `approve / deny` and statuses `approved / denied` remain unchanged;
- hard-skip controls explain the operator consequence as `Недоступные чаты`, `Пропуски доставки` and `Разрешить доставку`, while raw `hard-skip` states remain visible as diagnostics;
- moderation controls use `Одобрить / Отклонить`; verification types use human labels with raw kind retained below;
- audit surfaces use `Журнал аудита`, `Действие`, `Пространство`, `Пользователь` and `Скачать TXT` while preserving raw action and object identifiers;
- existing callbacks, action-registry guards, audience values, login decisions and authorization boundaries remain unchanged;
- dedicated and affected regression contracts pass locally.

### Not verified

- Vercel Preview or production deployment;
- live Telegram admin traversal;
- live web-admin rendering on desktop or mobile;
- real Redis, QStash, Neon or Telegram delivery diagnostics;
- production moderator and operator workflows;
- remote STEP584 acceptance evidence;
- comprehension by real operators.

No live-green claim is made.

## 3. Canonical operator vocabulary

| Internal or mixed term | Primary operator label | Diagnostic detail retained |
|---|---|---|
| Outbox | `Исходящие` | Redis storage, raw delivery state, error text |
| DM | `Личное сообщение` / `Шаблоны личных сообщений` | template IDs, placeholder keys, Redis source |
| Approve / Reject | `Одобрить / Отклонить` | `approve / deny`, `approved / denied` |
| Transparency log | `Журнал розыгрыша` | event codes and IDs |
| Audit Log | `Журнал аудита` | action, workspace/user IDs, payload |
| hard-skip list | `Недоступные чаты` | `hard-skip`, reason codes, TTL |
| hard-skip hits | `Пропуски доставки` | raw reason key, broadcast/user IDs |
| broadcast draft | `Черновик рассылки` | draft type and raw status |
| first batch | `Первая партия` | batch counters and reason codes |
| post-run report | `Итог доставки` | sent/queued/blocked/failed values |
| Comms workspace | `Коммуникации` | `broadcasts / broadcast_sent_log` |

Technical vocabulary remains allowed only when it materially helps diagnosis or repair.

## 4. Telegram admin changes

### Communications

The primary hub now explains:

- system announcement;
- personal-message templates;
- outgoing-message journal;
- official-channel queue.

Canonical buttons:

```text
📣 Объявление
📌 Шаблоны сообщений
📤 Исходящие
📣 Официальный канал
```

### Broadcast composer and delivery

The broadcast flow now uses:

- `Редактор рассылки`;
- `Черновик`;
- `Тип сообщения`;
- `Примеры получателей`;
- `Проверка перед запуском`;
- `Проверка первой партии`;
- `Итог доставки`;
- `Что делать дальше`.

Raw statuses such as `PENDING`, `RUNNING`, `PAUSED`, `DONE` and reason keys remain in secondary diagnostic positions.

### Outgoing messages and templates

`Outbox` is no longer a primary label. The operator sees `Исходящие` and a plain explanation that this is the journal of messages sent from admin tools.

Template screens use `Шаблоны личных сообщений`, `собственный` and `стандартный`. Diagnostic source remains explicit:

```text
Redis custom
default bundle
```

### Moderation, giveaways and audit

Primary actions now use:

```text
Открыть
Одобрить
Отклонить
Журнал розыгрыша
Журнал аудита
Скачать TXT
```

Verification type labels are human-readable. The raw source kind remains visible in a diagnostic line.

### Delivery skips

The operator sees the consequence first:

```text
Недоступные чаты
Пропуски доставки
Статус доставки
Разрешить доставку
```

Raw technical truth remains below:

```text
hard-skip active
hard-skip absent
bot_blocked
chat_not_found
user_deactivated
```

Filter values and callback payloads remain unchanged.

## 5. Web-admin alignment

The communication workspace now uses the same visible objects as Telegram admin:

- `Коммуникации`;
- `Черновики`;
- `Недавние объявления`;
- `Исходящие`;
- `Снимок исходящих`;
- `Тестовые отправки`;
- `Отправить тест себе`.

Machine audience values remain:

```text
all
brands
creators
curators
managers
```

Visible labels are Russian. This preserves API/storage compatibility while removing internal shorthand from the operator surface.

Login confirmation now says that the request is waiting for approval. The decision values and signed URLs still use `approve` and `deny`.

## 6. Operational diagnostics preserved

The STEP does not hide technical facts needed for production work.

Examples retained:

- Redis and QStash availability;
- `broadcast_db_overload`;
- `qstash_reschedule_failed`;
- `official_publish_stuck`;
- `broadcasts / broadcast_sent_log`;
- raw broadcast status;
- hard-skip reason codes;
- callback IDs and Telegram/user identifiers;
- `approved / denied` decision status.

The difference is placement: a human status and action come first; exact diagnosis follows.

## 7. Preserved invariants

STEP586G does not change:

- callback IDs or destinations;
- action-registry type or guard;
- admin, moderator, curator or founder permissions;
- broadcast audience values;
- QStash, Redis or Neon behavior;
- broadcast queue, retry or hard-skip mechanics;
- official publication behavior;
- login decision values or signatures;
- payment provider, prices, ledger or entitlements;
- database schema or migrations.

No new deployable API endpoint was added.

## 8. Source enforcement

New command:

```bash
npm run smoke:admin-operator-vocabulary-contract
```

It is included in `preflight:source` and verifies:

- canonical human-readable labels on Telegram and web-admin surfaces;
- absence of selected English/internal primary labels in bounded operator sections;
- preservation of Redis, QStash, state codes and table diagnostics;
- preservation of `approve / deny` machine decisions;
- preservation of callback IDs, action types and guards;
- preservation of audience machine values.

Existing exact-copy contracts were updated rather than removed.

## 9. QA evidence

### PASS

- dedicated STEP586G operator vocabulary contract;
- affected Telegram admin contracts: operations, communications, system, outgoing messages, templates, QStash, hard-skip, audit, moderation, users and user-note return routes;
- affected web-admin contracts: communications and login;
- broadcast draft, first-batch safety and post-run report contracts;
- STEP586A–F regression contracts;
- callback registry: 553 references / 559 keys / 0 unresolved;
- dependency/runtime preflight;
- local runtime proof spine;
- staging acceptance source contract;
- package-lock consistency;
- Vercel function budget: 11 / 12 with the existing capacity warning;
- complete parallel syntax sweep: 224 JavaScript files;
- `npm audit --audit-level=high`: 0 vulnerabilities.

### Canonical source-preflight boundary

`npm run preflight:source` passed every reached assertion, registry and generator gate, including the STEP586G contract and updated admin-user export contract. It then exceeded the execution limit during the long sequential `node --check` sweep and did not print the final aggregate PASS line.

The complete JavaScript surface was checked separately in parallel: 224 / 224 files passed. No source assertion failure remains known after the intentional admin-user export copy update.

### Not live-verified

- Telegram admin traversal;
- web-admin rendering on desktop and mobile;
- Vercel deployment;
- real Redis, QStash, Neon and Telegram delivery diagnostics;
- production moderator, support and operator workflows;
- real-operator comprehension.

## 10. Risk and rollback

Primary risks:

- an old source contract rejecting an intentional label change;
- operator confusion if a raw diagnostic term is removed entirely;
- accidental change to callback or machine-value identity during copy cleanup;
- mixed terminology between Telegram and web admin.

Mitigations:

- dedicated bounded source guard;
- exact action-registry assertions;
- raw diagnostic terms retained;
- callback consistency check;
- one-file rollback per source surface plus full STEP586F baseline.

Rollback does not require a database migration.

## 11. Next STEP

Proceed with:

```text
STEP586H — Live Telegram Acceptance and Mobile Copy Pass
```

That STEP should validate real Telegram and web-admin rendering, mobile width, operator comprehension and remote staging evidence. It must not broaden into new product functionality.
