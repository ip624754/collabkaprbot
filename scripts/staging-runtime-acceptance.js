#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_POLL_TIMEOUT_MS = 30_000;

function nowIso() { return new Date().toISOString(); }
function asBool(v) { return ['1', 'true', 'yes', 'on'].includes(String(v || '').trim().toLowerCase()); }
function sanitize(value, max = 240) { return String(value ?? '').replace(/[\r\n\t]+/g, ' ').slice(0, max); }

export function normalizeTarget(raw) {
  const u = new URL(String(raw || '').trim());
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname))) {
    throw new Error('target_must_use_https');
  }
  u.pathname = '';
  u.search = '';
  u.hash = '';
  return u.origin;
}

export function assertTargetAck(origin, ack) {
  if (String(ack || '').trim() !== origin) throw new Error('target_ack_mismatch');
}

export function evaluateHealth(health) {
  const failures = [];
  const warnings = [];
  if (!health || typeof health !== 'object') failures.push('health_json_missing');
  if (health?.ok !== true) failures.push('health_ok_not_true');
  if (health?.system_status !== 'GO') failures.push(`system_status_${sanitize(health?.system_status || 'missing', 40)}`);
  if (Array.isArray(health?.no_go_reasons) && health.no_go_reasons.length > 0) failures.push('no_go_reasons_present');
  if (health?.redis?.read_ok !== true) failures.push('redis_read_not_ok');
  if (health?.redis?.write_ok !== true) failures.push('redis_write_not_ok');
  if (health?.payments?.payload_hmac_minlen_ok !== true) failures.push('payments_hmac_not_ok');
  if (health?.payments?.fallback_apply_effective === true) failures.push('payments_fallback_effective');
  if (health?.qstash?.config?.fully_configured !== true) warnings.push('qstash_not_fully_configured');
  const resched = Number(health?.qstash?.reschedule_failed?.today_count || 0);
  const stuck = Number(health?.qstash?.official_publish_stuck?.today_count || 0);
  if (resched > 0) warnings.push(`qstash_reschedule_failed_${resched}`);
  if (stuck > 0) warnings.push(`official_publish_stuck_${stuck}`);
  return { pass: failures.length === 0, failures, warnings };
}

async function fetchBounded(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal, redirect: 'error' });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    return { status: res.status, headers: Object.fromEntries(res.headers.entries()), text: sanitize(text, 500), json };
  } finally {
    clearTimeout(timer);
  }
}

function makeCheck(name, expected, actual, pass, details = {}) {
  return { name, expected, actual, pass: !!pass, details };
}

async function publishSignedQStashPing({ origin, nonce }) {
  const token = String(process.env.QSTASH_TOKEN || '').trim();
  if (!token) throw new Error('qstash_token_missing');
  const { Client } = await import('@upstash/qstash');
  const client = new Client({ token });
  return await client.publishJSON({
    url: `${origin}/api/qstash/ping`,
    body: { nonce, acceptance: 'STEP584' },
    retries: 1,
    headers: { 'Upstash-Deduplication-Id': `step584-${nonce}` },
  });
}

async function pollPingEvidence(origin, nonce, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await fetchBounded(`${origin}/api/health`, {}, DEFAULT_TIMEOUT_MS);
    if (r.status === 200 && r.json?.qstash?.ping?.last_nonce === nonce) return r.json?.qstash?.ping;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return null;
}

