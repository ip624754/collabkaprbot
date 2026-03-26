# 28 — Telegram copy clarity sweep — STEP481

## Назначение

Этот документ фиксирует **source-first review** пользовательских Telegram-текстов в активном runtime tree.

Цель STEP481:
- собрать key user-facing copy surfaces;
- отметить, где текст звучит роботизированно, слишком плотно, неестественно или двусмысленно;
- отметить, где экрану нужна новая строка вместо плотной строки;
- отметить, где нужен более честный zero-state / next-step hint;
- подготовить **узкий runtime hotfix-пакет по текстам** без broad rewrite и без трогания money / accept / unlock / reply логики.

STEP481 — это **source/docs step only**:
- runtime не меняется;
- callbacks не меняются;
- DB reads не добавляются;
- selection pilot STEP480 не расширяется;
- money / accept / unlock / reply / stage paths не трогаются.

## Scope

Проверка охватывает только **creator/brand-facing copy** в активном runtime tree (`src/bot/bot.js`) и только на экранах, где текст влияет на понимание текущего состояния, фильтров, пустой выдачи и next-step action.

В scope:
- filters;
- catalog/list headers;
- picker helper text;
- zero-state / no-results copy;
- profile selection helper text;
- simple mode notices.

Вне scope:
- admin/mod/operator copy;
- legal/ops diagnostics;
- error strings глубоко в worker/cron;
- brand payment / apply / unlock receipts как отдельный rewrite-пакет.

## Truth boundary

Ниже перечислены только те поверхности, которые подтверждены активным source-кодом STEP480 baseline.

Этот документ **не утверждает**, что тексты уже исправлены. Он только отвечает на вопросы:
- где copy уже хорошая и её лучше не трогать;
- где copy слишком плотная или системная;
- где нужна новая строка;
- где нужен более понятный zero-state;
- какой узкий runtime hotfix даст максимум UX clarity без регрессий.

## Review rules

При разметке использовались такие теги:
- **robotized** — звучит как системное описание, а не как продуктовый текст;
- **dense** — слишком много смыслов в одной строке/абзаце;
- **unnatural** — пользователь так не говорит;
- **ambiguous** — не до конца ясно, что состояние, что механика, что действие;
- **needs newline** — строку нужно разбить ради чтения;
- **zero-state hint** — нужен более полезный текст для `0` / пустого состояния;
- **keep** — copy уже хорошая и не требует правки сейчас.

## Priority findings

### P1 — Brand Directory filters

| Surface | File / function | Current issue tags | Что не так | Что лучше сделать |
|---|---|---|---|---|
| `🎛 Фильтры брендов` | `src/bot/bot.js` → `renderBrandDirFilters(...)` | robotized, dense, unnatural, needs newline | `Режим: 🎬 Креатор · Ты ищешь: 🏷 бренды` и `Фильтруем бренды по тому, что бренд заполнил в профиле.` звучат системно и слеплены в одну плотную шапку. Сводка фильтров печатается одной простынёй. `Совпадений брендов` сухо. `увидеть выдачу` — канцеляризм. | Разделить шапку на отдельные строки (`Режим` / `Каталог`). Сводку фильтров перенести на несколько строк. `Совпадений брендов` заменить на `Найдено брендов`. `увидеть выдачу` заменить на `открыть список` / `посмотреть результат`. |
| `🏷 Каталог брендов` header + no-results | `src/bot/bot.js` → `renderBrandsDirectory(...)` | robotized, dense, ambiguous, zero-state hint | `Фильтры берутся из настроек брендов` и `Показываю бренды с заполненным профилем (4/4)` звучат как системная заметка. При `0` есть hint, но он длинный и больше объясняет внутреннюю механику, чем помогает выбрать следующий шаг. | Упростить шапку: `Каталог`, `Фильтры`, короткое пояснение. Для `0` оставить 1 короткий explanation line + 1 next-step line (`Ослабь 1–2 фильтра` / `Нажми «♻️ Сброс»`). |
| single-choice picker (`Категория`, `Формат`, `Оплата`, `Бюджет`) | `src/bot/bot.js` → `renderBrandDirFilterPick(...)` | slightly robotized | `Текущее:` и `Выбери значение:` рабочие, но сухие. | Свести к более живому шаблону: `Сейчас выбрано:` / `Выбери один вариант`. |
| multi-pick (`Цели`, `Требования`) | `src/bot/bot.js` → `renderBrandDirMultiPick(...)` | slightly robotized | `Выбрано: N` и `Выбери теги:` нормальны, но можно сделать чуть понятнее. | `Выбрано тегов: N` / `Можно выбрать несколько`. |

