import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function assert(cond, message) {
  if (!cond) {
    console.error(`[smoke:landing-contract] ${message}`);
    process.exit(1);
  }
}

const htmlPath = path.join(ROOT, 'index.html');
const cssPath = path.join(ROOT, 'styles', 'landing.css');
const jsPath = path.join(ROOT, 'scripts', 'landing.js');
const logoWhite = path.join(ROOT, 'assets', 'brand', 'collabka-mark-white.png');
const logoBlue = path.join(ROOT, 'assets', 'brand', 'collabka-mark-blue.png');
const screenshots = [
  path.join(ROOT, 'assets', 'screenshots', 'home-surface-polished.png'),
  path.join(ROOT, 'assets', 'screenshots', 'catalog-surface-polished.png'),
  path.join(ROOT, 'assets', 'screenshots', 'filters-surface-polished.png'),
  path.join(ROOT, 'assets', 'screenshots', 'deal-surface-polished.png'),
];

for (const p of [htmlPath, cssPath, jsPath, logoWhite, logoBlue, ...screenshots]) {
  assert(fs.existsSync(p), `required file missing: ${path.relative(ROOT, p)}`);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const requiredChunks = [
  'Collabka PR — находите друг друга и ведите сотрудничество в одном боте',
  'Кому подходит',
  'Как это работает',
  'Что внутри бота',
  'Почему это удобнее обычного Telegram-хаоса',
  'FAQ',
  'Открыть бота',
  'https://t.me/collabkaprbot',
  'Коллаборации брендов и креаторов внутри Telegram',
];
for (const chunk of requiredChunks) {
  assert(html.includes(chunk), `index.html missing required chunk: ${chunk}`);
}

const sectionIds = ['hero', 'roles', 'how-it-works', 'inside-bot', 'why-better', 'screens', 'faq', 'final-cta'];
for (const id of sectionIds) {
  assert(html.includes(`id=\"${id}\"`), `index.html missing section id ${id}`);
}

assert(!html.includes('accordion-card open'), 'index.html must not ship accordion cards opened by default');
assert(!html.includes('aria-expanded="true"'), 'index.html must not ship accordions with aria-expanded=true by default');
assert(html.includes('/assets/screenshots/home-surface-polished.png'), 'index.html missing polished home visual');
assert(html.includes('/assets/screenshots/catalog-surface-polished.png'), 'index.html missing polished catalog visual');
assert(html.includes('/assets/screenshots/filters-surface-polished.png'), 'index.html missing polished filters visual');
assert(html.includes('/assets/screenshots/deal-surface-polished.png'), 'index.html missing polished deal visual');
assert(!html.includes('brand-filters-live.png'), 'index.html should not ship old raw screenshot in screens section');
assert(!html.includes('screen-preview-home'), 'index.html should not ship placeholder preview cards after STEP486');
assert(!html.includes('screen-preview-list'), 'index.html should not ship placeholder preview cards after STEP486');
assert(!html.includes('screen-preview-dialog'), 'index.html should not ship placeholder preview cards after STEP486');

console.log('[smoke:landing-contract] OK');
