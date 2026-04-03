# 15 — NEW CHAT HANDOFF (copy-paste) — STEP535T baseline

Цель: чтобы новый чат продолжил **текущий baseline**, а не откатывался к старому Telegram-only контексту и не терял собранный web-admin/control-plane слой.

---

## 1) Что загрузить в новый чат

1) **Актуальный FULL project zip** (текущий snapshot репозитория)
2) (Опционально) свежий скрин `/admin/runtime`, если есть live runtime change после деплоя
3) (Опционально) короткий live recap: что именно проверено руками после последнего деплоя

---

## 2) Что вставить первым сообщением в новом чате

Скопируй целиком:

---
**HANDOFF — CONTINUE FROM STEP535T BASELINE**

Продолжаем **не с нуля**, а от **STEP535T baseline**.

Текущий фокус уже не на broad redesign и не на Telegram-only cleanup. Главный собранный слой сейчас — это **web-admin control plane** для Collabka PR:
- `Обзор`
- `Пользователи`
- `Система`
- `Платежи`
- `Коммуникации` (пока без нового большого прохода)
- `Фаундер`
- `Помощь`

### Что уже стабилизировано в этой серии

- **STEP535D** — Users active-state sync + Help
- **STEP535E** — Runtime status semantics + actionability pass
- **STEP535F** — Overview cockpit + section contract uplift
- **STEP535G** — sidebar nav noise cleanup + overview micro-polish
- **STEP535H** — Payments review clarity + action rail
- **STEP535I / STEP535J** — layout balance + desktop density / interaction feedback polish
- **STEP535K** — Founder clarity + admin RU consistency
- **STEP535L / STEP535M / STEP535N** — Users truth cleanup, disabled-state finish, explicit filter apply contract
- **STEP535O / STEP535P** — Founder safety semantics + RU copy final polish
- **STEP535Q** — Runtime truth alignment for optional QStash vs real retry/schema drift
- **STEP535R** — backend fix for `unlockWorkspaceContactsWithCredits()` (`workspace_settings` join вместо legacy `profile_contact` drift)
- **STEP535S** — Runtime now reads real QStash env and marks old retry error as stale/info instead of a live outage
- **STEP535T** — baseline freeze + docs/handoff sync

### Что подтверждено source/snapshot-level

- web-admin shell / section manifest / sidebar / help surface
- Users selection contract: truthful presets, `Свой срез`, staged filter apply, disabled empty-state controls
- Overview cockpit and section contract
- Payments review plane + next-action rail
- Founder owner-only safety semantics + RU copy contract
- Runtime truth layer:
  - optional-vs-required semantics
  - real QStash env surface in config
  - stale retry signal handling
- backend source fix in `unlockWorkspaceContactsWithCredits()` for contact fields via `workspace_settings`

### Что подтверждено живьём на экране

- `Пользователи`: active-state / preset truth / apply-contract / disabled controls
- `Платежи`: review plane / buckets / action rail / empty-state balance
- `Фаундер`: owner-only surface / safety semantics / RU polish
- `Система`: QStash now reads as configured, old `profile_contact` retry shown as stale `3д`, not as a fresh live outage

### Что остаётся watchlist / требует честной оговорки

- один stale source-preflight tail остаётся вне этой серии: `smoke-admin-web-users-priority-rail-contract`
- Runtime остаётся read-first: из web-admin не мутируем retry/delivery state
- backend fix в STEP535R уже в коде, но для полного естественного исчезновения старого retry-сигнала нужен новый **успешный** monetization retry / contact-unlock сценарий или явное обновление соответствующего Redis diagnostic key
- `Коммуникации` ещё не проходили аналогичный большой clarity/polish sweep, как Users/Payments/Founder

### Что сейчас не надо делать

- не возвращаться к старому STEP493 handoff как к главному baseline
- не начинать broad redesign web-admin
- не трогать working auth / payment / runtime paths без точного source-level повода
- не смешивать optional config gap с live incident
- не ломать read-first contract ради “удобных” web-write действий

### Как работать в новом чате

Новый чат должен:
- подтвердить, что продолжает от **STEP535T**, а не с нуля
- прочитать по порядку:
  1. `docs/README.md`
  2. `docs/00_BOOT.md`
  3. `docs/00_CURRENT_STATE.md`
  4. `docs/15_NEW_CHAT_HANDOFF.md`
  5. при необходимости релевантные docs по web-admin/runtime/qstash
- кратко перечислить, что уже стабилизировано
- отдельно разделить:
  - что подтверждено source/snapshot-level
  - что подтверждено live-screen verification
  - что остаётся watchlist / требует live runtime follow-up
- предлагать **ровно один** следующий узкий шаг
- не предлагать broad redesign без реального source/runtime повода

### Какой должен быть первый ответ ассистента

Ожидаемый формат:
- подтвердить baseline = **STEP535T**
- кратко перечислить стабилизированный admin tranche (`Users / Runtime / Overview / Payments / Founder / Help`)
- отдельно назвать:
  - что уже подтверждено source-level
  - что уже подтверждено live-screen
  - что остаётся watchlist
- предложить только **один** следующий микро-шаг

---

## 3) Мини-smoke / live-pass, который ассистент должен предложить дальше

Выбирать только то, что реально связано со следующим шагом. Базовый набор сейчас:
- `/admin/users` — presets / apply rail / empty-state controls
- `/admin/payments` — review buckets / action rail / empty-state layout
- `/admin/founder` — owner-only warnings / safety semantics
- `/admin/runtime` — QStash truth / stale retry signal reading
- если идём в backend monetization retry follow-up: один свежий contact-unlock / retry сценарий, чтобы old retry marker естественно перезаписался

---

## 4) Быстрый шаблон промпта

Используй файл:
`docs/17_START_NEW_CHAT_PROMPT.md`

Он остаётся canonical behavior kernel.

---

## 5) Что читать дополнительно по текущему admin tranche

- `docs/100_WEB_ADMIN_RUNTIME_SEMANTICS_STEP535E.md`
- `docs/101_WEB_ADMIN_OVERVIEW_COCKPIT_STEP535F.md`
- `docs/102_WEB_ADMIN_DENSITY_INTERACTION_STEP535J.md`
- `docs/103_WEB_ADMIN_FOUNDER_CLARITY_RU_STEP535K.md`
- `docs/17_QSTASH_RUNBOOK.md`
- `docs/20_CONTACTS_MODEL.md`

---

## 6) Главная установка

Текущий web-admin baseline уже собран. Новый чат не должен снова рассыпать его на случайные redesign-идеи. Правильный режим работы:
- audit first
- narrow patch second
- QA third
- artifacts fourth
- docs sync always
