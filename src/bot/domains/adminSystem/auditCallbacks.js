import { isAdminAuditMetricAction } from './policy.js';

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
  'clearAdminAuditQuery',
  'clearExpectText',
  'isSuperAdminTg',
  'renderAdminAudit',
  'renderAdminMetrics',
  'safeEditOrReply',
  'sendAdminAuditExport',
  'setExpectText',
]);

export async function handleAdminAuditMetricCallback(ctx, p, u, deps = {}) {
  if (!isAdminAuditMetricAction(p?.a)) return false;
  const bound = bindDependencies(deps, REQUIRED_DEPENDENCIES);
  const {
    InlineKeyboard,
    clearAdminAuditQuery,
    clearExpectText,
    isSuperAdminTg,
    renderAdminAudit,
    renderAdminMetrics,
    safeEditOrReply,
    sendAdminAuditExport,
    setExpectText,
  } = bound;

  await (async () => {
if (p.a === 'a:aud') {
  const isAdmin = isSuperAdminTg(ctx.from.id);
  if (!isAdmin) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
  await ctx.answerCallbackQuery();
  try { await clearExpectText(ctx.from.id); } catch {}
  const h = Number(p.h || 24);
  const page = Math.max(0, Number(p.p) || 0);
  await renderAdminAudit(ctx, { afterHours: h, page });
  return;
}

// Audit: search input mode
if (p.a === 'a:aud_search') {
  const isAdmin = isSuperAdminTg(ctx.from.id);
  if (!isAdmin) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
  await ctx.answerCallbackQuery();
  const h = Number(p.h || 24);
  await safeEditOrReply(ctx,
    `🔎 <b>Поиск по журналу аудита</b>\n\nВведи одно из:\n• <code>action:</code> — поиск по типу действия (напр. <code>lead.status_changed</code>)\n• <code>ws:ID</code> — по workspace\n• <code>user:ID</code> — по actor user id\n\nПример: <code>lead.status</code>`,
    {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard()
        .text('⬅️ Отмена', `a:aud|h:${h}|p:0`)
        .row()
        .text('⬅️ Админка', 'a:admin_home')
        .row()
        .text('📋 Меню', 'a:menu')
        .text('🏠 Домой', 'a:home')
    }
  );
  await setExpectText(ctx.from.id, { type: 'aud_search', h }, 15 * 60);
  return;
}

// Audit: reset search
if (p.a === 'a:aud_reset') {
  const isAdmin = isSuperAdminTg(ctx.from.id);
  if (!isAdmin) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
  await ctx.answerCallbackQuery();
  try { await clearExpectText(ctx.from.id); } catch {}
  await clearAdminAuditQuery(ctx.from.id);
  const h = Number(p.h || 24);
  await renderAdminAudit(ctx, { afterHours: h, page: 0 });
  return;
}

// Audit: export TXT
if (p.a === 'a:aud_export') {
  await ctx.answerCallbackQuery({ text: '⏳ Генерирую…' });
  const isAdmin = isSuperAdminTg(ctx.from.id);
  if (!isAdmin) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
  const h = Number(p.h || 24);
  try {
    await sendAdminAuditExport(ctx, h);
  } catch (err) {
    console.error('[ADMIN] audit export error', err);
    await safeEditOrReply(ctx, '⚠️ Ошибка при генерации экспорта.', {
      reply_markup: new InlineKeyboard().text('⬅️ Журнал аудита', `a:aud|h:${h}|p:0`)
    });
  }
  return;
}

if (p.a === 'a:admin_metrics') {
  const isAdmin = isSuperAdminTg(ctx.from.id);
  if (!isAdmin) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
  await ctx.answerCallbackQuery();
  const days = Math.max(1, Math.min(90, Number(p.d) || 14));
  await renderAdminMetrics(ctx, days);
  return;
}
  })();
  return true;
}
