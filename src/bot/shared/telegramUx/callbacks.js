import { TELEGRAM_UX_ACTION } from './actions.js';
import { isTelegramUxCallbackAction } from './policy.js';

function requireValue(deps, name) {
  const value = deps?.[name];
  if (value === null || value === undefined) {
    throw new Error(`telegram_ux_shared.missing_dependency:${name}`);
  }
  return value;
}

export async function handleTelegramUxCallback(ctx, p, _u, deps = {}) {
  const action = String(p?.a || '').trim();
  if (!isTelegramUxCallbackAction(action)) return false;

  if (action === TELEGRAM_UX_ACTION.USER_ACK) {
    const InlineKeyboard = requireValue(deps, 'InlineKeyboard');
    let src = String(p?.src || '');
    if (!src) {
      try {
        const ik = ctx?.callbackQuery?.message?.reply_markup?.inline_keyboard || [];
        const callbacks = ik.flat().map((button) => String(button?.callback_data || '')).join(' ');
        if (callbacks.includes('src:admmsg') || callbacks.includes('a:menu_push') || callbacks.includes('a:support_push')) {
          src = 'admmsg';
        }
      } catch {}
    }

    try { await ctx.answerCallbackQuery({ text: '✅ Понятно' }); } catch {}
    const chatId = ctx?.callbackQuery?.message?.chat?.id;
    const messageId = ctx?.callbackQuery?.message?.message_id;
    if (!chatId || !messageId) return true;

    if (src === 'admmsg') {
      const kb = new InlineKeyboard() /* navlint: ignore-next — receipt preserves original Menu + Support controls */
        .text('📋 Меню', 'a:menu_push|src:admmsg')
        .text('💬 Поддержка', 'a:support_push|src:admmsg');
      try { await ctx.api.editMessageReplyMarkup(chatId, messageId, { reply_markup: kb }); } catch {}
      return true;
    }

    try { await ctx.api.editMessageReplyMarkup(chatId, messageId, { reply_markup: undefined }); } catch {}
    return true;
  }

  throw new Error(`telegram_ux_shared.unreachable_action:${action}`);
}
