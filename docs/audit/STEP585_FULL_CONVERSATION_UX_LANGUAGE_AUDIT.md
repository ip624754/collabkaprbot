# STEP585 — Full Conversation & UX Language Audit

**Project:** Collabka PR Bot  
**Baseline:** STEP584 FULL  
**Baseline SHA-256:** `c96070189be22e9117467628a6889ee044f7473108de7c2accaf307997b37d42`  
**Date:** 2026-07-18  
**Mode:** HEAVY review  
**Runtime changes:** none

## Executive conclusion

The bot already has a mature set of product flows. The strongest screens are the ones that were previously handled as narrow UX waves: filtered empty states, application recovery, focused done screens and several payment receipts.

The remaining problem is no longer “bad wording in a few places”. It is **language-system drift** caused by years of incremental development.

The same product currently speaks through several vocabularies:

- Russian product language;
- English product language;
- internal engineering language;
- admin/operator language;
- historical copy from older flows.

That drift creates five P1 risks:

1. users see infrastructure details that belong only in diagnostics;
2. Home/Menu and role names do not form a stable mental model;
3. `Inbox / Заявки / Диалоги / Сделки` are not described as one lifecycle;
4. the invite module still exposes internal reward and tracking terms;
5. paid products and spendable units are not separated consistently.

No P0 copy defect was confirmed. No wording issue was proven to cause an immediate irreversible loss by itself. But the P1 findings are launch-quality defects because they increase support load, misclick risk and distrust around payments/rewards.

**Status:** `AUDIT COMPLETE / COPY SYSTEM READY / RUNTIME COPY REFACTOR REQUIRED`

## 1. Governance and review method

This STEP follows the project governance layer:

- Truth Boundary: source-confirmed facts are separated from recommendations;
- Zero Regressions: no callback, state, DB, payment or reward logic was changed;
- narrow-step discipline: audit and copy system first, runtime rewrite in bounded waves;
- audit trail: source examples, inventory and a follow-up roadmap are committed.

Review lenses:

- **Jobs:** remove choice noise and make the primary action obvious;
- **Vitalik:** describe the mechanism as it really works;
- **Woz:** prefer simple words and minimal state surface;
- **Durov:** Telegram-first rhythm and short mobile labels;
- **Toly:** ship in bounded waves without stopping product work;
- **Armani:** one coherent product voice and visual discipline;
- **samczsun:** inspect ambiguity around access, deletion, payment and abuse;
- **Hasu:** state costs, limits and failure modes without hype.

Writing constraints were also derived from the founder-level/no-AI-tone instructions supplied for this work:

- precision over impressive language;
- short active sentences;
- facts and consequences instead of slogans;
- no synthetic marketing filler;
- no hidden uncertainty behind confident wording.

## 2. Audit scope

### In scope

- Telegram messages;
- menu and button labels;
- onboarding and role selection;
- creator, brand, curator, moderator and admin Telegram surfaces;
- empty, error, success and confirmation states;
- invite/reward copy;
- monetization and payment copy;
- async Telegram notifications;
- terminology and navigation logic;
- relevant existing UX/spec documentation.

### Source reviewed

Primary runtime:

- `src/bot/bot.js` — 41,579 lines / 1,742,130 bytes;
- `src/bot/payments/starsHandlers.js`;
- `src/bot/gwAccess.js`;
- `src/bot/gwNotify.js`;
- `src/bot/cron.js`;
- `src/bot/routes/callbacks.js`;
- `api/qstash/monetization-retry.js`;
- supporting admin text/read-model modules.

Existing UX contracts reviewed:

- `docs/28_TELEGRAM_COPY_CLARITY_SWEEP_STEP481.md`;
- `docs/29_COPY_HOTFIX_WAVE1_STEP482A.md`;
- `docs/14_BRAND_TEAM_UX_V4.md`;
- `docs/process/09_ADMIN_UX_STANDARD.md`;
- relevant copy/empty-state/navigation smoke contracts.

### Out of scope

