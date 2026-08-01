import {
  isApplicationCreatorAction,
  isApplicationBrandAction,
  isApplicationDealsAction,
} from './policy.js';

const REQUIRED_DEPENDENCIES = Object.freeze([
  'BRAND_APP_ACCEPT_COST',
  'BX_HOME',
  'InlineKeyboard',
  'LEAD_STATUSES',
  'UI_MODES',
  'acceptBrandApplication',
  'answerRecovery',
  'assertBrandAppsAccess',
  'bmResolveAssert',
  'brandAppDealButtonLabel',
  'brandAppOpenButtonLabel',
  'brandAppReplyButtonLabel',
  'brandAppReplyRecoveryKb',
  'brandDealAppBackCb',
  'brandDealViewCb',
  'buildBrandAppReplyRecoveryText',
  'buildCreatorBrandAppChatRecoveryText',
  'clearBrandApplyDraft',
  'clearBrandDealsMineOnly',
  'clearBrandDealsSearch',
  'clearExpectText',
  'creatorBrandAppChatRecoveryKb',
  'db',
  'dealStageTitle',
  'ensureWorkspaceForOwner',
  'errInfo',
  'getBrandAppForActorSafe',
  'getBrandApplyDraft',
  'getBrandDealsMineOnly',
  'getBrandManagerMode',
  'getExpectText',
  'isAcceptedBrandDeal',
  'isSuperAdminTg',
  'kbBrandAppAcceptedDone',
  'kbBrandApplyDone',
  'navKb',
  'normDealStage',
  'normLeadStatus',
  'normalizeUiMode',
  'renderBrandAppCardForCreator',
  'renderBrandAppTemplatePreview',
  'renderBrandAppTemplates',
  'renderBrandAppView',
  'renderBrandApply',
  'renderBrandApplyPreview',
  'renderBrandAppsList',
  'renderBrandDealTemplates',
  'renderBrandDealView',
  'renderBrandDealsList',
  'renderBxInbox',
  'renderCreatorApplications',
  'renderWsLeadsList',
  'resolveUiMode',
  'ruPlural',
  'safeBrandApplications',
  'safeBrandAppsWrite',
  'safeEditOrReply',
  'sendBrandAppTemplateReply',
  'sendBrandApplyDraft',
  'sendBrandDealTemplateReply',
  'setBrandDealsMineOnly',
  'setExpectText',
  'startBrandAppChatForCreator',
  'startBrandAppReply',
  'startBrandDealReply',
]);

function bindDependencies(deps) {
  for (const name of REQUIRED_DEPENDENCIES) {
    if (deps?.[name] === null || deps?.[name] === undefined) {
      throw new Error('applications_domain.missing_dependency:' + name);
    }
  }
  return deps;
}

