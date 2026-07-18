#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export const MOBILE_BUTTON_PREFERRED_MAX = 28;
export const MOBILE_BUTTON_HARD_MAX = 34;

const BOUNDED_PLACEHOLDERS = Object.freeze({
  left: '999',
  page: '999',
  count: '9999',
  total: '9999',
  stars: '99999',
  id: '999999',
  days: '999',
  duration: '999',
  status: 'Статус',
});

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else if (entry.isFile()) out.push(abs);
  }
  return out;
}

function decodeLiteral(raw, quote) {
  if (quote === '`') return raw.replace(/\\`/g, '`').replace(/\\n/g, '\n');
  try {
    return JSON.parse(`${quote}${raw}${quote}`);
  } catch {
    return raw.replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\"/g, '"');
  }
}

function visibleLength(value) {
  return Array.from(String(value || '').replace(/<[^>]+>/g, '')).length;
}

export function estimateButtonLabel(rawValue) {
  let dynamic = false;
  const expressions = [];
  const estimated = String(rawValue || '').replace(/\$\{([^}]+)\}/g, (_m, exprRaw) => {
    const expr = String(exprRaw || '').trim();
    expressions.push(expr);
    if (Object.hasOwn(BOUNDED_PLACEHOLDERS, expr)) return BOUNDED_PLACEHOLDERS[expr];
    if (/^Number\((left|page|count|total|stars|days|duration)\)/.test(expr)) return '9999';
    dynamic = true;
    return 'Динамика';
  });
  return { estimated, length: visibleLength(estimated), dynamic, expressions };
}

export function extractStaticButtonLabels(source, file = '<source>') {
  const rows = [];
  const re = /\.(text|url)\(\s*(['"`])((?:\\.|(?!\2)[\s\S])*?)\2\s*,/g;
  let match;
  while ((match = re.exec(source))) {
    const method = match[1];
    const quote = match[2];
    const raw = decodeLiteral(match[3], quote);
    const line = source.slice(0, match.index).split('\n').length;
    const estimate = estimateButtonLabel(raw);
    rows.push({ file, line, method, raw, ...estimate });
  }
  return rows;
}

export function auditStaticTelegramButtons({ root = ROOT } = {}) {
  const scanRoots = [path.join(root, 'src', 'bot')];
  const labels = [];
  for (const scanRoot of scanRoots) {
    for (const abs of walk(scanRoot).filter((p) => p.endsWith('.js'))) {
      const rel = path.relative(root, abs).split(path.sep).join('/');
      labels.push(...extractStaticButtonLabels(fs.readFileSync(abs, 'utf8'), rel));
    }
  }

  const hardViolations = labels.filter((row) => !row.dynamic && row.length > MOBILE_BUTTON_HARD_MAX);
  const preferredWarnings = labels.filter((row) => !row.dynamic && row.length > MOBILE_BUTTON_PREFERRED_MAX && row.length <= MOBILE_BUTTON_HARD_MAX);
  const dynamicReview = labels.filter((row) => row.dynamic && row.length > MOBILE_BUTTON_PREFERRED_MAX);

  return {
    schema_version: 1,
    thresholds: { preferred_max: MOBILE_BUTTON_PREFERRED_MAX, hard_max: MOBILE_BUTTON_HARD_MAX },
    scanned_labels: labels.length,
    hard_violations: hardViolations,
    preferred_warnings: preferredWarnings,
    dynamic_review: dynamicReview,
    pass: hardViolations.length === 0,
  };
}

function formatRow(row) {
  return `${row.file}:${row.line} · ${row.length} chars · ${JSON.stringify(row.raw)}`;
}

async function main() {
  const report = auditStaticTelegramButtons({ root: ROOT });
  console.log(`[STEP586H] Telegram button labels scanned: ${report.scanned_labels}`);
  console.log(`[STEP586H] Hard mobile violations > ${MOBILE_BUTTON_HARD_MAX}: ${report.hard_violations.length}`);
  console.log(`[STEP586H] Review warnings ${MOBILE_BUTTON_PREFERRED_MAX + 1}-${MOBILE_BUTTON_HARD_MAX}: ${report.preferred_warnings.length}`);
  console.log(`[STEP586H] Dynamic labels requiring live review: ${report.dynamic_review.length}`);

  for (const row of report.hard_violations) console.error(`[HARD] ${formatRow(row)}`);
  for (const row of report.preferred_warnings.slice(0, 20)) console.warn(`[REVIEW] ${formatRow(row)}`);
  for (const row of report.dynamic_review.slice(0, 20)) console.warn(`[DYNAMIC] ${formatRow(row)}`);

  const output = String(process.env.MOBILE_COPY_AUDIT_OUTPUT || '').trim();
  if (output) {
    const abs = path.resolve(output);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`[STEP586H] Audit JSON: ${abs}`);
  }

  if (!report.pass) process.exitCode = 1;
  else console.log('[STEP586H] Telegram mobile button hard-limit audit PASS');
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === self) main();
