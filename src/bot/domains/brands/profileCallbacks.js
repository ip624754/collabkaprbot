import { isBrandProfileAction } from './policy.js';

function bindDependencies(deps, names) {
  for (const name of names) {
    if (deps?.[name] === null || deps?.[name] === undefined) {
      throw new Error('brand_domain.missing_dependency:' + name);
    }
  }
  return deps;
}

const REQUIRED_DEPENDENCIES = Object.freeze([
  'BRAND_BUDGET_KEYS',
  'BRAND_COLLAB_KEYS',
  'BRAND_GOALS_KEYS',
  'BRAND_REQ_KEYS',
  'BX_CATEGORIES',
  'BX_HOME',
  'InlineKeyboard',
  'brandCbSuffix',
  'brandCollabTypesToCsv',
  'brandFieldPrompt',
  'brandFieldPromptKb',
  'copySafetyRecoveryKb',
  'copySafetyUnavailableHtml',
  'db',
  'isBrandBasicComplete',
  'navKb',
  'parseBrandCollabTypes',
  'parseBrandMeta',
  'renderBrandBudgetBucketPicker',
  'renderBrandCollabTypesPicker',
  'renderBrandGoalsTagsPicker',
  'renderBrandNichePicker',
  'renderBrandPass',
  'renderBrandPlan',
  'renderBrandProfileHome',
  'renderBrandProfileMore',
  'renderBrandReqTagsPicker',
  'renderWsLeadCompose',
  'reportCopySafetyDiagnostic',
  'resolveBmBrandContext',
  'resolveBxHomeFromUi',
  'safeBrandProfiles',
  'safeEditOrReply',
  'setExpectText',
  'updateBrandMeta',
]);

export async function handleBrandProfileCallback(ctx, p, u, deps = {}) {
  if (!isBrandProfileAction(p?.a)) return false;
  const bound = bindDependencies(deps, REQUIRED_DEPENDENCIES);
  const {
    BRAND_BUDGET_KEYS,
    BRAND_COLLAB_KEYS,
    BRAND_GOALS_KEYS,
    BRAND_REQ_KEYS,
    BX_CATEGORIES,
    BX_HOME,
    InlineKeyboard,
    brandCbSuffix,
    brandCollabTypesToCsv,
    brandFieldPrompt,
    brandFieldPromptKb,
    copySafetyRecoveryKb,
    copySafetyUnavailableHtml,
    db,
    isBrandBasicComplete,
    navKb,
    parseBrandCollabTypes,
    parseBrandMeta,
    renderBrandBudgetBucketPicker,
    renderBrandCollabTypesPicker,
    renderBrandGoalsTagsPicker,
    renderBrandNichePicker,
    renderBrandPass,
    renderBrandPlan,
    renderBrandProfileHome,
    renderBrandProfileMore,
    renderBrandReqTagsPicker,
    renderWsLeadCompose,
    reportCopySafetyDiagnostic,
    resolveBmBrandContext,
    resolveBxHomeFromUi,
    safeBrandProfiles,
    safeEditOrReply,
    setExpectText,
    updateBrandMeta,
  } = bound;

  await (async () => {
if (p.a === 'a:brand_profile') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand'); // brand | offer | lead | verify
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;

      const bm = wsId === 0 ? await resolveBmBrandContext(ctx, u) : { enabled: false };
      if (wsId === 0 && bm.enabled && bm.brandUserId !== u.id) {
        await safeEditOrReply(ctx,
          '⛔️ Недостаточно прав. Этот раздел доступен только владельцу бренда.',
          { parse_mode: 'HTML', reply_markup: navKb('a:menu') }
        );
        return;
      }

      // Home view (non-edit). Edit view is `a:brand_profile_edit`.
      await renderBrandProfileHome(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: false });
      return;
    }

if (p.a === 'a:brand_profile_edit') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      const ret = String(p.ret || 'brand');

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;

      const bm = wsId === 0 ? await resolveBmBrandContext(ctx, u) : { enabled: false };
      if (wsId === 0 && bm.enabled && bm.brandUserId !== u.id) {
        await safeEditOrReply(ctx,
          '⛔️ Недостаточно прав. Этот раздел доступен только владельцу бренда.',
          { parse_mode: 'HTML', reply_markup: navKb('a:menu') }
        );
        return;
      }

      await renderBrandProfileHome(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

if (p.a === 'a:brand_niche_pick') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      const from = String(p.from || 'home');

      const bm = wsId === 0 ? await resolveBmBrandContext(ctx, u) : { enabled: false };
      if (wsId === 0 && bm.enabled && bm.brandUserId !== u.id) {
        await safeEditOrReply(ctx,
          '⛔️ Недостаточно прав. Этот раздел доступен только владельцу бренда.',
          { parse_mode: 'HTML', reply_markup: navKb('a:menu') }
        );
        return;
      }

      await renderBrandNichePicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, from });
      return;
    }

