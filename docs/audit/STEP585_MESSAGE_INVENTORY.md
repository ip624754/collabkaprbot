# STEP585 — Message and UI Surface Inventory

**Baseline:** STEP584 FULL  
**Baseline SHA-256:** `c96070189be22e9117467628a6889ee044f7473108de7c2accaf307997b37d42`  
**Audit date:** 2026-07-18  
**Mode:** HEAVY review / docs-only implementation

## 1. Mechanical source scan

Active JavaScript surface scanned:

- `src/**`
- `api/**`
- parked Instagram OAuth files excluded from active product truth.

Conservative token scan found:

- **52 active JavaScript files**;
- **2,007 static button occurrences**;
- **605 unique static button labels**;
- **330 message calls with a static first text argument**;
- dynamic template messages reviewed by render/flow family because they cannot be represented honestly by a flat literal count.

Generated inventory:

- `docs/audit/STEP585_BUTTON_LABEL_INVENTORY.csv`

The CSV is a review aid. It is not a canonical product dictionary. Dynamic labels and runtime-composed messages require flow-level review.

## 2. Surface families reviewed

| Family | Primary source | User | State | Main finding |
|---|---|---|---|---|
| Start / role selection | `src/bot/bot.js` → `renderRoleSelection`, onboarding handlers | all | REVIEWED | `Creator / канал`, `Креатор / Блогер`, `Бренд / Заказчик` mix role and object names. |
| Home / Menu | `renderHomeHub`, `renderMainMenu`, `renderCreatorCurrentMenu`, nav helpers | all | REVIEWED | `Home`, `Домашняя`, `Главное меню` describe two different destinations without a stable visible contract. |
| Creator channel management | workspace renderers and callbacks | creator | REVIEWED | channel/profile/workspace concepts are mostly understandable, but some user errors expose migrations and Neon. |
| Creator offer flow | `bxMenuKb`, offer wizard, offer lists/cards | creator | REVIEWED | active typo `офер`; `UGC / Офферы` and creator role English/Russian drift. |
| Brand profile | `renderBrandProfileHome`, advanced profile pickers | brand | REVIEWED | field structure is clear; missing-schema fallbacks expose DB/table/migration details. |
| Brand directory | filter and catalog renderers | creator | REVIEWED | prior copy waves improved density; picker wording and term registry still need unification. |
| Creator feed/search | BX filter/feed and profile matching renderers | brand | REVIEWED | `Лента`, `Поиск`, `Подбор в ленте`, `Smart Matching` overlap without a one-line distinction. |
| Applications | creator and brand application lists/cards | both | REVIEWED | labels are broadly clear, but `Inbox` is also described as holding new applications. |
| Dialogs | inbox/thread renderers and notifications | both | REVIEWED | visible label remains `Inbox`; recovery messages are stronger than generic errors elsewhere. |
| Deals | deal lists/cards/stages | brand | REVIEWED | `Сделки` is distinct in navigation, but lifecycle from application to dialog to deal is not explained consistently. |
| Invite center | invite hub, stats, points, history, redeem, share card | all | REVIEWED | largest RU/EN and mechanism-language drift: `completed profile`, `pts`, `7 days Pro`, `invite ledger`, `invite-tracking`. |
| Giveaways | creation, participant, winner, curator and log surfaces | creator/participant/curator | REVIEWED | generally action-oriented; `Transparency log` and several generic errors remain. |
| Monetization | PRO, Brand Plan, credits, Matching, Featured, payment receipts | creator/brand | REVIEWED | product names and mechanisms are not separated consistently; some buttons are too long. |
| Support | user ticket flow and admin replies | user/admin | REVIEWED | mostly clear; several messages mix Reply/Forward/DM and Russian. |
| Account / access | deleted, banned, permission and stale states | all | REVIEWED | pronoun drift (`ты` vs `вы`), 30 static `Нет доступа.` messages without recovery. |
| Admin Telegram | ops/comms/system/founder/users/payments | operator | REVIEWED | English operational terms are acceptable only when diagnostic; primary labels still mix RU/EN. |
| Async notifications | cron, QStash monetization retry, giveaway notifications | all/operator | REVIEWED | transactional copy is mostly concrete; navigation still uses `Home`/`Inbox`. |
| Admin web | `src/lib/adminWeb/*`, root admin shell | operator | REVIEWED AT TAXONOMY LEVEL | separate full visual pass remains useful; user request focused on bot conversation UX. |

## 3. Core navigation inventory

Current top-level visible concepts include:

- `🏠 Home`
- `🏠 Домашняя`
- `🏠 Главное меню`
- `📋 Меню`
- `▶️ Продолжить: <режим>`

The runtime meaning is not identical:

- `a:home` opens the role/mode hub;
- `a:menu` opens the current-role menu.

The current labels do not explain this distinction.

Target contract:

- `🏠 Домой` → role/mode hub;
- `📋 Меню` → current role/context menu.

