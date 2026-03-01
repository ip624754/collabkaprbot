# 10 — Release Preflight (QA fast) — 2026-02-28

Цель: перед деплоем/мерджем быстро прогонять минимальный набор проверок, чтобы не ловить “сюрпризы” в проде.

## Команда

```bash
npm run preflight
# или
npm run qa:fast
```

## Что проверяет

1) `actions:check`  
   Гарантирует, что все callback action keys, которые реально используются в UI/боте, присутствуют в `src/bot/actionRegistry.js` (и guard-логика согласована).

2) `actions:md` + check “не грязно”  
   Генерирует `docs/02_ACTION_KEYS_REGISTRY.md` и проверяет, что файл **не изменился** по сравнению с текущим содержимым.  
   Если изменился — значит документация реестра устарела: нужно закоммитить обновлённый файл.

3) `lint:nav`  
   Проверяет, что в ключевых экранах нет “тупиков” навигации (footer/back‑ряд соблюдён по стандарту).

4) `test:redact`  
   Проверяет, что маскирование контактов работает корректно (не утечки email/phone/etc. в публичных местах).

5) `lint:public-contacts`  
   Grep‑gate на регрессии в **публичных (brand‑facing) рендерах**: запрещает возвращать прямое отображение пользовательского текста, который может содержать контакты, до unlock.  
   Сейчас проверяет два ключевых инварианта в `src/bot/bot.js`:
   - `renderBxPublicView`: `barter_offers.description` редактируется для non‑owners до unlock.
   - `renderWsPublicProfile`: `ws.profile_about` редактируется для non‑owners до revealContacts.

6) `lint:redis-atomic`  
   Grep‑gate на регрессии: запрещает возвращать в runtime‑код неатомарные связки Redis-команд (например `LPUSH+LTRIM(+EXPIRE)`, `INCR+EXPIRE`, `LRANGE+LTRIM`) вне `src/lib/redis.js`.  
   Это защищает от “immortal keys” и race‑окон, которые мы уже один раз закрывали.

## Если preflight упал

- На `actions:md changed` → закоммить `docs/02_ACTION_KEYS_REGISTRY.md` и повторить.
- На `lint:nav` → поправить клавиатуру/футер по `docs/process/09_ADMIN_UX_STANDARD.md`.
- На `test:redact` → поправить редактирование/маскирование, не допуская “полных” контактов.
- На `lint:public-contacts` → проверь публичные карточки/витрины: пользовательский текст (описания) должен идти через `redactContactsInText` до unlock.
- На `lint:redis-atomic` → перенести операции на helpers из `src/lib/redis.js` (или на Lua‑атомарность), не оставлять fallback‑цепочки.

## Дальше после preflight

Если preflight прошёл — сделай короткий “2 минуты” чек перед деплоем: `docs/16_RELEASE_CHECKLIST.md`.

---

## Redis TTL smoke check (опционально, 1 минута)

Зачем: быстро поймать **"immortal keys" (TTL = -1)** на ключах, которые обязаны истекать (rate‑limit / locks / буферы). Это страховка от регрессий вида `INCR` без `EXPIRE`.

Требования:
- локально установлен `redis-cli`
- есть доступ к Redis URL (обычно `REDIS_URL`, `rediss://...`)

### 1) Проверка связи

```bash
redis-cli -u "$REDIS_URL" PING
```

### 2) Rate limit keys (должны иметь TTL)

```bash
redis-cli -u "$REDIS_URL" --scan --pattern 'rl:*' \
  | head -n 200 \
  | while read -r k; do
      ttl=$(redis-cli -u "$REDIS_URL" TTL "$k" 2>/dev/null || echo "err");
      [ "$ttl" = "-1" ] && echo "IMMORTAL rl key: $k";
    done
```

### 3) Audit buffer locks / inflight markers (должны иметь TTL)

```bash
redis-cli -u "$REDIS_URL" --scan --pattern 'audit:*:flush_lock' \
  | head -n 200 \
  | while read -r k; do
      ttl=$(redis-cli -u "$REDIS_URL" TTL "$k" 2>/dev/null || echo "err");
      [ "$ttl" = "-1" ] && echo "IMMORTAL audit lock: $k";
    done
```

### 4) Ops alerts buffers (должны иметь TTL)

```bash
redis-cli -u "$REDIS_URL" --scan --pattern 'ops:*' \
  | head -n 200 \
  | while read -r k; do
      ttl=$(redis-cli -u "$REDIS_URL" TTL "$k" 2>/dev/null || echo "err");
      [ "$ttl" = "-1" ] && echo "IMMORTAL ops key: $k";
    done
```

Ожидаемый результат: **пусто** (ничего не печатает). Если видишь `IMMORTAL ...` — это сигнал, что какой‑то путь пишет ключи без TTL, и его нужно чинить до релиза.

## Принцип

Preflight **не меняет прод-логику**. Это dev‑инструмент для уверенного релиза (Zero regressions).
