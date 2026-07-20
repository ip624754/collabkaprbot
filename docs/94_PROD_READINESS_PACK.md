# 94 — Production Readiness Pack (GO/NO‑GO + Incident Cookbook)

Цель: одна “операторская” точка правды — **как понять, что прод зелёный**, и **что делать при деградациях** (Redis/Neon/QStash/Payments), без угадываний.

Ссылки:
- Запуск за 30 минут: `docs/91_PROD_LAUNCH_30MIN.md`
- ENV baseline: `docs/92_PROD_ENV_BASELINE.md`
- Deploy checklist: `docs/93_PROD_DEPLOY_CHECKLIST.md`
- Owner runbook: `docs/90_OWNER_RUNBOOK.md`
- QStash runbooks: `docs/10_QSTASH_RUNBOOK.md`, `docs/10_QSTASH_RUNBOOK.md`
- Official publish: `docs/19_OFFICIAL_PUBLISH_IDEMPOTENCY.md`
- Security invariants: `docs/01_SECURITY_INVARIANTS.md`

---

## 1) GO / NO‑GO (за 60 секунд)

### GO

1. Public readiness `GET /api/health` returns HTTP `200` with:
   - `ok=true`;
   - `system_status="GO"`;
   - `reason_codes=[]`;
   - `checks.database="ok"`;
   - `checks.redis="ok"`;
   - `checks.payment_payload_verification="ok"`.
2. After web-admin login, protected `GET /api/health?full=1` shows:
   - `redis.read_ok=true` and `redis.write_ok=true`;
   - `payments.payload_hmac_minlen_ok=true`;
   - `payments.fallback_apply_effective=false`;
   - no growing broadcast/QStash/OPS incident signal.
3. Admin → Operations has no unexplained red banner.

### NO-GO

- public readiness returns HTTP `503`, `ok=false` or `system_status="NO_GO"`;
- `reason_codes` contains a DB, Redis or payment verification blocker;
- protected diagnostics show active fallback apply without an explicit incident;
- broadcast/QStash pressure is growing or unknown delivery reconciliation is unresolved.

Do not use `/api/health?mode=liveness` as a release signal. Liveness proves only that the handler can answer.

## 2) Что мониторить каждый день (коротко)

### 2.1 Public readiness + protected diagnostics
Начинай с public `/api/health`: HTTP status, `ok`, `system_status`, `checks`, `reason_codes`.

Для drill-down сначала войди в web-admin и открой `/api/health?full=1`. Там смотри:
- `redis.*` — read/write/latency/last_error
- `payments.*` — HMAC ok + fallback effective + payload issues
- `broadcast.pending_deliveries` — snapshot pending доставок (раннее обнаружение “залипов”)
- `broadcast.db_overload` — load‑shedding (429) по DB overload
- `broadcast.tick_deferred_redis` — tick был отложен из‑за Redis degraded
- `qstash.reschedule_failed` — случаи, когда reschedule не удался
- `qstash.official_publish_stuck` — verify обнаружил stuck в `PUBLISHING`

### 2.2 Админка → 🧰 Операции
Это “человеческая витрина” для health + ops:
- красные баннеры = **действовать**
- жёлтые/информ = **наблюдать**
- кнопка **`🧾 Flush ops digest`** — принудительно отправить сводку сейчас (полезно после инцидента/деплоя)

### 2.3 Админка → ⚙️ Система → 🧱 Hard-skip
Если delivery “жрёт” попытки на мёртвых чатах:
- `🧾 Последние пропуски` → фильтры по reason + `🗒 Export last 200`
- ориентир: всплеск `bot_blocked/chat_not_found/user_deactivated` объясняет “почему доставка не идёт”

---

## 3) Incident Cookbook (что делать по симптомам)

### 3.0 Матрица микрофиксов (Symptom → Microfix → Verify → Rollback)

> Идея: **не думать в инцидент**. Открыл `/api/health` или Admin→Ops → нашёл симптом → сделал ровно один микрошаг → проверил → откатил/зафиксировал.

