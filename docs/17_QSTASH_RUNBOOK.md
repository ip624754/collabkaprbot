# 17 — QSTASH RUNBOOK (Setup / Rollout / Troubleshooting) — 2026-02-25

Назначение: документ «как включать и обслуживать QStash» без сюрпризов.

Сейчас QStash используется для **Broadcast fan-out**:
- cron `broadcast_tick` только **энкьюит** delivery‑jobs
- доставка делается воркером `POST /api/qstash/broadcast-deliver`
- идемпотентность держим через **DB guard** (`broadcast_sent_log`) + QStash dedup-id

---

## 1) Где взять значения для ENV

### QSTASH_TOKEN
Это Bearer‑token для публикации задач в QStash.

Где взять:
- Upstash Console → **QStash** → раздел **Token** → скопировать.

### QSTASH_CURRENT_SIGNING_KEY / QSTASH_NEXT_SIGNING_KEY
Это секреты для проверки подписи входящих запросов (`Upstash-Signature`).

Где взять:
- Upstash Console → **QStash** → раздел **Signing Keys** → скопировать **оба** ключа:
  - `current` — активный сейчас
  - `next` — для seamless‑ротации (мы всегда держим его в env заранее)

Важно:
- эти значения **не придумываем** и **не генерим** сами — только копируем из Upstash.
- ключи считаются секретами (не логировать, не коммитить).

---

## 2) Как добавить ENV в Vercel

Vercel → Project → **Settings → Environment Variables**:

1) Добавь переменные:
   - `QSTASH_TOKEN`
   - `QSTASH_CURRENT_SIGNING_KEY`
   - `QSTASH_NEXT_SIGNING_KEY`

2) Рекомендуемые окружения:
   - **Production**: обязательно
   - **Preview**: желательно (чтобы тестировать безопасно до прод)
   - **Development**: по желанию (если гоняешь локально через vercel dev)

3) Сохрани и сделай redeploy.

---

## 3) Как включить/выключить fan-out (важно)

В этом проекте нет отдельного ENV `FF_BROADCAST_QSTASH_FANOUT`.

Переключатель сделан как **runtime toggle в Redis**:
- ключ: `sys:broadcast_qstash_fanout`
- по умолчанию **OFF**

### Способ A (рекомендованный): из админки бота
1) Открой **👑 Админка**
2) Нажми кнопку:
   - `📣 QStash fan-out: ON/OFF`

### Способ B (ручной): напрямую в Redis
- поставить `sys:broadcast_qstash_fanout = "1"` → ON
- поставить `"0"` или удалить ключ → OFF

---

## 4) Admin: 🛰 QStash статус + 🧪 Send signed ping (проверка за 10 секунд)

Это самый быстрый способ убедиться, что **QStash подключён реально**, а не «в теории»:
- `QSTASH_TOKEN` позволяет **публиковать** jobs
- подпись `Upstash-Signature` **валидируется** (signing keys корректные)
- QStash **доставляет** запрос в наш воркер по публичному URL

Важно:
- экран статуса — **Redis-only**, best-effort
- если Redis деградирует, метрики могут быть `—`, но это не означает «всё сломано»

### Где в админке
👑 Админка → **🛰 QStash статус**

### Что показывает экран (как читать поля)

1) `Fan-out (Redis): ON/OFF`
- читается из Redis key `sys:broadcast_qstash_fanout`
- **ON**: cron `broadcast_tick` только **энкьюит** delivery‑jobs в QStash
- **OFF**: cron `broadcast_tick` работает в legacy‑режиме (отправляет сам)

2) `Broadcast tick last_run`
- берётся из Redis метрики `cron:broadcast_tick:last_run` (best-effort)
- показывает, что cron «дышит» и когда последний раз стартовал
- `mode` (если указан) помогает понять, каким путём tick работал

3) `Worker last delivery`
- Redis breadcrumb `qstash:broadcast_deliver:last_at`
- обновляется **на стороне воркера** `/api/qstash/broadcast-deliver`
- если fan-out ON, но `last delivery` давно не обновлялся — это сигнал проверить подпись/URL/QStash

