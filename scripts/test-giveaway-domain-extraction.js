import assert from 'node:assert/strict';
import {
  GIVEAWAY_ACTION,
  GIVEAWAY_ACCESS_ACTIONS,
  GIVEAWAY_CRITICAL_CALLBACK_ACTIONS,
  GIVEAWAY_LIFECYCLE_ACTIONS,
  GIVEAWAY_PARTICIPANT_ACTIONS,
  GIVEAWAY_ACCESS_ROUTE_DEFINITION,
  GIVEAWAY_LIFECYCLE_ROUTE_DEFINITION,
  GIVEAWAY_PARTICIPANT_ROUTE_DEFINITION,
  handleGiveawayAccessCallback,
  handleGiveawayLifecycleCallback,
  handleGiveawayParticipantCallback,
  isGiveawayAccessAction,
  isGiveawayCriticalCallbackAction,
  isGiveawayLifecycleAction,
  isGiveawayParticipantAction,
} from '../src/bot/domains/giveaways/index.js';
import {
  CALLBACK_PHASE,
  CALLBACK_ROUTE,
  getCallbackOwnership,
  summarizeCallbackOwnership,
} from '../src/bot/router/callbackOwnership.js';

let assertions = 0;
function check(value, message) {
  assert.ok(value, message);
  assertions += 1;
}
function equal(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}

class FakeInlineKeyboard {
  constructor() { this.buttons = []; }
  text(label, callbackData) { this.buttons.push({ label, callbackData }); return this; }
  row() { this.buttons.push({ row: true }); return this; }
}

function makeCtx(telegramId = 9001) {
  const events = [];
  return {
    from: { id: telegramId },
    api: { marker: 'api' },
    events,
    async answerCallbackQuery(payload) { events.push({ type: 'ack', payload }); },
    async reply(text, options) { events.push({ type: 'reply', text, options }); },
  };
}

function baseGiveaway(overrides = {}) {
  return {
    id: 42,
    workspace_id: 7,
    status: 'ACTIVE',
    winners_drawn_at: null,
    ...overrides,
  };
}

function makeParticipantDeps(overrides = {}) {
  const calls = [];
  const g = overrides.g || baseGiveaway();
  const db = {
    async getGiveawayInfoForUser() { calls.push(['getGiveawayInfoForUser']); return g; },
    async listGiveawaySponsors() { calls.push(['listGiveawaySponsors']); return ['@sponsor']; },
    async getEntryStatus() { calls.push(['getEntryStatus']); return { is_eligible: false }; },
    async upsertGiveawayEntry(...args) { calls.push(['upsertGiveawayEntry', ...args]); },
    async auditGiveaway(...args) { calls.push(['auditGiveaway', ...args]); },
    async setEntryEligibility(...args) { calls.push(['setEntryEligibility', ...args]); },
    ...(overrides.db || {}),
  };
  const deps = {
    db,
    gwEffectiveStatusValue: (row) => String(row?.status || '').toUpperCase(),
    renderParticipantScreen: (_g, _entry, options) => `screen:${JSON.stringify(options)}`,
    participantKb: (_gwId, _entry, options) => ({ options }),
    async safeEditOrReply(ctx, text, options) { ctx.events.push({ type: 'edit', text, options }); },
    async doEligibilityCheck() {
      calls.push(['doEligibilityCheck']);
      return { isEligible: true, unknown: false, results: ['ok'], firstBlocker: null, firstBlockerHandle: null };
    },
    ...overrides,
    db,
  };
  return { deps, calls };
}

