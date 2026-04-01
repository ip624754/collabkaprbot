# STEP501 — Web Admin User Card usable v1

## Цель

Сделать `/admin/users/[id]` реально полезной operator card, а не просто техническим drilldown.

## Что добавлено

- полноценный summary header: display name / `@username` / `tg_id` / `user_id` / segment / created date;
- summary-mini-cards для plan / credits / workspace / channel signal;
- отдельные блоки:
  - `Профиль`
  - `Доступ и сигналы`
  - `Активность`
  - `Заметка оператора`
  - `Последние admin-действия`
- аккуратный back-to-list flow;
- recent admin audit по конкретному пользователю;
- note set / edit / clear без расширения опасного write surface.

## Что принципиально НЕ делали

- payments writes;
- segment / plan / credits mutation;
- channel rebind;
- moderation / destructive actions;
- polling / cron / heavy fan-out.

## Hobby-safe инвариант

User Card остаётся read-first экраном:

- один основной read request: `GET /api/admin-web-read?section=user&id=...`;
- note write только по явному действию пользователя;
- никакого background refresh.

## UX contract

Карточка должна быстро отвечать на 5 вопросов:

1. Кто это?
2. Какой у него segment / plan / credits?
3. Есть ли у него workspace / channel / brand profile сигналы?
4. Что видно по последней активности?
5. Что уже заметил оператор?

## Безопасность

- note remains safe operator-only write;
- blank note normalize → clear;
- note actions пишутся в admin-web audit;
- без session карточка недоступна.
