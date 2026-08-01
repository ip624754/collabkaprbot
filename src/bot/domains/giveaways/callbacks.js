import { GIVEAWAY_ACTION } from './actions.js';
import {
  isGiveawayAccessAction,
  isGiveawayLifecycleAction,
  isGiveawayParticipantAction,
} from './policy.js';

function requireFunction(deps, name) {
  const value = deps?.[name];
  if (typeof value !== 'function') {
    throw new Error(`giveaway_domain.missing_dependency:${name}`);
  }
  return value;
}

function requireValue(deps, name) {
  const value = deps?.[name];
  if (value === null || value === undefined) {
    throw new Error(`giveaway_domain.missing_dependency:${name}`);
  }
  return value;
}

function requireContext(ctx, u) {
  const ownerUserId = Number(u?.id || 0);
  const telegramUserId = Number(ctx?.from?.id || 0);
  if (!ownerUserId || !telegramUserId) {
    throw new Error('giveaway_domain.invalid_context');
  }
  return { ownerUserId, telegramUserId };
}

async function renderParticipantState(ctx, deps, g, entry, options) {
  const renderParticipantScreen = requireFunction(deps, 'renderParticipantScreen');
  const participantKb = requireFunction(deps, 'participantKb');
  const safeEditOrReply = requireFunction(deps, 'safeEditOrReply');
  const screen = renderParticipantScreen(g, entry, options);
  const kb = participantKb(Number(g.id), entry, options);
  try {
    await safeEditOrReply(ctx, screen, { parse_mode: 'HTML', reply_markup: kb });
  } catch {
    await ctx.reply(screen, { parse_mode: 'HTML', reply_markup: kb });
  }
}

export async function handleGiveawayAccessCallback(ctx, p, u, deps = {}) {
  const action = String(p?.a || '').trim();
  if (!isGiveawayAccessAction(action)) return false;

  const gwId = Number(p?.i || 0);
  const { ownerUserId } = requireContext(ctx, u);
  if (!gwId) throw new Error('giveaway_domain.invalid_giveaway_id');

  const renderGwAccess = requireFunction(deps, 'renderGwAccess');
  const redis = requireValue(deps, 'redis');
  const db = requireValue(deps, 'db');
  const safeEditOrReply = deps?.safeEditOrReply;

  if (action === GIVEAWAY_ACTION.ACCESS) {
    await renderGwAccess({ ctx, gwId, ownerUserId, redis, db, safeEditOrReply, forceRecheck: false });
    return true;
  }

  if (action === GIVEAWAY_ACTION.ACCESS_RECHECK) {
    await renderGwAccess({ ctx, gwId, ownerUserId, redis, db, safeEditOrReply, forceRecheck: true });
    return true;
  }

  if (action === GIVEAWAY_ACTION.ACCESS_CHECK_ME) {
    await renderGwAccess({
      ctx,
      gwId,
      ownerUserId,
      redis,
      db,
      safeEditOrReply,
      forceRecheck: true,
      checkUserId: Number(ctx.from.id),
    });
    return true;
  }

  if (action === GIVEAWAY_ACTION.ACCESS_USER_PROMPT) {
    const navKb = requireFunction(deps, 'navKb');
    const setExpectText = requireFunction(deps, 'setExpectText');
    const editOrReply = requireFunction(deps, 'safeEditOrReply');
    await editOrReply(
      ctx,
      `🧩 <b>Проверка участника</b>\n\nПришли <b>user_id</b> цифрами.\n\nПример: <code>123456789</code>`,
      { parse_mode: 'HTML', reply_markup: navKb(`a:gw_access|i:${gwId}`) }
    );
    await setExpectText(ctx.from.id, { type: 'gw_access_userid', gwId });
    return true;
  }

  throw new Error(`giveaway_domain.unreachable_access_action:${action}`);
}

