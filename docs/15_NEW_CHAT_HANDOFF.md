# 15 — NEW CHAT HANDOFF (copy-paste) — STEP460 baseline

Цель: чтобы новый чат **сразу продолжил текущий процесс**, а не начинал проект заново.

---

## 1) Что загрузить в новый чат

1) **FULL project zip** (актуальный snapshot репозитория)
2) (Опционально) отдельный docs zip
3) (Опционально) актуальный `/api/health` или краткий live runtime recap после деплоя

---

## 2) Что вставить первым сообщением в новом чате

Скопируй целиком:

---
**HANDOFF — CONTINUE FROM CURRENT PROCESS (STEP460 baseline)**

Продолжаем не с нуля, а от **STEP460 baseline**.

Текущий цикл был не про новые фичи, а про **stability + clarity + context correctness** в ядре:
- creator → brand applications
- accept / charge / reply
- deals stage transitions
- local vs global navigation context
- lead / dialog / list / notice consistency
- Telegram-native density cleanup без redesign

### Что уже критично стабилизировано

- **STEP433** — QStash dedup hotfix (`DeduplicationId cannot contain ':'`)
- **STEP434** — super-admin OPS COPY вынесен под отдельный env-gated flow
- **STEP435** — post-accept UX cleanup, убран misleading переход после accept
- **STEP436** — accept completion hardening: sync-first completion, async только как fallback
- **STEP437** — critical SQL fix for accept (`could not determine data type of parameter $2`)
- **STEP438** — template quick-buttons relabel на brand side
- **STEP439** — deals stage + local/global context
- **STEP440–456** — signal-first list/card/dialog/notice/footer consistency pass на обеих сторонах
- **STEP457** — creator-side `🏷 Каталог брендов` open-path cleanup без blink на normal path
- **STEP458** — accept SQL family hardening + accept smoke wired in preflight
- **STEP459** — brand quick-reply preview dedupe cleanup
- **STEP460** — creator application dialog / composer / local-return clarity pass

### Что сейчас уже не надо делать

- заново переписывать accept / charge
- сливать applications / deals / inbox в один super-section
- делать большой IA redesign
- трогать working paths без явной причины

### Что уже стабилизировано

- accept / charge ядро
- local vs global deal context
- list / card / dialog density на обеих сторонах
- notice / receipt слой на обеих сторонах
- input / fallback / recovery слой на обеих сторонах
- footer / back / list-return semantics
- creator-side catalog open blink cleanup
- creator-side application composer / local return clarity

### Что ещё требует live runtime verification

Проверить руками после deploy:
- creator → brand application
- brand open application
- accept
- creator dialog open
- creator reply
- brand reply
- local `📌 Стадия сделки`
- stage transitions
- local back
- global deals path
- creator leads flow
- brand leads flow
- unlock / follow-ups
- empty states
- catalog open path без blink
- creator application local return (`⬅️ К диалогу #…` / `⬅️ К заявке #…`)

### Как работать в новом чате

Новый чат должен:
- подтвердить, что продолжает от STEP460, а не с нуля
- прочитать docs как обычно
- кратко перечислить, что уже стабилизировано
- отдельно назвать, что подтверждено source/snapshot-level
- отдельно назвать, что ещё нужно проверить живьём в Telegram
- не предлагать новый redesign
- следующим ходом делать только:
  - live runtime triage
  - или **STEP461+ micro-hotfix** по реальному хвосту

### Что нельзя делать

- не начинать “новую архитектуру”
- не трогать accept / charge без очень сильной причины
- не добавлять лишние DB reads в hot UI paths
- не устраивать массовую “чистку ради красоты”
- не ломать локальный контекст возврата
- не менять working terminology без причины

### Какой должен быть первый ответ ассистента

Ожидаемый формат:
- подтвердить, что baseline = STEP460
- кратко перечислить, что было стабилизировано в STEP433–460
- отдельно назвать:
  - что подтверждено source/snapshot-level
  - что ещё нужно проверить живьём в Telegram
- предложить только один следующий микро-шаг:
  - runtime verification / triage
  - либо micro-hotfix по реальному хвосту
---

---

## 3) Мини-smoke, который ассистент должен предложить

- `/api/health` (ok / mon.accept / cron / audit)
- creator → brand application → brand accept → creator reply → brand reply
- local `📌 Стадия сделки` → stage transition → local back
- `🏷 Каталог брендов` fast path без blink
- creator application flow: `✍️ Ответить бренду` → composer → `⬅️ К диалогу #…` / `📨 К заявкам`

---

## 4) Быстрый шаблон промпта

Используй файл:
`docs/17_START_NEW_CHAT_PROMPT.md`

Он теперь является canonical prompt v3:
- Jobs / Vitalik / Woz / Durov
- docs-first
- small-surface-area patching
- Telegram-native clarity
- local-context-first UX

---

## 5) Production docs (read before going live)

- `docs/91_PROD_LAUNCH_30MIN.md`
- `docs/92_PROD_ENV_BASELINE.md`
- `docs/93_PROD_DEPLOY_CHECKLIST.md`
- `docs/94_PROD_READINESS_PACK.md`
