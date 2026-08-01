import { NAVIGATION_ACTION } from './actions.js';
import { isNavigationCallbackAction } from './policy.js';

function requireFunction(deps, name) {
  const value = deps?.[name];
  if (typeof value !== 'function') {
    throw new Error(`navigation_shared.missing_dependency:${name}`);
  }
  return value;
}

function requireValue(deps, name) {
  const value = deps?.[name];
  if (value === null || value === undefined) {
    throw new Error(`navigation_shared.missing_dependency:${name}`);
  }
  return value;
}

export async function handleNavigationCallback(ctx, p, u, deps = {}) {
  const action = String(p?.a || '').trim();
  if (!isNavigationCallbackAction(action)) return false;

  const getRoleFlags = requireFunction(deps, 'getRoleFlags');
  const getRoleFlagsCached = requireFunction(deps, 'getRoleFlagsCached');
  const renderRoleHub = requireFunction(deps, 'renderRoleHub');

  if (action === NAVIGATION_ACTION.UI_MODE_SET) {
    const normalizeUiMode = requireFunction(deps, 'normalizeUiMode');
    const disableBrandManagerState = requireFunction(deps, 'disableBrandManagerState');
    const setUiMode = requireFunction(deps, 'setUiMode');
    const trackAcqRole = requireFunction(deps, 'trackAcqRole');
    const getCuratorMode = requireFunction(deps, 'getCuratorMode');
    const safeEditOrReply = requireFunction(deps, 'safeEditOrReply');
    const curatorModeMenuKb = requireFunction(deps, 'curatorModeMenuKb');
    const renderMainMenu = requireFunction(deps, 'renderMainMenu');
    const redis = requireValue(deps, 'redis');
    const key = requireFunction(deps, 'key');

    await ctx.answerCallbackQuery();
    const mode = normalizeUiMode(p.m);
    let hadUiMode = true;
    try {
      const rawMode = await redis.get(key(['ui_mode', ctx.from.id]));
      hadUiMode = !!rawMode;
    } catch {
      hadUiMode = true; // fail-open
    }

    await disableBrandManagerState(ctx.from.id);
    await setUiMode(ctx.from.id, mode);
    if (!hadUiMode) { try { await trackAcqRole(ctx.from.id, mode); } catch {} }

    const flags = await getRoleFlags(u, ctx.from.id);
    const curMode = !!flags.isCurator && (await getCuratorMode(ctx.from.id));
    if (curMode) {
      await safeEditOrReply(ctx,
        `🧹 <b>Режим куратора</b> включен.\n\nДля простоты я скрываю лишнее меню.\n\nТы сейчас в режиме: <b>Curator</b>`,
        { parse_mode: 'HTML', reply_markup: curatorModeMenuKb(flags) }
      );
      return true;
    }

    await renderMainMenu(ctx, flags, { edit: true, user: u, modeOverride: mode });
    return true;
  }

  if (action === NAVIGATION_ACTION.GUIDE) {
    const resolveUiMode = requireFunction(deps, 'resolveUiMode');
    const getBrandManagerMode = requireFunction(deps, 'getBrandManagerMode');
    const normalizeUiMode = requireFunction(deps, 'normalizeUiMode');
    const safeEditOrReply = requireFunction(deps, 'safeEditOrReply');
    const maybeSendBanner = requireFunction(deps, 'maybeSendBanner');
    const InlineKeyboard = requireValue(deps, 'InlineKeyboard');
    const uiModes = requireValue(deps, 'uiModes');
    const cfg = requireValue(deps, 'cfg');

    const flags = await getRoleFlags(u, ctx.from.id);
    const mode = await resolveUiMode(ctx.from.id);
    const bmMode = await getBrandManagerMode(ctx.from.id);
    const isBrandish = normalizeUiMode(mode) === uiModes.BRAND || bmMode;

    let text = `🧭 <b>Быстрый старт</b>\n\n<b>Карта</b>\n`;
    if (isBrandish) {
      text += `• 🎬 Офферы → лента и поиск креаторов\n• 💬 Диалоги → переписка по офферам\n• 📨 Заявки → запросы к бренду до принятия\n• 🤝 Сделки → принятые заявки и этапы работы\n\n`;
    } else {
      text += `• 🎬 Офферы → 📣 Мои каналы → выбери канал → 🎬 UGC / Офферы\n• 💬 Диалоги → 📣 Мои каналы → выбери канал → 💬 Диалоги\n• 📨 Заявки от брендов → 📣 Мои каналы → выбери канал → 📨 Заявки от брендов\n• 📨 Мои заявки → 🏷 Каталог брендов\n\n`;
    }
    if (isBrandish) {
      text += `🏷 <b>Режим бренда</b>\nЗаявка становится сделкой только после принятия.\n\n`;
    } else {
      text += `🤳 <b>Режим креатора</b>\nПодай заявку бренду или ответь на заявку от бренда.\n\n`;
    }
    text += `Навигация: ⬅️ Назад / 📋 Меню / 🏠 Домой`;

    const kb = new InlineKeyboard();
    if (isBrandish) {
      kb.text('💬 Диалоги', 'a:go_dialogs')
        .text('📨 Заявки', 'a:brand_apps|ws:0|s:new|p:0').row()
        .text('🤝 Сделки', 'a:brand_deals|ws:0|st:negotiation|p:0')
        .text('🎛 Фильтры', 'a:bx_filters|ws:0|p:0|h:mm|r:mm').row();
    } else {
      kb.text('📣 Мои каналы', 'a:ws_list').text('🏷 Каталог брендов', 'a:brands_home').row();
    }
    if (isBrandish) {
      kb.text('🎬 Офферы (лента)', 'a:bx_feed|ws:0|p:0|h:mm')
        .text('🔎 Поиск', 'a:pm_home|ws:0').row();
    } else {
      kb.text('🎬 Офферы', 'a:bx_home').text('🚀 Подключить канал', 'a:setup').row();
    }
    if (!isBrandish) {
      kb.text('💬 Диалоги', 'a:go_dialogs').text('📨 Заявки от брендов', 'a:go_requests').row();
      kb.text('🏷 Режим бренда', 'a:ui_mode_set|m:brand|ret:menu').row();
    }
    kb.row().text('💬 Поддержка', 'a:support').text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');

    await safeEditOrReply(ctx, text, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb });
    await maybeSendBanner(ctx, 'guide', cfg.GUIDE_BANNER_FILE_ID);
    return true;
  }

  if (action === NAVIGATION_ACTION.MENU_PUSH) {
    const clearExpectText = requireFunction(deps, 'clearExpectText');
    const makeUiCtxForMessage = requireFunction(deps, 'makeUiCtxForMessage');
    const safeEditOrReply = requireFunction(deps, 'safeEditOrReply');
    const InlineKeyboard = requireValue(deps, 'InlineKeyboard');

    try { await clearExpectText(ctx.from.id); } catch {}
    try { await ctx.answerCallbackQuery(); } catch {}

    const srcChatId = ctx?.callbackQuery?.message?.chat?.id;
    const srcMsgId = ctx?.callbackQuery?.message?.message_id;
    const src = String(p?.src || '');
    if (src !== 'admmsg') {
      try {
        if (srcChatId && srcMsgId) {
          await ctx.api.editMessageReplyMarkup(srcChatId, srcMsgId, { reply_markup: undefined });
        }
      } catch {}
    }

    let uiMsg = null;
    try { uiMsg = await ctx.reply('⌛ Открываю меню…'); } catch {}
    if (!uiMsg) {
      const flags = await getRoleFlagsCached(u, ctx.from.id);
      await renderRoleHub(ctx, u, flags);
      return true;
    }

    const ctxPush = makeUiCtxForMessage(ctx, uiMsg);
    try {
      const flags = await getRoleFlagsCached(u, ctx.from.id);
      await renderRoleHub(ctxPush, u, flags);
    } catch (error) {
      console.error('menu_push_failed', {
        cid: ctx?.state?.cid,
        tgId: ctx?.from?.id,
        err: String(error?.description || error?.message || error),
      });
      try {
        const kb = new InlineKeyboard().text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');
        await safeEditOrReply(ctxPush, '⚠️ Не удалось открыть меню. Нажми /start и попробуй ещё раз.', { reply_markup: kb }, false);
      } catch {}
    }
    return true;
  }

  if (action === NAVIGATION_ACTION.MENU) {
    const clearExpectText = requireFunction(deps, 'clearExpectText');
    const clearSupportFollowupContext = requireFunction(deps, 'clearSupportFollowupContext');
    await ctx.answerCallbackQuery();
    try { await clearExpectText(ctx.from.id); } catch {}
    await clearSupportFollowupContext(ctx.from.id);
    const flags = await getRoleFlagsCached(u, ctx.from.id);
    await renderRoleHub(ctx, u, flags);
    return true;
  }

  if (action === NAVIGATION_ACTION.ROLE_PICK) {
    const renderRoleSelection = requireFunction(deps, 'renderRoleSelection');
    try { await ctx.answerCallbackQuery(); } catch {}
    await renderRoleSelection(ctx, u, { edit: true });
    return true;
  }

  if (action === NAVIGATION_ACTION.HOME) {
    const clearExpectText = requireFunction(deps, 'clearExpectText');
    const clearSupportFollowupContext = requireFunction(deps, 'clearSupportFollowupContext');
    const renderHomeHub = requireFunction(deps, 'renderHomeHub');
    await ctx.answerCallbackQuery();
    try { await clearExpectText(ctx.from.id); } catch {}
    await clearSupportFollowupContext(ctx.from.id);
    const flags = await getRoleFlagsCached(u, ctx.from.id);
    await renderHomeHub(ctx, u, flags, { edit: true });
    return true;
  }

  if (action === NAVIGATION_ACTION.HOME_HINT_ACK) {
    const markHomeHubHintSeen = requireFunction(deps, 'markHomeHubHintSeen');
    const renderHomeHub = requireFunction(deps, 'renderHomeHub');
    try { await ctx.answerCallbackQuery(); } catch {}
    try { await markHomeHubHintSeen(ctx.from.id); } catch {}
    const flags = await getRoleFlagsCached(u, ctx.from.id);
    await renderHomeHub(ctx, u, flags, { edit: true, noHint: true });
    return true;
  }

  if (action === NAVIGATION_ACTION.HOME_MODE) {
    const redis = requireValue(deps, 'redis');
    const key = requireFunction(deps, 'key');
    const db = requireValue(deps, 'db');
    const UI_MODES = requireValue(deps, 'uiModes');
    const setUiMode = requireFunction(deps, 'setUiMode');
    const trackAcqRole = requireFunction(deps, 'trackAcqRole');
    const disableBrandManagerState = requireFunction(deps, 'disableBrandManagerState');
    const setCuratorMode = requireFunction(deps, 'setCuratorMode');
    const setBrandManagerMode = requireFunction(deps, 'setBrandManagerMode');
    const getBmActiveBrand = requireFunction(deps, 'getBmActiveBrand');
    const setBmActiveBrand = requireFunction(deps, 'setBmActiveBrand');
    const safeEditOrReply = requireFunction(deps, 'safeEditOrReply');
    const navKb = requireFunction(deps, 'navKb');
    const renderHomeHub = requireFunction(deps, 'renderHomeHub');

    try { await ctx.answerCallbackQuery(); } catch {}
    const m = String(p.m || '');
    let hadUiMode = true;
    try {
      const rawMode = await redis.get(key(['ui_mode', ctx.from.id]));
      hadUiMode = !!rawMode;
    } catch {
      hadUiMode = true; // fail-open
    }

    let managerBrands = [];
    try { managerBrands = await db.listBrandsForManager(u.id); } catch {}
    const canManager = Array.isArray(managerBrands) && managerBrands.length > 0;

    if (m === 'creator') {
      await setUiMode(ctx.from.id, UI_MODES.CREATOR);
      if (!hadUiMode) { try { await trackAcqRole(ctx.from.id, 'creator'); } catch {} }
      await disableBrandManagerState(ctx.from.id);
      try { await setCuratorMode(ctx.from.id, false); } catch {}
      const flags2 = await getRoleFlags(u, ctx.from.id);
      await renderRoleHub(ctx, u, flags2);
      return true;
    }

    if (m === 'brand') {
      await setUiMode(ctx.from.id, UI_MODES.BRAND);
      await disableBrandManagerState(ctx.from.id);
      if (!hadUiMode) { try { await trackAcqRole(ctx.from.id, 'brand'); } catch {} }
      try { await setCuratorMode(ctx.from.id, false); } catch {}
      const flags2 = await getRoleFlags(u, ctx.from.id);
      await renderRoleHub(ctx, u, flags2);
      return true;
    }

    if (m === 'brand_manager') {
      if (!canManager) {
        await safeEditOrReply(ctx, '⛔ Тебя ещё не добавили в «Менеджеры бренда».', { reply_markup: navKb('a:home') });
        return true;
      }
      await setUiMode(ctx.from.id, UI_MODES.BRAND);
      await setBrandManagerMode(ctx.from.id, true);
      try { await setCuratorMode(ctx.from.id, false); } catch {}
      try {
        const active = await getBmActiveBrand(ctx.from.id);
        if (!active && managerBrands.length === 1) {
          await setBmActiveBrand(ctx.from.id, Number(managerBrands[0].brand_user_id || managerBrands[0].brandUserId || 0));
        }
      } catch {}
      const flags2 = await getRoleFlags(u, ctx.from.id);
      await renderRoleHub(ctx, u, flags2);
      return true;
    }

    if (m === 'curator') {
      const flags2 = await getRoleFlags(u, ctx.from.id);
      if (!flags2.isCurator) {
        await safeEditOrReply(ctx, '⛔ Доступ к кабинету куратора не найден.', { reply_markup: navKb('a:home') });
        return true;
      }
      await setUiMode(ctx.from.id, UI_MODES.CREATOR);
      await disableBrandManagerState(ctx.from.id);
      try { await setCuratorMode(ctx.from.id, true); } catch {}
      await renderRoleHub(ctx, u, flags2);
      return true;
    }

    const flags2 = await getRoleFlags(u, ctx.from.id);
    await renderHomeHub(ctx, u, flags2, { edit: true });
    return true;
  }

  if (action === NAVIGATION_ACTION.MAIN_MENU) {
    try { await ctx.answerCallbackQuery(); } catch {}
    const flags = await getRoleFlagsCached(u, ctx.from.id);
    await renderRoleHub(ctx, u, flags);
    return true;
  }

  throw new Error(`navigation_shared.unreachable_action:${action}`);
}
