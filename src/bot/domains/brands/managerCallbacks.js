import { isBrandManagerModeAction } from './policy.js';

function bindDependencies(deps, names) {
  for (const name of names) {
    if (deps?.[name] === null || deps?.[name] === undefined) {
      throw new Error('brand_domain.missing_dependency:' + name);
    }
  }
  return deps;
}

const REQUIRED_DEPENDENCIES = Object.freeze([
  'BX_HOME',
  'UI_MODES',
  'bmNoAccessHtml',
  'copySafetyRecoveryKb',
  'copySafetyUnavailableHtml',
  'db',
  'disableBrandManagerState',
  'getRoleFlags',
  'isMissingRelationError',
  'navKb',
  'normBxRet',
  'renderBmPickBrand',
  'renderBrandAppsList',
  'renderBrandDealsList',
  'renderBxFeed',
  'renderBxFilters',
  'renderBxInbox',
  'renderBxOpen',
  'renderMainMenu',
  'renderProfileMatchingHome',
  'reportCopySafetyDiagnostic',
  'resolveBmBrandContext',
  'resolveBxHomeFromUi',
  'safeEditOrReply',
  'setBmActiveBrand',
  'setBrandManagerMode',
  'setUiMode',
]);

export async function handleBrandManagerModeCallback(ctx, p, u, deps = {}) {
  if (!isBrandManagerModeAction(p?.a)) return false;
  const bound = bindDependencies(deps, REQUIRED_DEPENDENCIES);
  const {
    BX_HOME,
    UI_MODES,
    bmNoAccessHtml,
    copySafetyRecoveryKb,
    copySafetyUnavailableHtml,
    db,
    disableBrandManagerState,
    getRoleFlags,
    isMissingRelationError,
    navKb,
    normBxRet,
    renderBmPickBrand,
    renderBrandAppsList,
    renderBrandDealsList,
    renderBxFeed,
    renderBxFilters,
    renderBxInbox,
    renderBxOpen,
    renderMainMenu,
    renderProfileMatchingHome,
    reportCopySafetyDiagnostic,
    resolveBmBrandContext,
    resolveBxHomeFromUi,
    safeEditOrReply,
    setBmActiveBrand,
    setBrandManagerMode,
    setUiMode,
  } = bound;

  await (async () => {
if (p.a === 'a:bm_home') {
      await ctx.answerCallbackQuery();

      // Enter manager cabinet (turn ON manager-mode + set Brand UI)
      await setBrandManagerMode(ctx.from.id, true);
      await setUiMode(ctx.from.id, UI_MODES.BRAND);

      const bm = await resolveBmBrandContext(ctx, u, { requirePickWhenMissingActive: true });

      if (bm.dbMissing) {
        reportCopySafetyDiagnostic('brand_managers_relation_missing', { relation: 'brand_managers', migration: '026_brand_managers' });

        const text = copySafetyUnavailableHtml('Менеджеры бренда временно недоступны');
        await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: copySafetyRecoveryKb('a:menu') });
        return;
      }

      if (bm.revoked) {
        await disableBrandManagerState(ctx.from.id);
        const text = bmNoAccessHtml();
        await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: navKb('a:menu') });
        return;
      }

      if (bm.enabled && bm.needsPick) {
        // Multiple brands and no active brand yet — go to picker
        await renderBmPickBrand(ctx, u, { ret: 'bx_inbox', wsId: 0, page: 0, edit: true });
        return;
      }

      // One brand (or already chosen) — open offer conversations.
      await renderBxInbox(ctx, bm.brandUserId, 0, 0, { bm });
      return;
    }

if (p.a === 'a:bm_help') {
      await ctx.answerCallbackQuery();
      const text = `🧑‍💼 <b>Менеджер бренда</b>

Это роль для команды бренда.

✅ Можно:
• 💬 Диалоги по офферам
• 📨 Заявки и 🤝 Сделки
• 🔎 Поиск креаторов

⛔️ Нельзя:
• менять профиль бренда
• управлять оплатами / подпиской
• управлять командой бренда

Если у тебя несколько брендов — используй «🔁 Сменить бренд» в меню.`;

      await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: navKb('a:menu') });
      return;
    }