- changing callbacks;
- changing product state machines;
- changing reward math;
- changing payment semantics;
- visual browser testing of admin web;
- production Telegram traversal.

## 3. Mechanical evidence

A conservative token scan over 52 active JavaScript files found:

- 2,007 static button occurrences;
- 605 unique static button labels;
- 330 message calls with a static first text argument.

Generated evidence:

- `docs/audit/STEP585_BUTTON_LABEL_INVENTORY.csv`;
- `docs/audit/STEP585_MESSAGE_INVENTORY.md`.

These counts deliberately undercount dynamic template messages and over-represent repeated navigation labels. They are inventory evidence, not a quality score.

## 4. Severity model

- **P0:** wording can directly cause irreversible money/data/security harm now.
- **P1:** blocks clean launch-quality UX or creates material confusion/support/risk.
- **P2:** important consistency, comprehension or operator-efficiency issue.
- **P3:** polish, density or low-frequency cleanup.

## 5. Findings

### P0 — none confirmed

The audit did not confirm a user-facing text that by itself bypasses a confirmation, changes payment amount, disables a guard or performs an irreversible mutation.

This is not a statement that every live flow is safe. Runtime behavior was not reverified in this docs-only STEP.

---

### P1-01 — Internal infrastructure is exposed to ordinary users

**Evidence**

Examples in active source:

- `src/bot/bot.js:3750–3752` — `Нужна миграция 026_brand_managers` and `В Neon должна быть таблица brand_managers`;
- `src/bot/bot.js:6105` — migration/table detail for `brand_profiles`;
- `src/bot/bot.js:6701`, `7607`, `7678`, `23440`, `29772+` — user-facing instructions to apply SQL migration in Neon;
- `src/bot/bot.js:21098` — user-facing `BOT_USERNAME` / ENV instruction;
- invite screens expose `invite-tracking`, `invite-layer`, `invite ledger`, `completed profile`, `Pro-target`.

**Why this matters**

- the user cannot act on most of this information;
- infrastructure names reduce trust and look like an unfinished product;
- schema details belong in logs/admin alerts, not public conversation;
- revealing internal mechanics can help an attacker map failure surfaces, even when no secret is exposed.

**Required change**

User copy:

```text
Раздел временно недоступен.
Мы уже видим проблему. Попробуй позже или открой поддержку.
```

Operator alert/log:

```text
brand_profiles missing; migration 024 not applied in target DB
```

**Acceptance**

No ordinary creator/brand/participant screen contains Neon, Redis, QStash, migration numbers, table names, ENV names or internal ledger terms.

---

### P1-02 — Home and Menu do not form a stable navigation contract

**Evidence**

Active visible variants:

- `🏠 Home` across global footers;
- `🏠 Домашняя` in `renderHomeHub` (`src/bot/bot.js:4123`);
- `🏠 Главное меню` in role menus (`3938+`, `4369+`);
- `📋 Меню` as a separate destination;
- `▶️ Продолжить: <режим>` leading to `a:menu`.

Runtime meaning:

- `a:home` = mode/role hub;
- `a:menu` = menu for the current role/context.

**Why this matters**

The user sees two top-level destinations but their names overlap. `Home`, `Домашняя` and `Главное меню` look synonymous even though the callbacks are not.

**Required contract**

- `🏠 Домой` → role/mode hub;
- `📋 Меню` → current-role menu.

Replace `▶️ Продолжить: Бренд` with a named outcome such as:

```text
📋 Открыть меню бренда
```

**Trade-off**

This label exists in many tests and footers. It must be migrated with source contracts, not global search/replace.

---

### P1-03 — Role language mixes person, channel and English terms

**Evidence**

- `Creator`;
- `Creator / канал`;
- `Креатор / Блогер`;
- `Я канал / Creator`;
- `Бренд / Заказчик`;
- `Я бренд`.

Examples:

- `src/bot/bot.js:4288–4298` role selection;
- `src/bot/bot.js:4482` onboarding;
- creator menu/home copy around `3977`, `4371`, `4384`.

**Problem**

