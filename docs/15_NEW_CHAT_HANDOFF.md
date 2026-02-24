# 15 — NEW CHAT HANDOFF (copy‑paste) — 2026-02-24

Цель: чтобы в новом чате ассистент **сразу** попал в контекст и работал без регрессий.

---

## 1) Что загрузить в новый чат
1) **FULL project zip** (актуальный snapshot репозитория)
2) (Опционально) отдельный **docs zip** — если хочешь грузить только доки (но в FULL zip они уже есть)
3) (Опционально) список env‑переменных, которые включены в проде (без секретов)

---

## 2) Что вставить первым сообщением в новом чате

Скопируй целиком:

---
Я продолжаю работу над **Collabka PR** (@collabkaprbot).

Я загрузил:
- полный архив репозитория (FINAL snapshot)
- доки в папке docs/ (актуальные)

Инварианты:
- Vercel serverless, Neon бережём
- не добавлять лишние DB‑запросы в горячие UI пути (меню/кнопки)
- любые изменения маленькие, обратимые, без ломки прода

Текущее состояние (важное):
- `/api/health`: cron last_run + метрики audit throttle (Redis-only) + `broadcast.cooldown` после 429
- audit write‑shedding (ENV‑гейт) для снижения INSERT в audit
- broadcast: URL‑кнопки до 3, deep-link shortcuts (gw/bp/offer), шаблоны кнопок, ссылки “в слово”, финальный экран рассылки с кнопками
- broadcast: 429-safe курсор + Redis cooldown (пауза) + cooldown виден в `/api/health`
- `/start` role gate: если нет ui_mode (Redis) и нет payload → короткая развилка (Бренд/Креатор), fail‑open
- Official publish (@collabka_offers): анти‑дубли token-lock + DB-reserve `PUBLISHING` (stale rescue) + runbook (`docs/19_*`)
- Founder Sale: экран акции + Stars purchase + runtime управление из админки + deep-link `fs_*`

Монетизация / безопасность (последние усиления):
- Brand UI: баланс кредитов **Redis-first** (TTL, `BRAND_CREDITS_CACHE_TTL_SEC`) — меньше чтений Neon
- Brand Pass (контакты): анти‑bypass текста профиля + явный счётчик разлоков + после списания выдаём полный контакт‑пакет
- Paid-unlock контактов **exactly-once**: unlock фиксируется в DB (`brand_contact_unlocks.unlocked_until`) → no double charge при деградации Redis
- Payments hardening (Stars): `pre_checkout_query` и `successful_payment` валидируют `invoice_payload + total_amount + currency`, невалидное → ORPHANED + OPS
- Access control hardening: ownership проверяется **в SQL** (safe-getters) для brand leads / brand applications; `off_buy` берёт оффер через owner-query

Пожалуйста:
1) прочитай `docs/README.md` → затем `docs/00_BOOT.md` → затем `docs/00_CURRENT_STATE.md`
2) перечисли 3–7 самых рисковых зон регрессий
3) предложи следующий микро‑шаг без расширения поверхности и без лишних DB‑запросов в меню

Формат результата для любого изменения:
- FULL zip + Hotfix zip (только изменённые файлы) + git‑apply patch
- список изменённых файлов + что поменялось
- QA чеклист
---

---

## 3) Мини‑смоук, который ассистент должен предложить
- `/api/health` (ok/cron/audit/broadcast.cooldown)
- payments (test invoice → pre_checkout ok → successful_payment applied; либо ORPHANED при несоответствии)
- Brand Pass: unlock контактов списывает 1 раз; повторный клик в TTL не списывает
- lead/app actions: “чужие” id не открываются и не удаляются
- broadcast (создать тест → tick вручную → “завершена” с кнопками)
- `/start` (новый юзер видит роль, deep‑links не ломаются)

---

## 4) Быстрый шаблон промпта
Если хочется прям “как надо” — используй файл:
`docs/17_START_NEW_CHAT_PROMPT.md`
