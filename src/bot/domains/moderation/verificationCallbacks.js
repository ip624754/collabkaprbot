import { isModerationVerificationAction } from './policy.js';

function bindDependencies(deps, names) {
  for (const name of names) {
    if (deps?.[name] === null || deps?.[name] === undefined) {
      throw new Error('moderation_domain.missing_dependency:' + name);
    }
  }
  return deps;
}

const REQUIRED_DEPENDENCIES = Object.freeze([
  'CFG',
  'InlineKeyboard',
  'db',
  'isModerator',
  'renderModVerifView',
  'renderModVerifs',
  'safeEditOrReply',
  'safeUserVerifications',
  'setExpectText',
]);

export async function handleModerationVerificationCallback(ctx, p, u, deps = {}) {
  if (!isModerationVerificationAction(p?.a)) return false;
  const bound = bindDependencies(deps, REQUIRED_DEPENDENCIES);
  const {
    CFG,
    InlineKeyboard,
    db,
    isModerator,
    renderModVerifView,
    renderModVerifs,
    safeEditOrReply,
    safeUserVerifications,
    setExpectText,
  } = bound;

  await (async () => {
if (p.a === 'a:mod_verifs') {
      await ctx.answerCallbackQuery();
      const isMod = await isModerator(u, ctx.from.id);
      if (!isMod) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      if (!CFG.VERIFICATION_ENABLED) return ctx.answerCallbackQuery({ text: 'Функция отключена.' });
      await renderModVerifs(ctx, Number(p.p || 0));
      return;
    }
if (p.a === 'a:mod_verif_view') {
      await ctx.answerCallbackQuery();
      const isMod = await isModerator(u, ctx.from.id);
      if (!isMod) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      if (!CFG.VERIFICATION_ENABLED) return ctx.answerCallbackQuery({ text: 'Функция отключена.' });
      const targetUserId = Number(p.uid);
      if (!Number.isInteger(targetUserId) || targetUserId <= 0) return;
      await renderModVerifView(ctx, targetUserId, Number(p.p || 0));
      return;
    }
if (p.a === 'a:mod_verif_approve') {
      await ctx.answerCallbackQuery({ text: '✅ Одобрено' });
      const isMod = await isModerator(u, ctx.from.id);
      if (!isMod) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      if (!CFG.VERIFICATION_ENABLED) return ctx.answerCallbackQuery({ text: 'Функция отключена.' });
      const targetUserId = Number(p.uid);
      if (!Number.isInteger(targetUserId) || targetUserId <= 0) return;
      await safeUserVerifications(() => db.setVerificationStatus(targetUserId, 'APPROVED', u.id, null), async () => null);
      try {
        await ctx.api.sendMessage(Number((await db.getUserById(targetUserId))?.tg_id), '✅ Ты верифицирован(а)! Теперь рядом с твоими офферами будет значок ✅.', { parse_mode: 'HTML' });
      } catch {}
      await renderModVerifView(ctx, targetUserId, Number(p.p || 0));
      return;
    }
if (p.a === 'a:mod_verif_reject') {
      await ctx.answerCallbackQuery();
      const isMod = await isModerator(u, ctx.from.id);
      if (!isMod) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      if (!CFG.VERIFICATION_ENABLED) return ctx.answerCallbackQuery({ text: 'Функция отключена.' });
      const targetUserId = Number(p.uid);
      if (!Number.isInteger(targetUserId) || targetUserId <= 0) return;
      await setExpectText(ctx.from.id, { type: 'mod_verif_reject_reason', targetUserId, page: Number(p.p || 0) });
      await safeEditOrReply(ctx, '❌ Напиши причиной отказа одним сообщением (текст), и я отправлю пользователю.', { reply_markup: new InlineKeyboard().text('⬅️ Отмена', `a:mod_verif_view|uid:${targetUserId}|p:${Number(p.p || 0)}`) });
      return;
    }
  })();
  return true;
}
