- STEP204 static landing page is source-confirmed: root `/` now serves a Telegram-first one-page KOL Deal product page with a direct CTA into `@KOLDealsBot`, dark premium styling, core-surface/product/trust sections, and zero runtime bot/API contract changes.

- STEP203 microcopy polish is source-confirmed: the main-menu empty-channel line now reads naturally (`Connected channel: none yet`), the main-menu CTA now says `Choose what you want to do next`, giveaway sponsor setup copy now explains sponsor channels in plain English without `@channels`, and the remaining mixed Russian giveaway labels around eligibility, exports, reminder copy, and unpublished alerts are polished without changing runtime logic, callback contracts, schema, or monetization.
- STEP202 default slash workspace helper restore is source-confirmed: the current runtime snapshot restores the missing `getDefaultSlashWorkspaceId(ownerUserId, tgId)` helper used by `/market`, `/deals`, and the `a:bx_home` callback after the STEP191–STEP201 render/runtime recovery series. Slash market/deals entry and creator-market home now resolve workspace context safely by preferring the user’s remembered active workspace, validating ownership against the current workspace row, falling back to the owner’s first active workspace when needed, persisting that fallback back into `active_ws`, and failing safe to `0` for project-side mode when no owned workspace exists. This is a narrow runtime-hotfix only: it does not change barter/deal logic, schema, payments, cadence, or callback contracts beyond closing the concrete `ReferenceError` crash evidenced in Vercel logs.

- STEP201 giveaway host-channel model / sponsor-entry UX is source-confirmed: owner giveaway creation now treats the current workspace channel as the fixed host channel and moves extra join requirements into optional sponsor channels. The sponsor step now explains the model explicitly, supports picking additional sponsor channels from the owner’s other connected channels or adding them by @username / t.me link, allows zero extra sponsors, and shows host + sponsor breakdown in the draft/owner surfaces. Eligibility checks and reminder/publish copy now use the honest rule — join the host channel plus any sponsor channels — without renaming internal `gw_*` contracts, changing schema, or touching cadence/payments.

- STEP200 active Giveaway ops/docs narrative sweep is source-confirmed: active handoff, prompt, audit-freeze, NotebookLM index, docs map, and operator/admin docs now speak one current outward term — `Giveaway` — for the current product/ops canon without rewriting internal `gw_*` contracts, schema/history, or old step evidence. This is docs/ops wording cleanup only.

- STEP199 user-facing giveaway terminology sweep is source-confirmed: the active crypto runtime now speaks one наружный product term — `Giveaway` — across menu entries, workspace buttons, owner/public giveaway screens, publish/results/reminder copy, and admin giveaway labels. This is a terminology/copy cleanup only: internal `gw_*` callbacks, render/helper names, DB/schema contracts, and historical step evidence remain unchanged.

- STEP197 legacy auto_publish_default canon cleanup is source-confirmed: workspace settings no longer pretend that `auto_publish_default` is an active owner-facing giveaway toggle, and the workspace list/get queries stop hauling that stale field where it is no longer consumed by runtime surfaces. The settings screen now states the honest canon directly: results publish remains manual after draw. This is a narrow canon/data-surface cleanup only. It does not change schema, giveaway draw/end logic, payments, webhook behavior, or the already active manual owner results-publish path.

- STEP198 cadence cutover finalize is source-confirmed and live-confirmed: after the already observed STEP196 QStash deliveries soaked cleanly on the target env, `vercel.json` now removes the daily `/api/cron/giveaways-tick` backup entry and leaves giveaway cadence sourced solely from the external QStash schedule hitting the existing bearer-protected endpoint every 5 minutes. QStash cadence remains the primary trigger, Vercel daily giveaways backup cron is removed, and `ops-alerts` remains the only Vercel cron. This is still an infra/ops trigger cutover only: it does not change giveaway draw/end logic, results-publish behavior, payments, schema, or webhook security.

- STEP196 QStash external cadence baseline remains live-confirmed: real QStash schedule deliveries were observed against `POST /api/cron/giveaways-tick` on the target env at the expected 5-minute cadence with matching `POST 200` Vercel log entries; STEP198 simply finalizes the cutover by removing the old Vercel daily giveaways backup cron after the soak window closed cleanly.
- STEP194 giveaway entry query bounding / export safety is source-confirmed: the giveaway draw-side entry list queries are no longer unbounded pool scans. Eligible/all entry ID fetches and entry user-ref fetches now run under a shared hard safety cap with deterministic ordering, and the draw engine now fails closed with an audited `entry_limit_exceeded` reason instead of attempting an unsafe large-pool in-memory load. Owner participant exports are likewise bounded and now switch to `.txt` document delivery whenever the export is too large for a safe inline chat message, with an explicit truncation note when the export hits the configured row cap. This step is intentionally narrow: it does not change sponsor transactionality, giveaway fairness math, scheduler cadence, payments, or DB schema.

- STEP192 market / plans / brand render-contract restore is source-confirmed: the current runtime snapshot restores the missing market, matching, plans, featured, campaign, creator/brand PRO, Brand Pass, shortlist/compare, inbox/thread, and publish-finalize render helpers plus their supporting trust/economics/filter helper layer that were still referenced by active callbacks after the STEP183–STEP191 shrink. This step is still a narrow runtime-restore only: it does not change payments, scheduler cadence, sponsor transactionality, giveaway fairness, Deal Room state logic, or DB schema. It also re-locks the public trust/featured visibility docs note expected by the existing source smoke and preserves the STEP191 giveaway/workspace restore surfaces.

- STEP191 missing render contract restore is source-confirmed: the current runtime snapshot restores the missing owner/workspace/giveaway render helpers that were referenced by active callbacks but absent from `src/bot/bot.js`, including `renderGwOpen`, `renderMyChannelsEntry`, the connected workspace hub/list/settings/profile/history/archive surfaces, and the owner/public giveaway list surfaces. This is a narrow runtime-restore step only: it does not change payments, schema, giveaway fairness, intro charging semantics, or scheduler behavior. It restores honest re-render/navigation after existing mutations and closes the concrete `ReferenceError` crashes now evidenced in audit/logs.

# 00_CURRENT_STATE

- STEP195 giveaway publish dead-code cleanup is source-confirmed: the legacy `listDrawnGiveawaysToPublish(...)` worker query is removed now that the active giveaway canon is explicit manual owner results publish (`a:gw_publish_results` + reserve/finalize/release DB guard) rather than a hidden auto-publish worker pass. The remaining worker fetches also stop hauling the stale `auto_publish` flag where it is no longer consumed. This is a narrow code-hygiene/runtime-consistency step only: it does not change owner UX, draw fairness, scheduler cadence, payments, schema, or the active manual results-publish behavior.

- STEP193 giveaway sponsor transaction hardening is source-confirmed: `replaceGiveawaySponsors(...)` no longer performs a naked `delete` followed by per-row inserts on separate pool calls. The sponsor replace path now runs atomically on one DB handle: it reuses an optional caller transaction when provided, otherwise opens a dedicated transaction, executes delete+reinsert on that same client, and rolls back cleanly on failure before release. This step is intentionally narrow: it does not change giveaway owner UX, entry-query bounding, fairness logic, scheduler cadence, payments, or DB schema.

- STEP190 docs freeze / handoff / audit-pack sync is source-confirmed: that step aligned the then-active handoff, prompt, freeze, NotebookLM index, docs README, and current-state truth boundary to the STEP189 runtime snapshot. STEP190 itself did not change runtime logic, payments, schema, Deal Room state, giveaway fairness, or scheduling behavior; it only removed docs drift for that earlier freeze point.

- STEP189 giveaway contract cleanup is source-confirmed: the dead `gwo_` start payload path is removed from parsing, owner-created giveaways now state an explicit manual results-publish contract (`autoPublish: false` in the owner publish path plus draft copy that says results publish stays manual), and stale participant `gw_check` callbacks after the snapshot closes now resolve into honest post-deadline UX instead of a generic closed error. Joined users now see the final recorded-eligibility explanation and the participant screen refreshes in its closed state, while non-joined users get a precise `new entries are no longer accepted` alert. This step does not change giveaway fairness, owner lifecycle, payments, Deal Room state logic, or DB schema; it only removes dead giveaway contracts and tightens post-deadline participant behavior.

