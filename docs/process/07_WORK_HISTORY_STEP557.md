# STEP557 — Broadcast mode semantic rename polish

## Summary
This step applies a narrow operator-facing rename to the two broadcast composer modes without changing any runtime behavior or callback logic.

## Why
After STEP556, labels were more readable but still semantically confusing in live operator use:
- the field-by-field path looked like a constructor, not a “fast send”
- the raw single-message path looked like a quick post, not an “advanced mode”

The goal of STEP557 is to align names with the actual workflows.

## Changes
- `Быстрая рассылка` → `Конструктор рассылки`
- `Расширенный режим` → `Быстрый пост`
- transition CTA to raw path: `⚡ Перейти в быстрый пост`
- transition CTA back: `🧩 Перейти в конструктор`

## Scope
Included:
- broadcast mode titles
- broadcast mode switch CTA labels
- small supporting copy where the old mode name was referenced

Not included:
- draft logic changes
- preview changes
- send routing changes
- outbox changes
- queue/retry/QStash changes
- callback/action key changes

## Acceptance
- simple composer screen title reads `Конструктор рассылки`
- raw single-post screen title reads `Быстрый пост`
- mode switch buttons clearly indicate the destination workflow
- no runtime logic changed

## QA
- source check on `src/bot/bot.js`
- verify no callback keys changed
- verify only labels/copy changed

## Result
Mode semantics are now operator-readable without changing the underlying dual-mode broadcast model.
