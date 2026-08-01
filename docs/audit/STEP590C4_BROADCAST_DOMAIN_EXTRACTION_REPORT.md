# STEP590C4 — Critical Broadcast Callback Domain Extraction Report

## Verdict

**SOURCE READY / PRODUCTION BROADCAST CALLBACK CANARY PENDING**

STEP590C4 extracts 28 critical broadcast callbacks from the legacy dispatcher into four executable owners. Existing delivery receipt, safety, worker and unknown-state semantics remain unchanged.

## Baseline evidence

The exact source baseline is the published STEP590C3 FULL tree. The operator stated that STEP590C3 was working normally and approved progression. No dedicated STEP590C3 production callback-log export was supplied with this STEP, so that statement is treated as operator evidence rather than independently parsed production evidence.

## Implementation

- added `src/bot/domains/broadcasts/`;
- added composer, audience, dispatch and operations owners;
- moved 28 inline callback branches out of `bot.js`;
- preserved `db.createBroadcastIdempotent()` as the confirm/job-creation boundary;
- preserved 8-second statement timeout and 45-second dedup window;
- preserved explicit admin authorization and `bc_confirm` rate limit;
- preserved pause/resume/stop state transitions;
- preserved operator control `broadcast_qstash_fanout` and audit metadata;
- introduced no recipient-send or QStash-publish path in the bounded domain;
- added executable domain tests and source contracts;
- updated router ownership and cumulative extraction evidence.

## Verified source evidence

```text
broadcast-domain tests:       161 assertions PASS
broadcast source contract:    PASS
callback router:             2440 assertions PASS
admin-auth domain regression:  83 assertions PASS
payment-domain regression:    164 assertions PASS
giveaway-domain regression:   119 assertions PASS
payment critical:              66 assertions PASS
giveaway critical:             55 assertions PASS
broadcast critical:            35 assertions PASS
admin-auth critical:           63 assertions PASS
health/privacy critical:       52 assertions PASS
bounded-safety critical:       36 assertions PASS
action registry:              560/560 PASS
callback consistency:          57 extracted / 503 legacy / 0 unresolved
JavaScript syntax:             301/301 PASS
package-lock consistency:      PASS
source preflight:              PASS with temporary dependency shims
portable critical spine:       6/6 PASS with temporary dependency shims
```

## Truth boundary

A clean `npm ci` could not complete in the implementation environment because the configured package mirror returned HTTP 404 for `xtend@4.0.2`. Temporary no-op dependency shims were used only to execute source-oriented preflight and the portable critical spine, then removed before artifact packaging. Therefore:

- clean dependency installation is not claimed;
- fresh `npm audit` is not claimed;
- real PostgreSQL, Redis, QStash or Grammy behavior is not claimed by shim-assisted runs;
- Vercel deployment is not claimed;
- a real broadcast was not created or delivered;
- the operator must run the complete QA set on the target checkout.

## Production acceptance required

A bounded canary should exercise composer navigation, preview, audience selection, confirmation cancellation, list/view and blocked-report paths. It must not send a real audience broadcast or toggle production fanout merely to test routing.
