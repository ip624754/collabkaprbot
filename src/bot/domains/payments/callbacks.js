import { PAYMENT_ACTION } from './actions.js';
import { isPaymentAdminAction, isPaymentPurchaseAction } from './policy.js';

const PAYMENTS_PAUSED_TEXT = '💤 Платежи на паузе. Попробуй позже.';

function requireFunction(deps, name) {
  const fn = deps?.[name];
  if (typeof fn !== 'function') {
    throw new Error(`payment_domain.missing_dependency:${name}`);
  }
  return fn;
}

function requireValue(deps, name) {
  const value = deps?.[name];
  if (value === undefined || value === null) {
    throw new Error(`payment_domain.missing_dependency:${name}`);
  }
  return value;
}

async function ensurePaymentsOpen(ctx, deps) {
  const getPaymentsRuntimeFlags = requireFunction(deps, 'getPaymentsRuntimeFlags');
  const { accept } = await getPaymentsRuntimeFlags();
  if (accept) return true;
  await ctx.answerCallbackQuery({ text: PAYMENTS_PAUSED_TEXT, show_alert: true });
  return false;
}

async function createSignedSession({
  ctx,
  deps,
  redisKey,
  payloadPrefix,
  context,
}) {
  const randomToken = requireFunction(deps, 'randomToken');
  const signStarsInvoiceToken = requireFunction(deps, 'signStarsInvoiceToken');
  const redis = requireValue(deps, 'redis');
  const key = requireFunction(deps, 'key');
  const cfg = requireValue(deps, 'cfg');

  const tokenRaw = randomToken(10);
  const token = signStarsInvoiceToken(payloadPrefix, tokenRaw);
  await redis.set(
    key([redisKey, token]),
    context,
    { ex: cfg.PAYMENT_SESSION_TTL_SEC }
  );
  return Object.freeze({ token, payload: `${payloadPrefix}${token}` });
}

async function handleFounderBuy(ctx, p, u, deps) {
  if (!(await ensurePaymentsOpen(ctx, deps))) return true;
  await ctx.answerCallbackQuery();

  const getFounderSaleState = requireFunction(deps, 'getFounderSaleState');
  const renderFounderSale = requireFunction(deps, 'renderFounderSale');
  const ensureWorkspaceForOwner = requireFunction(deps, 'ensureWorkspaceForOwner');
  const sendStarsInvoice = requireFunction(deps, 'sendStarsInvoice');

  const ret = String(p.ret || 'menu');
  const state = await getFounderSaleState();
  if (!state.active) {
    try { await ctx.answerCallbackQuery({ text: 'Акция завершена', show_alert: true }); } catch {}
    await renderFounderSale(ctx, u, { ret, edit: true });
    return true;
  }

  const productId = String(p.id || '').trim();
  const product = (state.products || []).find((item) => item.id === productId) || null;
  if (!product) {
    try { await ctx.answerCallbackQuery({ text: 'Пакет не найден', show_alert: true }); } catch {}
    await renderFounderSale(ctx, u, { ret, edit: true });
    return true;
  }

  const price = Number(product.stars || 0);
  if (!Number.isFinite(price) || price <= 0) {
    try { await ctx.answerCallbackQuery({ text: 'Пакет временно недоступен', show_alert: true }); } catch {}
    await renderFounderSale(ctx, u, { ret, edit: true });
    return true;
  }

  let wsId = 0;
  if (product.scope === 'creator') {
    const workspace = await ensureWorkspaceForOwner(ctx, u.id, {
      minimal: true,
      backCb: `a:founder|ret:${ret}`,
    });
    if (!workspace) return true;
    wsId = Number(workspace.id || 0);
  }

  const payloadPrefix = `${product.id}_${u.id}_`;
  const { payload } = await createSignedSession({
    ctx,
    deps,
    redisKey: 'pay_founder',
    payloadPrefix,
    context: {
      tgId: ctx.from.id,
      userId: u.id,
      productId: product.id,
      durationDays: Number(product.durationDays || 0),
      credits: Number(product.credits || 0),
      wsId,
    },
  });

  const durationDays = Number(product.durationDays || 0);
  const credits = Number(product.credits || 0);
  const normalStars = Number(product.normalStars || 0);
  const description = [];
  if (product.scope === 'brand') {
    description.push(`Brand Plan «Про» на ${durationDays} дней.`);
    if (credits > 0) description.push(`💳 При активации: +${credits} кредитов бренда.`);
  } else {
    description.push(`PRO выбранного канала на ${durationDays} дней.`);
  }
  if (normalStars > 0) description.push(`Обычно: ${normalStars}⭐️.`);

  await sendStarsInvoice(ctx, {
    title: `Founder Sale · ${product.title} · ${product.subtitle}`,
    description: description.join(' ') || 'Founder Sale',
    payload,
    amount: price,
    backCb: `a:founder|ret:${ret}`,
  });
  return true;
}