- STEP186 giveaway deep-link participant entry fix is source-confirmed: `/start gw_<id>` no longer routes into the owner-only access diagnostic surface and no longer calls `renderGwAccess` with the broken positional signature; deep links now open the same participant/public giveaway screen used by the public feed, and broken/unavailable deep links now render an honest `Giveaway unavailable` fallback with exits to `Giveaways` / `Main Menu` instead of silently dropping the user into the main menu. This step does not change giveaway fairness, owner lifecycle, payments, Deal Room state logic, or DB schema; it only repairs the participant entry funnel and locks that contract with a new repo smoke.

- STEP185 giveaway scope IA cleanup is source-confirmed: the main-menu `Giveaways` entry now opens a public feed of active campaigns instead of a cross-channel owner list, the current channel hub remains the owner scope through `New Giveaway` + `Channel Giveaways`, workspace copy now explains that `Airdrops` is the public network feed, and channel empty states no longer point users to a competing global owner label. This step does not change giveaway fairness, owner lifecycle, payments, Deal Room state logic, or DB schema; it only cleans up global-vs-channel scope in the giveaway IA and locks that contract with a new repo smoke.

- STEP183 offer publish quick-post + giveaway scope/label consistency hotfix is source-confirmed: the final offer wizard now exposes an optional `Publish from draft` action whenever a public channel handle or Telegram username is available, so creators can publish a concise market-ready offer without sending a separate custom message; `My Offers` now uses semantic status labels (`Live / Paused / Closed`) and clearer helper copy; crypto delete-confirm buttons are fully English; Feed filter summary now renders as bounded multiline lines instead of one dense sentence; and giveaway surfaces now distinguish global `My Giveaways` from workspace-scoped `Channel Giveaways`, including a channel-specific empty state that explains the difference. No payment / ledger semantics, Deal Room state logic, giveaway fairness, or schema changed.


- STEP170 parity sync / repo normalization is source-confirmed: the repo was brought up to the STEP169 baseline by restoring the missing STEP155–STEP169 smoke set, restoring the missing STEP154J / STEP156B / STEP154H1–STEP169 docs+work-history files, syncing the deal-thread advisory-lock/query/config parity files, and re-aligning the current docs canon so package scripts, runtime/source truth, and freeze/handoff docs no longer point at different baselines. No new product/runtime behavior landed in STEP170; this step is strictly repo normalization around the already source-confirmed STEP169 baseline.

- STEP169 crypto English-only sweep + airdrop owner end-to-end smoke is source-confirmed: the crypto giveaway/airdrop owner surfaces were tightened further (`Partner channels`, `Latest join/check`, channel-reminder copy, winner publish fallback label, and degraded system fallback text are now consistently English in the active crypto runtime), a new repo smoke now exercises the owner lifecycle end-to-end (`publish posture -> join/check gating -> ended draw -> owner preview -> results body`), and a dedicated English-sweep smoke now renders key crypto helpers (`giveaway publish/results/reminder`, reward lines, workspace delete preview/done) and asserts they stay free of Cyrillic in crypto mode. This step does not change payment / ledger / Brand PRO / Intro Credits semantics, Deal Room state logic, DB schema, or the giveaway fairness engine itself; it widens repo proof around the airdrop owner path and tightens crypto-language hygiene.

- STEP168 airdrop owner-flow closure + English-only crypto surfaces is source-confirmed: owner airdrop publish now defaults to `auto_draw=ON` unless the workspace explicitly disables it while `auto_publish` stays OFF unless explicitly enabled, owner open now exposes `Draw winners now` for ended giveaways that still have no winners, manual draw routes through the shared fairness/final-recheck engine in forced mode so older/manual rows cannot stay stuck in `ENDED`, participant `Check eligibility` now requires an existing join instead of silently creating one, and the main crypto giveaway/access/reminder/results surfaces were normalized back to English. This step does not change payment / ledger / Brand PRO / Intro Credits semantics, Deal Room state logic, or the fairness engine itself; it closes the owner lifecycle and UI-language gaps in the airdrop system and locks them with new repo smoke.

- STEP167 project-side first-offer / campaign clarity is source-confirmed: project-side entry and Launch templates now explain the first campaign path more explicitly (`browse Feed if the brief is still loose; use Launch templates when you already know the lane`), Launch templates now spell out what each lane is for without pretending to publish or spend anything, Feed now repeats that templates are only for lane preloading, and the template screen adds direct `Browse Feed first` / `Shortlist` exits so projects can move from template thinking into real candidate review faster. This step does not change checkout, ledger, Brand PRO / Intro Credit semantics, schema, or Deal Room state-machine behavior; it only clarifies how project-side users should form the first campaign/brief and locks that contract with a new repo smoke.
- STEP166 shortlist / compare action compression is source-confirmed: shortlist now behaves less like a parking lot and more like a pre-action surface, explicitly telling project-side users when to compare versus when to open directly; each shortlist row now exposes a direct `💬` intro action next to detail/remove, compare now states that the fastest path is to open directly when one candidate is clearly strongest, and each compare row now exposes direct `💬` intro actions alongside detail. This step does not change checkout, ledger, schema, Brand PRO / Intro Credit semantics, or Deal Room state-machine behavior; it only compresses the path from shortlist / compare into the next honest action and locks that contract with a new repo smoke.
- STEP165 creator-side offer / profile conversion polish is source-confirmed: creator-facing Profile and owner Offer surfaces now explain how projects actually read the public packaging (`How projects read this` / `Project-side read`), public offer detail now renders a bounded `Creator packaging` block so buyers can judge why the surface can convert before intro, and owner offer view now links back to `👤 Profile polish` for quick fixes. This step does not change checkout, ledger, Brand PRO / Intro Credit semantics, DB schema, or Deal Room state-machine behavior; it only sharpens creator-side packaging and locks that contract with a new repo smoke.
- STEP164 project-side browse → intro conversion polish is source-confirmed: project-side browse surfaces now frame the honest path from market discovery to intro spend more explicitly. Feed explains the best flow (`open detail → shortlist / compare → open intro`), public offer detail now states what intro unlocks (`1 new Deal Room; replies there stay free`) plus a bounded `Next intro move`, shortlist now behaves more clearly as a parking lot before compare/open, compare now explains that it exists to choose who deserves the next intro, and the project-side entry now repeats the browse-to-intro path. This step does not change checkout, ledger, schema, Brand PRO semantics, or Deal Room state-machine behavior; it only improves decision-to-action clarity and locks that contract with a new repo smoke.
- STEP163 profile quality nudges is source-confirmed: workspace Profile now shows at most two bounded `Best next profile upgrades` based on the highest-signal missing fields, adds quick action buttons that jump straight into those edits, and keeps edit prompts tied to practical value instead of generic form-filling. This step does not add a completion score, new persistent workflow, payments, schema changes, or Deal Room state changes; it only helps creators improve the strongest missing profile signals with less friction and locks that contract with a new repo smoke.
- STEP162 trust decision boost is source-confirmed: public offer view, shortlist / compare, and Deal Room counterparty trust blocks now translate visible trust facts into explicit decision-oriented cues (`Decision signal` + `Best use now`) instead of leaving trust as a purely descriptive block. This step does not add a new trust system, change ranking, or touch payments / schema / Deal Room state logic; it only helps users decide faster at the moment of action and locks that contract with a new repo smoke.
- STEP161 Deal Room next-action clarity pack is source-confirmed: Deal Room header now compresses the top decision layer into explicit `Room state`, `Waiting on`, `Next action`, and `Best next step` lines, while empty rooms now render role-aware first-move guidance instead of one generic fallback. This step does not change payment, proof, release, schema, or Deal Room state-machine semantics; it only makes the room easier to act inside and locks that contract with a new repo smoke.
- STEP160 first-run value path / guided entry is source-confirmed: the top-level crypto entry now frames the first decision as two explicit lanes (`Creator / Channel` vs `Projects / Exchanges`), the main menu keyboard exposes both lanes on the first row, setup copy now explains the immediate result after channel connect, and the project-side entry plus Launch templates now explain the best first move before any credit spend. This step does not change payment, Deal Room state, DB schema, or monetization semantics; it only compresses first-session clarity and locks that contract with a new repo smoke.
- STEP156B manual live gate closure pack is docs-only and source-confirmed: the repo now includes an explicit operator runbook and evidence template for the two remaining live payment checks (`strict payment happy-path` and `orphaned-admin-apply drill`). This step does not claim a new live pass; it only removes ambiguity about how to execute and record the still-open manual gate honestly.
- STEP156A legacy payment compatibility audit + Deal Ops/operator contention hardening is source-confirmed: legacy `match_` / `feat_` payment branches remain explicit through strict pre-checkout validation, orphaned classification, manual admin apply, and truthful operator hints; new smoke now locks that they do not silently remap into `Intro Credits` / `Brand PRO`. The earlier STEP157 / STEP158 audit suggestions were source-verified as already satisfied in this snapshot (`getAdminDealOpsSummary()` is already bounded and Deal Ops preview already redacts profile/message text), so this pass does not add a fake runtime patch there. The real runtime change in this step is a narrow STEP159-style hardening layer: Deal Ops remind / stale-expiry writes now serialize under a per-thread advisory transaction lock, and repo-side smoke locks that contention contract.
- STEP155 Deal Core consistency micro-hotfix is source-confirmed: Deal Room close receipts now reuse the shared `sendSafeDM` delivery path instead of a direct `ctx.api.sendMessage` call, `a:deal_stage` now claims the same `claimDealCoreGuard` throttle family as the other Deal Core mutations, repo-side smoke locks both contracts, and docs freeze / handoff / audit-pack truth now point to the cleaned STEP155 baseline.
- STEP154M audit-pack closure / smoke alias repair is source-confirmed and docs+repo-consistency only: the broken `smoke:deal-core` package alias now resolves to the real `scripts/smoke_deal_flow.js` contract, the NotebookLM audit index no longer points to non-existent smoke files, the curated pack count matches the actual file list, and the latest freeze/handoff/current-state docs now agree on the same repaired source-of-truth boundary for this snapshot.
- STEP154L smoke canon repair / handoff truth sync is source-confirmed and docs+repo-consistency only: `smoke_deal_flow.js` now matches the current Deal Room `Next action` contract instead of the stale `Next:` line, `smoke_trust_facts_upgrade.js` now matches the current compact-trust helper contract, a real `smoke_shortlist_compare_contract.js` now exists in the repo, and handoff / NotebookLM index now reference the actual trust/shortlist smoke set in this snapshot.
- STEP154K docs-canon sync is docs-only and source-confirmed: handoff / freeze / NotebookLM index / current-state / README now align to the actual current repo snapshot instead of the stale STEP153D narrative.
- STEP154J structured profile editor is source-confirmed: profile overlap fields (`Topics / Chain / Language / Audience / Formats / Region`) now use bounded structured pickers instead of free-text prompts, `Name` / `Contact` remain flexible text inputs, profile summary renders normalized values, and legacy free-text values remain renderable until the owner saves structured picks.
- STEP154H2 monetization UX polish is source-confirmed: project-side monetization flow is trimmed to `Brand PRO + Intro Credits + Free limits`, Launch templates are a bounded discovery helper, Intro Credits explicitly explain `1 credit = 1 new intro / Deal Room` while replies in opened Deal Rooms stay free, Brand PRO purchase is collapsed to a single Max offer in user-facing UI, and template-driven Feed entry preserves local back.
- STEP154H1 monetization UX hotfix is source-confirmed: user-facing `Project Plan` ambiguity is collapsed into a single `Brand PRO` story in upgrade surfaces, `Plans / Upgrade` no longer shows both guide and direct-buy buttons side by side, Brand PRO / Intro Credits screens preserve local back context instead of dumping users into the top menu, and plan-related callbacks use safer callback acknowledgements to avoid noisy webhook exceptions on simple navigation.
- Current user-facing monetization model in this snapshot is: `⭐ Creator PRO` + `⭐ Brand PRO` + `🎫 Intro Credits`. `Featured` is not treated as a primary paid SKU in the core upgrade story.


