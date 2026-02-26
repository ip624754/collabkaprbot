# 24 — IG INTEGRATION — SPEC v1 — 2026-02-26

**Назначение:** сделать Instagram не «ещё одним полем», а:
- **слоем доверия** (verified badge виден брендам *до* unlock),
- **ускорителем сделки** (handle + ссылка + stats *после* unlock),
- **точкой монетизации** (Level A / PRO-функции),
при этом **без регрессий**, **без лишних DB-запросов в hot paths**, **Neon-safe**.

Связанные документы:
- `docs/00_CURRENT_STATE.md`
- `docs/01_SECURITY_INVARIANTS.md`
- `docs/12_INFRA_CONTROL_PLANE.md`
- `docs/17_QSTASH_RUNBOOK.md` (паттерны: подпись, деградации)
- `docs/20_CONTACTS_MODEL.md` (Brand Pass unlock + anti-bypass)
- `docs/spec/20_HOME_HUB_SPEC.md`, `docs/spec/21_MENU_SPEC.md`, `docs/spec/22_OFFER_WIZARD_SPEC.md`

---

## 0) Инварианты (жёстко)

1) **Никаких Instagram API** в hot paths: меню, хабы, рендер витрины, генерация кнопок.
2) **Монетизация никогда не зависит от IG API**.
3) **IG handle = контакт ⇒ paywall**. До unlock нельзя раскрывать `@handle` и ссылку.
4) **Verified badge = trust signal ⇒ можно показывать до unlock** (без раскрытия контакта).
5) Любые изменения статусов/списаний/публикаций — **idempotent / exactly-once**.
6) Redis down → **fail-open**, DB down → **fail-closed** для критичных операций.

---

## 1) Два уровня интеграции

### Level B — Universal Verification (стартовый)
Подходит для *любых* аккаунтов.

Механика:
- Бот выдаёт код `COLLABKA-XXXXXX` (привязан к `wsId`).
- Креатор оставляет комментарий с кодом под **нашим** verification-постом `@collabka_offers`.
- Проверка выполняется асинхронно (cron):
  - матч по коду,
  - **handle и url сохраняются исключительно из автора комментария** (поле `username` автора). **Ввод пользователя игнорируется** — защита от подмены.

Результат:
- `verified=true` (badge можно показывать до unlock).
- `handle` сохраняется как контакт, но **показывается только после unlock**.

### Level A — Compliant OAuth (PRO)
Только Business/Creator, даёт publish/insights/DM (если получим permissions).

Правила:
- токены храним безопасно (encrypted),
- инсайты — **только Redis cache** (TTL 24h),
- отсутствие OAuth не ломает Level B.

---

## 2) Data model

Храним метаданные IG в `workspace_settings.profile_contacts` (JSONB):

```json
{
  "ig": {
    "verified": true,
    "verified_at": "2026-02-26T12:00:00.000Z",
    "verified_method": "comment" | "oauth",
    "handle": "username",
    "url": "https://www.instagram.com/username/",
    "pending": { "code": "COLLABKA-ABC123", "expires_at": "..." },
    "graph": { "ig_user_id": "...", "page_id": "...", "access_token_encrypted": "...", "token_expires_at": "..." }
  }
}
```

### Совместимость с текущим UI
Сейчас витрина использует legacy поле `workspace_settings.profile_ig`.

Правило:
- при успешной Level B верификации cron **может** синхронизировать `profile_ig = handle` (если поле пустое), чтобы:
  - handle автоматически попал в paywall-логику (уже готово),
  - бренд видел IG после unlock без отдельной переработки витрины.

---

## 3) UX правила

### Витрина креатора (brand-facing)
- **До unlock:** можно показать только trust-сигнал
  - `Instagram: ✅ verified`
  - **нельзя** показывать `@handle` и url.
- **После unlock:**
  - показываем `@handle` + url,
  - если есть кэш stats (Level A) — добавить “followers / ER / posts/30d”.

### Профиль креатора (owner-facing)
- Кнопка `🔗 Верифицировать IG`.
- Экран выбора: `Universal (код-коммент)` / `OAuth (скоро)`.
- Выдача кода + понятная инструкция.

---

## 4) Redis keys

- `ig_pending:<CODE>` (TTL = `IG_VERIFY_CODE_TTL_SEC`) → `{ wsId, created_at, expires_at }`
- `ig_ws_pending:<wsId>` (TTL = `IG_VERIFY_CODE_TTL_SEC`) → `<CODE>`

Цель: ускорить матчинги при cron и снизить DB нагрев.

---

## 5) Cron (следующий шаг после skeleton)

`/api/cron/ig-verify-tick`:
- Redis lock + (где нужно) SQL guard,
- читает комментарии на verification-посте (Graph для *нашего* аккаунта),
- находит коды, выставляет `verified=true`, сохраняет `handle` из автора,
- чистит pending.

---

## 6) Value & Metrics

### Что получает креатор
- **Trust badge** в витрине: бренды быстрее принимают решение.
- Снижение “пустых” диалогов: меньше подозрений и спама.
- В будущем (Level A/PRO): автопост/инсайты/авто-уведомления.

### Что получает бренд
- Быстрый trust-signal до unlock.
- После unlock: быстрый доступ к IG как к каналу проверки контента.

### Что получает продукт (мы)
- Рост конверсии в unlock (когда доверие выше).
- Рост accept rate по заявкам.
- PRO upsell через Level A.

### KPI (минимальный набор)
- `unlock_rate` в витрине (brand-facing) до/после бейджа.
- `apply_to_accept_rate` (бренд принял → списание).
- `time_to_first_message` (минуты/часы).
- `profile_completion_rate` (доля заполненных профилей).
- `verified_share` (доля витрин с verified).

---

## 7) DoD для STEP136 (skeleton)

- `/start ig_verify` и `/start igv_<handle>` открывают экран верификации.
- Добавлены action keys и UI flow.
- **Никаких IG API вызовов**.
- **Нельзя** выставлять `verified=true` «по кнопке» (только pending).
- В vitrina: **badge показывается до unlock**, но handle не раскрывается.
- `npm run actions:check` проходит.
- Старые кнопки/forward не ломаются.
