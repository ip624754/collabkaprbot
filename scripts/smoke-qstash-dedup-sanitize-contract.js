#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const qstashPath = path.join(ROOT, 'src', 'lib', 'qstash.js');
const botPath = path.join(ROOT, 'src', 'bot', 'bot.js');
const adminSystemQStashPath = path.join(ROOT, 'src', 'bot', 'domains', 'adminSystem', 'qstashCallbacks.js');
const qstashSrc = fs.readFileSync(qstashPath, 'utf8');
const botSrc = fs.readFileSync(botPath, 'utf8');
const adminSystemQStashSrc = fs.readFileSync(adminSystemQStashPath, 'utf8');
const qstashCallsiteSrc = botSrc + '\n' + adminSystemQStashSrc;

assert.ok(
  qstashSrc.includes('export function sanitizeQStashDeduplicationId(value) {'),
  'Expected central sanitizeQStashDeduplicationId() helper in src/lib/qstash.js'
);
assert.ok(
  qstashSrc.includes("const dedupHeaderValue = sanitizeQStashDeduplicationId(deduplicationId);"),
  'Expected qstashPublishJSON() to sanitize deduplicationId before publishJSON()'
);
assert.ok(
  qstashSrc.includes("if (dedupHeaderValue) headers['Upstash-Deduplication-Id'] = dedupHeaderValue;"),
  'Expected Upstash-Deduplication-Id header to use sanitized dedup value'
);
assert.ok(
  qstashSrc.includes(".replace(/[^A-Za-z0-9._-]+/g, '-')"),
  'Expected sanitize helper to replace forbidden QStash dedup chars with hyphen'
);
assert.ok(
  qstashSrc.includes(".replace(/-{2,}/g, '-')"),
  'Expected sanitize helper to collapse repeated hyphens'
);
assert.ok(
  qstashSrc.includes(".replace(/^[._-]+|[._-]+$/g, '')"),
  'Expected sanitize helper to trim separator noise from dedup edges'
);
assert.ok(
  qstashCallsiteSrc.includes("deduplicationId: `qping:${nonce}`"),
  'Expected admin signed ping to keep readable raw qping:${nonce} dedup input at call-site'
);
assert.ok(
  qstashCallsiteSrc.includes('Подсказка: это не всегда ENV/signing keys.'),
  'Expected admin signed ping failure helper text to stop blaming only ENV/signing keys'
);

console.log('✅ smoke qstash dedup sanitize contract OK');
