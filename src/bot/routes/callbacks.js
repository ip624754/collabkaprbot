import { InlineKeyboard } from 'grammy';

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getCid(ctx) {
  return ctx?.state?.cid || `${ctx?.update?.update_id ?? 0}-${ctx?.from?.id ?? 0}`;
}

function resolveRoute(action) {
  const a = String(action || '');
  if (!a) return null;

  // NOTE: this is a thin registry used for safe dispatch + future strangler extraction.
  // Today most routes still delegate to the legacy (monolith) handler.
  if (a === 'a:menu' || a === 'a:main_menu' || a.startsWith('a:ui_')) return 'ui';
  if (a.startsWith('a:bx_') || a.startsWith('a:bm_')) return 'bx';
  if (a.startsWith('a:dir_') || a.startsWith('a:brand_dir_')) return 'dir';
  if (a.startsWith('a:gw_')) return 'gw';
  if (a.startsWith('a:ws_') || a.startsWith('a:wsp_')) return 'ws';
  if (a.startsWith('a:adm_')) return 'adm';
  if (a.startsWith('a:rep_') || a.startsWith('a:report_')) return 'rep';

  // Unknown a:* action
  return null;
}

async function callMaybe(fn, ctx, p, u) {
  if (!fn) return undefined;
  // Support both closures (() => ...) and explicit signatures ((ctx,p,u)=>...)
  if (fn.length >= 1) return fn(ctx, p, u);
  return fn();
}

async function replyUnknown(ctx, deps, action) {
  const cid = getCid(ctx);
  const data = ctx?.callbackQuery?.data;

  try {
    deps?.logger?.warn?.(
      { cid, action: String(action || ''), data: String(data || ''), from_id: ctx?.from?.id ?? null },
      'unknown_callback'
    );
  } catch {}

  try {
    await ctx.answerCallbackQuery({ text: 'Кнопка устарела. Открой меню.' });
  } catch {}

  const kb = new InlineKeyboard().text('📋 Меню', 'a:menu');
  const msg =
    `⚠️ <b>Кнопка устарела</b> (после обновления).

` +
    `Открой меню и продолжай оттуда.`;

  // safeEditOrReply is a project-level contract: never silently fail.
  if (typeof deps?.safeEditOrReply === 'function') {
    await deps.safeEditOrReply(ctx, msg, { parse_mode: 'HTML', reply_markup: kb });
    return;
  }

  // Fallback if safeEditOrReply is not available for any reason
  await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: kb }).catch(() => {});
}

async function replyError(ctx, deps, action, err) {
  const cid = getCid(ctx);
  try {
    deps?.logger?.error?.(
      {
        cid,
        action: String(action || ''),
        data: String(ctx?.callbackQuery?.data || ''),
        from_id: ctx?.from?.id ?? null,
        err: { name: String(err?.name || 'Error'), message: String(err?.message || err) }
      },
      'callback.error'
    );
  } catch {}

  try {
    await ctx.answerCallbackQuery({ text: 'Ошибка. Открой меню.' });
  } catch {}

  const kb = new InlineKeyboard().text('📋 Меню', 'a:menu');
  const dbg = `

<code>cid: ${escHtml(cid)}
act: ${escHtml(String(action || ''))}</code>`;
  const isAdmin = (typeof deps?.isAdmin === 'function') ? !!deps.isAdmin(ctx) : !!deps?.isAdmin;
  const errLine = isAdmin ? `
<code>err: ${escHtml(String(err?.name || 'Error'))}: ${escHtml(String(err?.message || err))}</code>` : '';
  const msg =
    `⚠️ <b>Произошла ошибка</b>

` +
    `Я уже записал детали. Открой меню и повтори шаг.` +
    dbg +
    errLine;

  if (typeof deps?.safeEditOrReply === 'function') {
    await deps.safeEditOrReply(ctx, msg, { parse_mode: 'HTML', reply_markup: kb });
    return;
  }
  await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: kb }).catch(() => {});
}

export async function dispatchCallback(ctx, p, u, deps = {}) {
  const action = String(p?.a || '');

  const route = resolveRoute(action);
  const handlers = deps.handlers || {};
  const handler = (route && handlers[route]) ? handlers[route] : deps.legacy;

  // Anti-silent: never crash on answerCallbackQuery
  try {
    const orig = ctx.answerCallbackQuery?.bind(ctx);
    if (orig) ctx.answerCallbackQuery = async (...args) => { try { return await orig(...args); } catch { return undefined; } };
  } catch {}

  try {
    const res = await callMaybe(handler, ctx, p, u);
    // Convention: legacy returns EXACT false when no branch matched.
    if (res === false) {
      await replyUnknown(ctx, deps, action);
      return false;
    }
    return true;
  } catch (err) {
    await replyError(ctx, deps, action, err);
    return false;
  }
}
