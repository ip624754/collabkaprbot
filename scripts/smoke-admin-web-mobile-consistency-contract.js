import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const html = read('admin.html');
const css = read('styles/admin-web.css');
const js = read('scripts/admin-web.js');

assert.ok(html.includes('step543c'), 'admin asset URLs must be cache-busted to step543c');
assert.ok(js.includes('data-mobile-nav-toggle'), 'mobile nav toggle hook must stay present');
for (const token of [
  'html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; overflow-x: clip; }',
  '.aw-shell {\n    min-height: 100vh;\n    grid-template-columns: 1fr;\n    width: 100%;\n  }',
  '.aw-topbar {\n    gap: 10px;\n    margin-bottom: 16px;\n    flex-direction: column;\n    align-items: stretch;\n  }',
  '.aw-input, .aw-select, .aw-textarea, .aw-copy-sheet-textarea {\n    font-size: 16px;\n  }',
  '.aw-actions .aw-button,',
  '.aw-copy-sheet-actions .aw-button { width: 100%; }',
]) {
  assert.ok(css.includes(token), `mobile consistency CSS must include ${token}`);
}

console.log('✅ smoke admin-web mobile consistency contract OK');
