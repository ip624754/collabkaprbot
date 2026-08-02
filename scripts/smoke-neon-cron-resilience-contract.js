import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCronImplementationSource } from './lib/cron-source-reader.js';

import { acquireClientWithBoundedRetry } from '../src/db/connectionResilience.js';
import { classifyDbError, annotateDbError } from '../src/db/errorClassification.js';
import { getDbPoolConfigSnapshot } from '../src/db/poolConfig.js';
import {
  buildCronFailureAlert,
  isCronJobFailureHandled,
  reportCronJobFailure,
} from '../src/lib/cronFailure.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function connectTimeoutError() {
  const cause = new Error('Connection terminated unexpectedly');
  cause.code = 'ECONNRESET';
  const err = new Error('Connection terminated due to connection timeout', { cause });
  err.code = 'ETIMEDOUT';
  return err;
}

// Exact Neon pooler shape used by the operator must be recognized without exposing the URL.
const cfg = getDbPoolConfigSnapshot({
  DATABASE_URL: 'postgresql://user:secret@pooler.c-3.us-east-2.aws.neon.tech/neondb?sslmode=verify-full&channel_binding=verify-full',
  PG_POOL_MAX: '1',
  PG_CONN_TIMEOUT_MS: '1000',
  PG_IDLE_TIMEOUT_MS: '5000',
  PG_STATEMENT_TIMEOUT_MS: '15000',
});
assert.equal(cfg.provider, 'neon');
assert.equal(cfg.pooled_url, true);
assert.equal(cfg.pool_max, 1);
assert.equal(cfg.connect_timeout_ms, 1000);
assert.equal(cfg.tls_verify_full, true);
assert.equal(cfg.channel_binding_verify_full, true);
assert.ok(cfg.warnings.includes('database_connect_timeout_aggressive'));
assert.equal(cfg.warnings.includes('database_url_unpooled'), false);
assert.deepEqual(Object.keys(cfg).includes('hostname'), false, 'Health snapshot must not expose DB host');

// First acquisition fails, one retry succeeds.
{
  let connectCalls = 0;
  let prepareCalls = 0;
  let sleepCalls = 0;
  const client = { release() {} };
  const out = await acquireClientWithBoundedRetry({
    connect: async () => {
      connectCalls += 1;
      if (connectCalls === 1) throw connectTimeoutError();
      return client;
    },
    prepare: async () => { prepareCalls += 1; },
    destroy: async () => {},
    policy: { maxRetries: 1, baseDelayMs: 1, jitterMs: 0 },
    sleepFn: async () => { sleepCalls += 1; },
    randomFn: () => 0,
  });
  assert.equal(out, client);
  assert.equal(connectCalls, 2);
  assert.equal(prepareCalls, 1);
  assert.equal(sleepCalls, 1);
}

// Broken client during session init is destroyed before retry.
{
  let connectCalls = 0;
  let prepareCalls = 0;
  let destroyCalls = 0;
  const first = { id: 1 };
  const second = { id: 2 };
  const out = await acquireClientWithBoundedRetry({
    connect: async () => (++connectCalls === 1 ? first : second),
    prepare: async () => {
      prepareCalls += 1;
      if (prepareCalls === 1) throw connectTimeoutError();
    },
    destroy: async (client) => {
      destroyCalls += 1;
      assert.equal(client, first);
    },
    policy: { maxRetries: 1, baseDelayMs: 0, jitterMs: 0 },
    sleepFn: async () => {},
  });
  assert.equal(out, second);
  assert.equal(connectCalls, 2);
  assert.equal(destroyCalls, 1);
}

// At most one retry. Final error carries retry truth.
{
  let connectCalls = 0;
  await assert.rejects(
    acquireClientWithBoundedRetry({
      connect: async () => { connectCalls += 1; throw connectTimeoutError(); },
      policy: { maxRetries: 1, baseDelayMs: 0, jitterMs: 0 },
      sleepFn: async () => {},
    }),
    (err) => {
      assert.equal(err.dbErrorClass, 'pg_connect_timeout');
      assert.equal(err.dbRetryAttempted, true);
      assert.equal(err.dbRetryCount, 1);
      return true;
    }
  );
  assert.equal(connectCalls, 2);
}

