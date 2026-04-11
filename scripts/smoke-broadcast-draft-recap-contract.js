import fs from 'fs';

function assertContains(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    console.error(`Missing: ${label} -> ${needle}`);
    process.exit(1);
  }
}

const bot = fs.readFileSync(new URL('../src/bot/bot.js', import.meta.url), 'utf8');
const db = fs.readFileSync(new URL('../src/db/queries.js', import.meta.url), 'utf8');

assertContains(bot, 'buildBroadcastDraftRecap', 'draft recap helper');
assertContains(bot, 'Recap before send', 'preview recap heading');
assertContains(bot, 'Draft recap', 'composer recap heading');
assertContains(bot, 'Preview only: below samples show only the first slice', 'preview-only warning');
assertContains(bot, 'Remembered default audience', 'advanced remembered default hint');
assertContains(db, 'listBroadcastAudienceSample', 'sample audience query');

console.log('OK: broadcast draft recap contract markers found.');
