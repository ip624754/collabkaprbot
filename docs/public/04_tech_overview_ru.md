# 04 — Технический обзор (для партнёров и технарей)

> Telegram: **@collabkaprbot**

Этот документ объясняет, как устроен Collabka PR “под капотом” и почему он безопасен для serverless.

Архитектура Collabka PR построена так, чтобы продукт оставался устойчивым в serverless-среде и мог использоваться как контролируемая рабочая система для creator/brand collaboration flows внутри Telegram.

---

## 1) Стек и компоненты

- **Runtime:** Vercel serverless (stateless)
- **DB:** Neon Postgres
- **Cache/locks:** Upstash Redis (REST)
- **Cron:** Vercel Cron / QStash → `/api/cron/*`
- **Telegram:** grammY (webhook)

---

## 2) Контрольная плоскость (Control Plane)

Основные cron‑задачи:
- `/api/cron/giveaways-tick` — закрытие конкурсов, выбор победителей, сервисные задачи
- `/api/cron/broadcast-tick` — рассылки батчами (1 batch за тик)

Авторизация cron:
- `Authorization: Bearer $CRON_SECRET`

---

## 3) Гарантии для serverless

Serverless не любит “бесконечности”, поэтому:
- задачи делают **маленькие тики**
- используется **Redis lock** (между инстансами)
- где критично — **Postgres advisory lock**
- изменения статуса — **атомарные** (guards по полям)

---

## 4) Наблюдаемость

`GET /api/health`:
- `ok:true`
- last_run по cron‑тикам
- метрики подавления audit‑логов (если включено), **Redis‑only**

Health сделан fail‑open: не падает, даже если Redis временно недоступен.

---

## 5) Экономия Neon

Ключевой инвариант проекта:
- **не добавлять лишние DB‑запросы в горячие UI пути** (меню/кнопки/хабы)

Практика:
- гейты проверяются при входе в конкретную фичу
- audit‑лог может иметь write‑shedding (ENV‑гейт) без влияния на UX
- рассылки идут батчами

---

## 6) Прозрачность конкурсов

Для розыгрышей поддерживается детерминированный PRNG (seedHash), чтобы выбор победителей был воспроизводимым.

---

## 7) Source of truth

- `docs/00_CURRENT_STATE.md` — текущий snapshot
- `docs/12_INFRA_CONTROL_PLANE.md` — cron/locks/outbox
- `docs/11_MIGRATIONS_PACK.md` — миграции (exactly‑once)

---

Если нужен публичный текст “для статьи” — `docs/public/06_telegraph_article_ru.md`.
