# Collabka Copy System

**Status:** canonical product-writing contract
**Introduced:** STEP585
**Applies to:** Telegram user UX, Telegram admin/operator UX, public product copy, transactional notifications, empty/error/success states.

## 1. Purpose

Collabka should sound like one product built by one team.

The user should understand, without guessing:

- where they are;
- what state the object is in;
- what the next action does;
- what can fail;
- what cannot be undone.

Copy is part of the product contract. It is not decoration.

## 2. Voice

The default voice is:

- direct;
- calm;
- concrete;
- human;
- technically honest;
- short enough for Telegram.

Write like an experienced founder explaining the next action to a busy user.

Do not sound like:

- a marketing department;
- a support script;
- an internal diagnostic console;
- an AI-generated explainer.

## 3. Core writing rules

### 3.1 One screen — one decision

A screen may contain context, state and a next step. It should not teach the whole product at once.

Preferred structure:

```text
[Heading]

[Current state]

[What happens next]
```

### 3.2 One sentence — one idea

Break long explanations. Telegram is read quickly and often on mobile.

### 3.3 Action before abstraction

Bad:

```text
Для дальнейшего взаимодействия с системой необходимо перейти к соответствующему разделу.
```

Good:

```text
Открой «Заявки» и выбери нужную заявку.
```

### 3.4 Facts before promises

Bad:

```text
Мы гарантируем безопасную и удобную работу.
```

Good:

```text
Перед списанием бот покажет сумму и попросит подтверждение.
```

### 3.5 No internal implementation language in user UX

Do not show ordinary users:

- migration names;
- table names;
- Redis / Neon / QStash;
- ENV variable names;
- callback keys;
- ledger implementation terms;
- internal status names such as `completed_profile`.

User-facing fallback:

```text
Раздел временно недоступен.
Мы уже видим проблему. Попробуй позже или открой поддержку.
```

Operator-facing diagnostics may keep technical details in admin-only surfaces.

### 3.6 Do not over-explain obvious controls

A button called `Открыть диалог` does not need a paragraph explaining that it opens the dialog.

### 3.7 No hype without a measurable fact

Avoid:

- «революционный»;
- «уникальный»;
- «без лишнего шума»;
- «максимально удобный»;
- «лучший»;
- «новый уровень»;
- generic founder/startup enthusiasm.

For a promotion, state the price and deadline. That is enough.

## 4. Address and grammar

### User-facing Telegram bot

Use informal singular Russian:

- `ты`;
- `твой`;
- imperative singular: `открой`, `выбери`, `проверь`.

Do not switch to `вы / ваш` inside the same product flow.

### Admin/operator surfaces

Use concise imperative language. Technical terms are allowed only when they help the operator act.

### Public/legal documents

May use `вы`, but the style must remain concrete.

## 5. Message anatomy

### 5.1 State screen

```text
🏷 Профиль бренда

Заполнено: 3 из 4 полей.
Не хватает ссылки на бренд.

Добавь ссылку, чтобы профиль появился в каталоге.
```

### 5.2 Empty state

Every empty state must answer two questions:

1. Why is it empty?
2. What can the user do now?

```text
По этим фильтрам креаторы не найдены.

Ослабь один фильтр или сбрось их.
```

### 5.3 Error state

Use this sequence:

```text
Что не получилось.
Почему это могло произойти, если причина известна.
Что делать дальше.
```

Example:

```text
Не получилось открыть заявку.
Она удалена или у тебя больше нет доступа.

Вернись к списку и обнови его.
```

Never stop at `Нет доступа.` when a safe recovery route exists.

### 5.4 Success state

Say what changed. Then show the next useful action.

```text
Заявка отправлена бренду.

Бренд увидит её в разделе «Заявки».
```

### 5.5 Destructive action

Before confirmation, state:

- the exact object;
- the consequence;
- whether it is reversible.

Confirmation button should name the action:

```text
🗑 Удалить профиль
```

Not:

```text
✅ Да
```


## 5.6 Collaboration lifecycle

Use state, not screen history, to name the object:

```text
Оффер / профиль → Заявка → Диалог → Сделка → Этап / закрытие
```

Rules:

- `заявка` is a request before acceptance;
- `диалог` is the message thread and may exist before or after acceptance;
- `сделка` is an accepted application only;
- a deal title or deal-stage control requires authoritative acceptance evidence;
- user copy says `этап сделки`, not implementation terms such as `deal_stage` or `stage`;
- `Диалоги` must not be used as a generic destination for applications.

Do not infer a deal from a button route, status label or conversation alone. The source of truth is persisted acceptance evidence.

## 6. Button rules

