# 21 — IG VERIFY RUNBOOK (Level B) — токен + media_id — 2026-02-26

> ⚠️ **LEGACY / НЕ РЕКОМЕНДУЕТСЯ К ВКЛЮЧЕНИЮ:** Level B (комментарии с кодом под постом) создаёт bypass — бренд может собрать публичные usernames на verification‑посте.
> 
> Текущая стратегия проекта: **OAuth‑верификация (Level A / PRO)**. Этот runbook оставлен только как reference/экспериментальный вариант.

Этот runbook нужен, чтобы **включить Level B IG verification** (код‑коммент под нашим verification‑постом) в проде.

Нужно получить:
- `IG_VERIFY_ACCESS_TOKEN` — токен для чтения комментариев к нашему verification‑посту.
- `IG_VERIFY_MEDIA_ID` — ID media (поста), под которым креаторы оставляют комментарии с кодом.

> Важно: это **не OAuth креатора**. Это токен *нашего* профессионального IG аккаунта (через Page), чтобы читать комментарии к нашему посту.

---

## 0) Предусловия (без этого не взлетит)

1) Instagram аккаунт **Professional** (Business или Creator).
2) Он **привязан к Facebook Page** (Page‑backed IG account).
3) Есть доступ к Meta/FB аккаунту, который **админит эту Page**.
4) В Meta for Developers есть App (можно отдельный “Collabka Ops”).

---

## 1) Быстрый путь (рекомендуемый для старта): Graph API Explorer

Цель: быстро получить валидный токен и найти media id нужного поста.

### Шаг 1 — App + продукты
В Meta for Developers:
1) Создай App (обычно тип “Business”).
2) Добавь **Instagram Graph API** (или “Instagram” → “Instagram Graph API”, в зависимости от UI Meta).

### Шаг 2 — токен и permissions
В Graph API Explorer:
1) Выбери своё App.
2) Сгенерируй **User access token** для FB‑пользователя, который админит нужную Page.
3) Выставь permissions (минимум для чтения комментариев):
   - `instagram_basic`
   - `instagram_manage_comments`
   - `pages_show_list`
   - `pages_read_engagement`

Получившийся токен можно использовать как `IG_VERIFY_ACCESS_TOKEN`.

> Практика: чаще всего удобнее использовать **Page access token**, полученный из этого user token (см. ниже) — он лучше ложится на “Page‑backed IG” кейс.

---

## 2) Рекомендуемый вариант токена: Page access token (из user token)

1) Получи список страниц и их Page access tokens:

- `GET /me/accounts?fields=id,name,access_token,instagram_business_account`

2) В ответе найди нужную Page:
- возьми `access_token` → это **Page access token** (его и ставим в `IG_VERIFY_ACCESS_TOKEN`).
- возьми `instagram_business_account.id` → это `IG_USER_ID`.

Если `instagram_business_account` не вернулся:
- проверь, что IG аккаунт реально привязан к этой Page,
- проверь permissions из шага 1,
- иногда помогает запросить поля явнее: `GET /<PAGE_ID>?fields=instagram_business_account`.

---

## 3) Как получить `IG_VERIFY_MEDIA_ID`

Нужен media id **нашего** verification‑поста (желательно pinned).

1) Получи список последних постов:

- `GET /<IG_USER_ID>/media?fields=id,permalink,caption,timestamp&limit=50`

2) Найди verification‑пост:
- по `permalink` (самый надёжный),
- или по `caption` (например, там есть “verification / COLLABKA”).

3) Возьми `id` найденного поста → это `IG_VERIFY_MEDIA_ID`.

---

## 4) Валидация (обязательная)

Проверь, что по токену реально читаются комментарии и есть `username` автора:

- `GET /<IG_VERIFY_MEDIA_ID>/comments?fields=id,text,username,timestamp&limit=5`

Если видишь `text` и `username` — всё ок.

---

## 5) ENV в проде

В Vercel (или где держишь ENV) выставь:

```bash
IG_VERIFY_TICK_ENABLED=1
IG_VERIFY_ACCESS_TOKEN=...  # НЕ коммить, только в ENV
IG_VERIFY_MEDIA_ID=...
# optional
IG_VERIFY_COMMENTS_LIMIT=50
```

И настрой cron, который дергает:
- `GET/POST /api/cron/ig-verify-tick` с `Authorization: Bearer <CRON_SECRET>`

Рекомендуемая частота: раз в 10–15 минут.

---

## 6) Проверка в проде (после деплоя)

1) Открой `/api/health` и проверь:
   - `cron.ig_verify_tick.last_run`
   - `cron.ig_verify_check.last_run`

2) В TG админке: **👑 Админ‑панель → 📸 IG verify статус**
   - `Configured (Graph): OK`
   - видны `Tick last_run` и `Check-now last_run`

---

## 7) Траблшутинг (типовые ошибки)

### `not_configured`
Нет одного из ENV: `IG_VERIFY_TICK_ENABLED`, `IG_VERIFY_ACCESS_TOKEN`, `IG_VERIFY_MEDIA_ID`.

### `IG comments fetch failed: 400/401`
Обычно это:
- токен протух/отозван,
- не хватает permissions,
- media id неверный или не принадлежит нашему IG.

### `username` пустой
Значит токен/эндпоинт не отдаёт поле `username` (обычно из‑за прав или неправильного типа токена).
Решение:
- проверь permissions,
- попробуй использовать **Page access token** (см. раздел 2).

---

## 8) Security notes

- Никогда не вставляй `IG_VERIFY_ACCESS_TOKEN` в код/репозиторий/логи.
- Храни только в ENV.
- При подозрении на утечку — **сразу ротируй** токен.
