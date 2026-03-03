# Audit — Dual-role mode switching (Creator + Brand + Brand Manager) — 2026-03

Цель: исключить “полу‑состояния” при переключении ролей и обеспечить fail‑open UX при деградации Redis.

## Контекст
В продукте есть несколько UI‑режимов:
- `ui_mode`: Creator vs Brand (Redis hint)
- `bm_mode`: Brand Manager overlay (Redis hint)
- `cur_mode`: Curator overlay (Redis hint)

Риски:
1) Пользователь включает manager‑mode, потом переключает `ui_mode` на Creator → Home/Guide может продолжать считать его “Менеджер бренда” из-за `bm_mode`.
2) При Redis degraded `a:ui_mode_set`/`bm_*` могут fail-closed и/или “не работать”, если зависят от Redis.

## Findings
### F1 — Полу‑состояние (bm_mode overrides Home/Guide)
- В `renderHomeHub()` effective mode вычислялся с приоритетом `bm_mode`.
- Если `bm_mode` оставался включённым, а пользователь явно переключался на Creator, Home мог показывать карту Brand/Manager.

### F2 — Role switch должен быть доступен при Redis degraded
- `a:ui_mode_set` и часть `bm_*` действий не должны fail-closed, иначе при Redis outage пользователь не может выбрать роль.

### F3 — Redis degraded: выбранный режим должен отображаться сразу
- Даже если Redis недоступен и `ui_mode` нельзя сохранить, UX должен показывать выбранный режим (fail-open) на текущем экране.

## Fix (STEP274)
1) `src/bot/actionRegistry.js`
   - `a:ui_mode_set`, `a:bm_mode_set`, `a:bm_pick_brand`, `a:bm_set_brand` переведены на `guard: NONE`.
   - Обоснование: действия безопасны; Redis используется только как best‑effort UI state.

2) `src/bot/bot.js`
   - При `a:ui_mode_set` всегда очищается brand‑manager state: `disableBrandManagerState(tgId)`.
   - `clearBmActiveBrand()` и `disableBrandManagerState()` сделаны безопасными при Redis degraded (try/catch).
   - `renderMainMenu()` получил параметр `modeOverride` для немедленного рендера выбранного режима даже при Redis outage.

## Smoke / QA
- Пользователь с dual-role:
  1) Войти в `🧑‍💼 Я менеджер бренда` → убедиться, что UI в Brand.
  2) Нажать `✨ Я Creator / канал` → ожидание: Home/Меню показывает Creator, а не “Менеджер бренда”.
  3) Нажать `🏷 Я бренд` → ожидание: показывается Brand (не менеджер) и не требуется Redis.

- Redis degraded (Preview):
  1) “🏷 Я бренд” (`a:ui_mode_set`) не уходит в общий error.
  2) На текущем экране после клика сразу показывается выбранный режим (best‑effort, даже если не сохраняется).

Риск регрессий: низкий (изменения в guards + очистка Redis state + локальный override в рендере меню).
