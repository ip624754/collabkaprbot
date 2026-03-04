# 32 — Stateless fallback: input reset + silent clear (expectText/draft) — 2026-03

Контекст:
- При деградации Redis (или при stateless fallback UI) пользователь может оказаться в состоянии «ожидание ввода текста» (expectText/draft).
- В safe-mode UI раньше не было гарантированного способа сбросить ввод, а переходы `s:menu/s:home/s:help` не делали best-effort очистку.

Риск:
- UX-тупики: пользователь жмёт кнопки, а бот всё ещё ждёт текст (или после восстановления Redis продолжает ждать старый ввод).

Решение (STEP303):
1) **Кнопка «🔄 Сбросить ввод»** добавлена во все stateless клавиатуры.
2) `handleStatelessCallback()` делает **silent best-effort** очистку `expectText` и `draft` через `redis.del()` (без лог-спама при Redis down).
3) Экран `s:reset_input` чистит состояние и возвращает пользователя в «Меню (безопасный режим)».

Изменённые файлы:
- `src/bot/bot.js`

QA (smoke):
1) Смоделировать degraded-mode экран (кнопки `s:*`).
2) Нажать `🔄 Сбросить ввод` → показывается меню safe-mode.
3) После восстановления Redis проверить, что ввод не «залип» (expectText/draft не держат пользователя).
4) Break-glass confirm экран: кнопка `🔄 Сбросить ввод` присутствует.

Риск регрессий: низкий.
- Изменения затрагивают только stateless fallback и best-effort очистку state.
- Ошибки Redis проглатываются, DB не трогаем.
