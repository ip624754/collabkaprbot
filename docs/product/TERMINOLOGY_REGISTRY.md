# Collabka Terminology Registry

**Status:** canonical vocabulary contract
**Introduced:** STEP585

This registry separates product language from internal engineering identifiers.

## 1. User-facing canonical terms

| Concept | Canonical label | Meaning | Do not use as a synonym |
|---|---|---|---|
| Person who creates content | `креатор` | User role/person | Creator, блогер, автор, канал |
| Connected Telegram property | `канал` | Telegram channel owned/managed by a creator | креатор |
| Advertiser/company side | `бренд` | Brand role | заказчик, компания, рекламодатель in navigation |
| Creator's public offer | `оффер` | Public collaboration offer shown to brands | офер, предложение, объявление |
| Request before acceptance | `заявка` | Request sent by one side to another | сделка, диалог |
| Conversation | `диалог` | Message thread between sides | Inbox |
| Accepted collaboration | `сделка` | Accepted work item with stages | заявка, диалог |
| Search results stream | `лента креаторов` | Browseable creator offers | выдача, marketplace, feed |
| Brand browse surface | `каталог брендов` | Brand profiles for creators | витрина брендов, лента брендов |
| Creator public profile | `витрина канала` or `профиль канала` | Public creator/channel presentation | workspace |
| Subscription for brands | `Brand Plan` | Paid subscription/access | Brand Pass, кредиты |
| Spendable brand units | `кредиты` | Units used for specific actions | Brand Plan, баллы |
| Creator subscription | `PRO канала` | Paid tier for one selected creator channel | Brand Plan, кредиты, Pro-target |
| Invite module | `Приглашения` | Invite link, statistics, history and rewards | Инвайты |
| Invite reward units | `баллы` | Invite reward balance | pts, points, credits |
| Global role hub | target: `Домой` | Switch role / global escape | Home, Главное меню |
| Current-role navigation | `Меню` | Menu for current role/context | Домой |

## 2. Lifecycle contract

The user-facing lifecycle should be described consistently:

```text
Оффер / профиль
→ Заявка
→ Диалог
→ Сделка
→ Этап сделки / закрытие
```

### `Оффер`

A creator publishes an offer. A brand can discover it and start contact.

### `Заявка`

A pre-acceptance request. It is not yet a deal.

### `Диалог`

The communication thread. A dialog may exist before or after a deal, depending on the product path. Copy must not claim that every dialog is already a deal.

### `Сделка`

An accepted collaboration with operational stages. Use this word only when acceptance is confirmed by the real mechanism.

Authoritative source rule for the current implementation:

```text
meta.deal.accepted_by_user_id is present
AND meta.deal_stage is present
```

A conversation, `in_progress` label or forged callback is not enough to call an object a deal.

## 3. Navigation contract

| Destination | Canonical visible label | Current internal callback examples |
|---|---|---|
| Global role/mode hub | `🏠 Домой` | `a:home` |
| Current role menu | `📋 Меню` | `a:menu` |
| Previous local list | `⬅️ К списку` | context-specific |
| Previous object card | `⬅️ К карточке` | context-specific |
| Cancel input/mutation | `❌ Отмена` | context-specific |

Internal callbacks are not renamed by copy-only STEPs.

## 4. Recovery vocabulary

| Internal condition | Canonical user wording | Rule |
|---|---|---|
| stale/deleted/inaccessible channel | `Канал недоступен` | Do not disclose which condition is true unless source evidence is safe to reveal |
| stale/deleted/inaccessible application | `Заявка недоступна` | Return to the application list |
| stale/inaccessible conversation | `Диалог недоступен` | Return to `Диалоги` |
| stale/removed/inaccessible offer | `Оффер недоступен` | Return to the offer list/feed |
| stale/inaccessible giveaway | `Розыгрыш недоступен` | Return to the giveaway list |
| stale/deleted/inaccessible folder | `Папка недоступна` | Return to the folder list |
| role/permission mismatch | `Раздел недоступен` | Return to the current-role menu |
| unclassified safe fallback | `Раздел недоступен` | Do not invent a technical reason |

`Не найдено` is allowed only when object existence is not private and source evidence proves absence. `Нет доступа` is allowed for explicit operator/admin gates, but ordinary-user recovery should include a safe next action when possible.

## 5. Product names

Allowed as proper product names:

- `Collabka`;
- `Brand Plan`;
- `Founder Sale` during the campaign.

### Monetization contract