This is a copy/IA migration, not a callback migration.

## 4. Role inventory

Current visible variants:

- `Creator`
- `Creator / канал`
- `Креатор / Блогер`
- `канал / Creator`
- `Бренд`
- `Бренд / Заказчик`
- `Я бренд`

Target contract:

- role: `Креатор`;
- connected object: `канал`;
- role: `Бренд`.

A person and a Telegram object must not share one label.

## 5. Collaboration object inventory

Current product objects:

- `оффер` — creator's public offer;
- `заявка` — pre-acceptance request;
- `Inbox` — dialog/incoming surface;
- `диалог` — thread;
- `сделка` — accepted collaboration.

Current contradiction:

- Home copy says `Inbox — диалоги и новые заявки`;
- the same menu presents `Inbox` and `Заявки` as separate buttons.

Target lifecycle:

```text
Оффер / профиль → Заявка → Диалог → Сделка
```

The implementation may allow a dialog through more than one path. Copy must describe the real path on that screen instead of pretending that every dialog is a deal.

## 6. Invite inventory

Visible invite vocabulary currently includes:

- `Инвайты`;
- `invite-tracking`;
- `join`;
- `completed profile`;
- `pts`;
- `7 days Pro`;
- `30 days Pro`;
- `Pro-target`;
- `invite ledger`;
- `attribution`;
- source labels `inline / card / link`.

Target vocabulary:

- `приглашения`;
- `новый пользователь`;
- `заполнил основной профиль`;
- `баллы`;
- `7 дней PRO`;
- `30 дней PRO`;
- `история баллов`;
- user-readable source labels only when they add value.

## 7. Monetization inventory

User-visible paid concepts:

- `PRO`;
- `Brand Plan`;
- `Brand Plan Старт / Про`;
- `Brand Pass`;
- `Кредиты`;
- `Smart Matching`;
- `Featured`;
- `Founder Sale`;
- Telegram Stars.

Target distinction:

- `PRO` — creator subscription;
- `Brand Plan` — brand subscription/access;
- `кредиты` — spendable brand units;
- `покупка кредитов` — top-up;
- `Умный подбор` — Russian visible feature label;
- `Продвижение` — Russian visible feature label;
- internal product IDs remain unchanged.

## 8. Error and recovery inventory

Conservative static-message scan found:

- `Нет доступа.` — 30 direct static message calls;
- additional dynamically composed access failures exist;
- strong recovery patterns already exist for stale application buttons and deleted objects.

Preferred error classes:

1. **stale object** — object removed or button outdated;
2. **permission changed** — user no longer has access;
3. **missing setup** — profile/channel/role requirement;
4. **temporary service issue** — retry/support;
5. **operator-only configuration issue** — technical detail only in admin.

Generic `Нет доступа.` should be replaced by class-specific text in waves. The audit does not recommend a global blind replacement.

## 9. Technical leakage inventory

Confirmed ordinary-user surfaces expose or can expose:

- `migration 026_brand_managers`;
- `migration 024_brand_profiles`;
- `brand_managers` and `brand_profiles` table names;
- Neon;
- `BOT_USERNAME`;
- `invite-layer`;
- `invite-tracking`;
- `invite ledger`;
- `completed profile`;
- `Pro-target`.

These are product defects, not cosmetic preferences.

User copy should show a safe temporary-unavailable state. The detailed cause belongs in logs, health/admin diagnostics and alerts.

## 10. Button inventory highlights

Confirmed active examples:

- spelling defect: `➕ Создать офер`;
- mixed language: `🏠 Home`, `📥 Inbox`, `✨ Я Creator / канал`;
- long feature labels: `🎯 Smart Matching (подбор офферов)`;
- operator English: `📤 Outbox`, `⬅️ К composer`, `Approve`, `Reject`, `Transparency log`;
- generic high-frequency actions: `Назад`, `Готово`, `Далее`, `Обновить`.

Generic labels are not automatically wrong. They need context review. The CSV flags candidates; it does not order blind replacements.

## 11. What is already strong

Do not rewrite good copy just to create symmetry.

Strong patterns confirmed in source:

- filtered empty states that suggest relaxing or resetting filters;
- stale application buttons that route back to the correct list;
- payment receipts that state the next support action when auto-apply fails;
- confirmation screens that show reward cost and remaining balance;
- local back labels such as `К списку` and `К карточке`;
- destructive actions that already use explicit confirmation in admin/giveaway paths;
- compact creator offer preview before publishing.

## 12. Truth boundary

Verified:

- active source files were mechanically scanned;
- major render and action families were reviewed against current code;
- exact examples and source locations are recorded in the STEP585 audit;
- no callback, DB, payment, reward, giveaway or production behavior was changed.

Not verified:

- every dynamic runtime combination in live Telegram;
- line wrapping on all devices;
- live state combinations requiring production data;
- admin web visual rendering;
- user comprehension through moderated usability testing.
