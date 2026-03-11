# 01 — Operator Incident Playbook (STEP406)

Короткий файл для владельца/оператора после hardening шагов STEP403–STEP405.

## 1) Где смотреть первым делом

1. `/api/health`
2. `Admin → Ops / System / Official Publish card`
3. Только потом — Vercel logs / QStash logs

Правило: **сначала health и safe operator action, потом ручные повторы**.

---

## 2) Broadcast: DB overload + Redis degraded

### Сигналы
- `broadcast.db_overload`
- `broadcast.tick_deferred_redis`
- `broadcast.pending_deliveries`
- `broadcast.db_overload.local_fuse_active=true` / `local_fuse_until_ms`

### Что это значит
Если local fuse активен, тёплый инстанс уже short-circuit'ит повторные доставочные вызовы без нового DB touch. Это защитный режим, а не “сломанный deliver”.

### Что делать
1. Открой `/api/health`.
2. Проверь, что local fuse / cooldown действительно видны.
3. Не жми manual replay/deliver “на всякий случай”.
4. Дай fuse/cooldown истечь.
5. Если проблема не уходит — смотри ops digest и infra logs.

---

## 3) Payments: большой хвост `ORPHANED / missing_session`

### Сигналы
- payments block в `/api/health`
- `payments.orphaned_autoheal_chain_max`
- ops alerts / worker logs по `orphaned_autoheal`

### Что это значит
Система теперь умеет разбирать большой хвост bounded chain-drain'ом: cron делает first leg, worker продолжает ограниченную цепочку.

### Что делать
1. Не увеличивай batch руками.
2. Не включай runtime `Payments fallback apply` без явного инцидента.
3. Дай chain-drain доработать и смотри health/ops.
4. Если backlog не уменьшается — проверяй worker/qstash path, а не запускай массовые ручные apply.

---

## 4) Official Publish stuck в `PUBLISHING`

### Сигналы
- карточка official post долго остаётся в `PUBLISHING`
- модератор не видит финальный state

### Что делать
1. Открой карточку публикации.
2. Нажми `🩺 Проверить статус`.
3. Дай safe verify/self-heal синхронизировать state:
   - ACTIVE через breadcrumb/message_id
   - либо safe reset в PENDING, если publish реально завис
4. Не делай republish “на всякий случай”, пока не отработал safe verify.

---

## 5) Чего не делать

- Не включать спорные runtime флаги без причины.
- Не делать manual replay/deliver, если health уже показывает protective fuse/cooldown.
- Не лечить `PUBLISHING` повторной публикацией до `🩺 Проверить статус`.
- Не включать payment fallback apply как “универсальную кнопку починки”.

---

## 6) Основные ссылки

- `docs/90_OWNER_RUNBOOK.md`
- `docs/91_PROD_LAUNCH_30MIN.md`
- `docs/93_PROD_DEPLOY_CHECKLIST.md`
- `docs/94_PROD_READINESS_PACK.md`
- `docs/19_OFFICIAL_PUBLISH_IDEMPOTENCY.md`
- `docs/process/10_RELEASE_PREFLIGHT.md`
