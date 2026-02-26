# 22 — Instagram Graph OAuth (Business/Creator) — Runbook — 2026-02-26

Этот документ описывает **официальный** путь подключить Instagram через **Meta OAuth (Business Login)**, чтобы получить доступ к:
- профилю профессионального IG аккаунта (username, account_type),
- публикациям / комментариям / insights (в следующих шагах).

> Важно: это работает **только** для Instagram **Business или Creator** аккаунтов, которые **привязаны к Facebook Page**.
> Личные IG аккаунты Graph API не поддерживает.

## 0) Что понадобится

- Instagram аккаунт в режиме **Professional (Business/Creator)**.
- Привязка IG → **Facebook Page** (Page-backed IG).
- Доступ к Meta Developers и Facebook аккаунту, который админит эту Page.
- Публичный домен твоего бота (например `https://your-domain.com`) — нужен для redirect URI.

## 1) Подготовка Instagram

1) Instagram → **Settings → Account → Switch to professional account**
2) Выбери **Creator** или **Business**
3) **Свяжи с Facebook Page** (обязательно)
4) Проверь, что Page реально привязана (в Meta/FB business settings видно связь)

## 2) Создание приложения Meta (Business)

1) Зайди в Meta for Developers (developers.facebook.com)
2) Create App → выбери тип **Business**
3) Заполни name/email, при наличии выбери Business Account
4) В Products добавь:
   - **Instagram Platform / Instagram Graph API**
   - **Facebook Login for Business** (если Meta UI просит)

## 3) OAuth настройки

### 3.1 Redirect URI
В настройках Login/Instagram добавь redirect URI:

- `https://<твой-домен>/api/ig/oauth/callback`

Redirect должен совпадать **точно** (включая https, слэши, путь).

### 3.2 Scopes (минимум для STEP140A)
Для базового connect + определения IG username обычно достаточно:

- `instagram_basic`
- `pages_show_list`
- `pages_read_engagement`

Для будущих шагов:
- комментарии: `instagram_manage_comments`
- insights: `instagram_manage_insights`
- публикация: `instagram_content_publish`

> Для продакшена расширенные permissions обычно требуют **App Review**.

## 4) Токены: short-lived → long-lived

- После OAuth ты получаешь **short-lived user token** (обычно ~1 час).
- Его меняешь на **long-lived token** (обычно ~60 дней).
- Long-lived токен нужно **обновлять** (refresh) до истечения.

В нашем проекте токен хранится **шифрованно** (см. `IG_TOKEN_ENC_KEY`) и не попадает в логи.

## 5) Как Graph находит IG аккаунт (через Page)

Цепочка всегда такая:

1) Получить Pages пользователя: `GET /me/accounts`
2) Для Page получить `instagram_business_account`
3) По `ig_user_id` запросить `username`, `account_type`

Если `instagram_business_account` не находится — значит IG **не привязан** к Page или ты смотришь не ту Page.

## 6) Checklist перед запуском

- IG профессиональный (Business/Creator)
- IG привязан к Facebook Page
- В Meta App добавлен redirect URI
- App находится хотя бы в dev/test mode и user добавлен как tester/admin
- В ENV проекта выставлены:
  - `IG_OAUTH_ENABLED=1`
  - `IG_OAUTH_CLIENT_ID=...`
  - `IG_OAUTH_CLIENT_SECRET=...`
  - `PUBLIC_BASE_URL=https://...`
  - `IG_TOKEN_ENC_KEY=...` (секрет, 32+ символов)

## 7) Частые ошибки

- **redirect_uri mismatch** → разные слэши/домен/протокол
- **no instagram_business_account** → IG не привязан к Page или нет прав на Page
- **insufficient permissions** → нет нужных scopes или App Review не пройден
- **token expired** → нужно refresh long-lived или повторить OAuth