A creator is a person/role. A channel is a connected Telegram object. Conflating them makes later phrases such as “current channel” harder to parse.

**Canonical terms**

- `Креатор` — role;
- `Канал` — connected object;
- `Бренд` — role.

**Recommended role screen**

```text
🏠 Добро пожаловать

Как ты хочешь работать?

Креатор — подключить канал, публиковать офферы и отвечать брендам.
Бренд — искать креаторов, отправлять заявки и вести сделки.
```

Buttons:

```text
🎬 Я креатор
🏷 Я бренд
```

---

### P1-04 — `Inbox`, applications, dialogs and deals are not one coherent lifecycle

**Evidence**

Brand menu simultaneously shows:

- `📥 Inbox`;
- `📝 Заявки`;
- `📌 Сделки`.

Home copy says:

```text
📥 Inbox — диалоги и новые заявки.
```

That conflicts with a separate `Заявки` button on the same screen (`src/bot/bot.js:4055`, `4154`).

Creator surfaces also use:

- `Мои заявки`;
- `Заявки брендов`;
- `Inbox`;
- `Диалог`.

**Mechanism-honest lifecycle**

```text
Оффер / профиль → Заявка → Диалог → Сделка
```

A dialog can be opened through more than one path. The screen copy should state the exact state rather than fold all incoming objects into “Inbox”.

**Canonical visible label**

Prefer `📥 Диалоги` over `📥 Inbox` in Russian user UX.

**Required explainer**

On the brand menu or first-run hint:

```text
Заявки — новые обращения.
Диалоги — переписка.
Сделки — принятые коллаборации по этапам.
```

**Risk**

Without this distinction, users can expect a new application in the wrong section or assume that an opened dialog already means an accepted deal.

---

### P1-05 — Invite Center still exposes mixed RU/EN and internal reward semantics

**Evidence**

Active invite copy includes:

- `7 days Pro` / `30 days Pro`;
- `pts`;
- `completed profile`;
- `invite ledger`;
- `invite-tracking`;
- `join`;
- `Pro-target`;
- source labels `inline`, `card`, `link`;
- English inline result titles/descriptions.

Representative source:

- `src/bot/bot.js:2653`;
- `2668–2669`;
- `2715–2722`;
- `2754–2761`;
- `2873–2880`;
- `2968`, `3085`, `3115`, `3179`.

**Why this matters**

Invite rewards are an incentive mechanism. Any ambiguity around what activates a reward, what can be spent and what “pending” means creates support and abuse pressure.

**Canonical language**

- `7 дней PRO`;
- `30 дней PRO`;
- `баллы`;
- `в ожидании`;
- `доступно`;
- `использовано`;
- `Активация засчитывается, когда новый пользователь заполнил основной профиль.`

**Mechanism honesty**

The activation condition must remain tied to the real DB rule. Copy must not say “completed profile” if the exact implementation checks a different event. STEP586 must verify the query/service before final wording.

---

### P1-06 — Paid products and spendable units are not separated consistently

**Evidence**

User-visible terms include:

- PRO;
- Brand Plan;
- Brand Plan Start / Pro;
- Brand Pass;
- credits / кредиты;
- Smart Matching;
- Featured;
- Founder Sale;
- Telegram Stars.

The same user can see `Brand Plan`, `Brand Pass` and `Кредиты` without a concise distinction.

**Canonical mechanism**

- `Brand Plan` — subscription/access;
- `кредиты` — spendable units;
- `покупка кредитов` — top-up;
- `PRO` — creator subscription;
- `Умный подбор` — user-facing feature label;
- `Продвижение` — user-facing feature label.

**Required purchase-screen contract**

Every paid screen states:

- what is received;
- price in Stars;
- duration/quantity;
- what action will consume credits, if relevant;
- what happens after payment;
- support route for delayed apply.

**Positive finding**

Several receipts already explain delayed auto-apply and support recovery. Preserve that pattern.

---

### P1-07 — Active spelling defect in a primary creator action

**Evidence**

`офер` appears in active user copy:

