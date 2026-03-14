#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const redisSrc = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'redis.js'), 'utf8');
const qstashSrc = fs.readFileSync(path.join(ROOT, 'api', 'qstash', 'broadcast-deliver.js'), 'utf8');

assert.ok(redisSrc.includes('export async function saddCardWithExpire('), 'redis helper saddCardWithExpire must exist');
assert.ok(/redis\.call\('SADD'/.test(redisSrc), 'saddCardWithExpire must use Lua SADD');
assert.ok(/redis\.call\('EXPIRE'/.test(redisSrc), 'saddCardWithExpire must use Lua EXPIRE');
assert.ok(/return redis\.call\('SCARD'/.test(redisSrc), 'saddCardWithExpire must return SCARD from Lua');

assert.ok(qstashSrc.includes('saddCardWithExpire'), 'broadcast deliver must import/use saddCardWithExpire');
assert.ok(/const n = await saddCardWithExpire\(key, String\(userId\), ttlSec\);/.test(qstashSrc), 'broadcast deliver must use atomic helper for 429 distinct users');
assert.ok(!/await redis\.sadd\(key, String\(userId\)\);\s*await redis\.expire\(key, ttlSec\);/s.test(qstashSrc), 'broadcast deliver must not use raw redis.sadd + redis.expire sequence');

console.log('✅ broadcast 429 atomicity contract OK');
