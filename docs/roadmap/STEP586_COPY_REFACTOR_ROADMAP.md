# STEP586 — Conversation Copy Refactor Roadmap

**Input:** STEP585 source audit and canonical copy system
**Current implementation baseline:** STEP586E on STEP586D
**Roadmap status:** STEP586A–E implemented; STEP586F is next
**Rule:** copy changes may not silently alter callbacks, permissions, prices, reward math, payment semantics or state transitions.

## 1. Goal

Make Collabka speak one clear product language without turning the work into a broad bot rewrite.

The rollout is split by risk and surface. Each wave must be independently reviewable, testable and reversible.

## 2. Global acceptance contract

Every STEP586 wave must satisfy all applicable checks:

- one canonical term per object;
- ordinary users never see infrastructure or schema details;
- button text names the result of the action;
- errors include a safe recovery route when one exists;
- payment/reward copy matches the real mechanism;
- no callback value changes unless explicitly declared;
- no DB schema or state-machine change;
- source smoke updated for every intentional label contract change;
- changed screens receive a bounded manual Telegram smoke after deploy;
- verified facts and live-unverified assumptions stay separated in the handoff.

## 3. Execution order

### STEP586A — Copy Safety & Taxonomy Foundation

**Implementation:** DONE in STEP586A (2026-07-18)
**Report:** `docs/audit/STEP586A_COPY_SAFETY_TAXONOMY_REPORT.md`

**Priority:** P1 / first
**Risk:** medium; user-facing copy in critical and shared paths
**Mode:** STANDARD with security review

Scope:

1. replace ordinary-user migration, Neon, table and ENV leakage with safe product copy;
2. preserve technical detail in logs and admin/operator diagnostics;
3. fix confirmed `офер` spellings to `оффер`;
4. normalize bounded invite terms:
   - `pts / points` → `баллы`;
   - `7 days Pro` → `7 дней PRO`;
   - `30 days Pro` → `30 дней PRO`;
   - `completed profile` → `заполнил основной профиль`;
   - `invite ledger` → `история баллов`;
5. remove bounded `вы/ваш` drift from account/access user screens;
6. add source guards for forbidden infrastructure terms in ordinary-user copy.

Explicitly excluded:

- `Home / Menu` global migration;
- callback renaming;
- invite reward math;
- DB/migration changes;
- payment behavior;
- broad `Нет доступа.` replacement.

Acceptance:

- source scan finds no listed infrastructure term in the targeted user branches;
- exact invite reward wording is Russian and mechanism-honest;
- typo scan finds no active user-facing `офер`;
- callback consistency remains green;
- existing payment, invite and access contracts pass.

**Verified result:** local source guards and targeted invite/callback contracts pass; live Telegram rendering remains unverified.

---

### STEP586B — Home, Menu and Role Navigation Contract

**Implementation:** DONE in STEP586B (2026-07-18)
**Report:** `docs/audit/STEP586B_HOME_MENU_ROLE_NAVIGATION_REPORT.md`

**Priority:** P1
**Risk:** high surface area; many shared footers and tests
**Mode:** HEAVY

Target contract:

- `🏠 Домой` → global role/mode hub (`a:home`);
- `📋 Меню` → current-role menu (`a:menu`);
- role labels: `Креатор`, `Бренд`;
- `канал` remains the managed Telegram object, not a synonym for the creator.

Work:

- inventory all `a:home` and `a:menu` visible labels;
- migrate labels by callback meaning, not by global string replacement;
- replace vague `Продолжить: <роль>` buttons with named outcomes;
- update navigation source smokes and docs/spec contracts;
- verify creator, brand, curator, moderator and admin escape routes.

Acceptance:

- every `a:home` button uses the same visible label;
- every `a:menu` button uses the same visible label;
- no dead end loses both local back and global escape;
- callback values and destinations remain unchanged.

---

### STEP586C — Applications, Dialogs and Deals Lifecycle

**Implementation:** DONE in STEP586C (2026-07-18)
**Report:** `docs/audit/STEP586C_APPLICATIONS_DIALOGS_DEALS_LIFECYCLE_REPORT.md`

**Priority:** P1
**Risk:** medium/high; product taxonomy across multiple flows
**Mode:** HEAVY

Target lifecycle:

```text
Оффер / профиль → Заявка → Диалог → Сделка → Этап / закрытие
```

Work:

- change user-facing `Inbox` to `Диалоги` where the destination is a message thread list;
- distinguish applications from accepted deals;
- remove text that implies a deal exists before acceptance;
- align menu labels, empty states, notifications and done screens;
- keep internal IDs and callbacks unchanged.

Acceptance:

- one object is not called `заявка`, `диалог` and `сделка` on the same state;
- post-action text points to the correct destination;
- creator and brand sides describe the same lifecycle symmetrically.

**Verified result:** canonical source vocabulary and accepted-only deal guards pass locally; callback identities remain unchanged; live Telegram rendering remains unverified.