### 6.1 Label the outcome

Preferred:

- `➕ Создать оффер`;
- `✍️ Написать бренду`;
- `💬 Открыть диалог`;
- `🎛 Изменить фильтры`;
- `🗑 Удалить черновик`.

Avoid when context is not fully obvious:

- `Продолжить`;
- `Далее`;
- `Готово`;
- `Открыть`;
- `Назад` without a stable previous screen.

Generic buttons are acceptable inside a short linear wizard when the result is visually obvious.

### 6.2 Navigation contract

Target vocabulary:

- `📋 Меню` — menu for the current role/context;
- `🏠 Домой` — role/mode hub and global escape;
- `⬅️ К списку` — return to a list;
- `⬅️ К карточке` — return to an object card;
- `❌ Отмена` — leave an input or mutation flow without applying changes.

`Назад` should not secretly mean `cancel`, `save`, or `go to home`.

### 6.3 Button length

Prefer 12–28 visible characters. Long labels wrap badly on mobile.

A label longer than roughly 34 characters needs a deliberate reason.

### 6.4 Emoji

One emoji per button is usually enough.

Emoji must keep one stable meaning:

- `📥` — incoming communication;
- `💬` — dialog/reply;
- `📝` — application/draft;
- `📌` — deal/work item;
- `🎛` — filters/settings;
- `🏷` — brand/category;
- `🎬` — creator content/offer;
- `💳` — credits/payment;
- `⭐️` — subscription/PRO;
- `🗑` — destructive removal.

Do not reuse the same icon for unrelated top-level concepts.

## 7. Canonical product terms

The full registry is in `docs/product/TERMINOLOGY_REGISTRY.md`.

Core rules:

- `креатор` — person/role;
- `канал` — Telegram channel connected by the creator;
- `бренд` — brand/advertiser role;
- `оффер` — a creator's public collaboration offer;
- `заявка` — a request sent before acceptance;
- `диалог` — conversation between parties;
- `сделка` — accepted collaboration tracked through stages;
- `кредиты` — units spent by a brand for bounded paid actions;
- `Brand Plan` — subscription product;
- `PRO канала` — creator subscription for one selected channel.

Do not combine a role and an object into one label such as `Creator / канал`.

## 8. Product names and English

English is allowed only when it is a deliberate product name:

- Collabka;
- PRO;
- Brand Plan;
- Founder Sale, while the campaign exists.

User-facing Russian copy should not use:

- Home;
- Inbox;
- Creator;
- Outbox;
- composer;
- DM;
- Matching;
- Featured;
- points / pts;
- completed profile;
- invite ledger;
- invite-tracking.

Internal code identifiers remain unchanged unless a separate engineering STEP changes them.

## 9. Invite and reward language

The ordinary-user module is `Приглашения`, not `Инвайты`.

Use:

- `приглашён` — a new user completed the first bot start through the link and attribution was stored;
- `активирован` — the invited user completed the main brand or channel profile;
- `в ожидании` — earned points are inside the confirmation window and cannot be used;
- `доступно` — confirmed earned points minus points already used;
- `использовано` — points spent on an activated reward.

Current source-backed reward contract:

```text
+2 балла — первый запуск нового пользователя по ссылке; подтверждение через 24 часа.
+10 баллов — заполнен основной профиль бренда или канала; подтверждение через 48 часов.
100 доступных баллов — 7 дней PRO.
250 доступных баллов — 30 дней PRO.
```

Every public screen must state the relevant exclusions:

- opening the link without starting the bot gives no points;
- self-referral does not count;
- an already existing account does not count;
- an incomplete profile gives no activation reward;
- one invited user can produce each earn reward once.

Pending points must never be presented as spendable. Do not use `pending`, `confirmed`, `redeemed`, `join`, `pts`, `invite ledger` or reward-type identifiers in ordinary-user copy.

Redeem confirmation must show the reward, exact point cost, available balance, remaining balance and target rule. Success must show the actual target returned by the transaction.

The source guard is:

```bash
npm run smoke:invite-language-mechanism-honesty-contract
```

## 10. Monetization language

Paid copy is a mechanism contract. Before a purchase, state:

1. what object is being bought;
2. exact amount and currency;
3. exact result or quantity;
4. scope or target;
5. duration when time-bounded;
6. the next action after payment;
7. delayed-application and refund boundary.

Canonical distinction:

- `Brand Plan` — time-bounded subscription and access for a brand;
- `кредиты` — expendable internal brand units;
- `покупка кредитов` — a top-up, not a subscription;
- `PRO канала` — time-bounded creator entitlement for one selected channel;
- `Умный подбор` — one-time matching service;
- `Продвижение` — one-time visibility service;
- `Founder Sale` — campaign name that applies an existing entitlement;
- `размещение в официальном канале` — separate moderated placement.

