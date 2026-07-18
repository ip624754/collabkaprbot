# STEP586H — Live Telegram Acceptance and Mobile Copy Runbook

## Purpose

This is the final evidence gate for the STEP586 copy program.

Source checks can prove labels, callbacks and invariants in the repository. They cannot prove how Telegram renders a screen on a phone, whether a real button wraps badly, or whether a deployed callback reaches the intended screen.

A green STEP586H result therefore requires captured evidence from a deployed preview/staging bot.

## Safety boundary

Use preview/staging first.

Do not use this acceptance pass to:

- send a real broadcast;
- buy Stars without explicit approval;
- spend invite points without explicit approval;
- probe private object IDs;
- expose real contact data in screenshots;
- mutate production users for convenience.

The evidence file rejects obvious Telegram bot tokens, QStash tokens, database URLs and bearer tokens.

## 1. Prepare the target

Record the exact deployment and bot username:

```bash
export TELEGRAM_ACCEPTANCE_DEPLOYMENT_URL="https://<preview-host>"
export TELEGRAM_ACCEPTANCE_BOT_USERNAME="@<preview-bot>"
export TELEGRAM_ACCEPTANCE_TARGET_ACK="$TELEGRAM_ACCEPTANCE_DEPLOYMENT_URL|$TELEGRAM_ACCEPTANCE_BOT_USERNAME"
export TELEGRAM_ACCEPTANCE_COMMIT="<commit-sha>"
export TELEGRAM_ACCEPTANCE_OPERATOR="<operator-alias>"
```

The command refuses to initialize evidence unless the acknowledgement matches both target values.

Run STEP584 staging acceptance before manual Telegram work:

```bash
export STAGING_BASE_URL="$TELEGRAM_ACCEPTANCE_DEPLOYMENT_URL"
export ACCEPTANCE_TARGET_ACK="$STAGING_BASE_URL"
npm run acceptance:staging
```

## 2. Create the evidence pack

```bash
npm run acceptance:telegram-mobile -- init
```

The command creates:

```text
artifacts/telegram_acceptance/STEP586H_<timestamp>.json
```

Do not commit evidence with private usernames, phone numbers, preview URLs or screenshots unless publication is intentional.

## 3. Required paths

Every path is mandatory.

### A. New user and role selection

Check:

- first start;
- role choice;
- `🏠 Домой`;
- `📋 Меню`;
- switching to creator and brand mode.

### B. Creator lifecycle

Check:

- creator menu;
- one offer/profile surface;
- applications;
- dialogs;
- deal state after authoritative acceptance.

### C. Brand lifecycle

Check:

- brand menu;
- catalog/search;
- applications;
- dialogs;
- deal acceptance with an approved test record.

Before acceptance, confirm there is no unintended credit charge. After acceptance, confirm the screen says that a deal opened.

### D. Invite center

Check:

- invite center;
- points;
- history;
- reward confirmation.

Do not finish the spend unless `invite_spend_approved=true` in the evidence safety block.

### E. Paid product/paywall

Open one Brand Plan, channel PRO, credit or paid-service path.

Confirm:

- product name;
- Stars amount;
- result of purchase;
- recovery route;
- no accidental purchase.

Do not pay unless `test_purchase_approved=true`.

### F. Stale/error/empty state

Use a known stale test message or a safe missing test object.

Confirm:

- neutral wording;
- no private-object disclosure;
- one safe recovery route;
- no Redis, Neon, migration or raw schema text in ordinary-user copy.

### G. Admin/operator spot-check

Read-only by default.

Check:

- Communications;
- Outgoing messages;
- Audit log;
- one diagnostic state.

The human status/action should come first. Redis, QStash and raw codes may remain below it.

## 4. Mobile checks per path

Record all three fields:

```text
button_wrapping
message_density
navigation_clarity
```

Each must be `PASS`, `FAIL` or `BLOCKED`.

A path cannot pass when any mobile field is not `PASS`.

### Button rule

The source hard limit is 34 visible characters for a bounded static label.

Run:

```bash
npm run lint:telegram-mobile-copy
```

This is a source guard, not a substitute for a phone screenshot. Dynamic labels and real Telegram font/layout still require manual review.

### Message rule

A screen should expose:

1. where the user is;
2. what the current state is;
3. what to do next.

Long diagnostics belong below the operator action, not before it.

## 5. Evidence format

For every path marked `PASS`, provide:

- at least one actual label;
- at least one evidence item;
- a screenshot path or a redacted transcript reference;
- all three mobile checks as `PASS`.

Example:

```json
{
  "result": "PASS",
  "actual_labels": ["📨 Заявки", "💬 Диалоги"],
  "evidence": [
    {
      "type": "screenshot",
      "ref": "evidence/brand-applications.png",
      "captured_at": "2026-07-18T12:00:00Z"
    }
  ],
  "mobile_check": {
    "button_wrapping": "PASS",
    "message_density": "PASS",
    "navigation_clarity": "PASS"
  }
}
```

## 6. Finalize

```bash
npm run acceptance:telegram-mobile -- finalize artifacts/telegram_acceptance/STEP586H_<timestamp>.json
```

The command writes a Markdown evidence report next to the JSON file.

Result semantics:

- `PASS`: all seven paths passed with evidence and mobile checks;
- `FAIL`: a path failed, evidence is invalid, or an unsafe action was recorded;
- `BLOCKED`: at least one required path was not run or could not be reached.

There is no automatic conversion from source-green to live-green.

## 7. Fix policy

Fix only defects reproduced in evidence.

Allowed inside the mobile copy pass:

- shorten a label;
- split a dense paragraph;
- remove repeated explanation;
- make a recovery action explicit;
- align a visible term with the STEP586 copy system.

Requires a separate STEP:

- callback or destination changes;
- permission changes;
- payment, invite, deal or giveaway mechanism changes;
- new feature or admin redesign;
- broad `bot.js` extraction.
