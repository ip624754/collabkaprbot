import { register } from 'node:module';

const loaderSource = `
const stubs = new Map([
  ['dotenv/config', 'export {};'],
  ['@upstash/redis', \`export class Redis { constructor(){} async get(){return null} async set(){return 'OK'} async del(){return 0} async incr(){return 1} async expire(){return 1} async eval(){return 0} async lpush(){return 1} async ltrim(){return 'OK'} async mget(){return []} async ping(){return 'PONG'} async call(){return 0} }\`],
  ['grammy', \`class Chain { constructor(){ return new Proxy(this,{get:(t,p)=>p in t?t[p]:(...a)=>t}); } text(){return this} row(){return this} url(){return this} webApp(){return this} switchInlineCurrent(){return this} } export class InlineKeyboard extends Chain{} export class Bot extends Chain{ constructor(){super();this.api=new Chain()} use(){return this} catch(){return this} command(){return this} on(){return this} callbackQuery(){return this} } export class InputFile{}\`],
  ['pino', \`const logger={trace(){},debug(){},info(){},warn(){},error(){},fatal(){},child(){return logger}}; function pino(){return logger}; pino.stdTimeFunctions={isoTime(){return ''}}; export default pino;\`],
  ['pg', \`class Pool { constructor(){} on(){return this} async connect(){return {query:async()=>({rows:[],rowCount:0}),release(){}}} async query(){return {rows:[],rowCount:0}} async end(){} } export default {Pool};\`],
]);
export async function resolve(specifier, context, nextResolve) {
  if (stubs.has(specifier)) return { url: 'step590g3-stub:' + encodeURIComponent(specifier), shortCircuit: true };
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  if (url.startsWith('step590g3-stub:')) {
    const key = decodeURIComponent(url.slice('step590g3-stub:'.length));
    return { format: 'module', source: stubs.get(key), shortCircuit: true };
  }
  return nextLoad(url, context);
}`;

register(`data:text/javascript,${encodeURIComponent(loaderSource)}`, import.meta.url);
process.env.APP_ENV = process.env.APP_ENV || 'test';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.BOT_TOKEN = process.env.BOT_TOKEN || '000000:test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost/test';
process.env.UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL || 'https://example.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || 'test';

const routes = [
  ['monetization-retry', '../api/qstash/monetization-retry.js'],
  ['official-publish-deliver', '../api/qstash/official-publish-deliver.js'],
  ['official-publish-verify', '../api/qstash/official-publish-verify.js'],
  ['ping', '../api/qstash/ping.js'],
];
for (const [name, rel] of routes) {
  const mod = await import(new URL(`${rel}?step590g3=${Date.now()}-${name}`, import.meta.url).href);
  if (typeof mod.default !== 'function') throw new Error(`${name}: default export is not callable`);
  if (mod.config?.api?.bodyParser !== false) throw new Error(`${name}: raw-body config linkage drift`);
  const result = { status: null, body: null };
  const res = {
    status(code) { result.status = code; return this; },
    end(body) { result.body = body; return this; },
    json(body) { result.body = body; return this; },
    setHeader() {},
  };
  await mod.default({ method: 'GET', headers: {} }, res);
  if (result.status !== 405 || result.body !== 'Method Not Allowed') {
    throw new Error(`${name}: method guard drift: ${result.status} ${String(result.body)}`);
  }
  if (name === 'ping') {
    if (typeof mod.__setQStashPingDepsForTests !== 'function' || typeof mod.__resetQStashPingDepsForTests !== 'function') {
      throw new Error('ping test seam export drift');
    }
  }
}
console.log('✅ STEP590G3 real ESM route graphs OK (4/4 config + handler + 405 guard)');