4) `Ping enqueued / Ping received / ping status`
- `Ping enqueued` — бот записал факт «мы отправили ping в QStash»
- `Ping received` — наш endpoint `/api/qstash/ping` получил **подписанный** запрос и прошёл verify
- `ping status`:
  - `OK` — nonce совпал (значит цепочка publish → deliver → verify работает)
  - `WAIT` — ping отправили, но подтверждение ещё не пришло

5) `Broadcast cooldown`
- Redis-only поля `broadcast:cooldown_until`, `broadcast:last_429_at`, `broadcast:last_429_reason`
- **ACTIVE** означает, что воркер/тик видели 429 и включили паузу

### Что происходит при ON/OFF (и когда это применяется)

`📣 Fan-out: ON/OFF` переключает **только режим рассылок**:
- OFF → рассылки выполняются старым путём (без QStash)
- ON → tick публикует jobs в QStash, а доставка идёт через воркер

Изменение применяется «на следующем запуске cron» (tick читает флаг при старте).

### Что делает кнопка 🧪 Send signed ping

Это безопасный тест, который **не влияет на рассылки**:
1) бот публикует в QStash job на URL `/api/qstash/ping`
2) QStash вызывает наш endpoint с `Upstash-Signature`
3) endpoint проверяет подпись (`QSTASH_CURRENT_SIGNING_KEY`/`NEXT`) и пишет breadcrumbs в Redis
4) экран статуса сравнивает `enqueued nonce` и `received nonce` → показывает `OK/WAIT`

Шаги:
1) Открой **👑 Админка**
2) Нажми **🛰 QStash статус**
3) Нажми **🧪 Send signed ping**
4) Подожди 1–3 секунды и обнови экран статуса

Ожидаемое:
- `Ping enqueued` обновился
- `Ping received` обновился
- `ping status: OK`

Если `WAIT` держится дольше 10–20 секунд:
- проверь ENV `QSTASH_TOKEN` и Signing Keys (оба ключа)
- проверь, что задан `PUBLIC_BASE_URL` (пинг и воркер используют абсолютный URL)
- проверь, что endpoint `/api/qstash/ping` задеплоен и доступен (Vercel logs)
- проверь в Upstash QStash, не ушёл ли ping в DLQ

---

## 5) Рекомендуемый rollout (без регрессий)


### После деплоя
1) Держим fan-out **OFF**.
2) Прогоняем `smoke-tests_short.md`.
3) Проверяем `/api/health` (ok + cron метрики).

### Включение
1) Создай тестовый broadcast на маленькую аудиторию (5–20).
2) Включи fan-out **на 5–10 минут**.
3) Проверяй:
   - QStash: jobs публикуются/выполняются
   - `/api/health`: `broadcast.qstash_last_delivery_at` обновляется
   - Нет дублей у получателей (DB guard)

### Масштабирование
- 10% → 50% → 100% (по времени/уверенности).

### Rollback
- Переключи fan-out **OFF** — cron вернётся к старому пути.
- Воркеры могут дообработать уже опубликованные jobs (или они уйдут в ретраи/DLQ по политике).

---

## 6) Политика деградаций (фиксировано)

- **Redis down → fail-open**
  - воркер продолжает доставку
  - cooldown/метрики становятся best-effort

- **DB down → fail-closed**
  - воркер НЕ отправляет без DB guard
  - возвращает 5xx → QStash ретраит позже

- **Non-retryable Telegram → 2xx + mark failed non_retryable**
  - `blocked/chat not found/deactivated` помечаем `non_retryable=true`
  - возвращаем 200, чтобы не было бесконечных ретраев

---

## 7) Troubleshooting (быстро)

### Ошибка: `qstash_token_missing`
- не задан `QSTASH_TOKEN` в окружении

### Ошибка: `signature_invalid` / 401
- не задан(ы) signing keys
- неверные ключи (взяты не из того проекта/аккаунта)
- тело запроса проверяется не как raw body

### Массовые 429
- снизь flow control (rate/parallelism)
- проверь cooldown контур (Redis best-effort)

### Jobs в DLQ
- смотри `last_error` в DB (`broadcast_sent_log`)
- для `non_retryable=true` — это ожидаемо (пользователь заблокировал бота)