if (p.a === 'a:brand_niche_set') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      const from = String(p.from || 'home');
      const k = String(p.k || '').trim();
      const found = BX_CATEGORIES.find((x) => x.key === k);

      if (!found) {
        await renderBrandNichePicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, from });
        return;
      }

      const prof = await safeBrandProfiles(() => db.getBrandProfile(u.id), async () => null);
      const meta = parseBrandMeta(prof?.meta);
      const nextMeta = { ...meta, niche_key: found.key };

      await safeBrandProfiles(
        () => db.upsertBrandProfile(u.id, { niche: found.label, meta: nextMeta }),
        async () => null
      );

      await renderBrandNichePicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, from });
      return;
    }

if (p.a === 'a:brand_niche_clear') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      const from = String(p.from || 'home');

      const prof = await safeBrandProfiles(() => db.getBrandProfile(u.id), async () => null);
      const p0 = prof || {};
      const meta0 = parseBrandMeta(p0.meta);
      const curText = String(p0.niche || '').trim();
      const isCategoryLabel = BX_CATEGORIES.some((x) => String(x.label || '').trim() === curText);
      const nextMeta = { ...meta0 };
      delete nextMeta.niche_key;

      const patch = { meta: nextMeta };
      if (isCategoryLabel) patch.niche = null;

      await safeBrandProfiles(() => db.upsertBrandProfile(u.id, patch), async () => null);
      await renderBrandNichePicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, from });
      return;
    }

if (p.a === 'a:brand_profile_more') {
      p.a = 'a:brand_prof_more';
    }

if (p.a === 'a:brand_continue') {
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      if (String(p.ret || '') !== 'lead' || !wsId) {
        await ctx.answerCallbackQuery();
        await renderBrandProfileHome(ctx, u.id, { wsId, ret: String(p.ret || 'brand'), backOfferId: p.bo ? Number(p.bo) : null, backPage: p.bp ? Number(p.bp) : 0, edit: true });
        return;
      }

      const prof = await safeBrandProfiles(() => db.getBrandProfile(u.id), async () => null);
      if (!isBrandBasicComplete(prof)) {
        await ctx.answerCallbackQuery({ text: 'Заполни 4 поля профиля (Название, Ниши, Контакт, Ссылка).', show_alert: true });
        await renderBrandProfileHome(ctx, u.id, { wsId, ret: 'lead', edit: true });
        return;
      }

      const contact = String(prof.contact || '').trim().slice(0, 200);
      await ctx.answerCallbackQuery();
      await setExpectText(ctx.from.id, { type: 'wsp_lead_step2', wsId, contact, brandName: String(prof.brand_name || '').trim() || null, brandLink: String(prof.brand_link || '').trim() || null });
      await renderWsLeadCompose(ctx, wsId, 2, { contact });
      return;
    }

if (p.a === 'a:brand_prof_more') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      await renderBrandProfileMore(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

if (p.a === 'a:brand_prof_set') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      const field = String(p.f || '');
      const map = {
        bn: 'brand_name',
        bl: 'brand_link',
        ct: 'contact',
        ni: 'niche',
        ge: 'geo',
        ty: 'collab_types',
        bu: 'budget',
        go: 'goals',
        rq: 'requirements'
      };
      const realField = map[field] || null;
      if (!realField) return;

      // Structured multi-select for collaboration types (no free-text input)
      if (realField === 'collab_types') {
        await renderBrandCollabTypesPicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
        return;
      }

      await setExpectText(ctx.from.id, { type: 'brand_prof_field', field: realField, wsId, ret, backOfferId: bo, backPage: bp, from: String(p.from || 'home') });
      const promptTxt =
        realField === 'niche'
          ? `${brandFieldPrompt(realField)}\n\n<i>Подсказка: для удобной категории используй кнопку “🏷 Ниши” в редактировании профиля.</i>`
          : brandFieldPrompt(realField);
      await safeEditOrReply(ctx, promptTxt, {
        parse_mode: 'HTML',
        reply_markup: brandFieldPromptKb({ wsId, ret, backOfferId: bo, backPage: bp, from: String(p.from || "") })
      });
      return;
    }

