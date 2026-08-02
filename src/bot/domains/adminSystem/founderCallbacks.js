import { isAdminFounderControlAction } from './policy.js';

function bindDependencies(deps, names) {
  for (const name of names) {
    if (deps?.[name] === null || deps?.[name] === undefined) {
      throw new Error('admin_system_domain.missing_dependency:' + name);
    }
  }
  return deps;
}

const REQUIRED_DEPENDENCIES = Object.freeze([
  'InlineKeyboard',
  'SYS_KEYS',
  'clearExpectText',
  'delSysKey',
  'getFounderSaleState',
  'getSysObj',
  'isSuperAdminTg',
  'kbAdminFooter',
  'renderAdminFounder',
  'renderAdminFounderLinks',
  'renderAdminFounderTexts',
  'safeEditOrReply',
  'setExpectText',
  'setSysObj',
]);

export async function handleAdminFounderControlCallback(ctx, p, u, deps = {}) {
  if (!isAdminFounderControlAction(p?.a)) return false;
  const bound = bindDependencies(deps, REQUIRED_DEPENDENCIES);
  const {
    InlineKeyboard,
    SYS_KEYS,
    clearExpectText,
    delSysKey,
    getFounderSaleState,
    getSysObj,
    isSuperAdminTg,
    kbAdminFooter,
    renderAdminFounder,
    renderAdminFounderLinks,
    renderAdminFounderTexts,
    safeEditOrReply,
    setExpectText,
    setSysObj,
  } = bound;

  await (async () => {
    if (p.a === 'a:admin_founder') {
      const isAdmin = isSuperAdminTg(ctx.from.id);
      if (!isAdmin) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery();
      try { await clearExpectText(ctx.from.id); } catch {}
      await renderAdminFounder(ctx);
      return;
    }

    if (p.a === 'a:admin_founder_toggle') {
      const isAdmin = isSuperAdminTg(ctx.from.id);
      if (!isAdmin) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery();
      const st = await getFounderSaleState();
      const cur = !!st.effective?.enabled;
      const ov = (await getSysObj(SYS_KEYS.founder_sale)) || {};
      ov.enabled = !cur;
      await setSysObj(SYS_KEYS.founder_sale, ov);
      await renderAdminFounder(ctx);
      return;
    }

    if (p.a === 'a:admin_founder_reset') {
      const isAdmin = isSuperAdminTg(ctx.from.id);
      if (!isAdmin) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery();
      await delSysKey(SYS_KEYS.founder_sale);
      await renderAdminFounder(ctx);
      return;
    }

    if (p.a === 'a:admin_founder_set_deadline') {
      const isAdmin = isSuperAdminTg(ctx.from.id);
      if (!isAdmin) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery();
      const kb = new InlineKeyboard().text('⬅️ Назад', 'a:admin_founder');
      kbAdminFooter(kb, '⬅️ Система', 'a:admin_sys');
      await safeEditOrReply(ctx,
        `🗓 <b>Founder Sale — дедлайн</b>

Введи дату/время в формате ISO (UTC).
Пример: <code>2026-03-01T23:59:59Z</code>

Чтобы сбросить к ENV — отправь <code>-</code>.`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
      await setExpectText(ctx.from.id, { type: 'admin_founder_deadline', backCb: 'a:admin_founder' }, 15 * 60);
      return;
    }

    if (p.a === 'a:admin_founder_set_prices') {
      const isAdmin = isSuperAdminTg(ctx.from.id);
      if (!isAdmin) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery();
      const kb = new InlineKeyboard().text('⬅️ Назад', 'a:admin_founder');
      kbAdminFooter(kb, '⬅️ Система', 'a:admin_sys');
      await safeEditOrReply(ctx,
        `💰 <b>Founder Sale — цены (Stars)</b>

Введи 3 числа через пробел/запятую:
<code>brand3 brand12 creator12</code>
Пример: <code>1999 4999 2499</code>

Чтобы сбросить к ENV — отправь <code>-</code>.`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
      await setExpectText(ctx.from.id, { type: 'admin_founder_prices', backCb: 'a:admin_founder' }, 15 * 60);
      return;
    }

    if (p.a === 'a:admin_founder_set_credits') {
      const isAdmin = isSuperAdminTg(ctx.from.id);
      if (!isAdmin) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery();
      const kb = new InlineKeyboard().text('⬅️ Назад', 'a:admin_founder');
      kbAdminFooter(kb, '⬅️ Система', 'a:admin_sys');
      await safeEditOrReply(ctx,
        `💳 <b>Founder Sale — кредиты</b>

Введи 2 числа через пробел/запятую:
<code>brand3Credits brand12Credits</code>
Пример: <code>100 200</code>

Чтобы сбросить к ENV — отправь <code>-</code>.`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
      await setExpectText(ctx.from.id, { type: 'admin_founder_credits', backCb: 'a:admin_founder' }, 15 * 60);
      return;
    }

    if (p.a === 'a:admin_founder_links') {
      const isAdmin = isSuperAdminTg(ctx.from.id);
      if (!isAdmin) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery();
      await renderAdminFounderLinks(ctx);
      return;
    }

    if (p.a === 'a:admin_founder_texts') {
      const isAdmin = isSuperAdminTg(ctx.from.id);
      if (!isAdmin) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery();
      await renderAdminFounderTexts(ctx);
      return;
    }
  })();
  return true;
}
