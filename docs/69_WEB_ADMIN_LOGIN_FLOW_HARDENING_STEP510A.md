# STEP510A — Web Admin login flow hardening + docs canon restore

## Почему делали
Live founder/operator testing показал, что login flow technically works, but is too confusing:
- pending challenge теряется при refresh/return to page;
- approve в Telegram требует ручного `Проверить approve`, что ломает ощущение входа;
- raw `invalid_code` выглядит как UX regression;
- decision page не помогает вернуться в web-admin;
- docs/work history drift after sale-prep left gaps in current canon.

## Что исправлено
- login challenge теперь хранится в `sessionStorage` + `?challenge=` query state;
- login page auto-polls approve status while challenge is pending;
- verify-code flow теперь умеет доиспользовать уже approved challenge, а не падать confusing `invalid_code`;
- Telegram decision page теперь даёт явный return-link в `/admin/login?challenge=...`;
- login errors нормализованы в читаемые RU labels;
- добавлен source smoke для login contract;
- docs canon restored: missing STEP502/STEP503 docs added, work history and current state refreshed.

## Инварианты
- auth model unchanged: secret → Telegram approve / code → session;
- zero polling outside login pending-state;
- no new API entrypoints;
- hobby-safe surface preserved.
