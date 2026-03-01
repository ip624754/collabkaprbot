// Preflight grep-gate: prevent regressions that accidentally expose raw contacts
// in *public* (brand-facing) renders before unlock.
//
// This is a DEV guardrail. It does NOT affect production runtime.
//
// Scope (strict + low false positives):
// - Validate key public views in src/bot/bot.js:
//   - renderBxPublicView (barter offer public card)
//   - renderWsPublicProfile (creator storefront)
// - Ensure user-provided text fields that can contain contacts are NOT rendered raw:
//   - offer.description must be redacted for non-owner before unlock
//   - ws.profile_about must be redacted for non-owner before contacts reveal
//
// Why:
// - A previous P1 bypass allowed creators to put contacts into offer description and leak them
//   to brands before unlock.
// - These invariants must never regress.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const BOT_JS = path.join(ROOT, 'src', 'bot', 'bot.js');

function readLines(p) {
  return fs.readFileSync(p, 'utf8').split(/\r?\n/);
}

function findFunctionSlice(lines, fnName) {
  const re = new RegExp(`^\\s*async\\s+function\\s+${fnName}\\b|^\\s*function\\s+${fnName}\\b`);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;

  // Heuristic end: next top-level function declaration.
  const nextRe = /^\s*(async\s+)?function\s+\w+\b/;
  let end = lines.length - 1;
  for (let i = start + 1; i < lines.length; i++) {
    if (nextRe.test(lines[i])) {
      end = i - 1;
      break;
    }
  }
  return { start, end, slice: lines.slice(start, end + 1) };
}

function hasAny(slice, needles) {
  const s = slice.join('\n');
  return needles.some((n) => (typeof n === 'string' ? s.includes(n) : n.test(s)));
}

function findMatchesWithLine(lines, startLine, re) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (re.test(ln)) {
      out.push({ line: startLine + i + 1, text: ln });
    }
  }
  return out;
}

function formatMatches(matches) {
  return matches
    .slice(0, 12)
    .map((m) => `  ${String(m.line).padStart(6, ' ')} | ${m.text}`)
    .join('\n');
}

function main() {
  const problems = [];

  if (!fs.existsSync(BOT_JS)) {
    // eslint-disable-next-line no-console
    console.error(`❌ lint:public-contacts FAILED — missing ${path.relative(ROOT, BOT_JS)}`);
    process.exit(2);
  }

  const lines = readLines(BOT_JS);

  // --- Rule 1: offer description must never be rendered raw in public offer card ---
  {
    const fn = findFunctionSlice(lines, 'renderBxPublicView');
    if (!fn) {
      problems.push({
        type: 'MISSING_FUNCTION',
        note: 'renderBxPublicView not found (public offer card).',
      });
    } else {
      const slice = fn.slice;

      const hasRedact = hasAny(slice, [/redactContactsInText\(/]);
      const hasUnlockGate = hasAny(slice, [/!isOwner\s*&&\s*!unlocked/]);

      // Banned: direct escapeHtml(o.description) style rendering.
      const banned = [
        /escapeHtml\(\s*o\.description\b/, 
        /escapeHtml\(\s*String\(\s*o\.description\b/,
        /descHtml\s*=\s*escapeHtml\(\s*o\.description\b/,
      ];
      const bannedMatches = banned.flatMap((re) => findMatchesWithLine(slice, fn.start, re));

      if (!hasRedact || !hasUnlockGate) {
        problems.push({
          type: 'OFFER_DESCRIPTION_REDACTION_MISSING',
          note:
            'Public offer card must redact description for non-owner before unlock (require !unlocked gate + redactContactsInText).',
          detail:
            `hasRedact=${hasRedact} hasUnlockGate=${hasUnlockGate} (function starts at bot.js:${fn.start + 1})`,
        });
      }
      if (bannedMatches.length) {
        problems.push({
          type: 'OFFER_DESCRIPTION_RAW_RENDER',
          note: 'Found direct rendering of o.description without redaction in public offer card.',
          detail: formatMatches(bannedMatches),
        });
      }
    }
  }

  // --- Rule 2: storefront "about" must never be rendered raw before contacts reveal ---
  {
    const fn = findFunctionSlice(lines, 'renderWsPublicProfile');
    if (!fn) {
      problems.push({
        type: 'MISSING_FUNCTION',
        note: 'renderWsPublicProfile not found (public storefront).',
      });
    } else {
      const slice = fn.slice;

      const hasRedact = hasAny(slice, [/redactContactsInText\(\s*aboutRaw\s*\)/]);
      const hasGate = hasAny(slice, [/!isPreview\s*&&\s*!revealContacts/]);

      // Banned: rendering aboutRaw directly (bypasses redaction).
      const banned = [
        /clipText\(\s*aboutRaw\b/,
        /escapeHtml\(\s*aboutRaw\b/,
        /escapeHtml\(\s*ws\.profile_about\b/,
      ];
      const bannedMatches = banned.flatMap((re) => findMatchesWithLine(slice, fn.start, re));

      if (!hasRedact || !hasGate) {
        problems.push({
          type: 'STOREFRONT_ABOUT_REDACTION_MISSING',
          note:
            'Public storefront must redact profile_about for non-owner before contacts reveal (require !revealContacts gate + redactContactsInText(aboutRaw)).',
          detail:
            `hasRedact=${hasRedact} hasGate=${hasGate} (function starts at bot.js:${fn.start + 1})`,
        });
      }
      if (bannedMatches.length) {
        problems.push({
          type: 'STOREFRONT_ABOUT_RAW_RENDER',
          note: 'Found direct rendering of aboutRaw/profile_about without redaction in public storefront.',
          detail: formatMatches(bannedMatches),
        });
      }
    }
  }

  if (!problems.length) {
    // eslint-disable-next-line no-console
    console.log('✅ lint:public-contacts OK');
    return;
  }

  // eslint-disable-next-line no-console
  console.error(`\n❌ lint:public-contacts FAILED — found ${problems.length} issue(s)\n`);
  for (const p of problems) {
    // eslint-disable-next-line no-console
    console.error(`- ${p.type}: ${p.note}`);
    if (p.detail) {
      // eslint-disable-next-line no-console
      console.error(p.detail);
    }
    // eslint-disable-next-line no-console
    console.error('');
  }
  process.exit(2);
}

main();
