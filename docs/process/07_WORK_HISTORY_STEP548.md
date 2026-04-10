# STEP548 — Invite contacts / personal invite layer (Intro Deck canon adapted for Collabka)

## Summary
Implemented a Telegram-native invite/referral layer for Collabka based on the Intro Deck pattern, but adapted to the current bot baseline without broad router or admin redesign.

The new layer gives users:
- a dedicated invite surface on top of the existing `a:share` entrypoint;
- 3 ready invite text variants on the screen;
- primary CTA: `Share invite` via Telegram inline mode;
- fallback 1: `Show link`;
- fallback 2: `Get invite card`;
- personal start-links with per-user invite attribution;
- counters: `Invited` / `Activated`;
- recent invited list;
- photo-card sharing via cached Telegram photo when `INVITE_PHOTO_FILE_ID` is configured, otherwise via public asset URL fallback.

This step is intentionally narrow:
- no admin-layer redesign;
- no monetization rewrite;
- no broad menu IA rewrite;
- no growth rewards / gimmicks;
- no bot-only state fork.

## Why
Collabka already had a generic `Поделиться` surface, but it was still a simple tracked-link share helper, not a full invite layer with:
- personal invite codes;
- deep-link attribution truth;
- inline-share primary path;
- invite card fallback;
- invited / activated counters.

The goal of STEP548 is to bring Collabka to the same practical invite canon already proven in Intro Deck, while keeping the patch narrow and production-safe for the current monolith.

## Scope
Included:
- `member_invites` migration;
- invite helpers / attribution persistence in `src/db/queries.js`;
- start-payload parsing for invite prefixes in `src/bot/helpers.js`;
- `/invite` command;
- inline-share handler (`bot.inlineQuery(/^invite/)`);
- upgraded `a:share` surface;
- new callbacks: `a:share_link`, `a:share_card`;
- action-registry/docs sync;
- env support for `INVITE_PHOTO_FILE_ID`;
- source smoke for invite-layer contract.

Out of scope:
- reward mechanics;
- referral payouts;
- admin analytics workspace for invites;
- web-admin invite explorer;
- changing the main menu IA beyond the existing share entrypoint.

## Data contract
New DB table:
- `member_invites`

Stored fields:
- `referrer_user_id`
- `invited_user_id`
- `invite_code`
- `source` (`inline_share` / `raw_link` / `invite_card`)
- `status` (`created` / `activated`)
- `start_param`
- `joined_at`
- `activated_at`

Current activation reading is intentionally practical, not gamified:
`Activated` is derived from existing Collabka DB truth such as workspace ownership, curator/manager role, or brand-plan/credits state.

## UX contract
Invite surface now follows one clear shape:
- Title / short explanation;
- personal invite link;
- 3 ready message ideas;
- `Invite code`;
- counters `Invited` / `Activated`;
- recent invited list;
- primary CTA `Share invite`;
- fallback `Show link`;
- fallback `Get invite card`.

`Share invite` is the main action.
The three message variants are shown as copy ideas on the screen, not as three competing main buttons.

## Safety / truth boundary
- invite attribution is only created for first-start eligible users;
- self-referral is rejected;
- repeated / duplicate linking is treated as already linked;
- if invite schema is missing, share still works, but persistence/counters degrade honestly instead of crashing;
- no reward logic was introduced;
- no user-facing business truth was moved into Redis.

## Files changed
- `.env.example`
- `docs/00_CURRENT_STATE.md`
- `docs/02_ACTION_KEYS_REGISTRY.md`
- `docs/process/07_WORK_HISTORY_STEP548.md`
- `migrations/045_member_invites.sql`
- `package.json`
- `scripts/smoke-invite-layer-contract.js`
- `src/bot/actionRegistry.js`
- `src/bot/bot.js`
- `src/bot/helpers.js`
- `src/db/queries.js`
- `src/lib/config.js`

## Acceptance
This STEP is considered complete if:
- `/invite` opens the invite surface;
- `a:share` opens the new invite surface;
- `Share invite` exposes Telegram inline share via `switch_inline_query`;
- `Show link` replies with the personal raw link;
- `Get invite card` sends a forwardable invite card;
- `ii_ / il_ / ic_` start payloads are recognized;
- first-start invite attribution is persisted when migration is present;
- self-referrals and duplicate linking do not create false credit;
- invite surface shows `Invited` / `Activated` counters;
- the patch remains narrow and does not alter unrelated money/admin/runtime flows.

## QA
Source-level QA performed:
- `node --check src/bot/bot.js`
- `node --check src/bot/helpers.js`
- `node --check src/db/queries.js`
- `node --check src/lib/config.js`
- `node --check src/bot/actionRegistry.js`
- `node scripts/smoke-invite-layer-contract.js`

Live verification still required:
- BotFather inline mode must be enabled (`/setinline`);
- migration `045_member_invites.sql` must be applied in Neon/PG for persistence/counters;
- real Telegram verification for inline share, raw-link copy path, invite-card forward path, and `/start ii_/il_/ic_` attribution.

## Residual risk
Low-to-medium, because the patch touches `/start` parsing and user-facing sharing.

Main residual risks:
- inline mode depends on BotFather config;
- counters degrade if migration is not applied yet;
- `Activated` is a practical Collabka-specific derived signal, not a universal referral KPI.

## Result
Invite-layer baseline landed.
No broad redesign.
No regression-intent scope expansion.
