import { InlineKeyboard } from 'grammy';
import { CFG } from '../lib/config.js';
import { escapeHtml, fmtTs } from './helpers.js';

function botLink(startPayload) {
  const u = String(CFG.BOT_USERNAME || '').replace(/^@/, '').trim();
  return u ? `https://t.me/${u}?start=${startPayload}` : '';
}

function channelLink(username) {
  const u = String(username || '').replace(/^@/, '').trim();
  return u ? `https://t.me/${u}` : '';
}

function formatChannelLine(g) {
  const titleRaw = g.ws_title ?? g.workspace_title ?? g.workspaceTitle ?? 'канал';
  const title = titleRaw ? escapeHtml(titleRaw) : 'канал';
  const unameRaw = g.ws_username ?? g.channel_username ?? g.ws_channel_username ?? g.channelUsername ?? '';
  const u = unameRaw ? '@' + escapeHtml(String(unameRaw).replace(/^@/, '')) : '';
  return `${title}${u ? ` (${u})` : ''}`;
}

async function safeSend(api, chatId, text, extra) {
  try {
    await api.sendMessage(chatId, text, extra);
    return true;
  } catch {
    return false;
  }
}

export async function notifyGiveawayEnded({ api, db, g, reason = 'time', skipOwner = false, skipChannel = false } = {}) {
  if (!api || !db || !g) return { owner: false, channel: false };

  const gwId = Number(g.id);
  const endsLine = g.ends_at ? fmtTs(g.ends_at) : '—';
  const ownerRow = g.owner_user_id ? await db.getUserTgIdByUserId(Number(g.owner_user_id)) : null;

  // 1) Owner DM
  let ownerOk = false;
  if (!skipOwner && CFG.GIVEAWAY_NOTIFY_OWNER_ON_END && ownerRow?.tg_id) {
    const kb = new InlineKeyboard()
      .text('🎁 Открыть конкурс', `a:gw_open|i:${gwId}`)
      .row()
      .text('🏆 Выбрать победителей', `a:gw_draw_now|i:${gwId}`)
      .row()
      .text('🧾 Лог', `a:gw_log|i:${gwId}`)
      .text('📋 Меню', 'a:menu');

    const msg = `🏁 <b>Конкурс завершён</b>

Конкурс: <b>#${gwId}</b>
Канал: <b>${formatChannelLine(g)}</b>
Итоги: <b>${escapeHtml(String(endsLine))}</b>

Следующий шаг:
1) 🏆 Выбрать победителей
2) 📣 Опубликовать итоги (в карточке конкурса)

Причина: <b>${escapeHtml(reason)}</b>`;

    ownerOk = await safeSend(api, Number(ownerRow.tg_id), msg, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb });
    if (ownerOk) {
      try { await db.auditGiveaway(gwId, g.workspace_id, null, 'gw.notify_end_owner', { reason }); } catch {}
    }
  }

  // 2) Channel/creator chat (opt-in)
  let channelOk = false;
  if (!skipChannel && CFG.GIVEAWAY_NOTIFY_CHANNEL_ON_END) {
    const chatId = g.published_chat_id ?? g.ws_channel_id ?? g.channel_id ?? null;
    const deepLink = botLink(`gw_${gwId}`);
    if (chatId && deepLink) {
      const out = `🏁 <b>Конкурс завершён</b>

Итоги будут опубликованы здесь после выбора победителей.

🤖 Открыть бота: ${escapeHtml(deepLink)}`;
      const kb = { inline_keyboard: [[{ text: '🤖 Открыть бота', url: deepLink }]] };
      const replyParams = g.published_message_id
        ? { reply_parameters: { message_id: Number(g.published_message_id), allow_sending_without_reply: true } }
        : {};

      channelOk = await safeSend(api, Number(chatId), out, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb, ...replyParams });
      if (channelOk) {
        try { await db.auditGiveaway(gwId, g.workspace_id, null, 'gw.notify_end_channel', { reason, chat_id: chatId }); } catch {}
      }
    }
  }

  return { owner: ownerOk, channel: channelOk };
}

export async function notifyGiveawayWinnersReady({ api, db, g, reason = 'drawn', skipOwner = false, skipChannel = false } = {}) {
  if (!api || !db || !g) return { owner: false, channel: false };

  const gwId = Number(g.id);
  const ownerRow = g.owner_user_id ? await db.getUserTgIdByUserId(Number(g.owner_user_id)) : null;

  // 1) Owner DM
  let ownerOk = false;
  if (!skipOwner && CFG.GIVEAWAY_NOTIFY_OWNER_ON_WINNERS && ownerRow?.tg_id) {
    const kb = new InlineKeyboard()
      .text('📣 Опубликовать итоги', `a:gw_publish_results|i:${gwId}`)
      .row()
      .text('🎁 Открыть конкурс', `a:gw_open|i:${gwId}`)
      .row()
      .text('🧾 Лог', `a:gw_log|i:${gwId}`)
      .text('📋 Меню', 'a:menu');

    const msg = `🏆 <b>Итоги готовы</b>

Конкурс: <b>#${gwId}</b>
Канал: <b>${formatChannelLine(g)}</b>

Следующий шаг: нажми <b>«📣 Опубликовать итоги»</b>.

Причина: <b>${escapeHtml(reason)}</b>`;

    ownerOk = await safeSend(api, Number(ownerRow.tg_id), msg, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb });
    if (ownerOk) {
      try { await db.auditGiveaway(gwId, g.workspace_id, null, 'gw.notify_winners_owner', { reason }); } catch {}
    }
  }

  // 2) Channel/creator chat (opt-in)
  let channelOk = false;
  if (!skipChannel && CFG.GIVEAWAY_NOTIFY_CHANNEL_ON_WINNERS) {
    const chatId = g.published_chat_id ?? g.ws_channel_id ?? g.channel_id ?? null;
    const deepLink = botLink(`gw_${gwId}`);
    if (chatId && deepLink) {
      const out = `🏆 <b>Итоги готовы</b>

Скоро опубликуем результаты.

🤖 Открыть бота: ${escapeHtml(deepLink)}`;
      const kb = { inline_keyboard: [[{ text: '🤖 Открыть бота', url: deepLink }]] };
      const replyParams = g.published_message_id
        ? { reply_parameters: { message_id: Number(g.published_message_id), allow_sending_without_reply: true } }
        : {};

      channelOk = await safeSend(api, Number(chatId), out, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb, ...replyParams });
      if (channelOk) {
        try { await db.auditGiveaway(gwId, g.workspace_id, null, 'gw.notify_winners_channel', { reason, chat_id: chatId }); } catch {}
      }
    }
  }

  return { owner: ownerOk, channel: channelOk };
}
