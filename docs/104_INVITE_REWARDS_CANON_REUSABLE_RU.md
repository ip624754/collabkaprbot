# Invite Rewards Canon — Reusable for Other Telegram Bots / Projects

## Назначение

Этот документ фиксирует узкий переиспользуемый reward-canon поверх invite-layer для других Telegram-ботов и проектов.

Он нужен для случаев, когда invite/referral layer уже существует, и хочется добавить награды без скатывания в спам, MLM-механику или награждение за пустые открытия ссылок.

Документ специально держится узким:
- quality referral outcomes first
- no reward for raw open
- no reward-bait
- no money-first mechanics
- product-native redeem catalog
- anti-abuse first

---

## Базовый принцип

Награждать не за шум, а за подтверждённый качественный результат invite.

Правильная логика:
- `raw_open = 0`
- `existing_user = 0`
- `self_invite = 0`
- слабый сигнал допускается только на уровне реального join
- основной reward должен идти за `Activated`

---

## Универсальный event → points baseline

### Event A — invited_joined
Условие:
- новый пользователь впервые пришёл по invite
- invite attribution валиден
- не self-invite
- не existing user

Рекомендуемый baseline:
- `pending: +2`
- `confirmed: +2`

### Event B — invited_activated
Условие:
- приглашённый пользователь дошёл до meaningful state

Рекомендуемый baseline:
- `pending: +10`
- `confirmed: +10`

### Event C — raw_open
Рекомендуемый baseline:
- `0`

### Event D — existing_user_hit
Рекомендуемый baseline:
- `0`

### Event E — self_invite
Рекомендуемый baseline:
- `0`

---

## Pending / confirmed contract

Чтобы не плодить мусорные награды, reward не должен сразу считаться финальным.

### Joined
- сначала `pending`
- подтверждение через `24h`

### Activated
- сначала `pending`
- подтверждение через `48h`

Если продукт требует более жёсткого anti-abuse, окна можно увеличить, но стартовый канон выше уже достаточно практичен.

---

## Что такое Activated

`Activated` всегда должен значить **meaningful state**, а не просто факт запуска бота.

Примеры по типам проектов:
- directory bot → completed profile
- creator/brand bot → completed profile / first usable listing
- duel/game bot → joined first real duel
- giveaway bot → entered first valid giveaway
- utility bot → completed first useful action

Правило:
не смешивать сразу 5 разных activation-смыслов без отдельного product-step.

---

## Balance model

Минимальная правильная модель баланса:
- `Available points`
- `Pending points`
- `Redeemed points`

Правила:
- pending нельзя тратить
- redeemed уже списаны
- available = confirmed minus redeemed
- reward logic лучше строить на ledger, а не на одном числе баланса

---

## Где показывать rewards

### Основной surface
Лучшее место — invite screen.

Показывать:
- `Invited`
- `Activated`
- `Points`
- `Pending`
- `Redeemed`
- `Next reward`

### Вторичный surface
Профиль / account screen:
- короткий `Points balance`

Не надо тащить каталог, историю и сложную reward-логику во все экраны сразу.

---

## Redeem catalog — канонический старт

Запускать rewards лучше с узким продуктовым каталогом.

Рекомендуемый baseline:
- `100 points → 7 days Pro`
- `250 points → 30 days Pro`

Допустимые дальнейшие product-native награды:
- profile boost
- priority exposure
- temporary higher limits
- unlock of existing non-money perk

Что не надо делать первым релизом:
- money rewards
- cashout
- token payouts
- random lotteries
- multi-level referral

---

## Anti-abuse rules

Обязательный минимум:
- no reward for raw open
- no reward for self-invite
- no reward for existing user
- one invited user can produce join reward only once
- one invited user can produce activation reward only once
- pending is not spendable
- high-value redeem should leave audit trail
- suspicious rewards must be rejectable

Минимальные ledger statuses:
- `pending`
- `confirmed`
- `rejected`
- `redeemed`

---

## Copy contract

Reward layer не должен звучать как спам-механика.

Хорошо:
- `Invite points`
- `Referral points`
- `<Brand> points`

Плохо:
- `earn fast`
- `invite everyone`
- `free money for friends`

---

## Frozen reusable default

Если нужен один дефолтный reusable contract для нового бота, брать так:

- `raw_open = 0`
- `existing_user_hit = 0`
- `self_invite = 0`
- `invited_joined = +2`
- `invited_activated = +10`
- `joined confirm = 24h`
- `activated confirm = 48h`
- `balance = available / pending / redeemed`
- `main display = invite screen`
- `secondary display = profile balance`
- `starter redeem catalog = 100 → 7 days Pro, 250 → 30 days Pro`
- `ledger required`
- `no money rewards`
- `no multi-level referral`

---

## Итог

Этот canon нужен, чтобы в новых ботах не изобретать invite rewards заново и не скатываться в дешёвую growth-механику.

Правильная последовательность такая:
1. сделать invite-layer truth
2. зафиксировать rewards contract
3. только потом реализовывать ledger / redeem / anti-abuse
