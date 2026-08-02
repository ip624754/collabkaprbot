import { readQueryImplementationSource } from './lib/query-source-reader.js';
import fs from 'fs';
const files = ['src/bot/bot.js','src/bot/actionRegistry.js'];
const content = `${files.map((f) => fs.readFileSync(f,'utf8')).join('\n')}\n${readQueryImplementationSource()}`;
for (const token of ['a:admin_invites','a:admin_invites_list','getInviteAdminVisibilityOverview','renderAdminInviteVisibilityHome','🎁 Инвайты']) {
  if (!content.includes(token)) {
    console.error('Missing token:', token);
    process.exit(1);
  }
}
console.log('ok');
