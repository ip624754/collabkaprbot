# 25 — TELEGRAM UI PATTERN REUSE

Цель: зафиксировать **повторяемый UI-паттерн Collabka**, чтобы в другом боте можно было воспроизвести не просто кнопки, а именно тот тип Telegram UX, который ощущается как **чистый, статичный, app-like интерфейс на одной UI-поверхности**.

Этот документ описывает:
- по какому принципу у нас организованы меню и экраны;
- почему интерфейс не спамит новыми сообщениями;
- где это закреплено в коде;
- какие инварианты нельзя потерять при переносе в другой бот.

---

## 1) Короткая формула паттерна

У нас бот построен не как “чат команд”, а как:

**single-message Telegram UI router**

То есть:
- пользователь нажимает inline-кнопки;
- бот по умолчанию **редактирует текущее UI-сообщение**;
- новые сообщения появляются только там, где редактировать исходный экран нельзя или нежелательно;
- интерфейс ощущается как **один экран, который меняется**, а не как цепочка новых bot-messages.

Именно это и создаёт ощущение “статичности”, чистоты и отсутствия дёрганья.

---

## 2) Базовая модель рендера

Главный паттерн:

**route -> render screen -> edit same message -> fallback only if edit is impossible**

То есть любой UI-переход должен мыслиться не как “отправить ещё одно сообщение”, а как **отрендерить новый экран поверх текущей UI-поверхности**.

В Collabka это держится на edit-first helper-подходе:
- основная логика живёт в `src/bot/bot.js`
- ключевой helper: `safeEditOrReply(...)`

Семантика helper-а:
- сначала попытаться сделать `editMessageText`;
- если Telegram не даёт редактировать текущий message context — сделать `reply` fallback;
- не допускать silent no-op.

Это значит, что UI почти всегда остаётся в одной рабочей поверхности, но не ломается, если edit-path недоступен.

---

## 3) Три уровня навигации — ключ к чистоте UX

### A. `⬅️ Назад`
Локальный возврат.

Не global reset. Не “примерно назад”. Не guess-based логика.

`Back` всегда должен возвращать пользователя в **явно переданный локальный контекст**, который тащится через `ret` / return-context в callback payload.

То есть:
- экран A открыл экран B;
- экран B обязан знать, что `ret=A`;
- back из B ведёт ровно в A.

Это убирает путаницу, DB-догадки и ощущение “меня выкинуло куда-то не туда”.

---

### B. `📋 Меню`
`Menu` — это **не Home**.

`Menu` — это хаб **текущей роли / текущего режима / текущей рабочей зоны**.

Примеры по смыслу:
- creator current workspace menu;
- brand workspace menu;
- manager hub;
- curator hub;
- admin hub.

Смысл `Menu`:
> “Верни меня в рабочую зону, где я сейчас нахожусь”.

Это удерживает пользователя внутри текущего role context и не рушит рабочий режим.

---

### C. `🏠 Home`
`Home` — глобальный корневой хаб.

Только там:
- выбор роли;
- смена глобального режима;
- root-level вход в систему;
- safe top-level reset.

Итоговая модель:
- `Back` = локальный возврат;
- `Menu` = хаб текущего режима;
- `Home` = глобальный root.

Эта трёхслойная навигация — один из самых важных секретов, почему интерфейс ощущается собранным и не спутанным.

---

## 4) Почему интерфейс ощущается “статичным”

Потому что у нас основная единица UI — это **UI surface**, а не “новое сообщение от бота”.

Практически это означает:
- один экран = одно сообщение;
- inline-кнопки меняют этот экран;
- в большинстве случаев пользователь остаётся в одном и том же message thread point;
- история чата не засоряется промежуточными экранами.

Это особенно важно для Telegram, потому что стандартный “reply bot” очень быстро превращает диалог в шумную ленту служебных текстов.

У нас же сообщение работает как экран контейнера.

---

## 5) Когда всё же допустимо новое сообщение

Новые сообщения допустимы не для обычной навигации, а для случаев, когда нельзя или не надо перетирать исходную поверхность.

Например:
- receipt / квитанция;
- системное уведомление;
- служебное admin/ops событие;
- текст, который должен сохраниться как отдельное подтверждение;
- message context, который нельзя корректно редактировать.

Для таких случаев нужен паттерн уровня:
- создать **новую UI-surface**;
- а затем уже работать с ней как с обычным экраном.