async function handleWorkspaceProBuy(ctx, p, u, deps) {
  if (!(await ensurePaymentsOpen(ctx, deps))) return true;
  await ctx.answerCallbackQuery();

  const db = requireValue(deps, 'db');
  const answerRecovery = requireFunction(deps, 'answerRecovery');
  const sendStarsInvoice = requireFunction(deps, 'sendStarsInvoice');
  const cfg = requireValue(deps, 'cfg');
  const labels = requireValue(deps, 'monetizationLabels');

  const wsId = Number(p.ws);
  const workspace = await db.getWorkspace(u.id, wsId);
  if (!workspace) {
    await answerRecovery(ctx, 'channel');
    return true;
  }

  const payloadPrefix = `pro_${wsId}_${u.id}_`;
  const { payload } = await createSignedSession({
    ctx,
    deps,
    redisKey: 'pay_pro',
    payloadPrefix,
    context: { wsId, ownerUserId: u.id, tgId: ctx.from.id },
  });

  await sendStarsInvoice(ctx, {
    title: `${labels.CREATOR_PRO} · ${cfg.PRO_DURATION_DAYS} дней`,
    description: `Для выбранного канала: ${cfg.PRO_DURATION_DAYS} дней, до ${cfg.BARTER_MAX_ACTIVE_OFFERS_PRO} активных офферов, повторное поднятие раз в ${cfg.BARTER_BUMP_COOLDOWN_HOURS_PRO} ч, пин и расширенная аналитика.`,
    payload,
    amount: cfg.PRO_STARS_PRICE,
    backCb: `a:ws_pro|ws:${wsId}`,
  });
  return true;
}

async function handleBrandCreditsBuy(ctx, p, u, deps) {
  if (!(await ensurePaymentsOpen(ctx, deps))) return true;
  await ctx.answerCallbackQuery();

  const resolveBxHomeFromUi = requireFunction(deps, 'resolveBxHomeFromUi');
  const bxHome = requireValue(deps, 'bxHome');
  const getBrandPack = requireFunction(deps, 'getBrandPack');
  const sendStarsInvoice = requireFunction(deps, 'sendStarsInvoice');
  const labels = requireValue(deps, 'monetizationLabels');

  const wsId = Number(p.w || p.ws || 0);
  const home = await resolveBxHomeFromUi(
    ctx,
    wsId,
    p.h,
    wsId ? bxHome.BX_OPEN : bxHome.MENU
  );
  const offerId = (p.o !== undefined && p.o !== null && p.o !== '') ? Number(p.o) : null;
  const packId = String(p.pack || 'S');
  const page = Number(p.p || 0);
  const pack = getBrandPack(packId);
  if (!pack) {
    await ctx.answerCallbackQuery({ text: 'Пакет не найден.' });
    return true;
  }

  const payloadPrefix = `brand_${u.id}_${pack.id}_`;
  const { payload } = await createSignedSession({
    ctx,
    deps,
    redisKey: 'pay_brand',
    payloadPrefix,
    context: {
      tgId: ctx.from.id,
      userId: u.id,
      packId: pack.id,
      credits: pack.credits,
      wsId,
      offerId,
      page,
    },
  });

  const backCb = offerId
    ? `a:bx_pub|ws:${wsId}|o:${offerId}|p:${page}|h:${home}`
    : `a:brand_pass|ws:${wsId}`;
  await sendStarsInvoice(ctx, {
    title: `${labels.BRAND_CREDITS} · ${pack.credits} шт.`,
    description: `Начисление ${pack.credits} кредитов бренда. Кредиты расходуются на новые диалоги, принятие заявок и открытие контактов. Это не Brand Plan.`,
    payload,
    amount: pack.stars,
    backCb,
  });
  return true;
}

