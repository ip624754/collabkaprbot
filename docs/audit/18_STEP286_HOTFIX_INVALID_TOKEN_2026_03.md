# 18 — STEP286 Hotfix: Invalid token (SyntaxError) after STEP285 — 2026-03-03

## Симптом
На Vercel при cold start бот падает с:
- `SyntaxError: Invalid or unexpected token`
- без указания файла/строки в логах (ESM компиляция на старте).

## Причина (root cause)
В `src/bot/bot.js` в обработчике `a:folders_my` для режима, когда Editors выключены,
вызов `safeEditOrReply()` использовал **одинарные кавычки** для строки, в которую попал **литерал перевода строки**.

JS не допускает literal newline внутри `'...'`, поэтому модуль не компилировался.

## Исправление
- В `src/bot/bot.js` строка сообщения переписана в однострочный литерал с `\n\n` (escapes).

## Инварианты
- Никаких новых кнопок/действий.
- Никаких новых DB‑чтений.
- Поведение STEP285 (Editors disabled by default) сохранено.

## QA / Smoke
1) `node --check src/bot/bot.js` проходит.
2) В боте: `📁 Папки` (Editors выключены) → показывается экран «Роль Editors отключена…».
3) Остальные сценарии STEP285 не затронуты.
