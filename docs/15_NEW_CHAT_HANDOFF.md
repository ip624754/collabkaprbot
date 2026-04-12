# 15 — NEW CHAT HANDOFF (copy-paste) — STEP577 baseline

Цель: чтобы новый чат продолжил **текущий рабочий baseline**, а не стартовал от старого контекста и не игнорировал invite/rewards wave STEP548–576.

---

### STEP577 latest narrow baseline note
- invite module entrypoint stays `📨 Инвайты` and the user IA split from STEP576 remains in place
- self-invite `/start` rejection now returns with explicit recovery buttons instead of a buttonless warning tail
- invite user surfaces are copy-polished into one RU-first layer: `Сводка`, `Приглашено`, `Активировано`, `Конверсия активации`, `Быстрый статус`, `Последние приглашённые`, `Доступно / В ожидании / Обменяно`
- the global `🏠 Home` label is intentionally preserved as the product-wide root escape hatch
- reward math / ledger semantics / anti-abuse remain unchanged


## 1) Что загрузить в новый чат

1. Актуальный **FULL project zip**
2. При необходимости свежий `/api/health` или краткий live runtime recap
3. Опционально — hotfix/patch последнего шага, если новый чат должен разбирать именно дельту

---

## 2) Что вставить первым сообщением в новом чате

Скопируй целиком:

---
**HANDOFF — CONTINUE FROM CURRENT PROCESS (STEP577 baseline)**

Продолжаем не с нуля, а от **STEP577 baseline**.

Сначала прочитай по порядку:
1. `docs/README.md`
2. `docs/00_BOOT.md`
3. `docs/00_CURRENT_STATE.md`
4. `docs/91_PROD_LAUNCH_30MIN.md`
5. `docs/15_NEW_CHAT_HANDOFF.md`

### Что уже стабилизировано в текущей волне

#### Bot/runtime correctness (STEP536–542)
- callback ack / feedback contract hardened
- orphan/stale callback surfaces cleaned up
- input-state boundary hardened
- callback consistency guard added to source preflight
- `gw_access*` extracted from monolith and aligned with project lifecycle truth
- `gw_access` prompt/truth boundary hardened

#### Web-admin mobile + runtime truth (STEP543A–545)
- mobile shell / drawer / shared responsive surfaces landed
- Users mobile working slice landed
- mobile consistency follow-up landed
- stale retry signal now downgraded correctly in `System`
- `Overview` now uses the same runtime truth contract as `System`

### Current live-confirmed reading
- `System = OK`
- `Overview = OK`
- `Runtime warnings = 0`
- stale retry signal is historical/info, not active degraded
- mobile admin pass is in place and usable

### Что подтверждено source/snapshot-level
- STEP536–545 source smokes and preflight were run during the wave
- docs canon updated step-by-step
- current read-model truth in `Overview` and `System` is aligned

### Что ещё требует обычного live observation
- normal production observation after deploy
- manual admin/mobile checks on real phone as needed
- ordinary Telegram runtime spot-checks after future changes

### Что сейчас НЕ надо делать
- не возвращаться к QStash/DB/profile_contact расследованию как к активной аварии
- не делать новый широкий bot/router rewrite
- не делать новый большой admin redesign
- не ломать mobile/admin shell ради косметики
- не поднимать stale retry breadcrumb обратно в active warning lane

### Как должен выглядеть первый ответ ассистента
- подтвердить, что работа продолжается от **STEP545T baseline**
- кратко перечислить, что стабилизировано в STEP536–545
- отдельно разделить source-confirmed vs live-confirmed
- назвать ровно **один** следующий микро-шаг с наибольшим leverage
- не предлагать redesign без source/runtime повода

---

## 3) Мини-smoke, который новый чат должен предложить первым

1. `System` / `Overview` / `Обновить`
2. один mobile admin pass: Overview → Users → Runtime
3. короткий Telegram pass по критичным работающим путям после любого нового runtime/bot патча
4. `/api/health` / runtime recap only if новая задача реально затрагивает prod-runtime truth

---

## 4) Canonical prompt kernel

Используй:
- `docs/17_START_NEW_CHAT_PROMPT.md`

Он остаётся главным behavioral kernel: baseline-first, docs-first, narrow patching, audit → patch → QA → artifacts.

---

## 5) Production docs

- `docs/91_PROD_LAUNCH_30MIN.md`
- `docs/92_PROD_ENV_BASELINE.md`
- `docs/93_PROD_DEPLOY_CHECKLIST.md`
- `docs/94_PROD_READINESS_PACK.md`
- `docs/ops/03_LIVE_RUNTIME_PASS_STEP471.md`

---

## 6) Главная установка

Новый чат должен продолжать от **реального текущего baseline**:
- bot/runtime hardening wave landed
- web-admin mobile/runtime truth wave landed
- open known defect class сейчас не зафиксирован
- следующий ход выбирается только по свежему source/runtime сигналу, а не по устаревшему handoff-контексту