- `src/bot/bot.js:6213` — `➕ Создать офер`;
- `src/bot/bot.js:15799`;
- `src/bot/bot.js:23217`.

Canonical spelling: `оффер`.

This is a safe first-wave correction because it does not change behavior.

---

### P2-01 — Generic access errors often provide no recovery

**Evidence**

Conservative scan found 30 direct static `Нет доступа.` message calls. Additional callback toasts and dynamic variants exist.

**Problem**

`Нет доступа.` can mean:

- stale button;
- object deleted;
- manager access revoked;
- wrong active channel;
- role mismatch;
- owner-only action;
- temporary data failure.

These are different states and need different recovery paths.

**Required approach**

Do not globally replace the phrase. Classify each call by failure reason and use bounded helpers:

- stale object;
- permission changed;
- wrong role/context;
- missing setup;
- temporary service issue.

---

### P2-02 — Address style drifts between `ты` and `вы`

Examples:

- most bot copy uses `ты`;
- account deletion says `Мы очистили ваши контакты/профили` (`src/bot/bot.js:4310`);
- blocked-account messages use `Ваш аккаунт ... Обратитесь` (`20196`, `24033`, `24932`).

Canonical Telegram style: `ты / твой`.

Legal/public documents may use `вы` separately.

---

### P2-03 — Button labels are sometimes too generic or too long

Examples:

- `▶️ Продолжить: <режим>`;
- `➡️ Далее`;
- `✅ Готово`;
- `🎯 Smart Matching (подбор офферов)`;
- `⭐️ Brand Plan (включено 10 каналов/мес)`;
- `🧑‍💼 Режим менеджера бренда`.

Generic wizard labels are acceptable when the next step is obvious. Top-level labels should name the destination.

Long entitlement details belong in the message body, not the button.

---

### P2-04 — Feature overlap is not explained

Brand users see:

- Лента креаторов;
- Фильтры креаторов;
- Подбор в ленте;
- Поиск креаторов;
- Smart Matching.

The distinction may be valid in code, but it is not stated in one stable vocabulary.

Target:

- `Лента` — browse current offers;
- `Фильтры` — narrow the feed;
- `Поиск` — direct profile matching/search;
- `Умный подбор` — paid/automated matching, if that is the real mechanism.

Each entry point should have a one-line first-use explanation.

---

### P2-05 — Emoji meaning drifts

Examples:

- `📨` is used for invites and applications;
- `📣` is used for channels, notices, reminders and publication;
- `📝` is used for applications, notes and drafts;
- `📥` is tied to English `Inbox` rather than a Russian object name.

This does not require removing emoji. It requires a small icon contract for top-level objects.

---

### P2-06 — Admin/operator copy mixes diagnostics and primary navigation

Examples:

- `Outbox`;
- `К composer`;
- `DM`;
- `Approve / Reject`;
- `Transparency log`;
- `Hard-skip`;
- `Featured / Matching`.

Technical language is allowed in admin diagnostics. It should not be the only explanation on a primary action.

Preferred:

- `Исходящие` with an `Outbox` diagnostic subtitle;
- `К рассылке` instead of `К composer`;
- `Личное сообщение` instead of `DM` in primary labels;
- `Одобрить / Отклонить`;
- `Журнал розыгрыша`.

---

### P2-07 — Some share/marketing text has synthetic tone

Examples:

- `Я нашёл удобный Telegram-бот...`;
- `быстрый старт без лишнего шума`;
- promotion copy with exclamation-heavy framing.

Better share copy states the use case:

```text
Collabka помогает брендам и креаторам находить друг друга в Telegram.
Здесь можно публиковать офферы, отправлять заявки и вести диалоги.
```

No claim of convenience is needed. The product behavior is the proof.

---

### P3-01 — Picker microcopy remains partly system-like

Examples:

- `Текущее:`;
- `Выбери значение:`;
- `Выбрано:`;
- `Выбери теги:`.

Preferred:

- `Сейчас выбрано:`;
- `Выбери один вариант.`;
- `Выбрано тегов: N.`;
- `Можно выбрать несколько.`

