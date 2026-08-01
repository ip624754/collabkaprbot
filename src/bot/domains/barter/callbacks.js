import {
  isBarterConversationAction,
  isBarterDiscoveryAction,
  isBarterOfficialAction,
  isBarterOfferAction,
} from './policy.js';

const DISCOVERY_REQUIRED_DEPENDENCIES = Object.freeze([
  'BRAND_GOALS_KEYS',
  'BRAND_REQ_KEYS',
  'BX_HOME',
  'CFG',
  'UI_MODES',
  'bmResolveAssert',
  'bxSmartKb',
  'bxSmartPrefillText',
  'db',
  'deriveBxSmartPrefillFromBrandProfile',
  'ensureWorkspaceForOwner',
  'getBxFilterScoped',
  'maybeSendBanner',
  'navKb',
  'normBxRet',
  'normBxTagFilterKey',
  'renderBxBrandOnlyNotice',
  'renderBxFeed',
  'renderBxFilterMultiPick',
  'renderBxFilterPick',
  'renderBxFilters',
  'renderBxOpen',
  'renderBxPublicView',
  'renderNetConfirm',
  'resolveBxHomeFromUi',
  'resolveUiMode',
  'safeBrandProfiles',
  'safeEditOrReply',
  'setBxFilterScoped',
  'setUiMode',
]);

const OFFICIAL_REQUIRED_DEPENDENCIES = Object.freeze([
  'CFG',
  'answerRecovery',
  'db',
  'isModerator',
  'notifyOfficialQueueAdmins',
  'queueOfficialPublishToOfficialChannel',
  'removeOfficialOfferPost',
  'renderOfficialManageView',
  'renderOfficialQueue',
  'renderOfficialRequestHome',
  'safeEditOrReply',
  'safeOfficialPosts',
  'verifyOfficialPublishState',
]);

const CONVERSATION_REQUIRED_DEPENDENCIES = Object.freeze([
  'BX_HOME',
  'CFG',
  'CRM_STAGES',
  'InlineKeyboard',
  'MONETIZATION_CB_TIMEOUT_MS',
  'MONETIZATION_TOKEN_LOCK_TTL_SEC',
  'acquireLock',
  'bmResolveAssert',
  'bxThreadStageTitle',
  'bxThreadTriageTitle',
  'db',
  'enqueueMonetizationRetry',
  'fmtWait',
  'isBrandBasicComplete',
  'isMonetizationAsyncRetryEnabled',
  'isTransientNeonError',
  'k',
  'normBxRet',
  'rateLimit',
  'releaseLock',
  'renderBrandPaywall',
  'renderBrandProfileHome',
  'renderBxInbox',
  'renderBxProofs',
  'renderBxPublicView',
  'renderBxThread',
  'resolveBxHomeFromUi',
  'safeBrandProfiles',
  'safeEditOrReply',
  'safeUserVerifications',
  'setBrandCreditsCache',
  'setExpectText',
  'setMonIntroDiag',
  'withTimeout',
]);

const OFFER_REQUIRED_DEPENDENCIES = Object.freeze([
  'BRAND_GOALS_KEYS',
  'BRAND_REQ_KEYS',
  'BX_PRESETS',
  'CFG',
  'InlineKeyboard',
  'answerRecovery',
  'bxCategoryKb',
  'bxCompKb',
  'bxKindKb',
  'bxPresetKb',
  'bxTypeKb',
  'clearDraft',
  'clearExpectText',
  'db',
  'escapeHtml',
  'extractFirstContact',
  'getDraft',
  'isWorkspaceDisconnected',
  'kbBxPubDone',
  'logger',
  'navKb',
  'opaqueLogRef',
  'parseOfferMeta',
  'renderBxMediaStep',
  'renderBxMy',
  'renderBxMyArchive',
  'renderBxOfferDraftStep',
  'renderBxOfferPreviewStep',
  'renderBxOfferTagsPicker',
  'renderBxOfferTagsStep',
  'renderBxOfferTextInputStep',
  'renderBxOfferWizTagsHome',
  'renderBxOfferWizTagsPicker',
  'renderBxOpen',
  'renderBxView',
  'renderRecovery',
  'renderWsDisconnected',
  'safeEditOrReply',
  'safeLogError',
  'sendBxPreview',
  'setDraft',
  'setExpectText',
  'truncateText',
]);

function bindDependencies(deps, names) {
  for (const name of names) {
    if (deps?.[name] === null || deps?.[name] === undefined) {
      throw new Error('barter_domain.missing_dependency:' + name);
    }
  }
  return deps;
}

