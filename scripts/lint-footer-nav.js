// STEP161: Footer navigation lint (Back/Menu/Home consistency)
//
// Goal: prevent regressions where non-menu screens accidentally ship keyboards
// without the standard navigation footer:
//   ⬅️ Назад / 📋 Меню / 🏠 Home
//
// Heuristic (fast, dependency-free):
// - Scan code for InlineKeyboard construction blocks.
// - If a keyboard contains a back-like control ('⬅️ Назад'/ '⬅️ Отмена'/ '⬅️ Админка'/ '⬅️ Операции'/ '⬅️ Коммуникации'/ '⬅️ Система'),
//   then it must also contain both "📋 Меню" and "🏠 Home" somewhere nearby
//   (or use nav helpers navKb()/kbNavRow()).
//
// Usage:
//   node scripts/lint-footer-nav.js
//   npm run lint:nav
//
// Ignore (per-file): add a comment anywhere in the file:
//   navlint: ignore

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.vercel', '.next', 'dist', 'build', 'coverage',
]);

function walkJsFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isDirectory() && SKIP_DIRS.has(e.name)) continue;
      const p = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile() && e.name.endsWith('.js')) out.push(p);
    }
  }
  return out;
}

function sliceToSemicolon(text, fromIdx, maxLen = 6000) {
  const endMax = Math.min(text.length, fromIdx + maxLen);
  const semi = text.indexOf(';', fromIdx);
  if (semi !== -1 && semi < endMax) return text.slice(fromIdx, semi + 1);
  return text.slice(fromIdx, endMax);
}

function analyzeFile(file, text) {
  const violations = [];
  if (/navlint\s*:\s*ignore/i.test(text)) return violations;

  // Quick skip: if file doesn't even mention InlineKeyboard it can't violate.
  if (!text.includes('InlineKeyboard')) return violations;

  const re = /new\s+InlineKeyboard\s*\(\s*\)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    const window = text.slice(start, Math.min(text.length, start + 9000));

    // If helper adds nav row later, consider it OK (conservative).
    if (/\b(navKb|kbNavRow|kbAdminFooter)\s*\(/.test(window)) continue;

    const block = sliceToSemicolon(text, start);

    const hasBackLike = /['"`]⬅️\s*(Назад|Отмена|Админка|Операции|Коммуникации|Система)/.test(block);
    const hasAdminBack = /['"`]⬅️\s*(Админка|Операции|Коммуникации|Система)/.test(block);
    const hasMenu = block.includes('📋 Меню');
    const hasHome = block.includes('🏠 Home');

    // Default mode: enforce only on "footer-ish" keyboards.
    // A keyboard is footer-ish if it already contains either Menu or Home.
    // Strict mode (NAVLINT_STRICT=1): also enforce on any keyboard that has a Back-like control.
    const strict = String(process.env.NAVLINT_STRICT || '') === '1';
    const footerish = hasMenu || hasHome || hasAdminBack || (strict && hasBackLike);
    if (!footerish) continue;

    const missing = [];
    if (!hasMenu) missing.push('📋 Меню');
    if (!hasHome) missing.push('🏠 Home');

    if (missing.length) {
      const preview = block
        .split('\n')
        .slice(0, 10)
        .join('\n')
        .slice(0, 800);
      violations.push({ file, missing, preview });
    }
  }

  return violations;
}

const scanDirs = [
  path.join(root, 'src'),
  path.join(root, 'api'),
];

const allFiles = [];
for (const d of scanDirs) {
  if (fs.existsSync(d)) allFiles.push(...walkJsFiles(d));
}

const allViolations = [];
for (const f of allFiles) {
  let txt = '';
  try { txt = fs.readFileSync(f, 'utf8'); } catch { continue; }
  allViolations.push(...analyzeFile(path.relative(root, f), txt));
}

if (!allViolations.length) {
  console.log('OK: footer nav lint passed (Back-like keyboards include 📋 Меню + 🏠 Home).');
  process.exit(0);
}

console.error(`FAIL: found ${allViolations.length} keyboard(s) with Back/Cancel/Admin-back but missing nav buttons.`);
for (const v of allViolations) {
  console.error(`\n- ${v.file}: missing ${v.missing.join(' + ')}`);
  console.error(v.preview);
}
console.error('\nHow to fix: add navKb(backCb) / kbNavRow(kb, backCb) or append “📋 Меню” + “🏠 Home” buttons.');
console.error('If intentional, add comment: navlint: ignore');
process.exit(2);
