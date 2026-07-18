import { InlineKeyboard } from 'grammy';
import { CFG } from '../lib/config.js';
import { sponsorToChatId } from './sponsorParse.js';
import { recoveryPlain, recoveryToast } from './recoveryCopy.js';

function acc2Key(chat) {
  return ['mg', CFG.APP_ENV, 'acc2', chat].join(':');
}

async function mapLimit(items, limit, fn) {
  const res = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) break;
      res[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return res;
}

async function resolveBotMe(api) {
  // Prefer env (faster), but auto-fallback to getMe so диагностика never blocks.
  if (CFG.BOT_ID && CFG.BOT_USERNAME) return { id: Number(CFG.BOT_ID), username: String(CFG.BOT_USERNAME) };

  try {
    const me = await api.getMe();
    return { id: Number(me.id), username: String(me.username || CFG.BOT_USERNAME || '') };
  } catch {
    return { id: Number(CFG.BOT_ID || 0), username: String(CFG.BOT_USERNAME || '') };
  }
}

async function checkBotAdminCached(redis, api, chat, botId, force = false) {
  const key = acc2Key(chat);
  if (!force) {
    const cached = await redis.get(key);
    if (cached) {
      try {
        return typeof cached === 'string' ? JSON.parse(cached) : cached;
      } catch {}
    }
  }

  try {
    const cm = await api.getChatMember(chat, botId);
    const st = String(cm.status || '');
    let res;
    if (st === 'administrator' || st === 'creator') res = { state: 'admin', status: st };
    else if (st === 'member') res = { state: 'member', status: st };
    else if (st === 'left' || st === 'kicked') res = { state: 'no', status: st };
    else res = { state: 'no', status: st || 'unknown' };

    await redis.set(key, JSON.stringify(res), { ex: 10 * 60 });
    return res;
  } catch (e) {
    const res = { state: 'no', status: 'error', reason: String(e?.message || e) };
    await redis.set(key, JSON.stringify(res), { ex: 5 * 60 });
    return res;
  }
}

async function checkUserMember(api, chat, userId) {
  try {
    const cm = await api.getChatMember(chat, userId);
    const st = String(cm.status || '');
    const isIn =
      st === 'creator' ||
      st === 'administrator' ||
      st === 'member' ||
      (st === 'restricted' && cm.is_member === true);

    if (isIn) return { state: 'in', status: st };
    if (st === 'left' || st === 'kicked' || (st === 'restricted' && cm.is_member === false)) return { state: 'out', status: st };

    return { state: 'unknown', status: st || 'unknown' };
  } catch (e) {
    return { state: 'unknown', status: 'error', reason: String(e?.message || e) };
  }
}

function fmtBotLine(label, chat, a) {
  const name = label ? `<b>${label}</b> — ` : '';
  if (a.status === 'error') return `⚠️ ${name}<code>${chat}</code> — bot: <b>error</b>`;
  if (a.state === 'admin') return `✅ ${name}<code>${chat}</code> — bot: <b>admin</b>`;
  if (a.state === 'member') return `🟦 ${name}<code>${chat}</code> — bot: <b>member</b>`;
  return `❌ ${name}<code>${chat}</code> — bot: <b>no access</b>`;
}

function fmtUserLine(label, chat, r) {
  const name = label ? `<b>${label}</b> — ` : '';
  if (r.state === 'in') return `✅ ${name}<code>${chat}</code> — user: <b>subscribed</b>`;
  if (r.state === 'out') return `❌ ${name}<code>${chat}</code> — user: <b>not subscribed</b>`;
  if (r.status === 'error') return `⚠️ ${name}<code>${chat}</code> — user: <b>check error</b>`;
  return `⚠️ ${name}<code>${chat}</code> — user: <b>unknown</b>`;
}

function accessHelpText(botUsername) {
  const u = botUsername ? `@${botUsername}` : 'бот';
  return (
`<b>Как исправить ❌/⚠️</b>
1) Открой канал → Управление → Администраторы → Добавить → ${u}
2) Дай права: читать сообщения/управление (достаточно минимальных админ-прав).

<b>Почему важно:</b>
без доступа бот не сможет корректно подтверждать подписки участников.`
  );
}

