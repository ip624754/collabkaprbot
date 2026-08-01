import { InlineKeyboard } from 'grammy';
import { opaqueLogRef, safeLogError } from '../../lib/logPrivacy.js';
import {
  CALLBACK_DISPATCH_STATUS,
  dispatchOwnedCallback,
} from '../router/callbackRouter.js';
import { CALLBACK_PHASE } from '../router/callbackOwnership.js';

const SAFE_ACK_INSTALLED = Symbol.for('collabka.callback.safe_ack_installed');

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getCid(ctx) {
  return ctx?.state?.cid || `${ctx?.update?.update_id ?? 0}-${ctx?.from?.id ?? 0}`;
}

async function replyUnknown(ctx, deps, action) {
  const cid = getCid(ctx);
  try {
    deps?.logger?.warn?.(
      { cid, action: String(action || ''), actor_ref: opaqueLogRef(ctx?.from?.id, 'telegram_actor') },
      'unknown_callback'
    );
  } catch {}

  try {
    await ctx.answerCallbackQuery({ text: 'Кнопка устарела. Открой меню.' });
  } catch {}

  const kb = new InlineKeyboard().text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');
  const msg =
    `⚠️ <b>Кнопка устарела</b> (после обновления).\n\n` +
    `Открой меню и продолжай оттуда.`;

  if (typeof deps?.safeEditOrReply === 'function') {
    await deps.safeEditOrReply(ctx, msg, { parse_mode: 'HTML', reply_markup: kb });
    return;
  }

  await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: kb }).catch(() => {});
}

async function replyError(ctx, deps, action, err) {
  const cid = getCid(ctx);
  try {
    deps?.logger?.error?.(
      {
        cid,
        action: String(action || ''),
        actor_ref: opaqueLogRef(ctx?.from?.id, 'telegram_actor'),
        err: safeLogError(err),
      },
      'callback.error'
    );
  } catch {}

  try {
    await ctx.answerCallbackQuery({ text: 'Ошибка. Открой меню.' });
  } catch {}

  const kb = new InlineKeyboard().text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');
  const dbg = `\n\n<code>cid: ${escHtml(cid)}\nact: ${escHtml(String(action || ''))}</code>`;
  const isAdmin = (typeof deps?.isAdmin === 'function') ? !!deps.isAdmin(ctx) : !!deps?.isAdmin;
  const errLine = isAdmin
    ? `\n<code>err: ${escHtml(String(err?.name || 'Error'))}: ${escHtml(String(err?.message || err))}</code>`
    : '';
  const msg =
    `⚠️ <b>Произошла ошибка</b>\n\n` +
    `Я уже записал детали. Открой меню и повтори шаг.` +
    dbg +
    errLine;

  if (typeof deps?.safeEditOrReply === 'function') {
    await deps.safeEditOrReply(ctx, msg, { parse_mode: 'HTML', reply_markup: kb });
    return;
  }
  await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: kb }).catch(() => {});
}

function installSafeCallbackAck(ctx) {
  try {
    if (!ctx || ctx[SAFE_ACK_INSTALLED]) return;
    const original = ctx.answerCallbackQuery?.bind(ctx);
    if (original) {
      ctx.answerCallbackQuery = async (...args) => {
        try {
          return await original(...args);
        } catch {
          return undefined;
        }
      };
    }
    Object.defineProperty(ctx, SAFE_ACK_INSTALLED, {
      value: true,
      enumerable: false,
      configurable: false,
    });
  } catch {}
}

/**
 * Runs only routes explicitly owned by the pre-user phase.
 *
 * Returns true when the callback was consumed (including a rendered error),
 * false when ownership belongs to a later phase.
 */
export async function dispatchPreUserCallback(ctx, p, deps = {}) {
  installSafeCallbackAck(ctx);

  const result = await dispatchOwnedCallback({
    phase: CALLBACK_PHASE.PRE_USER,
    ctx,
    p,
    handlers: deps.handlers || {},
    final: false,
  });

  if (result.status === CALLBACK_DISPATCH_STATUS.DEFERRED) return false;
  if (result.status === CALLBACK_DISPATCH_STATUS.HANDLED) return true;

  if (result.status === CALLBACK_DISPATCH_STATUS.UNKNOWN) {
    await replyUnknown(ctx, deps, result.action);
    return true;
  }

  await replyError(ctx, deps, result.action, result.error);
  return true;
}

/**
 * Final post-user dispatch. All registered actions have exactly one owner:
 * an extracted route or the compatibility legacy dispatcher.
 */
export async function dispatchCallback(ctx, p, u, deps = {}) {
  installSafeCallbackAck(ctx);

  const result = await dispatchOwnedCallback({
    phase: CALLBACK_PHASE.POST_USER,
    ctx,
    p,
    u,
    handlers: deps.handlers || {},
    legacy: deps.legacy,
    final: true,
  });

  if (result.status === CALLBACK_DISPATCH_STATUS.HANDLED) return true;

  if (result.status === CALLBACK_DISPATCH_STATUS.UNKNOWN) {
    await replyUnknown(ctx, deps, result.action);
    return false;
  }

  await replyError(ctx, deps, result.action, result.error);
  return false;
}