export async function handleGiveawayParticipantCallback(ctx, p, u, deps = {}) {
  const action = String(p?.a || '').trim();
  if (!isGiveawayParticipantAction(action)) return false;

  const { ownerUserId, telegramUserId } = requireContext(ctx, u);
  const gwId = Number(p?.i || 0);
  if (!gwId) throw new Error('giveaway_domain.invalid_giveaway_id');

  const db = requireValue(deps, 'db');
  const gwEffectiveStatusValue = requireFunction(deps, 'gwEffectiveStatusValue');
  const safeEditOrReply = requireFunction(deps, 'safeEditOrReply');
  const renderParticipantScreen = requireFunction(deps, 'renderParticipantScreen');
  const participantKb = requireFunction(deps, 'participantKb');
  const isPub = String(p?.pub || '') === '1';

  const g = await db.getGiveawayInfoForUser(gwId);
  if (!g) {
    await ctx.answerCallbackQuery({ text: 'Конкурс не найден.' });
    return true;
  }

  const status = gwEffectiveStatusValue(g);
  const ended = ['ENDED', 'WINNERS_DRAWN', 'RESULTS_PUBLISHED', 'CANCELLED'].includes(status);

  if (ended) {
    const sponsors = await db.listGiveawaySponsors(gwId);
    const entry = await db.getEntryStatus(gwId, ownerUserId);
    await ctx.answerCallbackQuery({ text: 'Конкурс уже завершён.' });
    const screen = renderParticipantScreen(g, entry, { hint: true, sponsors });
    const kb = participantKb(gwId, entry, { pub: isPub, ended: true });
    try {
      await safeEditOrReply(ctx, screen, { parse_mode: 'HTML', reply_markup: kb });
    } catch {
      await ctx.reply(screen, { parse_mode: 'HTML', reply_markup: kb });
    }
    return true;
  }

  if (action === GIVEAWAY_ACTION.JOIN) {
    await db.upsertGiveawayEntry(gwId, ownerUserId);
    await db.auditGiveaway(gwId, g.workspace_id, ownerUserId, 'gw.joined', { from: 'button' });
    const sponsors = await db.listGiveawaySponsors(gwId);
    const entry = await db.getEntryStatus(gwId, ownerUserId);
    await ctx.answerCallbackQuery({ text: '🎟 Участие записано' });
    const screen = renderParticipantScreen(g, entry, { hint: true, sponsors });
    const kb = participantKb(gwId, entry, { pub: isPub });
    try {
      await safeEditOrReply(ctx, screen, { parse_mode: 'HTML', reply_markup: kb });
    } catch {
      await ctx.reply(screen, { parse_mode: 'HTML', reply_markup: kb });
    }
    return true;
  }

  if (action === GIVEAWAY_ACTION.CHECK) {
    await db.upsertGiveawayEntry(gwId, ownerUserId);
    const entryBefore = await db.getEntryStatus(gwId, ownerUserId);
    const sponsors = await db.listGiveawaySponsors(gwId);

    await ctx.answerCallbackQuery({ text: '⏳ Проверяю…' });
    try {
      const text = renderParticipantScreen(g, entryBefore, { checking: true, sponsors });
      await safeEditOrReply(ctx, text, {
        parse_mode: 'HTML',
        reply_markup: participantKb(gwId, entryBefore, { pub: isPub }),
      });
    } catch {}

    const doEligibilityCheck = requireFunction(deps, 'doEligibilityCheck');
    const check = await doEligibilityCheck(ctx, gwId, telegramUserId);
    await db.setEntryEligibility(gwId, ownerUserId, check.isEligible);
    await db.auditGiveaway(gwId, g.workspace_id, ownerUserId, 'gw.checked', {
      isEligible: check.isEligible,
      unknown: check.unknown,
      results: check.results,
    });

    try {
      const entry = await db.getEntryStatus(gwId, ownerUserId);
      const text = renderParticipantScreen(g, entry, { hint: true, sponsors, elig: check });
      await safeEditOrReply(ctx, text, {
        parse_mode: 'HTML',
        reply_markup: participantKb(gwId, entry, {
          pub: isPub,
          blocker: check.firstBlocker,
          firstBlockerHandle: check.firstBlockerHandle,
        }),
      });
    } catch {
      const message = check.isEligible ? '✅ Участие подтверждено!' : '⚠️ Пока не подтверждено.';
      await ctx.reply(
        message + (check.unknown
          ? '\n\n💡 Если бот не может проверить — попроси админа добавить бота в канал-спонсор.'
          : '')
      );
    }
    return true;
  }

  throw new Error(`giveaway_domain.unreachable_participant_action:${action}`);
}