Never say or imply:

- credits are Stars or money;
- buying credits activates or extends Brand Plan;
- creator PRO includes Brand Plan or brand credits;
- payment guarantees publication before moderation;
- Stars are used only for new dialogs;
- a refund is automatic when no automatic refund path exists.

Credit copy must reflect all source-backed spend surfaces. Current contract:

- opening a new dialog;
- accepting an application and opening a deal;
- unlocking contacts when the configured cost is above zero;
- messages inside an already-open dialog are free.

A delayed-success receipt must state the actual applied result. Generic `Оплата получена` is not enough when the system knows the product, duration or quantity.

Current recovery boundary:

```text
Платёж не применился: /paysupport.
Автоматического возврата нет.
```

Do not hardcode a price, duration or quantity when runtime configuration/catalog already owns the value. Keep invoice titles within 32 characters and descriptions within 255 characters; use the shared builders rather than ad hoc clipping.

Source enforcement after STEP586E:

```bash
npm run smoke:monetization-paid-product-clarity-contract
```

## 11. Access, error and recovery language

Access copy is part of the authorization boundary.

When the source cannot safely distinguish deletion from changed permission, use neutral non-enumerating language. Do not confirm that a private object exists or belongs to another user.

Canonical recovery classes:

- channel;
- application;
- dialog;
- offer;
- giveaway;
- folder;
- role;
- generic.

Preferred structure:

```text
[Object] недоступен.

Кнопка могла устареть, а статус или доступ — измениться.

Вернись к актуальному списку и открой объект заново.
```

Recovery actions may return to a list, current-role menu or global home. They may not grant access, retry a destructive mutation or skip an object-level guard.

Do not globally replace `Нет доступа.`. First classify the route from authoritative state. Explicit admin/operator denial may remain short when no additional detail is safe or useful.

Empty-state contract:

```text
[What is empty]

[Why, only when source-backed]

[One useful next action]
```

Technical failures remain in structured operator diagnostics. Ordinary-user copy must not expose Redis, Neon, QStash, table names, internal IDs, callback keys or raw exception reasons.

Source enforcement after STEP586F:

```bash
npm run smoke:access-error-empty-state-recovery-contract
```

## 12. Operator language

Admin-only screens may use QStash, Redis, Neon, Outbox and DM when they are operationally necessary.

Even there:

- explain the operator action;
- separate current state from diagnosis;
- do not use unexplained shorthand in primary buttons;
- use Russian labels where the English word adds no precision.

Example:

```text
📤 Исходящие сообщения
```

instead of:

```text
📤 Outbox
```

The diagnostic body may still say `QStash delivery failed`.

## 13. Review lenses

Every copy change should pass these questions.

### Jobs

Can the user see the main action immediately?

### Vitalik

Does the text describe the real mechanism, not the desired story?

### Woz

Can the same meaning be written with fewer moving parts?

### Durov

Does it read naturally in Telegram and fit on mobile?

### Toly

Can the change ship in a narrow wave without blocking the product?

### Armani

Does this screen sound and look like the rest of Collabka?

### samczsun

Can ambiguity cause a wrong payment, wrong deletion, permission mistake or abuse path?

### Hasu

Are trade-offs, costs and failure states stated without drama or false certainty?

## 14. Pre-merge checklist

- [ ] One term for one object.
- [ ] No internal infrastructure in user copy.
- [ ] No ungrounded promise or hype.
- [ ] No `вы/ваш` drift in Telegram user flows.
- [ ] Error includes a recovery action when possible.
- [ ] Empty state includes the next step.
- [ ] Mutating button names the mutation.
- [ ] Payment text states price and result.
- [ ] Buttons fit Telegram mobile width.
- [ ] Callback behavior did not change unless the STEP explicitly allows it.
- [ ] Existing copy contracts and navigation smokes were updated deliberately.

## 15. Source enforcement after STEP586A

The user/operator boundary is guarded by:

```bash
npm run smoke:copy-safety-taxonomy-contract
```

For ordinary-user failures:

- show the product consequence;
- give a usable recovery route;
- do not show migrations, tables, ENV keys or deployment instructions.

For operators:

- keep a structured diagnostic code;
- keep the exact relation, migration, column or configuration key needed to repair the issue;
- never interpolate raw internal failure reasons into user copy.

This guard is intentionally bounded. Admin and QA diagnostics may use technical vocabulary when the surface is access-controlled and the detail is operationally useful.
