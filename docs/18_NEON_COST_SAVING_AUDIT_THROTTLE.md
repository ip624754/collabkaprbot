# 18 — Экономим Neon: Audit DB Throttle (write‑shedding) + мониторинг

## Зачем это нужно
В Collabka много действий, которые могут создавать *очень много* audit‑записей (особенно в `workspace_audit`). На дешёвом Neon это быстро превращается в лишние DB‑write и расход CU.

Решение: **резать только шумные audit‑события** через Redis rate‑limit (write‑shedding), *не трогая* основные продуктовые функции и не добавляя DB‑запросы в горячие UI пути.

Параллельно мы считаем **Redis‑only метрики подавления** и показываем их в `/api/health`, чтобы видеть эффект и не резать лишнее.

---

## Базовые правила (инварианты)
1) `ANALYTICS_ENABLED=false` — держим выключенным (иначе `events` добавляют DB‑write).
2) Throttle режет **только `auditWorkspace()`** (таблица `workspace_audit`).
3) **Конкурсы/розыгрыши** логируются отдельно (обычно `giveaway_audit`) и **не попадают** под этот throttle. Если когда‑то начнут жечь — делаем отдельный throttle для `auditGiveaway()` отдельным маленьким патчем.
4) Всё **safe-by-default**: если Redis недоступен — бот не падает; audit‑записи под throttle-prefix **дропаются (fail‑closed)**, а `/api/health` продолжает отвечать.

---

## Как включать на Vercel (ENV)
Минимальный набор переменных:

- `AUDIT_DB_THROTTLE_ENABLED=true|false`
- `AUDIT_DB_THROTTLE_WINDOW_SEC=60` (обычно 60 сек)
- `AUDIT_DB_THROTTLE_LIMIT=<число>`
- `AUDIT_DB_THROTTLE_PREFIXES=<список префиксов через запятую>`

Пример (стартовый, рекомендуемый):

```env
AUDIT_DB_THROTTLE_ENABLED=true
AUDIT_DB_THROTTLE_WINDOW_SEC=60
AUDIT_DB_THROTTLE_LIMIT=180
AUDIT_DB_THROTTLE_PREFIXES=lead.,folders.,ws.profile_,deal.,inbox.,brand.
```

> Важно: префиксы — это *только* те audit‑ключи, которые реально пишутся у тебя в `auditWorkspace(prefix+...)`.

---

## 3 готовых профиля (LOW / MEDIUM / HIGH)
Ориентир: лимит действует **на (prefix × окно времени)**, без кардинальности по workspace (метрики подавления тоже без wsId).

### 1) LOW saving (мягко, почти без потерь)
```env
AUDIT_DB_THROTTLE_ENABLED=true
AUDIT_DB_THROTTLE_WINDOW_SEC=60
AUDIT_DB_THROTTLE_LIMIT=600
AUDIT_DB_THROTTLE_PREFIXES=lead.,folders.,ws.profile_,deal.,inbox.
```
Подходит, если хочешь слегка успокоить всплески, но сохранять почти всё.

### 2) MEDIUM saving (баланс, обычно оптимально)
```env
AUDIT_DB_THROTTLE_ENABLED=true
AUDIT_DB_THROTTLE_WINDOW_SEC=60
AUDIT_DB_THROTTLE_LIMIT=180
AUDIT_DB_THROTTLE_PREFIXES=lead.,folders.,ws.profile_,deal.,inbox.
```
Рекомендуемый старт на 1–2 дня.

### 3) HIGH saving (жёстко, максимум экономии)
```env
AUDIT_DB_THROTTLE_ENABLED=true
AUDIT_DB_THROTTLE_WINDOW_SEC=60
AUDIT_DB_THROTTLE_LIMIT=60
AUDIT_DB_THROTTLE_PREFIXES=lead.,folders.,ws.profile_,deal.,inbox.
```
Если Neon реально горит — режем сильнее, история становится более “агрегированной”.

---

## Как смотреть эффект (только Redis, без DB)
Открой:

- `https://<твой-домен>/api/health`

И смотри блок:

- `audit.throttle.day` — день (UTC, `YYYYMMDD`)
- `audit.throttle.suppressed_today_total` — сколько audit‑insert подавлено сегодня
- `audit.throttle.suppressed_today_by_prefix` — подавление по префиксам

Быстрые ориентиры:
- **0–100/день** → почти не режет (можно LOW или вообще выключить)
- **1k–10k/день** → экономия уже заметная (MEDIUM обычно норм)
- **10k+/день** → много шума → HIGH уместен (если Neon страдает)

---

## Как расширять префиксы “по уму” (без гаданий)
Правильный порядок:

1) Ставим **MEDIUM** и 3 базовых префикса: `lead.,folders.,ws.profile_`.
2) Делаем активность 1–2 часа или 1 день.
3) Смотрим `/api/health → audit.throttle.suppressed_today_by_prefix`.
4) Если Neon всё ещё жрёт, а подавление маленькое — расширяем список префиксов точечно:

Реально часто шумят (если у тебя есть такие действия):
- `deal.`
- `inbox.`
- `brand.`

Пример расширения (баланс):
```env
AUDIT_DB_THROTTLE_PREFIXES=lead.,folders.,ws.profile_,deal.,inbox.,brand.
```

Если у тебя много действий по командам/инвайтам/таскам — добавляем **только после того, как увидим метрики**, например:
- `team.` / `invite.`
- `task.`

---

## Откат (если вдруг “перерезали”)
Откат мгновенный, без деплоя:

```env
AUDIT_DB_THROTTLE_ENABLED=false
```

Либо ослабляем:
- поднять `AUDIT_DB_THROTTLE_LIMIT`
- сократить список `AUDIT_DB_THROTTLE_PREFIXES`

---

## Что считать “готово”
- В `/api/health` видишь `audit.throttle.suppressed_*`.
- При активных кликах цифры растут.
- Neon перестал “болеть”, а UX не изменился.

