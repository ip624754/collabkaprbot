import assert from 'node:assert/strict';
import {
  MODERATION_REPORT_ACTIONS,
  MODERATION_VERIFICATION_ACTIONS,
} from '../src/bot/domains/moderation/actions.js';
import { handleModerationReportsCallback } from '../src/bot/domains/moderation/reportsCallbacks.js';
import { handleModerationVerificationCallback } from '../src/bot/domains/moderation/verificationCallbacks.js';
import {
  isModerationCallbackAction,
  isModerationReportAction,
  isModerationVerificationAction,
} from '../src/bot/domains/moderation/policy.js';
import {
  CALLBACK_PHASE,
  CALLBACK_ROUTE,
  getCallbackOwnership,
  summarizeCallbackOwnership,
} from '../src/bot/router/callbackOwnership.js';

let assertions = 0;
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };
const check = (value, message) => { assert.ok(value, message); assertions += 1; };

class InlineKeyboard {
  text() { return this; }
  row() { return this; }
}

function makeCtx() {
  const calls = [];
  return {
    calls,
    from: { id: 1001, username: 'moderator' },
    state: { cid: 'e5a-test' },
    answerCallbackQuery: async (payload) => { calls.push(['ack', payload]); },
    api: {
      sendMessage: async (...args) => { calls.push(['sendMessage', ...args]); return { message_id: 9001 }; },
    },
  };
}

function makeDeps({ moderator = true, verificationEnabled = true } = {}) {
  const calls = [];
  const db = {
    calls,
    getBarterReport: async (...args) => {
      calls.push(['getBarterReport', ...args]);
      return { id: 9, offer_id: 81, thread_id: 82 };
    },
    moderatorFreezeBarterOffer: async (...args) => { calls.push(['moderatorFreezeBarterOffer', ...args]); return true; },
    auditBarterOffer: async (...args) => { calls.push(['auditBarterOffer', ...args]); return true; },
    moderatorCloseBarterThread: async (...args) => { calls.push(['moderatorCloseBarterThread', ...args]); return true; },
    auditBarterThread: async (...args) => { calls.push(['auditBarterThread', ...args]); return true; },
    resolveBarterReport: async (...args) => { calls.push(['resolveBarterReport', ...args]); return true; },
    setVerificationStatus: async (...args) => { calls.push(['setVerificationStatus', ...args]); return true; },
    getUserById: async (...args) => { calls.push(['getUserById', ...args]); return { id: 77, tg_id: 7777 }; },
  };
  const call = async (...args) => { calls.push(['call', ...args]); return null; };
  return {
    calls,
    CFG: { VERIFICATION_ENABLED: verificationEnabled },
    InlineKeyboard,
    db,
    isModerator: async (...args) => { calls.push(['isModerator', ...args]); return moderator; },
    renderModHome: call,
    renderModReportView: call,
    renderModReports: call,
    renderModVerifView: call,
    renderModVerifs: call,
    safeEditOrReply: call,
    safeUserVerifications: async (primary, fallback) => {
      calls.push(['safeUserVerifications']);
      try { return await primary(); } catch { return fallback(); }
    },
    setExpectText: call,
  };
}

const user = { id: 55 };
const payload = (action) => ({ a: action, rid: 9, uid: 77, p: 0 });

equal(MODERATION_REPORT_ACTIONS.length, 6, 'moderation report action count');
equal(MODERATION_VERIFICATION_ACTIONS.length, 4, 'moderation verification action count');
equal(new Set([...MODERATION_REPORT_ACTIONS, ...MODERATION_VERIFICATION_ACTIONS]).size, 10, 'STEP590E5A actions unique');

for (const action of MODERATION_REPORT_ACTIONS) {
  check(isModerationReportAction(action), `${action} report predicate`);
  check(isModerationCallbackAction(action), `${action} aggregate predicate`);
  equal(getCallbackOwnership(action).routeId, CALLBACK_ROUTE.MODERATION_REPORTS, `${action} owner`);
  equal(getCallbackOwnership(action).phase, CALLBACK_PHASE.POST_USER, `${action} phase`);
  equal(await handleModerationReportsCallback(makeCtx(), payload(action), user, makeDeps()), true, `${action} executable handler`);
}

for (const action of MODERATION_VERIFICATION_ACTIONS) {
  check(isModerationVerificationAction(action), `${action} verification predicate`);
  check(isModerationCallbackAction(action), `${action} aggregate predicate`);
  equal(getCallbackOwnership(action).routeId, CALLBACK_ROUTE.MODERATION_VERIFICATION, `${action} owner`);
  equal(getCallbackOwnership(action).phase, CALLBACK_PHASE.POST_USER, `${action} phase`);
  equal(await handleModerationVerificationCallback(makeCtx(), payload(action), user, makeDeps()), true, `${action} executable handler`);
}

