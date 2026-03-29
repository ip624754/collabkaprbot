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
  path.join(ROOT, 'assets', 'screenshots', 'home-live-shot.png'),
  path.join(ROOT, 'assets', 'screenshots', 'catalog-live-shot.png'),
  path.join(ROOT, 'assets', 'screenshots', 'filters-live-shot.png'),
  path.join(ROOT, 'assets', 'screenshots', 'deal-live-shot.png'),
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
  'surface-modal',
  'screen-card-gallery',
  'data-surface="home"',
  'data-surface="catalog"',
  'data-surface="filters"',
  'data-surface="deal"',
  '/assets/screenshots/home-live-shot.png',
  '/assets/screenshots/catalog-live-shot.png',
  '/assets/screenshots/filters-live-shot.png',
  '/assets/screenshots/deal-live-shot.png',
];
for (const chunk of requiredChunks) {
  assert(html.includes(chunk), `index.html missing required chunk: ${chunk}`);
}

const sectionIds = ['hero', 'roles', 'how-it-works', 'inside-bot', 'why-better', 'screens', 'faq', 'final-cta'];
for (const id of sectionIds) {
  assert(html.includes(`id="${id}"`), `index.html missing section id ${id}`);
}

assert(!html.includes('accordion-card open'), 'index.html must not ship accordion cards opened by default');
assert(!html.includes('aria-expanded="true"'), 'index.html must not ship accordions with aria-expanded=true by default');
assert(!html.includes('home-surface-polished.png'), 'screens gallery should not use old polished home asset');
assert(!html.includes('catalog-surface-polished.png'), 'screens gallery should not use old polished catalog asset');
assert(!html.includes('filters-surface-polished.png'), 'screens gallery should not use old polished filters asset');
assert(!html.includes('deal-surface-polished.png'), 'screens gallery should not use old polished deal asset');

const css = fs.readFileSync(cssPath, 'utf8');
assert(css.includes('.surface-modal'), 'landing.css missing modal styles');
assert(css.includes('.screen-card-gallery'), 'landing.css missing gallery card styles');

const js = fs.readFileSync(jsPath, 'utf8');
assert(js.includes('SURFACE_CONTENT'), 'landing.js missing modal content map');
assert(js.includes('openSurfaceModal'), 'landing.js missing modal open logic');
assert(js.includes('closeSurfaceModal'), 'landing.js missing modal close logic');

console.log('[smoke:landing-contract] OK');