if (p.a === 'a:bm_mode_set') {
      await ctx.answerCallbackQuery();
      const v = Number(p.v || 0);
      await setBrandManagerMode(ctx.from.id, v === 1);
      const ret = String(p.ret || 'menu');
      const flags = await getRoleFlags(u, ctx.from.id);
      if (ret === 'menu') {
        await renderMainMenu(ctx, flags, { edit: true, user: u });
      } else {
        await safeEditOrReply(ctx, 'Готово.', { parse_mode: 'HTML', reply_markup: navKb('a:menu') });
      }
      return;
    }

if (p.a === 'a:bm_pick_brand') {
      await ctx.answerCallbackQuery();

      const ret = String(p.ret || 'menu');
      const wsId = Number(p.w || p.ws || 0);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);

      const r = normBxRet(p.r, wsId ? BX_HOME.BX_OPEN : h);

      await renderBmPickBrand(ctx, u, { ret, wsId, page, edit: true, h, r });
      return;
    }

if (p.a === 'a:bms' || p.a === 'a:bm_set_brand') {
      await ctx.answerCallbackQuery();
      const brandUserId = Number(p.u || p.bu || 0);
      if (!brandUserId) return;

      const bmRetDecode = (retRaw) => {
        const v = String(retRaw || 'menu');
        if (v === 'bd') return 'brand_deals';
        if (v === 'ba') return 'brand_apps';
        return v;
      };

      const ret = bmRetDecode(p.rt || p.ret || 'menu');
      const wsId = Number(p.w || p.ws || 0);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const r = normBxRet(p.r, wsId ? BX_HOME.BX_OPEN : h);

      // Validate that manager is still assigned to this brand
      let brands = [];
      try {
        brands = await db.listBrandsForManager(u.id);
      } catch (e) {
        if (isMissingRelationError(e, 'brand_managers')) {
          reportCopySafetyDiagnostic('brand_managers_relation_missing', { relation: 'brand_managers', migration: '026_brand_managers' });

          const text = copySafetyUnavailableHtml('Менеджеры бренда временно недоступны');
          await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: copySafetyRecoveryKb('a:menu') });
          return;
        }
        brands = [];
      }

      if (!brands.length) {
        await disableBrandManagerState(ctx.from.id);
        const text = bmNoAccessHtml();
        await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: navKb('a:menu') });
        return;
      }

      const ok = brands.some((b) => Number(b.user_id) === brandUserId);
      if (!ok) {
        await ctx.answerCallbackQuery({ text: 'Нет доступа к этому бренду.' });
        await renderBmPickBrand(ctx, u, { ret, wsId, page, edit: true, h, r });
        return;
      }

      await setBrandManagerMode(ctx.from.id, true);
      await setUiMode(ctx.from.id, UI_MODES.BRAND);
      await setBmActiveBrand(ctx.from.id, brandUserId);

      // Route after pick
      if (ret === 'bx_inbox') {
        const bm = await resolveBmBrandContext(ctx, u);
        await renderBxInbox(ctx, brandUserId, wsId, page, { bm, h });
        return;
      }
      if (ret === 'bx_feed') {
        await renderBxFeed(ctx, brandUserId, wsId, page, { h });
        return;
      }
      if (ret === 'bx_filters') {
        await renderBxFilters(ctx, brandUserId, wsId, page, { h, r });
        return;
      }
      if (ret === 'bx_open') {
        await renderBxOpen(ctx, brandUserId, wsId);
        return;
      }
      if (ret === 'pm_home') {
        await renderProfileMatchingHome(ctx, brandUserId, wsId);
        return;
      }
      if (ret === 'brand_apps') {
        await renderBrandAppsList(ctx, u.id, brandUserId, 'new', 0);
        return;
      }
	      if (ret === 'brand_deals') {
	        await renderBrandDealsList(ctx, u.id, brandUserId, 'negotiation', 0);
	        return;
	      }

      const flags = await getRoleFlags(u, ctx.from.id);
      await renderMainMenu(ctx, flags, { edit: true, user: u });
      return;
    }

    throw new Error('brand_domain.unreachable_manager_mode_action:' + String(p?.a || 'missing'));
  })();
  return true;
}
