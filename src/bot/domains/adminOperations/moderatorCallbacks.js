import { isAdminModeratorGovernanceAction } from './policy.js';

function bindDependencies(deps, names) {
  for (const name of names) {
    if (deps?.[name] === null || deps?.[name] === undefined) {
      throw new Error('admin_operations_domain.missing_dependency:' + name);
    }
  }
  return deps;
}

const REQUIRED_DEPENDENCIES = Object.freeze([
  'InlineKeyboard',
  'db',
  'invalidateRoleFlagsCache',
  'isSuperAdminTg',
  'renderAdminModerators',
  'safeEditOrReply',
  'setExpectText',
]);

export async function handleAdminModeratorGovernanceCallback(ctx, p, u, deps = {}) {
  if (!isAdminModeratorGovernanceAction(p?.a)) return false;
  const bound = bindDependencies(deps, REQUIRED_DEPENDENCIES);
  const {
    InlineKeyboard,
    db,
    invalidateRoleFlagsCache,
    isSuperAdminTg,
    renderAdminModerators,
    safeEditOrReply,
    setExpectText,
  } = bound;

  await (async () => {
if (p.a === 'a:admin_mod_list') {
  const isAdmin = isSuperAdminTg(ctx.from.id);
  if (!isAdmin) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
  await ctx.answerCallbackQuery();
  await renderAdminModerators(ctx);
  return;
}
if (p.a === 'a:admin_mod_add') {
  const isAdmin = isSuperAdminTg(ctx.from.id);
  if (!isAdmin) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
  await ctx.answerCallbackQuery();
  await safeEditOrReply(ctx, '➕ Введи @username модератора (он должен иметь username).', { reply_markup: new InlineKeyboard().text('⬅️ Отмена', 'a:admin_home') });
  await setExpectText(ctx.from.id, { type: 'admin_add_mod_username' });
  return;
}
if (p.a === 'a:admin_mod_rm') {
  const isAdmin = isSuperAdminTg(ctx.from.id);
  if (!isAdmin) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
  await ctx.answerCallbackQuery({ text: 'Удалено.' });
  await db.removeNetworkModerator(Number(p.uid));
  try { await invalidateRoleFlagsCache(Number(p.uid)); } catch {}
  await renderAdminModerators(ctx);
  return;
}
  })();
  return true;
}
