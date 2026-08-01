import { isCuratorOperationAction } from './policy.js';

function bindDependencies(deps, names) {
  for (const name of names) {
    if (deps?.[name] === null || deps?.[name] === undefined) {
      throw new Error('curator_domain.missing_dependency:' + name);
    }
  }
  return deps;
}

const REQUIRED_DEPENDENCIES = Object.freeze([
  'BX_HOME',
  'InlineKeyboard',
  'UI_MODES',
  'clearExpectText',
  'db',
  'disableBrandManagerState',
  'escapeHtml',
  'getRoleFlags',
  'invalidateRoleFlagsCache',
  'leadStatusFromCb',
  'navKb',
  'redisHealthOkQuick',
  'renderCuratorGiveawayLog',
  'renderCuratorGiveawayOpen',
  'renderCuratorGiveawayOwnerNotifyQ',
  'renderCuratorGiveawayOwnerNotifySend',
  'renderCuratorGiveawayRemindQ',
  'renderCuratorGiveawayRemindSend',
  'renderCuratorGiveawayStats',
  'renderCuratorHome',
  'renderCuratorInbox',
  'renderMainMenu',
  'renderRecovery',
  'renderRoleHub',
  'reportCopySafetyDiagnostic',
  'resolveBxHomeFromUi',
  'safeEditOrReply',
  'setCuratorMode',
  'setCurGwChecked',
  'setExpectText',
  'setUiMode',
  'wsLabelNice',
]);

