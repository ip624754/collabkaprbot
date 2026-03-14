# 23 — Instagram интеграция: что сделали, что сломалось у Meta и как вернуться — 2026-02-27

Этот файл — **для владельца проекта** и для будущих итераций.

Цель документа:
- зафиксировать, **какие шаги/файлы уже есть в коде**,
- объяснить, **почему сейчас IG‑интеграция скрыта**,
- дать **чёткий план возврата**, когда появится время/доступы.

> TL;DR: Comment‑верификацию (Level B) решили не использовать из‑за утечек username. Перешли на OAuth‑only (Level A), но Meta начала возвращать `pages=0` и местами блокировать доступ. Поэтому **UI скрыли**, а в STEP383 ещё и **убрали `api/ig/oauth/*` из deploy surface** (чтобы не тратить лимит Vercel Hobby). Код/миграции/доки оставили как parked-context.

---

## 1) Что было сделано (по шагам)

### 1.1 Legacy / эксперименты (Level B — комментарии)
Сделано как отдельный слой (cron + QStash), но **стратегически не включаем**.

- STEP137: cron tick `/api/cron/ig-verify-tick`
- STEP138: “⚡ Проверить сейчас” (QStash job на 1 workspace)
- STEP139: runbook + админ‑экран статуса IG verify

Док/спека:
- `docs/21_IG_VERIFY_RUNBOOK.md` (помечено как legacy)

### 1.2 OAuth‑only (Level A)
Цель: Verified badge как trust‑signal (до unlock), а `@handle` — только после unlock.

- миграция: `migrations/041_ig_oauth_accounts.sql`
- эндпоинты:
  - `GET /api/ig/oauth/start?t=...`
  - `GET /api/ig/oauth/callback?code=...&state=...`
  - `GET /api/ig/oauth/status` (диагностика)
  - `POST /api/ig/oauth/disconnect` (отвязка)
  - ⚠️ baseline до STEP382: если `IG_OAUTH_UI_ENABLED=0` → все эти роуты закрывались (404)
  - ✅ baseline STEP383: `api/ig/oauth/*` вообще не деплоятся на Vercel Hobby
- шифрование токена через `IG_TOKEN_ENC_KEY`

Док/спека:
- `docs/spec/24_IG_INTEGRATION_SPEC.md`
- `docs/22_IG_GRAPH_OAUTH_2026.md`

### 1.3 UX‑микро‑шлифовка
Чтобы не пугать словом Facebook:
- кнопка: **«🔗 Вход через Meta»**
- пояснение: почему так (Meta/FB = официальный вход для Page‑backed IG)

### 1.4 Отвязка пользователем
Добавлена возможность отключить IG прямо из бота:
- удаляем токен/связку
- выключаем Verified

---

## 2) Что сейчас (текущее состояние)

### 2.1 Почему скрыли кнопку в боте
Дополнительно в STEP383 убрали сами `api/ig/oauth/*` entrypoint-ы из deploy surface: это сняло 4 serverless function из бюджета Hobby и убрало ненужный публичный API-контур.

Meta начала:
- возвращать `pages=0` на `GET /me/accounts` даже при `pages_show_list` и `pages_read_engagement`,
- иногда показывать “У вас нет доступа” и блокировать доступ к страницам/приложению.

В результате “подключение” превращалось в лотерею и плохой UX.

