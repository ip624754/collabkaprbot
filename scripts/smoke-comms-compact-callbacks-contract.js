import { parseCb } from '../src/bot/helpers.js';
import { commsCb } from '../src/bot/commsCallbacks.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const aud = parseCb(commsCb.bcAudienceSet('creators'));
assert(aud.a === 'a:bc_audience', 'aud action mismatch');
assert(aud.aud === 'creators', 'aud decode mismatch');

const preset = parseCb(commsCb.bcSimpleBtnPreset('offers'));
assert(preset.a === 'a:bc_simple_btn_preset', 'preset action mismatch');
assert(preset.k === 'offers', 'preset decode mismatch');

const blocked = parseCb(commsCb.bcBlocked(42, 'hard', 3));
assert(blocked.a === 'a:bc_blocked', 'blocked action mismatch');
assert(String(blocked.id) === '42', 'blocked id mismatch');
assert(blocked.t === 'hard', 'blocked kind decode mismatch');
assert(String(blocked.p) === '3', 'blocked page mismatch');

const callbacks = [
  commsCb.bcAudienceSet('managers'),
  commsCb.bcSimpleBtnPreset('landing'),
  commsCb.bcBlocked(999999, 'all', 99),
  commsCb.adminOutboxView(123, 9),
  commsCb.adminNoticePublish(),
];
for (const cb of callbacks) {
  assert(Buffer.byteLength(String(cb), 'utf8') < 64, `callback too long: ${cb}`);
}

console.log('ok: comms compact callback canon');
