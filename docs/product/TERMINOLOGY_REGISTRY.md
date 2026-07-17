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
| Creator subscription | `PRO` | Creator paid tier | Pro-target, Pro reward |
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

## 3. Navigation contract

| Destination | Canonical visible label | Current internal callback examples |
|---|---|---|
| Global role/mode hub | `🏠 Домой` | `a:home` |
| Current role menu | `📋 Меню` | `a:menu` |
| Previous local list | `⬅️ К списку` | context-specific |
| Previous object card | `⬅️ К карточке` | context-specific |
| Cancel input/mutation | `❌ Отмена` | context-specific |

Internal callbacks are not renamed by copy-only STEPs.

## 4. Product names

Allowed as proper product names:

- `Collabka`;
- `PRO`;
- `Brand Plan`;
- `Founder Sale` during the campaign.

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

## 5. Invite vocabulary

| Internal term | User-facing term |
|---|---|
| invite / join | приглашение / новый пользователь |
| activated | активирован |
| completed profile | заполнил основной профиль |
| pending | в ожидании |
| confirmed | подтверждено |
| redeemed | использовано |
| points / pts | баллы |
| 7 days Pro | 7 дней PRO |
| 30 days Pro | 30 дней PRO |
| invite ledger | история баллов |
| invite tracking | учёт приглашений |

## 6. Infrastructure terms

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

## 7. Grammar and capitalization

- `креатор`, `бренд`, `оффер`, `заявка`, `диалог`, `сделка` — lowercase inside a sentence.
- `PRO` — uppercase.
- `Brand Plan` — exact product name.
- `Collabka` — exact brand name.
- Correct spelling: `оффер`, never `офер`.
- Use one address style in Telegram: `ты / твой`.