---

### STEP586D — Invite Center Language and Mechanism Honesty

**Implementation:** DONE in STEP586D (2026-07-18)
**Report:** `docs/audit/STEP586D_INVITE_CENTER_LANGUAGE_MECHANISM_HONESTY_REPORT.md`

**Priority:** P1
**Risk:** high trust surface; incentives and anti-abuse
**Mode:** HEAVY

Work:

- fully localize invite and reward screens;
- explain `приглашён`, `активирован`, `в ожидании`, `доступно`, `использовано`;
- state what does not count: self-invites, existing users and incomplete activation where applicable;
- separate pending points from spendable points;
- keep reward thresholds, ledger and anti-abuse rules unchanged;
- align history, stats, reward center, confirm and success screens.

Acceptance:

- no `join`, `pts`, `completed profile`, `invite ledger`, `Pro-target` or mixed `days Pro` remains in ordinary-user invite screens;
- every reward claim matches source mechanics;
- redeem confirmation shows cost, result and remaining balance;
- source smoke guards the vocabulary and mechanism contract.

---

### STEP586E — Monetization and Paid Product Clarity

**Implementation:** DONE in STEP586E (2026-07-18)
**Report:** `docs/audit/STEP586E_MONETIZATION_PAID_PRODUCT_CLARITY_REPORT.md`

**Priority:** P1/P2
**Risk:** critical trust surface
**Mode:** HEAVY

Canonical distinction:

- `Brand Plan` — subscription/access;
- `кредиты` — spendable units;
- `PRO` — creator tier;
- `Умный подбор` — feature;
- `Продвижение` — placement/visibility feature.

Work:

- map every payment and paywall screen to the canonical product name;
- state exact amount, currency, result and refund/retry boundary where applicable;
- remove ambiguous `Brand Pass`, `Featured`, `Smart Matching` mixtures from primary Russian UX;
- preserve payment provider and ledger behavior.

Acceptance:

- the user can tell what they buy and what they receive before confirmation;
- subscription and spendable units are never described as the same object;
- payment success/failure copy points to the correct next action;
- no amount or entitlement statement differs from runtime configuration.

**Verified result:** local payment/source contracts pass; visible quantities and durations derive from runtime catalogs; provider, prices and payment semantics are unchanged; live Stars behavior remains unverified.

---

### STEP586F — Access, Error and Empty-State Recovery

**Priority:** P2
**Risk:** medium
**Mode:** STANDARD

Work:

- classify generic access failures into:
  - stale object;
  - permission changed;
  - missing setup;
  - temporary service issue;
  - operator configuration issue;
- replace `Нет доступа.` only where the source can identify the class safely;
- add recovery buttons without bypassing permission checks;
- normalize empty-state structure: reason + next action.

Acceptance:

- no blind global replacement;
- every changed error remains truthful under all reachable states;
- recovery buttons lead only to already-authorized surfaces;
- destructive errors do not reveal private object existence.

---

### STEP586G — Admin and Operator Vocabulary

**Priority:** P2
**Risk:** low/medium; operational clarity
**Mode:** STANDARD

Work:

- use human-readable primary labels:
  - `Исходящие`;
  - `Личное сообщение`;
  - `Одобрить / Отклонить`;
  - `Журнал розыгрыша`;
- retain precise terms such as Redis, QStash, Neon and callback IDs inside diagnostic bodies where useful;
- separate status, diagnosis and operator action;
- align Telegram admin and web-admin terminology where they represent the same object.

Acceptance:

- the primary action is readable without internal shorthand;
- diagnostic precision is not lost;
- no operator control changes behavior.

---

### STEP586H — Live Telegram Acceptance and Mobile Copy Pass

**Priority:** release gate after the previous waves
**Risk:** observational
**Mode:** HEAVY acceptance

Run on preview/staging first.

Required manual paths:

- new user and role selection;
- creator menu, offer, applications, dialogs and deals;
- brand menu, search/catalog, applications, dialogs and deal acceptance;
- invite center, history and redeem confirmation without final spend unless a test account is approved;
- one paid-product/paywall path without unintended purchase;
- one stale/error path;
- admin/operator spot-check.

Evidence:

- screenshots or message transcripts for changed screens;
- target deployment and timestamp;
- expected vs actual labels;
- mobile wrapping defects;
- PASS / FAIL / BLOCKED per path;
- no live-green claim without evidence.

## 4. Work that should not be combined

Do not merge these into one broad patch:

- global Home/Menu migration and monetization copy;
- invite vocabulary and reward mechanic changes;
- access-message rewrite and permission logic;
- admin terminology and admin redesign;
- copy refactor and `bot.js` architecture extraction.

The language work should reduce risk, not hide architectural changes inside strings.

## 5. Current next action

Proceed with **STEP586F — Access, Error and Empty-State Recovery**.

Classify each failure from authoritative state. Do not use a global string replacement, do not weaken permission checks and do not reveal whether a private object exists.
