# STEP563 — Audit broadcast layer (RU)

## Что было проверено
- `Конструктор рассылки`
- `Быстрый пост`
- preview/send переходы
- выбор аудитории
- карточка конкретной рассылки
- blocked/hard-skip report

## Что было найдено как незавершённость
1. **Simple-mode send guard был несовместим с simple draft model**
   - в `a:bc_confirm` использовалась проверка `draft.type`
   - для simple drafts это legacy-поле не является источником истины
   - результат: simple composer мог собрать preview, но упираться при реальном send

2. **После создания рассылки не было прямого operator path в карточку рассылки**
   - оператор видел успех, но не получал мгновенную кнопку `открыть #id`
   - это создавало лишний шаг и ослабляло monitor UX

3. **Audience picker оставлял raw mode labels**
   - показывались `simple / advanced`
   - это конфликтовало с текущей UX-семантикой `Конструктор рассылки / Быстрый пост`

4. **Карточка рассылки была слабее на terminal states**
   - `DONE/STOPPED/ERROR` не держали стабильный `🔄 Обновить`
   - `🧱 Пропуски/ошибки` был доступен не во всех состояниях
   - это ослабляло post-run inspection

## Что исправлено в STEP563
- simple send теперь валидируется через `broadcastDraftHasContent(...)`
- после создания есть прямые кнопки:
  - `📊 Открыть #id`
  - `📣 К списку`
- mode labels в audience picker приведены к текущей продуктовой семантике
- карточка рассылки держит refresh и blocked-report консистентнее

## Что ещё остаётся как следующий слой, но не баг этого шага
- compact post-run report
- first-batch safety hints
- quarantine UX
- stronger dominant-reasons summary after run
