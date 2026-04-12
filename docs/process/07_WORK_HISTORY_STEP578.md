# STEP578 — Invite education copy polish

## Что сделано
- сохранён узкий scope STEP577 baseline: invite-layer не переписан, reward math / ledger semantics / anti-abuse / admin surfaces не тронуты
- user-side read screens invite module получили объясняющий слой по образцу SWB, но адаптированный под Collabka и текущую reward truth
- `📊 Статистика` теперь объясняет, как читать `Приглашено / Активировано / Конверсия активации`
- `💎 Баллы` теперь содержит блок `Как работают баллы`, который объясняет, что:
  - баллы идут за валидную активацию, а не за простой переход
  - self-invite и existing user не учитываются
  - `В ожидании` не тратится
  - `Доступно` можно обменять на Pro
  - `Обменяно` уже списано за награду
- `🎁 Обменять Pro` теперь содержит блок `Как работает обмен`, чтобы путь redeem не ощущался как непрозрачная бухгалтерия
- wording `pts` заменён на более product-native `баллов` в user-side rewards copy
- добавлен source smoke `scripts/smoke-invite-education-copy-contract.js`

## Изменённые файлы
- `src/bot/bot.js`
- `scripts/smoke-invite-education-copy-contract.js`
- `docs/00_CURRENT_STATE.md`
- `docs/15_NEW_CHAT_HANDOFF.md`
- `docs/process/07_WORK_HISTORY_STEP578.md`

## Что не менялось
- reward math
- invite ledger
- callbacks / action registry
- migrations
- admin invite logic
- main invite hub IA

## Source QA
- `node --check src/bot/bot.js`
- `node scripts/smoke-invite-hub-ux-contract.js`
- `node scripts/smoke-invite-recovery-copy-contract.js`
- `node scripts/smoke-invite-rewards-contract.js`
- `node scripts/smoke-invite-education-copy-contract.js`
- `node scripts/actions-registry-check.js`

## Live QA focus
- проверить, что удлинённые read screens (`Статистика / Баллы / Обменять`) остаются читаемыми на телефоне
- проверить zero-state и non-zero-state invite points screens
- убедиться, что объясняющая copy не ломает клавиатурную плотность и не превращает flow в простыню