В Collabka это делается через подход наподобие `makeUiCtxForMessage(...)` и push-style action paths вроде `a:menu_push`, `a:support_push`.

Смысл:
- **обычная навигация = edit**;
- **service-origin flows = push new UI screen**.

Это не даёт ломать receipts и одновременно не превращает весь бот в поток новых сообщений.

---

## 6) Грамматика callback navigation

UI-переходы у нас живут на compact callback protocol.

Каждая кнопка должна нести минимум:
- `action`
- `entity/context id`
- `return-context`

Принципиальный формат:
- `a:deal_open|id:123|ret:inbox`
- `a:dialog_open|id:77|ret:deal_123`
- `a:settings|ws:9|ret:ws_menu`

Важно:
- payload должен быть коротким;
- нельзя тащить длинные JSON прямо в `callback_data`;
- нельзя делать хрупкие и непоследовательные namespace;
- `ret` обязателен для локальных экранов.

Если payload становится длинным — нужен hydration/token pattern. Это уже используется в Collabka как защита от Telegram callback length ceiling.

---

## 7) Почему Back нельзя строить “по догадке”

Одна из типичных ошибок Telegram-ботов — делать back так:
- “ну давай вернём в menu”;
- “ну давай попробуем понять, откуда пришёл”;
- “ну давай спросим БД, что пользователь делал до этого”.

Это плохая модель.

Правильная модель:
- родительский экран явно передаёт child-экрану return-context;
- child-экран не гадает;
- возврат deterministic.

Плюсы:
- меньше DB reads;
- меньше ошибок маршрутизации;
- меньше ощущения “интерфейс живёт своей жизнью”; 
- выше переносимость паттерна.

---

## 8) Почему menu paths должны быть лёгкими

Горячие menu paths в Telegram-боте должны открываться быстро.

Поэтому у нас принцип:
- меню не должны обрастать лишними DB-запросами;
- тяжёлые агрегаты не должны вычисляться на каждый UI-тап;
- права и гейты лучше проверять на входе в конкретную фичу, а не перегружать каждый menu render.

Это особенно важно в serverless-контуре:
- меньше latency;
- меньше cold-start pain;
- меньше случайного “мигания” и задержек;
- меньше операционная стоимость.

Именно отсюда вытекает дисциплина типа:
- не добавлять лишние DB reads в hot UI paths;
- держать menu as routing surface, а не как тяжёлый dashboard.

---

## 9) Input mode — часть той же архитектуры

В хорошем Telegram UI input mode не должен жить отдельно от экранной навигации.

Нужно, чтобы:
- у пользователя был явный cancel path;
- был `Back` / `Menu` / `Home` escape path;
- переход в `Menu` очищал input-state;
- пользователь не застревал в “ожидании текста” после смены экрана.

Если этого нет, интерфейс начинает ощущаться сломанным: пользователь уже ушёл в другой раздел, а бот всё ещё ждёт ввод для старой операции.

В Collabka это решается через отдельный ephemeral UI/input state и явный reset при нужных переходах.

---


## Дополнение: selection surfaces

Для экранов, где пользователь не просто ходит по меню, а **выбирает значения**, использовать отдельный канонический файл:
- `docs/26_SELECTION_UI_CONTRACT_RU.md`

Этот файл фиксирует, как в Collabka различаются:
- `мультивыбор`
- `один выбор`
- `вкл/выкл`
- обычные action/navigation rows

То есть `25_*` объясняет общую архитектуру single-surface Telegram UI, а `26_*` — отдельный контракт именно для picker/filter/profile-selector surfaces.

## 10) Разделение durable truth и ephemeral UI state

Это обязательный слой, если хочется повторить паттерн правильно.

### Durable truth — хранить в БД
Сюда относится:
- пользователи;
- workspaces / channels / brand entities;
- заявки;
- сделки;
- платежи;
- роли и доступы;
- статусы и audit trail.

### Ephemeral UI state — можно держать в Redis/cache
Сюда относится:
- текущий `ui_mode`;
- drafts;
- input/expect-text state;
- overlay state;
- hydration tokens;
- short-lived breadcrumbs.

Почему это важно:
- UI должен быть быстрым;
- бизнес-истина не должна зависеть от Telegram-message surface;
- потеря временного UI-state не должна убивать core system.

---

## 11) Degraded mode и safe fallback обязательны

Telegram UI ломается не только из-за логики продукта, но и из-за среды:
- Redis недоступен;
- callback expired;
- edit невозможно применить;
- восстановление UI-state неполное;
- Telegram отвечает нестабильно.