export async function handleApplicationCreatorCallback(ctx, p, u, deps = {}) {
  if (!isApplicationCreatorAction(p?.a)) return false;
  const bound = bindDependencies(deps);
  const {
  BRAND_APP_ACCEPT_COST,
  BX_HOME,
  InlineKeyboard,
  LEAD_STATUSES,
  UI_MODES,
  acceptBrandApplication,
  answerRecovery,
  assertBrandAppsAccess,
  bmResolveAssert,
  brandAppDealButtonLabel,
  brandAppOpenButtonLabel,
  brandAppReplyButtonLabel,
  brandAppReplyRecoveryKb,
  brandDealAppBackCb,
  brandDealViewCb,
  buildBrandAppReplyRecoveryText,
  buildCreatorBrandAppChatRecoveryText,
  clearBrandApplyDraft,
  clearBrandDealsMineOnly,
  clearBrandDealsSearch,
  clearExpectText,
  creatorBrandAppChatRecoveryKb,
  db,
  dealStageTitle,
  ensureWorkspaceForOwner,
  errInfo,
  getBrandAppForActorSafe,
  getBrandApplyDraft,
  getBrandDealsMineOnly,
  getBrandManagerMode,
  getExpectText,
  isAcceptedBrandDeal,
  isSuperAdminTg,
  kbBrandAppAcceptedDone,
  kbBrandApplyDone,
  navKb,
  normDealStage,
  normLeadStatus,
  normalizeUiMode,
  renderBrandAppCardForCreator,
  renderBrandAppTemplatePreview,
  renderBrandAppTemplates,
  renderBrandAppView,
  renderBrandApply,
  renderBrandApplyPreview,
  renderBrandAppsList,
  renderBrandDealTemplates,
  renderBrandDealView,
  renderBrandDealsList,
  renderBxInbox,
  renderCreatorApplications,
  renderWsLeadsList,
  resolveUiMode,
  ruPlural,
  safeBrandApplications,
  safeBrandAppsWrite,
  safeEditOrReply,
  sendBrandAppTemplateReply,
  sendBrandApplyDraft,
  sendBrandDealTemplateReply,
  setBrandDealsMineOnly,
  setExpectText,
  startBrandAppChatForCreator,
  startBrandAppReply,
  startBrandDealReply
  } = bound;

  await (async () => {
    if (p.a === 'a:brand_apply_done') {
      const brandUserId = Number(p.u || 0);
      const backPage = Math.max(0, Number(p.p || 0));
      const canOpenInbox = String(p.inb || '') === '1';
      const kb = kbBrandApplyDone(brandUserId, backPage, canOpenInbox);
      try { await ctx.editMessageReplyMarkup(kb); } catch {}
      return;
    }
    if (p.a === 'a:brand_app_accepted_done') {
      const appId = Number(p.id || 0);
      const brandUserId = Number(p.u || 0);
      const kb = kbBrandAppAcceptedDone(appId, brandUserId);
      try { await ctx.editMessageReplyMarkup(kb); } catch {}
      return;
    }
    if (p.a === 'a:go_dialogs') {
      await ctx.answerCallbackQuery();
      const mode = await resolveUiMode(ctx.from.id);
      const bmMode = await getBrandManagerMode(ctx.from.id);
      const isBrandish = normalizeUiMode(mode) === UI_MODES.BRAND || bmMode;

      if (isBrandish) {
        const wsId = 0;
        const page = 0;
        const h = BX_HOME.MENU;

        const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_inbox', page, { h });
        if (!bmRes) return;

        await renderBxInbox(ctx, bmRes.userId, wsId, page, { bm: bmRes.bm, h });
        return;
      }

      const ws = await ensureWorkspaceForOwner(ctx, u.id);
      if (!ws) return;

      await renderBxInbox(ctx, u.id, ws.id, 0, { h: BX_HOME.BX_OPEN });
      return;
    }
    if (p.a === 'a:go_requests') {
      await ctx.answerCallbackQuery();
      const mode = await resolveUiMode(ctx.from.id);
      const bmMode = await getBrandManagerMode(ctx.from.id);
      const isBrandish = normalizeUiMode(mode) === UI_MODES.BRAND || bmMode;

      // Offer conversations live in Dialogs; applications and accepted deals use separate surfaces.
      if (isBrandish) {
        const wsId = 0;
        const page = 0;
        const h = BX_HOME.MENU;

        const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_inbox', page, { h });
        if (!bmRes) return;

        await renderBxInbox(ctx, bmRes.userId, wsId, page, { bm: bmRes.bm, h });
        return;
      }

      const ws = await ensureWorkspaceForOwner(ctx, u.id);
      if (!ws) return;

      await renderWsLeadsList(ctx, u.id, ws.id, 'new', 0, 'ws_open');
      return;
    }
        if (p.a === 'a:brand_apply') {
    	      const brandUserId = Number(p.u || 0);
    	      const backPage = Math.max(0, Number(p.p || 0));

    	      // UX: users often type immediately after pressing "📝 Оставить заявку".
    	      // If there is no draft yet, start input mode right away (short-lived expectText via renderBrandApply).
    	      let hasDraft = false;
    	      try {
    	        const d = await getBrandApplyDraft(ctx.from.id, brandUserId);
    	        hasDraft = !!(d && typeof d === 'object' && String(d.msg || '').trim());
    	      } catch {}

    	      try {
    	        if (!hasDraft) {
    	          await ctx.answerCallbackQuery({ text: '✍️ Напиши сообщение внизу и отправь одним сообщением. Потом покажу предпросмотр.' });
    	        } else {
    	          await ctx.answerCallbackQuery();
    	        }
    	      } catch {}

    	      await renderBrandApply(ctx, u, brandUserId, backPage, { edit: true, startWrite: !hasDraft });
    	      return;
        }
        if (p.a === 'a:brand_apply_write') {
          try { await ctx.answerCallbackQuery({ text: '✍️ Напиши сообщение внизу и отправь одним сообщением. Потом покажу предпросмотр.' }); } catch {}
          const brandUserId = Number(p.u || 0);
          const backPage = Math.max(0, Number(p.p || 0));
          await renderBrandApply(ctx, u, brandUserId, backPage, { edit: true, startWrite: true });
          return;
        }
        if (p.a === 'a:brand_apply_cancel') {
          const brandUserId = Number(p.u || 0);
          const backPage = Math.max(0, Number(p.p || 0));
          try {
            const exp = await getExpectText(ctx.from.id);
            if (exp && exp.type === 'brand_apply') await clearExpectText(ctx.from.id);
          } catch {}
          try { await ctx.answerCallbackQuery({ text: '❌ Режим ввода выключен.' }); } catch {}
          await renderBrandApply(ctx, u, brandUserId, backPage, { edit: true, startWrite: false });
          return;
        }
        if (p.a === 'a:brand_apply_preview') {
          try { await ctx.answerCallbackQuery(); } catch {}
          const brandUserId = Number(p.u || 0);
          const backPage = Math.max(0, Number(p.p || 0));
          await renderBrandApplyPreview(ctx, u, brandUserId, backPage, { edit: true });
          return;
        }
        if (p.a === 'a:brand_apply_clear') {
          try { await ctx.answerCallbackQuery({ text: '🗑 Черновик очищен.' }); } catch {}
          const brandUserId = Number(p.u || 0);
          const backPage = Math.max(0, Number(p.p || 0));
          await clearBrandApplyDraft(ctx.from.id, brandUserId);
          await renderBrandApply(ctx, u, brandUserId, backPage, { edit: true, startWrite: false });
          return;
        }
        if (p.a === 'a:brand_apply_send') {
          try { await ctx.answerCallbackQuery(); } catch {}
          const brandUserId = Number(p.u || 0);
          const backPage = Math.max(0, Number(p.p || 0));
          try {
            await sendBrandApplyDraft(ctx, u, brandUserId, backPage, { edit: true });
          } catch (e) {
            try {
              console.warn('[brand_apply_send] unhandled', { cid: ctx.state?.cid || null, brandUserId, err: errInfo(e) });
            } catch {}
            const kb = new InlineKeyboard()
              .text('👀 Предпросмотр', `a:brand_apply_preview|u:${brandUserId}|p:${backPage}`)
              .row()
              .text('✍️ Изменить', `a:brand_apply_write|u:${brandUserId}|p:${backPage}`)
              .text('🗑 Сбросить', `a:brand_apply_clear|u:${brandUserId}|p:${backPage}`)
              .row()
              .text('⬅️ Назад', `a:brand_apply|u:${brandUserId}|p:${backPage}`)
              .text('📋 Меню', 'a:menu')
              .text('🏠 Домой', 'a:home');
            await safeEditOrReply(ctx, '⚠️ Не удалось отправить заявку. Попробуй ещё раз.', { reply_markup: kb }, true);
          }
          return;
        }
    if (p.a === 'a:brand_app_chat') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const appId = Number(p.id || 0);
      if (!appId) return;
      try {
        await startBrandAppChatForCreator(ctx, u.id, appId);
      } catch (e) {
        try { console.warn('[brand_app_chat] unhandled', { appId, cid: ctx.state?.cid || null, err: errInfo(e) }); } catch {}
        const kb = creatorBrandAppChatRecoveryKb(appId, 0);
        const msg = buildCreatorBrandAppChatRecoveryText({ appId, kind: 'open_error' });
        try { await safeEditOrReply(ctx, msg, { parse_mode: 'HTML', reply_markup: kb }); } catch { await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: kb }); }
      }
      return;
    }
    if (p.a === 'a:my_apps') {
      try { await ctx.answerCallbackQuery(); } catch {}
      await renderCreatorApplications(ctx, u.id, Math.max(0, Number(p.p) || 0));
      return;
    }
    if (p.a === 'a:brand_app_card') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const appId = Number(p.id || 0);
      if (!appId) return;

      // Route by role: creator sees their card, brand/manager sees brand view
      const app = await getBrandAppForActorSafe(ctx, u.id, appId);
      if (!app) { try { await answerRecovery(ctx, 'application'); } catch {} return; }

      if (Number(app.creator_user_id) === Number(u.id)) {
        await renderBrandAppCardForCreator(ctx, u.id, appId);
      } else {
        // Brand owner or manager
        await renderBrandAppView(ctx, u.id, appId, { status: normLeadStatus(app.status), page: 0 });
      }
      return;
    }
  })();
  return true;
}

