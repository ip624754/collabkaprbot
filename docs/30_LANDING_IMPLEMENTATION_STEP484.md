# STEP484 — Landing implementation (RU)

## Что сделано

Добавлен публичный landing для Collabka PR в корне репозитория:

- `index.html`
- `styles/landing.css`
- `scripts/landing.js`
- `assets/brand/*`
- `assets/screenshots/*`
- `assets/favicon/*`

Landing использует русский продуктовый copy, один главный CTA в бот (`https://t.me/collabkaprbot`), FAQ на той же странице и тёмный visual contract с существующим логотипом Collabka.

## Секции

- Hero
- Кому подходит
- Как это работает
- Что внутри бота
- Почему это удобнее обычного Telegram-хаоса
- Как это выглядит
- FAQ
- Финальный CTA

## Что не трогали

- runtime бота;
- callback routing;
- monetization / accept / unlock / reply paths;
- DB schema и hot-path queries.

## Guard

Добавлен `scripts/smoke-landing-contract.js` и подключён в `package.json` + `scripts/preflight.js`, чтобы landing не терял основные секции, CTA и ключевой русский product copy.
