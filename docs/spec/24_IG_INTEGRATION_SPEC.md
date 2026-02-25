# 24 — IG Integration — SPEC v1 — 2026-02-25

Документ описывает безопасную интеграцию Instagram как **слоя доверия** (trust layer), **ускорителя сделок** (deal accelerator) и **точки монетизации** (через PRO‑возможности), без регрессий и без зависимости критичных путей от внешних API.

Связанные документы:
- `docs/00_CURRENT_STATE.md` — текущее состояние (source of truth)
- `docs/01_SECURITY_INVARIANTS.md` — инварианты монетизации/безопасности
- `docs/20_CONTACTS_MODEL.md` — structured contacts + Brand Pass + anti‑bypass
- `docs/spec/20_HOME_HUB_SPEC.md` — `/start`, payload priority, fail‑open
- `docs/spec/21_MENU_SPEC.md` — навигационный контракт (`ret`, Back/Menu/Home)
- `docs/spec/22_OFFER_WIZARD_SPEC.md` — визард оффера (финальные экраны)

---

## Назначение
Instagram должен перестать быть «ещё одним полем профиля» и стать:
- **Trust signal** для бренда до оплаты (снижение риска фрода)
- **Скоростью** для сделки после оплаты (контакты/инсайты/публикации)
- **PRO‑слоем** (дополнительная ценность для креатора), но без влияния на core‑монетизацию Brand Pass

---

## Инварианты (нельзя ломать)
1) **Ни одного вызова Instagram API в hot paths**: меню/хабы/рендер карточек/витрин/кнопок.
2) Любые внешние fetch:
   - только по явной кнопке пользователя, либо
   - через cron/outbox, с кешированием в Redis.
3) **Монетизация не зависит от IG API**:
   - unlock/Brand Pass/кредиты работают только по DB‑truth и нашим процессам.
4) Instagram handle/URL = контакт ⇒ **paywall**:
   - **до unlock нельзя раскрывать @handle или ссылку** (иначе обход Brand Pass).
   - допустимо показывать **только бейдж доверия** (без контакта).
5) Верификация должна быть **проверяемой**:
   - нельзя “ставить verified по кнопке” без подтверждения.
6) Deep‑link `/start` с IG‑payload имеет приоритет над `ui_mode` и любыми hub‑screen (payload priority).
7) Fail‑open для просмотра, fail‑closed для действий:
   - если IG API недоступен → UI не падает, просто нет обновления статусов/статистики.

---

## 1) Два уровня интеграции

### Level B — Universal Verification (без OAuth к аккаунту пользователя)
Цель: дать массовый trust signal для любых аккаунтов (включая personal), без доступа к данным пользователя.

**Метод v1 (рекомендуемый): код‑коммент под нашим verification‑постом**.

Flow:
1) В боте креатор выбирает «Верифицировать Instagram».
2) Бот выдаёт код вида `COLLABKA-XXXXXX` (привязка к `wsId`, TTL).
3) Креатор оставляет комментарий с этим кодом под **закреплённым verification‑постом** на нашем официальном аккаунте (например `@collabka_offers`).
4) Cron (раз в 10–15 минут) читает комментарии **только** у нашего поста и матчится по коду.
5) При успехе:
   - `profile_contacts.ig.verified = true`
   - `verified_method = 'comment'`
   - `verified_at = now()`
   - `handle` сохраняется **из автора комментария** (а не из ввода пользователя)
   - `pending` очищается

Плюсы:
- не требует доступа к аккаунту креатора
- верификация доказуемая (код + автор комментария)
- простая поддержка и низкий риск регрессий

Ограничения:
- это trust‑badge, а не доступ к инсайтам/публикациям

### Level A — Compliant (Graph OAuth) для Business/Creator
Цель: дать прод‑фичи (insights/publish) строго для pro‑аккаунтов через официальный OAuth.

Дает (после аппрува и правильных permissions):
- публикации (Reels/Posts/Stories) через outbox
- insights → кеш в Redis
- (опционально позже) messaging/DM, если будет смысл и аппрув

Ограничения:
- только Business/Creator аккаунты
- токены требуют безопасного хранения и контроля истечения

---

## 2) Data model (расширение structured contacts)
Храним всё в `profile_contacts` (JSONB) согласно `docs/20_CONTACTS_MODEL.md`.

### `profile_contacts.ig`
```json
{
  "ig": {
    "verified": true,
    "verified_at": "2026-02-25T12:34:56Z",
    "verified_method": "comment",
    "handle": "username",
    "url": "https://www.instagram.com/username/",
    "pending": {
      "code": "COLLABKA-ABC123",
      "expires_at": "2026-02-25T13:34:56Z"
    },
    "graph": {
      "ig_user_id": "1784140...",
      "page_id": "123456789",
      "access_token_encrypted": "...",
      "token_expires_at": "..."
    }
  }
}
```