function makeLifecycleDeps(overrides = {}) {
  const calls = [];
  const g = overrides.g || baseGiveaway({ status: 'ENDED' });
  const db = {
    async getGiveawayForOwner(...args) { calls.push(['getGiveawayForOwner', ...args]); return g; },
    async atomicEndGiveaway(...args) { calls.push(['atomicEndGiveaway', ...args]); return true; },
    async auditGiveaway(...args) { calls.push(['auditGiveaway', ...args]); },
    async drawAndFinalizeGiveawayWinnersAtomic(...args) {
      calls.push(['drawAtomic', ...args]);
      return {
        status: 'drawn',
        topup_winners: 0,
        winnersUserIds: [10, 11],
        requested_winners: 2,
      };
    },
    ...(overrides.db || {}),
  };
  let lockCounter = 0;
  const deps = {
    InlineKeyboard: FakeInlineKeyboard,
    db,
    answerRecovery: async (ctx, kind) => { calls.push(['answerRecovery', kind]); ctx.events.push({ type: 'recovery', kind }); },
    renderGwOpen: async (...args) => { calls.push(['renderGwOpen', ...args.slice(1)]); },
    renderGwWinnersView: async (...args) => { calls.push(['renderGwWinnersView', ...args.slice(1)]); },
    gwEffectiveStatusValue: (row) => String(row?.status || '').toUpperCase(),
    safeEditOrReply: async (ctx, text, options) => { ctx.events.push({ type: 'edit', text, options }); },
    navKb: (back) => ({ back }),
    notifyGiveawayEnded: async (payload) => { calls.push(['notifyGiveawayEnded', payload.reason]); },
    notifyGiveawayWinnersDM: async (payload) => { calls.push(['notifyGiveawayWinnersDM', payload.gwId]); },
    key: (parts) => parts.join(':'),
    acquireLock: async (...args) => { lockCounter += 1; calls.push(['acquireLock', ...args]); return { token: `lock-${lockCounter}` }; },
    releaseLock: async (...args) => { calls.push(['releaseLock', ...args]); },
    logger: { error(meta, message) { calls.push(['logError', message, meta?.gwId]); } },
    ...overrides,
    db,
  };
  return { deps, calls };
}

// Exact bounded ownership metadata.
equal(GIVEAWAY_ACCESS_ACTIONS.length, 4, 'four access actions');
equal(GIVEAWAY_PARTICIPANT_ACTIONS.length, 2, 'two participant actions');
equal(GIVEAWAY_LIFECYCLE_ACTIONS.length, 5, 'five lifecycle actions');
equal(GIVEAWAY_CRITICAL_CALLBACK_ACTIONS.length, 11, 'eleven critical giveaway callbacks');
equal(new Set(GIVEAWAY_CRITICAL_CALLBACK_ACTIONS).size, 11, 'critical giveaway actions are unique');
check(Object.isFrozen(GIVEAWAY_ACTION), 'action map frozen');
check(Object.isFrozen(GIVEAWAY_CRITICAL_CALLBACK_ACTIONS), 'critical action list frozen');
equal(GIVEAWAY_ACCESS_ROUTE_DEFINITION.id, CALLBACK_ROUTE.GIVEAWAY_ACCESS, 'access route id');
equal(GIVEAWAY_PARTICIPANT_ROUTE_DEFINITION.id, CALLBACK_ROUTE.GIVEAWAY_PARTICIPANT, 'participant route id');
equal(GIVEAWAY_LIFECYCLE_ROUTE_DEFINITION.id, CALLBACK_ROUTE.GIVEAWAY_LIFECYCLE, 'lifecycle route id');
for (const definition of [GIVEAWAY_ACCESS_ROUTE_DEFINITION, GIVEAWAY_PARTICIPANT_ROUTE_DEFINITION, GIVEAWAY_LIFECYCLE_ROUTE_DEFINITION]) {
  equal(definition.phase, CALLBACK_PHASE.POST_USER, `${definition.id} remains post-user`);
}
for (const action of GIVEAWAY_ACCESS_ACTIONS) {
  check(isGiveawayAccessAction(action), `${action} recognized as access`);
  check(isGiveawayCriticalCallbackAction(action), `${action} recognized as critical giveaway`);
  equal(getCallbackOwnership(action)?.routeId, CALLBACK_ROUTE.GIVEAWAY_ACCESS, `${action} access owner`);
}
for (const action of GIVEAWAY_PARTICIPANT_ACTIONS) {
  check(isGiveawayParticipantAction(action), `${action} recognized as participant`);
  check(isGiveawayCriticalCallbackAction(action), `${action} recognized as critical giveaway`);
  equal(getCallbackOwnership(action)?.routeId, CALLBACK_ROUTE.GIVEAWAY_PARTICIPANT, `${action} participant owner`);
}
for (const action of GIVEAWAY_LIFECYCLE_ACTIONS) {
  check(isGiveawayLifecycleAction(action), `${action} recognized as lifecycle`);
  check(isGiveawayCriticalCallbackAction(action), `${action} recognized as critical giveaway`);
  equal(getCallbackOwnership(action)?.routeId, CALLBACK_ROUTE.GIVEAWAY_LIFECYCLE, `${action} lifecycle owner`);
}
check(!isGiveawayCriticalCallbackAction('a:menu'), 'foreign action not captured');
const summary = summarizeCallbackOwnership();
equal(summary.extracted, 369, 'STEP590E5A cumulative extracted owner count');
equal(summary.legacy, 191, 'STEP590E5A cumulative legacy owner count');
equal(summary.byRoute[CALLBACK_ROUTE.GIVEAWAY_ACCESS], 4, 'access owner count');
equal(summary.byRoute[CALLBACK_ROUTE.GIVEAWAY_PARTICIPANT], 2, 'participant owner count');
equal(summary.byRoute[CALLBACK_ROUTE.GIVEAWAY_LIFECYCLE], 5, 'lifecycle owner count');

