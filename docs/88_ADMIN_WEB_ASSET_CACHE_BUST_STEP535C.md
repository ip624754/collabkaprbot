# STEP535C — Admin web asset cache-bust / stale CSS bust

Date: 2026-04-03

## Why
A real CSS parser regression was fixed in STEP535B, but the live admin shell could still render with stale browser-cached `/styles/admin-web.css` and `/scripts/admin-web.js`. The symptom looked like native gray inputs/selects, plain text control-plane blocks, and missing late-file admin-web styling across Users / Runtime / Comms / Founder / Login.

## What changed
- `admin.html` now references:
  - `/styles/admin-web.css?v=20260403-step535c`
  - `/scripts/admin-web.js?v=20260403-step535c`
- no runtime logic changed
- no API / DB / auth contract changes

## Result
Fresh deploys now force the browser to pull the repaired admin assets instead of reusing a stale parse-broken copy.

## Risk
Low. Static asset URL version bump only.
