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

## 4) Быстрый self-check (10 секунд): Admin → QStash статус → signed ping

Зачем: быстро проверить, что:
- `QSTASH_TOKEN` работает (мы можем публиковать job)
- подпись `Upstash-Signature` валидируется (signing keys корректные)
- воркер доступен и доходит до нашего приложения

Шаги:
1) Открой **👑 Админка**
2) Нажми **🛰 QStash статус**
3) Нажми **🧪 Send signed ping**
4) Подожди 1–3 секунды и обнови экран статуса

Ожидаемое:
- `Ping enqueued` обновился (это мы записали в Redis на стороне бота)
- `Ping received` обновился (это пришёл подписанный запрос от QStash и прошёл verify)
- `ping status: OK`

Если `Ping received` не обновляется:
- проверяй signing keys (`QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`)
- проверь, что `CFG.PUBLIC_BASE_URL` верный (QStash доставляет по абсолютному URL)

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
