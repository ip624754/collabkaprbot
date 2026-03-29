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
const screenshot = path.join(ROOT, 'assets', 'screenshots', 'brand-filters-live.png');

for (const p of [htmlPath, cssPath, jsPath, logoWhite, logoBlue, screenshot]) {
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
  assert(html.includes(`id="${id}"`), `index.html missing section id ${id}`);
}

console.log('[smoke:landing-contract] OK');
