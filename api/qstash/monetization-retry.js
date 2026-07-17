import { redis, k, releaseLock } from '../../src/lib/redis.js';
import { setMonRetryMeta, setMonRetryDiag, setMonIntroDiag, setMonAcceptDiag, setMonUnlockDiag } from '../../src/lib/monDiag.js';
import { CFG } from '../../src/lib/config.js';
import { tgSendMessage } from '../../src/lib/tgApi.js';
import * as db from '../../src/db/queries.js';
import { _validateStarsPaymentStrict } from '../../src/bot/bot.js';
import { applyPaymentFallbackNoSession } from '../../src/bot/payments_fallback.js';
import { isPaymentsFallbackApplyEnabled } from '../../src/lib/paymentsOps.js';
import { queueOpsDigestSafe } from '../../src/lib/opsDigest.js';
import { getQStashDeliveryUrl, qstashPublishJSON, qstashVerifySignature } from '../../src/lib/qstash.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

function getHeader(req, name) {
  const n = String(name || '').toLowerCase();
  const h = req.headers || {};
  for (const kk of Object.keys(h)) {
    if (String(kk).toLowerCase() === n) return h[kk];
  }
  return undefined;
}

async function readRawBody(req, limitBytes = 256 * 1024) {
  return await new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new Error('payload_too_large'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function envInt(name, def, opts = {}) {
  const raw = process?.env?.[name];
  if (raw === undefined || raw === null || raw === '') return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  let v = Math.trunc(n);
  if (opts.min !== undefined && v < opts.min) v = opts.min;
  if (opts.max !== undefined && v > opts.max) v = opts.max;
  return v;
}

async function safeTgSend(chatId, text, opts = {}) {
  try {
    if (!chatId) return { ok: false, skipped: true };
    return await tgSendMessage(chatId, text, opts);
  } catch {
    return { ok: false };
  }
}

function asInt(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

function brandAppAcceptPendingKey(appId) {
  return k(['brand_app', 'accept_pending', Number(appId || 0)]);
}

async function safeReleaseMonLock(lockKey, lockToken) {
  const lk = String(lockKey || '');
  const tok = String(lockToken || '');
  if (!lk || !tok) return;

  // Safety: release only our own monetization locks.
  const prefix = k(['mon', 'lock']) + ':';
  if (!lk.startsWith(prefix)) return;

  try { await releaseLock(lk, tok); } catch {}
}

function contactPackFromWorkspace(ws, ttlDays) {
  const ws2 = ws || {};
  const ig = ws2.profile_ig ? String(ws2.profile_ig) : '';
  const portsRaw = Array.isArray(ws2.profile_portfolio_urls) ? ws2.profile_portfolio_urls : [];
  const ports = portsRaw.map((x) => String(x || '').trim()).filter(Boolean);
  const contactRaw = ws2.profile_contact ? String(ws2.profile_contact).trim() : '';
  const contactsObj = (ws2.profile_contacts && typeof ws2.profile_contacts === 'object') ? ws2.profile_contacts : null;

  const cTgRaw = contactsObj?.tg ? String(contactsObj.tg).trim() : '';
  const cTg = cTgRaw.replace(/^@/, '');
  const cEmail = contactsObj?.email ? String(contactsObj.email).trim() : '';
  const cPhone = contactsObj?.phone ? String(contactsObj.phone).trim() : '';
  const cSiteRaw = contactsObj?.site ? String(contactsObj.site).trim() : '';
  const cSite = cSiteRaw && !/^https?:\/\//i.test(cSiteRaw) ? ('https://' + cSiteRaw.replace(/^\/+/, '')) : cSiteRaw;
  const cOther = contactsObj?.other ? String(contactsObj.other).trim() : '';

  const hasStructured = !!(cTg || cEmail || cPhone || cSite || cOther);

  const lines = [];
  lines.push(`✅ <b>Контакт‑пакет</b> (доступ на <b>${ttlDays}</b> дн.)`);
  lines.push('');

  if (ws2.channel_username) {
    const un = String(ws2.channel_username).replace(/^@/, '');
    lines.push(`• Telegram: <a href="https://t.me/${un}">@${un}</a>`);
  }

  if (hasStructured) {
    if (cTg) lines.push(`• TG username: <a href="https://t.me/${cTg}">@${cTg}</a>`);
    if (cEmail) lines.push(`• Email: <a href="mailto:${cEmail}">${cEmail}</a>`);
    if (cPhone) lines.push(`• Phone: <b>${String(cPhone).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</b>`);
    if (cSite) lines.push(`• Website: <a href="${String(cSite).replace(/</g, '&lt;').replace(/>/g, '&gt;')}">${String(cSite).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</a>`);
    if (cOther) lines.push(`• Доп.: <b>${String(cOther).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</b>`);
  }

  if (contactRaw) {
    // legacy contact: keep it as plain text to avoid link-bypass formatting
    lines.push(`• Контакт: <b>${String(contactRaw).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</b>`);
  }

  if (ig) lines.push(`• Instagram: <a href="https://instagram.com/${ig}">@${ig}</a>`);

  if (ports.length) {
    const u0 = String(ports[0] || '').trim();
    if (u0) lines.push(`• Портфолио: <a href="${u0}">${u0}</a>${ports.length > 1 ? ` <i>+ ещё ${ports.length - 1}</i>` : ''}`);
  }

  return lines.join('\n');
}

function orphanedAutohealChainMax() {
  return Math.max(0, Number(CFG.PAYMENTS_ORPHANED_AUTOHEAL_CHAIN_MAX || 0) || 0);
}

async function queueOrphanedAutohealNext({ chainId, chainDepth, source = 'worker' } = {}) {
  const chain = String(chainId || '').trim();
  const curDepth = Math.max(0, Number(chainDepth || 0) || 0);
  const nextDepth = curDepth + 1;
  const maxDepth = orphanedAutohealChainMax();
  if (!chain) return { queued: false, skipped: 'missing_chain_id' };
  if (maxDepth <= 0) return { queued: false, skipped: 'chain_disabled' };
  if (nextDepth > maxDepth) return { queued: false, skipped: 'depth_limit' };

  const url = getQStashDeliveryUrl('/api/qstash/monetization-retry');
  if (!url) return { queued: false, skipped: 'public_base_url_missing' };

  await qstashPublishJSON({
    url,
    body: {
      action: 'orphaned_autoheal',
      chain_id: chain,
      chain_depth: nextDepth,
      chain_source: String(source || 'worker').slice(0, 24),
    },
    deduplicationId: `mon:autoheal:${chain}:${nextDepth}`,
    retries: 2,
    timeout: '20s',
  });

  return { queued: true, chainId: chain, nextDepth };
}

async function processOrphanedAutohealBatch({ chainId = '', chainDepth = 0, chainSource = 'worker' } = {}) {
  const fbOn = await isPaymentsFallbackApplyEnabled();
  if (!CFG.PAYMENTS_ORPHANED_AUTOHEAL_ENABLED || !fbOn) {
    return { enabled: false, checked: 0, applied: 0, failed: 0, skipped: 0, skipped_young: 0, chain_enqueued: false, chain_id: chainId || null, chain_depth: Math.max(0, Number(chainDepth || 0) || 0), chain_source: String(chainSource || 'worker') };
  }

  const batch = Math.max(0, Number(CFG.PAYMENTS_ORPHANED_AUTOHEAL_BATCH || 20) || 0);
  if (batch <= 0) {
    return { enabled: true, checked: 0, applied: 0, failed: 0, skipped: 0, skipped_young: 0, chain_enqueued: false, chain_id: chainId || null, chain_depth: Math.max(0, Number(chainDepth || 0) || 0), chain_source: String(chainSource || 'worker') };
  }

  let applied = 0;
  let failed = 0;
  let skipped = 0;
  const failedIds = [];
  const failedReasons = [];
  let notifySkipped = 0;
  const notifySkippedIds = [];
  let validationFailed = 0;
  const validationFailedIds = [];
  const validationFailedReasons = [];
  let manualRequired = 0;
  const manualRequiredIds = [];
  const manualRequiredReasons = [];

  const minAgeSec = Math.max(0, Number(CFG.PAYMENTS_ORPHANED_AUTOHEAL_MIN_AGE_SEC || 0) || 0);
  const cand = await db.claimOrphanedMissingSessionPaymentsForAutoheal(batch, minAgeSec);
  const skippedYoung = 0;

  for (const r of cand) {
    try {
      const v = await _validateStarsPaymentStrict({
        payload: String(r.invoice_payload || ''),
        currency: String(r.currency || 'XTR'),
        totalAmount: Number(r.total_amount || 0),
        payerUserId: Number(r.user_id || 0) || null,
      });
      if (!v || !v.ok) {
        const rr = String(v?.reason || 'validation_failed');
        validationFailed += 1;
        if (validationFailedIds.length < 5) validationFailedIds.push(Number(r.id));
        if (validationFailedReasons.length < 3) validationFailedReasons.push(rr);
        try { await db.setPaymentStatus(Number(r.id), 'ORPHANED', `autoheal_manual_required:${rr}`); } catch {}
        skipped += 1;
        continue;
      }

      const fb = await applyPaymentFallbackNoSession({
        paymentId: Number(r.id),
        paymentUserId: Number(r.user_id),
        invoicePayload: String(r.invoice_payload || ''),
        appliedByUserId: Number(r.user_id),
        totalAmount: Number(r.total_amount || 0),
        currency: String(r.currency || 'XTR'),
        telegramPaymentChargeId: String(r.telegram_payment_charge_id || ''),
      });

      if (fb && fb.applied) {
        applied += 1;
        try {
          const tgId = Number(r.tg_id || 0);
          if (!tgId) {
            notifySkipped += 1;
            if (notifySkippedIds.length < 5) notifySkippedIds.push(Number(r.id));
          } else {
            let msg = '✅ Оплата применена автоматически (восстановлено после задержки).';
            if (fb.kind === 'brand_pass') msg += `\n\n💳 Кредиты начислены: +${Number(fb.credits || 0)}.`;
            if (fb.kind === 'brand_plan') msg += `\n\n⭐️ Brand Plan активирован (${String(fb.plan || '')}).`;
            if (fb.kind === 'pro') msg += `\n\n⭐️ PRO активирован.`;
            if (fb.kind === 'founder_brand') msg += `\n\n⭐️ Founder Sale применён.`;
            await safeTgSend(tgId, msg);
          }
        } catch {
          notifySkipped += 1;
          if (notifySkippedIds.length < 5) notifySkippedIds.push(Number(r.id));
        }
      } else {
        skipped += 1;
        const rr = String(fb?.reason || '');
        if (rr === 'unsupported_payload' || rr === 'missing_userid_or_wsid' || rr === 'bad_input' || rr === 'user_mismatch') {
          manualRequired += 1;
          if (manualRequiredIds.length < 5) manualRequiredIds.push(Number(r.id));
          if (manualRequiredReasons.length < 3) manualRequiredReasons.push(rr);
          try { await db.setPaymentStatus(Number(r.id), 'ORPHANED', `autoheal_manual_required:${rr}`); } catch {}
        }
      }
    } catch (e) {
      failed += 1;
      try {
        if (failedIds.length < 5) failedIds.push(Number(r.id));
        if (failedReasons.length < 3) failedReasons.push(String(e?.message || e).slice(0, 120));
      } catch {}
    }
  }

  if (notifySkipped > 0) {
    await queueOpsDigestSafe({ group: 'ops', reason: 'autoheal_notify_failed', title: 'Auto-heal ORPHANED: notify skipped', paymentId: notifySkippedIds.length ? notifySkippedIds[0] : null, kind: 'payments', payload: '', extra: [ `source=${String(chainSource || 'worker')}`, `Applied: ${applied}`, `Notify skipped: ${notifySkipped}`, `Ids: ${notifySkippedIds.join(',') || '-'}` ].filter(Boolean), dedupId: `autoheal_notify_failed:${String(chainId || 'na')}:${Math.max(0, Number(chainDepth || 0) || 0)}` });
  }
  if (failed > 0) {
    await queueOpsDigestSafe({ group: 'ops', reason: 'autoheal_failed', title: 'Auto-heal ORPHANED missing_session: failures', paymentId: failedIds.length ? failedIds[0] : null, kind: 'payments', payload: '', extra: [ `source=${String(chainSource || 'worker')}`, `Checked: ${cand.length}`, `Applied: ${applied}`, `Failed: ${failed}`, `Ids: ${failedIds.join(',') || '-'}`, failedReasons.length ? `Reason: ${failedReasons[0]}` : '' ].filter(Boolean), dedupId: `autoheal_failed:${String(chainId || 'na')}:${Math.max(0, Number(chainDepth || 0) || 0)}` });
  }
  if (validationFailed > 0) {
    await queueOpsDigestSafe({ group: 'ops', reason: 'autoheal_validation_failed', title: 'Auto-heal ORPHANED: strict validation failed', paymentId: validationFailedIds.length ? validationFailedIds[0] : null, kind: 'payments', payload: '', extra: [ `source=${String(chainSource || 'worker')}`, `Checked: ${cand.length}`, `Applied: ${applied}`, `Validation failed: ${validationFailed}`, `Ids: ${validationFailedIds.join(',') || '-'}`, validationFailedReasons.length ? `Reason: ${validationFailedReasons[0]}` : '' ].filter(Boolean), dedupId: `autoheal_validation_failed:${String(chainId || 'na')}:${Math.max(0, Number(chainDepth || 0) || 0)}` });
  }
  if (manualRequired > 0) {
    await queueOpsDigestSafe({ group: 'ops', reason: 'autoheal_manual_required_failed', title: 'Auto-heal ORPHANED: manual review required', paymentId: manualRequiredIds.length ? manualRequiredIds[0] : null, kind: 'payments', payload: '', extra: [ `source=${String(chainSource || 'worker')}`, `Checked: ${cand.length}`, `Applied: ${applied}`, `Manual required: ${manualRequired}`, `Ids: ${manualRequiredIds.join(',') || '-'}`, manualRequiredReasons.length ? `Reason: ${manualRequiredReasons[0]}` : '' ].filter(Boolean), dedupId: `autoheal_manual_required:${String(chainId || 'na')}:${Math.max(0, Number(chainDepth || 0) || 0)}` });
  }

  let chainEnqueued = false;
  let chainDepthNext = null;
  if (cand.length >= batch) {
    try {
      const q = await queueOrphanedAutohealNext({ chainId, chainDepth, source: chainSource });
      chainEnqueued = !!q?.queued;
      chainDepthNext = q?.nextDepth ?? null;
    } catch (e) {
      await queueOpsDigestSafe({ group: 'ops', reason: 'autoheal_chain_enqueue_failed', title: 'Auto-heal ORPHANED: chain enqueue failed', paymentId: cand[0]?.id ? Number(cand[0].id) : null, kind: 'payments', payload: '', extra: [ `source=${String(chainSource || 'worker')}`, `Checked: ${cand.length}`, `Depth: ${Math.max(0, Number(chainDepth || 0) || 0)}`, String(e?.name || 'Error') + ': ' + String(e?.message || e).slice(0, 180) ].filter(Boolean), dedupId: `autoheal_chain_enqueue_failed:${String(chainId || 'na')}:${Math.max(0, Number(chainDepth || 0) || 0)}` });
    }
  }

  return { enabled: true, checked: cand.length, applied, failed, skipped, skipped_young: Number(skippedYoung || 0), chain_enqueued: chainEnqueued, chain_id: chainId || null, chain_depth: Math.max(0, Number(chainDepth || 0) || 0), chain_depth_next: chainDepthNext, chain_source: String(chainSource || 'worker') };
}

export default async function handler(req, res) {
  let payload = {};
  let action = '';
  let nowIso = '';
  try {
    if (req.method !== 'POST') {
      res.status(405).end('Method Not Allowed');
      return;
    }

    const rawBody = await readRawBody(req);

    const signature = getHeader(req, 'Upstash-Signature');
    const url = getQStashDeliveryUrl('/api/qstash/monetization-retry');
    if (!url) {
      await setMonRetryDiag({ status: 'error', errorCode: 'public_base_url_missing' });
      res.status(500).json({ ok: false, error: 'public_base_url_missing' });
      return;
    }

    try {
      await qstashVerifySignature({ signature, body: rawBody, url });
    } catch (e) {
      const code = String(e?.message || 'error');
      if (code === 'qstash_lib_missing') {
        await setMonRetryDiag({ status: 'error', errorCode: 'qstash_disabled' });
        res.status(503).json({ ok: false, error: 'qstash_disabled' });
        return;
      }
      if (code === 'qstash_signature_missing') {
        await setMonRetryDiag({ status: 'error', errorCode: 'signature_missing' });
        res.status(401).json({ ok: false, error: 'signature_missing' });
        return;
      }
      if (code === 'qstash_invalid_signature') {
        await setMonRetryDiag({ status: 'error', errorCode: 'invalid_signature' });
        res.status(401).json({ ok: false, error: 'invalid_signature' });
        return;
      }
      await setMonRetryDiag({ status: 'error', errorCode: code });
      res.status(500).json({ ok: false, error: code });
      return;
    }

    payload = {};
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      payload = {};
    }

    action = String(payload.action || '').trim();
    nowIso = new Date().toISOString();

    // Redis breadcrumbs for ops (Redis-only)
    await setMonRetryMeta({ atIso: nowIso, action });

    const lockKey = String(payload.lock_key || payload.lockKey || '');
    const lockToken = String(payload.lock_token || payload.lockToken || '');

    try {
      if (action === 'brand_app_accept') {
      const appId = asInt(payload.app_id || payload.appId || 0);
      const actorUserId = asInt(payload.actor_user_id || payload.actorUserId || 0);
      const actorTgId = asInt(payload.actor_tg_id || payload.actorTgId || 0);
      const pendingKey = brandAppAcceptPendingKey(appId);

      // STEP182: accept breadcrumbs (Redis-only)
      await setMonAcceptDiag({ source: 'worker',  atIso: nowIso, appId });

      if (!appId) {
        try { await redis.del(pendingKey); } catch {}
        await setMonAcceptDiag({ source: 'worker',  atIso: nowIso, status: 'skipped', errorCode: 'bad_app_id', appId: appId || null });
        await setMonRetryDiag({ status: 'skipped', errorCode: 'bad_app_id' });
        res.status(200).json({ ok: true, skipped: 'bad_app_id' });
        return;
      }

      const cost = envInt('BRAND_APP_ACCEPT_COST', 1, { min: 0, max: 10 });

      // Get app (DB truth)
      const app = await db.getBrandApplicationById(appId);
      if (!app) {
        try { await redis.del(pendingKey); } catch {}
        await setMonAcceptDiag({ source: 'worker',  atIso: nowIso, status: 'skipped', errorCode: 'missing', appId });
        await setMonRetryDiag({ status: 'skipped', errorCode: 'missing' });
        res.status(200).json({ ok: true, skipped: 'missing' });
        return;
      }

      const brandUserId = asInt(app.brand_user_id || 0);
      const creatorTgId = asInt(app.creator_tg_id || 0);

      // Exactly-once accept+charge (idempotent)
      const r = await db.acceptBrandApplicationWithCharge(appId, actorUserId || null, brandUserId, cost);

      try { await redis.del(pendingKey); } catch {}

      // STEP182: accept outcome breadcrumbs (Redis-only)
      try {
        const st = (r && (r.status === 'accepted' || r.status === 'insufficient_credits')) ? 'ok'
          : (r && (r.status === 'already_accepted' || r.status === 'already')) ? 'skipped'
          : (r ? 'ok' : 'error');
        const code = (r && (r.status === 'accepted')) ? 'accepted'
          : (r && (r.status === 'insufficient_credits')) ? 'need_paywall'
          : (r && (r.status === 'already_accepted' || r.status === 'already')) ? 'already'
          : (r && r.status) ? String(r.status) : '';
        await setMonAcceptDiag({ source: 'worker',  atIso: nowIso, status: st, errorCode: code, appId });
      } catch {}

      // Best-effort: keep Redis credits cache in sync.
      if (r?.status === 'accepted' && r.left !== null && r.left !== undefined) {
        try { await redis.set(k(['brand_credits', brandUserId]), String(asInt(r.left, 0)), { ex: envInt('BRAND_CREDITS_CACHE_TTL_SEC', 60, { min: 5, max: 3600 }) }); } catch {}
      }

      // Notify exactly-once (Redis guard)
      const notifiedKey = k(['brand_app', 'accept_notified', appId]);
      let alreadyNotified = false;
      try { alreadyNotified = !!(await redis.get(notifiedKey)); } catch {}

      if (!alreadyNotified) {
        // Persist thread line only when we actually accept now (not for missing/insufficient)
        if (r?.status === 'accepted') {
          try {
            await db.appendBrandApplicationThreadMessage(appId, {
              from: 'system',
              text: 'Заявка принята ✅',
              at: nowIso,
              by_user_id: actorUserId || null,
            });
          } catch {}
        }

        // Creator DM (with buttons)
        if (creatorTgId) {
          const kb = {
            inline_keyboard: [
              [
                { text: '📨 Открыть заявку', callback_data: `a:brand_app_card|id:${appId}` },
                { text: '💬 Ответить', callback_data: `a:brand_app_chat|id:${appId}` },
              ],
              [
                { text: '📋 Меню', callback_data: 'a:menu' },
                { text: '🏠 Домой', callback_data: 'a:home' },
              ],
            ],
          };

          const msg =
            `✅ <b>Заявка принята</b>\n\n` +
            `Бренд принял твою заявку. Теперь можно продолжить диалог прямо в боте.`;

          await safeTgSend(creatorTgId, msg, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
        }

        // Brand actor DM (optional)
        if (actorTgId) {
          const okKb = {
            inline_keyboard: [
              [
                { text: '📨 Открыть заявку', callback_data: `a:brand_app_view|id:${appId}|s:in_progress|p:0` },
                { text: '💬 В работе', callback_data: 'a:brand_apps|ws:0|s:in_progress|p:0' },
              ],
              [
                { text: '📋 Меню', callback_data: 'a:menu' },
                { text: '🏠 Домой', callback_data: 'a:home' },
              ],
            ],
          };
          const failKb = {
            inline_keyboard: [
              [
                { text: '📨 Открыть заявку', callback_data: `a:brand_app_view|id:${appId}|s:new|p:0` },
              ],
              [
                { text: '📋 Меню', callback_data: 'a:menu' },
                { text: '🏠 Домой', callback_data: 'a:home' },
              ],
            ],
          };

          const msg = (r?.status === 'insufficient_credits')
            ? `⚠️ <b>Недостаточно кредитов</b>

Чтобы принять заявку, докупи кредиты и повтори.`
            : `✅ <b>Готово</b>

Кредит списан после обработки, а заявка теперь должна быть во вкладке «💬 В работе». Если UI ещё не обновился — нажми «Открыть заявку».`;

          await safeTgSend(actorTgId, msg, {
            parse_mode: 'HTML',
            reply_markup: (r?.status === 'insufficient_credits') ? failKb : okKb,
            disable_web_page_preview: true,
          });
        }

        try { await redis.set(notifiedKey, '1', { ex: 90 * 24 * 60 * 60 }); } catch {}
      }

      await setMonRetryDiag({ status: 'ok' });
      res.status(200).json({ ok: true, action, status: r?.status || 'unknown' });
      return;
    }

    if (action === 'wsp_contact_unlock') {
      const wsId = asInt(payload.ws_id || payload.wsId || payload.ws || 0);
      const brandUserId = asInt(payload.brand_user_id || payload.brandUserId || payload.uid || 0);
      const actorTgId = asInt(payload.actor_tg_id || payload.actorTgId || 0);

      // STEP182: unlock breadcrumbs (Redis-only)
      await setMonUnlockDiag({ source: 'worker',  atIso: nowIso, wsId });

      if (!wsId || !brandUserId) {
        await setMonUnlockDiag({ source: 'worker',  atIso: nowIso, status: 'skipped', errorCode: 'bad_args', wsId: wsId || null });
        await setMonRetryDiag({ status: 'skipped', errorCode: 'bad_args' });
        res.status(200).json({ ok: true, skipped: 'bad_args' });
        return;
      }

      // Owner should never pay.
      let isOwner = false;
      try {
        const ws = await db.getWorkspaceAny(wsId);
        if (ws && asInt(ws.owner_user_id || 0) === brandUserId) isOwner = true;
      } catch {}

      const ttlDays = envInt('CONTACT_UNLOCK_TTL_DAYS', 30, { min: 1, max: 365 });
      const ttlSec = ttlDays * 24 * 60 * 60;
      const cost = envInt('CONTACT_UNLOCK_COST', 1, { min: 0, max: 10 });

      if (isOwner) {
        // heal Redis unlock cache for owner (free)
        try { await redis.set(k(['wsp_contact', wsId, brandUserId]), '1', { ex: ttlSec }); } catch {}
        if (actorTgId) {
          await safeTgSend(actorTgId, '✅ Это твоя витрина. Контакты доступны бесплатно.', { parse_mode: 'HTML' });
        }
        await setMonUnlockDiag({ source: 'worker',  atIso: nowIso, status: 'ok', errorCode: 'owner_free', wsId });
        await setMonRetryDiag({ status: 'ok' });
        res.status(200).json({ ok: true, action, status: 'owner_free' });
        return;
      }

      const r = await db.unlockWorkspaceContactsWithCredits(brandUserId, wsId, cost, ttlSec);

      if (!r?.ok) {
        if (r?.error === 'no_contacts' || r?.error === 'missing_ws') {
          const code = r?.error === 'missing_ws' ? 'missing_ws' : 'no_contacts';

          if (actorTgId) {
            const kb = {
              inline_keyboard: [
                [
                  { text: '🪟 Витрина', callback_data: `a:wsp_open|ws:${wsId}` },
                  { text: '📋 Меню', callback_data: 'a:menu' },
                ],
                [
                  { text: '🏠 Домой', callback_data: 'a:home' },
                ],
              ],
            };

            const msg = (code === 'missing_ws')
              ? `⚠️ <b>Витрина не найдена</b>

Похоже, кнопка устарела или профиль удалён.
<b>Списания не было.</b>`
              : `⚠️ <b>Контактов пока нет</b>

У креатора нет контактов/ссылок для разлока.
<b>Списания не было.</b>

Попроси креатора добавить контакты и попробуй позже.`;

            await safeTgSend(actorTgId, msg, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
          }

          await setMonUnlockDiag({ source: 'worker',  atIso: nowIso, status: 'skipped', errorCode: code, wsId });
          await setMonRetryDiag({ status: 'ok' });
          res.status(200).json({ ok: true, action, status: code });
          return;
        }

        if (r?.needPaywall && actorTgId) {
          const kb = {
            inline_keyboard: [
              [
                { text: '💳 Купить ещё', callback_data: 'a:brand_pass|ws:0|ret:wsp|rws:' + wsId },
              ],
              [
                { text: '🪟 Витрина', callback_data: `a:wsp_open|ws:${wsId}` },
                { text: '📋 Меню', callback_data: 'a:menu' },
              ],
            ],
          };
          await safeTgSend(actorTgId, '⚠️ <b>Недостаточно кредитов</b>\n\nДокупи кредиты и повтори разлок.', { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
        }
        await setMonUnlockDiag({ source: 'worker',  atIso: nowIso, status: 'ok', errorCode: 'need_paywall', wsId });
        await setMonRetryDiag({ status: 'ok' });
        res.status(200).json({ ok: true, action, status: 'need_paywall' });
        return;
      }

      // Cache unlock in Redis (best-effort)
      try { await redis.set(k(['wsp_contact', wsId, brandUserId]), '1', { ex: ttlSec }); } catch {}

      // Best-effort: keep Redis credits cache in sync (UI is Redis-only)
      if (r.charged && r.left !== null && r.left !== undefined) {
        try { await redis.set(k(['brand_credits', brandUserId]), String(asInt(r.left, 0)), { ex: envInt('BRAND_CREDITS_CACHE_TTL_SEC', 60, { min: 5, max: 3600 }) }); } catch {}
      }

      // DM with contact pack (best-effort)
      if (actorTgId) {
        try {
          const ws = await db.getWorkspaceAny(wsId);
          const kb = {
            inline_keyboard: [
              [
                { text: '🪟 Витрина', callback_data: `a:wsp_open|ws:${wsId}|m:ro` },
                { text: '💳 Купить ещё', callback_data: `a:brand_pass|ws:0|ret:wsp|rws:${wsId}` },
              ],
              [
                { text: '📋 Меню', callback_data: 'a:menu' },
                { text: '🏠 Домой', callback_data: 'a:home' },
              ],
            ],
          };

          const msg = ws ? contactPackFromWorkspace(ws, ttlDays) : `✅ Контакты открыты на <b>${ttlDays}</b> дн.\n\nОткрой витрину — там всё будет видно.`;
          await safeTgSend(actorTgId, msg, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
        } catch {
          await safeTgSend(actorTgId, `✅ Контакты открыты на <b>${ttlDays}</b> дн.`, { parse_mode: 'HTML' });
        }
      }

      await setMonUnlockDiag({ source: 'worker',  atIso: nowIso, status: 'ok', errorCode: r && r.charged ? 'charged' : 'ok', wsId });
      await setMonRetryDiag({ status: 'ok' });
      res.status(200).json({ ok: true, action, status: 'ok', charged: !!r.charged });
      return;
    }


    if (action === 'intro_open') {
      const offerId = asInt(payload.offer_id || payload.offerId || payload.o || 0);
      const buyerUserId = asInt(payload.buyer_user_id || payload.buyerUserId || payload.user_id || payload.userId || 0);
      const actorTgId = asInt(payload.actor_tg_id || payload.actorTgId || 0);
      const wsCtx = asInt(payload.ws_ctx || payload.wsCtx || payload.ws || 0);
      const forceBrand = asInt(payload.force_brand || payload.forceBrand || 0) === 1;

      if (!offerId || !buyerUserId) {
        await setMonIntroDiag({ atIso: nowIso, status: 'skipped', errorCode: 'bad_args', offerId: offerId || null });
        await setMonRetryDiag({ status: 'skipped', errorCode: 'bad_args' });
        res.status(200).json({ ok: true, skipped: 'bad_args' });
        return;
      }

      // Intro breadcrumbs (Redis-only)
      await setMonIntroDiag({ atIso: nowIso, offerId });

      const cost = Math.max(1, Number(CFG.INTRO_COST_PER_INTRO || 1));
      const trialCredits = Math.max(0, Number(CFG.INTRO_TRIAL_CREDITS || 0));

      let isVerified = false;
      if (CFG.VERIFICATION_ENABLED) {
        try {
          const v = await db.getUserVerification(buyerUserId);
          isVerified = String(v?.status || '').toUpperCase() === 'APPROVED' && String(v?.kind || '').toLowerCase() === 'brand';
        } catch (e) {
          // Rolling upgrade safety: missing relation -> treat as unverified
          const code = String(e?.code || '');
          if (!(code === '42P01' || String(e?.message || '').includes('user_verifications'))) throw e;
          isVerified = false;
        }
      }

      const dailyLimit = Math.max(0, Number(isVerified ? CFG.INTRO_DAILY_LIMIT : CFG.INTRO_DAILY_LIMIT_UNVERIFIED));

      const rIntro = await db.getOrCreateBarterThreadWithCredits(offerId, buyerUserId, {
        ...(forceBrand ? { forceBrand: true } : {}),
        cost,
        trialCredits,
        dailyLimit: dailyLimit > 0 ? dailyLimit : null,
        retryEnabled: CFG.INTRO_RETRY_ENABLED
      });

      // Best-effort: keep Redis credits cache in sync (UI is Redis-only)
      if (rIntro && rIntro.balance !== null && rIntro.balance !== undefined) {
        try {
          await redis.set(
            k(['brand_credits', buyerUserId]),
            String(asInt(rIntro.balance, 0)),
            { ex: envInt('BRAND_CREDITS_CACHE_TTL_SEC', 60, { min: 5, max: 3600 }) }
          );
        } catch {}
      }

      if (!rIntro) {
        if (actorTgId) {
          await safeTgSend(actorTgId, '⚠️ Не получилось открыть диалог. Возможно оффер закрыт.', { parse_mode: 'HTML' });
        }
        await setMonIntroDiag({ atIso: nowIso, status: 'skipped', errorCode: 'missing', offerId });
        await setMonRetryDiag({ status: 'ok' });
        res.status(200).json({ ok: true, action, status: 'missing' });
        return;
      }

      if (rIntro.limitReached) {
        if (actorTgId) {
          const lim = asInt(rIntro.dailyLimit || dailyLimit || 0);
          const used = asInt(rIntro.dailyUsed || 0);
          const kb = {
            inline_keyboard: [
              [
                { text: '📥 Inbox', callback_data: `a:bx_inbox|ws:${wsCtx}|p:0|h:menu` },
              ],
              [
                { text: '📋 Меню', callback_data: 'a:menu' },
                { text: '🏠 Домой', callback_data: 'a:home' },
              ],
            ],
          };
          await safeTgSend(
            actorTgId,
            `⚠️ <b>Лимит интро на сегодня</b>

Лимит: <b>${lim}</b>
Использовано: <b>${used}</b>

Попробуй завтра.`,
            { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true }
          );
        }
        await setMonIntroDiag({ atIso: nowIso, status: 'skipped', errorCode: 'limit_reached', offerId });
        await setMonRetryDiag({ status: 'ok' });
        res.status(200).json({ ok: true, action, status: 'limit_reached' });
        return;
      }

      if (rIntro.needPaywall) {
        if (actorTgId) {
          const kb = {
            inline_keyboard: [
              [
                { text: '💳 Купить кредиты', callback_data: `a:brand_pass|ws:0|ret:offer|id:${offerId}` },
              ],
              [
                { text: '📥 Inbox', callback_data: `a:bx_inbox|ws:${wsCtx}|p:0|h:menu` },
                { text: '📋 Меню', callback_data: 'a:menu' },
              ],
            ],
          };
          await safeTgSend(
            actorTgId,
            `⚠️ <b>Недостаточно кредитов</b>

Чтобы открыть новый диалог (интро), докупи кредиты и повтори.`,
            { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true }
          );
        }
        await setMonIntroDiag({ atIso: nowIso, status: 'skipped', errorCode: 'need_paywall', offerId });
        await setMonRetryDiag({ status: 'ok' });
        res.status(200).json({ ok: true, action, status: 'need_paywall' });
        return;
      }

      if (!rIntro.ok || !rIntro.thread) {
        if (actorTgId) {
          await safeTgSend(actorTgId, '⚠️ Не получилось открыть диалог. Попробуй ещё раз позже.', { parse_mode: 'HTML' });
        }
        await setMonIntroDiag({ atIso: nowIso, status: 'error', errorCode: 'not_ok', offerId });
        await setMonRetryDiag({ status: 'ok' });
        res.status(200).json({ ok: true, action, status: 'not_ok' });
        return;
      }

      const threadId = asInt(rIntro.thread.id || 0);

      if (actorTgId) {
        const left = (rIntro.balance === null || rIntro.balance === undefined) ? null : asInt(rIntro.balance, 0);
        const amt = asInt(rIntro.chargedAmount || cost || 1);

        let head = '✅ <b>Диалог открыт</b>';
        if (rIntro.retryUsed) head = '🎟 <b>Диалог открыт</b>';

        let body = '';
        if (rIntro.charged) {
          body = `

Списано: <b>${amt}</b> кредит(ов).` + (left !== null ? ` Осталось: <b>${left}</b>.` : '');
        } else if (rIntro.retryUsed) {
          body = `

Использован повторный кредит (retry).`;
        } else {
          body = `

Диалог уже был открыт ранее — списания нет.`;
        }

        const kb = {
          inline_keyboard: [
            [
              { text: '💬 Открыть диалог', callback_data: `a:bx_thread|ws:${wsCtx}|t:${threadId}|p:0|b:inbox|o:${offerId}|h:menu` },
            ],
            [
              { text: '📥 Inbox', callback_data: `a:bx_inbox|ws:${wsCtx}|p:0|h:menu` },
              { text: '📋 Меню', callback_data: 'a:menu' },
            ],
          ],
        };

        await safeTgSend(actorTgId, `${head}${body}`, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
      }

      await setMonIntroDiag({ atIso: nowIso, status: 'ok', errorCode: '', offerId });
      await setMonRetryDiag({ status: 'ok' });
      res.status(200).json({ ok: true, action, status: 'ok', threadId });
      return;
    }

    if (action === 'orphaned_autoheal') {
      const chainId = String(payload.chain_id || payload.chainId || '').trim() || `worker-${Date.now()}`;
      const chainDepth = Math.max(0, Number(payload.chain_depth || payload.chainDepth || 0) || 0);
      const chainSource = String(payload.chain_source || payload.chainSource || 'worker').trim() || 'worker';
      const out = await processOrphanedAutohealBatch({ chainId, chainDepth, chainSource });
      await setMonRetryDiag({ status: 'ok', errorCode: out.chain_enqueued ? 'chain_enqueued' : '' });
      res.status(200).json({ ok: true, action, status: 'ok', ...out });
      return;
    }

    await setMonRetryDiag({ status: 'skipped', errorCode: 'unknown_action' });
    res.status(200).json({ ok: true, skipped: 'unknown_action' });
    } finally {
      await safeReleaseMonLock(lockKey, lockToken);
    }

  } catch (e) {
    // If DB is down -> return 500 so QStash retries.
    console.error('[monetization-retry] error', String(e?.message || e));
    try {
      if (action === 'intro_open') {
        const offerId = asInt(payload?.offer_id || payload?.offerId || payload?.o || 0);
        await setMonIntroDiag({ atIso: (nowIso || new Date().toISOString()), status: 'error', errorCode: e?.message || 'error', offerId: offerId || null });
      }
    } catch {}
    await setMonRetryDiag({ status: 'error', errorCode: e?.message || 'error' });
    res.status(500).json({ ok: false, error: String(e?.message || 'error') });
  }
}
