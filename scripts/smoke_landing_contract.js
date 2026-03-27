import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const mustExist = [
  'index.html',
  'styles/landing.css',
  'scripts/landing.js',
  'assets/brand/kd-mark-temp.svg',
];

for (const rel of mustExist) {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) {
    throw new Error(`Missing landing contract file: ${rel}`);
  }
}

const html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(repoRoot, 'styles/landing.css'), 'utf8');
const js = fs.readFileSync(path.join(repoRoot, 'scripts/landing.js'), 'utf8');

const requiredStrings = [
  'Private Creator &amp; Project Deal Flow Inside Telegram',
  'https://t.me/KOLDealsBot',
  'id="hero"',
  'id="pillars"',
  'id="how-it-works"',
  'id="why-kol-deal"',
  'id="inside-kol-deal"',
  'id="final-cta"',
  'Creator Channel Hub',
  'For Projects / Exchanges',
  'Open KOL Deal',
];

for (const marker of requiredStrings) {
  if (!html.includes(marker)) {
    throw new Error(`Landing HTML missing marker: ${marker}`);
  }
}

const cssMarkers = ['.page-shell', '.pillars-grid', '.steps-rail', '.preview-grid', '.button-primary'];
for (const marker of cssMarkers) {
  if (!css.includes(marker)) {
    throw new Error(`Landing CSS missing marker: ${marker}`);
  }
}

const jsMarkers = ['IntersectionObserver', 'scrollIntoView'];
for (const marker of jsMarkers) {
  if (!js.includes(marker)) {
    throw new Error(`Landing JS missing marker: ${marker}`);
  }
}

console.log('OK: landing contract files and core markers present');
