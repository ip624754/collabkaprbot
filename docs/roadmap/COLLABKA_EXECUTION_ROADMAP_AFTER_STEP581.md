# Collabka Execution Roadmap after STEP581

**Status:** ACTIVE  
**Baseline:** STEP581 audit pack on top of STEP580 docs / STEP579 runtime

## Governing rule

Stabilize truth and release gates before adding product breadth. No broad rewrite.

---

## Wave 0 — Restore trustworthy gates

### STEP582 — Preflight Truth Restoration
Priority: P1 / immediate

Deliverables:
- callback consistency cleanup;
- dependency detector fix;
- full preflight green;
- current truth markers in handoff.

Exit gate:
- all canonical local preflights PASS.

### STEP583 — Release Identity Manifest
Priority: P1/P2

Deliverables:
- STEP + package version + migration head + SHA/tree hash + artifact hashes;
- generated release manifest;
- baseline naming contract.

Exit gate:
- every FULL ZIP is uniquely traceable.

---

## Wave 1 — Runtime proof spine

### STEP584 — Ephemeral DB Migration Replay
- clean Postgres boot;
- apply all migrations;
- verify migration head and checksums;
- no production migration changes.

### STEP585 — Critical Idempotency Integration Pack
- webhook replay;
- invite reward duplicate suppression;
- payment provider charge uniqueness;
- QStash dedup convergence.

### STEP586 — Giveaway Concurrency Proof
- simultaneous draw attempts;
- advisory lock evidence;
- single winner-set invariant;
- explicit RPT-CRITICAL artifact.

Exit gate:
- critical state transitions have executable integration proof.

---

## Wave 2 — Operational capacity and security

### STEP587 — Vercel Function Budget Reserve
- inventory and ownership;
- route consolidation plan;
- reserve at least one slot;
- no feature expansion.

### STEP588 — Admin HTML Injection Guard
- static escaping audit;
- high-risk interpolation tests;
- no UI redesign.

### STEP589 — ENV Governance Catalog
- generated variable registry;
- fail-open/fail-closed classification;
- Vercel scope checklist;
- secret lifecycle notes.

Exit gate:
- operational ceiling and critical configuration are explicit.

---

## Wave 3 — Maintainability without rewrite

### STEP590 — Monolith Boundary Map
- map `bot.js`, `queries.js`, `admin-web.js` domains;
- identify safe extraction seams;
- no code movement yet.

### STEP591+ — One bounded extraction per STEP
Candidate order:
1. admin DM template surface;
2. invite read/presentation surface;
3. support-thread presentation;
4. admin read models;
5. broadcast presentation.

Forbidden first targets:
- payments;
- giveaway settlement;
- global callback router;
- cross-role state machine.

Exit gate:
- reduced cognitive load without behavior changes.

---

## Wave 4 — Product sharpness / Creator OS

Only after Waves 0–2 are green.

### Product priority framework

Every feature proposal must answer:
- primary user and job;
- current workaround;
- measurable outcome;
- which existing surface it replaces/compresses;
- abuse path;
- operational cost;
- rollback path.

### Recommended product sequence

1. Opportunity feed truth and curation workflow.
2. Creator/brand relationship memory.
3. Repeat-collaboration signals.
4. Saved searches and bounded matching.
5. AI assistance only where data and workflow truth already exist.

Do not start with a broad CRM or social graph rewrite.

---

## Operating cadence

For every STEP:

1. baseline confirmation;
2. Risk Score and mode;
3. narrow plan;
4. implementation;
5. source QA;
6. runtime/integration proof where applicable;
7. changed files;
8. risks and not-verified list;
9. BROWSER_HOTFIX + FULL ZIP;
10. continuity update.