### P1 — BX / creator feed filters

| Surface | File / function | Current issue tags | Что не так | Что лучше сделать |
|---|---|---|---|---|
| `🎛 Фильтры креаторов` | `src/bot/bot.js` → `renderBxFilters(...)` | robotized, dense, needs newline | Та же конструкция `Режим: 🏷 Бренд · Ты ищешь: 🎬 креаторов` + `Фильтруем креаторов по тому, что они указали в оффере.` Смысл верный, но звучит не как живой продукт. | Привести к тому же шаблону, что и brand filters: отдельные строки `Режим` / `Лента` и короткая фраза `Фильтры работают по данным из оффера`. |
| `📰 Лента креаторов` header | `src/bot/bot.js` → `renderBxFeed(...)` | dense | В header сразу и режим, и скрытый блок фильтров, и дальше лента. Текст не сломан, но копия перегружена. | Сохранить spoiler с фильтрами, но сделать шапку короче и чище. |
| single-choice picker (`Категория`, `Формат`, `Оплата`) | `src/bot/bot.js` → `renderBxFilterPick(...)` | slightly robotized | Те же generic `Текущее` / `Выбери значение`. | Синхронизировать wording с brand-side picker surfaces. |
| multi-pick (`🎯 Цели`, `📎 Требования`) | `src/bot/bot.js` → `renderBxFilterMultiPick(...)` | dense | Текст рабочий, но helper line можно сделать короче. | Оставить `Совпадение: любой из выбранных тегов.`, но убрать повторяющиеся вводные. |
| `📰 Лента креаторов` недоступна в Creator mode | `src/bot/bot.js` → `renderBxBrandOnlyNotice(...)` | slightly dense | Экран понятный, но шапка опять использует `Режим ... Ты ищешь ...`. | Переписать в короткий режимный notice без этой формулы. |

### P2 — creator profile selection screens

| Surface | File / function | Current issue tags | Что не так | Что лучше сделать |
|---|---|---|---|---|
| `🧩 Режим профиля` | `src/bot/bot.js` → `renderWsProfileMode(...)` | keep | Текст уже живой и понятный: отдельные строки, быстрый hint, список значений, `Сейчас`. | Не трогать в STEP482, если live-pass не покажет проблему. |
| `🎬 Форматы` | `src/bot/bot.js` → `renderWsProfileFormats(...)` | keep | После STEP480 текст уже компактный и соответствует новому selection contract. | Не трогать. |
| `🏷 Ниши` | `src/bot/bot.js` → `renderWsProfileVerticals(...)` | mostly good | Copy живая и короткая. Основная будущая работа здесь скорее визуальная (selection markers), а не текстовая. | В copy hotfix не включать. |

### P2 — brand application draft flow

| Surface | File / function | Current issue tags | Что не так | Что лучше сделать |
|---|---|---|---|---|
| `📝 Заявка бренду` | `src/bot/bot.js` → `renderBrandApply(...)` | slightly dense | Экран в целом хороший, но блок шагов длинноват и чуть напоминает инструкцию, а не product flow. | Можно сократить wording в отдельном шаге, но это не P1 и не должен идти в первый copy hotfix. |
| `👀 Предпросмотр заявки` | `src/bot/bot.js` → `renderBrandApplyPreview(...)` | keep | Чисто, коротко, без мусора. | Не трогать. |

## Concrete rewrite candidates

### 1) `🎛 Фильтры брендов`