- STEP153 buyer-side Deal Room channel snapshot is source-confirmed: buyer thread renders now best-effort enrich the seller surface with a compact `@channelusername` + member-count line fetched via Telegram `getChatMemberCount`, cached in Redis by `@channelusername`, built through an optional helper outside the core text builder, and dropped silently on lookup/cache failure. No avg-view claims, migrations, or blocking UI errors were added.
- STEP151 Deal Room quick-reply lite is source-confirmed: empty OPEN Deal Rooms now show one-tap template buttons for the first outreach only; tapping a template sends a real message through the existing Deal Room message path, disappears after the first message, and records `bx.thread_quick_reply` audit events without introducing a fake editable composer contract.
- STEP150 Deal Room close receipt is source-confirmed: after a Deal Room is successfully closed, the bot now best-effort DMs both participants a compact receipt with offer/workspace identity, role, duration, final stage, and proof totals; failures do not block close, and the close path now records attempted/sent/failed receipt counts in `bx.thread_close_receipt` audit payloads.
- STEP149 low-balance intro-credit nudge is source-confirmed: after a charged `a:bx_msg` intro-open succeeds, the bot now renders the Deal Room first and then best-effort sends a small top-up nudge only when the remaining intro-credit balance is `2 / 1 / 0`, reusing the existing `a:brand_pass` entrypoint without changing payment, ledger, or paywall contracts.
- STEP147 giveaway draw lock-client threading / atomic commit is source-confirmed: the auto-draw path now uses the same advisory-lock client for all draw-path giveaway reads/writes (including nested sponsor lookup during final live recheck), winner persistence + giveaway status transition + draw audit now commit atomically on that same client, and `updateGiveaway()` now hard-fails on unsupported patch keys instead of accepting arbitrary column updates.
- STEP145 prompt fusion / docs canon refresh is docs-only and source-confirmed: the root/docs start-new-chat prompt now merges the stronger protocol, truth-boundary, and risk-overlay language into the CryptoCollabBot canon; handoff and audit-pack docs are re-synced to the current STEP144 runtime baseline; and the remaining live gate is now stated explicitly as BLOCKED/PARTIAL rather than implied green.
- STEP124 operator-tooling polish is source-confirmed and now live-confirmed in production: public-only verification stays honest without Telegram/DB secrets, the target env has been aligned through migration `020_giveaway_reward_kind.sql`, and the automated target-env pass is green.
- STEP125 live-pass lock / audit refresh is docs/pack-only: docs now record the completed automated target-env alignment through STEP124, while the only remaining release-gate items are the two manual payment checks (`strict payment happy-path` and `orphaned-admin-apply drill`).
- STEP126 prompt/source-truth sync is docs-first and source-confirmed: the start-prompt layer now matches the recorded live-pass truth instead of repeating the older `fresh live verification pending` narrative.
- STEP127 public-offer profile redaction hardening is source-confirmed: workspace profile v2 free-text on the public offer surface now flows through the shared public-surface policy before render.
- STEP128 webhook dedupe high-risk review is source-confirmed: the charge-bearing `a:bx_msg` intro-open callback is now classified as explicit high-risk during dedupe bypass and covered by runtime smoke.
- STEP130 admin IA/spec freeze is source-confirmed in docs: the admin expansion now has a compact top-level `System / Operations / Communications` contract plus a bounded `Users -> User Card` first wave.
- STEP131 admin users catalog is source-confirmed: admin operations now include a bounded Users screen with search, filters, pagination, and stable callback/nav state.
- STEP132 admin user card v1 is source-confirmed: operator user cards now show summary-first identity/trust/workspace/payment/activity context with recoverable jumps into user payments plus read-only verification/moderation context.
- STEP133 admin notes / tags v1 is source-confirmed: operator-only notes now persist in Postgres, `User Card` shows compact notes/tags summary, and admins can open a bounded `Notes` surface with manual note add plus normalized tags.
- STEP134 admin Notice / Announcement v1 is source-confirmed: Communications now expose a bounded Notice control panel, active notices persist in Postgres, drafts live in Redis, and matching users can see the active notice on the crypto main menu with a safe built-in CTA row.
- STEP135 admin DM templates / outbox baseline is source-confirmed: Communications now expose bounded DM templates and an Outbox journal, `User Card` can open a per-user operator DM compose surface, drafts live in Redis, templates/outbox persist in Postgres, every operator DM goes through preview before send, and sent/error outcomes are journaled without expanding into broadcast tooling.
- STEP135A admin home wiring hotfix is source-confirmed: the live `a:admin_home` callback now delegates into the compact `Operations / Communications / System` control cockpit instead of rendering the stale legacy admin menu.
- STEP135B admin ops polish hotfix is source-confirmed: the Users catalog no longer crashes on a bind-shape mismatch, payment search/export now give explicit operator feedback, empty CSV export no longer leaves a dangling chat message, admin entry into Reports / Verifications preserves the admin-origin back path, and Notice preview / activate / disable now explain what happened instead of silently re-rendering.
- STEP136 project / KOL operator card split is source-confirmed: `User Card` now exposes bounded `Project card` and `KOL card` facets, project-side cards summarize workspace/channel and owner-offer footprint, KOL-side cards summarize channel/profile v2 and creator-offer footprint, and both remain read-only/operator-safe surfaces with recoverable back paths into the generic User Card.
- STEP136A admin user-search HTML hotfix is source-confirmed: the `Users -> Search` prompt now escapes `tg:<id>` for HTML parse mode, so opening the search prompt no longer throws Telegram `can't parse entities` and repo-side smoke locks the escaped prompt contract.
- STEP137A verification / Risk Desk read-only baseline is source-confirmed: `Operations` now exposes a bounded `Risk desk`, admin-origin-aware report / verification queues can return back to that desk, the desk summarizes pending verifications / open reports / open support / `risk`-tagged users, and queue detail views stay explicitly read-only from this origin while linking back into `User Card` / entity cards instead of introducing new moderation mutations.
- STEP137B verification / Risk Desk operator actions is source-confirmed: `admin_risk` detail views now expose bounded approve / reject / freeze / close / resolve actions while still reusing the shared moderation guards, throttles, and audit trail, queue back-paths remain anchored to `Risk desk`, and verification rejection now replies with a recoverable jump back into Risk Desk / the verification queue instead of dropping the operator into a dead end.
- STEP138 Giveaway Ops is source-confirmed: `Operations` now exposes a bounded read-only `Giveaway Ops` desk with summary counts, spotlight rows, per-giveaway operator cards, public-preview rendering, and recent audit visibility for giveaway lifecycle triage without opening new draw/publish mutation paths.
- STEP139 Treasury / Revenue / Credits is source-confirmed: `Operations` now exposes a bounded read-only `Treasury` dashboard with ledger-health counters, applied-vs-total Stars revenue, per-branch monetization visibility, outstanding intro-credit balances, estimated paid/trial intro-credit issuance, active Project Plan / PRO footprint, and compatibility-branch visibility without opening new payment mutation paths.
- STEP140 Campaign / Deal Ops Board is source-confirmed: `Operations` now exposes a bounded read-only `Deal Ops` board with campaign/deal-room counters, spotlight rows, and a read-only deal card that can jump safely into Buyer / Seller / Project / KOL / Reports surfaces.
- STEP141 project-mode intro credits enforcement is source-confirmed as a defensive contract lock: the intro-open helper now recognizes explicit `projectMode`, the crypto `a:bx_msg` path passes that signal while still requiring credits, and repo-side smoke now locks the invariant that project-side intro opens must never regress into a workspace-based free-intro bypass.
- STEP142 giveaway truncated draw liveness fix is source-confirmed: a final-recheck run that truncates but still finds some winners now commits those winners with a truthful shortage/truncation audit trail instead of looping forever in `ENDED -> draw pending`
- STEP144 admin hardening bundle is source-confirmed: Deal Ops now uses a bounded recent/active candidate scope instead of scanning the full thread universe for operator spotlighting, Risk Desk mutations now require explicit admin-origin access on top of the shared moderation guards/throttles/audit contract, admin notice activate/disable paths serialize through an advisory lock, and Deal Ops cards redact profile-preview and message-snippet text through the shared public-surface policy before render.

