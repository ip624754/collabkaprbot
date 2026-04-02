# STEP503 — User Card polish + operator usability

## Цель
Довести `/admin/users/[id]` до рабочего operator screen.

## Что вошло
- stronger header
- profile / account / access summary
- recent activity summary
- improved note UX
- recent admin actions light trace
- back-to-list with preserved list context

## Что не вошло
- payments writes
- plan/credits mutation
- deal actions
- bulk actions

## Инварианты
- один page load = один `section=user` read
- writes только note set/clear
- hobby-safe surface