export async function handleApplicationBrandCallback(ctx, p, u, deps = {}) {
  if (!isApplicationBrandAction(p?.a)) return false;
  const bound = bindDependencies(deps);
  const {
  BRAND_APP_ACCEPT_COST,
  BX_HOME,
  InlineKeyboard,
  LEAD_STATUSES,
  UI_MODES,
  acceptBrandApplication,
  answerRecovery,
  assertBrandAppsAccess,
  bmResolveAssert,
  brandAppDealButtonLabel,
  brandAppOpenButtonLabel,
  brandAppReplyButtonLabel,
  brandAppReplyRecoveryKb,
  brandDealAppBackCb,
  brandDealViewCb,
  buildBrandAppReplyRecoveryText,
  buildCreatorBrandAppChatRecoveryText,
  clearBrandApplyDraft,
  clearBrandDealsMineOnly,
  clearBrandDealsSearch,
  clearExpectText,
  creatorBrandAppChatRecoveryKb,
  db,
  dealStageTitle,
  ensureWorkspaceForOwner,
  errInfo,
  getBrandAppForActorSafe,
  getBrandApplyDraft,
  getBrandDealsMineOnly,
  getBrandManagerMode,
  getExpectText,
  isAcceptedBrandDeal,
  isSuperAdminTg,
  kbBrandAppAcceptedDone,
  kbBrandApplyDone,
  navKb,
  normDealStage,
  normLeadStatus,
  normalizeUiMode,
  renderBrandAppCardForCreator,
  renderBrandAppTemplatePreview,
  renderBrandAppTemplates,
  renderBrandAppView,
  renderBrandApply,
  renderBrandApplyPreview,
  renderBrandAppsList,
  renderBrandDealTemplates,
  renderBrandDealView,
  renderBrandDealsList,
  renderBxInbox,
  renderCreatorApplications,
  renderWsLeadsList,
  resolveUiMode,
  ruPlural,
  safeBrandApplications,
  safeBrandAppsWrite,
  safeEditOrReply,
  sendBrandAppTemplateReply,
  sendBrandApplyDraft,
  sendBrandDealTemplateReply,
  setBrandDealsMineOnly,
  setExpectText,
  startBrandAppChatForCreator,
  startBrandAppReply,
  startBrandDealReply
  } = bound;

  await (async () => {
    	if (p.a === 'a:brand_apps') {
    	  await ctx.answerCallbackQuery();
    	  const status = String(p.s || 'new');
    	  const page = Math.max(0, Number(p.p || 0));

    	  const bmRes = await bmResolveAssert(ctx, u, 0, 'brand_apps', page);
    	  if (!bmRes) return;

    	  await renderBrandAppsList(ctx, u.id, bmRes.userId, status, page);
    	  return;
    	}
    if (p.a === 'a:brand_app_view') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const appId = Number(p.id || 0);
      const back = { status: String(p.s || 'new'), page: Math.max(0, Number(p.p || 0)) };
      await renderBrandAppView(ctx, u.id, appId, back);
      return;
    }
    if (p.a === 'a:brand_app_del_q') {
      await ctx.answerCallbackQuery();
      const appId = Number(p.id || 0);
      if (!appId) return;
      const back = { status: String(p.s || 'new'), page: Math.max(0, Number(p.p || 0)) };
      const kb = new InlineKeyboard()
        .text('🗑 Удалить', `a:brand_app_del_do|id:${appId}|s:${back.status}|p:${back.page}`)
        .text('❌ Отмена', `a:brand_app_view|id:${appId}|s:${back.status}|p:${back.page}`);
      await safeEditOrReply(ctx, '🗑 Удалить заявку из списка?\n\nКреатор не узнает.', { reply_markup: kb });
      return;
    }
    if (p.a === 'a:brand_app_del_do') {
      await ctx.answerCallbackQuery();
      const appId = Number(p.id || 0);
      if (!appId) return;
      const app = await getBrandAppForActorSafe(ctx, u.id, appId);
      if (!app) { try { await answerRecovery(ctx, 'application'); } catch {} return; }
      await db.softDeleteBrandApplication(appId, u.id);
      await ctx.answerCallbackQuery({ text: '🗑 Заявка удалена' });
      const back = { status: String(p.s || 'new'), page: Math.max(0, Number(p.p || 0)) };
      await renderBrandAppsList(ctx, u.id, u.id, back.status, back.page);
      return;
    }
    if (p.a === 'a:brand_app_set') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const appId = Number(p.id || 0);
      if (!appId) return;
      const st = normLeadStatus(String(p.st || 'new'));
      const back = { status: String(p.s || 'new'), page: Math.max(0, Number(p.p || 0)) };

      const app = await getBrandAppForActorSafe(ctx, u.id, appId);
      if (!app) { try { await answerRecovery(ctx, 'application'); } catch {} return; }
      const isAdmin = isSuperAdminTg(ctx.from?.id);
      if (!isAdmin && Number(app.creator_user_id) === Number(u.id)) {
        try { await ctx.answerCallbackQuery({ text: 'Статус меняет только бренд.' }); } catch {}
        return;
      }

      // Gate: до ✅ Принять нельзя переводить в ‘В работу/Закрыть’ (иначе создаёт путаницу и ощущение ‘заявка пропала’).
      const curSt = normLeadStatus(app.status);
      if (curSt === 'new' && (st === 'in_progress' || st === 'closed')) {
        try {
          const t = BRAND_APP_ACCEPT_COST > 0
            ? `Сначала ✅ Принять (спишется ${BRAND_APP_ACCEPT_COST} ${ruPlural(BRAND_APP_ACCEPT_COST,'кредит','кредита','кредитов')})`
            : 'Сначала ✅ Принять';
          await ctx.answerCallbackQuery({ text: t });
        } catch {}
        await renderBrandAppView(ctx, u.id, appId, back);
        return;
      }

      // Update in DB if available
      const updated = await safeBrandAppsWrite(() => db.updateBrandApplicationStatus(appId, st), { op: 'brand_app_status', appId, st });
      if (!updated) {
        const text = '⚠️ Не удалось обновить статус заявки. Попробуй ещё раз.';
        const kb = new InlineKeyboard()
          .text('⬅️ Назад', 'a:brand_app_view|id:' + appId + '|s:' + back.status + '|p:' + back.page)
          .text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');
        try { await safeEditOrReply(ctx, text, { reply_markup: kb }); } catch { await ctx.reply(text, { reply_markup: kb }); }
        return;
      }

      const prevSt = curSt;
      const flash = prevSt === st
        ? `Статус уже: ${(LEAD_STATUSES[st]?.title || LEAD_STATUSES[st]?.label || st)}`
        : `Статус обновлён: ${(LEAD_STATUSES[prevSt]?.title || LEAD_STATUSES[prevSt]?.label || prevSt)} → ${(LEAD_STATUSES[st]?.title || LEAD_STATUSES[st]?.label || st)}`;

      // Toast with meaning (anti-confusion)
      try {
        await ctx.answerCallbackQuery({ text: `✅ ${flash}` });
      } catch {}

      const nextBack = { status: st, page: back.page, flash };

      try {
        await renderBrandAppView(ctx, u.id, appId, nextBack);
      } catch (e) {
        try { console.warn('[brand_app_set] unhandled', { appId, st, back, cid: ctx.state?.cid || null, err: errInfo(e) }); } catch {}
        const text = '✅ Статус обновлён. (Экран не удалось перерисовать — попробуй открыть заявку заново.)';
        const kb = new InlineKeyboard()
          .text('⬅️ Назад', 'a:brand_apps|ws:0|s:' + nextBack.status + '|p:' + nextBack.page)
          .text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');
        try { await safeEditOrReply(ctx, text, { reply_markup: kb }); } catch { await ctx.reply(text, { reply_markup: kb }); }
      }
      return;
    }
    if (p.a === 'a:brand_app_reply') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const appId = Number(p.id || 0);
      const back = { status: String(p.s || 'new'), page: Math.max(0, Number(p.p || 0)) };
      try {
        await startBrandAppReply(ctx, u.id, appId, back);
      } catch (e) {
        try { console.warn('[brand_app_reply] open unhandled', { appId, back, cid: ctx.state?.cid || null, err: errInfo(e) }); } catch {}
        const kb = brandAppReplyRecoveryKb({
          primaryLabel: brandAppOpenButtonLabel(appId),
          primaryCb: `a:brand_app_view|id:${appId}|s:${back.status}|p:${back.page}`,
          secondaryLabel: '📨 Заявки',
          secondaryCb: `a:brand_apps|ws:0|s:${back.status}|p:${back.page}`
        });
        const msg = buildBrandAppReplyRecoveryText({
          appId,
          kind: 'open_error',
          subjectLabel: `заявке #${appId}`,
          contextLabel: brandAppOpenButtonLabel(appId),
          secondaryLabel: '📨 Заявки',
          replyLabel: brandAppReplyButtonLabel()
        });
        try { await safeEditOrReply(ctx, msg, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true }); } catch { await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true }); }
      }
      return;
    }
    if (p.a === 'a:brand_app_tpls') {
      // Never fail the whole callback due to Telegram callback ack issues
      // (query too old / already answered / etc.).
      try { await ctx.answerCallbackQuery(); } catch {}
      const appId = Number(p.id || 0);
      if (!appId) return;
      const back = { status: String(p.s || 'new'), page: Math.max(0, Number(p.p || 0)) };
      try {
        await renderBrandAppTemplates(ctx, u.id, appId, back);
      } catch (e) {
        try { console.warn('[brand_app_tpls] unhandled', { appId, back, cid: ctx.state?.cid || null, err: errInfo(e) }); } catch {}
        const text = '⚠️ Не удалось открыть шаблоны. Попробуй ещё раз или открой заявку заново.';
        const kb = new InlineKeyboard()
          .text('⬅️ Назад', 'a:brand_app_view|id:' + appId + '|s:' + back.status + '|p:' + back.page)
          .text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');
        try { await safeEditOrReply(ctx, text, { reply_markup: kb }); } catch { await ctx.reply(text, { reply_markup: kb }); }
      }
      return;
    }
    if (p.a === 'a:brand_app_tpl') {
      // Never fail the whole callback due to Telegram callback ack issues
      try { await ctx.answerCallbackQuery(); } catch {}
      const appId = Number(p.id || 0);
      if (!appId) return;
      const key = String(p.k || 'discuss');
      const back = { status: String(p.s || 'new'), page: Math.max(0, Number(p.p || 0)) };
      try {
        await renderBrandAppTemplatePreview(ctx, u.id, appId, key, back);
      } catch (e) {
        try { console.warn('[brand_app_tpl_preview] unhandled', { appId, key, back, cid: ctx.state?.cid || null, err: errInfo(e) }); } catch {}
        const text = '⚠️ Не удалось открыть предпросмотр. Попробуй ещё раз или нажми «✍️ Ответить».';
        const kb = new InlineKeyboard()
          .text('✍️ Ответить', 'a:brand_app_reply|id:' + appId + '|s:' + back.status + '|p:' + back.page)
          .row()
          .text('⬅️ Назад', 'a:brand_app_view|id:' + appId + '|s:' + back.status + '|p:' + back.page)
          .text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');
        try { await safeEditOrReply(ctx, text, { reply_markup: kb }); } catch { await ctx.reply(text, { reply_markup: kb }); }
      }
      return;
    }
    if (p.a === 'a:brand_app_tpl_send') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const appId = Number(p.id || 0);
      if (!appId) return;
      const key = String(p.k || 'discuss');
      const back = { status: String(p.s || 'new'), page: Math.max(0, Number(p.p || 0)) };
      try {
        await sendBrandAppTemplateReply(ctx, u.id, appId, key, back);
      } catch (e) {
        try { console.warn('[brand_app_tpl_send] unhandled', { appId, key, back, cid: ctx.state?.cid || null, err: errInfo(e) }); } catch {}
        const text = '⚠️ Не удалось отправить шаблон. Попробуй ещё раз или нажми «✍️ Ответить» и отправь вручную.';
        const kb = new InlineKeyboard()
          .text('✍️ Ответить', 'a:brand_app_reply|id:' + appId + '|s:' + back.status + '|p:' + back.page)
          .row()
          .text('⬅️ Назад', 'a:brand_app_view|id:' + appId + '|s:' + back.status + '|p:' + back.page)
          .text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');
        try { await safeEditOrReply(ctx, text, { reply_markup: kb }); } catch { await ctx.reply(text, { reply_markup: kb }); }
      }
      return;
    }
    if (p.a === 'a:brand_app_accept') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const appId = Number(p.id || 0);
      if (!appId) return;
      const back = { status: String(p.s || 'new'), page: Math.max(0, Number(p.p || 0)) };
      try {
        await acceptBrandApplication(ctx, u.id, appId, back);
      } catch (e) {
        try { console.warn('[brand_app_accept] unhandled', { appId, back, cid: ctx.state?.cid || null, err: errInfo(e) }); } catch {}
        const text = '⚠️ Не удалось выполнить действие. Попробуй ещё раз или открой заявку заново.';
        const kb = new InlineKeyboard()
          .text('⬅️ Назад', 'a:brand_app_view|id:' + appId + '|s:' + back.status + '|p:' + back.page)
          .text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');
        try { await safeEditOrReply(ctx, text, { reply_markup: kb }); } catch { await ctx.reply(text, { reply_markup: kb }); }
      }
      return;
    }
  })();
  return true;
}

