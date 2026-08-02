import { isUserSharingAction } from './policy.js';

function bindDependencies(deps, names) {
  for (const name of names) {
    if (deps?.[name] === null || deps?.[name] === undefined) {
      throw new Error('user_services_domain.missing_dependency:' + name);
    }
  }
  return deps;
}

const REQUIRED_DEPENDENCIES = Object.freeze([
  'botUsernameNoAt',
  'copySafetyRecoveryKb',
  'copySafetyUnavailableHtml',
  'db',
  'inviteKeyboardMarkup',
  'inviteRedeemConfirmKeyboard',
  'inviteRedeemOption',
  'inviteRedeemSuccessKeyboard',
  'inviteRewardsCenterKeyboard',
  'loadInviteHistoryStateForUser',
  'loadInviteSurfaceStateForUser',
  'renderInviteHistoryKeyboard',
  'renderInviteHistoryText',
  'renderInviteLinkKeyboard',
  'renderInviteLinkText',
  'renderInvitePerformanceKeyboard',
  'renderInvitePerformanceText',
  'renderInvitePointsKeyboard',
  'renderInvitePointsText',
  'renderInviteRedeemConfirmText',
  'renderInviteRedeemSuccessText',
  'renderInviteRewardsCenterText',
  'renderInviteText',
  'reportCopySafetyDiagnostic',
  'safeEditOrReply',
  'sendInviteCardMessage',
]);