export async function runAcceptance(env = process.env) {
  const startedAt = nowIso();
  const origin = normalizeTarget(env.STAGING_BASE_URL);
  assertTargetAck(origin, env.ACCEPTANCE_TARGET_ACK);
  const liveQStash = asBool(env.ACCEPTANCE_QSTASH_PUBLISH);
  const nonce = `step584-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const checks = [];

  const healthResp = await fetchBounded(`${origin}/api/health`);
  const healthEval = evaluateHealth(healthResp.json);
  checks.push(makeCheck('health_http', 200, healthResp.status, healthResp.status === 200));
  checks.push(makeCheck('health_go_no_go', 'GO with core invariants', healthResp.json?.system_status || 'missing', healthEval.pass, {
    failures: healthEval.failures,
    warnings: healthEval.warnings,
  }));

  const webhookGet = await fetchBounded(`${origin}/api/webhook`, { method: 'GET' });
  checks.push(makeCheck('webhook_method_boundary', 405, webhookGet.status, webhookGet.status === 405));

  const webhookUnauthorized = await fetchBounded(`${origin}/api/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ update_id: 0 }),
  });
  checks.push(makeCheck('webhook_auth_negative', 401, webhookUnauthorized.status,
    webhookUnauthorized.status === 401 && webhookUnauthorized.json?.error === 'unauthorized'));

  const qstashUnsigned = await fetchBounded(`${origin}/api/qstash/ping`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nonce }),
  });
  checks.push(makeCheck('qstash_signature_negative', 401, qstashUnsigned.status,
    qstashUnsigned.status === 401 && ['signature_missing', 'invalid_signature'].includes(qstashUnsigned.json?.error)));

  let qstashPublish = { attempted: false, converged: false, message_id: null, evidence: null, error: null };
  if (liveQStash) {
    qstashPublish.attempted = true;
    try {
      const published = await publishSignedQStashPing({ origin, nonce });
      qstashPublish.message_id = sanitize(published?.messageId || published?.message_id || '', 160) || null;
      qstashPublish.evidence = await pollPingEvidence(origin, nonce, Number(env.ACCEPTANCE_POLL_TIMEOUT_MS || DEFAULT_POLL_TIMEOUT_MS));
      qstashPublish.converged = !!qstashPublish.evidence;
      checks.push(makeCheck('qstash_signed_delivery_convergence', `health.qstash.ping.last_nonce=${nonce}`,
        qstashPublish.evidence?.last_nonce || 'not_observed', qstashPublish.converged,
        { message_id: qstashPublish.message_id, last_at: qstashPublish.evidence?.last_at || null }));
    } catch (e) {
      qstashPublish.error = sanitize(e?.message || e, 200);
      checks.push(makeCheck('qstash_signed_delivery_convergence', 'signed delivery observed', qstashPublish.error, false));
    }
  }

  const requiredPass = checks.every((x) => x.pass);
  const report = {
    schema_version: 1,
    step: 'STEP584',
    target: origin,
    started_at: startedAt,
    finished_at: nowIso(),
    mode: liveQStash ? 'staging_with_qstash_delivery' : 'staging_observe_only',
    status: requiredPass ? 'PASS' : 'FAIL',
    truth_boundary: liveQStash
      ? 'Remote staging HTTP boundaries and QStash publish-to-health convergence were exercised. Telegram end-user UX, Neon mutations, payments and production were not exercised.'
      : 'Remote staging read/negative-auth boundaries were exercised. No signed QStash delivery, Telegram end-user UX, Neon mutations, payments or production were exercised.',
    checks,
    qstash_publish: qstashPublish,
    health_snapshot: {
      ok: healthResp.json?.ok ?? null,
      system_status: healthResp.json?.system_status ?? null,
      no_go_reasons: healthResp.json?.no_go_reasons ?? null,
      redis: healthResp.json?.redis ?? null,
      payments: healthResp.json?.payments ?? null,
      qstash: healthResp.json?.qstash ?? null,
    },
  };
  return report;
}

export function renderMarkdown(report) {
  const lines = [
    '# STEP584 Staging Runtime Acceptance Evidence', '',
    `- Target: \`${report.target}\``,
    `- Mode: \`${report.mode}\``,
    `- Started: ${report.started_at}`,
    `- Finished: ${report.finished_at}`,
    `- Status: **${report.status}**`, '',
    '## Checks', '',
    '| Check | Expected | Actual | Result |', '|---|---|---|---|',
    ...report.checks.map((c) => `| ${c.name} | ${sanitize(c.expected, 120)} | ${sanitize(c.actual, 120)} | ${c.pass ? 'PASS' : 'FAIL'} |`),
    '', '## Truth Boundary', '', report.truth_boundary, '',
    '## Operator Decision', '',
    report.status === 'PASS' ? '**Staging acceptance gate passed for the exercised scope.**' : '**NO-GO for promotion until failed checks are resolved and evidence is rerun.**', '',
  ];
  return `${lines.join('\n')}\n`;
}

async function main() {
  const report = await runAcceptance(process.env);
  const outDir = path.resolve(process.env.ACCEPTANCE_OUTPUT_DIR || 'artifacts/runtime_acceptance');
  await fs.mkdir(outDir, { recursive: true });
  const stamp = report.started_at.replace(/[:.]/g, '-');
  const jsonPath = path.join(outDir, `STEP584_${stamp}.json`);
  const mdPath = path.join(outDir, `STEP584_${stamp}.md`);
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(mdPath, renderMarkdown(report), 'utf8');
  console.log(renderMarkdown(report));
  console.log(`Evidence JSON: ${jsonPath}`);
  console.log(`Evidence MD: ${mdPath}`);
  process.exitCode = report.status === 'PASS' ? 0 : 1;
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  main().catch((e) => {
    console.error(`[STEP584] FAIL ${sanitize(e?.message || e, 240)}`);
    process.exitCode = 1;
  });
}