**Решение:**
- UI “Верифицировать IG / Подключить Instagram” **скрыт**
- пользователю показываем: **«Эта функция пока недоступна»**
- код/миграции не удаляем, чтобы быстро вернуться позже,
- но **/api/ig/oauth/* закрыты (404)** пока `IG_OAUTH_UI_ENABLED=0` (нет “теневого API”).

### 2.2 Что остаётся включённым
- Существующий продуктовый UX (контакты/разлок/заявки/бренд‑инбокс/рассылки/официальные публикации) — без IG.
- Миграция `041_ig_oauth_accounts.sql` в базе уже применена — это ок (не мешает).

---

## 3) Что именно ломалось (симптомы)

1) На стороне callback мы видели:
- `debug: me=<id> · pages=0`
- perms granted: `pages_show_list, instagram_basic, pages_read_engagement, public_profile`

2) В окне Meta флоу пользователь:
- выбирает Page и IG аккаунт,
- подтверждает,
- Meta пишет “пользователь связан с приложением”,
- но обратно в бот мы приходим без страниц.

3) В некоторые моменты Meta показывала «У вас нет доступа» к Page/приложению.

Вывод: проблема в основном **не в коде**, а в том, какие ассеты/права Meta реально выдаёт и как она их режет по ролям/верификациям.

---

## 4) Как вернуться к IG OAuth (план)

### 4.1 Проверка Meta‑стороны (самое важное)
1) Убедись, что IG аккаунт **Professional (Business/Creator)**.
2) Убедись, что IG **привязан** к Facebook Page (в самом IG: Edit Profile → Page).
3) В Meta App:
   - Use case: **Instagram API with Facebook login** (это тот, что даёт Graph‑цепочку через Pages)
   - Redirect URI совпадает 1‑в‑1: `https://<domain>/api/ig/oauth/callback`
4) Permissions:
   - минимум: `instagram_basic`, `pages_show_list`, `pages_read_engagement`
   - **практически обязательно** (для Business Portfolio): `business_management`
5) Роли приложения:
   - для dev/test: добавь себя как Admin/Developer/Tester
6) Быстрый тест без нашего кода:
   - возьми token в Graph API Explorer
   - дерни `GET /me/accounts?fields=id,name,instagram_business_account`
   - если здесь `data=[]`, то бот тоже ничего не найдёт.

Если Meta блокирует доступ/ассеты:
- скорее всего понадобится **Business Verification** + **Advanced access / App Review** для части permissions.

### 4.2 Проверка нашей стороны (после Meta)
1) ENV (Vercel):
   - `IG_OAUTH_ENABLED=1`
   - `IG_OAUTH_UI_ENABLED=1` (пока это 0 — кнопку не покажем)
   - `IG_OAUTH_CLIENT_ID=...`
   - `IG_OAUTH_CLIENT_SECRET=...`
   - `PUBLIC_BASE_URL=https://...`
   - `IG_TOKEN_ENC_KEY=...` (32+ символов)

2) Smoke:
- открыть `GET /api/ig/oauth/status` через одноразовый `t` (бот выдаёт ссылку)
- пройти OAuth → убедиться, что в БД появилась запись `ig_oauth_accounts` и что в `profile_contacts.ig.verified=true`

### 4.3 Rollback/безопасность
- Даже если IG снова включим, **контакт остаётся paywalled** (до unlock — никакого `@handle`).
- Все ошибки в IG‑флоу должны быть **fail‑closed** (не включаем Verified “по ощущениям”).
- Токены не логируем.

---

## 5) Мини‑чеклист: “включаем обратно за 15 минут”

1) В Meta `GET /me/accounts` показывает хотя бы одну Page.
2) У Page есть `instagram_business_account.id`.
3) В ENV включаем `IG_OAUTH_UI_ENABLED=1`.
4) В боте: профиль креатора → “Вход через Meta” → callback → ✅ Verified.
5) Бренд до unlock видит только “Instagram: ✅ Verified”.

---

## 6) Где смотреть код

- Parked OAuth endpoints: `_ig_oauth_parked/api/ig/oauth/*`
- Parked helper libs: `_ig_oauth_parked/lib/*`
- bot UI: `src/bot/bot.js` (экраны профиля)
- модель контактов/paywall: `docs/20_CONTACTS_MODEL.md`



## 4) Что нужно, чтобы вернуть IG OAuth

Минимальный план возврата:
- вернуть `_ig_oauth_parked/api/ig/oauth/start|callback|status|disconnect` в deploy surface,
- убедиться, что укладываемся в лимит функций (или перейти на Pro / объединить роуты),
- заново проверить `IG_OAUTH_*`, `IG_TOKEN_ENC_KEY`, `PUBLIC_BASE_URL`,
- прогнать ручной smoke Meta flow.

Пока это не сделано, продуктовый baseline такой: **Instagram = обычная ссылка/контакт после unlock, без OAuth**.
