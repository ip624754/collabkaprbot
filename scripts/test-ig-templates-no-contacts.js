import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BOT_JS = path.join(ROOT, 'src', 'bot', 'bot.js');

function die(msg) {
  // eslint-disable-next-line no-console
  console.error(`\n[ig-templates] ${msg}`);
  process.exit(1);
}

function readFile(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    die(`Cannot read ${p}: ${e?.message || e}`);
  }
}

function findFunctionSource(src, fnName) {
  const needle = `function ${fnName}`;
  const start = src.indexOf(needle);
  if (start < 0) die(`Function not found: ${fnName}`);

  // Find the first "{" after the signature.
  const braceStart = src.indexOf('{', start);
  if (braceStart < 0) die(`Cannot find body for: ${fnName}`);

  let depth = 0;
  let i = braceStart;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        // include the closing brace
        i++;
        break;
      }
    }
  }

  if (depth !== 0) die(`Unbalanced braces while extracting: ${fnName}`);
  return src.slice(start, i);
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function detectLeaks(text) {
  const leaks = [];
  const t = String(text || '');

  // Emails
  const emailRe = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  if (emailRe.test(t)) leaks.push('email');

  // Phone-like: 8+ digits (with separators allowed)
  const phoneRe = /(?:\+?\d[\d\s().-]{6,}\d)/;
  // Require at least 8 digits total
  if (phoneRe.test(t)) {
    const m = t.match(phoneRe);
    const digits = (m?.[0] || '').replace(/\D/g, '');
    if (digits.length >= 8) leaks.push('phone');
  }

  // @username mentions
  const atRe = /(^|[^\w])@([A-Za-z0-9_]{4,})\b/;
  if (atRe.test(t)) leaks.push('@handle');

  // Forbidden external domains
  const forbiddenDomains = ['instagram.com', 'wa.me', 'whatsapp', 'vk.com', 'tiktok.com', 'facebook.com', 'mailto:'];
  for (const d of forbiddenDomains) {
    if (t.toLowerCase().includes(d)) leaks.push(`domain:${d}`);
  }

  // URLs: only allow deep-link to bot with start=wsp_
  const urlRe = /https?:\/\/[^\s<>")\]]+/g;
  const urls = t.match(urlRe) || [];
  for (const rawUrl of urls) {
    const url = rawUrl.replace(/[.,;:!?]+$/g, '');
    const lower = url.toLowerCase();
    if (lower.startsWith('https://t.me/') || lower.startsWith('http://t.me/')) {
      // must be a deep-link with start=wsp_ to keep contact routed through the bot
      if (!lower.includes('start=wsp_')) leaks.push(`url:not_deeplink:${url}`);
    } else {
      leaks.push(`url:external:${url}`);
    }
  }

  return leaks;
}

function assertNoLeaks(label, text) {
  const leaks = detectLeaks(text);
  if (leaks.length) {
    const preview = String(text || '').slice(0, 600);
    die(`LEAK in ${label}: ${leaks.join(', ')}\n---\n${preview}\n---`);
  }
}

// Load and extract functions from bot.js
const botSrc = readFile(BOT_JS);
const f1 = findFunctionSource(botSrc, 'buildWsIgTemplate');
const f2 = findFunctionSource(botSrc, 'buildWsIgDmRaw');

// Minimal stubs for dependencies used inside the extracted functions
const sandbox = {
  // helpers used by templates
  wsBrandLink: (wsId) => `https://t.me/collabkaprbot?start=wsp_${Number(wsId || 0) || 123}`,
  escapeHtml,
  fmtMatrix: () => 'Beauty, Tech',
  PROFILE_MODE_LABELS: { both: 'UGC + Channel', ugc: 'UGC', channel: 'Channel' },
  PROFILE_VERTICALS: [],
  PROFILE_FORMATS: [],
  console,
};

vm.createContext(sandbox);

try {
  new vm.Script(`${f1}\n${f2}`, { filename: 'ig_templates_extracted.vm.js' }).runInContext(sandbox);
} catch (e) {
  die(`Failed to eval extracted functions: ${e?.message || e}`);
}

if (typeof sandbox.buildWsIgTemplate !== 'function' || typeof sandbox.buildWsIgDmRaw !== 'function') {
  die('Extracted functions are not available in sandbox');
}

// Dangerous workspace data (should never be leaked through IG templates)
const ws = {
  profile_mode: 'both',
  profile_verticals: ['beauty'],
  profile_formats: ['ugc'],
  profile_contact: 'tg: @evil_user, email: evil@example.com, phone: +7 999 111-22-33, t.me/evil_user',
  profile_contacts: {
    telegram: '@evil_user',
    email: 'evil@example.com',
    phone: '+7 999 111-22-33',
    website: 'https://example.com',
  },
  profile_ig: 'evil_ig',
  profile_ig_handle: 'evil_ig',
  profile_portfolio: 'https://instagram.com/evil_ig',
};

// Verify buildWsIgTemplate types
for (const type of ['story', 'post', 'dm', 'bio']) {
  const out = sandbox.buildWsIgTemplate(ws, 123, type);
  assertNoLeaks(`buildWsIgTemplate:${type}`, out);
}

// Verify buildWsIgDmRaw variants
for (const tone of ['soft', 'hard']) {
  for (let i = 0; i < 3; i++) {
    const { raw } = sandbox.buildWsIgDmRaw(ws, 123, tone, i);
    assertNoLeaks(`buildWsIgDmRaw:${tone}:${i}`, raw);
  }
}

// eslint-disable-next-line no-console
console.log('✅ IG templates: no-contact-leak invariants OK');
