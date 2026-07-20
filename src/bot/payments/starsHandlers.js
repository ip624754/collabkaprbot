import { MONETIZATION_LABELS, buildRecoveredPaymentMessage, starsAmountLabel } from '../monetizationCopy.js';

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
    MATCH_TIERS,
    FEATURED_DURATIONS,
    BRAND_PLANS,
  } = deps;

  if (!bot) throw new Error('registerStarsPaymentsHandlers: bot is required');

  bot.command('paysupport', async (ctx) => {
    // Telegram requires /paysupport for bots with payments.
    // Redirect to unified support with payment context.
    const kb = new InlineKeyboard()
      .text('✍️ Написать в поддержку', 'a:support_write')
      .row()
      .text('📋 Меню', 'a:menu')
      .text('🏠 Домой', 'a:home');
    await ctx.reply(
      `💬 <b>Поддержка по оплате / Stars</b>\n\nЕсли что-то пошло не так с оплатой — нажми кнопку ниже и опиши проблему.\n\n<b>Что указать:</b>\n• Что покупал: PRO канала, Brand Plan, кредиты, Умный подбор, Продвижение или размещение\n• Примерное время оплаты\n• Скрин чека (если есть)`,
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
          console.warn('[PAY] pre_checkout rejected', { reason: v.reason, product_kind: _safeKindFromPayload(payload), paid: totalAmount, expected: v.expected || 0, currency });
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
    const sp = ctx.message?.successful_payment;
    const invoicePayload = String(sp?.invoice_payload || '');
    if (!invoicePayload) return;

    const u = await db.upsertUser(ctx.from.id, ctx.from.username ?? null);
    const kind = _safeKindFromPayload(invoicePayload);
    const tgChargeId = String(sp.telegram_payment_charge_id || '');
    let paymentId = null;

    db.trackEvent('payment_success', {
      userId: u.id,
      meta: { kind, payload: invoicePayload, amount: sp.total_amount, currency: sp.currency || 'XTR' },
    });

    const notifyPayOps = async (reason, extraLines = []) => {
      try {
        const userTag = ctx.from?.username ? `@${ctx.from.username}` : `tg:${ctx.from?.id}`;
        const extra = [
          `Kind: ${kind}`,
          `Payload: ${invoicePayload}`,
          `From: ${userTag} (userId=${u.id})`,
          `Amount: ${sp.total_amount} ${sp.currency || 'XTR'}`,
          `TG charge: ${tgChargeId || '-'}`,
          `PaymentId: ${paymentId || '-'}`,
          ...(Array.isArray(extraLines) ? extraLines.map((x) => String(x || '').trim()).filter(Boolean) : []),
        ];
        return await queueOpsAlert(ctx.api, {
          group: 'ops', reason: String(reason || 'pay_error'), title: 'Payments',
          paymentId: paymentId || null, userId: u.id, tgId: ctx.from?.id || null,
          kind: 'payments', payload: invoicePayload, extra,
        });
      } catch {
        return { sent: 0, error: 'notify_failed' };
      }
    };

    // Legacy Stars receipt is supplementary. The canonical payments ledger below is mandatory.
    try {
      await db.recordStarsPayment({
        userId: u.id, kind, invoicePayload, currency: sp.currency,
        totalAmount: sp.total_amount,
        telegramPaymentChargeId: sp.telegram_payment_charge_id,
        providerPaymentChargeId: sp.provider_payment_charge_id,
        raw: sp,
      });
    } catch (e) {
      await notifyPayOps('legacy_stars_ledger_error', [`Error: ${String(e?.message || e).slice(0, 160)}`]);
    }

    let pay = null;
    try {
      pay = await db.insertPayment({
        userId: u.id, kind, invoicePayload, currency: sp.currency,
        totalAmount: sp.total_amount,
        telegramPaymentChargeId: sp.telegram_payment_charge_id,
        providerPaymentChargeId: sp.provider_payment_charge_id,
        raw: sp, status: 'RECEIVED',
      });

      paymentId = pay?.id || null;
      if (!paymentId && pay?.inserted === false && tgChargeId) {
        const existing = await db.getPaymentByTelegramChargeId(tgChargeId);
        paymentId = existing?.id || null;
        if (existing && String(existing.status || '').toUpperCase() === 'APPLIED') {
          await ctx.reply('✅ Платеж уже обработан.');
          return;
        }
      }
    } catch (e) {
      await notifyPayOps('payment_ledger_unavailable', [`Error: ${String(e?.message || e).slice(0, 160)}`]);
      await ctx.reply('✅ Оплата получена, но выдача временно остановлена: платёжный журнал недоступен. Нажми /paysupport — данные оплаты сохранены в Telegram.');
      return;
    }

    if (!paymentId) {
      await notifyPayOps('payment_ledger_unavailable', [`Ledger: ${String(pay?.ledger || pay?.reason || 'no_payment_id')}`]);
      await ctx.reply('✅ Оплата получена, но выдача временно остановлена: платёжный журнал недоступен. Нажми /paysupport — данные оплаты сохранены в Telegram.');
      return;
    }

    const markStatus = async (status, note) => {
      try { return await db.setPaymentStatusIfNotApplied(paymentId, status, note); } catch { return null; }
    };

    let validation;
    try {
      validation = await _validateStarsPaymentStrict({
        payload: invoicePayload,
        currency: sp.currency || 'XTR',
        totalAmount: sp.total_amount,
        payerUserId: u.id,
      });
    } catch {
      validation = { ok: false, reason: 'validation_exception' };
    }

    if (!validation?.ok) {
      const note = `validation_failed:${String(validation?.reason || 'unknown')} exp:${Number(validation?.expected || 0)} got:${Number(sp.total_amount || 0)} cur:${String(sp.currency || 'XTR')}`;
      await markStatus('ORPHANED', note.slice(0, 240));
      db.trackEvent('payment_orphaned', { userId: u.id, meta: { kind, payload: invoicePayload, reason: 'validation_failed', validation } });
      await notifyPayOps('validation_failed', [`Reason: ${String(validation?.reason || 'unknown')}`]);
      await ctx.reply('✅ Оплата получена. Но я не смог безопасно подтвердить счёт. Нажми /paysupport — поможем быстро.');
      return;
    }

    // Official-channel placement remains a moderated/manual flow; no product is auto-fulfilled here.
    if (invoicePayload.startsWith('offpub_')) {
      await markStatus('ORPHANED', 'postpay_orphaned');
      db.trackEvent('payment_orphaned', { userId: u.id, meta: { kind, payload: invoicePayload, reason: 'postpay_orphaned' } });

      let offerId = 0;
      let days = 0;
      let offer = null;
      try {
        const parts = invoicePayload.split('_');
        offerId = Number(parts[2]);
        days = Number(parts[3] || CFG.OFFICIAL_MANUAL_DEFAULT_DAYS);
        const channelChatId = Number(CFG.OFFICIAL_CHANNEL_ID || 0);
        if (offerId && channelChatId) {
          await db.upsertOfficialPostDraft({ offerId, channelChatId, placementType: 'PAID', paymentId, slotDays: days });
        }
        offer = offerId ? await db.getBarterOfferPublic(offerId) : null;
      } catch {}

      try {
        const wsId = offer?.workspace_id ? Number(offer.workspace_id) : 0;
        const fromTag = ctx.from?.username ? `@${ctx.from.username}` : `tg:${ctx.from?.id}`;
        await notifyOfficialQueueAdmins(ctx.api, {
          kind: 'paid', offerId, wsId, offerTitle: offer?.title || '', wsTitle: offer?.ws_title || '',
          channelUsername: offer?.channel_username || '', days, paymentId, fromTag,
        });
      } catch {}

      const wsId = offer?.workspace_id ? Number(offer.workspace_id) : 0;
      const kb = new InlineKeyboard();
      if (wsId && offerId) kb.text('📣 Статус офиц.канала', `a:off_manage|ws:${wsId}|o:${offerId}|p:0|back:my`).row();
      kb.text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');
      await ctx.reply('✅ Оплата получена. Оффер передан модератору. Публикация начнётся только после одобрения.', { reply_markup: kb });
      return;
    }

    const { autoApply } = await getPaymentsRuntimeFlags();
    if (!autoApply) {
      await markStatus('ORPHANED', 'auto_apply_paused');
      await notifyPayOps('auto_apply_paused');
      await ctx.reply('✅ Платёж получен. Автовыдача сейчас на паузе. Если нужно — нажми «💬 Поддержка».');
      return;
    }

    const parts = invoicePayload.split('_');
    let sessionKey = null;
    let sessionData = null;
    let sessionBound = false;
    let fulfillmentContext = {};

    try {
      let family = '';
      let token = '';
      if (kind === 'matching') { family = 'pay_match'; token = parts.slice(3).join('_'); }
      else if (kind === 'featured') { family = 'pay_feat'; token = parts.slice(3).join('_'); }
      else if (kind === 'founder') { family = 'pay_founder'; token = parts.slice(4).join('_'); }
      else if (kind === 'pro') {
        family = 'pay_pro';
        token = (parts.length >= 4 && /^\d+$/.test(String(parts[2] || ''))) ? parts.slice(3).join('_') : parts.slice(2).join('_');
      }
      else if (kind === 'brand_pass') { family = 'pay_brand'; token = parts.slice(3).join('_'); }
      else if (kind === 'brand_plan') { family = 'pay_bplan'; token = parts.slice(3).join('_'); }

      if (family && token) {
        sessionKey = k([family, token]);
        sessionData = await redis.get(sessionKey);
      }

      if (sessionData && typeof sessionData === 'object') {
        const tgOk = !sessionData.tgId || Number(sessionData.tgId) === Number(ctx.from.id);
        const embeddedUserId = Number(sessionData.userId || sessionData.ownerUserId || 0);
        const userOk = !embeddedUserId || embeddedUserId === Number(u.id);
        const productOk = kind !== 'founder' || !sessionData.productId || String(sessionData.productId) === String(validation.meta?.productId || '');
        sessionBound = tgOk && userOk && productOk;
      }

      if (sessionBound) {
        fulfillmentContext = {
          sessionType: kind,
          wsId: Number(sessionData.wsId || validation.meta?.wsId || 0),
          ownerUserId: Number(sessionData.ownerUserId || sessionData.userId || u.id),
          userId: Number(sessionData.userId || u.id),
          offerId: Number(sessionData.offerId || 0),
          page: Number(sessionData.page || 0),
          durationDays: Number(sessionData.durationDays || 0),
          credits: Number(sessionData.credits || 0),
          days: Number(sessionData.days || validation.meta?.days || 0),
          count: Number(sessionData.count || 0),
          ret: String(sessionData.ret || ''),
          bpr: String(sessionData.bpr || ''),
          productId: String(sessionData.productId || validation.meta?.productId || ''),
          packId: String(sessionData.packId || validation.meta?.packId || ''),
          plan: String(sessionData.plan || validation.meta?.plan || ''),
          tierId: String(sessionData.tierId || validation.meta?.tierId || ''),
        };
      }
    } catch {
      sessionKey = null;
      sessionData = null;
      sessionBound = false;
      fulfillmentContext = {};
    }

    const result = await applyPaymentFallbackNoSession({
      paymentId,
      paymentUserId: u.id,
      invoicePayload,
      appliedByUserId: u.id,
      totalAmount: sp.total_amount,
      currency: sp.currency || 'XTR',
      telegramPaymentChargeId: tgChargeId,
      fulfillmentContext,
      validation,
      allowLegacyUnsignedValidated: sessionBound,
    });

    if (!result?.applied) {
      if (result?.alreadyApplied || result?.reason === 'already_applied') {
        if (sessionKey) { try { await redis.del(sessionKey); } catch {} }
        await ctx.reply('✅ Платеж уже обработан.');
        return;
      }
      if (result?.reason === 'locked' || result?.reason === 'applying_in_progress') {
        await ctx.reply('⏳ Платёж уже обрабатывается. Если через пару минут не применится — нажми /paysupport.');
        return;
      }

      const permanent = new Set([
        'bad_input', 'validation_required', 'user_mismatch', 'payment_user_mismatch', 'charge_id_mismatch',
        'payload_mismatch', 'unsupported_payload', 'unsupported_founder_product', 'missing_context',
        'missing_wsid', 'no_ws_access', 'bad_pack', 'bad_plan', 'bad_tier', 'bad_duration',
        'unsigned_payload', 'bad_sig', 'manual_only',
      ]);
      const reason = String(result?.reason || 'atomic_apply_failed');
      await markStatus(permanent.has(reason) ? 'ORPHANED' : 'ERROR', `atomic_apply_failed:${reason}`.slice(0, 240));
      await notifyPayOps('atomic_apply_failed', [`Reason: ${reason}`, result?.errorCode ? `DB code: ${result.errorCode}` : '']);
      await ctx.reply('✅ Оплата получена, но продукт не выдан автоматически. Повторная выдача заблокирована до безопасного восстановления. Нажми /paysupport — оператор уже получил алерт.');
      return;
    }

    // Commit already succeeded. Only now may transient session/cache/UI state be changed.
    if (sessionKey) { try { await redis.del(sessionKey); } catch {} }
    if (Number.isFinite(Number(result.brandCreditsBalance))) {
      try { await setBrandCreditsCache(u.id, Number(result.brandCreditsBalance)); } catch {}
    }

    const wsId = Number(fulfillmentContext.wsId || result.wsId || 0);
    const ret = String(fulfillmentContext.ret || '');
    const bpr = String(fulfillmentContext.bpr || '');

    if (result.kind === 'matching') {
      try {
        await setExpectText(ctx.from.id, {
          type: 'match_brief', requestId: result.requestId, wsId,
          count: Number(result.count || 0), ret, bpr,
        });
      } catch { await notifyPayOps('postcommit_expect_state_failed', [`Product: matching`, `RequestId: ${result.requestId}`]); }
      const kb = new InlineKeyboard()
        .text('🎯 Умный подбор', cbJoin('a:match_home', { ws: wsId, ret, bpr })).row()
        .text('⬅️ Назад', mfBackCb(wsId, ret, bpr)).text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');
      await ctx.reply(`✅ <b>Умный подбор оплачен</b>\n\nСписано: <b>${starsAmountLabel(sp.total_amount)}</b>.\nРезультат: один подбор до <b>${Number(result.count || 0)}</b> каналов.\n\nПришли бриф одним сообщением: ниша, гео, аудитория и формат.`, { parse_mode: 'HTML', reply_markup: kb });
      return;
    }

    if (result.kind === 'featured') {
      try {
        await setExpectText(ctx.from.id, { type: 'feat_content', featuredId: result.featuredId, wsId, ret, bpr });
      } catch { await notifyPayOps('postcommit_expect_state_failed', [`Product: featured`, `FeaturedId: ${result.featuredId}`]); }
      const kb = new InlineKeyboard()
        .text('🔥 Продвижение', cbJoin('a:feat_home', { ws: wsId, ret, bpr })).row()
        .text('⬅️ Назад', mfBackCb(wsId, ret, bpr)).text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');
      await ctx.reply(`✅ <b>Продвижение оплачено</b>\n\nСписано: <b>${starsAmountLabel(sp.total_amount)}</b>.\nСрок размещения: <b>${Number(result.days || 0)}</b> дн.\n\nПришли контент:\n• первая строка — заголовок\n• затем описание\n• последняя строка — контакт`, { parse_mode: 'HTML', reply_markup: kb });
      return;
    }

    if (result.kind === 'pro' || result.kind === 'founder_creator') {
      try {
        await db.auditWorkspace(Number(result.wsId), u.id, result.kind === 'pro' ? 'pro.activated.atomic' : 'pro.activated.founder.atomic', {
          payment_id: paymentId, fulfillment_version: 'STEP588X1_v1', telegram_payment_charge_id: tgChargeId,
        });
      } catch {}
      const label = result.kind === 'pro' ? MONETIZATION_LABELS.CREATOR_PRO : MONETIZATION_LABELS.FOUNDER_SALE;
      await ctx.reply(`✅ ${label} применён.\n\nСписано: ${starsAmountLabel(sp.total_amount)}.\nСрок: ${Number(result.days || 0)} дней.`);
      return;
    }

    if (result.kind === 'brand_pass') {
      const kb = new InlineKeyboard();
      if (fulfillmentContext.offerId) kb.text('↩️ Вернуться к офферу', `a:bx_pub|ws:${wsId}|o:${fulfillmentContext.offerId}|p:${Number(fulfillmentContext.page || 0)}|h:bo`).row();
      kb.text('💳 Кредиты', `a:brand_pass|ws:${wsId}`).text('💬 Диалоги', `a:bx_inbox|ws:${wsId}|p:0|h:bo`);
      await ctx.reply(`✅ <b>Кредиты начислены</b>\n\nСписано: <b>${starsAmountLabel(sp.total_amount)}</b>\nНачислено: <b>${Number(result.credits || 0)}</b>\nБаланс: <b>${fmtCredits(result.brandCreditsBalance)}</b>\n\nКредиты расходуются на новые диалоги, принятие заявок и открытие контактов. Сообщения внутри открытого диалога бесплатны.\n\nДальше: открой «💬 Диалоги» и выбери нужный диалог.`, { parse_mode: 'HTML', reply_markup: kb });
      return;
    }

    if (result.kind === 'brand_plan') {
      const planDef = BRAND_PLANS.find((pl) => pl.id === result.plan);
      const kb = new InlineKeyboard()
        .text('⭐️ Brand Plan', `a:brand_plan|ws:${wsId}`).text('💬 Диалоги', `a:bx_inbox|ws:${wsId}|p:0|h:bo`).row()
        .text('⬅️ Назад', wsId ? `a:bx_open|ws:${wsId}` : 'a:menu');
      await ctx.reply(`✅ <b>Brand Plan «${planDef?.title || result.plan}» активирован</b>\n\nСписано: <b>${starsAmountLabel(sp.total_amount)}</b>\nСрок: <b>${Number(result.days || 0)}</b> дней.${Number(result.credits || 0) ? `\nНачислено: <b>${Number(result.credits)}</b> кредитов.` : ''}\n\nCRM-этапы, менеджеры, Умный подбор и Продвижение доступны по условиям плана.`, { parse_mode: 'HTML', reply_markup: kb });
      return;
    }

    if (result.kind === 'founder_brand') {
      const kb = new InlineKeyboard().text('⭐️ Brand Plan', 'a:brand_plan|ws:0').text('💳 Кредиты', 'a:brand_pass|ws:0').row().text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');
      let msg = `✅ ${MONETIZATION_LABELS.FOUNDER_SALE} применён.\n\nСписано: ${starsAmountLabel(sp.total_amount)}.\n\n⭐️ Brand Plan «Про» активирован на ${Number(result.days || 0)} дней.`;
      if (Number(result.credits || 0) > 0) msg += `\n💳 +${Number(result.credits)} кредитов начислено.`;
      await ctx.reply(msg, { reply_markup: kb });
      return;
    }

    await ctx.reply(buildRecoveredPaymentMessage({ result, amount: sp.total_amount }));
  });
}