async function handleBrandPlanBuy(ctx, p, u, deps) {
  if (!(await ensurePaymentsOpen(ctx, deps))) return true;
  await ctx.answerCallbackQuery();

  const resolveBxHomeFromUi = requireFunction(deps, 'resolveBxHomeFromUi');
  const bxHome = requireValue(deps, 'bxHome');
  const brandPlans = requireValue(deps, 'brandPlans');
  const sendStarsInvoice = requireFunction(deps, 'sendStarsInvoice');
  const cfg = requireValue(deps, 'cfg');
  const labels = requireValue(deps, 'monetizationLabels');

  const wsId = Number(p.w || p.ws || 0);
  await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? bxHome.BX_OPEN : bxHome.MENU);
  const ret = String(p.ret || 'brand');
  const plan = String(p.plan || 'start').toLowerCase();
  const planDef = brandPlans.find((item) => item.id === plan);
  if (!planDef) {
    await ctx.answerCallbackQuery({ text: 'План не найден.' });
    return true;
  }

  const stars = planDef.stars;
  const payloadPrefix = `bplan_${u.id}_${plan}_`;
  const { payload } = await createSignedSession({
    ctx,
    deps,
    redisKey: 'pay_bplan',
    payloadPrefix,
    context: {
      tgId: ctx.from.id,
      userId: u.id,
      wsId,
      plan,
      stars,
      credits: planDef.credits || 0,
      ret,
    },
  });

  await sendStarsInvoice(ctx, {
    title: `${labels.BRAND_PLAN} · ${planDef.title} · ${cfg.BRAND_PLAN_DURATION_DAYS} дней`,
    description: `Подписка для бренда на ${cfg.BRAND_PLAN_DURATION_DAYS} дней: CRM-этапы, до 3 менеджеров, 1 Умный подбор и 1 Продвижение за календарный месяц. При активации начисляется ${planDef.credits} кредитов.`,
    payload,
    amount: stars,
    backCb: `a:brand_plan|ws:${wsId}|ret:${ret}`,
  });
  return true;
}

async function handleMatchingBuy(ctx, p, u, deps) {
  if (!(await ensurePaymentsOpen(ctx, deps))) return true;
  await ctx.answerCallbackQuery();

  const resolveBxHomeFromUi = requireFunction(deps, 'resolveBxHomeFromUi');
  const bxHome = requireValue(deps, 'bxHome');
  const matchTiers = requireValue(deps, 'matchTiers');
  const sendStarsInvoice = requireFunction(deps, 'sendStarsInvoice');
  const labels = requireValue(deps, 'monetizationLabels');
  const cbJoin = requireFunction(deps, 'cbJoin');

  const wsId = Number(p.w || p.ws || 0);
  await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? bxHome.BX_OPEN : bxHome.MENU);
  const tierId = String(p.tier || 'S').toUpperCase();
  const tier = matchTiers.find((item) => item.id === tierId);
  if (!tier) {
    await ctx.answerCallbackQuery({ text: 'Тариф не найден.' });
    return true;
  }

  const payloadPrefix = `match_${u.id}_${tier.id}_`;
  const { payload } = await createSignedSession({
    ctx,
    deps,
    redisKey: 'pay_match',
    payloadPrefix,
    context: {
      tgId: ctx.from.id,
      userId: u.id,
      wsId,
      tierId: tier.id,
      stars: tier.stars,
      count: tier.count,
      ret: String(p.ret || ''),
      bpr: String(p.bpr || ''),
    },
  });

  await sendStarsInvoice(ctx, {
    title: `${labels.MATCHING} · ${tier.title}`,
    description: `Один подбор до ${tier.count} каналов по твоему брифу. Это отдельная услуга: кредиты бренда не списываются. После оплаты пришли бриф одним сообщением.`,
    payload,
    amount: tier.stars,
    backCb: cbJoin('a:match_home', {
      ws: wsId,
      ret: String(p.ret || ''),
      bpr: String(p.bpr || ''),
    }),
  });
  return true;
}

