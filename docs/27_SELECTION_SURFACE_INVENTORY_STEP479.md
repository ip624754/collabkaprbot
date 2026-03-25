# 27 — Selection Surface Inventory — STEP479

## Назначение

Этот документ фиксирует **source-level inventory** активных selection surfaces в Collabka и выбирает первые **2 pilot-экрана** для будущего runtime rollout selection UI contract.

STEP479 — это **docs/source step only**:
- runtime не меняется;
- callbacks не меняются;
- DB reads не добавляются;
- money / accept / unlock / reply / stage paths не трогаются.

## Scope

Инвентаризация охватывает **видимые creator/brand-facing selection surfaces** в активном runtime tree:
- pickers;
- filters;
- profile selectors;
- tag/category surfaces;
- binary toggles, если они реально работают как отдельный state contract.

В scope **не входят**:
- обычные menu hubs;
- action rows (`Сохранить`, `Назад`, `Меню`, `Домой`, `Опубликовать`, `Принять`, `Отклонить`, `Разблокировать`);
- operator/admin runtime toggles как rollout-кандидаты selection-grid стандарта;
- deal/reply/charge/unlock critical paths.

## Truth boundary

Ниже перечислены только поверхности, которые подтверждены активным source-кодом (`src/bot/bot.js`) в STEP478 baseline.

Этот документ **не утверждает**, что rollout уже сделан. Он только отвечает на вопросы:
- где в коде уже есть selection surfaces;
- какого они типа;
- где уместен новый contract;
- какие 2 экрана безопаснее взять в pilot.

## Inventory

| Surface | Actor | File / render surface | Callback cluster | Current UX type | Target type | Apply semantics | Pilot | Risk | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Workspace Profile → `🧩 Режим` | creator owner | `src/bot/bot.js` → `renderWsProfileMode(...)` | `a:ws_prof_mode`, `a:ws_prof_mode_set` | single-choice с `✅` | **single-choice / radio-style** | instant apply | **YES** | low | Локальный profile-settings surface; edit-only; не рядом с money/deal loops |
| Workspace Profile → `🏷 Ниши` | creator owner | `src/bot/bot.js` → `renderWsProfileVerticals(...)` | `a:ws_prof_verticals`, `a:ws_prof_vert_t`, `a:ws_prof_vert_clear` | multi-select с `✅` | checkbox-style grid | instant apply + bottom action block for clear/back | no | low | Хороший кандидат, но во избежание broad sweep не идёт в первый pilot |
| Workspace Profile → `🎬 Форматы` | creator owner | `src/bot/bot.js` → `renderWsProfileFormats(...)` | `a:ws_prof_formats`, `a:ws_prof_fmt_t`, `a:ws_prof_fmt_clear` | multi-select с `✅` | **checkbox-style grid** | instant apply + bottom action block for clear/back | **YES** | low | Тот же profile-settings контур, bounded callbacks, без money/operator риска |
| Brand Profile → `🏷 Ниши бренда` | brand owner | `src/bot/bot.js` → `renderBrandNichePicker(...)` | `a:brand_niche_pick`, `a:brand_niche_set`, `a:brand_niche_clear` | single-choice с `✅` | single-choice / radio-style | instant apply + done/back row | no | medium | Близко к brand catalog semantics; не берём первым pilot до runtime mini-pass |
| Brand Profile → `💰 Бюджет` | brand owner | `src/bot/bot.js` → brand budget bucket picker | `a:brand_bb_*` | single-choice с mixed marks (`✅/▫️`) | single-choice / radio-style | instant apply + done/back row | no | medium | Каталогозависимая surface; не первый pilot |
| Brand Profile → `🎯 Цели` | brand owner | `src/bot/bot.js` → `renderBrandGoalsTagsPicker(...)` | `a:brand_gt_*` | multi-select (`✅/▫️`) | checkbox-style grid | instant apply + done/back row | no | medium | Ближе к catalog matching semantics |
| Brand Profile → `📎 Требования` | brand owner | `src/bot/bot.js` → `renderBrandReqTagsPicker(...)` | `a:brand_rt_*` | multi-select (`✅/▫️`) | checkbox-style grid | instant apply + done/back row | no | medium | Ближе к catalog matching semantics |
| Brand Directory filters → single-choice pickers (`Категория`, `Формат`, `Оплата`, `Бюджет`) | creator viewer | `src/bot/bot.js` → `renderBrandDirFilterPick(...)` / `brandDirPickKb(...)` | `a:bd_fpick`, `a:bd_fset` | single-choice с `✅` | single-choice / radio-style | instant apply | no | medium | Сильный user-facing кандидат, но находится рядом с current catalog watchlist |
| Brand Directory filters → multi-pick (`Цели`, `Требования`) | creator viewer | `src/bot/bot.js` → `renderBrandDirMultiPick(...)` / `brandDirMultiPickKb(...)` | `a:bd_mpick`, `a:bd_mt`, `a:bd_mclear`, `a:bd_mdone` | multi-select с `✅` | checkbox-style grid | instant apply + done/back row | no | medium | Тоже кандидат, но не первый rollout |
| Creator Directory filters → single-choice pickers (`Категория`, `Формат`, `Оплата`) | brand owner | `src/bot/bot.js` → `renderBxFilterPick(...)` / `bxPickKb(...)` | `a:bx_fpick`, `a:bx_fset` | single-choice с active markers | single-choice / radio-style | instant apply | no | medium | Находится внутри creator-feed path; не трогаем в первом pilot |
| Creator Directory filters → multi-pick (`🎯 Цели`, `📎 Требования`) | brand owner | `src/bot/bot.js` → `renderBxFilterMultiPick(...)` / `bxMultiPickKb(...)` | `a:bx_mpick`, `a:bx_mt`, `a:bx_mclear`, `a:bx_mdone` | multi-select | checkbox-style grid | instant apply + done/back row | no | medium | Не трогаем до отдельного runtime pass по BX filters |
| Workspace current-channel toggles (`🔗 Сеть`, current-channel enable/disable) | creator owner | `src/bot/bot.js` | `a:ws_toggle_net`, `a:ws_toggle_cur` | binary state / toggle | toggle contract | instant | no | low | Это **toggle**, не checkbox/radio rollout candidate |
| Brand deals mine-only toggle | brand owner | `src/bot/bot.js` / action registry | `a:brand_deals_mine_toggle` | binary state / toggle | toggle contract | instant | no | medium | Не selection-grid surface |