if (p.a === 'a:brand_ty_t') {
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      const key = String(p.k || '');
      if (!BRAND_COLLAB_KEYS.has(key)) {
        await ctx.answerCallbackQuery();
        return;
      }

      await ctx.answerCallbackQuery();

      const prof = await safeBrandProfiles(
        () => db.getBrandProfile(u.id),
        async () => ({ __missing_relation: true })
      );
      if (prof && prof.__missing_relation) {
        reportCopySafetyDiagnostic('brand_profiles_relation_missing', { relation: 'brand_profiles', migration: '024_brand_profiles' });

        await safeEditOrReply(ctx, copySafetyUnavailableHtml('Профиль бренда временно недоступен'), {
          parse_mode: 'HTML',
          reply_markup: copySafetyRecoveryKb('a:menu')
        });
        return;
      }

      const current = parseBrandCollabTypes(String(prof?.collab_types || '').trim());
      const set = new Set(current);
      if (set.has(key)) set.delete(key); else set.add(key);
      const next = Array.from(set);
      const csv = brandCollabTypesToCsv(next);

      const saved = await safeBrandProfiles(
        () => db.upsertBrandProfile(u.id, { collab_types: csv }),
        async () => ({ __missing_relation: true })
      );
      if (saved && saved.__missing_relation) {
        reportCopySafetyDiagnostic('brand_profiles_relation_missing', { relation: 'brand_profiles', migration: '024_brand_profiles' });

        await safeEditOrReply(ctx, copySafetyUnavailableHtml('Профиль бренда временно недоступен'), {
          parse_mode: 'HTML',
          reply_markup: copySafetyRecoveryKb('a:menu')
        });
        return;
      }

      await renderBrandCollabTypesPicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

if (p.a === 'a:brand_ty_clear') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;

      const saved = await safeBrandProfiles(
        () => db.upsertBrandProfile(u.id, { collab_types: null }),
        async () => ({ __missing_relation: true })
      );
      if (saved && saved.__missing_relation) {
        reportCopySafetyDiagnostic('brand_profiles_relation_missing', { relation: 'brand_profiles', migration: '024_brand_profiles' });

        await safeEditOrReply(ctx, copySafetyUnavailableHtml('Профиль бренда временно недоступен'), {
          parse_mode: 'HTML',
          reply_markup: copySafetyRecoveryKb('a:menu')
        });
        return;
      }

      await renderBrandCollabTypesPicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

if (p.a === 'a:brand_ty_done') {
      await ctx.answerCallbackQuery({ text: '✅ Сохранено' });
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      await renderBrandProfileMore(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

if (p.a === 'a:brand_bb_pick') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      await renderBrandBudgetBucketPicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

if (p.a === 'a:brand_bb_set') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      const key = String(p.k || '');
      if (!BRAND_BUDGET_KEYS.has(key)) {
        await renderBrandBudgetBucketPicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
        return;
      }
      await updateBrandMeta(u.id, { budget_bucket: key });
      await renderBrandBudgetBucketPicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

if (p.a === 'a:brand_bb_clear') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      await updateBrandMeta(u.id, { budget_bucket: null });
      await renderBrandBudgetBucketPicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

if (p.a === 'a:brand_bb_done') {
      await ctx.answerCallbackQuery({ text: '✅ Сохранено' });
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      await renderBrandProfileMore(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

if (p.a === 'a:brand_gt_pick') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      await renderBrandGoalsTagsPicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

if (p.a === 'a:brand_gt_t') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      const key = String(p.k || '');
      if (!BRAND_GOALS_KEYS.has(key)) {
        await renderBrandGoalsTagsPicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
        return;
      }
      const prof = await safeBrandProfiles(() => db.getBrandProfile(u.id), async () => null);
      const meta = parseBrandMeta(prof?.meta);
      const cur = Array.isArray(meta.goals_tags) ? meta.goals_tags.map(String).filter((k) => BRAND_GOALS_KEYS.has(k)) : [];
      const set = cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key];
      await updateBrandMeta(u.id, { goals_tags: set });
      await renderBrandGoalsTagsPicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

if (p.a === 'a:brand_gt_clear') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      await updateBrandMeta(u.id, { goals_tags: [] });
      await renderBrandGoalsTagsPicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

if (p.a === 'a:brand_gt_done') {
      await ctx.answerCallbackQuery({ text: '✅ Сохранено' });
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      await renderBrandProfileMore(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

if (p.a === 'a:brand_rt_pick') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      await renderBrandReqTagsPicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

if (p.a === 'a:brand_rt_t') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      const key = String(p.k || '');
      if (!BRAND_REQ_KEYS.has(key)) {
        await renderBrandReqTagsPicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
        return;
      }
      const prof = await safeBrandProfiles(() => db.getBrandProfile(u.id), async () => null);
      const meta = parseBrandMeta(prof?.meta);
      const cur = Array.isArray(meta.req_tags) ? meta.req_tags.map(String).filter((k) => BRAND_REQ_KEYS.has(k)) : [];
      const set = cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key];
      await updateBrandMeta(u.id, { req_tags: set });
      await renderBrandReqTagsPicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

if (p.a === 'a:brand_rt_clear') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      await updateBrandMeta(u.id, { req_tags: [] });
      await renderBrandReqTagsPicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

if (p.a === 'a:brand_rt_done') {
      await ctx.answerCallbackQuery({ text: '✅ Сохранено' });
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      await renderBrandProfileMore(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

if (p.a === 'a:brand_prof_reset') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      const suf = brandCbSuffix({ wsId, ret, backOfferId: bo, backPage: bp });

      const kb = new InlineKeyboard()
        .text('✅ Да, сбросить', `a:brand_prof_reset_ok${suf}`)
        .row()
        .text('⬅️ Отмена', `a:brand_profile${suf}`);

      const txt = `🧹 <b>Сбросить профиль бренда?</b>

Это удалит базовые и расширенные поля профиля. Действие необратимо.`;
      await safeEditOrReply(ctx, txt, { parse_mode: 'HTML', reply_markup: kb });
      return;
    }

if (p.a === 'a:brand_prof_reset_ok') {
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;

      const res = await safeBrandProfiles(
        () => db.deleteBrandProfile(u.id),
        async () => ({ __missing_relation: true })
      );

      if (res && res.__missing_relation) {
        reportCopySafetyDiagnostic('brand_profiles_relation_missing', { relation: 'brand_profiles', migration: '024_brand_profiles' });
        await ctx.answerCallbackQuery({ text: '⚠️ Профиль бренда временно недоступен. Попробуй позже.', show_alert: true });
        await renderBrandProfileHome(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
        return;
      }

      await ctx.answerCallbackQuery({ text: '✅ Профиль сброшен.' });
      await renderBrandProfileHome(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

if (p.a === 'a:brand_pass') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);

      const bm = wsId === 0 ? await resolveBmBrandContext(ctx, u) : { enabled: false };
      if (wsId === 0 && bm.enabled && bm.brandUserId !== u.id) {
        await safeEditOrReply(ctx,
          '⛔️ Недостаточно прав. Этот раздел доступен только владельцу бренда.',
          { parse_mode: 'HTML', reply_markup: navKb('a:menu') }
        );
        return;
      }

      const ret = String(p.ret || '').trim();
      const rws = Number(p.rws || 0);
      const id = Number(p.id || 0);
      const s = String(p.s || 'new');
      const page = Number(p.p || 0);
      await renderBrandPass(ctx, u.id, wsId, { ret, rws, id, s, p: page });
      return;
    }

if (p.a === 'a:brand_plan') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');

      const bm = wsId === 0 ? await resolveBmBrandContext(ctx, u) : { enabled: false };
      if (wsId === 0 && bm.enabled && bm.brandUserId !== u.id) {
        await safeEditOrReply(ctx,
          '⛔️ Недостаточно прав. Этот раздел доступен только владельцу бренда.',
          { parse_mode: 'HTML', reply_markup: navKb('a:menu') }
        );
        return;
      }

      await renderBrandPlan(ctx, u.id, wsId, ret);
      return;
    }

    throw new Error('brand_domain.unreachable_profile_action:' + String(p?.a || 'missing'));
  })();
  return true;
}