export async function renderGwAccess({ ctx, gwId, ownerUserId, redis, db, safeEditOrReply, forceRecheck = false, checkUserId = null }) {
  const g = await db.getGiveawayForOwner(gwId, ownerUserId);
  if (!g) {
    if (ctx?.callbackQuery?.id) await ctx.answerCallbackQuery({ text: recoveryToast('giveaway'), show_alert: true }).catch(() => {});
    else await ctx.reply(recoveryPlain('giveaway'));
    return null;
  }

  if (typeof safeEditOrReply !== 'function') {
    throw new Error('gw_access.missing_safeEditOrReply');
  }

  const sponsorsRaw = await db.listGiveawaySponsors(gwId);
  const parsedSponsors = sponsorsRaw.map((s) => {
    const raw = String(s.sponsor_text || '').trim();
    const chat = sponsorToChatId(raw);
    return { raw, chat };
  });

  const mainChat = g.published_chat_id ? String(g.published_chat_id) : null;

  const channels = [];
  if (mainChat) channels.push({ label: 'Канал конкурса', chat: mainChat, kind: 'main' });

  for (const s of parsedSponsors) {
    if (s.chat) channels.push({ label: 'Спонсор', chat: s.chat, kind: 'sponsor' });
  }

  const invalidSponsors = parsedSponsors.filter((s) => !s.chat && s.raw);

  const botMe = await resolveBotMe(ctx.api);
  const botId = botMe.id || Number(CFG.BOT_ID || 0);
  const botUsername = botMe.username || CFG.BOT_USERNAME || 'YourBotUsername';

  // Recheck: clear cached bot access states
  if (forceRecheck) {
    for (const c of channels) await redis.del(acc2Key(c.chat));
  }

  const limit = CFG.TG_ACCESS_CHECK_CONCURRENCY || 4;

  const botAccessResults = channels.length
    ? await mapLimit(channels, limit, async (c) => {
        const a = await checkBotAdminCached(redis, ctx.api, c.chat, botId, forceRecheck);
        return { ...c, a };
      })
    : [];

  let adminCount = 0, memberCount = 0, noCount = 0, errCount = 0;
  const botLines = [];

  for (const r of botAccessResults) {
    if (r.a.status === 'error') errCount++;
    else if (r.a.state === 'admin') adminCount++;
    else if (r.a.state === 'member') memberCount++;
    else noCount++;

    botLines.push(fmtBotLine(r.label, r.chat, r.a));
  }

  // Optional: check a user across channels
  let userLines = [];
  let userOk = 0, userBad = 0, userUnknown = 0;

  if (checkUserId && channels.length) {
    const ures = await mapLimit(channels, limit, async (c) => {
      const r = await checkUserMember(ctx.api, c.chat, Number(checkUserId));
      return { ...c, r };
    });

    for (const x of ures) {
      if (x.r.state === 'in') userOk++;
      else if (x.r.state === 'out') userBad++;
      else userUnknown++;
      userLines.push(fmtUserLine(x.label, x.chat, x.r));
    }
  }

  const envNote = CFG.BOT_ID
    ? `BOT_ID: <code>${CFG.BOT_ID}</code>`
    : `BOT_ID: <b>auto</b> (через getMe)`;

  const sponsorNote = invalidSponsors.length
    ? `\n\n⚠️ <b>Невалидные спонсоры:</b>\n${invalidSponsors.map(s => '• ' + s.raw).join('\n')}`
    : '';

  const header =
`🧩 <b>Проверка доступа</b>
<code>giveaway:${gwId}</code>

<b>Bot:</b> ${botUsername ? '@' + botUsername : '—'}  (id: <code>${botId || '—'}</code>)
<b>Env:</b> ${envNote}`;

  const botSection =
channels.length
  ? `\n\n<b>Доступ бота к каналам</b>
✅ admin: <b>${adminCount}</b>   🟦 member: <b>${memberCount}</b>   ❌ no: <b>${noCount}</b>   ⚠️ err: <b>${errCount}</b>

${botLines.join('\n')}`
  : `\n\n<b>Каналы</b>\nСпонсоров нет и конкурс не опубликован — проверять нечего ✅`;

  const userSection =
checkUserId
  ? `\n\n<b>Проверка участника</b> (user_id: <code>${Number(checkUserId)}</code>)
✅ ok: <b>${userOk}</b>   ❌ fail: <b>${userBad}</b>   ⚠️ unknown: <b>${userUnknown}</b>

${userLines.join('\n')}`
  : '';

  const text =
`${header}${botSection}${userSection}${sponsorNote}

${accessHelpText(botUsername)}`;

  const kb = new InlineKeyboard()
    .text('🔄 Перепроверить', `a:gw_access_recheck|i:${gwId}`)
    .row()
    .text('👤 Проверить меня', `a:gw_access_checkme|i:${gwId}`)
    .text('🔎 Проверить по ID', `a:gw_access_user_prompt|i:${gwId}`)
    .row()
    .text('⬅️ Назад', `a:gw_open|i:${gwId}`);

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });

  await db.auditGiveaway(gwId, g.workspace_id, ownerUserId, 'gw.access_checked', {
    adminCount,
    memberCount,
    noCount,
    errCount,
    total: channels.length,
    checkUserId: checkUserId ? Number(checkUserId) : null
  });

  return {
    adminCount,
    memberCount,
    noCount,
    errCount,
    total: channels.length
  };
}
