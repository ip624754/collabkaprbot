# STEP584 — Staging Runtime Acceptance Pack Report

**Mode:** HEAVY / critical-boundary review  
**Status:** IMPLEMENTED, LOCAL CONTRACT VERIFIED, REMOTE STAGING NOT EXECUTED

## Scope

Added a safe operator-facing acceptance command for deployed preview/staging environments.

## Runtime additions

- `scripts/staging-runtime-acceptance.js`
  - exact target acknowledgement guard;
  - HTTPS-only remote target guard;
  - bounded fetch timeouts;
  - health GO/NO-GO evaluation;
  - webhook method/auth negative probes;
  - QStash signature negative probe;
  - optional signed QStash publish and health readback convergence;
  - JSON + Markdown evidence output;
  - non-zero exit code on failed acceptance.
- `api/health.js`
  - exposes sanitized `qstash.ping.last_at` and `qstash.ping.last_nonce` breadcrumbs required for deterministic convergence evidence.
- `scripts/smoke-staging-runtime-acceptance-contract.js`
  - verifies target guards, health evaluation, and observe-only acceptance against a local mock HTTP server.

## Safety and abuse review

- No webhook secret is accepted by the script and no authenticated Telegram update is sent.
- No DB mutation endpoint is called.
- No payments, broadcasts, giveaway settlement, or official publishing flows are triggered.
- Signed QStash delivery is opt-in and requires an operator-local token.
- Evidence excludes secrets.
- Target acknowledgement prevents accidental execution against an unintended host.

## Verified

- JavaScript syntax for changed runtime/scripts.
- Local contract smoke for target guards and remote-boundary evaluation.
- Existing STEP583 runtime proof: PASS.
- `npm run preflight:deps`: PASS.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- Canonical source preflight passed all assertion-based gates reached and entered the serial syntax sweep; the single command timed out before its final PASS line. Changed files passed direct `node --check`.
- Package scripts are present.

## Not verified

- Real Vercel preview/staging deployment.
- Real Upstash QStash publish/delivery.
- Real Upstash Redis readback.
- Telegram end-user traversal.
- Neon connectivity or mutations.
- Production environment.

## Next step

Run the acceptance command against the actual preview/staging deployment, save the generated evidence, then perform one manual creator/brand Telegram navigation smoke. Only then decide whether promotion is GO or NO-GO.
