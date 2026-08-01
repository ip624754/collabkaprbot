#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const botPath = path.join(ROOT, 'src', 'bot', 'bot.js');
const botSrc = fs.readFileSync(botPath, 'utf8');
const directorySrc = fs.readFileSync(path.join(ROOT, 'src', 'bot', 'domains', 'directory', 'callbacks.js'), 'utf8');
const runtimeSrc = `${botSrc}\n${directorySrc}`;

assert.ok(
  runtimeSrc.includes('function brandLeadDialogButtonLabel(leadId = 0) {') &&
    runtimeSrc.includes("return id ? `💬 Диалог #${id}` : '💬 Диалог';") &&
    runtimeSrc.includes('function brandLeadProfileButtonLabel() {') &&
    runtimeSrc.includes("return '🪟 Витрина креатора';") &&
    runtimeSrc.includes('function brandLeadContactUnlockButtonLabel() {') &&
    runtimeSrc.includes("return raw.replace(/^🔓\\s*Контакты\\b/i, '🔓 Контакты на витрине');"),
  'Expected brand-side lead entrypoints to centralize dialog / profile / contacts labels for one shared vocabulary'
);

assert.ok(
  runtimeSrc.includes("if (lid) kb.text(dialogLabel, `a:blead_view|id:${lid}|w:${wsId}`);") &&
    runtimeSrc.includes("kb.text(profileLabel, `a:wsp_open|ws:${wsId}|m:ro${ctxPart}`);") &&
    runtimeSrc.includes("kb.text(contactsLabel, `a:wsp_contact_req|ws:${wsId}${ctxPart}`)") &&
    runtimeSrc.includes('const currentHint = contactsUnlocked') &&
    runtimeSrc.includes('Контакты на витрине уже открыты.') &&
    runtimeSrc.includes('разблокируй контакты через «${contactsLabel}».') &&
    runtimeSrc.includes(".text(profileLabel, `a:wsp_open|ws:${realWsId}|m:ro|r:bl|l:${id}`)") &&
    runtimeSrc.includes("kb.text(contactsLabel, `a:wsp_contact_req|ws:${realWsId}|r:bl|l:${id}`)"),
  'Expected brand-side dialog and reply CTAs to use the same dialog / profile / contacts vocabulary in the lead flow'
);

assert.ok(
  runtimeSrc.includes('const brandLeadId = Math.max(0, Number(opts?.brandLeadId || 0));') &&
    runtimeSrc.includes('const brandLeadCtx = !!opts?.dialogCb && hideApply;') &&
    runtimeSrc.includes('if (hideApply) blocks.push(`${profileEntryLabel} (read-only): продолжай через «${dialogEntryLabel}». Контакты на витрине — через «${contactsEntryLabel}».`);') &&
    runtimeSrc.includes('kb.text(dialogEntryLabel, dialogCb);') &&
    runtimeSrc.includes("lines.push(`• Контакты: <b>🔒 скрыто</b> (открываются через «${contactsEntryLabel}»)`);") &&
    runtimeSrc.includes("opts.brandLeadId = leadId;") &&
    runtimeSrc.includes("brandLeadId: fromLead ? leadId : 0") &&
    runtimeSrc.includes("const roOpts = fromLead ? { hideApply: true, backCb, contactCbExtra: ctxExtra, dialogCb: backCb, brandLeadId: leadId } : {};") &&
    runtimeSrc.includes(".text(fromLead ? brandLeadDialogButtonLabel(leadId) : '⬅️ Назад', backCb)") &&
    runtimeSrc.includes(".text(fromLead ? brandLeadProfileButtonLabel() : '🪟 Витрина', openCb)") &&
    runtimeSrc.includes("const followupDialogLabel = fromLead ? brandLeadDialogButtonLabel(leadId) : '⬅️ Назад';") &&
    runtimeSrc.includes("const followupProfileLabel = fromLead ? brandLeadProfileButtonLabel() : '🪟 Витрина';") &&
    runtimeSrc.includes("kb2.row().text(followupDialogLabel, `a:blead_view|id:${leadId}|w:${wsId}`).text(followupProfileLabel, `a:wsp_open|ws:${wsId}|m:ro${ctxExtra}`);") &&
    runtimeSrc.includes('Недостаточно кредитов для ${fromLead ? brandLeadContactUnlockButtonLabel() : contactUnlockBtnLabel()}'),
  'Expected brand-side vitrina / unlock / back-entry screens to keep one shared vocabulary when returning from a lead dialog'
);

assert.ok(!botSrc.includes("if (p.a === 'a:wsp_contact_unlock')"), 'contact unlock must stay out of the legacy dispatcher');
assert.ok(directorySrc.includes("if (p.a === 'a:wsp_contact_unlock')"), 'contact unlock must be owned by the directory public-workspace domain');

console.log('✅ smoke brand-side lead entrypoints contract OK');
