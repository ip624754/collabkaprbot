#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const DEFAULT_OUT_DIR = 'artifacts/telegram_acceptance';
const RESULT_VALUES = new Set(['NOT_RUN', 'PASS', 'FAIL', 'BLOCKED']);
const MOBILE_CHECK_VALUES = new Set(['NOT_RUN', 'PASS', 'FAIL', 'BLOCKED']);

export const ACCEPTANCE_PATHS = Object.freeze([
  {
    id: 'new_user_role_selection',
    title: 'Новый пользователь и выбор роли',
    expected_labels: ['🏠 Домой', '📋 Меню', '🤳 Режим креатора', '🏷 Режим бренда'],
    safety: 'Use a fresh or reset test account. Do not reuse a production user whose role state matters.',
  },
  {
    id: 'creator_lifecycle',
    title: 'Креатор: меню, оффер, заявки, диалоги и сделки',
    expected_labels: ['🎬 UGC / Офферы', '📨 Мои заявки', '💬 Диалоги', '🤝 Сделки'],
    safety: 'Use test content. Do not expose real contact data in screenshots or transcripts.',
  },
  {
    id: 'brand_lifecycle',
    title: 'Бренд: каталог, заявки, диалоги и принятие сделки',
    expected_labels: ['🏷 Каталог брендов', '📨 Заявки', '💬 Диалоги', '🤝 Сделки'],
    safety: 'Use an approved test application. Confirm no unintended credit charge before acceptance.',
  },
  {
    id: 'invite_center',
    title: 'Приглашения: центр, история и подтверждение награды',
    expected_labels: ['📨 Приглашения', '📄 История', '💎 Баллы', '✅ Получить награду'],
    safety: 'Do not finalize point spend unless the test account and spend are explicitly approved.',
  },
  {
    id: 'paid_product_guard',
    title: 'Платный продукт или paywall без случайной покупки',
    expected_labels: ['Brand Plan', 'PRO канала', 'Кредиты'],
    safety: 'Open the paywall and invoice boundary. Do not approve a Stars purchase unless explicitly authorized.',
  },
  {
    id: 'stale_error_recovery',
    title: 'Устаревшая кнопка, ошибка или пустое состояние',
    expected_labels: ['⬅️ Назад', '📋 Меню', '🏠 Домой'],
    safety: 'Use a known stale test message or non-sensitive missing object. Do not probe private object IDs.',
  },
  {
    id: 'admin_operator',
    title: 'Администратор или оператор: точечная проверка',
    expected_labels: ['Коммуникации', 'Исходящие', 'Журнал аудита'],
    safety: 'Read-only spot-check by default. Do not launch broadcasts, approve payments or mutate users.',
  },
]);

function nowIso() { return new Date().toISOString(); }
function sanitize(value, max = 500) { return String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max); }

export function normalizeDeployment(raw) {
  const u = new URL(String(raw || '').trim());
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname))) {
    throw new Error('deployment_must_use_https');
  }
  u.pathname = '';
  u.search = '';
  u.hash = '';
  return u.origin;
}

export function normalizeBotUsername(raw) {
  const value = String(raw || '').trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '').split(/[/?#]/)[0];
  if (!/^[A-Za-z0-9_]{5,32}$/.test(value)) throw new Error('invalid_bot_username');
  return `@${value}`;
}

export function expectedTargetAck(deployment, botUsername) {
  return `${deployment}|${botUsername}`;
}

export function assertTargetAck(deployment, botUsername, ack) {
  const expected = expectedTargetAck(deployment, botUsername);
  if (String(ack || '').trim() !== expected) throw new Error('target_ack_mismatch');
  return expected;
}

function emptyMobileCheck() {
  return {
    button_wrapping: 'NOT_RUN',
    message_density: 'NOT_RUN',
    navigation_clarity: 'NOT_RUN',
  };
}

export function createEvidenceTemplate({ deployment, botUsername, commit = '', operator = '' }) {
  const startedAt = nowIso();
  return {
    schema_version: 1,
    step: 'STEP586H',
    target: {
      deployment: normalizeDeployment(deployment),
      bot_username: normalizeBotUsername(botUsername),
      commit: sanitize(commit, 120) || null,
    },
    operator: sanitize(operator, 120) || null,
    started_at: startedAt,
    finished_at: null,
    status: 'NOT_RUN',
    truth_boundary: 'This file is a manual Telegram acceptance record. PASS requires captured evidence for every required path. Source checks alone cannot make it green.',
    safety: {
      test_purchase_approved: false,
      invite_spend_approved: false,
      real_broadcast_approved: false,
    },
    paths: ACCEPTANCE_PATHS.map((item) => ({
      id: item.id,
      title: item.title,
      expected_labels: [...item.expected_labels],
      safety: item.safety,
      result: 'NOT_RUN',
      actual_labels: [],
      evidence: [],
      mobile_check: emptyMobileCheck(),
      purchase_attempted: false,
      invite_spend_attempted: false,
      notes: '',
    })),
    defects: [],
    decision: '',
  };
}

function collectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, out);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) collectStrings(item, out);
  return out;
}