export async function handleUserSharingCallback(ctx, p, u, deps = {}) {
  if (!isUserSharingAction(p?.a)) return false;
  const bound = bindDependencies(deps, REQUIRED_DEPENDENCIES);
  const {
    botUsernameNoAt,
    copySafetyRecoveryKb,
    copySafetyUnavailableHtml,
    db,
    inviteKeyboardMarkup,
    inviteRedeemConfirmKeyboard,
    inviteRedeemOption,
    inviteRedeemSuccessKeyboard,
    inviteRewardsCenterKeyboard,
    loadInviteHistoryStateForUser,
    loadInviteSurfaceStateForUser,
    renderInviteHistoryKeyboard,
    renderInviteHistoryText,
    renderInviteLinkKeyboard,
    renderInviteLinkText,
    renderInvitePerformanceKeyboard,
    renderInvitePerformanceText,
    renderInvitePointsKeyboard,
    renderInvitePointsText,
    renderInviteRedeemConfirmText,
    renderInviteRedeemSuccessText,
    renderInviteRewardsCenterText,
    renderInviteText,
    reportCopySafetyDiagnostic,
    safeEditOrReply,
    sendInviteCardMessage,
  } = bound;

  await (async () => {
    if (p.a === 'a:share') {
      try { await ctx.answerCallbackQuery(); } catch {}

      const un = botUsernameNoAt();
      if (!un) {
        reportCopySafetyDiagnostic('invite_bot_username_missing', { config: 'BOT_USERNAME' });
        await safeEditOrReply(ctx, copySafetyUnavailableHtml('Приглашения временно недоступны'), {
          parse_mode: 'HTML',
          reply_markup: copySafetyRecoveryKb('a:menu'),
        });
        return;
      }

      const inviteState = await loadInviteSurfaceStateForUser(u);
      const text = renderInviteText({ inviteState });
      await safeEditOrReply(ctx, text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: inviteKeyboardMarkup(inviteState),
      });
      return;
    }

    if (p.a === 'a:share_perf') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const inviteState = await loadInviteSurfaceStateForUser(u);
      await safeEditOrReply(ctx, renderInvitePerformanceText({ inviteState }), {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: renderInvitePerformanceKeyboard(inviteState),
      });
      return;
    }

    if (p.a === 'a:share_points') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const inviteState = await loadInviteSurfaceStateForUser(u);
      await safeEditOrReply(ctx, renderInvitePointsText({ inviteState }), {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: renderInvitePointsKeyboard(inviteState),
      });
      return;
    }

    if (p.a === 'a:share_link') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const inviteState = await loadInviteSurfaceStateForUser(u);
      await ctx.reply(renderInviteLinkText({ inviteState }), {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: renderInviteLinkKeyboard(),
      });
      return;
    }

    if (p.a === 'a:share_card') {
      try { await ctx.answerCallbackQuery({ text: 'Карточка отправлена ниже. Можно переслать дальше.' }); } catch {}
      const inviteState = await loadInviteSurfaceStateForUser(u);
      await sendInviteCardMessage(ctx, inviteState);
      return;
    }

    if (p.a === 'a:share_history') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const { inviteState, history } = await loadInviteHistoryStateForUser(u);
      await safeEditOrReply(ctx, renderInviteHistoryText({ inviteState, history }), {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: renderInviteHistoryKeyboard(inviteState),
      });
      return;
    }

    if (p.a === 'a:share_rewards') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const inviteState = await loadInviteSurfaceStateForUser(u);
      const history = await db.getInviteRewardsRecentHistory(Number(u?.id || 0), 8).catch(() => []);
      await safeEditOrReply(ctx, renderInviteRewardsCenterText({ inviteState, history }), {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: inviteRewardsCenterKeyboard(inviteState),
      });
      return;
    }

    if (p.a === 'a:share_redeem') {
      const reward = inviteRedeemOption(p.r);
      const inviteState = await loadInviteSurfaceStateForUser(u);
      if (!reward) {
        try { await ctx.answerCallbackQuery({ text: 'Награда не найдена.', show_alert: true }); } catch {}
        await safeEditOrReply(ctx, renderInviteText({ inviteState, notice: '⚠️ Награда не найдена.' }), {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: inviteKeyboardMarkup(inviteState),
        });
        return;
      }
      if (!inviteState?.rewards?.enabled) {
        try { await ctx.answerCallbackQuery({ text: 'Баллы пока недоступны.', show_alert: true }); } catch {}
        await safeEditOrReply(ctx, renderInviteText({ inviteState, notice: 'ℹ️ Награды временно недоступны. Попробуй позже или открой поддержку.' }), {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: inviteKeyboardMarkup(inviteState),
        });
        return;
      }
      if (Number(inviteState.rewards.availablePoints || 0) < Number(reward.costPoints || 0)) {
        try { await ctx.answerCallbackQuery({ text: 'Недостаточно баллов.', show_alert: true }); } catch {}
        await safeEditOrReply(ctx, renderInviteText({ inviteState, notice: 'ℹ️ Пока не хватает доступных баллов для этой награды.' }), {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: inviteKeyboardMarkup(inviteState),
        });
        return;
      }
      try { await ctx.answerCallbackQuery(); } catch {}
      await safeEditOrReply(ctx, renderInviteRedeemConfirmText({ reward, rewards: inviteState.rewards }), {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: inviteRedeemConfirmKeyboard(reward.key),
      });
      return;
    }

    if (p.a === 'a:share_redeem_do') {
      const reward = inviteRedeemOption(p.r);
      if (!reward) {
        try { await ctx.answerCallbackQuery({ text: 'Награда не найдена.', show_alert: true }); } catch {}
        return;
      }
      const result = await db.redeemInviteReward(u.id, reward.key).catch((error) => ({ ok: false, reason: String(error?.message || error || 'redeem_failed') }));
      const inviteState = await loadInviteSurfaceStateForUser(u);
      let notice = '⚠️ Награду получить не удалось.';
      if (result?.ok) {
        try { await ctx.answerCallbackQuery({ text: '✅ Награда активирована', show_alert: false }); } catch {}
        await safeEditOrReply(ctx, renderInviteRedeemSuccessText({ reward, rewards: inviteState.rewards, result }), {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: inviteRedeemSuccessKeyboard(),
        });
        return;
      } else if (result?.reason === 'insufficient_points') {
        notice = 'ℹ️ Недостаточно доступных баллов для этой награды.';
        try { await ctx.answerCallbackQuery({ text: 'Недостаточно баллов.', show_alert: true }); } catch {}
      } else if (result?.reason === 'redeem_busy') {
        notice = '⏳ Награда уже активируется. Подожди пару секунд и обнови экран.';
        try { await ctx.answerCallbackQuery({ text: 'Награда уже активируется.', show_alert: true }); } catch {}
      } else if (result?.reason === 'invite_rewards_schema_missing') {
        notice = 'ℹ️ Награды временно недоступны. Попробуй позже или открой поддержку.';
        reportCopySafetyDiagnostic('invite_rewards_schema_missing', { relation: 'invite_reward_ledger' });
        try { await ctx.answerCallbackQuery({ text: 'Награды временно недоступны.', show_alert: true }); } catch {}
      } else {
        reportCopySafetyDiagnostic('invite_reward_redeem_failed', { reason: String(result?.reason || 'redeem_failed').slice(0, 120) });
        notice = '⚠️ Награду получить не удалось. Попробуй позже или открой поддержку.';
        try { await ctx.answerCallbackQuery({ text: 'Награду получить не удалось.', show_alert: true }); } catch {}
      }
      await safeEditOrReply(ctx, renderInviteText({ inviteState, notice }), {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: inviteKeyboardMarkup(inviteState),
      });
      return;
    }
  })();
  return true;
}