**Current intent:** правильный.
**Problem:** слишком плотная шапка + системный язык.

**Recommended copy:**

```text
🎛 Фильтры брендов

Режим: 🎬 Креатор
Каталог: 🏷 Бренды

Фильтры работают по данным из профиля бренда.

Категория: …
Формат: …
Оплата: …
Бюджет: …
Цели: …
Требования: …

Найдено брендов: N

Фильтры применяются сразу.
Нажми «📋 Показать бренды», чтобы открыть список.
```

### 2) `🏷 Каталог брендов` — empty / no-results

**Recommended copy when filtered and 0 results:**

```text
По этим фильтрам бренды пока не найдены.

Ослабь 1–2 фильтра или нажми «♻️ Сброс».
```

**Recommended copy when no brands at all:**

```text
Пока брендов нет.

Бренды появятся здесь, когда заполнят профиль.
```

### 3) `🎛 Фильтры креаторов`

**Recommended copy:**

```text
🎛 Фильтры креаторов

Режим: 🏷 Бренд
Лента: 🎬 Креаторы

Фильтры работают по данным из оффера креатора.

Категория: …
Формат: …
Оплата: …
Цели: …
Требования: …

Фильтры применяются сразу.
Нажми «📋 Показать креаторов», чтобы открыть список.
```

### 4) Generic single-choice picker wording

**Replace:**
- `Текущее:`
- `Выбери значение:`

**With:**
- `Сейчас выбрано:`
- `Выбери один вариант`

### 5) Generic multi-pick wording

**Replace:**
- `Выбрано: N`
- `Выбери теги:`

**With:**
- `Выбрано тегов: N`
- `Можно выбрать несколько`

## Newline / layout flags

В первую очередь нужно разбить на отдельные строки:
- формулу `Режим: … · Ты ищешь: …`;
- длинные filter summary lines (`Категория · Формат · Оплата · Бюджет · Цели · Требования`);
- объяснение механики и next step не держать в одной строке;
- zero-state hint отделять от main state line пустой строкой.

## Consistency rules to lock before runtime hotfix

1. Не использовать одновременно в похожих экранах четыре разных слова для результата (`совпадения`, `результаты`, `выдача`, `найдено`).
   - Предпочтительно: `Найдено брендов: N`, `Найдено креаторов: N`.

2. Не писать системным языком там, где нужен product copy.
   - убирать: `увидеть выдачу`, `по тому, что ... заполнил`, `фильтры берутся из ...`, `показываю ...`.

3. Одна мысль = одна строка.
   - контекст;
   - текущее состояние;
   - механика;
   - next step.

4. Zero-state должен не только сообщать `0`, но и давать next step.

5. Не трогать хорошие тексты ради симметрии.
   - `renderWsProfileMode(...)`, `renderWsProfileFormats(...)`, `renderBrandApplyPreview(...)` сейчас лучше оставить как есть.

## Recommended runtime scope after STEP481

Следующий runtime hotfix должен быть **узким** и идти волной, а не broad sweep.

### STEP482A — copy hotfix wave 1
Только high-signal creator/brand-facing list/filter cluster:
- `renderBrandDirFilters(...)`
- `renderBrandsDirectory(...)`
- `renderBrandDirFilterPick(...)`
- `renderBrandDirMultiPick(...)`
- `renderBxFilters(...)`
- `renderBxFilterPick(...)`
- `renderBxFilterMultiPick(...)`
- при необходимости `renderBxBrandOnlyNotice(...)`

### Не включать в первую волну
- accept / reply / unlock / spend;
- operator/admin copy;
- payment receipts;
- long-form wizard copy;
- error diagnostics.

## Acceptance for STEP481

STEP481 считается выполненным, если:
- собран source-level список high-priority user-facing copy surfaces;
- на каждой поверхности отмечено, что именно не так (`robotized`, `dense`, `needs newline`, `zero-state hint`);
- выделены экраны, которые **не надо трогать**;
- предложены concrete rewrite candidates минимум для P1 filter/catalog surfaces;
- зафиксирован узкий runtime scope следующего hotfix-пакета.
