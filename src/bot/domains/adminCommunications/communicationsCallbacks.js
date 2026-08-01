import { isAdminCommunicationHomeAction } from './policy.js';

function bindDependencies(deps, names) {
  for (const name of names) {
    if (deps?.[name] === null || deps?.[name] === undefined) {
      throw new Error('admin_communications_domain.missing_dependency:' + name);
    }
  }
  return deps;
}

const REQUIRED_DEPENDENCIES = Object.freeze([
  'clearDraft',
  'clearExpectText',
  'isSuperAdminTg',
  'renderAdminComms',
]);

export async function handleAdminCommunicationsCallback(ctx, p, u, deps = {}) {
  if (!isAdminCommunicationHomeAction(p?.a)) return false;
  const bound = bindDependencies(deps, REQUIRED_DEPENDENCIES);
  const {
    clearDraft,
    clearExpectText,
    isSuperAdminTg,
    renderAdminComms,
  } = bound;

  await (async () => {
if (p.a === 'a:admin_comms') {
      const isAdmin = isSuperAdminTg(ctx.from.id);
      if (!isAdmin) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
      await ctx.answerCallbackQuery();
      try { await clearExpectText(ctx.from.id); } catch {}
      try { await clearDraft(ctx.from.id); } catch {}
      await renderAdminComms(ctx);
      return;
    }
  })();
  return true;
}
