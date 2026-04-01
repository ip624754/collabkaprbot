# STEP503 — User Card operator UX contract

## Page blocks
1. Header
2. Профиль
3. Аккаунт и доступ
4. Активность
5. Заметка оператора
6. Последние admin-действия

## Operator rules
- the screen must answer who the user is, what access/workspace signals exist, and what the latest operator context is;
- note editing stays inline and low-friction;
- blank note input is normalized to clear instead of creating a second write path for the operator to think about;
- actor/timestamp must remain visible after save so the page is useful as shared operator context;
- recent admin trace stays short and readable, not a giant raw audit dump.

## URL / navigation rules
- `Users` search/filter state is carried in URL search params;
- drilldown to `/admin/users/[id]` preserves those params;
- back navigation returns to the filtered list, not to the unfiltered default table.

## Hobby-safe rules
- one primary read request for the page;
- no polling;
- no cron dependency;
- only explicit note writes.
