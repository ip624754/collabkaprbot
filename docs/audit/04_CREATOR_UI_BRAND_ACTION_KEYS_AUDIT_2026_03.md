# Creator UI — Audit: brand-only action keys (2026-03)

Цель: гарантировать, что в **Creator UI** (workspace flows) не появляются кнопки/действия, которые по смыслу относятся только к **Brand mode** (и ведут в экраны «доступно только для Brand»).

## Определение: brand-only action keys
В рамках этого аудита к brand-only относим следующие action keys (по смыслу разделов и меню бренда):

- Feed/discovery для брендов: `a:bx_feed`, `a:bx_filters`, `a:bx_smart`, `a:pm_home`
- Brand Inbox / сделки / оплата: `a:brand_apps`, `a:brand_deals`, `a:brand_plan`, `a:brand_pass`, `a:brand_profile`, `a:brand_team`
- Brand Managers: `a:bm_*`

> Примечание: есть action keys с префиксом `brand_*`, которые используются **креатором** (например, каталог брендов и подача заявки). Они **не считаются** brand-only.

## Область проверки (Creator flows)
Проверены клавиатуры и экраны, которые видит владелец воркспейса (Creator):
- `renderWsOpen` + `wsMenuKb`
- `renderWsProfile` + `wsProfileKb`
- `renderWsSettings` + `wsSettingsKb`
- `renderBxOpen` + `bxMenuKb` (Creator UGC/Offers)
- `wsp_preview` (owner preview) и связанные CTA

## Метод
1) Grep по `src/bot/bot.js` на перечисленные ключи.
2) Для каждого совпадения — ручная классификация: **в каком меню/флоу** находится и **может ли это попасть к креатору**.

## Итог
**В Creator flows (workspace screens) brand-only action keys НЕ обнаружены.**

### Найденные совпадения и почему это не проблема

| Key / группа | Где встречается | Видимость для Creator | Комментарий |
|---|---|---|---|
| `a:bx_feed`, `a:bx_filters`, `a:bx_smart`, `a:pm_home` | `mainMenuBrandKb`, `bxBrandMenuKb`, экраны ленты | Нет | Только Brand mode surfaces |
| `a:brand_apps`, `a:brand_deals`, `a:brand_plan`, `a:brand_pass`, `a:brand_profile` | Brand меню/кабинет | Нет | Только Brand mode |
| `a:bm_*` | `mainMenuCreatorKb` (кнопка «Я менеджер бренда») и Brand managers flows | Да (осознанно) | Это не “brand-only экран”, а **само-идентификация**/переключение режима менеджера |
| `a:brand_apps` (кнопка «Inbox бренда») | `kbBrandApplyMore` | Условно | Показывается только если пользователь = владелец бренда/менеджер/суперадмин (`canOpenInbox=1`) |

## Рекомендации / guardrails
- Держать в силе watchlist пункт про Role-specific UX: в Creator не показывать feed/discovery бренда.
- Если добавляешь новые кнопки в Creator flows — не использовать brand-only ключи из списка выше.
- Для редких dual-role случаев (пользователь одновременно креатор и бренд-менеджер) допустимы условные кнопки с явной подписью.
