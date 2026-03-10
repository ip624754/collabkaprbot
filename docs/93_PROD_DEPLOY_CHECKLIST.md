# Production deploy checklist

Цель: чтобы деплой на продакшен был **предсказуемым**, без “может быть”.

> Это чеклист оператора. Секреты сюда не вставляем.

---

## 0) Базовые принципы

- **Serverless**: никаких долгих процессов, только батчи/таймауты.
- **Neon экономим**: горячие UI пути без лишних DB-reads.
- **Payments fallback**: в норме **OFF**, включать только временно при инцидентах.
- **Redis может деградировать**: мутации fail-closed, навигация fail-open.

---

## 1) Перед деплоем (ENV)

### Must-have
- `PAYMENTS_PAYLOAD_HMAC_KEY` выставлен (32+ bytes).
- `PAYMENTS_FALLBACK_APPLY_ENABLED=0` (prod baseline).
- `PAYMENTS_FALLBACK_ALLOW_UNSIGNED=0`.
- `PG_CONN_TIMEOUT_MS=10000`
- `PG_STATEMENT_TIMEOUT_MS=15000`
- `BROADCAST_*` выставлены (quarantine/global/hard-skip).

См. полный baseline: `docs/92_PROD_ENV_BASELINE.md`.

---

## 1.5) Локальный прогон перед deploy

В рабочем репо перед выкладкой:

```bash
npm install
npm run preflight
APP_ENV=production npm run preflight
```

Ожидаемо:
- обычный preflight зелёный;
- staging smoke на `Redis down` и `health/admin JSON shape` проходят;
- source-level smoke на `Admin → Ops` keyboard/actions contract проходит;
- source-level smoke на `Admin → Comms` keyboard/footer contract проходит;
- source-level smoke на `Admin → System` keyboard/footer contract проходит;
- source-level smoke на `Admin → Founder Sale` contract проходит;
- source-level smoke на `Admin → Notice` composer/runtime contract проходит;
- source-level smoke на `Admin → Outbox` contract проходит;
- source-level smoke на `Admin → DM Templates` contract проходит;
- source-level smoke на `Admin → Payments` contract проходит;
- source-level smoke на `Admin → Payments Fallback` contract проходит;
- source-level smoke на `Admin → QStash Status` contract проходит;
- в `APP_ENV=production` staging smoke корректно **skip**, без попытки fault-injection в prod env.

## 2) Деплой (Vercel)

1) Убедись, что изменённые ENV применились (Production scope).
2) Сделай redeploy Production (если менял ENV).
3) Открой `/api/health`.

---

## 3) Быстрая проверка через /api/health (2 минуты)

Ожидаемое “зелёное” состояние:

### Redis
- `redis.read_ok == true`
- `redis.write_ok == true`

### Payments
- `payments.payload_hmac_key_configured == true`
- `payments.payload_hmac_minlen_ok == true`
- `payments.fallback_apply_effective == false` (baseline)
- `payments.payload_allow_unsigned == false`

### Cron / QStash
- `cron.enabled == true`
- `cron.giveaways_tick.ts` обновляется (раз в 10 минут, если cron включён)
- `broadcast.status == idle` (если нет активной рассылки)

### Audit
- `audit.enabled == true`
- `audit.buffer.enabled == true`
- `audit.buffer.len == 0` (или маленькое значение после кратких инцидентов)

---

## 4) Проверка админки (3 минуты)

### Payments fallback runtime (STEP337)
1) Админка → Система → Payments fallback apply
2) Нажми “Enable 2h”
3) Проверь `/api/health`:
   - `payments.fallback_apply_runtime_enabled == true`
   - `payments.fallback_apply_effective == true`
4) Нажми “Disable”
5) Проверь `/api/health`:
   - оба поля снова `false`

> В норме runtime должен быть OFF.

### Hard-skip (STEP336)
- Админка → Система → Hard-skip (dead chats)
- Поиск по TG ID работает (даже если recent list пустой).

---

## 5) Smoke test: 1 тестовый broadcast (опционально)

- Перед деплоем можно быстро прогнать `npm run smoke:admin-notice-contract`, чтобы поймать тихие rename/remove регрессии экрана `Админка → Объявление` и его publish/composer-flow.
- Перед деплоем можно быстро прогнать `npm run smoke:admin-outbox-contract`, чтобы поймать тихие rename/remove регрессии `Админка → Outbox` и его list/view/repeat/clear-flow.
- Перед деплоем можно быстро прогнать `npm run smoke:admin-payments-contract`, чтобы поймать тихие rename/remove регрессии `Админка → Payments` и его list/detail/apply/auto-heal flow.
- Перед деплоем можно быстро прогнать `npm run smoke:admin-payments-fallback-contract`, чтобы поймать тихие rename/remove регрессии `Админка → Payments fallback apply` и его runtime enable/disable/operator-flow.
- Перед деплоем можно быстро прогнать `npm run smoke:admin-qstash-status-contract`, чтобы поймать тихие rename/remove регрессии `Админка → QStash статус` и его ping/fan-out/operator-flow.
- Перед деплоем можно быстро прогнать `npm run smoke:admin-hard-skip-contract`, чтобы поймать тихие rename/remove регрессии `Админка → Hard-skip` и его home/hits/view/find/export/unskip-flow.
- Отправь рассылку только себе/одному тестовому пользователю.
- Убедись, что:
  - доставилось,
  - нет 429-cooldown,
  - counters не растут странно.

---

## 6) Smoke test: 1 тестовый платеж (опционально)

- Создай минимальный Stars-инвойс (PRO/Brand Pass).
- Заверши оплату.
- Ожидаемо:
  - основной путь отработал,
  - `payload_issues_today.*` остаются 0,
  - fallback не нужен.

---

## 7) Если инцидент “оплата прошла, сессия потеряна” (операторский рецепт)

1) Включи runtime fallback на 2 часа (админка).
2) Попроси пользователя повторить действие / дождись следующего successful_payment.
3) Убедись, что начисление произошло.
4) Сразу выключи runtime fallback.
5) Проверь `/api/health` и ops digest.


### Ops signals (degradation)
- `broadcast.db_overload.today_count` не растёт
- `broadcast.tick_deferred_redis.today_count == 0` (в норме)
- `qstash.reschedule_failed.today_count == 0`
- `qstash.official_publish_stuck.today_count == 0`

См. incident cookbook: `docs/94_PROD_READINESS_PACK.md`.
