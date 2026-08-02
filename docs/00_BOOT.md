# Current canonical baseline: STEP592

- Parent production commit: `d0c2f10e328d3e1464649831bcbf67840e875703` (`STEP591`, package `1.3.39`).
- Current source package: `1.3.40`.
- Active goal: configure and validate a bounded founding creator cohort, then reach 10 launch-ready creators, 5 ACTIVE offers and one timestamped onboarding canary PASS no older than 14 days.
- Runtime writes are founder-only, persistent in Redis, audited, limited to 50 members and fail closed on storage-read failure.
- No new API route/function/SQL/ENV.
- Do not advance to STEP593 until actual STEP592 exit evidence is captured.

# 00 — BOOT (якорь контекста)

**Current canonical baseline: STEP591.** Parent commit `10042b52519ee043e812ea541e34c0c5ff39248e`, package `1.3.39`. STEP590 architecture cycle is production accepted and closed. Current product priority is founding-cohort liquidity, not further broad refactoring.

1) Мы в **serverless** (Vercel) → никаких “долгих” процессов, всё пакетами.
2) **Neon** экономим: не добавляй лишние DB-запросы в горячие UI-рендеры (меню/кнопки).
3) Любая “тяжёлая” операция: **SQL-side**, а не вытягивание 10–50k строк в Node.
4) В кронах всегда: **Redis token-lock** (safe unlock) + где критично **PG advisory lock**.
5) Внешние сайд‑эффекты (пост в канал / публикация результатов / remove): сначала **reserve/lock**, потом отправка.
6) Любое изменение статуса — **атомарно** (SQL guard / `WHERE ... RETURNING`, guard по полям типа `winners_drawn_at`).
7) Winner selection — **детерминированно** (seed+hash), воспроизводимо, без `random()` в Node.
8) Ошибка → лучше “мягко остановиться” (runtime guard), чем получить hard-kill Vercel.
9) Cron notify не должен тормозить batch: `withTimeout(~5s)` на Telegram notify.
10) Миграции только через **migrations/run.js** (exactly-once, checksum), без ручных ALTER в проде.
11) Каждый патч: **маленький**, обратимый, артефакты: **FULL zip + Hotfix zip + git-apply patch** + список файлов + QA чеклист + обновление доков (минимум: `docs/00_CURRENT_STATE.md` + `docs/process/07_WORK_HISTORY_*.md`).
12) UX принцип: **кнопка видна**, доступ гейтится внутри фичи, CTA ведёт туда, где решить проблему.
13) Держим стиль **Jobs/Vitalik/Woz/Durov**: просто, прозрачно, детерминированно, Telegram-native, без магии и без UX-шума.

14) Support (SUPPORT_CHAT_ID): бот **должен быть админом** в support-группе; ручной ответ — только **reply на подсказку**; шаблоны — через кнопки.
15) Ops alerts: единый поток + digest, по умолчанию **quiet**; новые алерты — только через `queueOpsAlert` (без спама).
16) Rolling-upgrade: любые новые колонки/таблицы — с graceful fallback по `42703/42P01`, код можно деплоить до миграции.
17) Telegram rate-limit: 429 → Redis cooldown + возобновление; никаких «дожимов»/ретраев в цикле в одном запросе.
18) `callback_data` ≤ 64 байта: держим ключи короткими; если нужен контекст — токен → payload в Redis (TTL).

19) Watchlist регрессий: см. `docs/00_CURRENT_STATE.md` → раздел «Выводы последнего регресс-аудита + watchlist».
21) Для AI-assisted работы обязательны project-specific contracts: `docs/AI_NATIVE_WORKFLOW.md`, `docs/SYSTEM_INVARIANTS.md`, `docs/RISK_REGISTRY.md`.
22) `docs/CREATOR_OS_THESIS.md` — product north star, но не разрешение на broad rewrite: каждая продуктовая волна требует отдельный scoped STEP.

## См. также
- `01_SECURITY_INVARIANTS.md` — инварианты безопасности/монетизации (payments, кредиты/разлок, ownership-in-SQL, deep-links, cron).


- IG OAuth parked in STEP383: `api/ig/oauth/*` removed from deploy surface to stay under Vercel Hobby function cap; Instagram remains a normal profile link/contact after unlock.
