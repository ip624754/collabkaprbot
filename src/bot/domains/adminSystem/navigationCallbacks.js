import { isAdminSystemNavigationAction } from './policy.js';

function bindDependencies(deps, names) {
  for (const name of names) {
    if (deps?.[name] === null || deps?.[name] === undefined) {
      throw new Error('admin_system_domain.missing_dependency:' + name);
    }
  }
  return deps;
}

const REQUIRED_DEPENDENCIES = Object.freeze([
  'clearDraft',
  'clearExpectText',
  'isSuperAdminTg',
  'renderAdminHome',
  'renderAdminOps',
  'renderAdminSystem',
]);

export async function handleAdminSystemNavigationCallback(ctx, p, u, deps = {}) {
  if (!isAdminSystemNavigationAction(p?.a)) return false;
  const bound = bindDependencies(deps, REQUIRED_DEPENDENCIES);
  const {
    clearDraft,
    clearExpectText,
    isSuperAdminTg,
    renderAdminHome,
    renderAdminOps,
    renderAdminSystem,
  } = bound;

  await (async () => {
if (p.a === 'a:admin') {
  // Backward-compat alias
  p.a = 'a:admin_home';
}

if (p.a === 'a:admin_home') {
  const isAdmin = isSuperAdminTg(ctx.from.id);
  if (!isAdmin) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
  await ctx.answerCallbackQuery();

  // If admin navigated here while we were expecting text input — cancel it.
  try { await clearExpectText(ctx.from.id); } catch {}

  await renderAdminHome(ctx);
  return;
}

if (p.a === 'a:admin_ops') {
  const isAdmin = isSuperAdminTg(ctx.from.id);
  if (!isAdmin) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
  await ctx.answerCallbackQuery();
  try { await clearExpectText(ctx.from.id); } catch {}
  try { await clearDraft(ctx.from.id); } catch {}
  await renderAdminOps(ctx);
  return;
}

if (p.a === 'a:admin_sys') {
  const isAdmin = isSuperAdminTg(ctx.from.id);
  if (!isAdmin) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
  await ctx.answerCallbackQuery();
  try { await clearExpectText(ctx.from.id); } catch {}
  try { await clearDraft(ctx.from.id); } catch {}
  await renderAdminSystem(ctx);
  return;
}
  })();
  return true;
}