async function handleFeaturedBuy(ctx, p, u, deps) {
  if (!(await ensurePaymentsOpen(ctx, deps))) return true;
  await ctx.answerCallbackQuery();

  const resolveBxHomeFromUi = requireFunction(deps, 'resolveBxHomeFromUi');
  const bxHome = requireValue(deps, 'bxHome');
  const featuredDurations = requireValue(deps, 'featuredDurations');
  const sendStarsInvoice = requireFunction(deps, 'sendStarsInvoice');
  const labels = requireValue(deps, 'monetizationLabels');
  const ruPlural = requireFunction(deps, 'ruPlural');
  const cbJoin = requireFunction(deps, 'cbJoin');

  const wsId = Number(p.w || p.ws || 0);
  await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? bxHome.BX_OPEN : bxHome.MENU);
  const durationId = String(p.dur || '1d');
  const duration = featuredDurations.find((item) => item.id === durationId);
  if (!duration) {
    await ctx.answerCallbackQuery({ text: 'Тариф не найден.' });
    return true;
  }

  const payloadPrefix = `feat_${u.id}_${duration.days}_`;
  const { payload } = await createSignedSession({
    ctx,
    deps,
    redisKey: 'pay_feat',
    payloadPrefix,
    context: {
      tgId: ctx.from.id,
      userId: u.id,
      wsId,
      days: duration.days,
      durId: duration.id,
      stars: duration.stars,
      ret: String(p.ret || ''),
      bpr: String(p.bpr || ''),
    },
  });

  await sendStarsInvoice(ctx, {
    title: `${labels.FEATURED} · ${duration.title}`,
    description: `Промо-блок сверху в ленте на ${duration.days} ${ruPlural(duration.days, 'день', 'дня', 'дней')}. Это отдельная услуга: кредиты бренда не списываются. После оплаты пришли контент.`,
    payload,
    amount: duration.stars,
    backCb: cbJoin('a:feat_home', {
      ws: wsId,
      ret: String(p.ret || ''),
      bpr: String(p.bpr || ''),
    }),
  });
  return true;
}

export async function handlePaymentPurchaseCallback(ctx, p, u, deps = {}) {
  const action = String(p?.a || '').trim();
  if (!isPaymentPurchaseAction(action)) return false;

  switch (action) {
    case PAYMENT_ACTION.FOUNDER_BUY:
      return handleFounderBuy(ctx, p, u, deps);
    case PAYMENT_ACTION.WORKSPACE_PRO_BUY:
      return handleWorkspaceProBuy(ctx, p, u, deps);
    case PAYMENT_ACTION.BRAND_CREDITS_BUY:
      return handleBrandCreditsBuy(ctx, p, u, deps);
    case PAYMENT_ACTION.BRAND_PLAN_BUY:
      return handleBrandPlanBuy(ctx, p, u, deps);
    case PAYMENT_ACTION.MATCHING_BUY:
      return handleMatchingBuy(ctx, p, u, deps);
    case PAYMENT_ACTION.FEATURED_BUY:
      return handleFeaturedBuy(ctx, p, u, deps);
    default:
      throw new Error(`payment_domain.unreachable_purchase_action:${action}`);
  }
}

async function requireAdmin(ctx, deps) {
  const isAdmin = requireFunction(deps, 'isAdmin');
  if (isAdmin(ctx)) return true;
  await ctx.answerCallbackQuery({ text: 'Нет доступа.' });
  return false;
}

async function handleAdminControlToggle(ctx, controlId, deps) {
  const getOperatorControlSnapshot = requireFunction(deps, 'getOperatorControlSnapshot');
  const setOperatorControlToggle = requireFunction(deps, 'setOperatorControlToggle');
  const renderAdminSystem = requireFunction(deps, 'renderAdminSystem');

  await ctx.answerCallbackQuery();
  const control = await getOperatorControlSnapshot({ limit: 1 });
  const current = !!control?.byId?.[controlId]?.value;
  await setOperatorControlToggle(controlId, !current, {
    actorTgId: Number(ctx.from.id || 0) || 0,
    actorUsername: ctx.from?.username || '',
    note: 'telegram_admin',
  });
  await renderAdminSystem(ctx);
  return true;
}

async function handleAdminFallbackEnable(ctx, p, deps) {
  const setPaymentsFallbackRuntime = requireFunction(deps, 'setPaymentsFallbackRuntime');
  const appendOperatorControlAudit = requireFunction(deps, 'appendOperatorControlAudit');
  const renderAdminPaymentsFallback = requireFunction(deps, 'renderAdminPaymentsFallback');
  const fmtWait = requireFunction(deps, 'fmtWait');

  await ctx.answerCallbackQuery({ text: '⏳ Ставлю…' });
  const ttl = Number(p.ttl || 0) || 0;
  const reason = String(p.r || '').slice(0, 40) || 'incident';
  const byUser = ctx.from?.username ? `@${ctx.from.username}` : null;
  const result = await setPaymentsFallbackRuntime({
    enabled: true,
    ttlSec: ttl,
    byTgId: Number(ctx.from.id || 0) || null,
    byUser,
    reason,
  });
  if (!result.ok) {
    await renderAdminPaymentsFallback(ctx, '⚠️ Redis недоступен — не удалось включить.');
    return true;
  }

  await appendOperatorControlAudit({
    controlId: 'payments_fallback',
    label: 'Payments fallback',
    actorTgId: Number(ctx.from.id || 0) || 0,
    actorUsername: ctx.from?.username || '',
    action: 'toggle',
    previousValue: false,
    nextValue: true,
    note: `telegram_admin:${reason}`,
    extra: { ttlSec: Number(result.ttlSec || ttl) || ttl },
  });
  await renderAdminPaymentsFallback(
    ctx,
    `✅ Включено на ~${fmtWait(Number(result.ttlSec || ttl) || ttl)}.`
  );
  return true;
}

