# HOTFIX — `getActiveWorkspaceId is not defined` (production incident)

**Step ID:** HOTFIX (after STEP592)
**Mode:** HEAVY (production incident, critical zone: bot runtime / user verification + brand team flows)
**Truth Boundary:** every claim below is VERIFIED against source, with line numbers

---

## 1. Status

**Status:** Source implementation complete. Focused syntax QA PASS. Production deploy NOT VERIFIED (no env). Full QA suite NOT VERIFIED (no `node_modules`).

---

## 2. Symptom (production)

User-facing error: `getActiveWorkspaceId is not defined` raised at runtime whenever any `user_services` route fires (`a:verify_home`, `a:verify_info`, `a:verify_kind`, `a:support`, `a:share`, `a:acc_*`).

In the scheduler audit attached to this incident, GPT confirmed `getActiveWorkspaceId` is the failure surface; this report confirms the **root cause** and adds **two more latent crashes** of the same class that GPT did not surface.

---

## 3. Root cause

`src/bot/bot.js` line 27791 (in the `userServicesDomainDeps` object literal) referenced an identifier `getActiveWorkspaceId` that is **never defined** anywhere in `bot.js`. The correct identifier is `getActiveWorkspace`, defined at `bot.js:5272` as:

```js
async function getActiveWorkspace(tgId) { ... }
```

This is a STEP590E6 (Support / Verification / Sharing / Account Domain Extraction) extraction typo — the `Id` suffix was added by accident when the inline implementation was moved into `src/bot/domains/userServices/verificationCallbacks.js`.

The same typo propagated into `verificationCallbacks.js` itself:
- line 18: REQUIRED_DEPENDENCIES array entry `'getActiveWorkspaceId'`
- line 42: destructured binding `getActiveWorkspaceId,`
- line 117: call site `await getActiveWorkspaceId(ctx.from.id)`

### Why QA did not catch it

`scripts/test-user-services-domain-extraction.js:76` provides a mock:

```js
getActiveWorkspaceId: async () => 7,
```

In the test, the name is just a **key in a plain object** — it always exists at runtime because the test constructs the dep object explicitly. `bindDependencies(deps, names)` then validates the *value* (`!== null && !== undefined`), which is the mock function — passes. In production, the identifier is a **bare variable reference** in `bot.js` scope, and since no such variable exists, the *construction* of the object literal itself raises `ReferenceError` before `bindDependencies` ever runs.

This is a **Truth Boundary hole**: the unit test passed because the mock substituted a value, but no test verified that `bot.js` actually defines every name it forwards to the domain.

---

## 4. Forensic cross-check (audit pass over all `*DomainDeps` blocks)

A read-only audit was performed over all 17 `*Deps = { ... }` object literals in `src/bot/bot.js` (15 `*DomainDeps` + 2 `*SharedDeps`). For each, every bare-identifier key was checked against the rest of `bot.js` for a definition (`function X`, `const X`, `let X`, `var X`, `async function X`, or import).

Result — **3 bugs total, not 1**:

| # | Type | Location | Fix |
|---|------|----------|-----|
| 1 | Undefined identifier in `*DomainDeps` | `bot.js:27791` `getActiveWorkspaceId` (in `userServicesDomainDeps`) | rename → `getActiveWorkspace` |
| 2 | Domain file expects dep not provided | `teamCallbacks.js` requires `CFG`; `brandDomainDeps` did not list it | add `CFG,` to `brandDomainDeps` |
| 3 | Domain file expects dep not provided | `teamCallbacks.js` requires `escapeHtml`; `brandDomainDeps` did not list it | add `escapeHtml,` to `brandDomainDeps` |

Bugs 2 and 3 are STEP590E4B (Brand Team and Manager Domain Extraction) artifacts. They would have crashed the first time any brand-team-membership callback fired (`a:brand_team_help`, `a:brand_team_list`, etc.) with `brand_domain.missing_dependency:CFG` / `:escapeHtml`.

The same `brandDomainDeps` block also contains a harmless duplicate `BX_HOME,` declaration (lines 27534 and 27574) — a concatenation artifact from merging two originally-separate deps blocks. Left in place to minimise change surface; cosmetic only.

---

## 5. Changed files (minimal patch)

```
src/bot/bot.js                                              — 2 changes
src/bot/domains/userServices/verificationCallbacks.js       — 3 changes
scripts/test-user-services-domain-extraction.js             — 1 change (mock renamed to mirror production contract)
```