## Active baseline

Repository baseline:
**CryptoCollabBot / MicroGiveaways v1.1.8**.

Deployed Telegram identity baseline:
- **name:** `KOL Deal — Crypto Collab Market`
- **username:** `@KOLDealsBot`
- **repo/artifact codename remains:** `CryptoCollabBot`

Docs freeze after this step:
**STEP165 — creator-side offer / profile conversion polish** (source-confirmed narrow creator-side packaging step. Profile now adds a bounded `How projects read this` block, owner Offer view now adds `Project-side read` plus a direct `👤 Profile polish` action, and public offer detail now adds a bounded `Creator packaging` block so buyers can judge why the creator surface is worth considering before intro. No checkout, ledger, schema, Brand PRO / Intro Credit semantics, or Deal Room state-machine behavior changed.)

**STEP164 — project-side browse → intro conversion polish** (source-confirmed narrow project-side conversion step. Market Feed now states the best conversion path — open detail, shortlist / compare, then spend Intro Credits only when opening a new Deal Room; public offer detail now explains what intro unlocks and adds a bounded `Next intro move`; shortlist and compare now frame themselves as pre-intro decision aids instead of passive holding screens; and the project-side entry now repeats the browse-to-intro path. No checkout, ledger, schema, Brand PRO semantics, or Deal Room state-machine behavior changed.)

**STEP163 — profile quality nudges** (source-confirmed narrow user-facing profile assist step. Workspace Profile now shows at most two bounded `Best next profile upgrades`, adds quick jump buttons into the highest-signal missing edits, and keeps prompt copy tied to practical value instead of generic form-filling. No completion score, payment, schema, or Deal Room state-machine semantics changed.)

**STEP162 — trust decision boost** (source-confirmed narrow user-facing trust presentation step. Public offer detail, shortlist / compare, and Deal Room counterparty trust blocks now translate visible trust facts into explicit `Decision signal` and `Best use now` cues so users can decide whether to open, compare, or move faster without inventing a new trust layer. No ranking, payment, schema, or Deal Room state-machine semantics changed.)

**STEP161 — Deal Room next-action clarity pack** (source-confirmed narrow user-facing Deal Room clarity step. The room header now leads with `Room state`, `Waiting on`, `Next action`, and `Best next step`, and empty rooms now explain the best first move by role/state instead of using one generic fallback. No payment, proof, release, schema, or Deal Room state-machine semantics changed.)

**STEP160 — first-run value path / guided entry** (source-confirmed narrow user-facing clarity step. The first-run welcome/home surfaces now present two explicit lanes — `Creator / Channel` and `Projects / Exchanges` — instead of one generic intro. The main menu keyboard now exposes those two lanes together, channel setup explains the immediate post-connect result, and the project-side entry plus Launch templates explain the best first move before any Intro Credit spend. No payment, Deal Room, schema, or ledger semantics changed.)

**STEP156B — manual live gate closure pack** (docs-only; this snapshot now includes an explicit operator runbook and evidence template for the two still-open manual payment checks: one strict real payment happy-path and one orphaned-admin-apply drill. The step does not claim the live gate is closed; it only standardizes how to run and record it honestly.)

**STEP156A — legacy payment compatibility audit + Deal Ops/operator contention hardening** (source-confirmed narrow source/runtime step. Legacy `match_` / `feat_` payloads are now explicitly smoke-locked across strict validation, orphaned classification, truthful operator hints, and manual admin apply so they cannot silently remap into `Intro Credits` / `Brand PRO`. STEP157 and STEP158 were source-verified as already satisfied in this snapshot — Deal Ops summary is already bounded and Deal Ops preview already redacts profile/message text — so this pass avoids a fake runtime patch there. The real runtime hardening in STEP156A is a per-thread advisory transaction lock on Deal Ops remind / stale-expiry writes, with repo-side smoke locking the contention contract. The broad manual live payment gate remains separate and still open.)

**STEP154M — audit-pack closure / smoke alias repair** (docs/repo-consistency only; it repaired the broken `smoke:deal-core` alias, removed remaining phantom smoke references from the NotebookLM audit index, aligned the curated-pack count with the actual file list, and re-synced the latest freeze/handoff/current-state docs to the cleaned STEP154M canon.)

**STEP154L — smoke canon repair / handoff truth sync** (docs/repo-consistency only; it repaired smoke/docs drift so the current repo truth, handoff mini-smoke set, and NotebookLM audit index all point to real scripts and the current Deal Room `Next action` contract.)

**STEP151 — Deal Room quick-reply lite** (empty OPEN Deal Rooms now show one-tap template buttons for the first outreach only. Tapping a template sends a real message through the existing Deal Room message path, uses role-aware buyer/seller copy, disappears after the first message, and records `bx.thread_quick_reply` audit events. No editable prefill composer, migration, payment change, or new draft-state contract was added.)

**STEP150 — Deal Room close receipt** (after a user successfully closes a Deal Room, the bot now best-effort DMs both participants a compact receipt summarizing the offer/workspace, participant role, elapsed duration, final deal stage, and proof totals. Receipt delivery is non-blocking and audit-visible through `bx.thread_close_receipt` attempted/sent/failed counts; payment, proof submission, and close authorization contracts stay unchanged.)

**STEP149 — Low-balance intro-credit nudge** (after a charged `a:bx_msg` intro-open succeeds, the bot now renders the Deal Room first and then best-effort replies with a compact `Buy Intro Credits` nudge only when the remaining balance is `2 / 1 / 0`. The nudge reuses the existing `a:brand_pass` top-up entrypoint, reminds the buyer that replies inside the newly opened Deal Room stay free, and does not change paywall logic, Stars checkout, ledger mutation, or migrations.)

