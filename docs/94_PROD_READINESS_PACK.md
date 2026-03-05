# 94 — Production Readiness Pack (GO/NO‑GO + Incident Cookbook)

Цель: одна “операторская” точка правды — **как понять, что прод зелёный**, и **что делать при деградациях** (Redis/Neon/QStash/Payments), без угадываний.

Ссылки:
- Запуск за 30 минут: `docs/91_PROD_LAUNCH_30MIN.md`
- ENV baseline: `docs/92_PROD_ENV_BASELINE.md`
- Deploy checklist: `docs/93_PROD_DEPLOY_CHECKLIST.md`
- Owner runbook: `docs/90_OWNER_RUNBOOK.md`
- QStash runbooks: `docs/17_QSTASH_RUNBOOK.md`, `docs/10_QSTASH_RUNBOOK.md`
- Official publish: `docs/19_OFFICIAL_PUBLISH_IDEMPOTENCY.md`
- Security invariants: `docs/01_SECURITY_INVARIANTS.md`

---

## 1) GO / NO‑GO (за 60 секунд)

### GO (можно звать пользователей), если:
1) `/api/health`:
   - `ok=true`
   - `redis.read_ok=true` и `redis.write_ok=true`
   - `payments.payload_hmac_minlen_ok=true`
   - `payments.fallback_apply_effective=false` (baseline)
   - `broadcast.db_overload.today_count == 0` (или редкие единичные всплески без роста)
   - `qstash.reschedule_failed.today_count == 0`
   - `qstash.official_publish_stuck.today_count == 0`
2) В админке → **🧰 Операции**:
   - нет красных баннеров “Redis degraded”, “Payments HMAC missing/short”, “fallback apply ENABLED”
   - нет баннеров “QStash reschedule failed” / “Official publish stuck” / “Broadcast DB overload” (или они старые и не растут)
3) Мини‑смоук (5–10 минут): “креатор + бренд” (см. `91_PROD_LAUNCH_30MIN.md`).

### NO‑GO (не зовём пользователей), если:
- `redis.write_ok=false` **и** при этом планируется массовая операция (broadcast/cron fan‑out).
- `payments.payload_hmac_minlen_ok=false` (ключ отсутствует/короткий).
- `payments.fallback_apply_effective=true` без осознанного инцидента (случайно включили).
- `broadcast.db_overload.today_count` быстро растёт, или видишь системные таймауты DB.
- `qstash.reschedule_failed.today_count` растёт (потеря очереди возможна).

---

## 2) Что мониторить каждый день (коротко)

### 2.1 `/api/health` (главный индикатор)
Смотри блоки:
- `redis.*` — read/write/latency/last_error
- `payments.*` — HMAC key ok + fallback effective
- `broadcast.db_overload` — load‑shedding (429) по DB overload
- `broadcast.tick_deferred_redis` — broadcast tick был отложен из‑за Redis degraded
- `qstash.reschedule_failed` — были случаи, когда reschedule не удался
- `qstash.official_publish_stuck` — verify обнаружил stuck в `PUBLISHING`

### 2.2 Админка → 🧰 Операции
Это “человеческая” витрина для `/api/health`:
- красные баннеры = **действовать**
- жёлтые/информ = **наблюдать**

---

## 3) Incident Cookbook (что делать по симптомам)

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

### 3.5 Payments incident (fallback apply)
**Симптомы:**
- платеж пришёл (TG), а в DB/плане не отразился
- оператор хочет включить fallback apply

**Тактика:**
1) Проверить `/api/health.payments`:
   - `payload_hmac_minlen_ok=true`
   - `fallback_apply_effective=false` (baseline)
2) Включать fallback **только осознанно и временно** (например “Enable 2h” из админки).
3) После применения:
   - убедиться, что `fallback_apply_effective` вернулся в false
   - проверить, что нет дублей (apply exactly‑once в DB).

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