export async function handleGiveawayLifecycleCallback(ctx, p, u, deps = {}) {
  const action = String(p?.a || '').trim();
  if (!isGiveawayLifecycleAction(action)) return false;

  const { ownerUserId } = requireContext(ctx, u);
  const gwId = Number(p?.i || 0);
  if (!gwId) throw new Error('giveaway_domain.invalid_giveaway_id');

  const db = requireValue(deps, 'db');
  const answerRecovery = requireFunction(deps, 'answerRecovery');
  const renderGwOpen = requireFunction(deps, 'renderGwOpen');
  const gwEffectiveStatusValue = requireFunction(deps, 'gwEffectiveStatusValue');

  if (action === GIVEAWAY_ACTION.END_NOW) {
    const g = await db.getGiveawayForOwner(gwId, ownerUserId);
    if (!g) {
      await answerRecovery(ctx, 'giveaway');
      return true;
    }
    const InlineKeyboard = requireValue(deps, 'InlineKeyboard');
    const safeEditOrReply = requireFunction(deps, 'safeEditOrReply');
    const kb = new InlineKeyboard()
      .text('✅ Завершить', `a:gw_end_do|i:${gwId}`)
      .text('❌ Отмена', `a:gw_open|i:${gwId}`);
    await ctx.answerCallbackQuery();
    await safeEditOrReply(ctx, '🏁 Завершить конкурс сейчас?', { reply_markup: kb });
    return true;
  }

  if (action === GIVEAWAY_ACTION.END_DO) {
    const g = await db.getGiveawayForOwner(gwId, ownerUserId);
    if (!g) {
      await answerRecovery(ctx, 'giveaway');
      return true;
    }
    const previousStatus = String(g.status || '').toUpperCase();
    const ended = await db.atomicEndGiveaway(gwId);
    if (ended) {
      await db.auditGiveaway(gwId, g.workspace_id, ownerUserId, 'gw.ended', { manual: true });
      const notifyGiveawayEnded = requireFunction(deps, 'notifyGiveawayEnded');
      try {
        if (!['ENDED', 'WINNERS_DRAWN', 'RESULTS_PUBLISHED'].includes(previousStatus)) {
          await notifyGiveawayEnded({ api: ctx.api, db, g, reason: 'manual_end', skipOwner: true });
        }
      } catch {}
      await ctx.answerCallbackQuery({ text: 'Завершен' });
    } else {
      await ctx.answerCallbackQuery({ text: 'Уже завершен' });
    }
    await renderGwOpen(ctx, ownerUserId, gwId);
    return true;
  }

  if (action === GIVEAWAY_ACTION.WINNERS_VIEW) {
    const renderGwWinnersView = requireFunction(deps, 'renderGwWinnersView');
    await ctx.answerCallbackQuery();
    await renderGwWinnersView(ctx, ownerUserId, gwId);
    return true;
  }

  if (action === GIVEAWAY_ACTION.DRAW_NOW) {
    const g = await db.getGiveawayForOwner(gwId, ownerUserId);
    if (!g) {
      await answerRecovery(ctx, 'giveaway');
      return true;
    }

    const effectiveStatus = gwEffectiveStatusValue(g);
    const rawStatus = String(g.status || '').toUpperCase();
    const alreadyDrawn = rawStatus === 'WINNERS_DRAWN' || rawStatus === 'RESULTS_PUBLISHED' || !!g.winners_drawn_at;
    const safeEditOrReply = requireFunction(deps, 'safeEditOrReply');
    const navKb = requireFunction(deps, 'navKb');
    const InlineKeyboard = requireValue(deps, 'InlineKeyboard');

    await ctx.answerCallbackQuery();
    if (alreadyDrawn) {
      await safeEditOrReply(ctx, '🏆 Победители уже выбраны.', {
        reply_markup: navKb(`a:gw_open|i:${gwId}`),
      });
      return true;
    }

    if (effectiveStatus !== 'ENDED') {
      const kb = new InlineKeyboard()
        .text('🏁 Завершить', `a:gw_end_now|i:${gwId}`)
        .row()
        .text('⬅️ Назад', `a:gw_open|i:${gwId}`)
        .row()
        .text('📋 Меню', 'a:menu')
        .text('🏠 Домой', 'a:home');
      await safeEditOrReply(
        ctx,
        `⛔️ Сначала нужно <b>завершить</b> конкурс (🏁) или дождаться дедлайна.\n\nПосле завершения появится кнопка <b>«🏆 Выбрать победителей»</b>.`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
      return true;
    }

    const kb = new InlineKeyboard()
      .text('🏆 Выбрать', `a:gw_draw_do|i:${gwId}`)
      .text('❌ Отмена', `a:gw_open|i:${gwId}`)
      .row()
      .text('🧾 Лог', `a:gw_log|i:${gwId}`)
      .row()
      .text('📋 Меню', 'a:menu')
      .text('🏠 Домой', 'a:home');

    await safeEditOrReply(
      ctx,
      `🏆 <b>Выбрать победителей?</b>\n\nКак выбираем:\n• сначала из <b>eligible</b> (кто прошёл проверку)\n• если eligible мало — добираем из всех участников\n• выбор <b>детерминирован</b> (seed от конкурса + дедлайна), чтобы было честно и повторяемо\n\nДальше можно будет нажать <b>«📣 Опубликовать итоги»</b>.`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
    return true;
  }

  if (action === GIVEAWAY_ACTION.DRAW_DO) {
    const initial = await db.getGiveawayForOwner(gwId, ownerUserId);
    if (!initial) {
      await answerRecovery(ctx, 'giveaway');
      return true;
    }

    const key = requireFunction(deps, 'key');
    const acquireLock = requireFunction(deps, 'acquireLock');
    const releaseLock = requireFunction(deps, 'releaseLock');
    const lockKey = key(['lock', 'gw_draw', gwId]);
    const lock = await acquireLock(lockKey, 30);
    if (!lock) {
      await ctx.answerCallbackQuery({ text: 'Секунду… уже выбираю.' });
      return true;
    }

    try {
      const g = await db.getGiveawayForOwner(gwId, ownerUserId);
      if (!g) {
        await answerRecovery(ctx, 'giveaway');
        return true;
      }

      const rawStatus = String(g.status || '').toUpperCase();
      const effectiveStatus = gwEffectiveStatusValue(g);
      const alreadyDrawn = rawStatus === 'WINNERS_DRAWN' || rawStatus === 'RESULTS_PUBLISHED' || !!g.winners_drawn_at;
      if (alreadyDrawn) {
        await ctx.answerCallbackQuery({ text: 'Уже выбраны.' });
        await renderGwOpen(ctx, ownerUserId, gwId);
        return true;
      }

      if (effectiveStatus !== 'ENDED') {
        await ctx.answerCallbackQuery({ text: 'Сначала заверши конкурс.' });
        await renderGwOpen(ctx, ownerUserId, gwId);
        return true;
      }

      // Canonical correctness boundary: PostgreSQL transaction + advisory/row locks.
      const result = await db.drawAndFinalizeGiveawayWinnersAtomic(gwId, {
        expectedWorkspaceId: g.workspace_id,
        actorUserId: ownerUserId,
        source: 'manual',
      });
      if (!result) throw new Error('giveaway draw returned no result');

      if (result.status === 'locked') {
        await ctx.answerCallbackQuery({ text: 'Секунду… уже выбираю.' });
        return true;
      }
      if (result.status === 'already_drawn') {
        await ctx.answerCallbackQuery({ text: 'Уже выбраны.' });
        await renderGwOpen(ctx, ownerUserId, gwId);
        return true;
      }
      if (result.status === 'no_entries') {
        const safeEditOrReply = requireFunction(deps, 'safeEditOrReply');
        const navKb = requireFunction(deps, 'navKb');
        await ctx.answerCallbackQuery({ text: 'Нет участников.' });
        await safeEditOrReply(ctx, '⛔️ У конкурса пока нет участников. Победителей выбрать нельзя.', {
          reply_markup: navKb(`a:gw_open|i:${gwId}`),
        });
        return true;
      }
      if (result.status === 'wrong_status') {
        await ctx.answerCallbackQuery({ text: 'Сначала заверши конкурс.' });
        await renderGwOpen(ctx, ownerUserId, gwId);
        return true;
      }
      if (result.status === 'workspace_mismatch' || result.status === 'missing') {
        await answerRecovery(ctx, 'giveaway');
        return true;
      }
      if (result.status !== 'drawn') {
        throw new Error(`unexpected giveaway draw status: ${String(result.status)}`);
      }

      const hasTopup = Number(result.topup_winners || 0) > 0;
      const underfilled = Number(result.winnersUserIds?.length || 0) < Number(result.requested_winners || 0);
      const toast = underfilled
        ? 'Выбраны все доступные участники ✅'
        : hasTopup
          ? 'Победители выбраны (есть добор) ✅'
          : 'Победители выбраны ✅';
      await ctx.answerCallbackQuery({ text: toast });

      const notifyGiveawayWinnersDM = requireFunction(deps, 'notifyGiveawayWinnersDM');
      try { await notifyGiveawayWinnersDM({ api: ctx.api, db, gwId }); } catch {}
      await renderGwOpen(ctx, ownerUserId, gwId);
    } catch (error) {
      const logger = deps?.logger;
      try { logger?.error?.({ error, gwId, actorUserId: ownerUserId }, 'manual giveaway draw failed'); } catch {}
      await ctx.answerCallbackQuery({ text: 'Ошибка выбора.' });
    } finally {
      try { await releaseLock(lockKey, lock?.token); } catch {}
    }
    return true;
  }

  throw new Error(`giveaway_domain.unreachable_lifecycle_action:${action}`);
}
