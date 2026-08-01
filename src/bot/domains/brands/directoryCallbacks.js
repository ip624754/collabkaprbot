import { isBrandDirectoryAction } from './policy.js';

function bindDependencies(deps, names) {
  for (const name of names) {
    if (deps?.[name] === null || deps?.[name] === undefined) {
      throw new Error('brand_domain.missing_dependency:' + name);
    }
  }
  return deps;
}

const REQUIRED_DEPENDENCIES = Object.freeze([
  'BRAND_GOALS_KEYS',
  'BRAND_REQ_KEYS',
  'errInfo',
  'getBrandDirFilter',
  'navKb',
  'num',
  'renderBrandDirFilterPick',
  'renderBrandDirFilters',
  'renderBrandDirMultiPick',
  'renderBrandDirectoryCard',
  'renderBrandsDirectory',
  'safeEditOrReply',
  'setBrandDirFilter',
  'withTimeout',
]);

export async function handleBrandDirectoryCallback(ctx, p, u, deps = {}) {
  if (!isBrandDirectoryAction(p?.a)) return false;
  const bound = bindDependencies(deps, REQUIRED_DEPENDENCIES);
  const {
    BRAND_GOALS_KEYS,
    BRAND_REQ_KEYS,
    errInfo,
    getBrandDirFilter,
    navKb,
    num,
    renderBrandDirFilterPick,
    renderBrandDirFilters,
    renderBrandDirMultiPick,
    renderBrandDirectoryCard,
    renderBrandsDirectory,
    safeEditOrReply,
    setBrandDirFilter,
    withTimeout,
  } = bound;

  await (async () => {
if (p.a === 'a:brands_home') {
  try { await ctx.answerCallbackQuery({ text: 'Открываю каталог…' }); } catch { try { await ctx.answerCallbackQuery(); } catch {} }
  const page = Math.max(0, Number(p.p || 0));
  let settled = false;
  let slowLoaderId = null;
  try {
    slowLoaderId = setTimeout(async () => {
      if (settled) return;
      try {
        await safeEditOrReply(ctx, '⏳ Открываю каталог брендов…', { reply_markup: navKb('a:menu') });
      } catch {}
    }, 700);

    await withTimeout(renderBrandsDirectory(ctx, ctx.from.id, { page, edit: true, legacyUserId: u.id }), 12000, 'brands.home');
    settled = true;
    if (slowLoaderId) clearTimeout(slowLoaderId);
  } catch (e) {
    settled = true;
    if (slowLoaderId) clearTimeout(slowLoaderId);
    const cid = ctx.state?.cid || null;
    const label = (e && (e.label || e.stepId)) ? String(e.label || e.stepId) : String((e && e.message) ? e.message : 'unknown');
    try { console.warn('[brands_home] timeout/error', { cid, page, label, err: errInfo(e) }); } catch {}
    await safeEditOrReply(ctx, `⚠️ Каталог брендов отвечает слишком долго.

step: ${label}

cid: ${cid || '—'}`, { reply_markup: navKb(`a:brands_home|p:${page}`) });
  }
  return;
}

if (p.a === 'a:brands_filters') {
      try { await ctx.answerCallbackQuery(); } catch {}
      await renderBrandDirFilters(ctx, ctx.from.id, { page: num(p.p || 0, 0), legacyUserId: u.id });
      return;
    }

if (p.a === 'a:bd_fpick') {
      try { await ctx.answerCallbackQuery(); } catch {}
      await renderBrandDirFilterPick(ctx, ctx.from.id, {
        legacyUserId: u.id,
        key: String(p.k || ''),
        page: num(p.p || 0, 0),
      });
      return;
    }

if (p.a === 'a:bd_fset') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const base = await getBrandDirFilter(ctx.from.id, u.id);
      const key = String(p.k || '');
      const val = String(p.v || 'all');
      const page = num(p.p || 0, 0);

      const next = { ...base };
      if (key === 'cat') next.category = val === 'all' ? null : val;
      if (key === 'type') next.offerType = val === 'all' ? null : val;
      if (key === 'comp') {
        const v = val === 'all' ? null : val;
        // Canonical is 'paid' for money in Brand Directory filters
        next.compensationType = v === 'rub' ? 'paid' : v;
      }
      if (key === 'bud') next.budgetBucket = val === 'all' ? null : val;

      await setBrandDirFilter(ctx.from.id, next, u.id);

      const stay = String(p.s || '') === '1';
      if (stay) {
        await renderBrandDirFilterPick(ctx, ctx.from.id, {
          legacyUserId: u.id,
          key,
          page,
        });
      } else {
        await renderBrandDirFilters(ctx, ctx.from.id, { page, legacyUserId: u.id });
      }
      return;
    }

if (p.a === 'a:bd_mpick') {
      try { await ctx.answerCallbackQuery(); } catch {}
      await renderBrandDirMultiPick(ctx, ctx.from.id, {
        legacyUserId: u.id,
        key: String(p.k || ''),
        page: num(p.p || 0, 0),
      });
      return;
    }

if (p.a === 'a:bd_mt') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const base = await getBrandDirFilter(ctx.from.id, u.id);
      const key = String(p.k || '');
      const tag = String(p.v || '');
      const page = num(p.p || 0, 0);

      if (key === 'goals' && BRAND_GOALS_KEYS.has(tag)) {
        const cur = Array.isArray(base.goalsTags) ? base.goalsTags : [];
        base.goalsTags = cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag];
      }
      if (key === 'req' && BRAND_REQ_KEYS.has(tag)) {
        const cur = Array.isArray(base.reqTags) ? base.reqTags : [];
        base.reqTags = cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag];
      }

      await setBrandDirFilter(ctx.from.id, base, u.id);
      await renderBrandDirMultiPick(ctx, ctx.from.id, { legacyUserId: u.id, key, page });
      return;
    }

if (p.a === 'a:bd_mclear') {
      await ctx.answerCallbackQuery();
      const base = await getBrandDirFilter(ctx.from.id, u.id);
      const key = String(p.k || '');
      const page = num(p.p || 0, 0);

      if (key === 'goals') base.goalsTags = [];
      if (key === 'req') base.reqTags = [];

      await setBrandDirFilter(ctx.from.id, base, u.id);
      await renderBrandDirMultiPick(ctx, ctx.from.id, { legacyUserId: u.id, key, page });
      return;
    }

if (p.a === 'a:bd_mdone') {
      try { await ctx.answerCallbackQuery(); } catch {}
      await renderBrandDirFilters(ctx, ctx.from.id, { page: num(p.p || 0, 0), legacyUserId: u.id });
      return;
    }

if (p.a === 'a:bd_freset') {
      try { await ctx.answerCallbackQuery(); } catch {}
      await setBrandDirFilter(ctx.from.id, {
        category: null,
        offerType: null,
        compensationType: null,
        budgetBucket: null,
        goalsTags: [],
        reqTags: [],
      }, u.id);
      await renderBrandDirFilters(ctx, ctx.from.id, { page: num(p.p || 0, 0), legacyUserId: u.id });
      return;
    }

if (p.a === 'a:brand_dir_open') {
      try { await ctx.answerCallbackQuery(); } catch {}
  const brandUserId = Number(p.u || 0);
  const backPage = Math.max(0, Number(p.p || 0));
  const brandAppId = Math.max(0, Number(p.ba || 0));
  await renderBrandDirectoryCard(ctx, ctx.from.id, { brandUserId, backPage, brandAppId, edit: true, legacyUserId: u.id });
  return;
}

    throw new Error('brand_domain.unreachable_directory_action:' + String(p?.a || 'missing'));
  })();
  return true;
}
