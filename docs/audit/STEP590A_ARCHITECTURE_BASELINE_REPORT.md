# STEP590A — Architecture Baseline Report

**Date:** 2026-08-01
**Mode:** HEAVY / read-only architecture
**Risk Score:** 9/20
**Runtime changes:** none

## Verdict

> ARCHITECTURE PROGRAM APPROVED / BASELINE MAPPED / RUNTIME EXTRACTION NOT STARTED

The repository is a strong production monolith with established critical services, but Telegram route ownership, DB access and scheduled work remain highly concentrated. The next highest-leverage move is an executable callback ownership/router spine, followed by bounded critical-domain extraction.

## Evidence

- baseline ZIP integrity PASS;
- baseline ZIP SHA-256: `0054f38c756ff943e978a2e6e3bfcc3eae9fcfe1fa852e046a1e643c1c0c5f5e`;
- 678 repository files and 267 JavaScript files inventoried;
- 560 action registry entries classified;
- 328 `queries.js` exports classified;
- 41,692-line `bot.js` and 12,903-line callback region confirmed;
- 542 action entries heuristically map to direct `bot.js` ownership;
- current static relative-import graph has zero detected cycles;
- machine-readable JSON/CSV inventories generated.

## Highest-risk concentration

1. `getBot()` spans approximately 18,114 lines and owns commands, messages, callback guards, hydration and legacy callback dispatch.
2. The callback region spans approximately 12,903 lines and contains hundreds of direct `p.a` branches.
3. `queries.js` exposes 328 values through one façade and mixes at least thirteen repository domains.
4. `broadcastTick()` spans approximately 618 lines and combines scheduling, recipient claiming, transport and persistence concerns.
5. `scripts/admin-web.js` contains shell, state, view and interaction logic in one 4,667-line asset.

## Positive architecture evidence

- no detected static relative-import cycle;
- action and guard metadata already have a central registry;
- payment, giveaway, broadcast safety and admin-auth cores are partly extracted;
- critical portable regression spine exists;
- compatibility façades can support incremental strangler extraction;
- Vercel/API budget does not require microservices.

## Decision

Do not perform a broad rewrite. Execute STEP590B–J as a modular-monolith strangler program. Preserve the current stack, callback keys, DB schema, UX and critical state machines unless a separate STEP explicitly changes them.

## Truth boundary

The ownership classifiers are planning heuristics based on action names, exact branches, aliases and exported function names. They are sufficient to define review scope, but each domain assignment must be confirmed during its extraction STEP. STEP590A does not claim runtime or production acceptance.
