import { isAdminSystemOperationAction } from './policy.js';

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
  'adminClearBroadcastPendingSnapshot',
  'adminGetBroadcastPendingSnapshot',
  'clearDraft',
  'clearExpectText',
  'escapeHtml',
  'flushOpsAlerts',
  'getBot',
  'isSuperAdminTg',
  'renderAdminInviteVisibilityHome',
  'renderAdminInviteVisibilityList',
  'renderAdminOps',
  'safeEditOrReply',
]);

export async function handleAdminSystemOperationCallback(ctx, p, u, deps = {}) {
  if (!isAdminSystemOperationAction(p?.a)) return false;
  const bound = bindDependencies(deps, REQUIRED_DEPENDENCIES);
  const {
    InlineKeyboard,
    adminClearBroadcastPendingSnapshot,
    adminGetBroadcastPendingSnapshot,
    clearDraft,
    clearExpectText,
    escapeHtml,
    flushOpsAlerts,
    getBot,
    isSuperAdminTg,
    renderAdminInviteVisibilityHome,
    renderAdminInviteVisibilityList,
    renderAdminOps,
    safeEditOrReply,
  } = bound;

  await (async () => {
if (p.a === 'a:admin_ops_flush') {
  const isAdmin = isSuperAdminTg(ctx.from.id);
  if (!isAdmin) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
  await ctx.answerCallbackQuery();
  try { await clearExpectText(ctx.from.id); } catch {}
  try { await clearDraft(ctx.from.id); } catch {}

  let res = null;
  try {
    // Force=true: operator explicitly requests an immediate digest flush.
    res = await flushOpsAlerts(getBot().api, 'ops', { force: true });
  } catch (e) {
    res = { sent: 0, skipped: 'redis_error', error: String(e?.message || e) };
  }

  const skipped = res && res.skipped ? String(res.skipped) : '';
  const map = {
    locked: 'уже выполняется (locked)',
    window: 'слишком рано (window)',
    empty: 'нет событий (empty)',
    no_targets: 'не настроены targets (no_targets)',
    redis_error: 'Redis недоступен (redis_error)',
  };

  let banner = '';
  if (res && res.flushed) {
    const sent = Number(res.sent) || 0;
    const ev = Number(res.events) || 0;
    banner = `✅ OPS digest: sent ${sent} • events ${ev}`;
  } else {
    const reason = map[skipped] || (skipped ? skipped : 'failed');
    banner = `⚠️ OPS digest: ${reason}`;
    if (res && res.error && skipped === 'redis_error') {
      banner += ` — ${String(res.error).slice(0, 90)}`;
    }
  }


  await renderAdminOps(ctx, { banner });
  return;
}

if (p.a === 'a:admin_ops_pending_clear') {
  const isAdmin = isSuperAdminTg(ctx.from.id);
  if (!isAdmin) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
  await ctx.answerCallbackQuery();
  let text = '🧹 <b>Очистить снимок очереди?</b>\n\n';
  text += 'Очистит только Redis snapshot <code>broadcast.pending_deliveries</code>.\n';
  text += '<b>Не</b> останавливает реальную доставку и <b>не</b> меняет DB/QStash state.\n\n';
  const st = await adminGetBroadcastPendingSnapshot();
  if (!st.ok) {
    text += '⚠️ Redis недоступен — сейчас подтверждать нечего.\n';
  } else if (!st.snap) {
    text += 'Сейчас snapshot пуст.\n';
  } else {
    const ts = st.snap.ts ? `<code>${escapeHtml(String(st.snap.ts).slice(0, 19))}</code>` : '—';
    const bid = st.snap.broadcast_id ? `<b>#${st.snap.broadcast_id}</b>` : '—';
    text += `Текущий snapshot: broadcast ${bid}; pending <b>${st.snap.pending_count}</b>; ts ${ts}\n`;
  }
  const kb = new InlineKeyboard()
    .text('✅ Очистить snapshot', 'a:admin_ops_pending_clear_do')
    .row()
    .text('⬅️ Операции', 'a:admin_ops')
    .row()
    .text('📋 Меню', 'a:menu')
    .text('🏠 Домой', 'a:home');
  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
  return;
}

if (p.a === 'a:admin_ops_pending_clear_do') {
  const isAdmin = isSuperAdminTg(ctx.from.id);
  if (!isAdmin) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
  await ctx.answerCallbackQuery();
  const out = await adminClearBroadcastPendingSnapshot();
  const banner = out.ok
    ? '✅ Broadcast pending snapshot cleared (Redis only)'
    : `⚠️ Не удалось очистить снимок очереди: ${String(out.error || 'redis_error').slice(0, 90)}`;
  await renderAdminOps(ctx, { banner });
  return;
}

if (p.a === 'a:admin_invites') {
  const isAdmin = isSuperAdminTg(ctx.from.id);
  if (!isAdmin) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
  await ctx.answerCallbackQuery();
  try { await clearExpectText(ctx.from.id); } catch {}
  await renderAdminInviteVisibilityHome(ctx);
  return;
}
if (p.a === 'a:admin_invites_list') {
  const isAdmin = isSuperAdminTg(ctx.from.id);
  if (!isAdmin) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
  await ctx.answerCallbackQuery();
  try { await clearExpectText(ctx.from.id); } catch {}
  await renderAdminInviteVisibilityList(ctx, String(p.k || 'top'), Math.max(0, Number(p.p || 0) || 0));
  return;
}
  })();
  return true;
}