**STEP148 — Giveaway winner DM notification** (the giveaway results publish path now finalizes the public results post first, then best-effort DMs each exported winner using the existing `tg_id` roster and a deep-link back into the bot/transparency flow; the same `gw.results_published` audit event now records attempted/sent/failed DM counts for operator visibility. This is a source-confirmed runtime UX step only: no migrations, payment-flow changes, draw-flow changes, or new live claims were introduced.)

**STEP147 — Giveaway draw lock-client threading / atomic commit** (the giveaway auto-draw path now threads the same advisory-lock client through draw snapshot, entry lists, sponsor lookup, final live eligibility recheck updates, winner writes, status mutation, and audit write; winner persistence + `WINNERS_DRAWN` status transition + draw audit now commit atomically on that same client; and `updateGiveaway()` now rejects unsupported patch keys instead of accepting arbitrary dynamic column updates. This is a source-confirmed runtime fix for the narrow STEP146 audit finding around draw-path connection starvation / ghost-winner risk. No payment-flow, lock-model, migration, or runtime-topology redesign was introduced; the remaining live gate is still the separate STEP143 manual payment closure.)

**STEP145 — Prompt fusion / docs canon refresh** (docs freeze now reflects the completed STEP124 automated target-env alignment, STEP126–STEP128 hardening, the full bounded admin expansion/hardening wave through STEP144, and the docs-only STEP145 refresh that merges the stronger prompt kernel into the CryptoCollabBot canon, re-syncs handoff/audit-pack docs, and states the remaining live gate honestly as BLOCKED/PARTIAL. The source-confirmed runtime/code baseline remains through STEP144; production schema still expects additive migrations `022_admin_notices.sql` and `023_admin_dm_templates_outbox.sql`; STEP143 manual target-env payment closure remains blocked by insufficient Stars balance / missing live orphaned case; and only the two manual payment checks remain pending for a fully closed release gate.)

This is a working crypto-collab bot core, not a blank MVP.

Current live target-env note:
- current production health is green on fast/full health endpoints;
- current production schema is aligned through `020_giveaway_reward_kind.sql` with `Pending: 0`;
- public-only verify/drill is now green and honest in production;
- full/read-only drill is green after alignment;
- the only remaining live checklist items are the two manual payment checks (`strict payment happy-path` and `orphaned-admin-apply drill`).

## Fixed mode

- **Primary mode:** Telegram SaaS / Bot
- **Secondary mode:** Crypto / Token / Launch
- **Execution overlay for repository changes:** Engineering Ops

## Goal

Harden and launch the current crypto-collab bot without drifting into a large redesign.

## Current scope

Current scope stays intentionally narrow:
- keep the product centered on the collaboration engine;
- preserve payment safety and admin recoverability;
- preserve webhook / cron / health / migration discipline;
- keep the first crypto beta explainable and operator-visible;
- avoid broad feature expansion until the live verification baseline is closed.

Giveaways remain optional and must not redefine the architecture.

Hotfix note: STEP109 is a narrow production boot fix only. It does not change payment logic, webhook security, giveaway rules, or workspace ownership behavior.

## Source-confirmed product core

Current source-confirmed product core includes:
- workspaces / connect channel flow;
- Collab Market;
- offer wizard;
- Direct Intro + Inbox / thread flow;
- Deal Room stages;
- proofs (screenshot + link);
- verification + moderation;
- Telegram Stars monetization;
- orphaned-payments manual apply path;
- webhook / cron / health / migration tooling.

Current contact policy is now source-confirmed:
- public market surfaces show **masked** contact only;
- public/discovery title + description text now also redact direct contact fragments (`@handle`, `t.me`, email, phone-like tokens) before intro/unlock;
- owner-private surfaces still show full contact;
- Deal Room now exposes full direct contact inside the trusted intro-created room.

Current UX / navigation baseline is now source-confirmed:
- returning to the main menu renders product home copy instead of a bare `Menu` placeholder;
- main hub keyboards were compacted where sensible into paired rows (main menu, channel hub, market hub, Deal Room stages, admin/moderation hubs);
- FAQ and support are now available from the main surface via buttons and slash commands (`/faq`, `/help`, `/support`);
- product navigation now also exposes real slash handlers for `/menu`, `/channel`, `/market`, `/projects`, `/verify`, `/deals`;
- `/deals` now reuses the same inbox surface from both callbacks and slash entry, using a stable workspace context;
- support requests now create `support_threads`, land in `SUPPORT_CHAT_ID` when configured, and can be answered back to the user by replying to the support card in that chat;
- support cards now show explicit operator instructions inside the card, open the user profile directly from the inline button, and keep only the action buttons that matter on new cards;
- user-facing replies and closure notices are now branded as KOL Deal Support bot messages instead of raw operator-signature dumps;
- admin support screen now shows routing + ticket overview and no longer emits noisy no-op `message is not modified` edit exceptions on refresh.
- admin home entrypoint now correctly lands in the compact `Operations / Communications / System` cockpit, admin `Operations` now contains a bounded `Users` catalog with search/filter/pagination, `User Card v1` exposes summary-first identity/trust/workspace/payment/activity context without adding new user-facing hot-path DB reads, `Notes / Tags v1` adds operator-only memory on top of User Card via Postgres-backed notes plus normalized tags, `Communications -> Notice` controls a bounded main-menu notice surface without expanding into broadcast, `Communications -> DM templates / Outbox` plus `User Card -> Message` now add a bounded 1:1 operator DM workflow with preview-before-send and Postgres-backed journaling, and `Operations -> Risk desk` adds a read-only triage surface over verification/report/support/risk-tag signals with safe jump-backs into user/entity cards.
- creator-side `Collab Market` now prioritizes `Post offer` + `My offers` above passive browsing actions;
- the final offer wizard screen now explicitly says that the next message publishes the offer immediately, shows a compact summary of the chosen signals, and exposes both `Back` and `Cancel`;
- after a successful publish, the user now lands on a dedicated success screen with `View offer`, `My offers`, `Post another`, `Feed`, and visible active-offer inventory (`X/Y`);
- the offer publish success screen now escapes HTML-sensitive labels safely (for example `Micro (<10k)`) and normalizes final contact lines like `Contact: @handle` down to a single clean contact value.
- no-channel users can now enter the market cleanly from the project side via `👀 Browse Market`, `/market`, `/projects`, the tour market button, or `/start proj`, without being blocked by `ensureWorkspaceForOwner`.
- public offer detail now explains `Open Intro` in one line: it spends intro credits to open a Deal Room, while replies inside the same room stay free;
- Deal Room now shows a short stage guide plus a tighter stage hint instead of leaving stage meaning implicit;
- Market Feed header now shows active filters visibly (`Filters: ...`) instead of hiding the current filter state in a spoiler.

