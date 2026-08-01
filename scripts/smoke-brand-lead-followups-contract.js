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
  runtimeSrc.includes("function brandLeadWhatNextText(leadId = 0, mode = 'default') {") &&
    runtimeSrc.includes("if (mode === 'contacts_open') {") &&
    runtimeSrc.includes("Контакты на витрине уже открыты.") &&
    runtimeSrc.includes("if (mode === 'reply_sent') {") &&
    runtimeSrc.includes("Контакты — через «${contactsLabel}».") &&
    runtimeSrc.includes("return `Продолжай через «${dialogLabel}», открой «${profileLabel}» или разблокируй контакты через «${contactsLabel}».`;") &&
    runtimeSrc.includes("const currentHint = contactsUnlocked"),
  'Expected brand-side lead follow-ups to centralize post-action what-next copy around one shared vocabulary'
);

assert.ok(
  runtimeSrc.includes("const replyDialogLabel = brandLeadDialogButtonLabel(leadId);") &&
    runtimeSrc.includes("const replyProfileLabel = brandLeadProfileButtonLabel();") &&
    runtimeSrc.includes("const replyContactsLabel = brandLeadContactUnlockButtonLabel();") &&
    runtimeSrc.includes("`• ${escapeHtml(brandLeadWhatNextText(leadId, 'reply_sent'))}\\n`") &&
    runtimeSrc.includes(".text(replyDialogLabel, `a:blead_view|id:${leadId}|w:${Number(lead.workspace_id)}`)") &&
    runtimeSrc.includes(".text(replyProfileLabel, `a:wsp_open|ws:${Number(lead.workspace_id)}|m:ro|r:bl|l:${leadId}`)") &&
    runtimeSrc.includes(".text(replyContactsLabel, `a:wsp_contact_req|ws:${Number(lead.workspace_id)}|r:bl|l:${leadId}`)"),
  'Expected post-reply receipt to keep brand-side dialog / vitrina / contacts follow-up CTAs in one system'
);

assert.ok(
  runtimeSrc.includes("const followupDialogLabel = fromLead ? brandLeadDialogButtonLabel(leadId) : '⬅️ Назад';") &&
    runtimeSrc.includes("const followupProfileLabel = fromLead ? brandLeadProfileButtonLabel() : '🪟 Витрина';") &&
    runtimeSrc.includes("const followupWhatNext = fromLead ? brandLeadWhatNextText(leadId, 'contacts_open') : '';") &&
    runtimeSrc.includes("lines.push(`💡 <b>Сейчас:</b> ${escapeHtml(followupWhatNext)}`);") &&
    runtimeSrc.includes("kb2.row().text(followupDialogLabel, `a:blead_view|id:${leadId}|w:${wsId}`).text(followupProfileLabel, `a:wsp_open|ws:${wsId}|m:ro${ctxExtra}`);") &&
    runtimeSrc.includes("kb2.row().text('💳 Купить ещё', `a:brand_pass|ws:0|ret:wsp|rws:${wsId}`);"),
  'Expected post-unlock contact-pack follow-up to use the same brand-side dialog / vitrina language and return path'
);

assert.ok(!botSrc.includes("if (p.a === 'a:wsp_contact_unlock')"), 'contact unlock must stay out of the legacy dispatcher');
assert.ok(directorySrc.includes("if (p.a === 'a:wsp_contact_unlock')"), 'contact unlock must be owned by the directory public-workspace domain');

console.log('✅ smoke brand-side lead follow-ups contract OK');
