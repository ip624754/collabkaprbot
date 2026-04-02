#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTION_GUARD, ACTION_REGISTRY, ACTION_TYPES } from '../src/bot/actionRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function expectRegistry(action, { type, guard, breakGlass = undefined }) {
  const meta = ACTION_REGISTRY[action];
  assert.ok(meta, `missing action registry entry: ${action}`);
  assert.equal(meta.type, type, `unexpected type for ${action}`);
  assert.equal(meta.guard, guard, `unexpected guard for ${action}`);
  if (breakGlass !== undefined) assert.equal(!!meta.breakGlass, !!breakGlass, `unexpected breakGlass for ${action}`);
}

const botSource = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'bot.js'), 'utf8');
for (const token of [
  "⚙️ Админка → Control Surface",
  'Web-admin login:',
  'Payments fallback apply:',
  'Broadcast fan-out (QStash):',
  "'a:admin_web_login_toggle'",
  "'a:admin_pay_accept_toggle'",
  "'a:admin_pay_auto_toggle'",
  "'a:admin_matchfeat_auto_toggle'",
  "'a:admin_pay_fb'",
  "'a:admin_bc_qstash_toggle'",
  "'a:admin_qstash_status'",
  "'a:hs_home|p:0'",
]) {
  assert.ok(botSource.includes(token), `bot.js must include ${token}`);
}

expectRegistry('a:admin_sys', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_web_login_toggle', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_pay_accept_toggle', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_pay_auto_toggle', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_matchfeat_auto_toggle', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_pay_fb', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_bc_qstash_toggle', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_qstash_status', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:hs_home', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:admin_founder', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_mod_add', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_mod_list', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:adm_gift', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.REQUIRE_REDIS });
expectRegistry('a:admin_home', { type: ACTION_TYPES.ADMIN, guard: ACTION_GUARD.NONE });
expectRegistry('a:menu', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });
expectRegistry('a:home', { type: ACTION_TYPES.EDIT, guard: ACTION_GUARD.NONE });

console.log('✅ smoke admin-system keyboard/footer contract OK');
