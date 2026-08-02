import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expected = [
  'auditFlushTick',
  'broadcastTick',
  'extractRetryAfterSec',
  'getBroadcastCooldownUntilMs',
  'getBroadcastHardSkipReason',
  'giveawaysTick',
  'igVerifyTick',
  'logBroadcastHardSkipHit',
  'normalizeBroadcastDeadChatReason',
  'sendBroadcastMessage',
  'setBroadcastCooldown',
  'setBroadcastHardSkip',
].sort();

const loaderSource = `
const stubs = new Map([
  ['dotenv/config', 'export {};'],
  ['@upstash/redis', \`export class Redis { constructor(){} async get(){return null} async set(){return 'OK'} async del(){return 0} async incr(){return 1} async expire(){return 1} async eval(){return null} async lpush(){return 1} async ltrim(){return 'OK'} async mget(){return []} async ping(){return 'PONG'} }\`],
  ['grammy', \`class Chain { constructor(){ return new Proxy(this,{get:(t,p)=>p in t?t[p]:(...a)=>t}); } text(){return this} row(){return this} url(){return this} webApp(){return this} switchInlineCurrent(){return this} } export class InlineKeyboard extends Chain{} export class Bot extends Chain{ constructor(){super();this.api=new Chain()} use(){return this} catch(){return this} command(){return this} on(){return this} callbackQuery(){return this} } export class InputFile{}\`],
  ['pino', \`const logger={trace(){},debug(){},info(){},warn(){},error(){},fatal(){},child(){return logger}}; function pino(){return logger}; pino.stdTimeFunctions={isoTime(){return ''}}; export default pino;\`],
  ['pg', \`class Pool { constructor(){} on(){return this} async connect(){return {query:async()=>({rows:[],rowCount:0}),release(){}}} async query(){return {rows:[],rowCount:0}} async end(){} } export default {Pool};\`],
]);
export async function resolve(specifier, context, nextResolve) {
  if (stubs.has(specifier)) return { url: 'step590g1-stub:' + encodeURIComponent(specifier), shortCircuit: true };
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  if (url.startsWith('step590g1-stub:')) {
    const key = decodeURIComponent(url.slice('step590g1-stub:'.length));
    return { format: 'module', source: stubs.get(key), shortCircuit: true };
  }
  return nextLoad(url, context);
}`;

register(`data:text/javascript,${encodeURIComponent(loaderSource)}`, import.meta.url);
process.env.APP_ENV = process.env.APP_ENV || 'test';
process.env.BOT_TOKEN = process.env.BOT_TOKEN || '000000:test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost/test';
process.env.UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL || 'https://example.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || 'test';

const moduleUrl = new URL(`../src/bot/cron.js?step590g1=${Date.now()}`, import.meta.url);
const mod = await import(moduleUrl.href);
const actual = Object.keys(mod).sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(`real ESM graph exports mismatch: ${actual.join(', ')}`);
}
for (const name of expected) {
  if (typeof mod[name] !== 'function') throw new Error(`real ESM graph export is not callable: ${name}`);
}

const router = fs.readFileSync(path.join(ROOT, 'api/cron_router.js'), 'utf8');
if (!router.includes("import { broadcastTick, giveawaysTick, igVerifyTick, auditFlushTick } from '../src/bot/cron.js';")) {
  throw new Error('cron router named-import linkage drift');
}

console.log('✅ STEP590G1 real ESM module graph load OK (12/12 exports)');
