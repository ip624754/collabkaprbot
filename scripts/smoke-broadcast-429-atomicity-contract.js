#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readBroadcastDeliveryImplementationSource } from './lib/broadcast-delivery-source-reader.js';

const qstashSrc = readBroadcastDeliveryImplementationSource();

assert.ok(/redis\.call\('SADD'/.test(qstashSrc), '429 distinct-user accounting must use atomic Lua SADD');
assert.ok(/redis\.call\('EXPIRE'/.test(qstashSrc), '429 distinct-user accounting must set TTL in the same Lua script');
assert.ok(/return redis\.call\('SCARD'/.test(qstashSrc), '429 distinct-user accounting must return SCARD atomically');
assert.ok(/const n = await redis\.eval\(lua, \[key\], \[String\(userId\), String\(ttlSec\)\]\);/.test(qstashSrc), 'broadcast delivery must execute the bounded atomic Lua script');
assert.ok(!/await redis\.sadd\(key, String\(userId\)\);\s*await redis\.expire\(key, ttlSec\);/s.test(qstashSrc), 'broadcast delivery must not use split SADD/EXPIRE calls');

console.log('✅ broadcast 429 atomicity contract OK');