export function findSecretMarkers(value) {
  const patterns = [
    { code: 'telegram_bot_token', re: /\b\d{7,12}:[A-Za-z0-9_-]{30,}\b/ },
    { code: 'qstash_token', re: /\bqstash_[A-Za-z0-9_-]{20,}\b/i },
    { code: 'database_url', re: /postgres(?:ql)?:\/\/[^\s"']+/i },
    { code: 'bearer_token', re: /\bBearer\s+[A-Za-z0-9._-]{20,}\b/i },
  ];
  const hits = [];
  for (const text of collectStrings(value)) {
    for (const pattern of patterns) if (pattern.re.test(text)) hits.push(pattern.code);
  }
  return [...new Set(hits)];
}

function validateEvidenceItem(item) {
  if (!item || typeof item !== 'object') return false;
  if (!['screenshot', 'transcript'].includes(String(item.type || ''))) return false;
  if (!String(item.ref || '').trim()) return false;
  return true;
}

export function evaluateEvidence(input) {
  const report = structuredClone(input || {});
  const errors = [];
  const warnings = [];

  if (report?.step !== 'STEP586H') errors.push('step_mismatch');
  try { report.target.deployment = normalizeDeployment(report?.target?.deployment); } catch { errors.push('invalid_deployment'); }
  try { report.target.bot_username = normalizeBotUsername(report?.target?.bot_username); } catch { errors.push('invalid_bot_username'); }

  const secretMarkers = findSecretMarkers(report);
  if (secretMarkers.length) errors.push(`secret_markers:${secretMarkers.join(',')}`);

  const pathsById = new Map((Array.isArray(report.paths) ? report.paths : []).map((item) => [String(item?.id || ''), item]));
  for (const spec of ACCEPTANCE_PATHS) {
    const item = pathsById.get(spec.id);
    if (!item) {
      errors.push(`missing_path:${spec.id}`);
      continue;
    }
    if (!RESULT_VALUES.has(String(item.result || ''))) errors.push(`invalid_result:${spec.id}`);
    if (!Array.isArray(item.actual_labels)) errors.push(`actual_labels_not_array:${spec.id}`);
    if (!Array.isArray(item.evidence)) errors.push(`evidence_not_array:${spec.id}`);

    if (item.result === 'PASS') {
      if (!item.actual_labels?.some((x) => String(x || '').trim())) errors.push(`pass_without_actual_labels:${spec.id}`);
      if (!item.evidence?.some(validateEvidenceItem)) errors.push(`pass_without_evidence:${spec.id}`);
      for (const key of ['button_wrapping', 'message_density', 'navigation_clarity']) {
        const value = String(item.mobile_check?.[key] || '');
        if (!MOBILE_CHECK_VALUES.has(value)) errors.push(`invalid_mobile_check:${spec.id}:${key}`);
        else if (value !== 'PASS') errors.push(`pass_with_mobile_check_${value.toLowerCase()}:${spec.id}:${key}`);
      }
    }

    if (spec.id === 'paid_product_guard' && item.purchase_attempted === true && report?.safety?.test_purchase_approved !== true) {
      errors.push('unapproved_purchase_attempt');
    }
    if (spec.id === 'invite_center' && item.invite_spend_attempted === true && report?.safety?.invite_spend_approved !== true) {
      errors.push('unapproved_invite_spend');
    }
    if (spec.id === 'admin_operator' && report?.safety?.real_broadcast_approved !== true && /broadcast_sent|рассылка запущена/i.test(String(item.notes || ''))) {
      errors.push('unapproved_real_broadcast');
    }
  }

  const pathResults = ACCEPTANCE_PATHS.map((spec) => String(pathsById.get(spec.id)?.result || 'NOT_RUN'));
  let status = 'PASS';
  if (errors.length || pathResults.includes('FAIL')) status = 'FAIL';
  else if (pathResults.some((value) => value === 'NOT_RUN' || value === 'BLOCKED')) status = 'BLOCKED';

  if (status === 'PASS' && pathResults.some((value) => value !== 'PASS')) {
    status = 'FAIL';
    errors.push('pass_without_all_paths');
  }
  if (!report.target?.commit) warnings.push('commit_not_recorded');
  if (!report.operator) warnings.push('operator_not_recorded');

  report.finished_at = report.finished_at || nowIso();
  report.status = status;
  report.validation = { errors, warnings };
  report.decision = status === 'PASS'
    ? 'GO for the copy/navigation scope exercised in this evidence pack.'
    : status === 'FAIL'
      ? 'NO-GO until failed checks or evidence defects are fixed and the pack is rerun.'
      : 'BLOCKED: required live Telegram paths are incomplete or unavailable.';
  return report;
}

export function renderMarkdown(report) {
  const lines = [
    '# STEP586H Live Telegram Acceptance Evidence', '',
    `- Deployment: \`${sanitize(report?.target?.deployment, 180)}\``,
    `- Bot: \`${sanitize(report?.target?.bot_username, 80)}\``,
    `- Commit: \`${sanitize(report?.target?.commit || 'not recorded', 120)}\``,
    `- Operator: ${sanitize(report?.operator || 'not recorded', 120)}`,
    `- Started: ${sanitize(report?.started_at, 80)}`,
    `- Finished: ${sanitize(report?.finished_at, 80)}`,
    `- Status: **${sanitize(report?.status, 20)}**`, '',
    '## Required paths', '',
    '| Path | Result | Evidence | Mobile |',
    '|---|---|---:|---|',
  ];

  for (const item of report.paths || []) {
    const mobile = ['button_wrapping', 'message_density', 'navigation_clarity']
      .map((key) => `${key}=${item.mobile_check?.[key] || 'NOT_RUN'}`).join('; ');
    lines.push(`| ${sanitize(item.title, 120)} | ${sanitize(item.result, 20)} | ${Array.isArray(item.evidence) ? item.evidence.length : 0} | ${sanitize(mobile, 180)} |`);
  }

  lines.push('', '## Validation', '');
  const errors = report?.validation?.errors || [];
  const warnings = report?.validation?.warnings || [];
  lines.push(`- Errors: ${errors.length ? errors.map((x) => `\`${sanitize(x, 120)}\``).join(', ') : 'none'}`);
  lines.push(`- Warnings: ${warnings.length ? warnings.map((x) => `\`${sanitize(x, 120)}\``).join(', ') : 'none'}`);
  lines.push('', '## Defects', '');
  if (Array.isArray(report.defects) && report.defects.length) {
    for (const defect of report.defects) lines.push(`- ${sanitize(defect?.severity || 'P2', 12)} · ${sanitize(defect?.path_id || 'unknown', 60)} · ${sanitize(defect?.summary || defect, 260)}`);
  } else {
    lines.push('- None recorded.');
  }
  lines.push('', '## Decision', '', sanitize(report.decision, 500), '', '## Truth Boundary', '', sanitize(report.truth_boundary, 700), '');
  return `${lines.join('\n')}\n`;
}

async function initCommand(env) {
  const deployment = normalizeDeployment(env.TELEGRAM_ACCEPTANCE_DEPLOYMENT_URL);
  const botUsername = normalizeBotUsername(env.TELEGRAM_ACCEPTANCE_BOT_USERNAME);
  assertTargetAck(deployment, botUsername, env.TELEGRAM_ACCEPTANCE_TARGET_ACK);
  const report = createEvidenceTemplate({
    deployment,
    botUsername,
    commit: env.TELEGRAM_ACCEPTANCE_COMMIT || '',
    operator: env.TELEGRAM_ACCEPTANCE_OPERATOR || '',
  });
  const outDir = path.resolve(env.TELEGRAM_ACCEPTANCE_OUTPUT_DIR || DEFAULT_OUT_DIR);
  await fs.mkdir(outDir, { recursive: true });
  const stamp = report.started_at.replace(/[:.]/g, '-');
  const out = path.join(outDir, `STEP586H_${stamp}.json`);
  await fs.writeFile(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`[STEP586H] Evidence template: ${out}`);
  console.log('[STEP586H] Fill every path, attach screenshot/transcript references, then run:');
  console.log(`npm run acceptance:telegram-mobile -- finalize ${out}`);
}

async function finalizeCommand(filePath) {
  if (!filePath) throw new Error('evidence_file_required');
  const abs = path.resolve(filePath);
  const source = JSON.parse(await fs.readFile(abs, 'utf8'));
  const report = evaluateEvidence(source);
  await fs.writeFile(abs, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const mdPath = abs.replace(/\.json$/i, '.md');
  await fs.writeFile(mdPath, renderMarkdown(report), 'utf8');
  console.log(renderMarkdown(report));
  console.log(`[STEP586H] Evidence JSON: ${abs}`);
  console.log(`[STEP586H] Evidence MD: ${mdPath}`);
  process.exitCode = report.status === 'PASS' ? 0 : 1;
}

async function main() {
  const command = String(process.argv[2] || '').trim().toLowerCase();
  if (command === 'init') return initCommand(process.env);
  if (command === 'finalize') return finalizeCommand(process.argv[3]);
  throw new Error('usage: npm run acceptance:telegram-mobile -- init | finalize <evidence.json>');
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === self) {
  main().catch((error) => {
    console.error(`[STEP586H] FAIL ${sanitize(error?.message || error, 240)}`);
    process.exitCode = 1;
  });
}