| Product object | Canonical user label | Exact meaning | Must not be confused with |
|---|---|---|---|
| Brand subscription | `Brand Plan` | Time-bounded access for a brand; may include credits and configured tool limits | кредиты, PRO канала |
| Spendable brand units | `Кредиты` | Internal expendable units used for configured brand actions | Stars, money, Brand Plan, invite баллы |
| Creator entitlement | `PRO канала` | Time-bounded paid tier for one selected creator channel | Brand Plan, credits |
| One-time matching | `Умный подбор` | Paid or plan-included matching run with configured result count | Brand Plan itself |
| One-time visibility | `Продвижение` | Paid or plan-included placement/visibility period | official-channel moderation |
| Campaign | `Founder Sale` | Campaign that applies an existing Brand Plan or channel-PRO entitlement | separate subscription type |
| Moderated placement | `Размещение в официальном канале` | Separate paid submission that still requires moderation/publication decision | Продвижение |

Internal plan IDs such as `start`, `pro`, `basic`, `max`, invoice payload prefixes and callback keys remain internal.

Preferred Russian feature labels:

| Current/mixed label | Preferred label |
|---|---|
| Inbox | Диалоги |
| Smart Matching | Умный подбор |
| Matching | Подбор |
| Featured | Продвижение |
| Outbox | Исходящие |
| DM | Личное сообщение |
| Transparency log | Журнал розыгрыша |
| Approve / Reject | Одобрить / Отклонить |
| Creator | Креатор |
| Home | Домой |

## 6. Invite vocabulary

| Internal/state term | User-facing term | Exact meaning |
|---|---|---|
| invite module | `Приглашения` | Link, statistics, history, points and rewards |
| joined / invite attribution | `приглашён` | New user completed first bot start through the link and attribution was stored |
| activated | `активирован` | Invited user completed the main brand or channel profile |
| pending | `в ожидании` | Earned points inside the confirmation window; not spendable |
| confirmed / available | `доступно` | Confirmed earned points minus used points |
| redeemed | `использовано` | Points already spent on a reward |
| points / pts | `баллы` | Invite reward units; not money and not transferable |
| 7 days Pro | `7 дней PRO` | Reward costing 100 available points |
| 30 days Pro | `30 дней PRO` | Reward costing 250 available points |
| invite ledger | `история баллов` | User-readable recent point events |
| invite tracking | `учёт приглашений` | Attribution and activation statistics |

Current event contract:

- `+2` points after the first eligible bot start, pending `24` hours;
- additional `+10` points after main profile completion, pending `48` hours;
- self-referral, existing accounts and raw link views are not eligible;
- incomplete profile means no activation reward.

Internal identifiers remain unchanged in code and operator diagnostics.

## 7. Operator vocabulary

| Internal/machine term | Primary operator label | Diagnostic rule |
|---|---|---|
| Outbox | `Исходящие` | Redis source and raw delivery status may remain below |
| DM | `Личное сообщение` | Template ID and placeholder keys may remain below |
| Approve / Reject | `Одобрить / Отклонить` | Keep `approve / deny` and `approved / denied` as machine values |
| Transparency log | `Журнал розыгрыша` | Keep event codes and IDs |
| Audit Log | `Журнал аудита` | Keep action and object identifiers |
| hard-skip list | `Недоступные чаты` | Keep `hard-skip`, TTL and reason codes |
| hard-skip hits | `Пропуски доставки` | Keep raw filter value and delivery IDs |
| broadcast draft | `Черновик рассылки` | Keep raw status in diagnostics |
| first batch | `Первая партия` | Keep batch counters |
| post-run report | `Итог доставки` | Keep sent/queued/blocked/failed counters |
| Comms workspace | `Коммуникации` | Keep `broadcasts / broadcast_sent_log` in diagnostics |

Primary buttons name the operator result. Technical terms are not removed when they are needed to diagnose or repair production.

## 8. Infrastructure terms

The following terms are operator-only and must not appear in ordinary user flows:

- Neon;
- Redis;
- QStash;
- migration number/name;
- database table names;
- ENV variable names;
- callback keys;
- SQL filenames;
- retry worker internals;
- ledger row types.

User-facing replacement:

```text
Раздел временно недоступен.
Попробуй позже или открой поддержку.
```

Admin/operator diagnostics may preserve technical detail after a human-readable heading.

## 9. Grammar and capitalization

- `креатор`, `бренд`, `оффер`, `заявка`, `диалог`, `сделка` — lowercase inside a sentence.
- `PRO` — uppercase.
- `Brand Plan` — exact product name.
- `Collabka` — exact brand name.
- Correct spelling: `оффер`, never `офер`.
- Use one address style in Telegram: `ты / твой`.