Правила:
- `handle/url` считаются **контактом** ⇒ показывать только **после unlock**.
- `verified` (бейдж доверия) можно показывать **до unlock**, без раскрытия контакта.
- `pending` используется только для Level B и живёт ограниченное время.
- `graph.*` присутствует только при Level A.

### Redis cache (только Level A)
- `ig:stats:<wsId>` TTL 24h → `{ followers, er_30d, posts_30d, last_updated }`

---

## 3) UX и отображение

### Витрина креатора (brand view)
- **До unlock**: 
  - `Instagram: ✅ verified` если `profile_contacts.ig.verified=true`
  - **без** `@handle` и **без** URL
- **После unlock**:
  - показываем `@handle` + URL
  - если есть Redis cache: добавляем “followers • ER • posts/30d”

### Профиль креатора
Кнопка: `🔗 Instagram: верифицировать`
- открывает экран выбора:
  - `✅ Universal (код‑коммент)`
  - `🔐 OAuth (Business/Creator)`

### Deep‑links
- `/start ig_verify` (без параметров) → открыть выбор метода
- `/start igv_<hint>` допустим как shortcut, но hint **не** является источником истины (истина — автор комментария / OAuth)

---

## 4) Новые action keys (добавить в registry)
- `a:ws_ig_verify` — старт экрана IG verify (выбор метода)
- `a:ws_ig_verify_comment` — выдача кода и инструкция по комментарию
- `a:ws_ig_verify_oauth` — старт OAuth (Level A)
- `a:ws_ig_verify_status` — “проверить статус” (локально показывает pending/verified, без внешних вызовов)

> Guards: `require_redis` для выдачи кода/TTL и троттлинга. Просмотр verified‑badge — DB‑truth, без Redis.

---

## 5) Cron (Level B) — проверка комментариев

### Job
- `ig_verify_tick`
- Частота: 10–15 минут

### Гарантии
- Redis lock `lock:cron:ig_verify_tick` (token‑based, safe unlock)
- Все апдейты в БД — idempotent:
  - если `verified=true` → пропуск
  - если `pending` истёк → очистить pending, не ставить verified
  - если код найден → one‑time перевод в verified и очистка pending

### Деградации
- если IG API недоступен → тик завершает работу без падения; статус pending остаётся, бейдж не выставляется.

---

## Value & Metrics
Раздел фиксирует **зачем** это делаем и **как измеряем**, чтобы фичи развивались микро‑шагами и не расползались.

### Ценность для креатора
- **Выше доверие → выше шанс unlock/accept** (меньше страха у бренда).
- Для проф‑аккаунтов (Level A): **ускорение сделки** через публикации и видимые метрики (после unlock).
- Потенциальный PRO‑слой: публикации/шаблоны/приоритеты без влияния на core‑монетизацию.

### Ценность для бренда
- **Снижение риска**: “verified” сигнализирует, что креатор реальный.
- После unlock: меньше ручной проверки → быстрее “✅ Принять”.

### Ценность для платформы (Collabka)
- рост конверсии на “денежных кликах” (unlock/accept)
- снижение фрода/спама
- новая ось PRO‑монетизации (Level A), не трогая Brand Pass правила

### KPI (что считаем)
**1) Adoption (креаторы)**
- `ig_verify_started` — доля креаторов, начавших flow
- `ig_verify_completed` — доля креаторов, получивших `verified=true`
- `ig_verified_share` — verified / total активных креаторов

**2) Trust → Money (бренды)**
Сравнение сегментов “verified creators” vs “not verified”:
- `profile_view_to_unlock_rate` = unlock_success / profile_views
- `unlock_to_accept_rate` = accept_success / unlock_success
- `time_to_accept` = медиана времени от первого просмотра витрины до `✅ Принять`

**3) Revenue**
- `credits_spend_per_brand_week` (до/после rollout)
- `repeat_purchase_7d` — доля брендов, купивших кредиты повторно за 7 дней

**4) Quality / Risk**
- `spam_delete_rate` по заявкам после просмотра витрины
- `support_tickets_ig_verify` (если есть отдельный префикс)

### Где фиксируем события (без DB в hot paths)
Рекомендуемый подход:
- использовать существующий audit‑контур (prefix‑ивенты), а агрегаты считать через метрики/выгрузки
- события добавлять только в обработчики действий (кнопки/cron), не в рендеры

Рекомендуемые audit prefixes:
- `ig.verify.start`
- `ig.verify.pending_issued`
- `ig.verify.success`
- `ig.verify.expired`
- `ig.oauth.linked`
- `ig.stats.refresh_ok` / `ig.stats.refresh_fail`

### Rollout / A-B
- Rollout 10% → 50% → 100% по workspace_id bucket.
- A/B фокус: влияние бейджа на `profile_view_to_unlock_rate` и `unlock_to_accept_rate`.

