import assert from 'node:assert/strict';
import fs from 'node:fs';

const bot = fs.readFileSync(new URL('../src/bot/bot.js', import.meta.url), 'utf8');
const cron = fs.readFileSync(new URL('../src/bot/cron.js', import.meta.url), 'utf8');
const queries = fs.readFileSync(new URL('../src/db/queries.js', import.meta.url), 'utf8');
const core = fs.readFileSync(new URL('../src/db/giveawayAtomicCore.js', import.meta.url), 'utf8');

assert.match(bot, /drawAndFinalizeGiveawayWinnersAtomic\(gwId,\s*\{[\s\S]*?source:\s*'manual'/);
assert.doesNotMatch(bot, /db\.setWinners\s*\(/);
assert.doesNotMatch(bot, /makeXorShift32|sampleWithoutReplacement|GW_DRAW_ALGO_VERSION_JS/);

assert.match(cron, /drawAndFinalizeGiveawayWinnersAtomic\(g\.id,\s*\{[\s\S]*?source:\s*'cron'/);
assert.match(queries, /return drawAndFinalizeGiveawayWinnersAtomicCore\s*\(/);
assert.match(queries, /replaceGiveawaySponsorsAtomicCore\s*\(/);

assert.match(core, /BEGIN ISOLATION LEVEL REPEATABLE READ/);
assert.match(core, /pg_try_advisory_xact_lock/);
assert.match(core, /is_eligible = TRUE/);
assert.match(core, /is_eligible = FALSE/);
assert.match(core, /unnest\(\$2::bigint\[\]\) WITH ORDINALITY/);
assert.match(core, /actor_user_id, action, payload/);
assert.match(core, /same_transaction_as_draw:\s*true/);
assert.match(core, /action:\s*'gw\.winners_drawn'/);
assert.match(core, /GW_DRAW_ALGO_VERSION_SQL/);
assert.match(core, /GW_WINNERS_HASH_METHOD_SQL/);

console.log('✅ Giveaway single atomic path source contract PASS');
