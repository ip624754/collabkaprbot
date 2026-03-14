// Payments (Telegram Stars) — extracted handler bundle from src/bot/bot.js
// Goal: reduce monolith surface without changing runtime behavior.
// This module is intentionally dependency-injected to avoid circular imports.

export function registerStarsPaymentsHandlers(deps = {}) {
  const {
    bot,
    db,
    CFG,
    InlineKeyboard,
    queueOpsAlert,
    getPaymentsRuntimeFlags,
    _validateStarsPaymentStrict,
    _safeKindFromPayload,
    isPaymentsFallbackApplyEnabled,
    notifyOfficialQueueAdmins,
    // Extra deps used inside the original handler
    redis,
    k,
    setExpectText,
    cbJoin,
    mfBackCb,
    escapeHtml,
    fmtCredits,
    setBrandCreditsCache,
    applyPaymentFallbackNoSession,
  } = deps;

  if (!bot) throw new Error('registerStarsPaymentsHandlers: bot is required');

  bot.command('paysupport', async (ctx) => {
    // Telegram requires /paysupport for bots with payments.
    // Redirect to unified support with payment context.
    const kb = new InlineKeyboard()
      .text('✍️ Написать в поддержку', 'a:support_write')
      .row()
  	  	  .text('📋 Меню', 'a:menu')
  	  	  .text('🏠 Home', 'a:home');
    await ctx.reply(
      `💬 <b>Поддержка по оплате / Stars</b>\n\nЕсли что-то пошло не так с оплатой — нажми кнопку ниже и опиши проблему.\n\n<b>Что указать:</b>\n• Что покупал (PRO / Brand Plan)\n• Примерное время оплаты\n• Скрин чека (если есть)`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });
  
  
  
  // --- Payments (Telegram Stars) ---
  bot.on('pre_checkout_query', async (ctx) => {
    // Hardening: validate payload + amount before letting Telegram charge.
    try {
      const q = ctx.update?.pre_checkout_query;
      const payload = String(q?.invoice_payload || '');
      const currency = String(q?.currency || 'XTR');
      const totalAmount = Number(q?.total_amount || 0);
  
      const { accept } = await getPaymentsRuntimeFlags();
      if (!accept) {
        await ctx.answerPreCheckoutQuery(false, { error_message: 'Платежи временно на паузе. Попробуй позже.' });
        return;
      }
  
      const v = await _validateStarsPaymentStrict({ payload, currency, totalAmount });
      if (!v.ok) {
        await ctx.answerPreCheckoutQuery(false, { error_message: 'Ошибка счета. Нажми /paysupport — поможем.' });
        try {
          // Best-effort: keep logs for debugging without spamming.
          console.warn('[PAY] pre_checkout rejected', { reason: v.reason, payload: String(payload).slice(0, 64), paid: totalAmount, expected: v.expected || 0, currency });
        } catch {}
        return;
      }
  
      await ctx.answerPreCheckoutQuery(true);
    } catch (e) {
      // Fail-safe: reject if we cannot validate.
      try {
        await ctx.answerPreCheckoutQuery(false, { error_message: 'Временно не могу проверить счет. Попробуй ещё раз.' });
      } catch (_) {
        // ignore
      }
    }
  });
  
  bot.on('message:successful_payment', async (ctx) => {
  const sp = ctx.message.successful_payment;
  const invoicePayload = sp?.invoice_payload || '';
  if (!invoicePayload) return;
  
  // ensure user exists
  const u = await db.upsertUser(ctx.from.id, ctx.from.username ?? null);
  
  const kind = _safeKindFromPayload(invoicePayload);
  
  db.trackEvent('payment_success', { userId: u.id, meta: { kind, payload: invoicePayload, amount: sp.total_amount, currency: sp.currency || 'XTR' } });
  
  const tgChargeId = String(sp.telegram_payment_charge_id || '');
  
  // 1) Old ledger: protects from Telegram retries/duplicates
  // NOTE: do NOT early-return on duplicates — we still want to ensure the canonical payments
  // ledger has the record and fulfillment can be retried safely.
  await db.recordStarsPayment({
    userId: u.id,
    kind,
    invoicePayload,
    currency: sp.currency,
    totalAmount: sp.total_amount,
    telegramPaymentChargeId: sp.telegram_payment_charge_id,
    providerPaymentChargeId: sp.provider_payment_charge_id,
    raw: sp
  });
  
  // 2) New payments ledger (admin apply + statuses)
  const pay = await db.insertPayment({
    userId: u.id,
    kind,
    invoicePayload,
    currency: sp.currency,
    totalAmount: sp.total_amount,
    telegramPaymentChargeId: sp.telegram_payment_charge_id,
    providerPaymentChargeId: sp.provider_payment_charge_id,
    raw: sp,
    status: 'RECEIVED'
  });
  let paymentId = pay?.id || null;
  if (pay && pay.inserted === false) {
    try {
      const existing = await db.getPaymentByTelegramChargeId(tgChargeId);
      paymentId = existing?.id || paymentId;
      if (existing && String(existing.status || '').toUpperCase() === 'APPLIED') {
        await ctx.reply('✅ Платеж уже обработан.');
        return;
      }
    } catch {
      await ctx.reply('✅ Платеж уже обработан.');
      return;
    }
  }
  
  const markStatus = async (status, note) => {
    if (!paymentId) return null;
    try {
      return await db.setPaymentStatus(paymentId, status, note);
    } catch {
      return null;
    }
  };
  const markApplied = async (note) => {
    if (!paymentId) return null;
    try {
      return await db.markPaymentApplied(paymentId, u.id, note);
    } catch {
      return null;
    }
  };
  
  const notifyPayOps = async (reason, extraLines = []) => {
    try {
      const userTag = ctx.from?.username ? `@${ctx.from.username}` : `tg:${ctx.from?.id}`;
      const amount = sp.total_amount;
      const currency = sp.currency || 'XTR';
  
      const extra = [];
      extra.push(`Kind: ${kind}`);
      extra.push(`Payload: ${invoicePayload}`);
      extra.push(`From: ${userTag} (userId=${u.id})`);
      extra.push(`Amount: ${amount} ${currency}`);
      extra.push(`TG charge: ${tgChargeId || '-'}`);
      extra.push(`PaymentId: ${paymentId || '-'}`);
      for (const x of (Array.isArray(extraLines) ? extraLines : [])) {
        const s = String(x || '').trim();
        if (s) extra.push(s);
      }
  
      // Anti-spam digest: first alert in a window is sent immediately, the rest is summarized.
      return await queueOpsAlert(ctx.api, {
        group: 'ops',
        reason: String(reason || 'pay_error'),
        title: 'Payments',
        paymentId: paymentId || null,
        userId: u.id,
        tgId: ctx.from?.id || null,
        kind: 'payments',
        payload: invoicePayload,
        extra,
      });
    } catch {
      return { sent: 0, error: 'notify_failed' };
    }
  };
  
  const isMatchPay = invoicePayload.startsWith('match_');
  const isFeatPay = invoicePayload.startsWith('feat_');
  const isOffpubPay = invoicePayload.startsWith('offpub_');
  
  // Runtime override: payments fallback apply (env OR Redis TTL flag).
  const payFbApplyEnabled = await isPaymentsFallbackApplyEnabled();
  
  // Hardening: validate Stars amount/currency/payload before any fulfillment.
  // Pre-checkout already rejects invalid invoices, but this covers retries/edge cases.
  {
    const v = await _validateStarsPaymentStrict({
      payload: invoicePayload,
      currency: sp.currency || 'XTR',
      totalAmount: sp.total_amount,
      payerUserId: u.id,
    });
  
    if (!v.ok) {
      const note = `validation_failed:${String(v.reason || 'unknown')} exp:${Number(v.expected || 0)} got:${Number(v.paid || sp.total_amount || 0)} cur:${String(sp.currency || 'XTR')}`;
      await markStatus('ORPHANED', note.slice(0, 240));
      db.trackEvent('payment_orphaned', { userId: u.id, meta: { kind, payload: invoicePayload, reason: 'validation_failed', v } });
      await notifyPayOps('validation_failed', [
        `Reason: ${String(v.reason || 'unknown')}`,
        `Expected: ${Number(v.expected || 0)} ${String(sp.currency || 'XTR')}`,
        `Paid: ${Number(v.paid || sp.total_amount || 0)} ${String(sp.currency || 'XTR')}`,
      ]);
      await ctx.reply('✅ Оплата получена. Но я не смог безопасно подтвердить счёт. Нажми /paysupport — поможем быстро.');
      return;
    }
  }
  
  // Official channel posts are always ORPHANED post-payment (moderation).
  if (isOffpubPay) {
    await markStatus('ORPHANED', 'postpay_orphaned');
    db.trackEvent('payment_orphaned', { userId: u.id, meta: { kind, payload: invoicePayload, reason: 'postpay_orphaned' } });
  
    let offerId = 0;
    let days = 0;
    let offer = null;
    try {
      const parts = String(invoicePayload).split('_');
      offerId = Number(parts[2]);
      days = Number(parts[3] || CFG.OFFICIAL_MANUAL_DEFAULT_DAYS);
      const channelChatId = Number(CFG.OFFICIAL_CHANNEL_ID || 0);
  
      if (offerId && channelChatId) {
        await db.upsertOfficialPostDraft({
          offerId,
          channelChatId,
          placementType: 'PAID',
          paymentId,
          slotDays: days
        });
      }
      offer = offerId ? await db.getBarterOfferPublic(offerId) : null;
    } catch (_) { /* ignore */ }
  
    // Notify super admins with direct actions (queue + publish + card).
    try {
      const wsId = offer?.workspace_id ? Number(offer.workspace_id) : 0;
      const fromTag = ctx.from?.username ? `@${ctx.from.username}` : `tg:${ctx.from?.id}`;
      await notifyOfficialQueueAdmins(ctx.api, {
        kind: 'paid',
        offerId,
        wsId,
        offerTitle: offer?.title || '',
        wsTitle: offer?.ws_title || '',
        channelUsername: offer?.channel_username || '',
        days,
        paymentId,
        fromTag
      });
    } catch (_) { /* ignore */ }
  
    // User confirmation + quick access to status screen.
    try {
      const wsId = offer?.workspace_id ? Number(offer.workspace_id) : 0;
      const kb = new InlineKeyboard();
      if (wsId && offerId) kb.text('📣 Статус офиц.канала', `a:off_manage|ws:${wsId}|o:${offerId}|p:0|back:my`).row();
      kb.text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');
  
      await ctx.reply('✅ Оплата получена! Оффер поставлен в очередь на публикацию в официальном канале. Модератор опубликует его вручную.', {
        reply_markup: kb
      });
    } catch {
      await ctx.reply('✅ Оплата получена! Оффер поставлен в очередь на публикацию в официальном канале. Модератор опубликует его вручную.');
    }
  
    return;
  }
  
  // Idempotency hardening (serverless + Telegram retries):
  // claim payment fulfillment in DB to prevent double-apply races.
  if (paymentId) {
    const claimed = await db.claimPaymentApplying(paymentId, u.id);
    if (!claimed) {
      // Either already APPLIED, or being processed by another runner.
      try {
        const existing = tgChargeId ? await db.getPaymentByTelegramChargeId(tgChargeId) : null;
        if (existing && String(existing.status || '').toUpperCase() === 'APPLIED') {
          await ctx.reply('✅ Платеж уже обработан.');
          return;
        }
      } catch {
        // ignore
      }
      await ctx.reply('⏳ Платёж уже обрабатывается. Если через пару минут не применится — нажми /paysupport.');
      return;
    }
  }
  
  const { autoApply } = await getPaymentsRuntimeFlags();
  if (!autoApply) {
    await markStatus('ORPHANED', 'auto_apply_paused');
    db.trackEvent('payment_orphaned', { userId: u.id, meta: { kind, payload: invoicePayload, reason: 'auto_apply_paused' } });
    await notifyPayOps('auto_apply_paused');
    await ctx.reply('✅ Платёж получен. Автовыдача сейчас на паузе. Если нужно — нажми «💬 Поддержка».');
    return;
  }
  
  // Smart Matching auto-apply (paid) — gated by env + runtime flag
  if (isMatchPay) {
    try {
      const parts = String(invoicePayload).split('_');
      const payUserId = Number(parts[1] || 0);
      const tierId = String(parts[2] || 'S').toUpperCase();
      const token = parts.slice(3).join('_');
  
      if (!payUserId || Number(payUserId) !== Number(u.id)) {
        await markStatus('ORPHANED', 'user_mismatch');
        await notifyPayOps('user_mismatch');
        await ctx.reply('✅ Платёж получен. Не удалось связать оплату с аккаунтом — нажми «💬 Поддержка» или напиши /paysupport.');
        return;
      }
  
      const tier = MATCH_TIERS.find(t => String(t.id) === String(tierId)) || MATCH_TIERS[0];
  
      let wsId = 0;
      let ret = '';
      let bpr = '';
      try {
        const data = token ? await redis.get(k(['pay_match', token])) : null;
        if (data) {
          wsId = Number(data.wsId || 0);
          if (Object.prototype.hasOwnProperty.call(data, 'ret')) ret = String(data.ret || '');
          if (Object.prototype.hasOwnProperty.call(data, 'bpr')) bpr = String(data.bpr || '');
          await redis.del(k(['pay_match', token]));
        }
      } catch {}
  
      const paid = Number(sp.total_amount || tier.stars || 0);
      const req = await db.createMatchingRequest(u.id, tier.id, paid);
      await setExpectText(ctx.from.id, { type: 'match_brief', requestId: req.id, wsId, count: tier.count, ret, bpr });
      await markApplied(`auto_apply_match:req:${req.id}`);
  
      const kb = new InlineKeyboard()
        .text('🎯 Smart Matching (подбор офферов)', cbJoin('a:match_home', { ws: wsId, ret, bpr }))
        .row()
        .text('⬅️ Назад', mfBackCb(wsId, ret, bpr))
        .text('📋 Меню', 'a:menu')
        .text('🏠 Home', 'a:home');
  
      await ctx.reply(
        `✅ <b>Оплата получена — Smart Matching активирован</b>\n\nПришли бриф одним сообщением (ниша, гео, аудитория, формат).`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
      return;
    } catch (e) {
      const em = String(e?.message || e).slice(0, 300);
      await markStatus('ERROR', `auto_apply_error: ${em.slice(0, 120)}`);
      await notifyPayOps('auto_apply_error', [`Error: <code>${escapeHtml(em)}</code>`]);
      await ctx.reply('✅ Оплата получена. Не смог автоматически запустить Smart Matching. Нажми «💬 Поддержка» — я уже получил алерт.');
      return;
    }
  }
  
  // Featured auto-apply (paid) — gated by env flag
  if (isFeatPay) {
    try {
      const parts = String(invoicePayload).split('_');
      const payUserId = Number(parts[1] || 0);
      const days = Number(parts[2] || 1);
      const token = parts.slice(3).join('_');
  
      if (!payUserId || Number(payUserId) !== Number(u.id)) {
        await markStatus('ORPHANED', 'user_mismatch');
        await notifyPayOps('user_mismatch');
        await ctx.reply('✅ Платёж получен. Не удалось связать оплату с аккаунтом — нажми «💬 Поддержка» или напиши /paysupport.');
        return;
      }
  
      const dur = FEATURED_DURATIONS.find(d => Number(d.days) === Number(days)) || FEATURED_DURATIONS.find(d => Number(d.days) === 7) || FEATURED_DURATIONS[0];
  
      let wsId = 0;
      let ret = '';
      let bpr = '';
      try {
        const data = token ? await redis.get(k(['pay_feat', token])) : null;
        if (data) {
          wsId = Number(data.wsId || 0);
          if (Object.prototype.hasOwnProperty.call(data, 'ret')) ret = String(data.ret || '');
          if (Object.prototype.hasOwnProperty.call(data, 'bpr')) bpr = String(data.bpr || '');
          await redis.del(k(['pay_feat', token]));
        }
      } catch {}
  
      const paid = Number(sp.total_amount || dur.stars || 0);
      const f = await db.createFeaturedPlacement(u.id, dur.days, paid);
      await setExpectText(ctx.from.id, { type: 'feat_content', featuredId: f.id, wsId, ret, bpr });
      await markApplied(`auto_apply_feat:id:${f.id}`);
  
      const kb = new InlineKeyboard()
        .text('🔥 Featured', cbJoin('a:feat_home', { ws: wsId, ret, bpr }))
        .row()
        .text('⬅️ Назад', mfBackCb(wsId, ret, bpr))
        .text('📋 Меню', 'a:menu')
        .text('🏠 Home', 'a:home');
  
      await ctx.reply(
        `✅ <b>Оплата получена — Featured активирован</b>\n\nПришли контент:\n• 1 строка — заголовок\n• далее описание\n• последняя строка — контакт (@username / ссылка)`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
      return;
    } catch (e) {
      const em = String(e?.message || e).slice(0, 300);
      await markStatus('ERROR', `auto_apply_error: ${em.slice(0, 120)}`);
      await notifyPayOps('auto_apply_error', [`Error: <code>${escapeHtml(em)}</code>`]);
      await ctx.reply('✅ Оплата получена. Не смог автоматически запустить Featured. Нажми «💬 Поддержка» — я уже получил алерт.');
      return;
    }
  }
  
  
  // Founder Sale activation
  if (invoicePayload.startsWith('founder_')) {
    try {
      const parts = String(invoicePayload || '').split('_');
      const productId = parts.slice(0, 3).join('_');
      const payUserId = Number(parts[3] || 0);
      const token = parts.slice(4).join('_');
  
      const data = token ? await redis.get(k(['pay_founder', token])) : null;
      const ok =
        data &&
        Number(data.userId) === payUserId &&
        Number(data.tgId) === Number(ctx.from.id) &&
        String(data.productId || '') === productId;
  
      if (!ok) {
        // Fallback: apply by payload even if Redis pay_* session expired.
        // Safe for founder_brand_* (no ws context needed). founder_creator_* still requires wsId from session.
        if (payFbApplyEnabled && payUserId && Number(payUserId) === Number(u.id) && paymentId) {
          try {
            const fb = await applyPaymentFallbackNoSession({
              paymentId,
              paymentUserId: u.id,
              invoicePayload: invoicePayload,
              appliedByUserId: u.id,
              totalAmount: sp.total_amount,
              currency: sp.currency || 'XTR',
              telegramPaymentChargeId: String(sp.telegram_payment_charge_id || ''),
            });
            if (fb && fb.applied) {
              const kb = new InlineKeyboard()
                .text('⭐️ Brand Plan', 'a:brand_plan|ws:0')
                .text('💳 Кредиты', 'a:brand_pass|ws:0')
                .row()
                .text('📋 Меню', 'a:menu')
                .text('🏠 Home', 'a:home');
              let msg = '✅ Founder Sale применён!';
              if (fb.kind === 'founder_brand') {
                msg += `
  
  ⭐️ Brand Plan Pro активирован на ${fb.days || 0} дней.`;
                if (fb.credits > 0) msg += `
  💳 +${fb.credits} кредитов начислено.`;
              }
              await ctx.reply(msg, { reply_markup: kb });
              return;
            }
          } catch { /* ignore */ }
        }
  
        await markStatus('ORPHANED', 'missing_session');
        const autoHeal = CFG.PAYMENTS_ORPHANED_AUTOHEAL_ENABLED && payFbApplyEnabled;
        const m = Math.max(1, Math.round(Number(CFG.PAYMENTS_ORPHANED_AUTOHEAL_MIN_AGE_SEC || 300) / 60));
        await ctx.reply(
          `✅ Платёж получен. Но сессия оплаты не найдена (возможно, истекла).${autoHeal ? `\n\n🔁 Я попробую применить оплату автоматически в течение ~${m} мин.` : ''}\n\nЕсли не применилось — напиши /start и нажми «💬 Поддержка».`
        );
        return;
      }
  
      const durationDays = Number(data.durationDays || 0) || 0;
      const credits = Number(data.credits || 0) || 0;
      const wsId = Number(data.wsId || 0) || 0;
  
      if (productId === 'founder_creator_12m') {
        if (!wsId) throw new Error('Missing wsId');
        await db.activateWorkspacePro(wsId, durationDays || 365);
        try {
          await db.auditWorkspace(wsId, payUserId, 'pro.activated.founder', {
            duration_days: durationDays || 365,
            currency: sp.currency,
            total_amount: sp.total_amount,
            telegram_payment_charge_id: sp.telegram_payment_charge_id
          });
        } catch {}
      } else {
        const d = durationDays || (productId === 'founder_brand_3m' ? 90 : 365);
        await db.activateBrandPlan(payUserId, 'pro', d);
        if (credits > 0) {
          const newBalance = await db.addBrandCredits(payUserId, credits);
          try { await setBrandCreditsCache(payUserId, newBalance); } catch {}
        }
      }
  
      try { await redis.del(k(['pay_founder', token])); } catch {}
      await markApplied(`auto_apply_founder:${productId}`);
  
      const kb = new InlineKeyboard();
      let msg = '✅ Founder Sale применён!';
      if (productId === 'founder_creator_12m') {
        msg += `\n\n⭐️ PRO активирован на ${durationDays || 365} дней.`;
        if (wsId) kb.text('⭐️ PRO', `a:ws_pro|ws:${wsId}`).text('📣 Мои каналы', 'a:ws_list').row();
      } else {
        const d = durationDays || (productId === 'founder_brand_3m' ? 90 : 365);
        msg += `\n\n⭐️ Brand Plan Pro активирован на ${d} дней.`;
        if (credits > 0) msg += `\n💳 +${credits} кредитов начислено.`;
        kb.text('⭐️ Brand Plan', 'a:brand_plan|ws:0').text('💳 Кредиты', 'a:brand_pass|ws:0').row();
      }
      kb.text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');
      await ctx.reply(msg, { reply_markup: kb });
      return;
    } catch (e) {
      const em = String(e?.message || e).slice(0, 300);
      await markStatus('ERROR', `auto_apply_error: ${em.slice(0, 120)}`);
      await notifyPayOps('auto_apply_error', [`Error: <code>${escapeHtml(em)}</code>`]);
      await ctx.reply('✅ Оплата получена. Не смог применить автоматически. Нажми «💬 Поддержка» — я уже получил алерт.');
      return;
    }
  }  // PRO activation
  if (invoicePayload.startsWith('pro_')) {
    try {
      const parts = invoicePayload.split('_');
      const wsId = Number(parts[1]);
  
      // New format: pro_<wsId>_<userId>_<token>
      // Old format (backwards compatible): pro_<wsId>_<token>
      let payUserId = 0;
      let token = '';
      if (parts.length >= 4 && /^\d+$/.test(String(parts[2] || ''))) {
        payUserId = Number(parts[2]);
        token = parts.slice(3).join('_');
      } else {
        token = parts.slice(2).join('_');
      }
  
      const data = await redis.get(k(['pay_pro', token]));
      const tgOk = !data?.tgId || Number(data.tgId) === Number(ctx.from.id);
      const userOk = !payUserId || Number(data?.ownerUserId) === payUserId;
  
      if (!data || Number(data.wsId) != wsId || !tgOk || !userOk) {
        // Fallback: apply by payload even if Redis pay_* session expired.
        if (payFbApplyEnabled && payUserId && Number(payUserId) === Number(u.id) && paymentId) {
          try {
            const fb = await applyPaymentFallbackNoSession({
              paymentId,
              paymentUserId: u.id,
              invoicePayload: invoicePayload,
              appliedByUserId: u.id,
              totalAmount: sp.total_amount,
              currency: sp.currency || 'XTR',
              telegramPaymentChargeId: String(sp.telegram_payment_charge_id || ''),
            });
            if (fb && fb.applied) {
              await ctx.reply('⭐️ PRO активирован! Открой настройки канала → ⭐️ PRO, чтобы управлять пином и лимитами.');
              return;
            }
          } catch { /* ignore fallback failures */ }
        }
  
        await markStatus('ORPHANED', 'missing_session');
        const autoHeal = CFG.PAYMENTS_ORPHANED_AUTOHEAL_ENABLED && payFbApplyEnabled;
        const m = Math.max(1, Math.round(Number(CFG.PAYMENTS_ORPHANED_AUTOHEAL_MIN_AGE_SEC || 300) / 60));
        await ctx.reply(
          `✅ Платёж получен. Но сессия оплаты не найдена (возможно, истекла).${autoHeal ? `\n\n🔁 Я попробую применить оплату автоматически в течение ~${m} мин.` : ''}\n\nЕсли не применилось — напиши /start и открой ⭐️ PRO — помогу разобраться.`
        );
        return;
      }
  
      await db.activateWorkspacePro(wsId, CFG.PRO_DURATION_DAYS);
      await db.auditWorkspace(wsId, data.ownerUserId, 'pro.activated', {
        currency: sp.currency,
        total_amount: sp.total_amount,
        telegram_payment_charge_id: sp.telegram_payment_charge_id
      });
      await redis.del(k(['pay_pro', token]));
      await markApplied('auto_apply_pro');
      await ctx.reply('⭐️ PRO активирован! Открой настройки канала → ⭐️ PRO, чтобы управлять пином и лимитами.');
      return;
    } catch (e) {
      const em = String(e?.message || e).slice(0, 300);
      await markStatus('ERROR', `auto_apply_error: ${em.slice(0, 120)}`);
      await notifyPayOps('auto_apply_error', [`Error: <code>${escapeHtml(em)}</code>`]);
      await ctx.reply('✅ Оплата получена. Не смог применить автоматически. Нажми «💬 Поддержка» — я уже получил алерт.');
      return;
    }
  }
  
  // Brand Pass credits
  if (invoicePayload.startsWith('brand_')) {
    try {
      const parts = invoicePayload.split('_');
      const payUserId = Number(parts[1]);
      const token = parts.slice(3).join('_');
  
      const data = await redis.get(k(['pay_brand', token]));
      if (!data || Number(data.userId) !== payUserId || Number(data.tgId) !== Number(ctx.from.id)) {
        // Fallback: apply by payload even if Redis pay_* session expired.
        if (payFbApplyEnabled && payUserId && Number(payUserId) === Number(u.id) && paymentId) {
          try {
            const fb = await applyPaymentFallbackNoSession({
              paymentId,
              paymentUserId: u.id,
              invoicePayload: invoicePayload,
              appliedByUserId: u.id,
              totalAmount: sp.total_amount,
              currency: sp.currency || 'XTR',
              telegramPaymentChargeId: String(sp.telegram_payment_charge_id || ''),
            });
            if (fb && fb.applied) {
              await ctx.reply('✅ Кредиты начислены! Открой 💳 Кредиты или 📥 Inbox, чтобы начать.');
              return;
            }
          } catch { /* ignore */ }
        }
  
        await markStatus('ORPHANED', 'missing_session');
        const autoHeal = CFG.PAYMENTS_ORPHANED_AUTOHEAL_ENABLED && payFbApplyEnabled;
        const m = Math.max(1, Math.round(Number(CFG.PAYMENTS_ORPHANED_AUTOHEAL_MIN_AGE_SEC || 300) / 60));
        await ctx.reply(
          `✅ Платёж получен. Но сессия оплаты не найдена (возможно, истекла).${autoHeal ? `\n\n🔁 Я попробую применить оплату автоматически в течение ~${m} мин.` : ''}\n\nЕсли не применилось — напиши /start и нажми «💬 Поддержка».`
        );
        return;
      }
  
      const creditsToAdd = Number(data.credits || 0);
      const newBalance = await db.addBrandCredits(payUserId, creditsToAdd);
      try { await setBrandCreditsCache(payUserId, newBalance); } catch {}
      const introCost = Math.max(1, Number(CFG.INTRO_COST_PER_INTRO || 1));
      await redis.del(k(['pay_brand', token]));
  
      const kb = new InlineKeyboard();
      if (data.offerId) {
        kb.text('↩️ Вернуться к офферу', `a:bx_pub|ws:${data.wsId}|o:${data.offerId}|p:${Number(data.page || 0)}|h:bo`)
          .row();
      }
      kb.text('💳 Кредиты', `a:brand_pass|ws:${data.wsId}`)
        .text('📥 Inbox', `a:bx_inbox|ws:${data.wsId}|p:0|h:bo`);
  
      await markApplied('auto_apply_brand_pass');
      await ctx.reply(
        `✅ Кредиты начислены!
  
  Начислено: +${creditsToAdd}
  🎫 кредиты: ${fmtCredits(newBalance)}
  
  Как тратить кредиты:
  • 💬 Новый диалог: ${introCost} кредит(ов)
  • 🔓 Контакты на витрине: ${CONTACT_UNLOCK_COST <= 0 ? 'бесплатно' : (CONTACT_UNLOCK_COST + ' кредит(ов)')} → ${CONTACT_UNLOCK_TTL_DAYS} дней
  • Переписка внутри диалога — бесплатно
  
  Дальше: открой 📥 Inbox и нажми «💬 Диалог».`,
        { reply_markup: kb }
      );
      return;
    } catch (e) {
      const em = String(e?.message || e).slice(0, 300);
      await markStatus('ERROR', `auto_apply_error: ${em.slice(0, 120)}`);
      await notifyPayOps('auto_apply_error', [`Error: <code>${escapeHtml(em)}</code>`]);
      await ctx.reply('✅ Оплата получена. Не смог применить автоматически. Нажми «💬 Поддержка» — я уже получил алерт.');
      return;
    }
  }
  
  // Brand Plan tools subscription
  if (invoicePayload.startsWith('bplan_')) {
    try {
      const parts = invoicePayload.split('_');
      const payUserId = Number(parts[1]);
      const plan = String(parts[2] || 'start').toLowerCase();
      const token = parts.slice(3).join('_');
  
      const data = await redis.get(k(['pay_bplan', token]));
      if (!data || Number(data.userId) !== payUserId || Number(data.tgId) !== Number(ctx.from.id)) {
        // Fallback: apply by payload even if Redis pay_* session expired.
        if (payFbApplyEnabled && payUserId && Number(payUserId) === Number(u.id) && paymentId) {
          try {
            const fb = await applyPaymentFallbackNoSession({
              paymentId,
              paymentUserId: u.id,
              invoicePayload: invoicePayload,
              appliedByUserId: u.id,
              totalAmount: sp.total_amount,
              currency: sp.currency || 'XTR',
              telegramPaymentChargeId: String(sp.telegram_payment_charge_id || ''),
            });
            if (fb && fb.applied) {
              await ctx.reply('✅ Brand Plan активирован! Открой ⭐️ Brand Plan и 📥 Inbox, чтобы начать.');
              return;
            }
          } catch { /* ignore */ }
        }
  
        await markStatus('ORPHANED', 'missing_session');
        const autoHeal = CFG.PAYMENTS_ORPHANED_AUTOHEAL_ENABLED && payFbApplyEnabled;
        const m = Math.max(1, Math.round(Number(CFG.PAYMENTS_ORPHANED_AUTOHEAL_MIN_AGE_SEC || 300) / 60));
        await ctx.reply(
          `✅ Платёж получен. Но сессия оплаты не найдена (возможно, истекла).${autoHeal ? `\n\n🔁 Я попробую применить оплату автоматически в течение ~${m} мин.` : ''}\n\nЕсли не применилось — напиши /start и нажми «💬 Поддержка».`
        );
        return;
      }
  
      await db.activateBrandPlan(payUserId, plan, CFG.BRAND_PLAN_DURATION_DAYS);
  
      // Credit bonus included in plan
      const bonusCredits = Number(data.credits || 0);
      if (bonusCredits > 0) {
        const newBalance = await db.addBrandCredits(payUserId, bonusCredits);
        try { await setBrandCreditsCache(payUserId, newBalance); } catch {}
      }
      await redis.del(k(['pay_bplan', token]));
  
      const wsId = Number(data.wsId || 0);
      const ret = String(data.ret || 'brand');
      const planDef = BRAND_PLANS.find(pl => pl.id === plan);
      const planLabel = planDef ? planDef.title : plan;
      const kb = new InlineKeyboard()
        .text('⭐️ Brand Plan', `a:brand_plan|ws:${wsId}`)
        .text('📥 Inbox', `a:bx_inbox|ws:${wsId}|p:0|h:bo`)
        .row()
        .text('⬅️ Назад', (String(ret) === 'brand_team_bx') ? `a:brand_team|ws:${wsId}|ret:bx` : (String(ret) === 'brand_team') ? `a:brand_team|ws:${wsId}` : (wsId ? `a:bx_open|ws:${wsId}` : 'a:menu'));
  
      await markApplied('auto_apply_brand_plan');
      await ctx.reply(`✅ Brand Plan «${planLabel}» активирован!${bonusCredits ? `\n💳 +${bonusCredits} кредитов начислено.` : ''}\nCRM-стадии и менеджеры доступны.`, { reply_markup: kb });
      return;
    } catch (e) {
      const em = String(e?.message || e).slice(0, 300);
      await markStatus('ERROR', `auto_apply_error: ${em.slice(0, 120)}`);
      await notifyPayOps('auto_apply_error', [`Error: <code>${escapeHtml(em)}</code>`]);
      await ctx.reply('✅ Оплата получена. Не смог применить автоматически. Нажми «💬 Поддержка» — я уже получил алерт.');
      return;
    }
  }
  
  await markStatus('ORPHANED', 'unknown_payload');
  await notifyPayOps('unknown_payload');
  await ctx.reply('✅ Оплата получена. Я не смог автоматически распознать покупку — нажми «💬 Поддержка», я помогу.');
  });
}