- multi-channel baseline is now source-confirmed: Free users are limited to **1 connected channel**, any owner with an active PRO workspace can use **up to 3 connected channels**, the channel hub now exposes `Current Channel`, `Switch Channel`, and `Add Channel`, and the PRO paywall appears only when a free user tries to add the second channel;
- STEP065 trust facts upgrade is now source-confirmed: crypto Feed and Matching rows can show a compact public trust line (`Verified`, `closed`, `proof history`) instead of relying only on a binary verified badge, while public detail / Deal Room keep the fuller explainable trust copy.
- STEP066 KOL profile v2 is now source-confirmed: workspace profiles can store chain / ecosystem, language, audience, and content formats additively, the profile editor exposes those fields, and public offer detail / Deal Room can show the creator-profile snapshot without widening Feed / matching density.
- STEP067 offer economics is now source-confirmed: offers can store optional `rate_range`, the creator publish wizard inserts a dedicated economics step after payment-model selection, and Feed / public detail / owner offer view / Deal Room can render compact `payment model + rate_range` visibility without changing intro credits or payment-ledger truth.
- STEP069 workspace lifecycle is now source-confirmed: channel settings can disconnect a channel into archive, archived channels can be restored or deleted forever, restore respects the active-plan slot limit, and archive turns Public Network off plus pauses active offers before removing the channel from the active connected list.
- STEP069 admin system hotfix is now source-confirmed: the Admin System/operator parity screen now derives support-routing status safely again instead of throwing a runtime `ReferenceError` in webhook middleware.
- STEP070 archive safety hardening is now source-confirmed: hard delete now only succeeds for still-archived channels, stale delete confirmations fail safely after restore, and active-workspace semantics ignore archived channels in the creator-vs-brand credit path.
- STEP071 workspace limits hardening is now source-confirmed: active channel limits are enforced again inside the DB mutation layer for both create/connect and restore flows, using an owner-scoped transactional lock so stale UI or concurrent actions cannot bypass `Free=1 / PRO=3`.
- STEP072 selective stale-state hardening is now source-confirmed: closed Deal Rooms reject stale close/stage mutations, moderator freeze/close/resolve actions require the current expected state, and support close now behaves as a compare-and-swap style terminal action instead of a blind repeatable close.
- STEP075 admin-pay navigation fallback is now source-confirmed: Admin payment cards now carry an explicit callback back-target into `User payments`, the search/cancel flow preserves that target, and the user-payments screen now prefers explicit callback fallback before Redis best-effort nav so operator payment triage stays recoverable during Redis drift.
- STEP076 support reply idempotency is now source-confirmed: reply-to-card operator messages claim a dedicated guard per ticket/message before sending the user DM, duplicate delivery gets an explicit operator response instead of another user DM, and closed tickets now reject replies with a stricter terminal-policy message.
- STEP077 moderator action throttling is now source-confirmed: verification approve/reject and moderation freeze/close/resolve actions now claim a dedicated moderator guard with a short TTL, so rapid repeat taps no longer re-run the same mutation and Redis degradation returns a temporary-system response instead of a silent re-fire.
- STEP078 target-env release gate is now source-confirmed as a repo-local pass pack: the exact live checklist is captured in docs, release docs/preflight stay aligned with the moderator-throttling contract, and this workspace remains blocked on fresh live verification until target-env secrets are available.
- STEP079 docs/handoff pack refresh remains part of project history: it was the first cleanup that re-aligned handoff/start/audit-freeze docs to the then-current STEP078 baseline. The newer STEP085 docs sync supersedes that freeze language and keeps the current flat NotebookLM audit-pack rule separate from the standalone pasted prompt file.
- STEP080 public discovery anti-bypass redaction is now source-confirmed: Feed / public offer / public featured surfaces keep masked contact and now also redact contact-like fragments inside public titles, descriptions, and featured body text before intro/unlock, while owner/private surfaces and Deal Room keep the original raw text.
- STEP081 two-tier health endpoint is now source-confirmed: `/api/health` defaults to a fast operator-friendly snapshot and `/api/health?full=1` keeps the heavier payment counters and beta-review/counter sections for deeper release triage without forcing the expensive path on every default health check.
- STEP082 atomic bump cooldown is now source-confirmed: offer bump now claims cooldown truth inside the SQL `UPDATE` itself, so two near-simultaneous bump taps cannot both succeed off the same stale `bump_at` read; the handler only re-reads on the failed path to render the same cooldown copy from fresh DB truth.
- STEP083 intro advisory-lock hardening is now source-confirmed: new intro / Deal Room opening now claims a transaction-scoped advisory lock on `(buyerUserId, offerId)` before the credit-spend path, so rapid parallel taps fail fast with an explicit busy/retry message instead of waiting under row-lock contention or risking confusing duplicate-open races.
- STEP084 Redis degraded hardening is now source-confirmed: webhook dedupe bypass no longer blindly allows every update through during Redis degradation. Explicit high-risk callback mutations plus Telegram payment updates (`pre_checkout_query`, `successful_payment`) now fail closed with a retryable `dedupe_unavailable` response while lower-risk read/navigation traffic can still pass; full health also exposes lightweight runtime counters for duplicate / bypass / blocked-high-risk decisions so the operator can see whether degraded bypass was happening in-process.
- STEP085 docs freeze / handoff sync is now source-confirmed: handoff, start-prompt, audit-freeze, launch-readiness, and release-protocol now all describe the current STEP084 source baseline honestly, keep live/runtime truth pinned to the older STEP078 target-env pass until a fresh pass is recorded, and drop the stale local `STEP067_target_env_local_check.log` artifact from the active freeze narrative.
- STEP086 health fast-path hardening is now source-confirmed: fast `/api/health` no longer silently normalizes to full mode, now skips migrations/payment counters/beta review by default, and time-bounds DB / Redis / migration-heavy checks so operator health degrades quickly and visibly instead of hanging or pretending to be lightweight while loading the full payload.
- STEP087 redaction bypass hardening is now source-confirmed: public/discovery text redaction strips zero-width obfuscation, normalizes spaced Telegram hosts like `t . me`, and now also protects public economics text (`rate_range`) from leaking contact-like content on feed/public/detail/quick-browse surfaces while leaving Deal Room and owner-private surfaces raw.
- STEP089 runtime degraded-webhook smoke is now source-confirmed: webhook dedupe bypass decisions flow through a shared pure helper so repo checks can assert duplicate / high-risk-block / low-risk-allow behavior without depending on live bot init.
- STEP090 health slow-dependency smoke is now source-confirmed: the shared timed health-probe helper lets repo checks assert labeled timeout behavior for slow DB/Redis-style probes instead of relying only on static source grep.
- STEP091 public render integration smoke is now source-confirmed: public featured / offer / quick-browse render boundaries now delegate through shared public-surface helpers, so repo checks can verify rendered redaction behavior (including public economics) with fixtures rather than only scanning bot.js for raw calls.
- STEP092 restore duplicate-channel guard is now source-confirmed: restoring an archived workspace now fails with `channel_conflict` when another active workspace already owns the same `channel_id`, preventing a stale archive from re-activating a duplicate live channel after reconnect/reownership drift.
- STEP093 live-pass checklist refresh is now source-confirmed: `docs/98_STEP088_TARGET_ENV_PASS.md` is the pending live checklist template for the current baseline, while the older `docs/97_STEP078_TARGET_ENV_PASS.md` remains a historical pass artifact instead of the active checklist.
- STEP094 channel ownership hardening is now source-confirmed: create/connect now claims a channel-scoped advisory lock, checks for another active workspace already owning the same `channel_id`, and fails closed with `channel_conflict` instead of silently allowing a second owner to activate the same live channel.
- STEP095 workspace channel-ownership verification is now source-confirmed: repo checks now exercise the shared channel-conflict policy directly, confirm create/restore both take the channel-scoped lock, and verify the setup flow surfaces a user-safe conflict message instead of quietly falling through to unrelated UI.
- STEP097 giveaway final eligibility recheck is now source-confirmed: giveaway auto-draw no longer trusts only stale cached `is_eligible` flags. The draw path now rechecks candidate winners live against sponsor channels before committing winners, records shortage/truncation transparently in giveaway audit, and keeps the current live-pass docs aligned with that stricter giveaway integrity contract.
- STEP103 giveaway join-after-ended hardening is now source-confirmed: participant join/recheck/reminder flows gate on the real giveaway lifecycle instead of trusting only stale status text, so a past-deadline or already-finished giveaway cannot accept fresh joins or rechecks even before cron flips the final status.
- STEP104 giveaway draw locking is now source-confirmed: the cron draw path now takes a giveaway-scoped advisory lock before the final live recheck/winner commit sequence, skips duplicate draw attempts with an explicit `draw_locked` audit reason, and the due-to-end worker now includes live `ACTIVE` giveaways in its end sweep.
- STEP105 workspace delete verification is now source-confirmed at the render/policy layer: delete preview/completion copy now comes from shared helpers, so repo checks can exercise the actual delete-impact output instead of only grepping for literal strings.
- STEP106 giveaway public render hardening is now source-confirmed: published airdrop/giveaway posts, reminder posts, and results posts now render reward text through the same public-surface redaction boundary used elsewhere, preventing contact-like prize text from leaking raw handles or Telegram links on public giveaway surfaces.
- STEP107 giveaway render verification is now source-confirmed: repo checks now exercise fixture-based giveaway publish/results/reminder rendering, token-symbol backward compatibility, and crypto-copy surfaces instead of relying only on grep-like string presence checks.
- STEP108 curator invite accept path is now source-confirmed: `/start cur_<ws>_<token>` invites are no longer a dead deep-link. The bot now validates the invite token, requires an active curator-enabled workspace, adds the current user as curator, audits the acceptance, and surfaces an explicit invalid/expired-owner-denied outcome when the link is not usable.

Current source-confirmed market baseline still includes the additive STEP038 catalog-v2 rollout: language + audience-fit signals are live without widening the hot-path query model beyond that controlled pass.

## Current live-confirmed state

