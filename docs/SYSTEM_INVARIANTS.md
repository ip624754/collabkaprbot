# SYSTEM INVARIANTS — Collabka PR

**Status:** canonical project invariant registry  
**Introduced:** STEP580  
**Rule:** a STEP may extend this file, but must not silently violate it

## 1. Platform and infrastructure

1. Collabka runs in Vercel serverless. No request may depend on an unbounded background loop or long-lived process.
2. Neon usage must stay bounded. Do not add avoidable DB reads to hot Telegram menus, callbacks, or repeated renders.
3. Heavy filtering, aggregation, ownership checks, and state transitions belong in SQL or bounded read models, not large in-memory scans.
4. Migrations run only through the project migration runner with exactly-once/checksum behavior.
5. New schema usage must respect rolling deployment: code-before-migration compatibility or explicit guarded rollout is required.

## 2. Security and authorization

1. Public secret-bearing endpoints use timing-safe comparison and fail closed.
2. Authentication and authorization are separate: a valid session does not imply permission for founder-only or owner-only actions.
3. Ownership and destructive-action eligibility must be enforced at the authoritative mutation boundary, preferably in SQL.
4. Secrets must never appear in docs, logs, artifacts, health payloads, or client-side source.
5. Admin, auth, webhook, and payment changes require HEAVY governance.

`docs/01_SECURITY_INVARIANTS.md` remains the detailed security/monetization contract. This file is the cross-system index, not a replacement.

## 3. Telegram interaction contract

1. `callback_data` stays within Telegram's 64-byte limit.
2. Existing action keys are backward-compatible unless an explicit migration/compat layer is included.
3. User-visible buttons remain available when the product principle is “button visible, gate inside.”
4. Screens follow the edit-first single-surface router pattern where the current architecture supports it.
5. Back/Menu/Home behavior and `ret` navigation must not create dead ends.
6. Every handled callback should acknowledge quickly and provide visible feedback when the action is not immediate.
7. Degraded click guards are load-shedding aids, not correctness locks.

## 4. Invite and reward invariants

1. Self-invites and accounts that existed before attribution never activate invite rewards.
2. A stored invitation, activation, pending points, available points and used points are distinct states and must not be collapsed in copy or logic.
3. The public reward source of truth is `INVITE_REWARD_PUBLIC_RULES` and `INVITE_REWARD_CATALOG`; DB processing and UI copy must consume the same values.
4. Current earn rules are `+2 / 24h` for first eligible bot start and `+10 / 48h` for main-profile completion.
5. Current catalog is `100 → 7 days PRO` and `250 → 30 days PRO`.
6. Pending points are never spendable; available points equal confirmed earn minus redeemed entries.
7. One invited user may create each earn reward only once; redeem remains transaction-locked and auditable.
8. Reward math, ledger semantics, activation rules and anti-abuse controls change only in an explicit HEAVY STEP.
9. Ordinary-user entrypoint is `📨 Приглашения`; internal identifiers and operator diagnostics may retain engineering names.
10. Recovery from invalid, existing-user or self-invite paths must leave the user with working navigation.

## 5. Giveaway invariants

1. Winner selection is deterministic and reproducible; no untracked `Math.random()`/Node randomness in authoritative draws.
2. Draw/claim mutations are atomic and concurrency-safe.
3. Cron overlap is guarded by the established lock model; fail-fast lock outcomes are explicit, not treated as successful draws.
4. External notifications occur after authoritative reserve/commit boundaries where required.
5. Giveaway history is retained; destructive cascade semantics are prohibited.

## 6. Payments, credits, unlocks, and monetization

1. Money-like state transitions are exactly-once or idempotent.
2. Telegram Stars, credits, Brand Pass, contact unlocks, and paid dialog actions remain auditable.
3. Payment confirmation must not depend on user-facing callback success alone.
4. Fallback application paths use authoritative locks/guards and cannot double-credit.
5. Copy must distinguish product entitlement, credits, unlock, payment attempt, and confirmed payment.
6. A brand application becomes a deal only after authoritative acceptance evidence; `deal_stage` alone is insufficient.
7. Deal-only reads and writes require actor access plus accepted-deal evidence in runtime and SQL guards.

## 7. Cron, outbox, and external effects

1. Cron work is bounded by time, batch size, and retry policy.
2. Critical cron sections use Redis token locks and/or PG advisory locks as documented by the subsystem.
3. External side effects follow reserve/lock → send → record/confirm, with idempotency where duplicates matter.
4. Telegram 429 handling uses cooldown/resume; no tight retry loops inside one serverless request.
5. Operator alerts flow through the canonical alert queue/digest mechanism.

## 8. Admin and observability

1. Operator views are read-only unless a write is explicit, gated, auditable, and narrowly scoped.
2. Founder-only surfaces remain visually and technically separate from normal operator controls.
3. `Overview`, `System`, and runtime diagnostics should derive from compatible truth contracts.
4. Stale historical breadcrumbs must not be promoted to active incidents without current evidence.
5. Health endpoints expose operational truth without leaking secrets or triggering heavy unbounded work by default.

## 9. Creator OS product invariants

1. Collabka remains workflow-first and Telegram-native; it must not drift into dashboard-first CRM complexity without demonstrated need.
2. Discovery, collaboration, relationship memory, and repeat work should converge into one collaboration lifecycle rather than parallel disconnected products.
3. Opportunity ingestion must preserve source attribution and must not misrepresent third-party posts as claimed first-party offers.
4. Creator/brand trust signals must be evidence-based and explainable.
5. Product expansion must preserve the existing bot's usable core and avoid speculative architecture ahead of validated workflow demand.

## 10. Documentation and AI invariants

1. `docs/00_CURRENT_STATE.md` is the current source snapshot.
2. `docs/15_NEW_CHAT_HANDOFF.md` names the actual latest baseline and may not carry contradictory older step identifiers.
3. Every implementation STEP updates work history and continuity docs.
4. Source-confirmed, runtime-confirmed, operator-confirmed, and unverified claims are separated.
5. A new AI chat starts from the current archive and continuity docs, not memory alone.
6. Broad redesign is prohibited without source/runtime evidence of systemic failure.