| Symptom (health / Ops) | Microfix (без ломки) | Verify (что стало лучше) | Rollback |
|---|---|---|---|
| **Redis degraded**: `redis.write_ok=false` / баннер “Redis degraded” | 1) **Не запускать массовое** (broadcast/фан-аут).<br>2) Проверить Upstash (лимиты/токен/latency).<br>3) Дождаться восстановления (не “лечить деньгами”). | `redis.read_ok/write_ok=true`, `redis.last_error=null` и перестаёт расти `broadcast.tick_deferred_redis.today_count`. | Ничего “особого” не откатываем — просто возвращаемся к штатному режиму после восстановления Redis. |
| **Broadcast tick deferred** растёт | Это следствие Redis degraded → см. строку выше. Дополнительно: временно **не стартовать новые рассылки**. | Счётчик перестал расти; новые тики идут штатно. | — |
| **DB overload**: рост `broadcast.db_overload.today_count` / таймауты Neon | 1) Дать системе “остыть” (delivery уже делает `429 + Retry-After + jitter`).<br>2) На время инцидента **не запускать большие рассылки**.<br>3) Проверить Neon compute/коннекты/pool. | Перестаёт расти `broadcast.db_overload.today_count`, исчезают DB timeout в логах. | При необходимости: временно выключить/уменьшить fan-out (runtime), отменить/отложить рассылку. |
| **QStash reschedule failed**: `qstash.reschedule_failed.today_count>0` | 1) Проверить QStash токен/подпись/HMAC.<br>2) Если растёт — считать риск “задачи могут не перепланироваться” и снижать активность (рассылки/паблиш). | Счётчик перестаёт расти; новые reschedule успешны. | Переключить контуры на “ручной режим” (минимальная активность) до восстановления QStash. |
| **Official publish stuck**: `qstash.official_publish_stuck.today_count>0` | Следовать `docs/19_OFFICIAL_PUBLISH_IDEMPOTENCY.md`.<br>Правило: **лучше подвиснуть, чем задублировать**. Не менять статусы руками. | `official_publish_stuck` не растёт; очередь уходит; verify “самовосстановил”. | Откат: отключить публикации (`OFFICIAL_PUBLISH_ENABLED=false`) до разбирательства. |
| **Payments HMAC missing/short**: `payments.payload_hmac_minlen_ok=false` | **NO‑GO.** Исправить ENV `PAYMENTS_PAYLOAD_HMAC_KEY` (≥32 байт) и redeploy. Не включать fallback. | `/api/health.payments.payload_hmac_minlen_ok=true` + `payload_issues_today.bad_sig=0`. | Вернуться к предыдущему деплою / исправить ENV и повторить. |
| **Оплата прошла, но “не применилось”** (missing Redis pay_* session) | Включить **runtime fallback apply** **временно** через админку (см. 3.5). | `payments.fallback_apply_runtime_enabled=true` (на окно), хвосты применяются; затем вернуть OFF. | Нажать **Disable** в админке (и убедиться что `fallback_apply_effective=false`, если ENV=OFF). |
| **Payments fallback apply ENABLED**: `payments.fallback_apply_effective=true` / баннер в Ops | 1) Если это **не инцидент** — сразу выключить runtime fallback в админке.<br>2) Если инцидент — убедиться, что есть `reason` + TTL/окно и после окна вернуть OFF. | В Ops исчезает баннер (или становится “OK”), `/api/health.payments.fallback_apply_effective=false`. | Disable runtime fallback; при необходимости откатить к baseline env (ENV=0). |
| **Broadcast pending “залип”**: `broadcast.pending_deliveries.pending_count>0` и не падает | 1) Открыть `/api/health.ops.digest_preview` и Admin→Ops (при необходимости нажать `🧾 Flush ops digest`).<br>2) Проверить Hard-skip HITs (всплеск мёртвых чатов) + DB overload counters.<br>3) Не стартовать новые большие рассылки до стабилизации. | `pending_count` начинает снижаться; не растёт `db_overload`; нет лавины reschedule failed. | Откат: остановить/отложить рассылку; после стабилизации повторить меньшими батчами. |
| **Hard-skip HITs spike**: резкий рост пропусков (бот блокируют/чаты мёртвые) | 1) Admin→System→Hard-skip → `🧾 Последние пропуски` + фильтры по reason.<br>2) Если причина `bot_blocked` — это ожидаемо; не “лечится”.<br>3) Если `unknown/other` растёт — смотреть delivery ошибки и лимиты. | Рост стабилизируется; понятно, почему доставка не проходит; новые попытки не жрут ресурсы. | При необходимости: вручную снять skip для конкретного tgId (точечно) или сократить TTL только для теста. |
| **Payload issues** растут: `payments.payload_issues_today.bad_sig/unsigned/bad_format` | Остановить эксперименты/маркетинг-пейлоады, проверить сигнатуру/HMAC и формат payload. Это **не лечится fallback’ом**. | Счётчики перестают расти; новые оплаты проходят без ошибок. | Откатить последние изменения payload/каталога; вернуть базовый каталог. |
| **Audit buffer** растёт: `audit.buffer.len` ↑ | Если Redis OK: дать буферу догрузиться (он batch). Если DB перегружен: сначала лечить DB overload. | `audit.buffer.len` падает к 0; нет новых `audit.buffer.on_db_error`. | Временно снизить активность/рассылки; если нужно — усилить throttle (см. `docs/18_...`). |


### 3.1 Redis degraded (read/write fail)
**Симптомы:**
- `/api/health.redis.write_ok=false` или баннер “Redis degraded”
- кнопки/кулдауны/локи ведут себя нестабильно

