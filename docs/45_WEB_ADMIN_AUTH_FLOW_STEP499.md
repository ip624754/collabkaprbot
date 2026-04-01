# STEP499 — Web Admin auth flow

## Реальный v1 flow

### Entry gate

Пользователь открывает `/admin/login` и вводит:

- `ADMIN_WEB_SECRET`

### Challenge

`POST /api/admin-web/auth/start`:

- валидирует shared secret;
- создаёт Redis challenge c TTL;
- генерирует fallback OTP code;
- отправляет Telegram approve / deny ссылки и code в `ADMIN_WEB_APPROVER_TG_IDS` (или fallback в `SUPER_ADMIN_TG_IDS`).

### Approve path

Если `PUBLIC_BASE_URL` задан:

- в Telegram приходит `✅ Approve` / `❌ Deny`;
- это URL на `/api/admin-web/auth/decision?...`;
- сервер проверяет signed token и помечает challenge как approved / denied.

### Code fallback

Если approve link не используется или нужен резерв:

- админ копирует code из Telegram;
- вводит его в web;
- `POST /api/admin-web/auth/verify-code` валидирует code hash и выдаёт session.

### Session

Session хранится в Redis и ставится как:

- `HttpOnly`
- `Secure`
- `SameSite=Strict`

Cookie name:

- `collabka_admin_session`

### Revoke all

`POST /api/admin-web/auth/revoke-all` пишет глобальный `revoke_before` marker в Redis.
Все session, выданные раньше, считаются невалидными.

## Почему auth так реализован

Это узкий, practical, hobby-safe v1:

- не нужен новый auth provider;
- Telegram остаётся root-of-trust;
- challenge и session одноразовые/ограниченные по TTL;
- нет тяжёлого user-management слоя.

## Security notes

- shared secret не равен identity, это только entry gate;
- Telegram approve / code — это second factor;
- signed approve links привязаны к `challenge_id`, `decision`, `actor`, `exp`;
- challenge single-use;
- expired challenge fail-closed;
- session revocation есть;
- write action audit есть.

## Сознательные ограничения v1

- нет отдельной user-facing admin identity model;
- code fallback не различает точный Telegram actor, поэтому session actor может быть `0` (`telegram_code_fallback` path);
- полноценный step-up auth для dangerous actions отложен до следующего шага, потому что dangerous actions вообще не включены в STEP499.
