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

assert.ok(
  botSrc.includes('function brandLeadDialogButtonLabel(leadId = 0) {') &&
    botSrc.includes("return id ? `💬 Диалог #${id}` : '💬 Диалог';") &&
    botSrc.includes('function brandLeadProfileButtonLabel() {') &&
    botSrc.includes("return '🪟 Витрина креатора';") &&
    botSrc.includes('function brandLeadContactUnlockButtonLabel() {') &&
    botSrc.includes("return raw.replace(/^🔓\\s*Контакты\\b/i, '🔓 Контакты на витрине');"),
  'Expected brand-side lead entrypoints to centralize dialog / profile / contacts labels for one shared vocabulary'
);

assert.ok(
  botSrc.includes("if (lid) kb.text(dialogLabel, `a:blead_view|id:${lid}|w:${wsId}`);") &&
    botSrc.includes("kb.text(profileLabel, `a:wsp_open|ws:${wsId}|m:ro${ctxPart}`);") &&
    botSrc.includes("kb.text(contactsLabel, `a:wsp_contact_req|ws:${wsId}${ctxPart}`)") &&
    botSrc.includes('const currentHint = contactsUnlocked') &&
    botSrc.includes('Контакты на витрине уже открыты.') &&
    botSrc.includes('разблокируй контакты через «${contactsLabel}».') &&
    botSrc.includes(".text(profileLabel, `a:wsp_open|ws:${realWsId}|m:ro|r:bl|l:${id}`)") &&
    botSrc.includes("kb.text(contactsLabel, `a:wsp_contact_req|ws:${realWsId}|r:bl|l:${id}`)"),
  'Expected brand-side dialog and reply CTAs to use the same dialog / profile / contacts vocabulary in the lead flow'
);

assert.ok(
  botSrc.includes('const brandLeadId = Math.max(0, Number(opts?.brandLeadId || 0));') &&
    botSrc.includes('const brandLeadCtx = !!opts?.dialogCb && hideApply;') &&
    botSrc.includes('if (hideApply) blocks.push(`${profileEntryLabel} (read-only): продолжай через «${dialogEntryLabel}». Контакты на витрине — через «${contactsEntryLabel}».`);') &&
    botSrc.includes('kb.text(dialogEntryLabel, dialogCb);') &&
    botSrc.includes("lines.push(`• Контакты: <b>🔒 скрыто</b> (открываются через «${contactsEntryLabel}»)`);") &&
    botSrc.includes("opts.brandLeadId = leadId;") &&
    botSrc.includes("brandLeadId: fromLead ? leadId : 0") &&
    botSrc.includes("const roOpts = fromLead ? { hideApply: true, backCb, contactCbExtra: ctxExtra, dialogCb: backCb, brandLeadId: leadId } : {};") &&
    botSrc.includes(".text(fromLead ? brandLeadDialogButtonLabel(leadId) : '⬅️ Назад', backCb)") &&
    botSrc.includes(".text(fromLead ? brandLeadProfileButtonLabel() : '🪟 Витрина', openCb)") &&
    botSrc.includes("const followupDialogLabel = fromLead ? brandLeadDialogButtonLabel(leadId) : '⬅️ Назад';") &&
    botSrc.includes("const followupProfileLabel = fromLead ? brandLeadProfileButtonLabel() : '🪟 Витрина';") &&
    botSrc.includes("kb2.row().text(followupDialogLabel, `a:blead_view|id:${leadId}|w:${wsId}`).text(followupProfileLabel, `a:wsp_open|ws:${wsId}|m:ro${ctxExtra}`);") &&
    botSrc.includes('Недостаточно кредитов для ${fromLead ? brandLeadContactUnlockButtonLabel() : contactUnlockBtnLabel()}'),
  'Expected brand-side vitrina / unlock / back-entry screens to keep one shared vocabulary when returning from a lead dialog'
);

console.log('✅ smoke brand-side lead entrypoints contract OK');