This was already identified in earlier copy docs and can be finished in a bounded wave.

---

### P3-02 — Formatting and punctuation need a final pass

Observed patterns:

- inconsistent terminal punctuation in helper lines;
- slash-heavy labels (`UGC / Офферы`, `Бренд / Заказчик`);
- English/Russian capitalization around PRO/Pro;
- occasional dense button rows;
- long entitlement text inside buttons.

These are lower priority after taxonomy and safety copy.

## 6. Strong existing patterns to preserve

### Clear zero-state recovery

The prior filter copy waves correctly use:

- what is empty;
- what to change;
- a reset route.

### Focused done screens

Several flows use one primary CTA plus `Ещё действия`. This is good Telegram information architecture.

### Stale application recovery

Messages such as:

```text
Заявка не найдена или удалена.
Открой «Заявки брендов» и выбери заявку ещё раз.
```

are materially better than `Нет доступа.`.

### Payment support fallback

Receipts that say payment was received but auto-apply failed, then route to support, are mechanism-honest and should remain.

### Confirmations with cost and remaining balance

Invite redemption already shows cost and remaining balance. The structure is right; the vocabulary needs localization.

## 7. Copy readiness score

| Area | Score | Comment |
|---|---:|---|
| Core task clarity | 7/10 | Most flows are usable; top-level taxonomy drifts. |
| Navigation coherence | 5/10 | Home/Menu distinction is not visible. |
| Terminology consistency | 4/10 | Role, Inbox and invite terms mix languages. |
| Error recovery | 6/10 | Strong in some flows, generic in many older paths. |
| Monetization honesty | 7/10 | Receipts are often good; product naming remains unclear. |
| Telegram readability | 7/10 | Many screens are compact; some buttons and explainers are dense. |
| Tone coherence | 6/10 | Good direct copy coexists with technical and synthetic language. |
| Operator clarity | 7/10 | Strong diagnostics, but primary labels mix internal jargon. |
| Abuse/misclick resilience | 7/10 | confirmations exist; ambiguous lifecycle/access terms remain. |
| Documentation readiness | 9/10 | STEP585 adds a canonical copy system, registry and rollout plan. |

**Overall conversation/copy readiness:** **6.5/10**

This score describes language readiness, not runtime readiness.

## 8. Required documents created

- `docs/product/COLLABKA_COPY_SYSTEM.md`;
- `docs/product/TERMINOLOGY_REGISTRY.md`;
- `docs/audit/STEP585_MESSAGE_INVENTORY.md`;
- `docs/audit/STEP585_BUTTON_LABEL_INVENTORY.csv`;
- `docs/roadmap/STEP586_COPY_REFACTOR_ROADMAP.md`;
- `docs/process/07_WORK_HISTORY_STEP585.md`.

## 9. Recommended next step

Proceed with **STEP586A — Copy Safety & Taxonomy Foundation**.

Narrow scope:

1. remove ordinary-user infrastructure leakage;
2. fix `офер` → `оффер`;
3. normalize invite reward vocabulary only where it is user-visible;
4. fix `ты/вы` drift in bounded account/access screens;
5. add source contracts for forbidden user-facing infrastructure terms;
6. do not change callbacks, DB or reward/payment mechanics.

Do not combine this with the global Home/Menu migration. That needs a separate STEP586B because it touches many footer contracts and source smokes.

## 10. Truth boundary

### Verified

- current STEP584 archive and source were inspected;
- all major Telegram conversation families were reviewed;
- button inventory was generated from active source;
- concrete P1/P2/P3 findings are source-backed;
- documentation and rollout contracts were added;
- runtime code was not modified.

### Not verified

- live Telegram rendering;
- actual mobile line wrapping;
- production data-dependent branches;
- real user comprehension;
- complete admin web visual copy pass;
- whether every internal term is reachable in current production configuration.

### Honest status

`SOURCE AUDIT COMPLETE / LIVE UX NOT VERIFIED / NO RUNTIME COPY FIXES APPLIED`
