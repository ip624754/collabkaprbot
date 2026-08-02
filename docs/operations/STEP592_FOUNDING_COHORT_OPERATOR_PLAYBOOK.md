# STEP592 — Founding Cohort Operator Playbook

## Purpose

Создать не абстрактную базу пользователей, а управляемую supply-side когорту, которую можно довести до первых активных offers и затем передать в STEP593 для brand demand.

## Что появилось

В `Admin → Пользователи` расположен блок **Founding cohort · marketplace liquidity**. Он использует существующие `admin-web-read` и `admin-web-write`, persistent Redis и admin audit. Новых API функций, SQL-таблиц и ENV нет.

## Безопасная последовательность

1. Указать launch wedge, owner label/TG ID, cadence и дату следующего review.
2. Добавлять только реальных creator-пользователей с подключённым каналом.
3. Для каждого участника отдельно проверить профиль, контакт и условия.
4. Не ставить `launch_ready`, пока три review-флага не подтверждены и blocker пуст.
5. Один fresh creator проходит реальный onboarding canary. Результат фиксируется как `pass` или `blocked`; PASS учитывается в exit readiness только 14 дней с timestamp фиксации.
6. Active offers считаются только по `barter_offers.status = ACTIVE` и не редактируются cohort workspace.
7. STEP592 exit достигается только при 10 launch-ready creators, 5 active offers, zero blockers, fresh canary PASS не старше 14 дней, named owner и будущей next review date.

## Что cohort workspace не делает

- не отправляет Telegram-сообщения;
- не создаёт и не активирует offers;
- не меняет платежи или credits;
- не публикует в официальный канал;
- не включает Founder Sale, Instagram OAuth или payment fallback;
- не считает candidate автоматически launch-ready.

## Rollback

Кодовый rollback — обычный revert STEP592. Операционные данные находятся в одном Redis key `admin:founding_cohort:v1`; удаление участника из UI не удаляет пользователя, workspace или offer.