equal(await handleModerationReportsCallback(makeCtx(), { a: 'a:mod_verifs' }, user, makeDeps()), false, 'reports handler rejects verification action');
equal(await handleModerationVerificationCallback(makeCtx(), { a: 'a:mod_home' }, user, makeDeps()), false, 'verification handler rejects reports action');
equal(await handleModerationReportsCallback(makeCtx(), { a: 'a:admin_mod_add' }, user, makeDeps()), false, 'moderation handlers reject admin moderator governance');

await assert.rejects(
  () => handleModerationReportsCallback(makeCtx(), { a: 'a:mod_home' }, user, {}),
  /moderation_domain\.missing_dependency:/
);
assertions += 1;
await assert.rejects(
  () => handleModerationVerificationCallback(makeCtx(), { a: 'a:mod_verifs' }, user, {}),
  /moderation_domain\.missing_dependency:/
);
assertions += 1;

{
  const deps = makeDeps({ moderator: false });
  equal(await handleModerationReportsCallback(makeCtx(), payload('a:mod_r_freeze'), user, deps), true, 'unauthorized report mutation handled safely');
  equal(deps.db.calls.filter(([name]) => name === 'moderatorFreezeBarterOffer').length, 0, 'unauthorized actor cannot freeze offer');
}
{
  const deps = makeDeps({ moderator: false });
  equal(await handleModerationVerificationCallback(makeCtx(), payload('a:mod_verif_approve'), user, deps), true, 'unauthorized verification mutation handled safely');
  equal(deps.db.calls.filter(([name]) => name === 'setVerificationStatus').length, 0, 'unauthorized actor cannot approve verification');
}
{
  const deps = makeDeps();
  equal(await handleModerationReportsCallback(makeCtx(), { a: 'a:mod_r_resolve', rid: 'bad' }, user, deps), true, 'malformed report ID handled');
  equal(deps.db.calls.filter(([name]) => name === 'resolveBarterReport').length, 0, 'malformed report ID cannot mutate DB');
}
{
  const deps = makeDeps();
  equal(await handleModerationVerificationCallback(makeCtx(), { a: 'a:mod_verif_approve', uid: 0 }, user, deps), true, 'malformed verification ID handled');
  equal(deps.db.calls.filter(([name]) => name === 'setVerificationStatus').length, 0, 'malformed verification ID cannot mutate DB');
}
{
  const deps = makeDeps();
  const ctx = makeCtx();
  equal(await handleModerationReportsCallback(ctx, payload('a:mod_r_freeze'), user, deps), true, 'freeze path handled');
  equal(deps.db.calls.filter(([name]) => name === 'moderatorFreezeBarterOffer').length, 1, 'offer frozen exactly once');
  equal(deps.db.calls.filter(([name]) => name === 'auditBarterOffer').length, 1, 'offer freeze audited exactly once');
}
{
  const deps = makeDeps();
  equal(await handleModerationReportsCallback(makeCtx(), payload('a:mod_r_close'), user, deps), true, 'thread close path handled');
  equal(deps.db.calls.filter(([name]) => name === 'moderatorCloseBarterThread').length, 1, 'thread closed exactly once');
  equal(deps.db.calls.filter(([name]) => name === 'auditBarterThread').length, 1, 'thread close audited exactly once');
}
{
  const deps = makeDeps();
  const ctx = makeCtx();
  equal(await handleModerationVerificationCallback(ctx, payload('a:mod_verif_approve'), user, deps), true, 'verification approval handled');
  equal(deps.db.calls.filter(([name]) => name === 'setVerificationStatus').length, 1, 'verification approved exactly once');
  check(ctx.calls.some(([name]) => name === 'sendMessage'), 'approval notification attempted');
}
{
  const deps = makeDeps({ verificationEnabled: false });
  equal(await handleModerationVerificationCallback(makeCtx(), payload('a:mod_verif_approve'), user, deps), true, 'disabled verification handled');
  equal(deps.db.calls.filter(([name]) => name === 'setVerificationStatus').length, 0, 'disabled verification cannot mutate DB');
}

const summary = summarizeCallbackOwnership();
equal(summary.extracted, 433, 'STEP590E5C cumulative extracted ownership');
equal(summary.legacy, 127, 'STEP590E5C cumulative legacy ownership');
equal(summary.byRoute[CALLBACK_ROUTE.MODERATION_REPORTS], 6, 'moderation reports route count');
equal(summary.byRoute[CALLBACK_ROUTE.MODERATION_VERIFICATION], 4, 'moderation verification route count');
equal(getCallbackOwnership('a:admin_mod_add').routeId, CALLBACK_ROUTE.ADMIN_MODERATOR_GOVERNANCE, 'admin moderator governance extracted by STEP590E5B');
equal(getCallbackOwnership('a:admin_mod_list').routeId, CALLBACK_ROUTE.ADMIN_MODERATOR_GOVERNANCE, 'admin moderator list extracted by STEP590E5B');
equal(getCallbackOwnership('a:admin_mod_rm').routeId, CALLBACK_ROUTE.ADMIN_MODERATOR_GOVERNANCE, 'admin moderator removal extracted by STEP590E5B');

console.log(`PASS STEP590E5A moderation reports/verification extraction tests (${assertions} assertions)`);