// Foreign actions are declined without side effects.
{
  const ctx = makeCtx();
  equal(await handleGiveawayAccessCallback(ctx, { a: 'a:menu' }, { id: 3 }, {}), false, 'access declines foreign action');
  equal(await handleGiveawayParticipantCallback(ctx, { a: 'a:menu' }, { id: 3 }, {}), false, 'participant declines foreign action');
  equal(await handleGiveawayLifecycleCallback(ctx, { a: 'a:menu' }, { id: 3 }, {}), false, 'lifecycle declines foreign action');
  equal(ctx.events.length, 0, 'foreign actions produce no UX');
}

// Access family preserves render and prompt contracts.
{
  const calls = [];
  const deps = {
    redis: {},
    db: {},
    safeEditOrReply: async (ctx, text, options) => ctx.events.push({ type: 'edit', text, options }),
    navKb: (back) => ({ back }),
    setExpectText: async (...args) => calls.push(['expect', ...args]),
    renderGwAccess: async (payload) => calls.push(['render', payload]),
  };
  const ctx = makeCtx(100);
  equal(await handleGiveawayAccessCallback(ctx, { a: GIVEAWAY_ACTION.ACCESS, i: '42' }, { id: 7 }, deps), true, 'access handled');
  equal(calls[0][1].forceRecheck, false, 'access does not force recheck');
  equal(calls[0][1].ownerUserId, 7, 'access owner id preserved');
  equal(await handleGiveawayAccessCallback(ctx, { a: GIVEAWAY_ACTION.ACCESS_RECHECK, i: '42' }, { id: 7 }, deps), true, 'recheck handled');
  equal(calls[1][1].forceRecheck, true, 'recheck forces refresh');
  equal(await handleGiveawayAccessCallback(ctx, { a: GIVEAWAY_ACTION.ACCESS_CHECK_ME, i: '42' }, { id: 7 }, deps), true, 'check-me handled');
  equal(calls[2][1].checkUserId, 100, 'check-me uses Telegram actor');
  equal(await handleGiveawayAccessCallback(ctx, { a: GIVEAWAY_ACTION.ACCESS_USER_PROMPT, i: '42' }, { id: 7 }, deps), true, 'user prompt handled');
  equal(calls.at(-1), ['expect', 100, { type: 'gw_access_userid', gwId: 42 }], 'prompt state preserved');
  check(ctx.events.at(-1).text.includes('123456789'), 'neutral synthetic user id example preserved');
}

// Participant join active flow.
{
  const ctx = makeCtx(101);
  const { deps, calls } = makeParticipantDeps();
  equal(await handleGiveawayParticipantCallback(ctx, { a: GIVEAWAY_ACTION.JOIN, i: '42', pub: '1' }, { id: 9 }, deps), true, 'join handled');
  check(calls.some((row) => row[0] === 'upsertGiveawayEntry' && row[1] === 42 && row[2] === 9), 'join upserts exact participant');
  check(calls.some((row) => row[0] === 'auditGiveaway' && row[4] === 'gw.joined'), 'join audit preserved');
  equal(ctx.events.find((event) => event.type === 'ack')?.payload?.text, '🎟 Участие записано', 'join toast preserved');
  check(ctx.events.some((event) => event.type === 'edit'), 'join renders participant screen');
}

// Ended participant flow does not create a new entry.
{
  const ctx = makeCtx(102);
  const { deps, calls } = makeParticipantDeps({ g: baseGiveaway({ status: 'ENDED' }) });
  equal(await handleGiveawayParticipantCallback(ctx, { a: GIVEAWAY_ACTION.JOIN, i: '42' }, { id: 10 }, deps), true, 'ended join consumed');
  check(!calls.some((row) => row[0] === 'upsertGiveawayEntry'), 'ended join creates no entry');
  equal(ctx.events.find((event) => event.type === 'ack')?.payload?.text, 'Конкурс уже завершён.', 'ended toast preserved');
}

