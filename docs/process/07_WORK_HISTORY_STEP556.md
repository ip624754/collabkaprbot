# STEP556 — Broadcast mode label polish

## Summary
This STEP applies a narrow Telegram UI label polish to the dual-mode broadcast composer.

No logic changed.
No draft behavior changed.
No preview/send routing changed.
No queue/retry/runtime behavior changed.

## Goal
Make the two broadcast composer modes read more clearly for operators.

Old labels:
- `Simple mode`
- `Advanced mode`

New labels:
- `Быстрая рассылка`
- `Расширенный режим`

## Scope
Included:
- composer title label update
- mode switch button label update
- one related helper text update
- docs sync

Not included:
- draft rewrite
- callback changes
- preview changes
- send changes
- outbox changes
- queue/retry/QStash changes
- migrations

## Why
The previous labels were technically correct but too close to dev-language.
The new copy keeps the same model while making the operator choice clearer:
- fast everyday send path
- secondary flexible/manual path

## Acceptance
This STEP is complete if:
- simple composer title uses `Быстрая рассылка`
- advanced composer title uses `Расширенный режим`
- mode switch buttons use the same naming
- no composer logic changes are introduced
- no runtime behavior changes are introduced

## QA
- `node --check src/bot/bot.js`
- manual source read for label-only delta
- confirm no callback/action key changes

## Result
Label polish landed.
Logic unchanged.