export async function handleBarterDiscoveryCallback(ctx, p, u, deps = {}) {
  if (!isBarterDiscoveryAction(p?.a)) return false;
  const bound = bindDependencies(deps, DISCOVERY_REQUIRED_DEPENDENCIES);
  const {
    BRAND_GOALS_KEYS,
    BRAND_REQ_KEYS,
    BX_HOME,
    CFG,
    UI_MODES,
    bmResolveAssert,
    bxSmartKb,
    bxSmartPrefillText,
    db,
    deriveBxSmartPrefillFromBrandProfile,
    ensureWorkspaceForOwner,
    getBxFilterScoped,
    maybeSendBanner,
    navKb,
    normBxRet,
    normBxTagFilterKey,
    renderBxBrandOnlyNotice,
    renderBxFeed,
    renderBxFilterMultiPick,
    renderBxFilterPick,
    renderBxFilters,
    renderBxOpen,
    renderBxPublicView,
    renderNetConfirm,
    resolveBxHomeFromUi,
    resolveUiMode,
    safeBrandProfiles,
    safeEditOrReply,
    setBxFilterScoped,
    setUiMode,
  } = bound;

  await (async () => {
    if (p.a === 'a:bx_home') {
      await ctx.answerCallbackQuery();
      const ws = await ensureWorkspaceForOwner(ctx, u.id, { minimal: true });
      if (!ws) return;
      await renderBxOpen(ctx, u.id, ws.id);
      return;
    }


    if (p.a === 'a:bx_open') {
      const wsId = Number(p.ws);
      await ctx.answerCallbackQuery();
      if (wsId === 0) await setUiMode(ctx.from.id, UI_MODES.BRAND);
      if (wsId === 0) await maybeSendBanner(ctx, 'brand', CFG.BRAND_BANNER_FILE_ID);

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_open', 0);
      if (!bmRes) return;

      await renderBxOpen(ctx, bmRes.userId, wsId);
      return;
    }


    if (p.a === 'a:bx_enable_net') {
      const wsId = Number(p.ws);
      await renderNetConfirm(ctx, u.id, wsId, 'bx');
      return;
    }


    if (p.a === 'a:bx_smart') {
      await ctx.answerCallbackQuery();

      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const mode = await resolveUiMode(ctx.from.id);
      if (mode !== UI_MODES.BRAND) {
        await renderBxBrandOnlyNotice(ctx);
        return;
      }

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_smart', 0);
      if (!bmRes) return;

      const prof = await safeBrandProfiles(() => db.getBrandProfile(bmRes.userId), async () => null);
      const info = deriveBxSmartPrefillFromBrandProfile(prof);

      const next = await setBxFilterScoped(ctx.from.id, bmRes.userId, wsId, {
        category: null,
        offerType: info.offerType,
        compensationType: info.compensationType,
      });

      const totalAll = await db.countNetworkBarterOffers({ category: null, offerType: null, compensationType: null });
      const totalFiltered = await db.countNetworkBarterOffers({
        category: null,
        offerType: next.offerType,
        compensationType: next.compensationType,
      });

      await safeEditOrReply(ctx,
        bxSmartPrefillText(next, info, totalAll, totalFiltered),
        { parse_mode: 'HTML', reply_markup: bxSmartKb(wsId, { h }) }
      );
      return;
    }


        if (p.a === 'a:bx_smart_reset') {
          await ctx.answerCallbackQuery();

          const wsId = Number(p.w || p.ws || 0);

          const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
          const mode = await resolveUiMode(ctx.from.id);
          if (mode !== UI_MODES.BRAND) {
            await renderBxBrandOnlyNotice(ctx);
            return;
          }

          const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_feed', 0);
          if (!bmRes) return;

            await setBxFilterScoped(ctx.from.id, bmRes.userId, wsId, { category: null, offerType: null, compensationType: null, goalsTags: [], reqTags: [] });
          await renderBxFeed(ctx, bmRes.userId, wsId, 0, { h });
          return;
        }


    if (p.a === 'a:bx_feed') {
      await ctx.answerCallbackQuery();

      const mode = await resolveUiMode(ctx.from.id);
      if (mode !== UI_MODES.BRAND) {
        await renderBxBrandOnlyNotice(ctx);
        return;
      }
      const wsId = Number(p.ws);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_feed', page);
      if (!bmRes) return;

      await renderBxFeed(ctx, bmRes.userId, wsId, page, { h });
      return;
    }


    if (p.a === 'a:bx_filters') {
      await ctx.answerCallbackQuery();

      const mode = await resolveUiMode(ctx.from.id);
      if (mode !== UI_MODES.BRAND) {
        await renderBxBrandOnlyNotice(ctx);
        return;
      }
      const wsId = Number(p.ws);

      // Return-to page (feed page). Support rp (new) and p (legacy).
      const retPage = Number(p.rp ?? p.p ?? 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const r = normBxRet(p.r, wsId ? BX_HOME.BX_OPEN : h);

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_filters', retPage, { h, r });
      if (!bmRes) return;

      await renderBxFilters(ctx, bmRes.userId, wsId, retPage, { h, r });
      return;
    }


          if (p.a === 'a:bx_mpick') {
            await ctx.answerCallbackQuery();

            const mode = await resolveUiMode(ctx.from.id);
            if (mode !== UI_MODES.BRAND) {
              await renderBxBrandOnlyNotice(ctx);
              return;
            }
            const wsId = Number(p.ws);
            const page = Number(p.p || 0); // legacy: used as picker page in old messages
            const key = normBxTagFilterKey(p.k);
          if (!key) {
            const kb = navKb('a:menu');
            await safeEditOrReply(ctx, '⚠️ <b>Эта кнопка устарела</b>\n\nОткрой «📋 Меню» → 📰 Лента креаторов → 🎛 Фильтры.', { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
            return;
          }

            const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
          const r = normBxRet(p.r, wsId ? BX_HOME.BX_OPEN : h);

          const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_filters', page, { h, r });
            if (!bmRes) return;

            await renderBxFilterMultiPick(ctx, bmRes.userId, wsId, key, page, { h, r });
            return;
          }


          if (p.a === 'a:bx_mt') {
            await ctx.answerCallbackQuery();

            const mode = await resolveUiMode(ctx.from.id);
            if (mode !== UI_MODES.BRAND) {
              await renderBxBrandOnlyNotice(ctx);
              return;
            }
            const wsId = Number(p.ws);
            const page = Number(p.p || 0); // legacy: used as picker page in old messages
            const key = normBxTagFilterKey(p.k);
          const v = String(p.v || '');
          if (!key) {
            const kb = navKb('a:menu');
            await safeEditOrReply(ctx, '⚠️ <b>Эта кнопка устарела</b>\n\nОткрой «📋 Меню» → 📰 Лента креаторов → 🎛 Фильтры.', { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
            return;
          }

            const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
          const r = normBxRet(p.r, wsId ? BX_HOME.BX_OPEN : h);

          const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_filters', page, { h, r });
            if (!bmRes) return;

            const cur = await getBxFilterScoped(ctx.from.id, bmRes.userId, wsId);
            const field = key === 'goals' ? 'goalsTags' : 'reqTags';
            const allowed = key === 'goals' ? BRAND_GOALS_KEYS : BRAND_REQ_KEYS;
            if (!allowed.has(v)) {
              await renderBxFilterMultiPick(ctx, bmRes.userId, wsId, key, page, { h, r });
              return;
            }

            const set = new Set(Array.isArray(cur[field]) ? cur[field] : []);
            if (set.has(v)) set.delete(v);
            else set.add(v);

            await setBxFilterScoped(ctx.from.id, bmRes.userId, wsId, { [field]: Array.from(set) });
            await renderBxFilterMultiPick(ctx, bmRes.userId, wsId, key, page, { h, r });
            return;
          }


          if (p.a === 'a:bx_mclear') {
            await ctx.answerCallbackQuery();

            const mode = await resolveUiMode(ctx.from.id);
            if (mode !== UI_MODES.BRAND) {
              await renderBxBrandOnlyNotice(ctx);
              return;
            }
            const wsId = Number(p.ws);
            const page = Number(p.p || 0); // legacy: used as picker page in old messages
            const key = normBxTagFilterKey(p.k);
          if (!key) {
            const kb = navKb('a:menu');
            await safeEditOrReply(ctx, '⚠️ <b>Эта кнопка устарела</b>\n\nОткрой «📋 Меню» → 📰 Лента креаторов → 🎛 Фильтры.', { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
            return;
          }

            const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
          const r = normBxRet(p.r, wsId ? BX_HOME.BX_OPEN : h);

          const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_filters', page, { h, r });
            if (!bmRes) return;

            const field = key === 'goals' ? 'goalsTags' : 'reqTags';
            await setBxFilterScoped(ctx.from.id, bmRes.userId, wsId, { [field]: [] });
            await renderBxFilterMultiPick(ctx, bmRes.userId, wsId, key, page, { h, r });
            return;
          }


          if (p.a === 'a:bx_mdone') {
            await ctx.answerCallbackQuery();

            const mode = await resolveUiMode(ctx.from.id);
            if (mode !== UI_MODES.BRAND) {
              await renderBxBrandOnlyNotice(ctx);
              return;
            }
            const wsId = Number(p.ws);
            const page = Number(p.p || 0); // legacy: used as picker page in old messages

            const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
          const r = normBxRet(p.r, wsId ? BX_HOME.BX_OPEN : h);

          const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_filters', page, { h, r });
            if (!bmRes) return;

            await renderBxFilters(ctx, bmRes.userId, wsId, page, { h, r });
            return;
          }


          if (p.a === 'a:bx_fpick') {
            await ctx.answerCallbackQuery();

            const mode = await resolveUiMode(ctx.from.id);
            if (mode !== UI_MODES.BRAND) {
              await renderBxBrandOnlyNotice(ctx);
              return;
            }
            const wsId = Number(p.ws);
            const page = Number(p.p || 0); // legacy: used as picker page in old messages
            const key = String(p.k || '');

            const retPage = Number(p.rp ?? p.p ?? 0);
            const pickPage = Number(p.pg ?? p.p ?? 0);

            const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
          const r = normBxRet(p.r, wsId ? BX_HOME.BX_OPEN : h);

          const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_filters', retPage, { h, r });
            if (!bmRes) return;

            // Open picker (do NOT change the filter here)
            await renderBxFilterPick(ctx, bmRes.userId, wsId, key, retPage, pickPage, { h, r });
            return;
          }


    if (p.a === 'a:bx_fset') {
      await ctx.answerCallbackQuery();

      const mode = await resolveUiMode(ctx.from.id);
      if (mode !== UI_MODES.BRAND) {
        await renderBxBrandOnlyNotice(ctx);
        return;
      }
      const wsId = Number(p.ws);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages
      const keyRaw = String(p.k || '');
      const vRaw = p.v ? String(p.v) : null;

      const retPage = Number(p.rp ?? p.p ?? 0);
      const pickPage = Number(p.pg ?? p.p ?? 0);

      // UI uses short keys (cat/type/comp). Storage uses canonical keys.
      const key = keyRaw === 'cat'
        ? 'category'
        : (keyRaw === 'type' ? 'offerType' : (keyRaw === 'comp' ? 'compensationType' : keyRaw));
      const v = vRaw === 'all' ? null : vRaw;

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const r = normBxRet(p.r, wsId ? BX_HOME.BX_OPEN : h);

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_filters', retPage, { h, r });
      if (!bmRes) return;

      await setBxFilterScoped(ctx.from.id, bmRes.userId, wsId, { [key]: v });

      // UX: single-pick stays in picker; user exits via ✅ Готово / ⬅️ Назад / 📋 Меню
      const pickKey = keyRaw === 'category' ? 'cat' : (keyRaw === 'offerType' ? 'type' : (keyRaw === 'compensationType' ? 'comp' : keyRaw));
      await renderBxFilterPick(ctx, bmRes.userId, wsId, pickKey, retPage, pickPage, { h, r });
      return;
    }

    if (p.a === 'a:bx_freset') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);

      // Legacy: older messages used p as the only page param (we treat it as return-to page).
      const retPage = Number(p.rp ?? p.p ?? 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const r = normBxRet(p.r, wsId ? BX_HOME.BX_OPEN : h);

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_filters', retPage, { h, r });
      if (!bmRes) return;

      await setBxFilterScoped(ctx.from.id, bmRes.userId, wsId, { category: null, offerType: null, compensationType: null, goalsTags: [], reqTags: [] });
      await renderBxFilters(ctx, bmRes.userId, wsId, retPage, { h, r });
      return;
    }



    if (p.a === 'a:bx_pub') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      const offerId = Number(p.o);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      await renderBxPublicView(ctx, u.id, wsId, offerId, page, { h });
      return;
    }

    if (p.a === 'a:offer_open') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      const offerId = Number(p.id || 0);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages
      if (!offerId) {
        await ctx.answerCallbackQuery({ text: 'Оффер не найден.', show_alert: true });
        return;
      }
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      await renderBxPublicView(ctx, u.id, wsId, offerId, page, { h });
      return;
    }

    throw new Error('barter_domain.unreachable_action:' + String(p?.a || 'missing'));
  })();
  return true;
}

export async function handleBarterOfficialCallback(ctx, p, u, deps = {}) {
  if (!isBarterOfficialAction(p?.a)) return false;
  const bound = bindDependencies(deps, OFFICIAL_REQUIRED_DEPENDENCIES);
  const {
    CFG,
    answerRecovery,
    db,
    isModerator,
    notifyOfficialQueueAdmins,
    queueOfficialPublishToOfficialChannel,
    removeOfficialOfferPost,
    renderOfficialManageView,
    renderOfficialQueue,
    renderOfficialRequestHome,
    safeEditOrReply,
    safeOfficialPosts,
    verifyOfficialPublishState,
  } = bound;

  await (async () => {



    if (p.a === 'a:off_manage') {
      await ctx.answerCallbackQuery();
      await renderOfficialManageView(ctx, u.id, Number(p.ws), Number(p.o), Number(p.p || 0), p.back || '');
      return;
    }


    if (p.a === 'a:off_req_home') {
      await ctx.answerCallbackQuery();
      await renderOfficialRequestHome(ctx, u.id, Number(p.ws), Number(p.o), Number(p.p || 0), p.back || '');
      return;
    }


    if (p.a === 'a:off_req') {
      await ctx.answerCallbackQuery();
      if (!CFG.OFFICIAL_PUBLISH_ENABLED) {
        await ctx.answerCallbackQuery({ text: 'Фича отключена.', show_alert: true });
        return;
      }
      const mode = String(CFG.OFFICIAL_PUBLISH_MODE || 'manual').toLowerCase();
      if (!(mode === 'manual' || mode === 'mixed')) {
        await ctx.answerCallbackQuery({ text: 'Очередь доступна только в manual/mixed.', show_alert: true });
        return;
      }

      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const days = Math.max(1, Math.min(365, Number(p.days || 0) || Number(CFG.OFFICIAL_MANUAL_DEFAULT_DAYS || 3)));

      const offer = await db.getBarterOfferPublic(offerId);
      if (!offer) {
        await ctx.answerCallbackQuery({ text: 'Оффер не найден.', show_alert: true });
        return;
      }

      const isOwner = Number(offer.owner_user_id) === Number(u.id);
      const isMod = await isModerator(u, ctx.from.id);
      if (!isOwner && !isMod) {
        await answerRecovery(ctx, 'offer', { showAlert: true });
        return;
      }

      const channelId = Number(CFG.OFFICIAL_CHANNEL_ID || 0);
      if (!channelId) {
        await ctx.answerCallbackQuery({ text: 'OFFICIAL_CHANNEL_ID не задан.', show_alert: true });
        return;
      }

      try {
        await safeOfficialPosts(
          () => db.upsertOfficialPostDraft({
            offerId,
            channelChatId: channelId,
            placementType: 'MANUAL',
            slotDays: days
          }),
          async () => null
        );

        // Notify super admins (deduped) so queue doesn't get lost.
        try {
          const fromTag = ctx.from?.username ? `@${ctx.from.username}` : `tg:${ctx.from?.id}`;
          await notifyOfficialQueueAdmins(ctx.api, {
            kind: 'manual',
            offerId,
            wsId,
            offerTitle: offer?.title || '',
            wsTitle: offer?.ws_title || '',
            channelUsername: offer?.channel_username || '',
            days,
            fromTag
          });
        } catch (_) { /* ignore */ }
      } catch (e) {
        await ctx.answerCallbackQuery({ text: `Ошибка: ${String(e?.message || e)}`.slice(0, 190), show_alert: true });
        return;
      }

      await ctx.answerCallbackQuery({ text: '✅ Заявка добавлена в очередь.', show_alert: false });
      await renderOfficialManageView(ctx, u.id, wsId, offerId, Number(p.p || 0), p.back || '');
      return;
    }


    if (p.a === 'a:off_req_cancel') {
      await ctx.answerCallbackQuery();
      if (!CFG.OFFICIAL_PUBLISH_ENABLED) {
        await ctx.answerCallbackQuery({ text: 'Фича отключена.', show_alert: true });
        return;
      }
      const wsId = Number(p.ws);
      const offerId = Number(p.o);

      const offer = await db.getBarterOfferPublic(offerId);
      if (!offer) {
        await ctx.answerCallbackQuery({ text: 'Оффер не найден.', show_alert: true });
        return;
      }

      const isOwner = Number(offer.owner_user_id) === Number(u.id);
      const isMod = await isModerator(u, ctx.from.id);
      if (!isOwner && !isMod) {
        await answerRecovery(ctx, 'offer', { showAlert: true });
        return;
      }

      try {
        await safeOfficialPosts(() => db.setOfficialPostStatus(offerId, 'REMOVED'), async () => null);
      } catch (e) {
        await ctx.answerCallbackQuery({ text: `Ошибка: ${String(e?.message || e)}`.slice(0, 190), show_alert: true });
        return;
      }

      await ctx.answerCallbackQuery({ text: '🗑 Заявка отменена.', show_alert: false });
      await renderOfficialManageView(ctx, u.id, wsId, offerId, Number(p.p || 0), p.back || '');
      return;
    }


    if (p.a === 'a:off_pub') {
      await ctx.answerCallbackQuery();
      if (!CFG.OFFICIAL_PUBLISH_ENABLED) {
        await ctx.answerCallbackQuery({ text: 'Фича отключена.', show_alert: true });
        return;
      }

      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const can = await isModerator(u, ctx.from.id);
      if (!can) {
        await ctx.answerCallbackQuery({ text: 'Нет прав.', show_alert: true });
        return;
      }

      const mode = String(CFG.OFFICIAL_PUBLISH_MODE || 'manual').toLowerCase();
      let placementType = 'MANUAL';
      let days = Number(CFG.OFFICIAL_MANUAL_DEFAULT_DAYS || 3);
      let paymentId = null;

      // Commit F: in paid mode allow publish ONLY for paid PENDING record (with payment_id)
      const post = await safeOfficialPosts(() => db.getOfficialPostByOfferId(offerId), async () => null);
      const postStatus = String(post?.status || '').toUpperCase();
      const isPaidPending = postStatus === 'PENDING' && !!post?.payment_id;

      if (mode === 'paid') {
        if (!isPaidPending) {
          await ctx.answerCallbackQuery({ text: 'Нет оплаченной заявки в очереди (PENDING).', show_alert: true });
          await renderOfficialManageView(ctx, u.id, wsId, offerId, Number(p.p || 0), p.back || '');
          return;
        }
        placementType = 'PAID';
        days = Math.max(1, Number(post?.slot_days || days));
        paymentId = Number(post.payment_id);
      } else if (mode === 'manual' || mode === 'mixed') {
        // In mixed mode we prefer paid placement if it exists
        if (isPaidPending) {
          placementType = 'PAID';
          days = Math.max(1, Number(post?.slot_days || days));
          paymentId = Number(post.payment_id);
        }
      } else {
        await ctx.answerCallbackQuery({ text: 'Публикация отключена этим режимом.', show_alert: true });
        return;
      }

      try {
        const pubRes = await queueOfficialPublishToOfficialChannel(ctx.api, offerId, {
          placementType,
          days,
          paymentId,
          publishedByUserId: u.id,
          keepExpiry: false,
        });
        if (pubRes && pubRes.locked) {
          await ctx.answerCallbackQuery({ text: '⏳ Уже публикуется. Попробуй чуть позже.', show_alert: true });
          await renderOfficialManageView(ctx, u.id, wsId, offerId, Number(p.p || 0), p.back || '');
          return;
        }

      } catch (e) {
        try {
          await db.setOfficialPostStatus(offerId, 'ERROR', { lastError: String(e?.message || e) });
        } catch (_) {}
        await ctx.answerCallbackQuery({ text: `Ошибка: ${String(e?.message || e)}`.slice(0, 190), show_alert: true });
      }
      await renderOfficialManageView(ctx, u.id, wsId, offerId, Number(p.p || 0), p.back || '');
      return;
    }


    if (p.a === 'a:off_verify') {
      await ctx.answerCallbackQuery({ text: 'Проверяю статус…' });
      if (!CFG.OFFICIAL_PUBLISH_ENABLED) {
        await ctx.answerCallbackQuery({ text: 'Фича отключена.', show_alert: true });
        return;
      }
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const can = await isModerator(u, ctx.from.id);
      if (!can) {
        await ctx.answerCallbackQuery({ text: 'Нет прав.', show_alert: true });
        return;
      }
      try {
        const result = await verifyOfficialPublishState({
          offerId,
          wsId,
          mode: 'manual',
          channelChatId: Number(CFG.OFFICIAL_CHANNEL_ID || 0),
        });
        const st = String(result?.status || '').toUpperCase();
        if (result?.reason === 'not_publishing') {
          await ctx.answerCallbackQuery({ text: st === 'ACTIVE' ? '✅ Уже ACTIVE.' : `Статус: ${st || '—'}`, show_alert: false });
        } else if (result?.reason === 'too_fresh') {
          await ctx.answerCallbackQuery({ text: '⏳ Публикация ещё слишком свежая. Проверь чуть позже.', show_alert: false });
        } else if (result?.via === 'redis_msgid') {
          await ctx.answerCallbackQuery({ text: '✅ Синхронизировано: ACTIVE.', show_alert: false });
        } else if (result?.via === 'reset_pending') {
          await ctx.answerCallbackQuery({ text: '🧹 Статус сброшен в PENDING.', show_alert: false });
        } else {
          await ctx.answerCallbackQuery({ text: 'Проверка выполнена.', show_alert: false });
        }
      } catch (e) {
        await ctx.answerCallbackQuery({ text: `Ошибка: ${String(e?.message || e)}`.slice(0, 190), show_alert: true });
      }
      await renderOfficialManageView(ctx, u.id, wsId, offerId, Number(p.p || 0), p.back || '');
      return;
    }


    if (p.a === 'a:off_upd') {
      await ctx.answerCallbackQuery();
      if (!CFG.OFFICIAL_PUBLISH_ENABLED) {
        await ctx.answerCallbackQuery({ text: 'Фича отключена.', show_alert: true });
        return;
      }
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const can = await isModerator(u, ctx.from.id);
      if (!can) {
        await ctx.answerCallbackQuery({ text: 'Нет прав.', show_alert: true });
        return;
      }
      try {
        const pubRes = await queueOfficialPublishToOfficialChannel(ctx.api, offerId, {
          placementType: 'UPDATE',
          keepExpiry: true,
          publishedByUserId: u.id
        });
        if (pubRes && pubRes.locked) {
          await ctx.answerCallbackQuery({ text: '⏳ Уже обновляется/публикуется. Попробуй чуть позже.', show_alert: true });
          await renderOfficialManageView(ctx, u.id, wsId, offerId, Number(p.p || 0), p.back || '');
          return;
        }

      } catch (e) {
        try { await db.setOfficialPostStatus(offerId, 'ERROR', { lastError: String(e?.message || e) }); } catch (_) {}
        await ctx.answerCallbackQuery({ text: `Ошибка: ${String(e?.message || e)}`.slice(0, 190), show_alert: true });
      }
      await renderOfficialManageView(ctx, u.id, wsId, offerId, Number(p.p || 0), p.back || '');
      return;
    }


    if (p.a === 'a:off_rm') {
      await ctx.answerCallbackQuery();
      if (!CFG.OFFICIAL_PUBLISH_ENABLED) {
        await ctx.answerCallbackQuery({ text: 'Фича отключена.', show_alert: true });
        return;
      }
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const can = await isModerator(u, ctx.from.id);
      if (!can) {
        await ctx.answerCallbackQuery({ text: 'Нет прав.', show_alert: true });
        return;
      }
      try {
        const rmRes = await removeOfficialOfferPost(ctx.api, offerId, 'REMOVED');

        if (rmRes && rmRes.locked) {
          await ctx.answerCallbackQuery({ text: '⏳ Сейчас уже выполняется действие по офиц.каналу. Попробуй позже.', show_alert: true });
          await renderOfficialManageView(ctx, u.id, wsId, offerId, Number(p.p || 0), p.back || '');
          return;
        }
      } catch (e) {
        try { await db.setOfficialPostStatus(offerId, 'ERROR', { lastError: String(e?.message || e) }); } catch (_) {}
        await ctx.answerCallbackQuery({ text: `Ошибка: ${String(e?.message || e)}`.slice(0, 190), show_alert: true });
      }
      await renderOfficialManageView(ctx, u.id, wsId, offerId, Number(p.p || 0), p.back || '');
      return;
    }


    if (p.a === 'a:off_queue') {
      await ctx.answerCallbackQuery();
      if (!CFG.OFFICIAL_PUBLISH_ENABLED) {
        await safeEditOrReply(ctx, 'Фича отключена.');
        return;
      }
      const can = await isModerator(u, ctx.from.id);
      if (!can) {
        await ctx.answerCallbackQuery({ text: 'Нет прав.', show_alert: true });
        return;
      }
      await renderOfficialQueue(ctx, u.id, Number(p.p || 0));
      return;
    }

    throw new Error('barter_domain.unreachable_action:' + String(p?.a || 'missing'));
  })();
  return true;
}

export async function handleBarterConversationCallback(ctx, p, u, deps = {}) {
  if (!isBarterConversationAction(p?.a)) return false;
  const bound = bindDependencies(deps, CONVERSATION_REQUIRED_DEPENDENCIES);
  const {
    BX_HOME,
    CFG,
    CRM_STAGES,
    InlineKeyboard,
    MONETIZATION_CB_TIMEOUT_MS,
    MONETIZATION_TOKEN_LOCK_TTL_SEC,
    acquireLock,
    bmResolveAssert,
    bxThreadStageTitle,
    bxThreadTriageTitle,
    db,
    enqueueMonetizationRetry,
    fmtWait,
    isBrandBasicComplete,
    isMonetizationAsyncRetryEnabled,
    isTransientNeonError,
    k,
    normBxRet,
    rateLimit,
    releaseLock,
    renderBrandPaywall,
    renderBrandProfileHome,
    renderBxInbox,
    renderBxProofs,
    renderBxPublicView,
    renderBxThread,
    resolveBxHomeFromUi,
    safeBrandProfiles,
    safeEditOrReply,
    safeUserVerifications,
    setBrandCreditsCache,
    setExpectText,
    setMonIntroDiag,
    withTimeout,
  } = bound;

  await (async () => {
    if (p.a === 'a:bx_report_offer') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      await safeEditOrReply(ctx, '🚩 Опиши проблему одним сообщением (почему жалоба).', {
        reply_markup: new InlineKeyboard().text('⬅️ Отмена', `a:bx_pub|ws:${wsId}|o:${offerId}|p:${page}|h:${h}`)
      });
      await setExpectText(ctx.from.id, { type: 'bx_report', kind: 'offer', wsId, offerId, page, h });
      return;
    }


    if (p.a === 'a:bx_report_thread') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const threadId = Number(p.t);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      await safeEditOrReply(ctx, '🚩 Опиши проблему одним сообщением (почему жалоба).', {
        reply_markup: new InlineKeyboard().text('⬅️ Отмена', `a:bx_thread|ws:${wsId}|t:${threadId}|p:${page}|h:${h}`)
      });
      await setExpectText(ctx.from.id, { type: 'bx_report', kind: 'thread', wsId, threadId, page, h });
      return;
    }

        if (p.a === 'a:bx_msg') {
          const wsId = Number(p.w || p.ws || 0);
          const offerId = Number(p.o || 0);
          const page = Number(p.p || 0); // legacy: used as picker page in old messages

          // Home/return context (used by thread header/back)
          const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
          const r = normBxRet(p.r, wsId ? BX_HOME.BX_OPEN : h);

          // Brand Manager in Brand Mode (ws:0): act as selected brand (brandUserId)
          let actorUserId = u.id;
          let bm = { enabled: false };
          if (wsId === 0) {
            const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_msg', page, { h, r });
            if (!bmRes) return;
            actorUserId = bmRes.userId;
            bm = bmRes.bm || { enabled: false };
          }

          // Brand profile gate (Brand Mode): require 4-step basic profile before messaging creators
          if (wsId === 0 && CFG.BRAND_PROFILE_REQUIRED) {
            const prof = await safeBrandProfiles(() => db.getBrandProfile(actorUserId), async () => null);
            if (!isBrandBasicComplete(prof)) {
              if (bm.enabled) {
                try {
                  await ctx.answerCallbackQuery({
                    text: '⚠️ Профиль бренда не заполнен. Попроси владельца бренда заполнить 4 базовых поля (Название, Ниша, Контакт, Ссылка).',
                    show_alert: true
                  });
                } catch {}
                await renderBxPublicView(ctx, actorUserId, wsId, offerId, page, { h });
                return;
              }

              try {
                await ctx.answerCallbackQuery({
                  text: '⚠️ Заполни профиль бренда (4 шага), чтобы писать креаторам.',
                  show_alert: true
                });
              } catch {}
              await renderBrandProfileHome(ctx, actorUserId, { wsId, ret: 'offer', backOfferId: offerId, backPage: page, edit: true });
              return;
            }
          }

          if (CFG.RATE_LIMIT_ENABLED) {
            try {
              const rl = await rateLimit(
                k(['rl', 'intro', actorUserId]),
                { limit: CFG.INTRO_RATE_LIMIT, windowSec: CFG.INTRO_RATE_WINDOW_SEC }
              );
              if (!rl.allowed) {
                try {
                  await ctx.answerCallbackQuery({
                    text: `⏳ Слишком часто. Подожди ${fmtWait(rl.resetSec)} и попробуй снова.`,
                    show_alert: true
                  });
                } catch {}
                return;
              }
            } catch {}
          }

          try { await ctx.answerCallbackQuery(); } catch {}
          db.trackEvent('intro_attempt', {
            userId: actorUserId,
            wsId: wsId || null,
            meta: {
              offerId,
              brandMode: wsId === 0,
              ...(bm.enabled ? { actingManagerTgId: Number(u.tg_id || 0) || Number(ctx.from?.id || 0) } : {})
            }
          });

          const dedupId = `mzr:intro_open:${offerId}:${actorUserId}`;
          const asyncRetryEnabled = isMonetizationAsyncRetryEnabled();

          // Redis-only breadcrumbs for ops
          try { await setMonIntroDiag({ offerId }); } catch {}

          const offerCb = `a:bx_pub|ws:${wsId}|o:${offerId}|p:${page}|h:${h}`;
          const inboxCb = `a:bx_inbox|ws:${wsId}|p:0|h:${h}`;

          const renderIntroPending = async (alreadyQueued = false) => {
            try { await ctx.answerCallbackQuery({ text: alreadyQueued ? '⏳ Уже в обработке…' : '⏳ В обработке…', show_alert: false }); } catch {}

            const kb = new InlineKeyboard()
              .text('💬 Диалоги', inboxCb)
              .text('🔄 Обновить', offerCb)
              .row()
              .text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');

            const hint = alreadyQueued
              ? 'Запрос уже в очереди.'
              : 'Мы поставили задачу в очередь.';

            await safeEditOrReply(
              ctx,
              `⏳ <b>В обработке…</b>
    <i>💬 Открываем диалог</i>

    ${hint} Открой «💬 Диалоги» или нажми «🔄 Обновить» через 10–30 секунд.`,
              { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true }
            );
          };

          // STEP176: Intro open (paid) — token-lock + circuit breaker + optional QStash commit.
          const lockKey = asyncRetryEnabled ? k(['mon', 'lock', 'intro_open', offerId, actorUserId]) : '';
          let lock = null;
          if (asyncRetryEnabled && lockKey) {
            let lockErr = false;
            try {
              lock = await acquireLock(lockKey, MONETIZATION_TOKEN_LOCK_TTL_SEC);
            } catch {
              lockErr = true;
              lock = null;
            }

            if (!lockErr && !lock) {
              try { await setMonIntroDiag({ status: 'ok', errorCode: 'queued', offerId }); } catch {}
              await renderIntroPending(true);
              return;
            }
          }

          // Pricing / limits (configurable)
          const cost = Math.max(1, Number(CFG.INTRO_COST_PER_INTRO || 1));
          const trialCredits = Math.max(0, Number(CFG.INTRO_TRIAL_CREDITS || 0));

          let res = null;
          try {
            let isVerified = false;
            if (CFG.VERIFICATION_ENABLED) {
              const v = await safeUserVerifications(() => db.getUserVerification(actorUserId), async () => null);
              isVerified = String(v?.status || '').toUpperCase() === 'APPROVED' && String(v?.kind || '').toLowerCase() === 'brand';
            }
            const dailyLimit = Math.max(0, Number(isVerified ? CFG.INTRO_DAILY_LIMIT : CFG.INTRO_DAILY_LIMIT_UNVERIFIED));

            res = asyncRetryEnabled
              ? await withTimeout(
                  db.getOrCreateBarterThreadWithCredits(
                    offerId,
                    actorUserId,
                    {
                      ...(wsId === 0 ? { forceBrand: true } : {}),
                      cost,
                      trialCredits,
                      dailyLimit: dailyLimit > 0 ? dailyLimit : null,
                      retryEnabled: CFG.INTRO_RETRY_ENABLED
                    }
                  ),
                  MONETIZATION_CB_TIMEOUT_MS,
                  'intro.open'
                )
              : await db.getOrCreateBarterThreadWithCredits(
                  offerId,
                  actorUserId,
                  {
                    ...(wsId === 0 ? { forceBrand: true } : {}),
                    cost,
                    trialCredits,
                    dailyLimit: dailyLimit > 0 ? dailyLimit : null,
                    retryEnabled: CFG.INTRO_RETRY_ENABLED
                  }
                );
          } catch (e) {
            // Neon slow / transient → queue commit (if lock acquired)
            if (asyncRetryEnabled && lock && isTransientNeonError(e)) {
              const q = await enqueueMonetizationRetry(
                'intro_open',
                {
                  offer_id: offerId,
                  buyer_user_id: actorUserId,
                  force_brand: wsId === 0 ? 1 : 0,
                  ws_ctx: wsId,
                  actor_tg_id: Number(ctx.from?.id || 0),
                  lock_key: lockKey,
                  lock_token: lock.token,
                },
                dedupId
              );
              if (q.ok) {
                try { await setMonIntroDiag({ status: 'ok', errorCode: 'queued', offerId }); } catch {}
                await renderIntroPending(false);
                return;
              }
            }

            // Queue path failed or not eligible
            try { await setMonIntroDiag({ status: 'error', errorCode: isTransientNeonError(e) ? 'queue_failed' : (e?.code || e?.message || 'error'), offerId }); } catch {}

            // enqueue failed or not eligible → release lock and show error
            if (lock && lockKey) {
              try { await releaseLock(lockKey, lock.token); } catch {}
            }
            try {
              await ctx.answerCallbackQuery({ text: '⚠️ Не получилось открыть диалог. Попробуй ещё раз позже.', show_alert: true });
            } catch {}
            return;
          }

          // release lock (normal sync path)
          if (lock && lockKey) {
            try { await releaseLock(lockKey, lock.token); } catch {}
          }

          // Best-effort: keep Redis credits cache in sync (no extra DB reads; balance already computed).
          if (res && res.balance !== null && res.balance !== undefined) {
            try { await setBrandCreditsCache(actorUserId, res.balance); } catch {}
          }

          if (!res) {
            try { await setMonIntroDiag({ status: 'skipped', errorCode: 'missing', offerId }); } catch {}
            return ctx.answerCallbackQuery({ text: 'Не получилось открыть диалог. Возможно оффер закрыт.' });
          }

          if (res.limitReached) {
            try { await setMonIntroDiag({ status: 'skipped', errorCode: 'limit_reached', offerId }); } catch {}
            const lim = Number(res.dailyLimit || 0);
            const used = Number(res.dailyUsed || 0);
            db.trackEvent('intro_blocked_daily_limit', { userId: actorUserId, wsId: wsId || null, meta: { offerId, lim, used } });
            try { await ctx.answerCallbackQuery({ text: `Лимит новых диалогов на сегодня: ${lim} (использовано: ${used}). Попробуй завтра.`, show_alert: true }); } catch {}
            return;
          }

          if (res.needPaywall) {
            try { await setMonIntroDiag({ status: 'skipped', errorCode: 'need_paywall', offerId }); } catch {}
            db.trackEvent('paywall_shown', { userId: actorUserId, wsId: wsId || null, meta: { offerId, cost, balance: Number(res.balance ?? 0), usedToday: Number(res.dailyUsed ?? 0), dailyLimit: Number(res.dailyLimit ?? 0) } });
            await renderBrandPaywall(ctx, actorUserId, wsId, offerId, page);
            return;
          }

          if (!res.ok || !res.thread) {
            try { await setMonIntroDiag({ status: 'error', errorCode: 'not_ok', offerId }); } catch {}
            return ctx.answerCallbackQuery({ text: 'Не получилось открыть диалог. Возможно оффер закрыт.' });
          }

          try { await setMonIntroDiag({ status: 'ok', errorCode: '', offerId }); } catch {}

          db.trackEvent('thread_opened', { userId: actorUserId, wsId: wsId || null, meta: { offerId, threadId: res.thread.id, charged: !!res.charged, chargedAmount: Number(res.chargedAmount || cost || 1) } });

          if (res.charged) {
            const left = Number(res.balance ?? 0);
            const amt = Number(res.chargedAmount || cost || 1);
            const bonus = res.trialGranted ? `🎁 Тест-кредиты начислены (+${trialCredits}). ` : '';
            try { await ctx.answerCallbackQuery({ text: `${bonus}✅ Диалог открыт. -${amt} кредит(ов). Осталось: ${left}`, show_alert: true }); } catch {}
          }
          else if (res.retryUsed) {
            try { await ctx.answerCallbackQuery({ text: `🎟 Диалог открыт. Использован повторный кредит.`, show_alert: true }); } catch {}
          }

          await renderBxThread(ctx, actorUserId, wsId, res.thread.id, { back: 'offer', offerId, page, h });
          return;
        }


    if (p.a === 'a:bx_inbox') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_inbox', page, { h });
      if (!bmRes) return;

      await renderBxInbox(ctx, bmRes.userId, wsId, page, { bm: bmRes.bm, h });
      return;
    }


    if (p.a === 'a:bx_thread') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const threadId = Number(p.t);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const back = p.b ? String(p.b) : 'inbox';
      const offerId = p.o ? Number(p.o) : null;

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_inbox', page, { h });
      if (!bmRes) return;

      await renderBxThread(ctx, bmRes.userId, wsId, threadId, { back, offerId, page, h });
      return;
    }



    if (p.a === 'a:bx_retry_help') {
      const afterH = Number(CFG.INTRO_RETRY_AFTER_HOURS || 24);
      const expD = Number(CFG.INTRO_RETRY_EXPIRES_DAYS || 7);
      await ctx.answerCallbackQuery({
        show_alert: true,
        text: `Повторный кредит: если бренд написал, а ответа нет ${afterH}h → бот выдаёт 1 повторный кредит (действует ${expD}d). Следующий новый диалог откроется без списания кредитов.`
      });
      return;
    }


    if (p.a === 'a:bx_proofs') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const threadId = Number(p.t);
      const back = p.b ? String(p.b) : 'inbox';
      const offerId = p.o ? Number(p.o) : null;
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_inbox', page, { h });
      if (!bmRes) return;

      await renderBxProofs(ctx, bmRes.userId, wsId, threadId, { back, offerId, page, h });
      return;
    }


    if (p.a === 'a:bx_proof_link') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const threadId = Number(p.t);
      const back = p.b ? String(p.b) : 'inbox';
      const offerId = p.o ? Number(p.o) : null;
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_inbox', page, { h });
      if (!bmRes) return;

      await safeEditOrReply(ctx, '🔗 Пришли ссылку на пост (пример: https://t.me/... )', {
        reply_markup: new InlineKeyboard().text('⬅️ Отмена', `a:bx_proofs|ws:${wsId}|t:${threadId}|p:${page}${offerId ? `|o:${offerId}` : ''}|b:${back}|h:${h}`)
      });
      await setExpectText(ctx.from.id, { type: 'bx_proof_link', wsId, threadId, back, offerId, page, h, asUserId: bmRes.userId });
      return;
    }


    if (p.a === 'a:bx_proof_photo') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const threadId = Number(p.t);
      const back = p.b ? String(p.b) : 'inbox';
      const offerId = p.o ? Number(p.o) : null;
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_inbox', page, { h });
      if (!bmRes) return;

      await safeEditOrReply(ctx, '🖼️ Пришли скриншот (как фото)', {
        reply_markup: new InlineKeyboard().text('⬅️ Отмена', `a:bx_proofs|ws:${wsId}|t:${threadId}|p:${page}${offerId ? `|o:${offerId}` : ''}|b:${back}|h:${h}`)
      });
      await setExpectText(ctx.from.id, { type: 'bx_proof_photo', wsId, threadId, back, offerId, page, h, asUserId: bmRes.userId });
      return;
    }


    if (p.a === 'a:bx_stage') {
      const wsId = Number(p.ws);
      const threadId = Number(p.t);
      const stage = String(p.s || '');
      const back = p.b ? String(p.b) : 'inbox';
      const offerId = p.o ? Number(p.o) : null;
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_inbox', page, { h });
      if (!bmRes) return;

      const stageOk = CRM_STAGES.some((s) => s.id === stage);
      const hasPlan = wsId === 0 ? await db.isBrandPlanActive(bmRes.userId) : true;
      if (!hasPlan) {
        await ctx.answerCallbackQuery({ text: '⛔ Нужен активный Brand Plan для стадий.' });
        return;
      }
      if (!stageOk) {
        await ctx.answerCallbackQuery({ text: 'Invalid stage' });
        return;
      }

      const updated = await db.setBarterThreadBuyerStage(threadId, bmRes.userId, stage);
      if (!updated) {
        await ctx.answerCallbackQuery({ text: 'Не удалось обновить стадию.' });
        return;
      }
      const flash = `Стадия: ${bxThreadStageTitle(stage) || stage}`;
      await ctx.answerCallbackQuery({ text: flash });
      await renderBxThread(ctx, bmRes.userId, wsId, threadId, { back, offerId, page, h, flash });
      return;
    }


    if (p.a === 'a:bx_thread_triage') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const threadId = Number(p.t);
      const triage = String(p.s || 'open').toLowerCase();
      const back = p.b ? String(p.b) : 'inbox';
      const offerId = p.o ? Number(p.o) : null;
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const page = Number(p.p || 0);

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_inbox', page, { h });
      if (!bmRes) return;

      const okVal = ['open', 'in_progress', 'spam'].includes(triage);
      if (!okVal) {
        await ctx.answerCallbackQuery({ text: 'Invalid status' });
        return;
      }

      const updated = await db.setBarterThreadTriageStatus(threadId, bmRes.userId, triage);
      let flash = '';
      if (!updated) {
        // Likely: migration not applied yet (undefined_column)
        flash = 'Не удалось обновить. Проверь миграцию.';
        await ctx.answerCallbackQuery({ text: flash });
      } else {
        flash = `Обработка: ${bxThreadTriageTitle(triage)}`;
        await ctx.answerCallbackQuery({ text: flash });
      }
      await renderBxThread(ctx, bmRes.userId, wsId, threadId, { back, offerId, page, h, flash });
      return;
    }


    if (p.a === 'a:bx_thread_reply') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      const threadId = Number(p.t);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const back = p.b ? String(p.b) : 'inbox';
      const offerId = p.o ? Number(p.o) : null;

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_inbox', page, { h });
      if (!bmRes) return;

      await safeEditOrReply(ctx, '✍️ Напиши сообщение покупателю:', {
        reply_markup: new InlineKeyboard().text('⬅️ Отмена', `a:bx_thread|ws:${wsId}|t:${threadId}|p:${page}${offerId ? `|o:${offerId}` : ''}|b:${back}|h:${h}`)
      });
      await setExpectText(ctx.from.id, { type: 'bx_thread_msg', wsId, threadId, back, offerId, page, h, asUserId: bmRes.userId });
      return;
    }


    if (p.a === 'a:bx_thread_close_q') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const threadId = Number(p.t);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const back = p.b ? String(p.b) : 'inbox';
      const offerId = p.o ? Number(p.o) : null;
      const cbTail = `|p:${page}|b:${back}${offerId ? `|o:${offerId}` : ''}|h:${h}`;

      const kb = new InlineKeyboard()
        .text('✅ Закрыть', `a:bx_thread_close_do|ws:${wsId}|t:${threadId}${cbTail}`)
        .text('❌ Отмена', `a:bx_thread|ws:${wsId}|t:${threadId}${cbTail}`);
      await safeEditOrReply(ctx, 'Закрыть диалог? После закрытия писать нельзя.', { reply_markup: kb });
      return;
    }


    if (p.a === 'a:bx_thread_close_do') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const threadId = Number(p.t);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_inbox', page, { h });
      if (!bmRes) return;

      const ok = await db.closeBarterThread(threadId, bmRes.userId);
      if (!ok) {
        await ctx.answerCallbackQuery({ text: 'Не удалось закрыть тред.' });
        return;
      }
      await ctx.answerCallbackQuery({ text: '✅ Тред закрыт' });
      await renderBxInbox(ctx, bmRes.userId, wsId, page, { bm: bmRes.bm, h });
      return;
    }

    if (p.a === 'a:bx_thread_del_q') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const threadId = Number(p.t);
      const page = Number(p.p || 0);
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const back = p.b ? String(p.b) : 'inbox';
      const offerId = p.o ? Number(p.o) : null;
      const cbTail = `|p:${page}|b:${back}${offerId ? `|o:${offerId}` : ''}|h:${h}`;

      const kb = new InlineKeyboard()
        .text('🗑 Удалить', `a:bx_thread_del_do|ws:${wsId}|t:${threadId}${cbTail}`)
        .text('❌ Отмена', `a:bx_thread|ws:${wsId}|t:${threadId}${cbTail}`);
      await safeEditOrReply(ctx, '🗑 Удалить диалог из раздела «Диалоги»?\n\nСобеседник по-прежнему будет видеть переписку.', { reply_markup: kb });
      return;
    }


    if (p.a === 'a:bx_thread_del_do') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const threadId = Number(p.t);
      const page = Number(p.p || 0);
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_inbox', page, { h });
      if (!bmRes) return;

      await db.softDeleteBarterThread(threadId, bmRes.userId);
      await ctx.answerCallbackQuery({ text: '🗑 Диалог удалён' });
      await renderBxInbox(ctx, bmRes.userId, wsId, page, { bm: bmRes.bm, h });
      return;
    }

    throw new Error('barter_domain.unreachable_action:' + String(p?.a || 'missing'));
  })();
  return true;
}