Latest historical target-env verification baseline (captured before the later STEP053+ product passes) remains:
- `npm run migrate:status` → **14 applied / 0 pending**;
- `GET /api/health` → **ok=true**;
- `npm run webhook:set` → production webhook already installed at `/api/webhook`;
- `npm run verify:live` → **green**;
- `npm run drill:live -- --read-only` → **green**;
- `BETA_COHORT_START_AT` is set to `2026-03-16T00:00:00Z`;
- operator status is **ready**;
- launch blockers / warnings are currently empty.

STEP053 introduced additive migration `015_support_threads.sql`. STEP066 adds additive migration `016_workspace_profile_v2.sql` for optional workspace-profile depth fields, STEP067 adds additive migration `017_barter_offer_rate_range.sql` for optional offer economics, STEP069 adds additive migration `018_workspace_archive.sql` for archive-state tracking on workspaces, STEP119 adds additive migration `019_giveaway_token_symbol.sql`, STEP124 aligns additive migration `020_giveaway_reward_kind.sql`, and STEP133 adds additive migration `021_operator_notes.sql` for operator-only notes/tags storage. STEP070 is a code-only safety hardening pass on top of that archive baseline: it tightens hard-delete gating and active-workspace semantics without adding a new migration. STEP071, STEP072, STEP075, STEP076, STEP077, STEP082, STEP083, and STEP084 are also code-only hardening passes: STEP071 moves active workspace limits into the DB mutation layer, STEP072 adds narrow stale-state guards to high-risk mutating callbacks, STEP075 hardens Admin payment navigation so the operator back path no longer depends only on Redis nav context, STEP076 adds narrow operator-side idempotency for support replies plus a stricter closed-ticket reply policy, STEP077 adds short-TTL moderator-action guards to verification/report moderation buttons, STEP082 moves offer bump cooldown truth into the DB mutation itself, STEP083 adds a fail-fast advisory lock on the intro credit-spend path so duplicate taps surface a busy message instead of waiting under contention, and STEP084 tightens Redis-degraded webhook handling by fail-closing an explicit high-risk mutation set (plus Telegram payment updates) during dedupe bypass while leaving lower-risk navigation/read traffic available. STEP078 is a repo-local release-gate pack: release docs, preflight, and the live checklist are aligned, but no fresh target-env migration or webhook verification could be executed here because live env secrets were not available in the workspace. The baseline therefore remains source-confirmed rather than freshly live-confirmed until the exact target-env commands are run against the real deployment. STEP089 through STEP097 stay in that same category: they strengthen repo-side verification and integrity, but they do not replace the still-pending real STEP088 target-env pass.

One historical Telegram webhook `last_error_message` still reports an older `500 Internal Server Error`, but in the current freeze it is treated as a stale historical record, not an active blocker, because health + webhook parity + pending updates were green on the STEP052 baseline.

## Remaining manual live checks

The scripted live parity pass does **not** replace these checks:
- one strict payment happy-path;
- one orphaned-admin-apply drill;
- one target-env admin-pay navigation fallback pass for STEP075 (`This user` → search → cancel/back with Redis nav unavailable or cleared);
- one target-env UX/support pass for STEP055/STEP076 (support card readability, user-profile open button, branded user-facing replies, close-ticket notice, reply-to-card loop, duplicate-reply guard, and closed-ticket reply policy);
- one target-env creator-market + conversion pass for STEP056/STEP057/STEP063/STEP067 (reordered market home, explicit publish-step copy, final-step back/cancel, visible active filters in Feed header, one-line Open Intro explanation, short Deal Room stage hints, HTML-safe post-publish success screen, success-screen action routing, and the new rate/economics step);
- one target-env public author-visibility pass for STEP058/STEP059 (Feed `By {compact display name}` policy, public detail masked handle, and Deal Room full identity/contact).

STEP068 captured the exact target-env economics checklist as a docs-only pass pack. In this workspace the repo-local checks were green, while live checks stayed blocked/skipped because `DATABASE_URL`, `BOT_TOKEN`, `APP_BASE_URL`, and `WEBHOOK_SECRET_TOKEN` were not present.

If a real mismatch appears during one of those checks, the next move becomes a narrow hotfix.
If they are clean or not currently exercisable in production, do **not** invent a new hardening patch.

## Must not break

- webhook secret validation;
- cron secret validation;
- idempotent payment ledger;
- `ORPHANED -> APPLYING -> APPLIED / ERROR` admin path;
- intro credits / anti-spam guards;
- Deal Room stages;
- proof screenshot / proof link flow;
- verification gating;
- hot UI DB-read discipline.

## Current release discipline

Before treating a repo snapshot as release-ready:
1. `npm run preflight`
2. `npm run migrate:status`
3. `npm run migrate` until pending = 0
4. `GET /api/health` (fast path)
5. `GET /api/health?full=1` when payment counters / beta review details are needed
6. `npm run webhook:set`
7. `npm run webhook:info`
8. `npm run verify:live`
9. `npm run drill:live` (or `-- --read-only`)
10. then finish the manual payment/admin checks if they are safely exercisable

## Current next micro-step

There is **no forced default runtime step** after this snapshot.

Current truth:
- recorded automated target-env verification is still green only through the STEP124 live baseline in `docs/98_STEP088_TARGET_ENV_PASS.md`;
- the current repo/runtime baseline in this snapshot is source-confirmed **through STEP154H2 + STEP154J**;
- the older `STEP143 manual payment closure` narrative is still a separate live/manual gate, but it is **not** the default next repo task anymore.

Default next move from this snapshot should be only one of:
- a narrow live-driven hotfix from a concrete target-env finding;
- a bounded conversion / monetization polish step after fresh live verification;
- work in the **separate admin UI repo** if that codebase is what is actually being edited.

Do not restart from STEP153-era assumptions and do not treat stale handoff/freeze docs as stronger truth than the current code snapshot.

## STEP058 — author visibility policy

Public discovery surfaces no longer show the full creator `@handle`. Feed and matching results show the public display name/channel title, public offer detail shows display name plus masked handle, and Deal Room keeps full handle + direct contact.

## STEP059 — feed author line polish

Public discovery cards now use a cleaner crypto-market author line:
- Feed / matching show `By {compact display name}` instead of `Creator:`;
- long public display names are compacted with a clean ellipsis instead of aggressive masking;
- verified creators add a low-noise `· verified` badge on public discovery lines;
- public detail keeps full display name plus masked handle, while Deal Room still keeps full handle + direct contact.


## STEP060

Docs/process canon sync only. No runtime code or schema change landed in this step; the purpose was to realign README / current-state / handoff / start-prompt / audit-freeze / launch-readiness around the actual STEP059 source baseline and the still-open manual live checks.


## STEP064 — paid multi-channel baseline

Source baseline now keeps the creator-side model simple: one user can connect **1 channel on Free** and **up to 3 channels on PRO**. The channel surfaces now expose a small Telegram-native control panel (`Current Channel`, `Switch Channel`, `Add Channel`) and only show the PRO paywall when a free user tries to add the second channel.

## STEP065 — trust facts upgrade

Explainable public trust now extends to crypto discovery/list surfaces in a compact form. Feed and matching rows can render `Verified`, `closed`, and `proof history` as a short secondary trust line sourced from visible facts only, while public detail, Deal Room, and verification continue to carry the fuller explanatory trust copy.


## STEP066 — KOL profile v2

Workspace profile depth is now additive and explainable. The creator-side profile editor can store `chain / ecosystem`, `language`, `audience`, and `formats` next to the existing title/topics/contact/region fields. Public offer detail and Deal Room can show the same creator-profile snapshot when present, while Feed and matching remain compact and keep their STEP065 trust-first density.



## STEP073 — Redis degradation / idempotency hardening

High-risk mutation guards now fail closed when Redis is unavailable instead of silently bypassing abuse protection. Intro opening, proof submission, reports, verification, and admin payment actions surface a clear temporary-system-error response rather than pretending the action succeeded or silently disabling throttling during Upstash degradation.

Webhook handling also adds best-effort `update_id` dedupe through Redis NX+EX before `bot.handleUpdate()`. Duplicate Telegram retries now short-circuit with `200 { ok: true, duplicate: true }` when Redis is reachable, while safe read/navigation paths remain available if dedupe itself is bypassed during Redis degradation.


## STEP074 — docs + automation tightening

Release docs now explicitly describe the STEP073 runtime contract instead of leaving Redis degradation and duplicate-webhook handling implicit. Launch readiness and release protocol both point to the same live pass checklist, and preflight now enforces that these docs stay aligned through a dedicated `smoke:release-gate` check.

## STEP069 — workspace archive lifecycle + admin system hotfix

