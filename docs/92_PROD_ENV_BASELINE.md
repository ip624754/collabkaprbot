# Production ENV baseline

Этот документ фиксирует **рекомендованный baseline ENV для продакшена** и то, как быстро проверить, что всё применилось.

> Секреты (TOKEN/URL/KEY) никогда не коммитим в репо. Здесь только имена переменных и рекомендуемые значения.

---

## 1) Главное

- Payments fallback по умолчанию OFF.
- Включение fallback — только **временно** из админки (runtime TTL).
- HMAC подпись payload обязательна.
- Broadcast защищён: quarantine + global threshold + hard-skip.
- Neon защищён: statement_timeout + conn_timeout.
- Audit не теряется: Redis buffer + flush.

---

## 2) Recommended ENV (без секретов)

### Core
- `NODE_ENV=production`
- `LOG_LEVEL=info`
- `LOG_PII_HASH_KEY=<optional 32+ random bytes>` — dedicated pseudonymization key; if omitted, hardened logging derives from existing admin/webhook secrets
- `BOT_TOKEN=<set>`
- `PUBLIC_BASE_URL=<set>`
- `WEBHOOK_SECRET_TOKEN=<set>`
- `CRON_SECRET=<set>`
- `SUPPORT_CHAT_ID=<set>`
- `SUPER_ADMIN_TG_IDS=<set>`
- `BRAND_APP_SUPERADMIN_COPY_ENABLED=1`

### Neon / Postgres
- `DATABASE_URL=<set>`
- `PG_POOL_MAX=1`
- `PG_IDLE_TIMEOUT_MS=5000`
- `PG_CONN_TIMEOUT_MS=1000`  # operator-confirmed current value; aggressive, observe via STEP586H1
- `PG_STATEMENT_TIMEOUT_MS=15000`

> STEP586H1: `DATABASE_URL` must be the Neon pooled URL. protected `/api/health?full=1` must report `pooled_url=true`, `pool_max=1`, `connect_retry.max_retries=1`. With `PG_CONN_TIMEOUT_MS=1000`, `database_connect_timeout_aggressive` is an expected warning until the 24-hour observation closes. If final timeouts persist, raise only the timeout to 3000–5000; do not raise pool max or add more retries.

### Upstash Redis
- `UPSTASH_REDIS_REST_URL=<set>`
- `UPSTASH_REDIS_REST_TOKEN=<set>`

### Upstash QStash
- `QSTASH_URL=<optional-upstash-endpoint>`
- `QSTASH_TOKEN=<set>`
- `QSTASH_CURRENT_SIGNING_KEY=<set>`
- `QSTASH_NEXT_SIGNING_KEY=<set>`
- `QSTASH_RETRY_MAX=5`

> `QSTASH_URL` не обязателен для текущего delivery URL generation (мы строим callback URL от `PUBLIC_BASE_URL`), но держим его в baseline/env docs для parity с `src/lib/config.js` и Upstash setup.

### Admin Web sidecar (optional)
- `ADMIN_WEB_ENABLED=0`
- `ADMIN_WEB_SECRET=<set-if-enabled>`
- `ADMIN_WEB_SESSION_SECRET=<set-if-enabled>`
- `ADMIN_WEB_APPROVER_TG_IDS=<set-if-enabled-or-use-super-admins>`
- `ADMIN_WEB_LOGIN_TTL_SEC=300`
- `ADMIN_WEB_SESSION_TTL_SEC=28800`
- `ADMIN_WEB_IDLE_TIMEOUT_SEC=1800`

### Payments (Stars)
- `PAYMENTS_PROVIDER_TOKEN=<set>`
- `PAYMENTS_PAYLOAD_HMAC_KEY=<32+ bytes secret>`
- `PAYMENTS_PAYLOAD_HMAC_LEN=10`
- `PAYMENTS_FALLBACK_ALLOW_UNSIGNED=0`
- `PAYMENTS_FALLBACK_APPLY_ENABLED=0`

### Broadcast
- `BROADCAST_QUARANTINE_THRESHOLD=3`
- `BROADCAST_QUARANTINE_SEC=1200`
- `BROADCAST_GLOBAL_429_THRESHOLD=6`
- `BROADCAST_GLOBAL_429_WINDOW_SEC=60`
- `BROADCAST_HARD_SKIP_TTL_DAYS=90`

### Audit buffer
- `AUDIT_DB_ENABLED=true`
- `AUDIT_BUFFER_ENABLED=true`
- `AUDIT_BUFFER_ON_DB_ERROR=true`
- `AUDIT_BUFFER_MAX_LEN=5000`
- `AUDIT_BUFFER_TTL_SEC=604800`
- `AUDIT_BUFFER_FLUSH_BATCH=250`
- `AUDIT_BUFFER_FLUSH_MAX_MS=4500`

### Instagram (parked / не используем в prod baseline)
- `IG_OAUTH_ENABLED=false`
- `IG_ROUTES_ENABLED=false`
- `IG_OAUTH_UI_ENABLED=false`
- `IG_VERIFY_TICK_ENABLED=false`

> В STEP383 `api/ig/oauth/*` убраны из deploy surface. Эти ENV оставляем как legacy baseline / на случай будущего возврата.

---

## 3) Как работает управление fallback (ENV vs Admin runtime)

Итоговый флаг:
- `fallback_apply_effective = (fallback_apply_env_enabled) OR (fallback_apply_runtime_enabled)`

Правильный дефолт:
- ENV=OFF (`PAYMENTS_FALLBACK_APPLY_ENABLED=0`)
- runtime=OFF
- effective=OFF

Включение из админки:
- включаешь на 2h/12h/24h → runtime становится ON → effective ON
- TTL истекает → runtime снова OFF

---

## 4) Проверка после изменения ENV

1) Сделай redeploy Production.
2) Открой public readiness `/api/health` и проверь HTTP 200 + `ok=true` + `system_status=GO`. Для подробностей сначала войди в web-admin, затем открой `/api/health?full=1`:
   - `payments.payload_hmac_key_configured: true`
   - `payments.fallback_apply_effective: false` (в норме)
3) Для проверки админки:
   - включи fallback на 2h
   - protected `/api/health?full=1` должен показать `fallback_apply_runtime_enabled: true` и `fallback_apply_effective: true`
   - выключи fallback → оба снова false
