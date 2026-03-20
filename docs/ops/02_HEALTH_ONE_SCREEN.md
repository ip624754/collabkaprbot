# 02 — `/api/health` one-screen operator guide (STEP429)

Короткая шпаргалка: что смотреть в `/api/health` **сверху вниз**, без импровизации.

Быстрый режим: `/api/health?tier=fast` — только короткий operator summary для первого GO/NO_GO pass.
Полный drill-down: `/api/health` без параметров — полный JSON со всеми контурами.

## 1) Сначала смотри только это
1. `ok`
2. `system_status`
3. `no_go_reasons[]`
4. `ops.digest_preview`

Правило: если `system_status = NO_GO`, сначала прочитай `no_go_reasons[].hint`, а не жми кнопки “на удачу”.

---

## 2) Что означает каждый верхний блок

### `ok`
- `true` — endpoint жив, JSON собрался.
- `false` / exception — сначала infra/debug, а не ручные replays.

### `system_status`
- `GO` — baseline выглядит безопасно.
- `NO_GO` — есть явный стоп-фактор для релиза / трафика.

### `no_go_reasons[]`
Это список **конкретных причин**, почему сейчас нельзя считать прод зелёным.
Ищи поля:
- `code`
- `value`
- `threshold`
- `hint`

`hint` — это первый безопасный ход.

### `ops.digest_preview`
Это короткая operator-сводка: последние причины, топ-спайки, свежие тревоги.
Если нужен свежий срез после инцидента — в админке жми `🧾 Flush ops digest`.

---

## 3) Дальше смотри по контурам

### Redis
Смотри:
- `redis.read_ok`
- `redis.write_ok`
- `redis.latency_ms`
- `redis.last_error`

Если Redis degraded:
- не запускай массовые операции;
- mutating callbacks должны оставаться fail-closed;
- сначала восстанови Redis, потом трогай рассылки/ручные apply.

### Payments
Смотри:
- `payments.payload_hmac_key_configured`
- `payments.payload_hmac_minlen_ok`
- `payments.fallback_apply_env_enabled`
- `payments.fallback_apply_runtime_enabled`
- `payments.fallback_apply_effective`
- `payments.payload_issues_today.*`

Первый safe action:
- если fallback effective включён без инцидента — выключить runtime fallback в админке;
- если HMAC key не configured / слишком короткий — это **NO-GO**, лечится ENV + redeploy.

### Broadcast
Смотри:
- `broadcast.pending_deliveries`
- `broadcast.db_overload.*`
- `broadcast.tick_deferred_redis.*`
- `broadcast.cooldown_until` / `retry_after_sec`

Первый safe action:
- при overload / cooldown не стартуй новые рассылки;
- дай системе самой short-circuit / reschedule path отработать.

### QStash / Official Publish
Смотри:
- `qstash.reschedule_failed.*`
- `qstash.official_publish_stuck.*`
- `broadcast.pending_deliveries` вместе с qstash counters

Первый safe action:
- для stuck publish сначала `🩺 Проверить статус`, а не republish;
- для reschedule failed — проверить QStash keys / delivery path, а не дёргать ручные повторы пачками.

### Ops / Audit visibility
Смотри:
- `ops.digest_preview`
- `audit.buffer.*` (если есть)
- operator banners в Admin → Ops

Первый safe action:
- если есть красный баннер в админке, действуй по нему раньше, чем по логам.

---

## 4) Быстрые safe actions по симптомам

### `system_status = NO_GO`
1. Прочитать `no_go_reasons[].hint`.
2. Не звать пользователей и не запускать новые mass actions.
3. Устранить ровно верхнюю причину, потом обновить `/api/health`.

### `payments.fallback_apply_effective = true`
1. Убедиться, что это осознанный инцидентный режим.
2. Если нет — выключить runtime fallback.
3. Проверить, что effective снова `false`.

### `broadcast.pending_deliveries.pending_count` завис
1. Посмотреть `db_overload`, `tick_deferred_redis`, `ops.digest_preview`.
2. Проверить Hard-skip HITs report.
3. Не стартовать новые большие broadcast.

### `qstash.official_publish_stuck.today_count > 0`
1. Открыть карточку публикации.
2. Нажать `🩺 Проверить статус`.
3. Не делать republish до verify/self-heal.

---

## 5) Чего не делать
- Не лечить `NO_GO` ручными реплеями “на всякий случай”.
- Не включать fallback apply как универсальную кнопку починки.
- Не давить новые рассылки во время cooldown / DB overload.
- Не обходить `🩺 Проверить статус` ручной перепубликацией.

---

## 6) Связанные документы
- `docs/90_OWNER_RUNBOOK.md`
- `docs/91_PROD_LAUNCH_30MIN.md`
- `docs/94_PROD_READINESS_PACK.md`
- `docs/ops/01_OPERATOR_INCIDENT_PLAYBOOK.md`
- `docs/process/10_RELEASE_PREFLIGHT.md`