Channel management is now a real lifecycle instead of just a network toggle. Owners can still switch `Public Network` on/off for a connected channel, but settings also offer `Disconnect / Archive`, which removes the channel from the active list, turns the network flag off, and pauses active offers while keeping the workspace recoverable. Archived channels live in a separate archive surface with `Restore` and `Delete forever`; restore respects the active-plan slot limit, while hard delete permanently removes the archived workspace and its cascading data.

The same step also fixes the live admin regression where the Admin System/operator parity screen referenced `supportRouting` without defining it first. The screen now derives support-routing status explicitly before rendering, so the webhook no longer throws `ReferenceError: supportRouting is not defined` when the admin system surface is opened.


## STEP099 update
- STEP098: workspace delete integrity review hardened the archived hard-delete path with an advisory-lock + delete-impact snapshot + cascade preview in the confirm screen.
- STEP099: giveaway polish refreshed crypto-mode giveaway copy on owner/public result surfaces and added repo-side smoke coverage for delete-impact + crypto giveaway copy.


## STEP100 update
- STEP100: giveaways/airdrops now support an optional `token_symbol` field through the crypto wizard without breaking older giveaway rows.
- STEP100: the optional token ticker is persisted in DB, rendered on draft preview, owner/public/results surfaces, and included in the owner auto-draw preview.
- STEP100: repo-side smoke now verifies migration + wizard skip path + reward rendering for `token_symbol`.

## STEP101–STEP102 update
- STEP101: crypto-mode giveaway wording is now unified around `Airdrop / Reward / Winners / Snapshot / Eligibility / Results` across draft, owner, participant, reminder, stats, log and results surfaces.
- STEP102: the crypto airdrop flow now renders shared reward/token lines consistently on owner open and channel-publish surfaces, and public CTA copy now uses `Join airdrop` / `Check eligibility` wording.
- STEP102: repo-side smoke for crypto giveaway copy now covers wizard, draft, stats, log, reminder, publish and owner-preview surfaces.


## STEP103–STEP108 update

- STEP103: giveaway join/recheck/reminder callbacks now gate on the real giveaway lifecycle, so a past-deadline or already-finished giveaway cannot accept fresh participant actions just because cron has not flipped the status yet.
- STEP104: ended giveaway draw now takes a giveaway-scoped advisory lock and due-to-end cron sweep includes ACTIVE giveaways, preventing duplicate final-draw attempts and legacy status drift from skipping auto-end.
- STEP105: workspace delete preview/completion text now comes from shared helpers, so repo checks exercise actual delete-impact rendering instead of only static source grep.
- STEP106: giveaway publish/results/reminder reward text now runs through the same public-surface redaction boundary as other public discovery surfaces.
- STEP107: giveaway render verification is now fixture-based for token_symbol + crypto-copy surfaces.
- STEP108: curator invite `/start cur_<ws>_<token>` now works end-to-end when curator access is enabled.

## STEP110
- Bump/open offer view no longer throws Telegram `message is not modified` on re-render after successful bump.
- `renderBxView()` now uses safe edit/noop handling, so identical post-bump screens do not escalate into OPS webhook_exception noise.

- STEP111 payment invoice hotfix is source-confirmed: Stars invoice send paths now use the grammY-compatible `sendInvoice(chat_id, title, description, payload, currency, prices, other)` signature, with `provider_token` passed via `other`, so invoice payload/currency no longer shift and payment entry points can send Telegram Stars invoices again.

## STEP113 — invoice back editability + intro callback UX

- invoice Back paths for Brand Pass / Project Plan / Matching / Featured now render through `safeEditOrReply(...)` instead of direct `editMessageText(...)`, so callback presses from invoice messages fall back to reply instead of throwing `message can't be edited`;
- `a:bx_msg` no longer answers the callback too early; branch-specific answers are now preserved for insufficient credits / busy / inactive cases, and the paywall path can show a visible alert before opening packs;
- no schema changes; payments logic unchanged; this is a Telegram UI / callback hotfix only.

## STEP114 — giveaway / airdrop owner UX surfacing

- crypto main menu now surfaces `🪙 My Airdrops` for connected-channel owners, pointing to the already-existing giveaway list flow;
- crypto workspace menu now surfaces `➕ New Airdrop` and `🪙 Airdrops`, pointing to the existing channel-scoped giveaway create/list flows;
- no schema changes; no giveaway draw/payments/eligibility logic changes; this is owner-UX surfacing only.


## STEP115–STEP124 update

- STEP115: the airdrop reward-type step is now real — giveaways persist a nullable `reward_kind` field via migration 020, and new crypto airdrops save the normalized reward kind into the published giveaway row instead of leaving it only in draft state.
- STEP116: the crypto airdrop wizard now uses crypto-native reward taxonomy (`Token`, `Stablecoin`, `SOL`, `Stars`, `NFT / WL`, `Other`) and aligns key creation-step copy around reward type / snapshot / partners instead of legacy mixed contest wording.
- STEP117: reward-kind rendering is now normalized across draft preview, owner open, participant/public surfaces, publish/results bodies and owner auto-draw preview; new repo-side smoke covers reward-kind persistence + rendering and existing token/copy surfaces remain backward-compatible when `reward_kind` is null on older giveaways.

- STEP119: audit-response proof pack is now source-confirmed: the single-giveaway auto-draw path is extracted into a shared helper so repo smoke can prove draw-lock single-writer behavior, curator add now rechecks the owner-bound active workspace before insert, workspace-delete integrity smoke now proves key cascade contracts from migrations, and older giveaways remain backward-compatible when `reward_kind` is null.
- STEP120: final giveaway winner selection now derives a fairness-aware bounded scan limit from the configured floor, requested winner count, and pool size, so larger giveaway pools do not truncate at the old fixed 100-candidate ceiling when a wider deterministic recheck is justified.
- STEP121: live-verification tooling now supports a two-phase target-env pass: public-only health verification from just `APP_BASE_URL`, then a full secret-backed migrate/webhook parity pass.
- STEP122: NotebookLM audit-pack refresh is now source-confirmed as a docs/pack-only step: the curated audit zip is explicitly capped at 50 files, includes the current freeze/index docs, and packages the newest giveaway/airdrop integrity, fairness, and live-tooling sources together for external review.
- STEP124: public-only operator tooling is now wired honestly in source and has now been exercised live: `verify:live:public` no longer requires `BOT_TOKEN`, `drill:live:public` no longer runs full-only migrate/webhook steps, `smoke:target-env-pass-pack` guards this contract in preflight, and the target env has now been migrated through `020_giveaway_reward_kind.sql` with automated live parity green.
- STEP125: docs/audit refresh now locks the real status: automated target-env alignment is complete through STEP124, while the final release-gate tail is reduced to the two manual payment checks.
- STEP126: the start-prompt layer now matches the recorded live-pass truth: automated verification is already green through STEP124, and the remaining live gate is only the two manual payment checks.
- STEP127: public offer render now redacts workspace profile v2 free-text through the shared public-surface policy so contact-like fragments in profile fields do not leak on discovery surfaces.
- STEP128: degraded-webhook classification now treats the charge-bearing `a:bx_msg` intro-open callback as explicit high-risk and runtime smoke locks that behavior alongside the older payment/update bypass guards.
- STEP154H1 monetization UX hotfix is source-confirmed: user-facing `Project Plan` ambiguity is collapsed into a single `Brand PRO` story in upgrade surfaces, `Plans / Upgrade` no longer shows both guide and direct-buy buttons side by side, Brand PRO / Intro Credits screens preserve local back context instead of dumping users into the top menu, and plan-related callbacks use safer callback acknowledgements to avoid noisy webhook exceptions on simple navigation.

- STEP154H2 monetization UX polish is source-confirmed: project-side monetization flow is trimmed to `Brand PRO + Intro Credits + Free limits`, Launch templates are renamed/repositioned as a bounded discovery helper, Intro Credits explicitly explain 1 credit = 1 new intro while replies in opened Deal Rooms stay free, Brand PRO purchase is collapsed to a single Max offer in user-facing UI, and feed back-navigation now preserves local return when entered from launch templates.

- STEP184 — menu-flow coherence pass is source-confirmed: main menu copy now separates current-channel work vs buyer-side market vs global airdrops, the My Channels selector uses a radio-style current marker, the channel hub explicitly explains channel-scoped vs global surfaces, and the channel menu now exposes `My Offers` directly next to `Creator Market` without changing payments, Deal Room state, giveaway fairness, or schema.


## STEP188
- Added giveaway End now status guard. Owner UI now hides manual end for non-endable statuses and handler refuses rollback from WINNERS_DRAWN / RESULTS_PUBLISHED back to ENDED.