// Eligibility check uses Telegram actor and persists result.
{
  const ctx = makeCtx(777);
  let checkedActor = 0;
  const { deps, calls } = makeParticipantDeps({
    doEligibilityCheck: async (_ctx, gwId, actorId) => {
      checkedActor = actorId;
      equal(gwId, 42, 'eligibility receives giveaway id');
      return { isEligible: true, unknown: false, results: ['ok'], firstBlocker: null, firstBlockerHandle: null };
    },
  });
  equal(await handleGiveawayParticipantCallback(ctx, { a: GIVEAWAY_ACTION.CHECK, i: '42', pub: '1' }, { id: 11 }, deps), true, 'check handled');
  equal(checkedActor, 777, 'eligibility uses actual Telegram actor');
  check(calls.some((row) => row[0] === 'setEntryEligibility' && row[3] === true), 'eligibility persisted');
  check(calls.some((row) => row[0] === 'auditGiveaway' && row[4] === 'gw.checked'), 'check audit preserved');
  equal(ctx.events.find((event) => event.type === 'ack')?.payload?.text, '⏳ Проверяю…', 'instant check feedback preserved');
}

// End confirmation and atomic end flows.
{
  const ctx = makeCtx();
  const { deps } = makeLifecycleDeps();
  equal(await handleGiveawayLifecycleCallback(ctx, { a: GIVEAWAY_ACTION.END_NOW, i: '42' }, { id: 12 }, deps), true, 'end confirmation handled');
  const edit = ctx.events.find((event) => event.type === 'edit');
  check(edit?.text.includes('Завершить конкурс'), 'end confirmation copy preserved');
  check(edit?.options?.reply_markup?.buttons.some((button) => button.callbackData === 'a:gw_end_do|i:42'), 'end confirm callback preserved');
}
{
  const ctx = makeCtx();
  const { deps, calls } = makeLifecycleDeps({ g: baseGiveaway({ status: 'ACTIVE' }) });
  equal(await handleGiveawayLifecycleCallback(ctx, { a: GIVEAWAY_ACTION.END_DO, i: '42' }, { id: 13 }, deps), true, 'atomic end handled');
  check(calls.some((row) => row[0] === 'atomicEndGiveaway'), 'atomic end is canonical mutation');
  check(calls.some((row) => row[0] === 'auditGiveaway' && row[4] === 'gw.ended'), 'end audit preserved');
  check(calls.some((row) => row[0] === 'notifyGiveawayEnded'), 'end notification preserved');
  equal(ctx.events.find((event) => event.type === 'ack')?.payload?.text, 'Завершен', 'end toast preserved');
}

// Winners view remains transport-only.
{
  const ctx = makeCtx();
  const { deps, calls } = makeLifecycleDeps();
  equal(await handleGiveawayLifecycleCallback(ctx, { a: GIVEAWAY_ACTION.WINNERS_VIEW, i: '42' }, { id: 14 }, deps), true, 'winners view handled');
  check(calls.some((row) => row[0] === 'renderGwWinnersView' && row[1] === 14 && row[2] === 42), 'winners view receives owner and giveaway');
}

// Draw confirmation protects status transitions.
{
  const ctx = makeCtx();
  const { deps } = makeLifecycleDeps({ g: baseGiveaway({ status: 'ACTIVE' }) });
  equal(await handleGiveawayLifecycleCallback(ctx, { a: GIVEAWAY_ACTION.DRAW_NOW, i: '42' }, { id: 15 }, deps), true, 'active draw confirmation consumed');
  check(ctx.events.find((event) => event.type === 'edit')?.text.includes('Сначала нужно'), 'active giveaway cannot draw');
}
{
  const ctx = makeCtx();
  const { deps } = makeLifecycleDeps({ g: baseGiveaway({ status: 'ENDED' }) });
  equal(await handleGiveawayLifecycleCallback(ctx, { a: GIVEAWAY_ACTION.DRAW_NOW, i: '42' }, { id: 15 }, deps), true, 'ended draw confirmation handled');
  const edit = ctx.events.find((event) => event.type === 'edit');
  check(edit?.text.includes('Выбрать победителей?'), 'draw confirmation copy preserved');
  check(edit?.options?.reply_markup?.buttons.some((button) => button.callbackData === 'a:gw_draw_do|i:42'), 'draw-do callback preserved');
}
{
  const ctx = makeCtx();
  const { deps } = makeLifecycleDeps({ g: baseGiveaway({ status: 'WINNERS_DRAWN', winners_drawn_at: 'now' }) });
  equal(await handleGiveawayLifecycleCallback(ctx, { a: GIVEAWAY_ACTION.DRAW_NOW, i: '42' }, { id: 15 }, deps), true, 'already drawn confirmation consumed');
  check(ctx.events.find((event) => event.type === 'edit')?.text.includes('уже выбраны'), 'already drawn feedback preserved');
}

