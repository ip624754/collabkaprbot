# 15 — NEW CHAT HANDOFF (copy-paste) — STEP474 baseline

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
**HANDOFF — CONTINUE FROM CURRENT PROCESS (STEP474 baseline)**

Продолжаем не с нуля, а от **STEP474 baseline**.

Текущий цикл был не про новые фичи, а про **stability + clarity + context correctness + repo hygiene** в ядре:
- creator → brand applications
- accept / charge / reply
- deals stage transitions
- local vs global navigation context
- lead / dialog / list / notice consistency
- Telegram-native density cleanup без redesign
- source-guard / preflight honesty
- docs / handoff / repo hygiene

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
- **STEP461** — canonical new-chat docs kernel refresh (`15` + `17`)
- **STEP462–466** — creator/brand reply receipts, inbox empty-state, brand applications list density cleanup
- **STEP467** — accept SQL family typed-params hardening
- **STEP468** — stale smoke sync sweep
- **STEP469** — preflight split: `source-only` vs `deps/runtime`
- **STEP470** — remaining list dedupe pass (`📨 Мои заявки`, `📨 Заявки брендов`)
- **STEP471** — terminology consistency pass (`Новый диалог`)
- **STEP472** — home copy cleanup + first-run / returning split
- **STEP473** — repo hygiene cleanup (removed confirmed stale files)
- **STEP474** — parked IG OAuth libs moved out of active `src/lib` into `_ig_oauth_parked/`, handoff/docs canon refresh
- **STEP475** — payments fallback guardrails (bounded runtime toggle, age/heartbeat, stale cleanup visibility)
- **STEP476** — broadcast stale visibility + tiny 429 atomicity hardening
- **STEP477** — IG parked hard gate (source/preflight guard that blocks silent return to active deploy surface)

### Что сейчас уже не надо делать

- заново переписывать accept / charge
- сливать applications / deals / inbox в один super-section
- делать большой IA redesign
- трогать working paths без явной причины
- возвращать parked IG OAuth в active tree без отдельного revival-step

### Что уже стабилизировано

- accept / charge ядро
- local vs global deal context
- list / card / dialog density на обеих сторонах
- notice / receipt слой на обеих сторонах
- input / fallback / recovery слой на обеих сторонах
- footer / back / list-return semantics
- creator-side catalog open blink cleanup
- creator-side application composer / local return clarity
- source-only regression sweep и честный deps/runtime split
- role-aware home и short first-run split
- repo hygiene / docs kernel / current handoff canon
- payments fallback guardrails / bounded runtime toggle visibility
- broadcast pending snapshot stale visibility / atomic 429 rolling window helper
- IG parked deploy-surface hard gate

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
- home / first-run copy in real Telegram
- latest list cleanups (`📨 Мои заявки`, `📨 Заявки брендов`, `📨 Заявки от креаторов`)

### Как работать в новом чате

Новый чат должен:
- подтвердить, что продолжает от STEP474, а не с нуля
- прочитать docs как обычно
- кратко перечислить, что уже стабилизировано
- отдельно назвать, что подтверждено source/snapshot-level
- отдельно назвать, что ещё нужно проверить живьём в Telegram
- не предлагать новый redesign
- следующим ходом делать только:
  - live runtime triage
  - или **STEP475+ micro-hotfix** по реальному хвосту

### Что нельзя делать

- не начинать “новую архитектуру”
- не трогать accept / charge без очень сильной причины
- не добавлять лишние DB reads в hot UI paths
- не устраивать массовую “чистку ради красоты”
- не ломать локальный контекст возврата
- не менять working terminology без причины
- не возвращать parked IG OAuth helpers в active `src/lib/*` без отдельного revival-плана
- не возвращать parked IG OAuth routes в active `api/ig/oauth/*` без отдельного revival-step

### Какой должен быть первый ответ ассистента

Ожидаемый формат:
- подтвердить, что baseline = STEP474
- кратко перечислить, что было стабилизировано в STEP433–474
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
- home / first-run copy: creator, brand, new user role gate

---

## 4) Быстрый шаблон промпта

Используй файл:
`docs/17_START_NEW_CHAT_PROMPT.md`

Он является canonical behavior kernel:
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
- `docs/ops/03_LIVE_RUNTIME_PASS_STEP471.md`
