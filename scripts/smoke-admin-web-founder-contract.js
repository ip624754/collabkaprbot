import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}
function ok(cond, msg) {
  if (!cond) {
    console.error(`[smoke-admin-web-founder-contract] ${msg}`);
    process.exit(1);
  }
}

const js = read('scripts/admin-web.js');
const auth = read('src/lib/adminWeb/auth.js');
const apiRead = read('api/admin-web-read.js');
const apiAuth = read('api/admin-web-auth.js');
const models = read('src/lib/adminWeb/readModels.js');

ok(js.includes("/admin/founder"), 'founder route missing in admin shell');
ok(js.includes('Founder-only control surface'), 'founder page copy missing');
ok(js.includes('revokeAllBtn'), 'founder revoke button missing');
ok(auth.includes('isFounderActorTgId'), 'founder actor helper missing');
ok(auth.includes('requireFounderSession'), 'founder session guard missing');
ok(apiRead.includes("section === 'founder'"), 'founder read section missing');
ok(apiAuth.includes('requireFounderSession(req, res)'), 'revoke_all must require founder session');
ok(models.includes('export async function getFounderSummary'), 'founder read model missing');
console.log('OK: admin web founder controls split contract');