export async function handleApplicationDealsCallback(ctx, p, u, deps = {}) {
  if (!isApplicationDealsAction(p?.a)) return false;
  const bound = bindDependencies(deps);
  const {
  BRAND_APP_ACCEPT_COST,
  BX_HOME,
  InlineKeyboard,
  LEAD_STATUSES,
  UI_MODES,
  acceptBrandApplication,
  answerRecovery,
  assertBrandAppsAccess,
  bmResolveAssert,
  brandAppDealButtonLabel,
  brandAppOpenButtonLabel,
  brandAppReplyButtonLabel,
  brandAppReplyRecoveryKb,
  brandDealAppBackCb,
  brandDealViewCb,
  buildBrandAppReplyRecoveryText,
  buildCreatorBrandAppChatRecoveryText,
  clearBrandApplyDraft,
  clearBrandDealsMineOnly,
  clearBrandDealsSearch,
  clearExpectText,
  creatorBrandAppChatRecoveryKb,
  db,
  dealStageTitle,
  ensureWorkspaceForOwner,
  errInfo,
  getBrandAppForActorSafe,
  getBrandApplyDraft,
  getBrandDealsMineOnly,
  getBrandManagerMode,
  getExpectText,
  isAcceptedBrandDeal,
  isSuperAdminTg,
  kbBrandAppAcceptedDone,
  kbBrandApplyDone,
  navKb,
  normDealStage,
  normLeadStatus,
  normalizeUiMode,
  renderBrandAppCardForCreator,
  renderBrandAppTemplatePreview,
  renderBrandAppTemplates,
  renderBrandAppView,
  renderBrandApply,
  renderBrandApplyPreview,
  renderBrandAppsList,
  renderBrandDealTemplates,
  renderBrandDealView,
  renderBrandDealsList,
  renderBxInbox,
  renderCreatorApplications,
  renderWsLeadsList,
  resolveUiMode,
  ruPlural,
  safeBrandApplications,
  safeBrandAppsWrite,
  safeEditOrReply,
  sendBrandAppTemplateReply,
  sendBrandApplyDraft,
  sendBrandDealTemplateReply,
  setBrandDealsMineOnly,
  setExpectText,
  startBrandAppChatForCreator,
  startBrandAppReply,
  startBrandDealReply
  } = bound;

  await (async () => {
    	if (p.a === 'a:brand_deals') {
    	  await ctx.answerCallbackQuery();
    	  const stage = String(p.st || 'negotiation');
    	  const page = Math.max(0, Number(p.p || 0));

    	  const bmRes = await bmResolveAssert(ctx, u, 0, 'brand_deals', page);
    	  if (!bmRes) return;

    	  await renderBrandDealsList(ctx, u.id, bmRes.userId, stage, page);
    	  return;
    	}
    	if (p.a === 'a:brand_deals_search') {
      await ctx.answerCallbackQuery();
      const stage = String(p.st || 'negotiation');
      const page = Math.max(0, Number(p.p || 0));
      const bmRes = await bmResolveAssert(ctx, u, 0, 'brand_deals', page);
      if (!bmRes) return;
      const backCb = `a:brand_deals|ws:0|st:${stage}|p:${page}`;
      await setExpectText(ctx.from.id, { type: 'brand_deals_search', brandUserId: bmRes.userId, stage, page, backCb });
      const kb = navKb(backCb);
      const t = '🔎 <b>Поиск по сделкам</b>\n\nВарианты:\n• <code>@username</code> — пример: <code>@creator</code>\n• <code>TG id</code> (цифры) — пример: <code>123456789</code>\n\nПодсказки:\n• если начинаешь с <code>@</code>, добавь минимум 2 символа после @\n• если вводишь цифры — обычно 6–12 цифр\n\nЧтобы сбросить: <code>сброс</code>';
      try { await safeEditOrReply(ctx, t, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true }); }
      catch { await ctx.reply(t, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true }); }
      return;
    }
    if (p.a === 'a:brand_deals_search_clear') {
      await ctx.answerCallbackQuery();
      const stage = String(p.st || 'negotiation');
      const page = Math.max(0, Number(p.p || 0));
      const bmRes = await bmResolveAssert(ctx, u, 0, 'brand_deals', page);
      if (!bmRes) return;
      await clearBrandDealsSearch(ctx.from.id, bmRes.userId);
      await renderBrandDealsList(ctx, u.id, bmRes.userId, stage, page);
      return;
    }
    if (p.a === 'a:brand_deals_filters_clear') {
      await ctx.answerCallbackQuery();
      const stage = String(p.st || 'negotiation');
      const bmRes = await bmResolveAssert(ctx, u, 0, 'brand_deals', 0);
      if (!bmRes) return;

      // Clear both filters (search + mineOnly)
      await clearBrandDealsSearch(ctx.from.id, bmRes.userId);
      await clearBrandDealsMineOnly(ctx.from.id, bmRes.userId);

      await renderBrandDealsList(ctx, u.id, bmRes.userId, stage, 0);
      return;
    }
    if (p.a === 'a:brand_deals_mine_toggle') {
      await ctx.answerCallbackQuery();
      const stage = String(p.st || 'negotiation');
      const page = Math.max(0, Number(p.p || 0));

      const bmRes = await bmResolveAssert(ctx, u, 0, 'brand_deals', page);
      if (!bmRes) return;

      const access = await assertBrandAppsAccess(ctx, u.id, bmRes.userId);
      if (!access.ok) return;

      if (!access.isManager) {
        try { await ctx.answerCallbackQuery({ text: 'Доступно только менеджеру.' }); } catch {}
        return;
      }

      const cur = await getBrandDealsMineOnly(ctx.from.id, bmRes.userId);
      if (cur) await clearBrandDealsMineOnly(ctx.from.id, bmRes.userId);
      else await setBrandDealsMineOnly(ctx.from.id, bmRes.userId, true);

      await renderBrandDealsList(ctx, u.id, bmRes.userId, stage, page);
      return;
    }
    if (p.a === 'a:brand_deal_view') {
    	  await ctx.answerCallbackQuery();
    	  const appId = Number(p.id || 0);
    	  const back = { stage: String(p.st || 'negotiation'), page: Math.max(0, Number(p.p || 0)), ab: String(p.ab || '') };
    	  await renderBrandDealView(ctx, u.id, appId, back);
    	  return;
    	}
    	if (p.a === 'a:brand_deal_set') {
    	  const appId = Number(p.id || 0);
    	  const stage = normDealStage(String(p.st || 'negotiation'));
    	  const prevStage = normDealStage(String(p.c || 'negotiation'));
    	  const back = { stage: String(p.b || 'negotiation'), page: Math.max(0, Number(p.p || 0)), ab: String(p.ab || '') };
    	  if (!appId) return;

    	  const app = await getBrandAppForActorSafe(ctx, u.id, appId);
    	  if (!app) {
    	    try { await ctx.answerCallbackQuery({ text: 'Сделка не найдена.' }); } catch {}
    	    return;
    	  }
    	  const access = await assertBrandAppsAccess(ctx, u.id, Number(app.brand_user_id));
    	  if (!access.ok) return;
    	  if (!isAcceptedBrandDeal(app)) {
    	    try { await ctx.answerCallbackQuery({ text: 'Сделка ещё не открыта.' }); } catch {}
    	    await renderBrandAppView(ctx, u.id, appId, { status: normLeadStatus(app.status), page: 0 });
    	    return;
    	  }

    	  const flash = prevStage === stage
    	    ? `Этап уже: ${dealStageTitle(stage)}`
    	    : `Этап обновлён: ${dealStageTitle(prevStage)} → ${dealStageTitle(stage)}`;
    	  try { await ctx.answerCallbackQuery({ text: flash }); } catch {}
    	  await safeBrandApplications(() => db.setBrandApplicationDealStage(appId, stage, u.id), async () => null);
    	  await renderBrandDealView(ctx, u.id, appId, { ...back, flash });
    	  return;
    	}
    if (p.a === 'a:brand_deal_reply') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const appId = Number(p.id || 0);
      const back = { stage: String(p.b || p.st || 'negotiation'), page: Math.max(0, Number(p.p || 0)), ab: String(p.ab || '') };
      if (!appId) return;
      try {
        await startBrandDealReply(ctx, u.id, appId, back);
      } catch (e) {
        try { console.warn('[brand_deal_reply] unhandled', { appId, back, cid: ctx.state?.cid || null, err: errInfo(e) }); } catch {}
        const backCb = brandDealViewCb(appId, back);
        const kb = brandAppReplyRecoveryKb({
          primaryLabel: brandAppDealButtonLabel(),
          primaryCb: backCb,
          secondaryLabel: '📨 Открыть заявку',
          secondaryCb: brandDealAppBackCb(appId, back)
        });
        const msg = buildBrandAppReplyRecoveryText({
          appId,
          kind: 'open_error',
          subjectLabel: `сделке #${appId}`,
          contextLabel: brandAppDealButtonLabel(),
          secondaryLabel: '📨 Открыть заявку',
          replyLabel: brandAppReplyButtonLabel()
        });
        try { await safeEditOrReply(ctx, msg, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true }); } catch { await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true }); }
      }
      return;
    }
    if (p.a === 'a:brand_deal_tpls') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const appId = Number(p.id || 0);
      const back = { stage: String(p.b || p.st || 'negotiation'), page: Math.max(0, Number(p.p || 0)), ab: String(p.ab || '') };
      if (!appId) return;
      await renderBrandDealTemplates(ctx, u.id, appId, back);
      return;
    }
    if (p.a === 'a:brand_deal_tpl') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const appId = Number(p.id || 0);
      const key = String(p.k || 'discuss');
      const back = { stage: String(p.b || 'negotiation'), page: Math.max(0, Number(p.p || 0)), ab: String(p.ab || '') };
      if (!appId) return;
      await sendBrandDealTemplateReply(ctx, u.id, appId, key, back);
      return;
    }
  })();
  return true;
}