Поэтому нужна fail-soft модель:
- safe edit-or-reply fallback;
- safe callbacks / safe menu path;
- отсутствие silent break;
- понятный путь восстановления интерфейса.

Пользователь не должен нажать кнопку и увидеть “ничего”.

---

## 12) Что закреплено в коде Collabka

Ключевые места для референса:

### Главный UI-router слой
- `src/bot/bot.js`

Смотреть в первую очередь:
- `safeEditOrReply(...)`
- `makeUiCtxForMessage(...)`
- `renderHomeHub(...)`
- `renderRoleHub(...)`
- `renderCreatorCurrentMenu(...)`
- `navKb(...)`
- `navKbInput(...)`
- `kbNavRow(...)`
- `wsMenuKb(...)`
- `wsSettingsKb(...)`

### Callback parsing
- `src/bot/helpers.js`
  - `parseCb(...)`

### Action semantics / registry discipline
- `src/bot/actionRegistry.js`

### Docs canon / spec layer
- `docs/spec/20_HOME_HUB_SPEC.md`
- `docs/spec/21_MENU_SPEC.md`
- `docs/14_BRAND_TEAM_UX_V4.md`

Этот документ не заменяет исходный код; он фиксирует reusable mental model и архитектурные инварианты.

---

## 13) Что именно нужно повторять в другом боте

Если переносить паттерн в новый проект, повторять нужно не “визуальные кнопки”, а вот этот комплект:

1. **Single-surface UI**
   - edit current message by default
   - reply fallback only when edit is impossible

2. **Три уровня навигации**
   - local `Back`
   - current-context `Menu`
   - global `Home`

3. **Render-function architecture**
   - каждый экран — отдельный renderer

4. **Compact callback grammar**
   - action + entity + return-context

5. **Explicit return-context**
   - никаких guess-based back transitions

6. **DB-light menu paths**
   - меню = быстрый routing surface, а не тяжёлый агрегатор

7. **Input state lifecycle**
   - clear cancel/menu/home escape semantics

8. **Service-message aware UI layering**
   - receipts не перетирать бездумно
   - service-origin flows открывать на новой UI surface

9. **Durable vs ephemeral separation**
   - truth в DB, UI transient state отдельно

10. **Degraded-safe behavior**
   - safe fallback при ошибках среды

---

## 14) Анти-паттерны, которых нельзя допустить

Нельзя строить повторение паттерна так:
- каждый клик = новое сообщение;
- `Back` через догадки;
- `Menu` и `Home` как одна и та же кнопка;
- длинные callback payload;
- тяжёлые DB reads в каждом menu render;
- input mode без escape path;
- перетирание квитанций и системных сообщений;
- вся правда только в Redis;
- silent failure при failed edit;
- route naming без дисциплины.

Если допустить эти вещи, интерфейс быстро потеряет то самое ощущение чистого “статичного” Telegram UX.

---

## 15) Короткий reusable prompt для другого чата

Ниже — короткий техзаданный блок, который можно вставить в новый чат, если нужно повторить именно этот паттерн:

> Нужно повторить Collabka-style Telegram UI pattern.
>
> Цель: не поток новых сообщений, а single-surface UI внутри Telegram:
> - inline callbacks
> - edit current message by default
> - reply fallback only if edit impossible
>
> Навигация строго:
> - Back = локальный возврат по explicit return-context
> - Menu = хаб текущей роли/режима
> - Home = глобальный root
>
> Требования:
> - каждый экран = render function
> - нужен единый safeEditOrReply helper
> - callback payload должен быть компактным
> - каждый экран обязан прокидывать `ret`
> - горячие menu paths должны быть DB-light
> - input mode должен иметь cancel/menu/home escape path
> - service/receipt messages нельзя бездумно перетирать, для них нужен push new UI surface
> - durable truth в DB, ephemeral UI state в Redis/cache
> - никаких silent failures, dead ends и guess-based back navigation
>
> Нужен результат в стиле Telegram app-like router, а не обычный reply bot.

---

## 16) Итог

Секрет паттерна Collabka не в “красивых кнопках”, а в сочетании пяти вещей:
- **edit-first UI surface**
- **явный local return-context**
- **разделение Back / Menu / Home**
- **лёгкие menu paths**
- **отделение business truth от ephemeral UI state**

Если сохранить именно эти инварианты, другой бот тоже будет ощущаться как чистый, плотный и почти app-like интерфейс внутри Telegram.
