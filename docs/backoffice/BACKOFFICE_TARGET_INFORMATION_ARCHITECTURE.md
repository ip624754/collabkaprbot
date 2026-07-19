# Collabka Backoffice — Target Information Architecture

## Principle

Не переносить Telegram в браузер. Backoffice должен помогать управлять системой.

## Main navigation

### Работа

1. **Обзор** — главный статус и очередь внимания.
2. **Пользователи** — люди, роли, профили, подписки и контекст.
3. **Коллаборации** — офферы, заявки, диалоги, сделки.
4. **Коммуникации** — drafts, preview, delivery evidence.

### Контроль

5. **Платежи** — lifecycle и entitlement evidence.
6. **Операции** — приглашения, розыгрыши, модерация.
7. **Система** — runtime, queues, config presence.

### Управление

8. **Помощь** — runbook и operator rules.
9. **Фаундер** — founder-only policy/session layer.

Не делать отдельный top-level пункт для каждого DB entity.

## 1. Обзор

### First viewport

```text
[Состояние: НУЖНА ПРОВЕРКА]       [Обновлено 12:03]

1 задача требует действия
• Giveaways cron: последний успех 61 мин назад

[Открыть задачу] [Система]

Пользователи 1 284 | Активные офферы 86 | Payment signals 2
```

### Attention queue

Каждая строка:

```text
severity
объект
что произошло
возраст сигнала
owner action
ссылка на evidence
```

Не смешивать alert и task. Alert без допустимого действия остаётся в System, а не в owner queue.

## 2. Пользователи

Текущий экран сохраняется. Добавить только contextual links:

- коллаборации пользователя;
- invite history;
- payment/entitlement timeline;
- moderation/audit events.

Не добавлять новые rails без удаления или доказанной необходимости.

## 3. Коллаборации

Tabs:

```text
Офферы | Заявки | Диалоги | Сделки | Требует внимания
```

Карточка должна показывать:

- current lifecycle state;
- creator/brand;
- offer/application/deal IDs;
- last activity;
- accepted evidence;
- credits/payment dependency;
- stale or contradictory state;
- safe drilldown.

Первый STEP — read-only. Никаких deal-stage mutations.

## 4. Коммуникации

Сохранить current draft editor. Добавить позже:

- delivery status drilldown;
- hard-skip reason summary;
- outbox age;
- link to Telegram mass-send control.

Mass send остаётся Telegram-only до durable audit + confirmation gate.

## 5. Платежи

Сохранить read-only default.

Добавить:

- filter/pagination;
- product/entitlement result;
- linked user and related audit;
- delayed apply evidence;
- operator case state.

Manual correction не включать до отдельного CRITICAL STEP.

## 6. Операции

Internal tabs:

```text
Приглашения | Розыгрыши | Модерация
```

### Приглашения

- attribution;
- activation;
- pending/available/used;
- suspicious/self/existing-user exclusions;
- reward target evidence.

### Розыгрыши

- active/ending/completed;
- draw seed/hash evidence;
- winner/claim/publish state;
- lock/retry signals.

### Модерация

- pending creator/brand checks;
- official publish approvals;
- decision audit.

## 7. Система

Текущий Runtime сохраняется. Не превращать его в Prometheus replacement.

Добавить только:

- cron 24h continuity summary;
- latest successful run per job;
- current incident owner/status;
- evidence link.

## 8. Mobile

Web-admin mobile нужен для:

- проверить статус;
- открыть карточку;
- подтвердить, что задача существует;
- добавить note;
- посмотреть evidence.

Сложные bulk/export/compare workflows остаются desktop-first.
