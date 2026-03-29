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

const socialAssets = [
  path.join(ROOT, 'assets', 'social', 'collabka-og-1200x630.png'),
  path.join(ROOT, 'assets', 'social', 'collabka-og-1200x630.webp'),
  path.join(ROOT, 'assets', 'social', 'collabka-og-1200x630-alt.png'),
  path.join(ROOT, 'assets', 'social', 'collabka-og-1200x630-alt.webp'),
];

const ogPrompt = path.join(ROOT, 'docs', 'assets', 'STEP491_OG_PREVIEW_PROMPT.txt');

const icons = [
  path.join(ROOT, 'assets', 'icons', 'landing', 'building2.svg'),
  path.join(ROOT, 'assets', 'icons', 'landing', 'clapperboard.svg'),
  path.join(ROOT, 'assets', 'icons', 'landing', 'workflow.svg'),
  path.join(ROOT, 'assets', 'icons', 'landing', 'store.svg'),
  path.join(ROOT, 'assets', 'icons', 'landing', 'newspaper.svg'),
  path.join(ROOT, 'assets', 'icons', 'landing', 'mail.svg'),
  path.join(ROOT, 'assets', 'icons', 'landing', 'messages-square.svg'),
  path.join(ROOT, 'assets', 'icons', 'landing', 'square-kanban.svg'),
  path.join(ROOT, 'assets', 'icons', 'landing', 'life-buoy.svg'),
  path.join(ROOT, 'assets', 'icons', 'landing', 'house.svg'),
  path.join(ROOT, 'assets', 'icons', 'landing', 'sliders-horizontal.svg'),
];

for (const p of [htmlPath, cssPath, jsPath, logoWhite, logoBlue, ...screenshots, ...icons, ...socialAssets, ogPrompt]) {
  assert(fs.existsSync(p), `required file missing: ${path.relative(ROOT, p)}`);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const requiredChunks = [
  'property="og:image" content="https://collabkaprbot.vercel.app/assets/social/collabka-og-1200x630.png"',
  'property="og:image:width" content="1200"',
  'property="og:image:height" content="630"',
  'property="og:image:alt" content="Collabka PR — коллаборации брендов и креаторов внутри Telegram"',
  'name="twitter:card" content="summary_large_image"',
  'name="twitter:image" content="https://collabkaprbot.vercel.app/assets/social/collabka-og-1200x630.png"',
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
  'accordion-label',
  'screen-icon',
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

const forbiddenEmojiChunks = ['🏢', '🎬', '🧭', '🏷 Каталог брендов', '📰 Лента креаторов', '📨 Заявки', '💬 Диалоги', '📌 Стадии сделки', '🆘 Поддержка'];
for (const chunk of forbiddenEmojiChunks) {
  assert(!html.includes(chunk), `index.html still contains legacy emoji chunk: ${chunk}`);
}


const css = fs.readFileSync(cssPath, 'utf8');
assert(css.includes('.surface-modal'), 'landing.css missing modal styles');
assert(css.includes('.screen-card-gallery'), 'landing.css missing gallery card styles');

const requiredIconGlyphs = [
  'icon-glyph-building2',
  'icon-glyph-clapperboard',
  'icon-glyph-workflow',
  'icon-glyph-store',
  'icon-glyph-newspaper',
  'icon-glyph-mail',
  'icon-glyph-messages-square',
  'icon-glyph-square-kanban',
  'icon-glyph-life-buoy',
  'icon-glyph-house',
  'icon-glyph-sliders-horizontal',
];
for (const glyph of requiredIconGlyphs) {
  assert(html.includes(glyph), `index.html missing icon glyph class: ${glyph}`);
  assert(css.includes(`.${glyph}`), `landing.css missing icon glyph rule: ${glyph}`);
}
assert(!html.includes('class="icon-sprite"'), 'index.html should not ship inline icon sprite after STEP490');

const js = fs.readFileSync(jsPath, 'utf8');
assert(js.includes('SURFACE_CONTENT'), 'landing.js missing modal content map');
assert(js.includes('openSurfaceModal'), 'landing.js missing modal open logic');
assert(js.includes('closeSurfaceModal'), 'landing.js missing modal close logic');

console.log('[smoke:landing-contract] OK');