// Manual draw calls the single atomic DB boundary and releases Redis UX lock.
{
  const ctx = makeCtx();
  const { deps, calls } = makeLifecycleDeps();
  equal(await handleGiveawayLifecycleCallback(ctx, { a: GIVEAWAY_ACTION.DRAW_DO, i: '42' }, { id: 16 }, deps), true, 'manual draw handled');
  const drawCall = calls.find((row) => row[0] === 'drawAtomic');
  check(drawCall, 'atomic draw called exactly through DB boundary');
  equal(drawCall[1], 42, 'atomic draw giveaway id');
  equal(drawCall[2], { expectedWorkspaceId: 7, actorUserId: 16, source: 'manual' }, 'atomic draw context preserved');
  equal(calls.filter((row) => row[0] === 'drawAtomic').length, 1, 'atomic draw called once');
  check(calls.some((row) => row[0] === 'releaseLock'), 'Redis UX lock released');
  check(calls.some((row) => row[0] === 'notifyGiveawayWinnersDM'), 'winner DM notification preserved');
  equal(ctx.events.find((event) => event.type === 'ack')?.payload?.text, 'Победители выбраны ✅', 'draw success toast preserved');
}

// Redis lock contention causes no DB draw.
{
  const ctx = makeCtx();
  const { deps, calls } = makeLifecycleDeps({ acquireLock: async () => null });
  equal(await handleGiveawayLifecycleCallback(ctx, { a: GIVEAWAY_ACTION.DRAW_DO, i: '42' }, { id: 17 }, deps), true, 'lock contention consumed');
  check(!calls.some((row) => row[0] === 'drawAtomic'), 'lock contention performs no draw');
  equal(ctx.events.find((event) => event.type === 'ack')?.payload?.text, 'Секунду… уже выбираю.', 'lock contention toast preserved');
}

// No-entry draw renders bounded recovery and still releases lock.
{
  const ctx = makeCtx();
  const { deps, calls } = makeLifecycleDeps({
    db: {
      async getGiveawayForOwner() { return baseGiveaway({ status: 'ENDED' }); },
      async drawAndFinalizeGiveawayWinnersAtomic() { return { status: 'no_entries' }; },
    },
  });
  equal(await handleGiveawayLifecycleCallback(ctx, { a: GIVEAWAY_ACTION.DRAW_DO, i: '42' }, { id: 18 }, deps), true, 'no-entry draw consumed');
  equal(ctx.events.find((event) => event.type === 'ack')?.payload?.text, 'Нет участников.', 'no-entry toast preserved');
  check(ctx.events.some((event) => event.type === 'edit' && event.text.includes('нет участников')), 'no-entry screen preserved');
  check(calls.some((row) => row[0] === 'releaseLock'), 'no-entry path releases lock');
}

// Missing giveaway fails through classified recovery before side effects.
{
  const ctx = makeCtx();
  const { deps, calls } = makeLifecycleDeps({
    db: { async getGiveawayForOwner() { return null; } },
  });
  equal(await handleGiveawayLifecycleCallback(ctx, { a: GIVEAWAY_ACTION.DRAW_DO, i: '42' }, { id: 19 }, deps), true, 'missing giveaway consumed');
  check(calls.some((row) => row[0] === 'answerRecovery'), 'missing giveaway uses classified recovery');
  check(!calls.some((row) => row[0] === 'acquireLock'), 'missing giveaway acquires no lock');
}

// Unexpected DB status is contained, logged and lock is released.
{
  const ctx = makeCtx();
  const { deps, calls } = makeLifecycleDeps({
    db: {
      async getGiveawayForOwner() { return baseGiveaway({ status: 'ENDED' }); },
      async drawAndFinalizeGiveawayWinnersAtomic() { return { status: 'surprise' }; },
    },
  });
  equal(await handleGiveawayLifecycleCallback(ctx, { a: GIVEAWAY_ACTION.DRAW_DO, i: '42' }, { id: 20 }, deps), true, 'unexpected draw result contained');
  equal(ctx.events.find((event) => event.type === 'ack')?.payload?.text, 'Ошибка выбора.', 'unexpected result final feedback');
  check(calls.some((row) => row[0] === 'logError'), 'unexpected result logged');
  check(calls.some((row) => row[0] === 'releaseLock'), 'unexpected result releases lock');
}

console.log(`PASS STEP590C3 giveaway domain extraction tests (${assertions} assertions)`);