// Non-transient setup errors are not retried.
{
  let connectCalls = 0;
  await assert.rejects(
    acquireClientWithBoundedRetry({
      connect: async () => { connectCalls += 1; throw new Error('password authentication failed'); },
      policy: { maxRetries: 1, baseDelayMs: 0, jitterMs: 0 },
      sleepFn: async () => {},
    })
  );
  assert.equal(connectCalls, 1);
}

// Query execution is outside the retry helper: a query failure is never replayed.
{
  let connectCalls = 0;
  let queryCalls = 0;
  const client = {
    async query() {
      queryCalls += 1;
      throw annotateDbError(new Error('relation missing'), { phase: 'query' });
    },
  };
  const acquired = await acquireClientWithBoundedRetry({
    connect: async () => { connectCalls += 1; return client; },
    prepare: async () => {},
    policy: { maxRetries: 1, baseDelayMs: 0, jitterMs: 0 },
  });
  await assert.rejects(acquired.query('select 1'));
  assert.equal(connectCalls, 1);
  assert.equal(queryCalls, 1);
}

assert.equal(classifyDbError(connectTimeoutError(), { phase: 'connect' }), 'pg_connect_timeout');
assert.equal(classifyDbError(Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' })), 'pg_statement_timeout');
assert.equal(classifyDbError(new Error('query failed'), { phase: 'query' }), 'pg_query_failed');
assert.equal(buildCronFailureAlert('ig-verify-tick', new Error('Instagram request failed')).metadata.error_class, 'cron_job_failed');

// One job exception owns one alert; router can detect and suppress its duplicate.
{
  const err = connectTimeoutError();
  annotateDbError(err, { phase: 'connect', retryAttempted: true, retryCount: 1 });
  const order = [];
  const queued = [];
  const alert = await reportCronJobFailure({
    job: 'broadcast-tick',
    error: err,
    beforeQueue: async () => { order.push('breadcrumb'); },
    queueAlert: async (value) => { order.push('alert'); queued.push(value); },
  });
  assert.deepEqual(order, ['breadcrumb', 'alert']);
  assert.equal(queued.length, 1);
  assert.equal(isCronJobFailureHandled(err), true);
  assert.equal(alert.metadata.error_class, 'pg_connect_timeout');
  assert.equal(alert.metadata.retry_count, 1);
  assert.equal(alert.dedupId, 'cron_failed:broadcast-tick:pg_connect_timeout');

  const other = buildCronFailureAlert('giveaways-tick', err);
  assert.notEqual(other.dedupId, alert.dedupId, 'Concurrent jobs must not deduplicate each other');
}

// Source-boundary guards: retry only wraps acquisition/session init, not user SQL.
const poolSource = read('src/db/pool.js');
assert.ok(poolSource.includes('acquireClientWithBoundedRetry({'));
assert.ok(poolSource.includes('connect: async () => await _originalConnect()'));
assert.ok(poolSource.includes('prepare: async (client) =>'));
assert.ok(poolSource.includes('return await client.query(text, params);'));
assert.equal(poolSource.includes('acquireClientWithBoundedRetry({\n    connect: async () => await client.query'), false);
assert.ok(poolSource.includes('client.release(true)'));
assert.ok(poolSource.includes('client.release(destroyClient)'));

const cronSource = readCronImplementationSource(ROOT);
assert.ok(cronSource.includes("recordCronTickFailure('giveaways_tick', 'giveaways-tick', e)"));
assert.ok(cronSource.includes("recordCronTickFailure('broadcast_tick', 'broadcast-tick', e)"));
assert.ok(cronSource.includes("status: 'error'"));

const routerSource = read('api/cron_router.js');
assert.ok(routerSource.includes('if (!isCronJobFailureHandled(e))'));
assert.ok(routerSource.includes("duplicate alert suppressed"));

const opsSource = read('src/bot/opsAlerts.js');
assert.ok(opsSource.includes('dedupId = null'));
assert.ok(opsSource.includes('const dId = dedupId ||'));

const healthSource = read('api/health.js');
assert.ok(healthSource.includes('getDbPoolConfigSnapshot(process.env)'));
assert.ok(healthSource.includes('system_warnings: [...database.warnings]'));

console.log('✅ STEP586H1 Neon cron connection resilience and alert truth contract OK');