## Pilot decision

### Pilot A — multi-select
**Workspace Profile → `🎬 Форматы`**

Почему выбран:
- creator-side owner settings surface;
- bounded callback cluster;
- не рядом с money / accept / unlock / reply / stage paths;
- selection state уже есть и хорошо подходит под checkbox-style contract;
- low-risk rollout без расширения DB surface.

Почему не взяли вместо него brand/catalog filters:
- `Каталог брендов` и смежные filter paths входят в текущий live-watchlist и не должны быть первой точкой для UI-эксперимента.

### Pilot B — single-choice
**Workspace Profile → `🧩 Режим`**

Почему выбран:
- чистый single-choice surface;
- instant apply уже существует;
- легко перевести из `✅` в radio-style active-option grid без смены бизнес-логики;
- тот же profile-settings контур, что и Pilot A.

Почему не взяли `🏷 Ниши бренда` / brand directory single-picks:
- эти поверхности ближе к catalog semantics и брендовому search/matching path;
- первый pilot безопаснее делать в creator profile settings.

## Explicit non-pilot list

В STEP480 **не идут**:
- `🏷 Каталог брендов` filters;
- `🎛 Фильтры креаторов` / BX filters;
- brand profile niche/budget/goals/requirements pickers;
- deal stage / reply / inbox / applications / accept flows;
- unlock / spend / payments / paywall surfaces;
- operator/admin toggles.

## Rollout rule after STEP479

Следующий runtime шаг должен быть **узким pilot implementation**, а не broad sweep:
- 1 multi-select surface;
- 1 single-choice surface;
- reuse of the same visual contract;
- zero regressions for `Back / Menu / Home`, edit-first, and local context.
