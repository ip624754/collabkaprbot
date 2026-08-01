import { isAdminGiftAction } from './policy.js';

function bindDependencies(deps, names) {
  for (const name of names) {
    if (deps?.[name] === null || deps?.[name] === undefined) {
      throw new Error('admin_operations_domain.missing_dependency:' + name);
    }
  }
  return deps;
}

const REQUIRED_DEPENDENCIES = Object.freeze([
  'BRAND_PLANS',
  'CFG',
  'InlineKeyboard',
  'bot',
  'clearDraft',
  'clearExpectText',
  'db',
  'escapeHtml',
  'isSuperAdminTg',
  'k',
  'redis',
  'ruPlural',
  'safeEditOrReply',
  'setExpectText',
]);

export async function handleAdminGiftsCallback(ctx, p, u, deps = {}) {
  if (!isAdminGiftAction(p?.a)) return false;
  const bound = bindDependencies(deps, REQUIRED_DEPENDENCIES);
  const {
    BRAND_PLANS,
    CFG,
    InlineKeyboard,
    bot,
    clearDraft,
    clearExpectText,
    db,
    escapeHtml,
    isSuperAdminTg,
    k,
    redis,
    ruPlural,
    safeEditOrReply,
    setExpectText,
  } = bound;

  await (async () => {
if (p.a === 'a:adm_gift') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return;
  try { await clearExpectText(ctx.from.id); } catch {}
  try { await clearDraft(ctx.from.id); } catch {}
  const kb = new InlineKeyboard()
    .text(`⭐️ Brand Plan Старт (${CFG.BRAND_PLAN_DURATION_DAYS}д)`, 'a:adm_gift_input|t:bp_start')
    .row()
    .text(`🚀 Brand Plan Про (${CFG.BRAND_PLAN_DURATION_DAYS}д)`, 'a:adm_gift_input|t:bp_pro')
    .row()
    .text(`✨ PRO Креатор (${CFG.PRO_DURATION_DAYS}д)`, 'a:adm_gift_input|t:pro')
    .row()
    .text('⛔ Отменить подписку', 'a:adm_gift_revoke')
    .row()
    .text('⬅️ Система', 'a:admin_sys')
    .row()
    .text('📋 Меню', 'a:menu')
    .text('🏠 Домой', 'a:home');
  await safeEditOrReply(ctx, `🎁 <b>Подарить подписку</b>\n\nВыбери тип подписки.\nПосле этого введи @username (или несколько через пробел/запятую).`, { parse_mode: 'HTML', reply_markup: kb });
  return;
}
if (p.a === 'a:adm_gift_input') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return;
  const giftType = String(p.t || '');
  const labels = { bp_start: 'Brand Plan Старт', bp_pro: 'Brand Plan Про', pro: 'PRO Креатор' };
  const label = labels[giftType] || giftType;
  const kb = new InlineKeyboard()
    .text('⬅️ Назад', 'a:adm_gift')
    .text('⬅️ Система', 'a:admin_sys')
    .row()
    .text('📋 Меню', 'a:menu')
    .text('🏠 Домой', 'a:home');
  await safeEditOrReply(ctx, `🎁 <b>${escapeHtml(label)}</b>\n\nВведи @username получателей (через пробел, запятую или каждый с новой строки).\n\nПример:\n<code>@user1 @user2 @user3</code>`, { parse_mode: 'HTML', reply_markup: kb });
  await setExpectText(ctx.from.id, { type: 'adm_gift_users', giftType });
  return;
}
if (p.a === 'a:adm_gift_do') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return;
  const giftType = String(p.t || '');
  const usersRaw = String(p.u || '');
  const usernames = usersRaw.split(',').filter(Boolean);
  if (!usernames.length) return ctx.answerCallbackQuery({ text: 'Нет юзернеймов.' });

  const buildGiftAppliedKb = (type) => {
    const kb = new InlineKeyboard();
    if (type === 'bp_start' || type === 'bp_pro') {
      kb
        .text('🏷 Режим бренда', 'a:home_mode|m:brand').row()
        .text('⭐️ Открыть Brand Plan', 'a:brand_plan|ws:0').row();
    }
    kb
      .text('📨 Приглашения', 'a:share')
      .text('📋 Меню', 'a:menu');
    return kb;
  };

  const giftAppliedText = (type, label) => {
    if (type === 'bp_start' || type === 'bp_pro') {
      return `🎁 <b>${escapeHtml(label)}</b> активирован ✅\n\nХочешь использовать как бренд? Нажми «Режим бренда».`;
    }
    if (type === 'pro') {
      return `🎁 <b>${escapeHtml(label)}</b> активирован ✅\n\nОткрой меню и продолжай работу.`;
    }
    return `🎁 <b>${escapeHtml(label)}</b> активирован ✅`;
  };

  const results = [];
  for (const uname of usernames) {
    const clean = uname.replace(/^@/, '').trim().toLowerCase();
    if (!clean) { results.push(`❌ пустой`); continue; }

    const found = await db.findUserByUsername(clean);
    if (!found) { results.push(`❌ @${clean} — не найден`); continue; }

    try {
      if (giftType === 'bp_start') {
        const planDef = BRAND_PLANS.find(pl => pl.id === 'start');
        await db.activateBrandPlan(found.id, 'start', CFG.BRAND_PLAN_DURATION_DAYS);
        if (planDef?.credits) await db.addGiftedBrandCredits(found.id, planDef.credits);
        results.push(`✅ @${clean} — Brand Plan Старт + ${planDef?.credits || 0} кредитов`);

        // Notify recipient with a clear next step (no forced mode switch)
        try {
          if (found.tg_id) {
            await bot.api.sendMessage(
              Number(found.tg_id),
              giftAppliedText('bp_start', '⭐️ Brand Plan Старт'),
              { parse_mode: 'HTML', reply_markup: buildGiftAppliedKb('bp_start') }
            );
          }
        } catch {}
      } else if (giftType === 'bp_pro') {
        const planDef = BRAND_PLANS.find(pl => pl.id === 'pro');
        await db.activateBrandPlan(found.id, 'pro', CFG.BRAND_PLAN_DURATION_DAYS);
        if (planDef?.credits) await db.addGiftedBrandCredits(found.id, planDef.credits);
        results.push(`✅ @${clean} — Brand Plan Про + ${planDef?.credits || 0} кредитов`);

        try {
          if (found.tg_id) {
            await bot.api.sendMessage(
              Number(found.tg_id),
              giftAppliedText('bp_pro', '🚀 Brand Plan Про'),
              { parse_mode: 'HTML', reply_markup: buildGiftAppliedKb('bp_pro') }
            );
          }
        } catch {}
      } else if (giftType === 'pro') {
        const wsList = await db.listWorkspaces(found.id);
        if (!wsList.length) { results.push(`⚠️ @${clean} — нет каналов, PRO не применён`); continue; }
        for (const ws of wsList) {
          await db.activateWorkspacePro(ws.id, CFG.PRO_DURATION_DAYS);
        }
        results.push(`✅ @${clean} — PRO на ${wsList.length} ${ruPlural(wsList.length, 'канал', 'канала', 'каналов')}`);

        try {
          if (found.tg_id) {
            await bot.api.sendMessage(
              Number(found.tg_id),
              giftAppliedText('pro', '✨ PRO Креатор'),
              { parse_mode: 'HTML', reply_markup: buildGiftAppliedKb('pro') }
            );
          }
        } catch {}
      } else {
        results.push(`❌ @${clean} — неизвестный тип`);
      }
    } catch (e) {
      results.push(`❌ @${clean} — ошибка: ${String(e?.message || e).slice(0, 60)}`);
    }
  }

  const kb = new InlineKeyboard()
    .text('🎁 Ещё подарить', 'a:adm_gift')
    .text('⬅️ Система', 'a:admin_sys')
    .row()
    .text('📋 Меню', 'a:menu')
    .text('🏠 Домой', 'a:home');
  await safeEditOrReply(ctx, `🎁 <b>Результат</b>\n\n${results.join('\n')}`, { parse_mode: 'HTML', reply_markup: kb });
  return;
}
if (p.a === 'a:adm_gift_batch') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return;
  const token = String(p.tk || '');
  const data = await redis.get(k(['adm_gift', token]));
  if (!data || !Array.isArray(data.usernames)) {
    return ctx.answerCallbackQuery({ text: 'Сессия истекла. Начни заново.' });
  }
  await redis.del(k(['adm_gift', token]));
  // Reuse adm_gift_do logic by faking p params
  const fakeP = { a: 'a:adm_gift_do', t: data.giftType, u: data.usernames.join(',') };
  // Execute inline
  const giftType = String(fakeP.t || '');
  const usernames = String(fakeP.u || '').split(',').filter(Boolean);
  const results = [];
  for (const uname of usernames) {
    const clean = uname.replace(/^@/, '').trim().toLowerCase();
    if (!clean) { results.push(`❌ пустой`); continue; }
    const found = await db.findUserByUsername(clean);
    if (!found) { results.push(`❌ @${clean} — не найден`); continue; }
    try {
      if (giftType === 'bp_start') {
        const planDef = BRAND_PLANS.find(pl => pl.id === 'start');
        await db.activateBrandPlan(found.id, 'start', CFG.BRAND_PLAN_DURATION_DAYS);
        if (planDef?.credits) await db.addGiftedBrandCredits(found.id, planDef.credits);
        results.push(`✅ @${clean} — Brand Plan Старт + ${planDef?.credits || 0} кр.`);
      } else if (giftType === 'bp_pro') {
        const planDef = BRAND_PLANS.find(pl => pl.id === 'pro');
        await db.activateBrandPlan(found.id, 'pro', CFG.BRAND_PLAN_DURATION_DAYS);
        if (planDef?.credits) await db.addGiftedBrandCredits(found.id, planDef.credits);
        results.push(`✅ @${clean} — Brand Plan Про + ${planDef?.credits || 0} кр.`);
      } else if (giftType === 'pro') {
        const wsList = await db.listWorkspaces(found.id);
        if (!wsList.length) { results.push(`⚠️ @${clean} — нет каналов`); continue; }
        for (const ws of wsList) await db.activateWorkspacePro(ws.id, CFG.PRO_DURATION_DAYS);
        results.push(`✅ @${clean} — PRO (${wsList.length} кан.)`);
      } else {
        results.push(`❌ @${clean} — неизвестный тип`);
      }
    } catch (e) {
      results.push(`❌ @${clean} — ошибка: ${String(e?.message || e).slice(0, 60)}`);
    }
  }
  const kb = new InlineKeyboard()
    .text('🎁 Ещё подарить', 'a:adm_gift')
    .text('⬅️ Система', 'a:admin_sys')
    .row()
    .text('📋 Меню', 'a:menu')
    .text('🏠 Домой', 'a:home');
  await safeEditOrReply(ctx, `🎁 <b>Результат</b>\n\n${results.join('\n')}`, { parse_mode: 'HTML', reply_markup: kb });
  return;
}
if (p.a === 'a:adm_gift_revoke') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return;
  const kb = new InlineKeyboard()
    .text('⛔ Отменить Brand Plan', 'a:adm_gift_revoke_input|t:bp')
    .row()
    .text('⛔ Plan и подарочные кредиты', 'a:adm_gift_revoke_input|t:bp_gcr')
    .row()
    .text('🧾 Забрать подарочные кредиты', 'a:adm_gift_revoke_input|t:gcr')
    .row()
    .text('⛔ Забрать PRO', 'a:adm_gift_revoke_input|t:pro')
    .row()
    .text('🧹 Обнулить кредиты (опасно)', 'a:adm_gift_revoke_input|t:cr')
    .row()
    .text('⬅️ Назад', 'a:adm_gift')
    .text('⬅️ Система', 'a:admin_sys')
    .row()
    .text('📋 Меню', 'a:menu')
    .text('🏠 Домой', 'a:home');
  await safeEditOrReply(
    ctx,
    `⛔ <b>Забрать / отменить</b>\n\nВыбери, что забрать у пользователей.\nДальше введи @username (можно несколько).`,
    { parse_mode: 'HTML', reply_markup: kb }
  );
  return;
}
if (p.a === 'a:adm_gift_revoke_input') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return;
  const revType = String(p.t || '');
  const labels = { bp: 'Забрать Brand Plan', bp_gcr: 'Забрать Brand Plan + подарочные кредиты', gcr: 'Забрать подарочные кредиты', pro: 'Забрать PRO', cr: 'Обнулить кредиты' };
  const label = labels[revType] || revType;
  const kb = new InlineKeyboard()
    .text('⬅️ Назад', 'a:adm_gift_revoke')
    .text('⬅️ Система', 'a:admin_sys')
    .row()
    .text('📋 Меню', 'a:menu')
    .text('🏠 Домой', 'a:home');
  const warn = revType === 'cr'
    ? '\n\n⚠️ <b>Внимание:</b> кредиты будут обнулены. Используй только если уверен.'
    : (revType === 'gcr' || revType === 'bp_gcr')
      ? '\n\n<i>Будут сняты только оставшиеся <b>подарочные</b> кредиты. Купленные/триал не трогаем.</i>'
      : '';
  await safeEditOrReply(
    ctx,
    `⛔ <b>${escapeHtml(label)}</b>\n\nВведи @username получателей (через пробел, запятую или каждый с новой строки).${warn}\n\nПример:\n<code>@user1 @user2</code>`,
    { parse_mode: 'HTML', reply_markup: kb }
  );
  await setExpectText(ctx.from.id, { type: 'adm_revoke_users', revType });
  return;
}
if (p.a === 'a:adm_gift_revoke_do') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return;
  const revType = String(p.t || '');
  const usersRaw = String(p.u || '');
  const usernames = usersRaw.split(',').filter(Boolean);
  if (!usernames.length) return ctx.answerCallbackQuery({ text: 'Нет юзернеймов.' });

  const results = [];
  for (const uname of usernames) {
    const clean = uname.replace(/^@/, '').trim().toLowerCase();
    if (!clean) { results.push(`❌ пустой`); continue; }

    const found = await db.findUserByUsername(clean);
    if (!found) { results.push(`❌ @${clean} — не найден`); continue; }
    try {
      if (revType === 'bp') {
        await db.revokeBrandPlan(found.id);
        results.push(`⛔ @${clean} — Brand Plan забран`);
      } else if (revType === 'bp_gcr') {
        await db.revokeBrandPlan(found.id);
        const r = await db.revokeGiftedBrandCredits(found.id);
        results.push(`⛔+🧾 @${clean} — Brand Plan забран, снято ${Number(r?.taken || 0)} подарочных кр.`);
      } else if (revType === 'gcr') {
        const r = await db.revokeGiftedBrandCredits(found.id);
        const taken = Number(r?.taken || 0);
        const left = Number(r?.brand_credits || 0);
        results.push(`🧾 @${clean} — снято ${taken} подарочных кр. (осталось: ${left})`);
      } else if (revType === 'pro') {
        await db.revokeAllWorkspacePro(found.id);
        results.push(`⛔ @${clean} — PRO забран`);
      } else if (revType === 'cr') {
        await db.resetBrandCredits(found.id);
        results.push(`🧹 @${clean} — кредиты обнулены`);
      } else {
        results.push(`❌ @${clean} — неизвестный тип`);
      }
    } catch (e) {
      results.push(`❌ @${clean} — ошибка: ${String(e?.message || e).slice(0, 60)}`);
    }
  }

  const kb = new InlineKeyboard()
    .text('⛔ Ещё забрать', 'a:adm_gift_revoke')
    .text('⬅️ Система', 'a:admin_sys')
    .row()
    .text('📋 Меню', 'a:menu')
    .text('🏠 Домой', 'a:home');
  await safeEditOrReply(ctx, `⛔ <b>Результат</b>\n\n${results.join('\n')}`, { parse_mode: 'HTML', reply_markup: kb });
  return;
}
if (p.a === 'a:adm_gift_revoke_batch') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return;
  const token = String(p.tk || '');
  const data = await redis.get(k(['adm_revoke', token]));
  if (!data || !Array.isArray(data.usernames)) {
    return ctx.answerCallbackQuery({ text: 'Сессия истекла. Начни заново.' });
  }
  await redis.del(k(['adm_revoke', token]));
  const revType = String(data.revType || '');
  const usernames = Array.isArray(data.usernames) ? data.usernames : [];
  const results = [];
  for (const uname of usernames) {
    const clean = uname.replace(/^@/, '').trim().toLowerCase();
    if (!clean) { results.push(`❌ пустой`); continue; }
    const found = await db.findUserByUsername(clean);
    if (!found) { results.push(`❌ @${clean} — не найден`); continue; }
    try {
      if (revType === 'bp') {
        await db.revokeBrandPlan(found.id);
        results.push(`⛔ @${clean} — Brand Plan забран`);
      } else if (revType === 'pro') {
        await db.revokeAllWorkspacePro(found.id);
        results.push(`⛔ @${clean} — PRO забран`);
      } else if (revType === 'cr') {
        await db.resetBrandCredits(found.id);
        results.push(`🧹 @${clean} — кредиты обнулены`);
      } else {
        results.push(`❌ @${clean} — неизвестный тип`);
      }
    } catch (e) {
      results.push(`❌ @${clean} — ошибка: ${String(e?.message || e).slice(0, 60)}`);
    }
  }
  const kb = new InlineKeyboard()
    .text('⛔ Ещё забрать', 'a:adm_gift_revoke')
    .text('⬅️ Система', 'a:admin_sys')
    .row()
    .text('📋 Меню', 'a:menu')
    .text('🏠 Домой', 'a:home');
  await safeEditOrReply(ctx, `⛔ <b>Результат</b>\n\n${results.join('\n')}`, { parse_mode: 'HTML', reply_markup: kb });
  return;
}
  })();
  return true;
}
