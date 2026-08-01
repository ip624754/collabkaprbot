import { isCuratorManagementAction } from './policy.js';

function bindDependencies(deps, names) {
  for (const name of names) {
    if (deps?.[name] === null || deps?.[name] === undefined) {
      throw new Error('curator_domain.missing_dependency:' + name);
    }
  }
  return deps;
}

const REQUIRED_DEPENDENCIES = Object.freeze([
  'CFG',
  'InlineKeyboard',
  'answerRecovery',
  'db',
  'escapeHtml',
  'invalidateRoleFlagsCache',
  'isWorkspaceDisconnected',
  'k',
  'leadStatusFromCb',
  'randomToken',
  'redis',
  'redisHealthOkQuick',
  'renderCuratorAudit',
  'renderCuratorList',
  'renderCuratorManage',
  'renderWsDisconnected',
  'reportCopySafetyDiagnostic',
  'retFromCb',
  'safeEditOrReply',
  'setExpectText',
  'wsLabelNice',
]);

export async function handleCuratorManagementCallback(ctx, p, u, deps = {}) {
  if (!isCuratorManagementAction(p?.a)) return false;
  const bound = bindDependencies(deps, REQUIRED_DEPENDENCIES);
  const {
    CFG,
    InlineKeyboard,
    answerRecovery,
    db,
    escapeHtml,
    invalidateRoleFlagsCache,
    isWorkspaceDisconnected,
    k,
    leadStatusFromCb,
    randomToken,
    redis,
    redisHealthOkQuick,
    renderCuratorAudit,
    renderCuratorList,
    renderCuratorManage,
    renderWsDisconnected,
    reportCopySafetyDiagnostic,
    retFromCb,
    safeEditOrReply,
    setExpectText,
    wsLabelNice,
  } = bound;

  await (async () => {
if (p.a === 'a:cur_manage') {
	  const wsId = Number(p.ws);
	  const ws = await db.getWorkspace(u.id, wsId);
	  if (!ws) return answerRecovery(ctx, 'channel');
	  await ctx.answerCallbackQuery();
	  if (isWorkspaceDisconnected(ws)) {
	    await renderWsDisconnected(ctx, u.id, wsId, { backCb: 'a:ws_list', source: 'curator_manage' });
	    return;
	  }
	  await renderCuratorManage(ctx, u.id, wsId);
	  return;
	}

if (p.a === 'a:cur_invite') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');

      if (!(await redisHealthOkQuick())) {
        await ctx.answerCallbackQuery();
        reportCopySafetyDiagnostic('curator_invite_store_unavailable', { workspaceId: wsId });
        await safeEditOrReply(ctx, '⚠️ Приглашение временно недоступно. Попробуй позже.', {
          reply_markup: new InlineKeyboard()
            .text('⬅️ Назад', `a:cur_manage|ws:${wsId}`)
            .text('📋 Меню', 'a:menu')
            .text('🏠 Домой', 'a:home')
        });
        return;
      }

      const token = randomToken(8);
      const key = k(['cur_invite', wsId, token]);
      await redis.set(key, { ownerUserId: u.id }, { ex: 10 * 60 });

      const link = `https://t.me/${CFG.BOT_USERNAME}?start=cur_${wsId}_${token}`;
      const text = `👤 <b>Приглашение куратора</b>\n\nСсылка (одноразовая • 10 минут):\n${escapeHtml(link)}\n\nНажми “Поделиться” и отправь приглашение нужному человеку.`;

      const shareText = `Приглашение куратора (одноразовая, 10 минут).\nОткрой ссылку: ${link}`;
      // Some Telegram clients ignore share links when `url=` is empty. Use an invisible URL value for broad compatibility.
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent('\u2060')}&text=${encodeURIComponent(shareText)}`;
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: new InlineKeyboard()
          .url('📤 Поделиться', shareUrl)
          .row()
          .text('⬅️ Назад', `a:cur_manage|ws:${wsId}`)
      });
      return;
    }

if (p.a === 'a:cur_add_username') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');

      if (!(await redisHealthOkQuick())) {
        await ctx.answerCallbackQuery();
        reportCopySafetyDiagnostic('curator_username_input_store_unavailable', { workspaceId: wsId });
        await safeEditOrReply(ctx, '⚠️ Добавление куратора временно недоступно. Попробуй позже.', {
          reply_markup: new InlineKeyboard()
            .text('⬅️ Назад', `a:cur_manage|ws:${wsId}`)
            .text('📋 Меню', 'a:menu')
            .text('🏠 Домой', 'a:home')
        });
        return;
      }

      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, '➕ Введи @username куратора (он должен уже запускать бота /start).', {
        reply_markup: new InlineKeyboard()
          .text('⬅️ Назад', `a:cur_manage|ws:${wsId}`)
          .text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home')
      });
      await setExpectText(ctx.from.id, { type: 'curator_username', wsId });
      return;
    }

if (p.a === 'a:cur_list') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      await ctx.answerCallbackQuery();
      await renderCuratorList(ctx, u.id, wsId);
      return;
    }

if (p.a === 'a:cur_audit') {
      const wsId = Number(p.ws);
      const actorUserId = Math.max(0, Number(p.u || 0));
      const leadId = Math.max(0, Number(p.l || 0));
      const page = Math.max(0, Number(p.p || 0));
      const allRoles = Number((p.al ?? p.all) || 0) === 1;
      const backType = String(p.b || 'cm');
      const backStatus = leadStatusFromCb(String(p.s || 'new'));
      const backPage = Math.max(0, Number((p.g ?? p.pg) || 0));
      const retKey = String(p.ret || retFromCb(p.r) || '').trim();

      await ctx.answerCallbackQuery();
      await renderCuratorAudit(ctx, u.id, wsId, {
        actorUserId,
        leadId,
        page,
        allRoles,
        back: { type: backType, status: backStatus, page: backPage, ret: retKey }
      });
      return;
    }

if (p.a === 'a:cur_rm_q') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      const curatorUserId = Number(p.u);
      const ret = String(p.ret || 'list');
      const info = await db.getUserTgIdByUserId(curatorUserId);
      const label = info?.tg_username ? '@' + info.tg_username : 'id:' + (info?.tg_id || curatorUserId);
      const kb = new InlineKeyboard()
        .text('✅ Отозвать', `a:cur_rm_do|ws:${wsId}|u:${curatorUserId}|ret:${ret}`)
        .text('❌ Отмена', ret === 'manage' ? `a:cur_manage|ws:${wsId}` : `a:cur_list|ws:${wsId}`);
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, `Отозвать доступ куратора <b>${escapeHtml(label)}</b>?`, { parse_mode: 'HTML', reply_markup: kb });
      return;
    }

if (p.a === 'a:cur_rm_do') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      const curatorUserId = Number(p.u);
      const ret = String(p.ret || 'list');
      await db.removeCurator(wsId, curatorUserId);
      try { await invalidateRoleFlagsCache(curatorUserId); } catch {}
      await db.auditWorkspace(wsId, u.id, 'ws.curator_removed', { curatorUserId });

      // best-effort notify curator in DM
      try {
        const info = await db.getUserTgIdByUserId(curatorUserId);
        if (info?.tg_id) {
          const wsTitle = wsLabelNice(ws);
          // navlint: ignore — recipient DM notification intentionally offers Menu + Support only.
          const kb = new InlineKeyboard()
            .text('📋 Меню', 'a:menu')
            .row()
            .text('💬 Поддержка', 'a:support');
          await ctx.api.sendMessage(
            Number(info.tg_id),
            `❌ Твоя роль <b>куратора</b> для: <b>${escapeHtml(wsTitle)}</b> была удалена владельцем.`,
            { parse_mode: 'HTML', reply_markup: kb }
          );
        }
      } catch {}

      await ctx.answerCallbackQuery({ text: 'Готово' });
      if (ret === 'manage') {
        await renderCuratorManage(ctx, u.id, wsId, { notice: 'Доступ куратора отозван' });
      } else {
        await renderCuratorList(ctx, u.id, wsId, { notice: 'Куратор отозван' });
      }
      return;
    }

    throw new Error('curator_domain.unreachable_management_action:' + String(p?.a || 'missing'));
  })();
  return true;
}
