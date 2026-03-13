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
  botSrc.includes("function brandLeadWhatNextText(leadId = 0, mode = 'default') {") &&
    botSrc.includes("if (mode === 'contacts_open') {") &&
    botSrc.includes("Контакты на витрине уже открыты.") &&
    botSrc.includes("if (mode === 'reply_sent') {") &&
    botSrc.includes("Контакты — через «${contactsLabel}».") &&
    botSrc.includes("return `Продолжай через «${dialogLabel}», открой «${profileLabel}» или разблокируй контакты через «${contactsLabel}».`;") &&
    botSrc.includes("const currentHint = contactsUnlocked"),
  'Expected brand-side lead follow-ups to centralize post-action what-next copy around one shared vocabulary'
);

assert.ok(
  botSrc.includes("const replyDialogLabel = brandLeadDialogButtonLabel(leadId);") &&
    botSrc.includes("const replyProfileLabel = brandLeadProfileButtonLabel();") &&
    botSrc.includes("const replyContactsLabel = brandLeadContactUnlockButtonLabel();") &&
    botSrc.includes("`• ${escapeHtml(brandLeadWhatNextText(leadId, 'reply_sent'))}\\n`") &&
    botSrc.includes(".text(replyDialogLabel, `a:blead_view|id:${leadId}|w:${Number(lead.workspace_id)}`)") &&
    botSrc.includes(".text(replyProfileLabel, `a:wsp_open|ws:${Number(lead.workspace_id)}|m:ro|r:bl|l:${leadId}`)") &&
    botSrc.includes(".text(replyContactsLabel, `a:wsp_contact_req|ws:${Number(lead.workspace_id)}|r:bl|l:${leadId}`)"),
  'Expected post-reply receipt to keep brand-side dialog / vitrina / contacts follow-up CTAs in one system'
);

assert.ok(
  botSrc.includes("const followupDialogLabel = fromLead ? brandLeadDialogButtonLabel(leadId) : '⬅️ Назад';") &&
    botSrc.includes("const followupProfileLabel = fromLead ? brandLeadProfileButtonLabel() : '🪟 Витрина';") &&
    botSrc.includes("const followupWhatNext = fromLead ? brandLeadWhatNextText(leadId, 'contacts_open') : '';") &&
    botSrc.includes("lines.push(`💡 <b>Сейчас:</b> ${escapeHtml(followupWhatNext)}`);") &&
    botSrc.includes("kb2.row().text(followupDialogLabel, `a:blead_view|id:${leadId}|w:${wsId}`).text(followupProfileLabel, `a:wsp_open|ws:${wsId}|m:ro${ctxExtra}`);") &&
    botSrc.includes("kb2.row().text('💳 Купить ещё', `a:brand_pass|ws:0|ret:wsp|rws:${wsId}`);"),
  'Expected post-unlock contact-pack follow-up to use the same brand-side dialog / vitrina language and return path'
);

console.log('✅ smoke brand-side lead follow-ups contract OK');
