#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  ACCEPTANCE_PATHS,
  assertTargetAck,
  createEvidenceTemplate,
  evaluateEvidence,
  expectedTargetAck,
  findSecretMarkers,
  normalizeBotUsername,
  normalizeDeployment,
  renderMarkdown,
} from './telegram-mobile-acceptance.js';
import { auditStaticTelegramButtons, MOBILE_BUTTON_HARD_MAX } from './telegram-mobile-copy-audit.js';

assert.equal(normalizeDeployment('https://preview.example.test/path?q=1'), 'https://preview.example.test');
assert.throws(() => normalizeDeployment('http://preview.example.test'), /deployment_must_use_https/);
assert.equal(normalizeBotUsername('https://t.me/collabkaprbot?start=x'), '@collabkaprbot');
assert.equal(expectedTargetAck('https://preview.example.test', '@collabkaprbot'), 'https://preview.example.test|@collabkaprbot');
assert.doesNotThrow(() => assertTargetAck('https://preview.example.test', '@collabkaprbot', 'https://preview.example.test|@collabkaprbot'));
assert.throws(() => assertTargetAck('https://preview.example.test', '@collabkaprbot', 'wrong'), /target_ack_mismatch/);

const template = createEvidenceTemplate({
  deployment: 'https://preview.example.test',
  botUsername: '@collabkaprbot',
  commit: 'abc123',
  operator: 'qa-operator',
});
assert.equal(template.paths.length, ACCEPTANCE_PATHS.length);
assert.deepEqual(template.paths.map((x) => x.id), ACCEPTANCE_PATHS.map((x) => x.id));
assert.equal(evaluateEvidence(template).status, 'BLOCKED', 'Untouched manual template cannot become PASS');

const complete = structuredClone(template);
complete.paths = complete.paths.map((item) => ({
  ...item,
  result: 'PASS',
  actual_labels: [...item.expected_labels],
  evidence: [{ type: 'screenshot', ref: `evidence/${item.id}.png`, captured_at: new Date().toISOString() }],
  mobile_check: { button_wrapping: 'PASS', message_density: 'PASS', navigation_clarity: 'PASS' },
}));
const pass = evaluateEvidence(complete);
assert.equal(pass.status, 'PASS');
assert.equal(pass.validation.errors.length, 0);
assert.match(renderMarkdown(pass), /Status: \*\*PASS\*\*/);

const noEvidence = structuredClone(complete);
noEvidence.paths[0].evidence = [];
const noEvidenceReport = evaluateEvidence(noEvidence);
assert.equal(noEvidenceReport.status, 'FAIL');
assert.ok(noEvidenceReport.validation.errors.includes(`pass_without_evidence:${noEvidence.paths[0].id}`));

const unsafePurchase = structuredClone(complete);
unsafePurchase.paths.find((x) => x.id === 'paid_product_guard').purchase_attempted = true;
const unsafePurchaseReport = evaluateEvidence(unsafePurchase);
assert.equal(unsafePurchaseReport.status, 'FAIL');
assert.ok(unsafePurchaseReport.validation.errors.includes('unapproved_purchase_attempt'));

assert.deepEqual(findSecretMarkers({ note: '123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmno' }), ['telegram_bot_token']);
assert.deepEqual(findSecretMarkers({ note: 'safe evidence path' }), []);

const mobileAudit = auditStaticTelegramButtons();
assert.equal(mobileAudit.hard_violations.length, 0,
  `Static Telegram button labels must stay <= ${MOBILE_BUTTON_HARD_MAX} chars: ${JSON.stringify(mobileAudit.hard_violations)}`);

console.log('[STEP586H] Telegram live acceptance and mobile copy contract PASS');
