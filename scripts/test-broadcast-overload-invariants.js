import { readBroadcastDeliveryImplementationSource } from './lib/broadcast-delivery-source-reader.js';

function fail(msg) {
  // eslint-disable-next-line no-console
  console.error(`[broadcast-overload-invariants] FAIL: ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  // eslint-disable-next-line no-console
  console.log(`[broadcast-overload-invariants] OK: ${msg}`);
}

const src = readBroadcastDeliveryImplementationSource();

// 1) Must set Retry-After headers via helper
if (!src.includes('function setQStashRetryAfterHeaders')) {
  fail('Missing helper function setQStashRetryAfterHeaders');
} else {
  const hasStd = /setHeader\(['"]Retry-After['"]/.test(src);
  const hasUpstash = /setHeader\(['"]Upstash-Retry-After['"]/.test(src);
  if (!hasStd) fail("setQStashRetryAfterHeaders must set 'Retry-After' header");
  if (!hasUpstash) fail("setQStashRetryAfterHeaders must set 'Upstash-Retry-After' header");
  if (hasStd && hasUpstash) ok('Retry-After headers are set');
}

function extractBetween(startNeedle, endNeedle) {
  const a = src.indexOf(startNeedle);
  if (a < 0) return null;
  const b = endNeedle ? src.indexOf(endNeedle, a + startNeedle.length) : -1;
  return b >= 0 ? src.slice(a, b) : src.slice(a);
}

function checkResponder(fnName, startNeedle, endNeedle) {
  const block = extractBetween(startNeedle, endNeedle);
  if (!block) {
    fail(`Missing ${fnName} function block`);
    return;
  }

  if (!/setQStashRetryAfterHeaders\(res\s*,\s*sec\)/.test(block)) {
    fail(`${fnName} must call setQStashRetryAfterHeaders(res, sec)`);
  }

  const idxHdr = block.search(/setQStashRetryAfterHeaders\(res\s*,\s*sec\)/);
  const idx429 = block.search(/res\.status\(429\)\.json\(/);
  if (idx429 < 0) {
    fail(`${fnName} must respond with res.status(429).json(...)`);
  } else if (idxHdr >= 0 && idx429 >= 0 && idx429 < idxHdr) {
    fail(`${fnName} must set Retry-After headers before responding 429`);
  }

  if (!/randIntInclusive\(\s*0\s*,\s*jitterMax\s*\)/.test(block)) {
    fail(`${fnName} must compute jitter via randIntInclusive(0, jitterMax)`);
  }

  // Ensure payload includes invariant fields used by ops debugging
  if (!/retry_after_sec\s*:/.test(block)) fail(`${fnName} response must include retry_after_sec`);
  if (!/jitter_sec\s*:/.test(block)) fail(`${fnName} response must include jitter_sec`);
  if (!/base_backoff_sec\s*:/.test(block)) fail(`${fnName} response must include base_backoff_sec`);

  ok(`${fnName} invariants present`);
}

checkResponder(
  'respondDbOverload',
  'export async function respondDbOverload',
  'export async function respondDbOverloadFuse'
);

checkResponder('respondDbOverloadFuse', 'export async function respondDbOverloadFuse', null);

if (process.exitCode) process.exit(process.exitCode);
// eslint-disable-next-line no-console
console.log('✅ broadcast overload invariants OK');