### Diff (logical)

`src/bot/bot.js`

```diff
@@ 27791, in userServicesDomainDeps @@
-      getActiveWorkspaceId,
+      getActiveWorkspace,
```

```diff
@@ inside brandDomainDeps, after second BX_HOME @@
       withTimeout,
       BX_HOME,
+      CFG,
       UI_MODES,
       bmNoAccessHtml,
+      escapeHtml,
       brandManagerLimitInfo,
```

`src/bot/domains/userServices/verificationCallbacks.js`

```diff
@@ line 18 (REQUIRED_DEPENDENCIES array) @@
-  'getActiveWorkspaceId',
+  'getActiveWorkspace',
@@ line 42 (destructured binding) @@
-    getActiveWorkspaceId,
+    getActiveWorkspace,
@@ line 117 (call site) @@
-        try { wsId = Number(await getActiveWorkspaceId(ctx.from.id)) || 0; } catch { wsId = 0; }
+        try { wsId = Number(await getActiveWorkspace(ctx.from.id)) || 0; } catch { wsId = 0; }
```

`scripts/test-user-services-domain-extraction.js`

```diff
@@ line 76 (mock) @@
-    getActiveWorkspaceId: async () => 7,
+    getActiveWorkspace: async () => 7,
```

---

## 6. Migrations

**None.** No SQL, no schema change.

## 7. ENV

**None.** No new variables.

## 8. QA verified

- `node --check src/bot/bot.js` → exit 0 ✅
- `node --check src/bot/domains/userServices/verificationCallbacks.js` → exit 0 ✅
- `node --check scripts/test-user-services-domain-extraction.js` → exit 0 ✅
- `grep -RIn "getActiveWorkspaceId" src/ scripts/` → 0 matches ✅
- `brandDomainDeps` key audit: 76 keys, 75 unique, `CFG: true`, `escapeHtml: true`, `BX_HOME: 2` (duplicate, harmless) ✅
- `userServicesDomainDeps` key audit: 47 keys, `getActiveWorkspace: true`, `getActiveWorkspaceId: false` ✅

## 9. QA NOT verified

- Full QA suite (`npm test`, `npm run callbacks:check`, etc.) — environment lacks `node_modules`
- Production deploy — no env access
- Telegram mobile acceptance — not run
- Staging runtime acceptance — not run

## 10. Production evidence

None. Operator must run the full QA + staging acceptance after applying this patch before deploying.

## 11. Residual risks

- The duplicate `BX_HOME` in `brandDomainDeps` is a code smell but not a runtime hazard. Recommend cleaning up in a future cosmetic patch — NOT in this hotfix.
- This audit only covers `*DomainDeps` object literals. There may be other classes of undefined-identifier bugs in `bot.js` that use a different pattern (e.g. direct call sites outside deps). A full static analysis pass (e.g. eslint with no-undef) is recommended once `node_modules` is available.

## 12. Rollout instructions

1. Apply the 4 changes listed above (or apply the patch).
2. `npm install` to ensure `node_modules` is consistent.
3. `npm test` — must PASS.
4. `node scripts/test-user-services-domain-extraction.js` — must PASS (mock now mirrors production contract).
5. `node scripts/test-brand-team-manager-domain-extraction.js` — must PASS.
6. `npm run callbacks:check` — must PASS.
7. `npm run lint:nav` — must PASS.
8. Staging runtime acceptance (`npm run acceptance:staging`).
9. Mobile acceptance (`npm run acceptance:telegram-mobile`).
10. Only then: production deploy.

## 13. Rollback instructions

`git revert <commit>` of this hotfix. No schema/migration changes, so rollback is purely source-level.

## 14. Updated handoff (for the next chat)

**Canonical parent:** STEP592, package `1.3.40`.
**This hotfix:** no package bump recommended yet — operator must run QA suite first, then bump to `1.3.41` as `PRODUCTION_ACCEPT_HOTFIX_GETACTIVEWORKSPACEID`.

**Next step:** NOT STEP593. The next step is to re-run the full QA suite and verify the bot is green in production before resuming the roadmap.

## 15. SHA-256

Not computed in this environment — operator must compute after applying the patch: `sha256sum src/bot/bot.js src/bot/domains/userServices/verificationCallbacks.js scripts/test-user-services-domain-extraction.js`.
