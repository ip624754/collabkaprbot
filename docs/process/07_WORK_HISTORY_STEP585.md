# STEP585 — Conversation & UX Language Audit

**Date:** 2026-07-18  
**Status:** DONE  
**Mode:** HEAVY review  
**Baseline:** STEP584 FULL  
**Runtime delta:** none

## Goal

Audit the bot's user-facing language as a product system, not as isolated strings.

The review covered messages, menus, buttons, navigation meaning, role names, lifecycle terms, invite/reward copy, paid-product copy, errors, empty states and operator language.

## Work completed

Added:

- `docs/product/COLLABKA_COPY_SYSTEM.md`;
- `docs/product/TERMINOLOGY_REGISTRY.md`;
- `docs/audit/STEP585_MESSAGE_INVENTORY.md`;
- `docs/audit/STEP585_BUTTON_LABEL_INVENTORY.csv`;
- `docs/audit/STEP585_FULL_CONVERSATION_UX_LANGUAGE_AUDIT.md`;
- `docs/roadmap/STEP586_COPY_REFACTOR_ROADMAP.md`;
- this work-history entry.

Updated continuity:

- `docs/00_CURRENT_STATE.md`;
- `docs/15_NEW_CHAT_HANDOFF.md`;
- `docs/README.md`.

## Mechanical evidence

Scanned active JavaScript under `src/**` and `api/**`:

- 52 files;
- 2,007 static button occurrences;
- 605 unique static button labels;
- 330 message calls with a static first text argument.

Dynamic messages were reviewed by flow family. The inventory does not pretend to enumerate every runtime-composed string.

## Main findings

No P0 wording defect was confirmed.

P1 classes:

1. infrastructure and schema details can reach ordinary users;
2. `Home / Домашняя / Главное меню / Меню` do not expose the real navigation distinction;
3. role language mixes creator, channel and English labels;
4. `Inbox / Заявки / Диалоги / Сделки` drift across one lifecycle;
5. invite copy exposes internal and mixed-language reward terms;
6. monetization names mix subscription, credits and features;
7. active `офер` spellings remain in user-facing source.

P2/P3 work includes generic access errors, `ты/вы` drift, vague CTAs, operator jargon, emoji drift and low-frequency formatting polish.

## Decisions

- canonical user address: `ты`;
- canonical roles: `креатор`, `бренд`;
- `канал` is an object managed by a creator;
- canonical spelling: `оффер`;
- target navigation: `🏠 Домой` for `a:home`, `📋 Меню` for `a:menu`;
- target lifecycle: `Оффер / профиль → Заявка → Диалог → Сделка`;
- infrastructure terms remain operator-only;
- runtime refactor ships in bounded STEP586 waves.

## QA and truth boundary

Verified:

- current STEP584 archive was inspected;
- active source was scanned;
- concrete examples were recorded with source locations;
- the canonical copy system, term registry and implementation roadmap exist;
- only documentation was changed.

Not verified:

- live Telegram rendering;
- mobile line wrapping;
- production data-dependent branches;
- real-user comprehension;
- complete admin web visual copy pass.

## Next STEP

**STEP586A — Copy Safety & Taxonomy Foundation**.

Remove user-facing infrastructure leakage, fix `офер`, normalize bounded invite terms and add source guards. Do not combine this with the global Home/Menu migration.