export async function handleCuratorOperationsCallback(ctx, p, u, deps = {}) {
  if (!isCuratorOperationAction(p?.a)) return false;
  const bound = bindDependencies(deps, REQUIRED_DEPENDENCIES);
  const {
    BX_HOME,
    InlineKeyboard,
    UI_MODES,
    clearExpectText,
    db,
    disableBrandManagerState,
    escapeHtml,
    getRoleFlags,
    invalidateRoleFlagsCache,
    leadStatusFromCb,
    navKb,
    redisHealthOkQuick,
    renderCuratorGiveawayLog,
    renderCuratorGiveawayOpen,
    renderCuratorGiveawayOwnerNotifyQ,
    renderCuratorGiveawayOwnerNotifySend,
    renderCuratorGiveawayRemindQ,
    renderCuratorGiveawayRemindSend,
    renderCuratorGiveawayStats,
    renderCuratorHome,
    renderCuratorInbox,
    renderMainMenu,
    renderRecovery,
    renderRoleHub,
    reportCopySafetyDiagnostic,
    resolveBxHomeFromUi,
    safeEditOrReply,
    setCuratorMode,
    setCurGwChecked,
    setExpectText,
    setUiMode,
    wsLabelNice,
  } = bound;

  await (async () => {
if (p.a === 'a:cur_mode_set') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const enabled = String(p.v || '0') === '1';
      await setCuratorMode(ctx.from.id, enabled);

      // Curator mode is a creator-side overlay. When enabling it, force creator UI and disable brand-manager state to avoid mixed menus.
      if (enabled) {
        try { await setUiMode(ctx.from.id, UI_MODES.CREATOR); } catch {}
        try { await disableBrandManagerState(ctx.from.id); } catch {}
      }

      const ret = String(p.ret || 'menu');
      const flags = await getRoleFlags(u, ctx.from.id);

      // When turning Curator Mode OFF from curator UI — go to Creator main menu (не в старый ws-hub).
      if (!enabled && ret === 'menu') {
        await renderMainMenu(ctx, flags, { edit: true, user: u });
        return;
      }

      // If user wants to stay in curator cabinet — render it. Otherwise go to role hub.
      if (ret === 'cur') {
        if (!flags.isCurator && !flags.isAdmin) {
          await renderRoleHub(ctx, u, flags);
          return;
        }
        await renderCuratorHome(ctx, u.id);
        return;
      }

      await renderRoleHub(ctx, u, flags);
      return;
    }

if (p.a === 'a:cur_home') {
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      const flags = await getRoleFlags(u, ctx.from.id);
      if (!flags.isCurator && !flags.isAdmin) {
        await renderRecovery(ctx, 'role', { backCb: 'a:menu' });
        return;
      }
      await renderCuratorHome(ctx, u.id);
      return;
    }

if (p.a === 'a:cur_inbox') {
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      const flags = await getRoleFlags(u, ctx.from.id);
      if (!flags.isCurator && !flags.isAdmin) {
        await renderRecovery(ctx, 'role', { backCb: 'a:menu' });
        return;
      }
      const st = leadStatusFromCb(String(p.s || 'n'));
      const page = Number(p.p || 0);
      const af = ['all', 'my', 'free'].includes(String(p.af)) ? String(p.af) : 'all';
      await renderCuratorInbox(ctx, u.id, st, page, af);
      return;
    }

if (p.a === 'a:cur_leave_q') {
      await ctx.answerCallbackQuery();
      const flags = await getRoleFlags(u, ctx.from.id);
      if (!flags.isCurator && !flags.isAdmin) {
        await renderRecovery(ctx, 'role', { backCb: 'a:menu' });
        return;
      }
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      if (!wsId) {
        await renderRecovery(ctx, 'channel', { backCb: 'a:cur_home' });
        return;
      }

      // ensure user is actually curator for this workspace
      const items = await db.listCuratorWorkspaces(u.id);
      const ok = items.some(w => Number(w.id) === wsId);
      if (!ok && !flags.isAdmin) {
        await renderRecovery(ctx, 'channel', { backCb: 'a:cur_home' });
        return;
      }

      const ws = await db.getWorkspaceAny(wsId);
      if (!ws) {
        await renderRecovery(ctx, 'channel', { backCb: 'a:cur_home' });
        return;
      }
      const wsTitle = wsLabelNice(ws);
      const kb = new InlineKeyboard()
        .text('✅ Выйти', `a:cur_leave_do|ws:${wsId}`)
        .text('❌ Отмена', `a:cur_ws|ws:${wsId}`);
      await safeEditOrReply(ctx, `❌ <b>Выйти из канала</b>

Ты больше не будешь куратором: <b>${escapeHtml(wsTitle)}</b>

Продолжить?`, {
        parse_mode: 'HTML',
        reply_markup: kb
      });
      return;
    }

if (p.a === 'a:cur_leave_do') {
      const flags = await getRoleFlags(u, ctx.from.id);
      if (!flags.isCurator && !flags.isAdmin) {
        await renderRecovery(ctx, 'role', { backCb: 'a:menu' });
        return;
      }
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      if (!wsId) {
        await renderRecovery(ctx, 'channel', { backCb: 'a:cur_home' });
        return;
      }

      const items = await db.listCuratorWorkspaces(u.id);
      const ok = items.some(w => Number(w.id) === wsId);
      if (!ok && !flags.isAdmin) {
        await renderRecovery(ctx, 'channel', { backCb: 'a:cur_home' });
        return;
      }

      await db.removeCurator(wsId, u.id);
      try { await invalidateRoleFlagsCache(u.id); } catch {}
      await db.auditWorkspace(wsId, u.id, 'ws.curator_left', { curatorUserId: u.id });
      await ctx.answerCallbackQuery({ text: 'Готово' });

      await renderCuratorHome(ctx, u.id);
      return;
    }

if (p.a === 'a:cur_gw_open') {
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      const flags = await getRoleFlags(u, ctx.from.id);
      if (!flags.isCurator && !flags.isAdmin) {
        await renderRecovery(ctx, 'role', { backCb: 'a:menu' });
        return;
      }
      await renderCuratorGiveawayOpen(ctx, u.id, Number(p.ws || 0), Number(p.i || 0));
      return;
    }

if (p.a === 'a:cur_gw_stats') {
      await ctx.answerCallbackQuery();
      const flags = await getRoleFlags(u, ctx.from.id);
      if (!flags.isCurator && !flags.isAdmin) {
        await renderRecovery(ctx, 'role', { backCb: 'a:menu' });
        return;
      }
      await renderCuratorGiveawayStats(ctx, u.id, Number(p.ws || 0), Number(p.i || 0));
      return;
    }

if (p.a === 'a:cur_gw_log') {
      await ctx.answerCallbackQuery();
      const flags = await getRoleFlags(u, ctx.from.id);
      if (!flags.isCurator && !flags.isAdmin) {
        await renderRecovery(ctx, 'role', { backCb: 'a:menu' });
        return;
      }
      await renderCuratorGiveawayLog(ctx, u.id, Number(p.ws || 0), Number(p.i || 0));
      return;
    }

if (p.a === 'a:cur_gw_remind_q') {
      await ctx.answerCallbackQuery();
      const flags = await getRoleFlags(u, ctx.from.id);
      if (!flags.isCurator && !flags.isAdmin) {
        await renderRecovery(ctx, 'role', { backCb: 'a:menu' });
        return;
      }
      await renderCuratorGiveawayRemindQ(ctx, u.id, Number(p.ws || 0), Number(p.i || 0));
      return;
    }

if (p.a === 'a:cur_gw_remind_send') {
      await ctx.answerCallbackQuery();
      const flags = await getRoleFlags(u, ctx.from.id);
      if (!flags.isCurator && !flags.isAdmin) {
        await renderRecovery(ctx, 'role', { backCb: 'a:menu' });
        return;
      }
      await renderCuratorGiveawayRemindSend(ctx, u.id, Number(p.ws || 0), Number(p.i || 0));
      return;
    }

if (p.a === 'a:cur_gw_owner_q') {
      await ctx.answerCallbackQuery();
      const flags = await getRoleFlags(u, ctx.from.id);
      if (!flags.isCurator && !flags.isAdmin) {
        await renderRecovery(ctx, 'role', { backCb: 'a:menu' });
        return;
      }
      await renderCuratorGiveawayOwnerNotifyQ(ctx, u.id, Number(p.ws || 0), Number(p.i || 0));
      return;
    }

if (p.a === 'a:cur_gw_owner_send') {
      await ctx.answerCallbackQuery();
      const flags = await getRoleFlags(u, ctx.from.id);
      if (!flags.isCurator && !flags.isAdmin) {
        await renderRecovery(ctx, 'role', { backCb: 'a:menu' });
        return;
      }
      await renderCuratorGiveawayOwnerNotifySend(ctx, u.id, Number(p.ws || 0), Number(p.i || 0));
      return;
    }

if (p.a === 'a:cur_gw_check_q') {
      await ctx.answerCallbackQuery();
      const flags = await getRoleFlags(u, ctx.from.id);
      if (!flags.isCurator && !flags.isAdmin) {
        await renderRecovery(ctx, 'role', { backCb: 'a:menu' });
        return;
      }
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const gwId = Number(p.i || 0);
      if (!wsId || !gwId) return;

      const kb = new InlineKeyboard()
        .text('✅ Подтвердить', `a:cur_gw_check_do|ws:${wsId}|i:${gwId}`)
        .text('❌ Отмена', `a:cur_gw_open|ws:${wsId}|i:${gwId}`);

      await safeEditOrReply(ctx, `✅ <b>Отметить как проверено?</b>

Это внутренняя отметка для владельца и других кураторов.
Ничего не меняет в конкурсе — только фиксирует “я проверил”.

<b>Что дальше:</b>
• Можно добавить 📝 заметку (next step).
• Или нажать «📩 Владельцу» и отправить апдейт.

Продолжить?`, { parse_mode: 'HTML', reply_markup: kb });
      return;
    }

if (p.a === 'a:cur_gw_check_do') {
      await ctx.answerCallbackQuery();
      const flags = await getRoleFlags(u, ctx.from.id);
      if (!flags.isCurator && !flags.isAdmin) {
        await renderRecovery(ctx, 'role', { backCb: 'a:menu' });
        return;
      }
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const gwId = Number(p.i || 0);
      if (!wsId || !gwId) return;

      const g = await db.getGiveawayForCurator(gwId, u.id);
      if (!g || Number(g.workspace_id) !== wsId) {
        await renderRecovery(ctx, 'giveaway', { backCb: 'a:cur_home' });
        return;
      }

      const meta = {
        by_tg_id: Number(ctx.from.id),
        by_username: ctx.from.username ?? null,
        by_name: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ').trim(),
        at: Date.now()
      };
      await setCurGwChecked(gwId, meta);
      try { await db.auditGiveaway(gwId, Number(g.workspace_id), u.id, 'curator.checked', { by_tg_id: meta.by_tg_id, by_username: meta.by_username }); } catch {}
      await ctx.answerCallbackQuery({ text: '✅ Отмечено' });

      await renderCuratorGiveawayOpen(ctx, u.id, wsId, gwId);
      return;
    }

if (p.a === 'a:cur_gw_note_q') {
      await ctx.answerCallbackQuery();
      const flags = await getRoleFlags(u, ctx.from.id);
      if (!flags.isCurator && !flags.isAdmin) {
        await renderRecovery(ctx, 'role', { backCb: 'a:menu' });
        return;
      }
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const gwId = Number(p.i || 0);
      if (!wsId || !gwId) return;

      const g = await db.getGiveawayForCurator(gwId, u.id);
      if (!g || Number(g.workspace_id) !== wsId) {
        await renderRecovery(ctx, 'giveaway', { backCb: 'a:cur_home' });
        return;
      }

      if (!(await redisHealthOkQuick())) {
        reportCopySafetyDiagnostic('curator_notes_store_unavailable', { workspaceId: wsId, giveawayId: gwId });
        await safeEditOrReply(ctx, '⚠️ Заметки временно недоступны. Попробуй позже.', {
          parse_mode: 'HTML',
          reply_markup: navKb(`a:cur_gw_open|ws:${wsId}|i:${gwId}`)
        });
        return;
      }

      await setExpectText(ctx.from.id, { type: 'curator_note', wsId, gwId });

      const kb = new InlineKeyboard()
        .text('❌ Отмена', `a:cur_note_cancel|ws:${wsId}|i:${gwId}`)
        .row()
        .text('⬅️ Назад', `a:cur_gw_open|ws:${wsId}|i:${gwId}`);

      await safeEditOrReply(ctx, `📝 <b>Заметки к конкурсу #${gwId}</b>

Это внутренние пометки для владельца и кураторов — участникам не показывается.
Примеры: «согласовали приз», «ждём фото», «уточнить условия», «риск/сомнительно».

Пришли заметку одним сообщением (до 400 символов).
Она будет видна владельцу и другим кураторам.

<b>Что дальше:</b>
• После отправки ты вернёшься в конкурс.
• Если нужно — нажми «📩 Владельцу», чтобы отправить владельцу короткий апдейт.

Чтобы отменить — нажми “❌ Отмена”.`, { parse_mode: 'HTML', reply_markup: kb });
      return;
    }

if (p.a === 'a:cur_note_cancel') {
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const gwId = Number(p.i || 0);
      if (!wsId || !gwId) return;
      await renderCuratorGiveawayOpen(ctx, u.id, wsId, gwId);
      return;
    }

    throw new Error('curator_domain.unreachable_operations_action:' + String(p?.a || 'missing'));
  })();
  return true;
}