**Тактика:**
1) **Не запускать массовые операции.** Broadcast tick уже fail‑closed при Redis degraded.
2) Проверить Upstash: лимиты, токен, endpoint, latency.
3) Если нужно временно “снять нагрузку”:
   - уменьшить внешние входы (на период инцидента)
4) После восстановления Redis:
   - убедиться, что `redis.read_ok/write_ok=true`
   - проверить, что `broadcast.tick_deferred_redis` не растёт.

**Чего не делать:**
- не включать “магические” флаги на деньги/разлок “наугад”.

---

### 3.2 Neon / DB overload (шторм, таймауты, лимиты подключений)
**Симптомы:**
- рост `broadcast.db_overload.today_count`
- в логах: timeouts / connection limit / ECONNRESET на DB

**Тактика:**
1) Broadcast delivery уже делает load‑shedding (`429 + Retry-After`). Дай системе “остыть”.
2) Проверь Neon: compute, коннекты, pooler, statement_timeout.
3) На период инцидента:
   - не запускать большие рассылки
   - избегать тяжёлых админ‑операций

---

### 3.3 QStash reschedule failed
**Симптомы:**
- `qstash.reschedule_failed.today_count > 0`
- баннер в Admin→Ops

**Тактика:**
1) Проверить QStash: токен/ключи подписи, rate limits, outage.
2) Если сбой продолжается — считать риск “задачи могут не перепланироваться”.
3) Дальше действовать по конкретному контуру:
   - broadcast: смотреть `broadcast.db_overload` + cooldown
   - official publish: смотреть stuck verify

---

### 3.4 Official publish stuck (verify нашёл `PUBLISHING` слишком долго)
**Симптомы:**
- `qstash.official_publish_stuck.today_count > 0`
- last_offer_id/age/via в health

**Тактика:**
1) Открыть `docs/19_OFFICIAL_PUBLISH_IDEMPOTENCY.md`
2) Запустить verify endpoint (если предусмотрен) или дождаться автопрохода cron
3) Главное правило: **лучше “подвиснуть”, чем задублировать публикацию**.
4) Если нужно ручное вмешательство — только через прописанный runbook (без “перекинуть статус руками” наугад).

---

### 3.5 Payments incident (runtime fallback apply) — короткий runbook

**Когда это нужно:** Stars‑платёж успешно пришёл, но Redis `pay_*` session отсутствует/истекла (редкий хвост при деградации/таймаутах).
**Что это НЕ делает:** не “разрешает” неподписанные/битые payload’ы и не обходит DB‑guards.

#### Preconditions (перед включением)
1) `/api/health.payments.payload_hmac_minlen_ok == true` (иначе **NO‑GO**).
2) `payments.payload_issues_today.bad_sig == 0` и `unsigned == 0` (если растут — сначала лечим подпись/формат).
3) Убедись, что ENV baseline **OFF**: `PAYMENTS_FALLBACK_APPLY_ENABLED=0` (иначе runtime‑Disable не выключит effective).

#### Включение (строго time‑boxed)
1) Админка → **⚙️ Система** → **🧯 Fallback** (Payments fallback apply).
2) Нажми:
   - `🟢 2h (incident)` — для короткого хвоста (рекомендовано по умолчанию),
   - `🟢 12h (backlog)` — если накопились хвосты,
   - `🟢 24h (migration)` — только под миграции/долгую чистку.
3) Проверь `/api/health`:
   - `payments.fallback_apply_runtime_enabled == true`
   - `payments.fallback_apply_effective == true`

#### Мониторинг (пока включено)
- В Admin→Ops появится баннер “Payments: fallback apply ENABLED”.
- Смотри `payments.payload_issues_today.*` — они не должны расти.

#### Выключение (обязательно)
1) Админка → **⚙️ Система** → **🧯 Fallback** → `🧹 Disable`
2) Проверь `/api/health`:
   - `payments.fallback_apply_runtime_enabled == false`
   - `payments.fallback_apply_effective == false` (если ENV=OFF)

#### Если стало хуже
- Немедленно `Disable`, и разбираем причину: подпись payload, каталог/amount/currency, Redis деградация или DB overload.


---

## 4) Rollback (без паники)
1) Vercel: откат на прошлый deployment.
2) Runtime flags: выключить спорные фичи (особенно деньги/паблиш/массовые операции).
3) Проверить `/api/health` и Admin→Ops, что стало зелёным.

---

## 5) Мини‑DoD для релиза
Релиз считается готовым, если:
- docs обновлены (`00_CURRENT_STATE` + `WORK_HISTORY`)
- есть FULL+HOTFIX+PATCH+files list+QA
- `/api/health` зелёный на preview/prod
- смоук “креатор+бренд” пройден