async function handleAdminFallbackDisable(ctx, deps) {
  const setPaymentsFallbackRuntime = requireFunction(deps, 'setPaymentsFallbackRuntime');
  const appendOperatorControlAudit = requireFunction(deps, 'appendOperatorControlAudit');
  const renderAdminPaymentsFallback = requireFunction(deps, 'renderAdminPaymentsFallback');

  await ctx.answerCallbackQuery({ text: '⏳ Выключаю…' });
  const result = await setPaymentsFallbackRuntime({ enabled: false });
  if (!result.ok && result.error) {
    await renderAdminPaymentsFallback(ctx, '⚠️ Redis недоступен — не удалось выключить.');
    return true;
  }

  await appendOperatorControlAudit({
    controlId: 'payments_fallback',
    label: 'Payments fallback',
    actorTgId: Number(ctx.from.id || 0) || 0,
    actorUsername: ctx.from?.username || '',
    action: 'toggle',
    previousValue: true,
    nextValue: false,
    note: 'telegram_admin:disable',
  });
  await renderAdminPaymentsFallback(ctx, '🧹 Выключено.');
  return true;
}

export async function handlePaymentAdminCallback(ctx, p, u, deps = {}) {
  const action = String(p?.a || '').trim();
  if (!isPaymentAdminAction(action)) return false;
  if (!(await requireAdmin(ctx, deps))) return true;

  switch (action) {
    case PAYMENT_ACTION.ADMIN_ACCEPT_TOGGLE:
      return handleAdminControlToggle(ctx, 'pay_accept', deps);
    case PAYMENT_ACTION.ADMIN_AUTO_APPLY_TOGGLE:
      return handleAdminControlToggle(ctx, 'pay_auto_apply', deps);
    case PAYMENT_ACTION.ADMIN_MATCHFEAT_AUTO_TOGGLE:
      return handleAdminControlToggle(ctx, 'matchfeat_auto_apply', deps);
    case PAYMENT_ACTION.ADMIN_FALLBACK_HOME:
      await ctx.answerCallbackQuery();
      await requireFunction(deps, 'renderAdminPaymentsFallback')(ctx);
      return true;
    case PAYMENT_ACTION.ADMIN_FALLBACK_ENABLE:
      return handleAdminFallbackEnable(ctx, p, deps);
    case PAYMENT_ACTION.ADMIN_FALLBACK_DISABLE:
      return handleAdminFallbackDisable(ctx, deps);
    case PAYMENT_ACTION.ADMIN_LEDGER:
      await ctx.answerCallbackQuery();
      try { await requireFunction(deps, 'clearExpectText')(ctx.from.id); } catch {}
      await requireFunction(deps, 'renderAdminPayments')(
        ctx,
        String(p.st || 'ORPHANED'),
        Number(p.p || 0)
      );
      return true;
    case PAYMENT_ACTION.ADMIN_LEDGER_VIEW:
      await ctx.answerCallbackQuery();
      try { await requireFunction(deps, 'clearExpectText')(ctx.from.id); } catch {}
      await requireFunction(deps, 'renderAdminPaymentView')(
        ctx,
        Number(p.id),
        String(p.st || 'ORPHANED'),
        Number(p.p || 0)
      );
      return true;
    case PAYMENT_ACTION.ADMIN_LEDGER_APPLY:
      await ctx.answerCallbackQuery();
      try { await requireFunction(deps, 'clearExpectText')(ctx.from.id); } catch {}
      await requireFunction(deps, 'adminApplyPayment')(
        ctx,
        u,
        Number(p.id),
        String(p.st || 'ORPHANED'),
        Number(p.p || 0)
      );
      return true;
    case PAYMENT_ACTION.ADMIN_LEDGER_AUTOHEAL:
      await ctx.answerCallbackQuery();
      try { await requireFunction(deps, 'clearExpectText')(ctx.from.id); } catch {}
      await requireFunction(deps, 'adminAutoHealPayments')(
        ctx,
        u,
        String(p.st || 'ORPHANED'),
        Number(p.p || 0)
      );
      return true;
    default:
      throw new Error(`payment_domain.unreachable_admin_action:${action}`);
  }
}