export async function handleBarterOfferCallback(ctx, p, u, deps = {}) {
  if (!isBarterOfferAction(p?.a)) return false;
  const bound = bindDependencies(deps, OFFER_REQUIRED_DEPENDENCIES);
  const {
    BRAND_GOALS_KEYS,
    BRAND_REQ_KEYS,
    BX_PRESETS,
    CFG,
    InlineKeyboard,
    answerRecovery,
    bxCategoryKb,
    bxCompKb,
    bxKindKb,
    bxPresetKb,
    bxTypeKb,
    clearDraft,
    clearExpectText,
    db,
    escapeHtml,
    extractFirstContact,
    getDraft,
    isWorkspaceDisconnected,
    kbBxPubDone,
    logger,
    navKb,
    opaqueLogRef,
    parseOfferMeta,
    renderBxMediaStep,
    renderBxMy,
    renderBxMyArchive,
    renderBxOfferDraftStep,
    renderBxOfferPreviewStep,
    renderBxOfferTagsPicker,
    renderBxOfferTagsStep,
    renderBxOfferTextInputStep,
    renderBxOfferWizTagsHome,
    renderBxOfferWizTagsPicker,
    renderBxOpen,
    renderBxView,
    renderRecovery,
    renderWsDisconnected,
    safeEditOrReply,
    safeLogError,
    sendBxPreview,
    setDraft,
    setExpectText,
    truncateText,
  } = bound;

  await (async () => {

    if (p.a === 'a:bx_pub_done') {
      const wsId = Number(p.ws || 0);
      const offerId = Number(p.o || 0);
      const page = Math.max(0, Number(p.p || 0));
      const back = p.back || 'my';
      const kb = kbBxPubDone(wsId, offerId, page, back);
      try { await ctx.editMessageReplyMarkup(kb); } catch {}
      return;
    }




    if (p.a === 'a:bx_pin_set') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      const isPro = await db.isWorkspacePro(wsId);
      if (!isPro) return ctx.answerCallbackQuery({ text: 'Доступно в PRO.' });
      await db.setWorkspacePinnedOffer(wsId, offerId);
      await db.auditWorkspace(wsId, u.id, 'ws.pro.pin_offer', { offerId });
      await ctx.answerCallbackQuery({ text: 'Закреплено.' });
      await renderBxView(ctx, u.id, wsId, offerId);
      return;
    }


    if (p.a === 'a:bx_pin_clear') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      const isPro = await db.isWorkspacePro(wsId);
      if (!isPro) return ctx.answerCallbackQuery({ text: 'Доступно в PRO.' });
      await db.setWorkspacePinnedOffer(wsId, null);
      await db.auditWorkspace(wsId, u.id, 'ws.pro.unpin_offer', { offerId });
      await ctx.answerCallbackQuery({ text: 'Пин снят.' });
      await renderBxView(ctx, u.id, wsId, offerId);
      return;
    }

        if (p.a === 'a:bx_bump') {
          const wsId = Number(p.w || p.ws || 0);
          const offerId = Number(p.o || p.id || 0);

          if (!wsId || !offerId) {
            await safeEditOrReply(
              ctx,
              '⚠️ Кнопка устарела. Открой «📦 Мои офферы» и попробуй ещё раз.',
              { reply_markup: navKb('a:bx_my') }
            );
            return;
          }

          // owner gate: bump allowed только владельцу канала (ws)
          const ws = await db.getWorkspace(u.id, wsId);
          if (!ws) {
            await safeEditOrReply(ctx, `⚠️ <b>Поднять оффер может только владелец канала</b>

    Вернись к своим офферам или выбери канал, которым управляешь.`, { parse_mode: 'HTML', reply_markup: navKb(`a:bx_my|ws:${wsId}|p:0`) });
            return;
          }

          // Some legacy records may not match creatorUserId; allow bump if offer принадлежит этому ws.
          let o = await db.getBarterOfferForOwner(u.id, offerId);
          if (!o) {
            try { o = await db.getBarterOfferPublic(offerId); } catch {}
          }
          const oWs = Number(o?.workspace_id || o?.workspaceId || 0);
          if (!o || oWs !== wsId) {
            await renderRecovery(ctx, 'offer', { backCb: `a:bx_my|ws:${wsId}|p:0` });
            return;
          }

          let isPro = false;
          try { isPro = await db.isWorkspacePro(wsId); } catch {}

          const cooldownHours = isPro ? CFG.BARTER_BUMP_COOLDOWN_HOURS_PRO : CFG.BARTER_BUMP_COOLDOWN_HOURS_FREE;
          const cooldownMs = cooldownHours * 3600 * 1000;
          const last = o.bump_at ? new Date(o.bump_at).getTime() : 0;
          const now = Date.now();

          if (last && (now - last) < cooldownMs) {
            const left = cooldownMs - (now - last);
            const h = Math.floor(left / 3600000);
            const mm = Math.floor((left % 3600000) / 60000);
            await safeEditOrReply(
              ctx,
              `⏳ Поднимать можно раз в <b>${cooldownHours}ч</b>.
    Осталось: <b>${h}ч ${mm}м</b>.`,
              { parse_mode: 'HTML', reply_markup: navKb(`a:bx_view|ws:${wsId}|o:${offerId}|back:my|p:0`) }
            );
            return;
          }

          // give immediate visible feedback (anti-silent)
          await safeEditOrReply(ctx, '⬆️ Поднимаю оффер…', { reply_markup: navKb(`a:bx_view|ws:${wsId}|o:${offerId}|back:my|p:0`) });

          try {
            await db.bumpBarterOffer(offerId);
          } catch (e) {
            try { logger.warn({ err: safeLogError(e), workspace_ref: opaqueLogRef(wsId, 'workspace'), offer_ref: opaqueLogRef(offerId, 'offer'), user_ref: opaqueLogRef(u.id, 'user') }, 'barter.bump_failed'); } catch {}
            await safeEditOrReply(ctx, '⚠️ Не удалось поднять оффер. Попробуй ещё раз через «📦 Мои офферы».', { reply_markup: navKb(`a:bx_my|ws:${wsId}|p:0`) });
            return;
          }

          try {
            await db.auditBarterOffer(offerId, wsId, u.id, 'bx.offer_bumped', { cooldownHours, isPro });
          } catch (e) {
            try { logger.warn({ err: safeLogError(e), workspace_ref: opaqueLogRef(wsId, 'workspace'), offer_ref: opaqueLogRef(offerId, 'offer'), user_ref: opaqueLogRef(u.id, 'user') }, 'barter.bump_audit_failed'); } catch {}
          }

          // Show результат так, чтобы было ВИДНО (перекидываем в список, где оффер уедет наверх)
          await renderBxMy(ctx, u.id, wsId, 0);
          return;
        }




    if (p.a === 'a:bx_my') {
      await ctx.answerCallbackQuery();
      await renderBxMy(ctx, u.id, Number(p.ws), Number(p.p || 0));
      return;
    }


    if (p.a === 'a:bx_my_arch') {
      await ctx.answerCallbackQuery();
      await renderBxMyArchive(ctx, u.id, Number(p.ws), Number(p.p || 0));
      return;
    }


        if (p.a === 'a:bx_new') {
          const wsId = Number(p.ws);
          db.trackEvent('bx_offer_new_open', { userId: u.id, wsId, meta: {} });
          const ws = await db.getWorkspace(u.id, wsId);
          if (!ws) return answerRecovery(ctx, 'channel');
          if (isWorkspaceDisconnected(ws)) {
            await ctx.answerCallbackQuery();
            await renderWsDisconnected(ctx, u.id, wsId, { backCb: 'a:ws_list', source: 'bx_new' });
            return;
          }
          if (!ws.network_enabled) {
            await ctx.answerCallbackQuery();
            await renderBxOpen(ctx, u.id, wsId);
            return;
          }
          // PRO gating: active offers limit
          const isPro = await db.isWorkspacePro(wsId);
          const maxOffers = isPro ? CFG.BARTER_MAX_ACTIVE_OFFERS_PRO : CFG.BARTER_MAX_ACTIVE_OFFERS_FREE;
          const cntOffers = await db.countActiveBarterOffers(wsId);
          if (cntOffers >= maxOffers) {
            await safeEditOrReply(ctx, `⚠️ Достигнут лимит активных офферов: <b>${cntOffers}/${maxOffers}</b>.

    Хочешь больше — включи ⭐️ PRO.`, {
              parse_mode: 'HTML',
              reply_markup: new InlineKeyboard().text('⭐️ PRO', `a:ws_pro|ws:${wsId}`).row().text('⬅️ Назад', `a:bx_open|ws:${wsId}`)
            });
            return;
          }

          await ctx.answerCallbackQuery();
          await clearDraft(ctx.from.id);
          await safeEditOrReply(ctx, '➕ <b>Новый оффер</b>\n\nШаг 1/6: выбери тип:\n\n🎬 <b>UGC</b> — контент без аудитории (главное: вкус и качество)\n📣 <b>Интеграция</b> — публикация в TG/IG (нужна аудитория)', {
            parse_mode: 'HTML',
            reply_markup: bxKindKb(wsId)
          });
          await setDraft(ctx.from.id, { wsId });
          return;
        }



    if (p.a === 'a:bx_preset_home') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx,
        '🧩 <b>Шаблоны оффера</b>\n\nВыбери вариант — мы подготовим категорию/формат/оплату и перейдём к тегам (опционально), затем к тексту оффера.',
        { parse_mode: 'HTML', reply_markup: bxPresetKb(wsId) }
      );
      return;
    }



    if (p.a === 'a:bx_preset_apply') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');

      const presetId = String(p.id || '');
      const preset = BX_PRESETS.find((x) => x.id === presetId);
      if (!preset) return ctx.answerCallbackQuery({ text: 'Шаблон не найден.' });

      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);

      // Apply preset into draft and jump to Tags step (optional)
      const draft = (await getDraft(ctx.from.id)) || {};
      draft.wsId = wsId;
      draft.category = preset.category;
      draft.offer_type = preset.offer_type;
      draft.compensation_type = preset.compensation_type;
      draft.preset_id = presetId;
      if (!draft.offer_meta) draft.offer_meta = {};
      await setDraft(ctx.from.id, draft);

      await renderBxOfferTagsStep(ctx, wsId, { showParams: true, fromPreset: preset });
      return;
    }


    if (p.a === 'a:bx_params') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      await safeEditOrReply(ctx, 'Шаг 1/4: выбери категорию:', {
        parse_mode: 'HTML',
        reply_markup: bxCategoryKb(wsId)
      });
      return;
    }



    if (p.a === 'a:bx_kind') {
      const wsId = Number(p.ws);
      await ctx.answerCallbackQuery();
      const draft = (await getDraft(ctx.from.id)) || {};
      draft.wsId = wsId;
      draft.kind = String(p.k || 'ugc');
      await setDraft(ctx.from.id, draft);
      await safeEditOrReply(ctx, 'Шаг 2/6: выбери категорию:', {
        parse_mode: 'HTML',
        reply_markup: bxCategoryKb(wsId)
      });
      return;
    }


    if (p.a === 'a:bx_cat') {
          const wsId = Number(p.ws);
          await ctx.answerCallbackQuery();
          const draft = (await getDraft(ctx.from.id)) || {};
          draft.wsId = wsId;
          draft.category = p.c;
          await setDraft(ctx.from.id, draft);
          await safeEditOrReply(ctx, 'Шаг 3/6: выбери формат сотрудничества:', {
            parse_mode: 'HTML',
            reply_markup: bxTypeKb(wsId)
          });
          return;
        }


    if (p.a === 'a:bx_type') {
      const wsId = Number(p.ws);
      await ctx.answerCallbackQuery();
      const draft = (await getDraft(ctx.from.id)) || {};
      draft.wsId = wsId;
      draft.offer_type = p.t;
      await setDraft(ctx.from.id, draft);
      await safeEditOrReply(ctx, 'Шаг 4/6: выбери тип оплаты:', {
        parse_mode: 'HTML',
        reply_markup: bxCompKb(wsId)
      });
      return;
    }



    if (p.a === 'a:bx_comp') {
      const wsId = Number(p.ws);
      await ctx.answerCallbackQuery();

      const draft = (await getDraft(ctx.from.id)) || {};
      draft.wsId = wsId;
      draft.compensation_type = p.p;
      if (!draft.offer_meta) draft.offer_meta = {};
      await setDraft(ctx.from.id, draft);

      await clearExpectText(ctx.from.id);
      await renderBxOfferDraftStep(ctx, wsId);
      return;
    }

    if (p.a === 'a:bx_w5') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      await renderBxOfferDraftStep(ctx, wsId);
      return;
    }

    if (p.a === 'a:bx_w6') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);

      const draft = (await getDraft(ctx.from.id)) || {};
      const hasText = Boolean(String(draft.offer_title || '').trim() && String(draft.offer_desc || '').trim());
      if (!hasText) {
        try { await ctx.answerCallbackQuery({ text: 'Сначала введи текст оффера.', show_alert: true }); } catch {}
        await renderBxOfferDraftStep(ctx, wsId);
        return;
      }
      await renderBxOfferPreviewStep(ctx, wsId);
      return;
    }

    if (p.a === 'a:bx_wtext') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      await renderBxOfferTextInputStep(ctx, wsId, { backCb: `a:bx_w5|ws:${wsId}` });
      return;
    }

    if (p.a === 'a:bx_wtags') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      await renderBxOfferWizTagsHome(ctx, wsId);
      return;
    }


    if (p.a === 'a:bx_wtagpick') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      const key = String(p.k || '');
      if (key !== 'goals' && key !== 'req') return ctx.answerCallbackQuery({ text: 'Неверный ключ.' });
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      await renderBxOfferWizTagsPicker(ctx, wsId, key);
      return;
    }


    if (p.a === 'a:bx_wtagt') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      const key = String(p.k || '');
      const val = String(p.v || '');
      if (key !== 'goals' && key !== 'req') return ctx.answerCallbackQuery({ text: 'Неверный ключ.' });

      const allow = key === 'goals' ? BRAND_GOALS_KEYS : BRAND_REQ_KEYS;
      if (!allow.has(val)) return ctx.answerCallbackQuery({ text: 'Неверный тег.' });

      await ctx.answerCallbackQuery();

      const draft = (await getDraft(ctx.from.id)) || {};
      draft.wsId = wsId;
      const meta = parseOfferMeta(draft.offer_meta || {});
      const cur = key === 'goals' ? meta.goals_tags : meta.req_tags;
      const set = new Set(cur);
      if (set.has(val)) set.delete(val); else set.add(val);
      if (key === 'goals') meta.goals_tags = Array.from(set);
      else meta.req_tags = Array.from(set);
      draft.offer_meta = meta;
      await setDraft(ctx.from.id, draft);

      await renderBxOfferWizTagsPicker(ctx, wsId, key);
      return;
    }


    if (p.a === 'a:bx_wtagclr') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      const key = String(p.k || '');
      if (key !== 'goals' && key !== 'req') return ctx.answerCallbackQuery({ text: 'Неверный ключ.' });
      await ctx.answerCallbackQuery();

      const draft = (await getDraft(ctx.from.id)) || {};
      draft.wsId = wsId;
      const meta = parseOfferMeta(draft.offer_meta || {});
      if (key === 'goals') meta.goals_tags = [];
      else meta.req_tags = [];
      draft.offer_meta = meta;
      await setDraft(ctx.from.id, draft);

      await renderBxOfferWizTagsPicker(ctx, wsId, key);
      return;
    }


    if (p.a === 'a:bx_wtagdone') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      await renderBxOfferWizTagsHome(ctx, wsId);
      return;
    }


    if (p.a === 'a:bx_comp_pick') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');

      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      await safeEditOrReply(ctx, 'Шаг 4/6: выбери тип оплаты:', {
        parse_mode: 'HTML',
        reply_markup: bxCompKb(wsId)
      });
      return;
    }


    if (p.a === 'a:bx_ottags') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      await renderBxOfferTagsStep(ctx, wsId);
      return;
    }


    if (p.a === 'a:bx_otpick') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');

      const key = String(p.k || '');
      if (key !== 'goals' && key !== 'req') return ctx.answerCallbackQuery({ text: 'Неверный ключ.' });

      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      await renderBxOfferTagsPicker(ctx, wsId, key);
      return;
    }


    if (p.a === 'a:bx_ott') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');

      const key = String(p.k || '');
      const val = String(p.v || '');
      if (key !== 'goals' && key !== 'req') return ctx.answerCallbackQuery({ text: 'Неверный ключ.' });

      const allow = key === 'goals' ? BRAND_GOALS_KEYS : BRAND_REQ_KEYS;
      if (!allow.has(val)) return ctx.answerCallbackQuery({ text: 'Неверный тег.' });

      await ctx.answerCallbackQuery();

      const draft = (await getDraft(ctx.from.id)) || {};
      draft.wsId = wsId;
      const meta = parseOfferMeta(draft.offer_meta || {});
      const cur = key === 'goals' ? meta.goals_tags : meta.req_tags;
      const set = new Set(cur);
      if (set.has(val)) set.delete(val); else set.add(val);

      if (key === 'goals') meta.goals_tags = Array.from(set);
      else meta.req_tags = Array.from(set);

      draft.offer_meta = meta;
      await setDraft(ctx.from.id, draft);

      await renderBxOfferTagsPicker(ctx, wsId, key);
      return;
    }


    if (p.a === 'a:bx_otclr') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');

      const key = String(p.k || '');
      if (key !== 'goals' && key !== 'req') return ctx.answerCallbackQuery({ text: 'Неверный ключ.' });

      await ctx.answerCallbackQuery();

      const draft = (await getDraft(ctx.from.id)) || {};
      draft.wsId = wsId;
      const meta = parseOfferMeta(draft.offer_meta || {});
      if (key === 'goals') meta.goals_tags = [];
      else meta.req_tags = [];
      draft.offer_meta = meta;
      await setDraft(ctx.from.id, draft);

      await renderBxOfferTagsPicker(ctx, wsId, key);
      return;
    }


    if (p.a === 'a:bx_otdone') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');

      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      await renderBxOfferTagsStep(ctx, wsId);
      return;
    }


    if (p.a === 'a:bx_otnext') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');

      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      await renderBxOfferTextInputStep(ctx, wsId, { backCb: `a:bx_ottags|ws:${wsId}` });
      return;
    }



    if (p.a === 'a:bx_publish_hint') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');

      try { await ctx.answerCallbackQuery({ text: 'Сначала введи текст оффера (✍️), затем нажми ✅ Опубликовать.', show_alert: true }); } catch {}

      await clearExpectText(ctx.from.id);
      await renderBxOfferDraftStep(ctx, wsId);
      return;
    }


    if (p.a === 'a:bx_otskip') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');

      await ctx.answerCallbackQuery();

      const draft = (await getDraft(ctx.from.id)) || {};
      draft.wsId = wsId;
      draft.offer_meta = {};
      await setDraft(ctx.from.id, draft);

      await clearExpectText(ctx.from.id);
      await renderBxOfferTextInputStep(ctx, wsId, { backCb: `a:bx_ottags|ws:${wsId}` });
      return;
    }

    if (p.a === 'a:bx_publish') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      if (isWorkspaceDisconnected(ws)) {
        await ctx.answerCallbackQuery();
        await renderWsDisconnected(ctx, u.id, wsId, { backCb: 'a:ws_list', source: 'bx_publish' });
        return;
      }

      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);

      const draft = (await getDraft(ctx.from.id)) || {};
      draft.wsId = wsId;

      const kind = String(draft.kind || 'ugc');
      const category = String(draft.category || '').trim();
      const offerType = String(draft.offer_type || '').trim();
      const comp = String(draft.compensation_type || '').trim();
      const title = String(draft.offer_title || '').trim();
      const description = String(draft.offer_desc || '').trim();
      let contact = String(draft.offer_contact || '').trim();

      if (!category || !offerType || !comp) {
        try { await ctx.answerCallbackQuery({ text: 'Черновик неполный — вернись назад и заверши шаги.', show_alert: true }); } catch {}
        await renderBxOfferDraftStep(ctx, wsId);
        return;
      }

      if (!title || title.length < 3 || !description || description.length < 10) {
        try { await ctx.answerCallbackQuery({ text: 'Нужно заполнить текст оффера (заголовок + детали).', show_alert: true }); } catch {}
        await renderBxOfferDraftStep(ctx, wsId);
        return;
      }

      if (!contact) {
        contact = extractFirstContact(`${title}\n${description}`) || '';
      }
      if (!contact) {
        try { await ctx.answerCallbackQuery({ text: 'Контакт обязателен (добавь @username).', show_alert: true }); } catch {}
        await renderBxOfferDraftStep(ctx, wsId);
        return;
      }

      const prefix = kind === 'integration' ? '📣 ' : '🎬 ';
      const realTitle = title.startsWith(prefix) ? title : `${prefix}${title}`;
      const fullDescription = /\bКонтакт\b/i.test(description) ? description : `${description}\n\nКонтакт: ${contact}`;

      // Structured meta tags (optional)
      const parsedOfferMeta = parseOfferMeta(draft.offer_meta || {});
      const offerMeta = {};
      if (Array.isArray(parsedOfferMeta.goals_tags) && parsedOfferMeta.goals_tags.length) offerMeta.goals_tags = parsedOfferMeta.goals_tags;
      if (Array.isArray(parsedOfferMeta.req_tags) && parsedOfferMeta.req_tags.length) offerMeta.req_tags = parsedOfferMeta.req_tags;

      try {
        const offer = await db.createBarterOffer({
          workspaceId: wsId,
          creatorUserId: u.id,
          category,
          offerType,
          compensationType: comp,
          meta: offerMeta,
          title: realTitle,
          description: fullDescription,
          contact,
        });

        try {
          await db.auditBarterOffer(offer.id, wsId, u.id, 'bx.offer_created', {
            category,
            offerType,
            compensationType: comp,
            kind: draft.kind || null,
          });
        } catch {}
        try { db.trackEvent('bx_offer_published', { userId: u.id, wsId, meta: { offerId: offer.id, category, offerType, compensationType: comp } }); } catch {}

        await clearDraft(ctx.from.id);

        const kb = kbBxPubDone(wsId, offer.id, 0, 'my');

        await safeEditOrReply(ctx,
          `✅ <b>Оффер опубликован</b>\n\n<b>${escapeHtml(realTitle)}</b>\n\n${escapeHtml(truncateText(fullDescription, 550))}`,
          { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true },
          true
        );
        return;
      } catch (err) {
        console.error('[bx_publish] error', { wsId, err: { name: err?.name, message: err?.message } });
        try { await ctx.answerCallbackQuery({ text: 'Ошибка публикации. Попробуй ещё раз.', show_alert: true }); } catch {}
        await renderBxOfferPreviewStep(ctx, wsId);
        return;
      }
    }


    if (p.a === 'a:bx_view') {
      await ctx.answerCallbackQuery();
      await renderBxView(ctx, u.id, Number(p.ws), Number(p.o), p.back || 'feed', Number(p.p || 0));
      return;
    }



    if (p.a === 'a:bx_media_step') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const back = p.back || 'my';
      const page = Math.max(0, Number(p.p || 0));
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      await renderBxMediaStep(ctx, u.id, wsId, offerId, back, { edit: true, page });
      return;
    }


    if (p.a === 'a:bx_media_clear') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const back = p.back || 'my';
      const page = Math.max(0, Number(p.p || 0));
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);

      const o = await db.getBarterOfferForOwner(u.id, offerId);
      if (!o) return answerRecovery(ctx, 'offer');

      await db.updateBarterOffer(offerId, { media_type: null, media_file_id: null });
      await ctx.answerCallbackQuery({ text: 'Убрано' });
      await renderBxMediaStep(ctx, u.id, wsId, offerId, back, { edit: true, page });
      return;
    }


    if (p.a === 'a:bx_media_photo') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const back = p.back || 'my';
      const page = Math.max(0, Number(p.p || 0));
      await ctx.answerCallbackQuery();
      await setExpectText(ctx.from.id, { type: 'bx_media_photo', wsId, offerId, back, page });

      const kb = navKb(`a:bx_media_step|ws:${wsId}|o:${offerId}|back:${back}|p:${page}`);
      await safeEditOrReply(ctx, '🖼 Пришли <b>картинку</b> одним сообщением.', { parse_mode: 'HTML', reply_markup: kb });
      return;
    }


    if (p.a === 'a:bx_media_gif') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const back = p.back || 'my';
      const page = Math.max(0, Number(p.p || 0));
      await ctx.answerCallbackQuery();
      await setExpectText(ctx.from.id, { type: 'bx_media_gif', wsId, offerId, back, page });

      const kb = navKb(`a:bx_media_step|ws:${wsId}|o:${offerId}|back:${back}|p:${page}`);
      await safeEditOrReply(ctx, '🎞 Пришли <b>GIF</b> (анимацию) одним сообщением.\n\n(Можно отправить как анимацию или как файл .gif)', { parse_mode: 'HTML', reply_markup: kb });
      return;
    }


    if (p.a === 'a:bx_media_video') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const back = p.back || 'my';
      const page = Math.max(0, Number(p.p || 0));
      await ctx.answerCallbackQuery();
      await setExpectText(ctx.from.id, { type: 'bx_media_video', wsId, offerId, back, page });

      const kb = navKb(`a:bx_media_step|ws:${wsId}|o:${offerId}|back:${back}|p:${page}`);
      await safeEditOrReply(ctx, '🎥 Пришли <b>видео</b> одним сообщением.\n\n(Поддержка: mp4. Можно отправить как видео или как файл.)', { parse_mode: 'HTML', reply_markup: kb });
      return;
    }


    if (p.a === 'a:bx_media_preview') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const back = p.back || 'my';
      const page = Math.max(0, Number(p.p || 0));
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      await sendBxPreview(ctx, u.id, wsId, offerId, back, page);
      return;
    }


    if (p.a === 'a:bx_pause') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const o = await db.getBarterOfferForOwner(u.id, offerId);
      if (!o) return answerRecovery(ctx, 'offer');
      await db.updateBarterOfferStatus(offerId, 'PAUSED');
      await db.auditBarterOffer(offerId, wsId, u.id, 'bx.offer_paused', {});
      await ctx.answerCallbackQuery();
      await renderBxView(ctx, u.id, wsId, offerId, 'my');
      return;
    }


    if (p.a === 'a:bx_resume') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const o = await db.getBarterOfferForOwner(u.id, offerId);
      if (!o) return answerRecovery(ctx, 'offer');
      await db.updateBarterOfferStatus(offerId, 'ACTIVE');
      await db.auditBarterOffer(offerId, wsId, u.id, 'bx.offer_resumed', {});
      await ctx.answerCallbackQuery();
      await renderBxView(ctx, u.id, wsId, offerId, 'my');
      return;
    }

    if (p.a === 'a:bx_archive') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const page = Math.max(0, Number(p.p || 0));
      const o = await db.getBarterOfferForOwner(u.id, offerId);
      if (!o) return answerRecovery(ctx, 'offer');
      await db.updateBarterOfferStatus(offerId, 'CLOSED');
      await db.auditBarterOffer(offerId, wsId, u.id, 'bx.offer_archived', {});
      await ctx.answerCallbackQuery({ text: 'Архивировано.' });
      await renderBxMy(ctx, u.id, wsId, page);
      return;
    }


    if (p.a === 'a:bx_restore') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const page = Math.max(0, Number(p.p || 0));

      const restored = await db.restoreBarterOfferForOwner(offerId, u.id);
      if (!restored) {
        await ctx.answerCallbackQuery({ text: 'Не найдено / нет доступа.' });
        await renderBxMyArchive(ctx, u.id, wsId, page);
        return;
      }
      await db.auditBarterOffer(offerId, wsId, u.id, 'bx.offer_restored', {});
      await ctx.answerCallbackQuery({ text: 'Восстановлено.' });
      await renderBxMy(ctx, u.id, wsId, 0);
      return;
    }


        if (p.a === 'a:bx_del_q') {
          const wsId = Number(p.ws);
          const offerId = Number(p.o);
          const page = Math.max(0, Number(p.p || 0));
          const o = await db.getBarterOfferForOwner(u.id, offerId);
          if (!o) return answerRecovery(ctx, 'offer');
          const kb = new InlineKeyboard()
            .text('✅ Архивировать', `a:bx_del_do|ws:${wsId}|o:${offerId}|p:${page}`)
            .text('❌ Отмена', `a:bx_view|ws:${wsId}|o:${offerId}|back:my|p:${page}`);
          await ctx.answerCallbackQuery();
          await safeEditOrReply(ctx, `Архивировать оффер <b>#${offerId}</b>?

    Он исчезнет из списка, но останется в базе для истории.`, { parse_mode: 'HTML', reply_markup: kb });
          return;
        }


    if (p.a === 'a:bx_del_do') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const page = Math.max(0, Number(p.p || 0));
      const o = await db.getBarterOfferForOwner(u.id, offerId);
      if (!o) return answerRecovery(ctx, 'offer');
      await db.updateBarterOfferStatus(offerId, 'CLOSED');
      await db.auditBarterOffer(offerId, wsId, u.id, 'bx.offer_archived', {});
      await ctx.answerCallbackQuery({ text: 'Архивировано.' });
      await renderBxMy(ctx, u.id, wsId, page);
      return;
    }

    if (p.a === 'a:bx_partner_folder_pick') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const o = await db.getBarterOfferForOwner(u.id, offerId);
      if (!o) return answerRecovery(ctx, 'offer');

      const folders = await db.listChannelFolders(wsId);
      const kb = new InlineKeyboard();
      for (const f of folders.slice(0, 20)) {
        kb.text(`📁 ${String(f.title).slice(0, 32)} (${Number(f.items_count || 0)})`, `a:bx_partner_folder_set|ws:${wsId}|o:${offerId}|f:${f.id}`).row();
      }
      kb.text('⏭ Без папки', `a:bx_partner_folder_clear|ws:${wsId}|o:${offerId}`).row();
      kb.text('⬅️ Назад', `a:bx_view|ws:${wsId}|o:${offerId}|back:my`);

      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, '📁 Выбери папку совместных каналов (она будет показываться в оффере):', { reply_markup: kb });
      return;
    }


    if (p.a === 'a:bx_partner_folder_set') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const folderId = Number(p.f);
      const o = await db.getBarterOfferForOwner(u.id, offerId);
      if (!o) return answerRecovery(ctx, 'offer');

      const folder = await db.getChannelFolder(folderId);
      if (!folder || Number(folder.workspace_id) !== Number(wsId)) return ctx.answerCallbackQuery({ text: 'Папка не найдена.' });

      await db.updateBarterOffer(offerId, { partner_folder_id: folderId });
      await db.auditBarterOffer(offerId, wsId, u.id, 'bx.partner_folder_set', { folderId });
      await ctx.answerCallbackQuery({ text: 'Готово.' });
      await renderBxView(ctx, u.id, wsId, offerId, 'my');
      return;
    }


    if (p.a === 'a:bx_partner_folder_clear') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const o = await db.getBarterOfferForOwner(u.id, offerId);
      if (!o) return answerRecovery(ctx, 'offer');

      await db.updateBarterOffer(offerId, { partner_folder_id: null });
      await db.auditBarterOffer(offerId, wsId, u.id, 'bx.partner_folder_cleared', {});
      await ctx.answerCallbackQuery({ text: 'Ок.' });
      await renderBxView(ctx, u.id, wsId, offerId, 'my');
      return;
    }

    throw new Error('barter_domain.unreachable_action:' + String(p?.a || 'missing'));
  })();
  return true;
}
