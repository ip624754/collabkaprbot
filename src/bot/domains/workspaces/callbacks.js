import { isWorkspaceControlAction, isWorkspaceFolderAction } from './policy.js';

function bindDependencies(deps, names) {
  for (const name of names) {
    if (deps?.[name] === null || deps?.[name] === undefined) {
      throw new Error('workspace_domain.missing_dependency:' + name);
    }
  }
  return deps;
}

const CONTROL_REQUIRED_DEPENDENCIES = Object.freeze([
  'BX_HOME',
  'InlineKeyboard',
  'answerRecovery',
  'clearExpectText',
  'db',
  'escapeHtml',
  'exportWsHistory',
  'getActiveWorkspace',
  'getRoleFlags',
  'invalidateWorkspacesCache',
  'isWorkspaceDisconnected',
  'k',
  'leadStatusFromCb',
  'redis',
  'renderBxOpen',
  'renderCuratorManage',
  'renderCuratorWorkspace',
  'renderNetConfirm',
  'renderRecovery',
  'renderSetupInstructions',
  'renderStaleButton',
  'renderWsDisconnected',
  'renderWsHistory',
  'renderWsInactiveList',
  'renderWsLeadsList',
  'renderWsList',
  'renderWsOpen',
  'renderWsPro',
  'renderWsSettings',
  'resolveBxHomeFromUi',
  'retFromCb',
  'safeEditOrReply',
  'setActiveWorkspace',
  'setExpectText',
]);

export async function handleWorkspaceControlCallback(ctx, p, u, deps = {}) {
  if (!isWorkspaceControlAction(p?.a)) return false;
  const bound = bindDependencies(deps, CONTROL_REQUIRED_DEPENDENCIES);
  const {
    BX_HOME,
    InlineKeyboard,
    answerRecovery,
    clearExpectText,
    db,
    escapeHtml,
    exportWsHistory,
    getActiveWorkspace,
    getRoleFlags,
    invalidateWorkspacesCache,
    isWorkspaceDisconnected,
    k,
    leadStatusFromCb,
    redis,
    renderBxOpen,
    renderCuratorManage,
    renderCuratorWorkspace,
    renderNetConfirm,
    renderRecovery,
    renderSetupInstructions,
    renderStaleButton,
    renderWsDisconnected,
    renderWsHistory,
    renderWsInactiveList,
    renderWsLeadsList,
    renderWsList,
    renderWsOpen,
    renderWsPro,
    renderWsSettings,
    resolveBxHomeFromUi,
    retFromCb,
    safeEditOrReply,
    setActiveWorkspace,
    setExpectText,
  } = bound;

  await (async () => {
    if (p.a === 'a:cur_ws_off') {
      // Backward-compat: old buttons for disabled workspaces.
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
      await renderCuratorWorkspace(ctx, u.id, wsId, { isAdmin: flags.isAdmin });
      return;
    }

    if (p.a === 'a:cur_ws') {
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
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
      await renderCuratorWorkspace(ctx, u.id, wsId, { isAdmin: flags.isAdmin });
      return;
    }

    if (p.a === 'a:ws_leads') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const wsId = Number(p.w || p.ws || 0);
	      if (!wsId) {
	        await renderStaleButton(ctx, { text: '⚠️ Канал не выбран или кнопка устарела. Открой 📋 Меню → «📣 Мои каналы» и выбери канал.', backCb: 'a:ws_list' });
	        return;
	      }

	      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const st = leadStatusFromCb(String(p.s || 'new'));
      const retKey = String(p.ret || retFromCb(p.r) || '').trim();
      await renderWsLeadsList(ctx, u.id, wsId, st, Number(p.p || 0), retKey || null);
      return;
    }

    if (p.a === 'a:setup') {
      await ctx.answerCallbackQuery();
      db.trackEvent('setup_open', { userId: u.id });
      await renderSetupInstructions(ctx);
      await setExpectText(ctx.from.id, { type: 'setup_forward' });
      return;
    }

    if (p.a === 'a:ws_list') {
      await ctx.answerCallbackQuery();
      await renderWsList(ctx, u.id);
      return;
    }

    if (p.a === 'a:ws_list_inactive') {
      await ctx.answerCallbackQuery();
      await renderWsInactiveList(ctx, u.id);
      return;
    }

    if (p.a === 'a:ws_open') {
      await ctx.answerCallbackQuery();
      await renderWsOpen(ctx, u.id, Number(p.ws), { ret: String(p.ret || '') });
      return;
    }

    if (p.a === 'a:ws_settings') {
      await ctx.answerCallbackQuery();
      await renderWsSettings(ctx, u.id, Number(p.ws));
      return;
    }

    if (p.a === 'a:ws_history') {
      await ctx.answerCallbackQuery();
      await renderWsHistory(ctx, u.id, Number(p.ws));
      return;
    }

    if (p.a === 'a:ws_history_export') {
      await ctx.answerCallbackQuery();
      await exportWsHistory(ctx, u.id, Number(p.ws));
      return;
    }

    if (p.a === 'a:ws_pro') {
      await ctx.answerCallbackQuery();
      await renderWsPro(ctx, u.id, Number(p.ws));
      return;
    }

    if (p.a === 'a:ws_pro_pin') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      const isPro = await db.isWorkspacePro(wsId);
      if (!isPro) return ctx.answerCallbackQuery({ text: 'Доступно только в PRO.' });
      const offers = await db.listMyBarterOffers(wsId);
      const kb = new InlineKeyboard();
      for (const o of offers.filter(x => x.status !== 'DELETED')) {
        kb.text(`#${o.id} ${String(o.title || '').slice(0, 30)}`, `a:ws_pro_pin_set|ws:${wsId}|o:${o.id}`).row();
      }
      kb.text('❌ Снять пин', `a:ws_pro_pin_clear|ws:${wsId}`).row();
      kb.text('⬅️ Назад', `a:ws_pro|ws:${wsId}`);
      await safeEditOrReply(ctx, '📌 Выбери оффер для пина в ленте (PRO):', { reply_markup: kb });
      return;
    }

    if (p.a === 'a:ws_pro_pin_set') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      const isPro = await db.isWorkspacePro(wsId);
      if (!isPro) return ctx.answerCallbackQuery({ text: 'Доступно только в PRO.' });
      await db.setWorkspacePinnedOffer(wsId, offerId);
      await db.auditWorkspace(wsId, u.id, 'ws.pro_pinned_offer', { offerId });
      await renderWsPro(ctx, u.id, wsId);
      return;
    }

    if (p.a === 'a:ws_pro_pin_clear') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      await db.setWorkspacePinnedOffer(wsId, null);
      await db.auditWorkspace(wsId, u.id, 'ws.pro_pinned_offer', { offerId: null });
      await renderWsPro(ctx, u.id, wsId);
      return;
    }

    if (p.a === 'a:ws_disconnect_q') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      if (isWorkspaceDisconnected(ws)) {
        await ctx.answerCallbackQuery();
        await renderWsDisconnected(ctx, u.id, wsId, { backCb: 'a:ws_list', source: 'disconnect_confirm' });
        return;
      }
      const kb = new InlineKeyboard()
        .text('✅ Отключить', `a:ws_disconnect_do|ws:${wsId}`)
        .text('❌ Отмена', `a:ws_settings|ws:${wsId}`)
        .row()
        .text('📋 Меню', 'a:menu')
        .text('🏠 Домой', 'a:home');
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, `⛔ <b>Отключить канал</b>

Канал: <b>${escapeHtml(ws.channel_username ? '@' + ws.channel_username : ws.title)}</b>

Что произойдёт:
• канал исчезнет из активного списка
• новые офферы / новые розыгрыши / кураторские действия станут недоступны
• сеть и куратор будут выключены
• профиль, история и прошлые данные сохранятся

Канал можно будет подключить снова позже.`, { parse_mode: 'HTML', reply_markup: kb });
      return;
    }

    if (p.a === 'a:ws_disconnect_do') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      await db.setWorkspaceChannelConnection(wsId, false);
      await db.auditWorkspace(wsId, u.id, 'ws.channel_disconnected', { network_enabled: false, curator_enabled: false });
      await invalidateWorkspacesCache(u.id);
      try {
        const activeWs = await getActiveWorkspace(ctx.from.id);
        if (Number(activeWs || 0) === wsId) await redis.del(k(['active_ws', ctx.from.id]));
      } catch {}
      await ctx.answerCallbackQuery({ text: '⛔ Канал отключён' });
      await renderWsDisconnected(ctx, u.id, wsId, { backCb: 'a:ws_list_inactive', source: 'disconnect_done' });
      return;
    }

    if (p.a === 'a:ws_reconnect_q') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      if (!isWorkspaceDisconnected(ws)) {
        await ctx.answerCallbackQuery();
        await renderWsOpen(ctx, u.id, wsId);
        return;
      }
      const kb = new InlineKeyboard()
        .text('✅ Подключить', `a:ws_reconnect_do|ws:${wsId}`)
        .text('❌ Отмена', `a:ws_open|ws:${wsId}|ret:inactive`)
        .row()
        .text('📋 Меню', 'a:menu')
        .text('🏠 Домой', 'a:home');
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, `🔌 <b>Подключить канал снова</b>

Канал: <b>${escapeHtml(ws.channel_username ? '@' + ws.channel_username : ws.title)}</b>

Что произойдёт:
• канал вернётся в активный список
• профиль и история останутся на месте
• сеть и куратор останутся выключенными — их можно включить отдельно в настройках

Перед продолжением убедись, что бот всё ещё админ в канале.`, { parse_mode: 'HTML', reply_markup: kb });
      return;
    }

    if (p.a === 'a:ws_reconnect_do') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      await db.setWorkspaceChannelConnection(wsId, true);
      await db.auditWorkspace(wsId, u.id, 'ws.channel_reconnected', {});
      await invalidateWorkspacesCache(u.id);
      await setActiveWorkspace(ctx.from.id, wsId);
      await ctx.answerCallbackQuery({ text: '🔌 Канал снова активен' });
      await renderWsOpen(ctx, u.id, wsId);
      return;
    }

    if (p.a === 'a:net_q') {
      const wsId = Number(p.ws);
      const ret = String(p.ret || 'ws');
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      if (isWorkspaceDisconnected(ws)) {
        await ctx.answerCallbackQuery();
        await renderWsDisconnected(ctx, u.id, wsId, { backCb: 'a:ws_list', source: 'network_gate' });
        return;
      }
      await renderNetConfirm(ctx, u.id, wsId, ret);
      return;
    }

    if (p.a === 'a:net_set') {
      const wsId = Number(p.ws);
      const enabled = String(p.v) === '1';
      const ret = String(p.ret || 'ws') === 'bx' ? 'bx' : 'ws';
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      if (isWorkspaceDisconnected(ws)) {
        await ctx.answerCallbackQuery();
        await renderWsDisconnected(ctx, u.id, wsId, { backCb: 'a:ws_list', source: 'network_set' });
        return;
      }

      await db.setWorkspaceSetting(wsId, { network_enabled: enabled });
      await db.auditWorkspace(wsId, u.id, 'ws.network_toggled', { enabled, source: ret });
      await ctx.answerCallbackQuery({ text: enabled ? '✅ Сеть включена' : '❌ Сеть выключена' });
      if (ret === 'bx') {
        await renderBxOpen(ctx, u.id, wsId);
      } else {
        await renderWsSettings(ctx, u.id, wsId);
      }
      return;
    }

    if (p.a === 'a:ws_toggle_net') {
      const wsId = Number(p.ws);
      await renderNetConfirm(ctx, u.id, wsId, 'ws');
      return;
    }

    if (p.a === 'a:ws_toggle_cur') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      if (isWorkspaceDisconnected(ws)) {
        await ctx.answerCallbackQuery();
        await renderWsDisconnected(ctx, u.id, wsId, { backCb: 'a:ws_list', source: 'curator_toggle' });
        return;
      }
      await db.setWorkspaceSetting(wsId, { curator_enabled: !ws.curator_enabled });
      await db.auditWorkspace(wsId, u.id, 'ws.curator_toggled', { enabled: !ws.curator_enabled });
      const ret = String(p.ret || 'ws');
      if (ret === 'cur_manage') {
        await renderCuratorManage(ctx, u.id, wsId);
      } else {
        await renderWsSettings(ctx, u.id, wsId);
      }
      return;
    }

    throw new Error('workspace_domain.unreachable_control_action:' + String(p?.a || 'missing'));
  })();
  return true;
}

const FOLDER_REQUIRED_DEPENDENCIES = Object.freeze([
  'CFG',
  'InlineKeyboard',
  'answerRecovery',
  'db',
  'escapeHtml',
  'getFolderAccess',
  'invalidateRoleFlagsCache',
  'k',
  'navKb',
  'randomToken',
  'redis',
  'renderFolderView',
  'renderFoldersHome',
  'renderFoldersMy',
  'renderWsEditors',
  'safeEditOrReply',
  'setExpectText',
]);

export async function handleWorkspaceFolderCallback(ctx, p, u, deps = {}) {
  if (!isWorkspaceFolderAction(p?.a)) return false;
  const bound = bindDependencies(deps, FOLDER_REQUIRED_DEPENDENCIES);
  const {
    CFG,
    InlineKeyboard,
    answerRecovery,
    db,
    escapeHtml,
    getFolderAccess,
    invalidateRoleFlagsCache,
    k,
    navKb,
    randomToken,
    redis,
    renderFolderView,
    renderFoldersHome,
    renderFoldersMy,
    renderWsEditors,
    safeEditOrReply,
    setExpectText,
  } = bound;

  await (async () => {
    if (p.a === 'a:folders_my') {
      const editorsEnabled = String(CFG.WORKSPACE_EDITORS_ENABLED || '').trim() === '1';
      await ctx.answerCallbackQuery();
      if (!editorsEnabled) {
        const kb = new InlineKeyboard()
          .text('📋 Меню', 'a:menu')
          .text('🏠 Домой', 'a:home');
        await safeEditOrReply(ctx, '📁 <b>Папки</b>\n\nРоль Editors отключена. Папками управляет владелец канала: открой «📣 Мои каналы» → выбери канал → «📁 Папки».', { parse_mode: 'HTML', reply_markup: kb });
        return;
      }
      await renderFoldersMy(ctx, u.id);
      return;
    }

    if (p.a === 'a:folders_home') {
      await ctx.answerCallbackQuery();
      await renderFoldersHome(ctx, u.id, Number(p.ws));
      return;
    }

    if (p.a === 'a:folder_open') {
      await ctx.answerCallbackQuery();
      await renderFolderView(ctx, u.id, Number(p.ws), Number(p.f));
      return;
    }

    if (p.a === 'a:folder_new') {
      const wsId = Number(p.ws);
      const access = await getFolderAccess(u.id, wsId);
      if (!access || !access.canEdit) return answerRecovery(ctx, 'folder');
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, '➕ <b>Новая папка</b>\n\nВведи название папки:', {
        parse_mode: 'HTML',
        reply_markup: navKb(`a:folders_home|ws:${wsId}`)
      });
      await setExpectText(ctx.from.id, { type: 'folder_create_title', wsId });
      return;
    }

    if (p.a === 'a:folder_add') {
      const wsId = Number(p.ws);
      const folderId = Number(p.f);
      const access = await getFolderAccess(u.id, wsId);
      if (!access || !access.canEdit) return answerRecovery(ctx, 'folder');
      const isPro = await db.isWorkspacePro(wsId);
      const max = isPro ? CFG.WORKSPACE_FOLDER_MAX_ITEMS_PRO : CFG.WORKSPACE_FOLDER_MAX_ITEMS_FREE;
      const folder = await db.getChannelFolder(folderId);
      const cnt = Number(folder?.items_count || 0);
      const left = Math.max(0, max - cnt);

      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, `➕ Добавь @каналы (или ссылки t.me) списком — каждый с новой строки.\n\nСвободно мест: <b>${left}</b> из <b>${max}</b>.`, {
        parse_mode: 'HTML',
        reply_markup: navKb(`a:folder_open|ws:${wsId}|f:${folderId}`)
      });
      await setExpectText(ctx.from.id, { type: 'folder_add_items', wsId, folderId });
      return;
    }

    if (p.a === 'a:folder_remove') {
      const wsId = Number(p.ws);
      const folderId = Number(p.f);
      const access = await getFolderAccess(u.id, wsId);
      if (!access || !access.canEdit) return answerRecovery(ctx, 'folder');
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, '➖ Укажи @каналы (или ссылки t.me) списком — удалю их из папки:', {
        reply_markup: navKb(`a:folder_open|ws:${wsId}|f:${folderId}`)
      });
      await setExpectText(ctx.from.id, { type: 'folder_remove_items', wsId, folderId });
      return;
    }

    if (p.a === 'a:folder_rename') {
      const wsId = Number(p.ws);
      const folderId = Number(p.f);
      const access = await getFolderAccess(u.id, wsId);
      if (!access || !access.canEdit) return answerRecovery(ctx, 'folder');
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, '✏️ Введи новое название папки:', {
        reply_markup: navKb(`a:folder_open|ws:${wsId}|f:${folderId}`)
      });
      await setExpectText(ctx.from.id, { type: 'folder_rename_title', wsId, folderId });
      return;
    }

    if (p.a === 'a:folder_clear_q') {
      const wsId = Number(p.ws);
      const folderId = Number(p.f);
      const access = await getFolderAccess(u.id, wsId);
      if (!access || !access.canEdit) return answerRecovery(ctx, 'folder');
      const kb = new InlineKeyboard()
        .text('✅ Очистить', `a:folder_clear_do|ws:${wsId}|f:${folderId}`)
        .text('❌ Отмена', `a:folder_open|ws:${wsId}|f:${folderId}`);
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, 'Очистить папку (удалить все каналы)?', { reply_markup: kb });
      return;
    }

    if (p.a === 'a:folder_clear_do') {
      const wsId = Number(p.ws);
      const folderId = Number(p.f);
      const access = await getFolderAccess(u.id, wsId);
      if (!access || !access.canEdit) return answerRecovery(ctx, 'folder');
      await db.clearChannelFolder(folderId);
      await db.auditWorkspace(wsId, u.id, 'folders.cleared', { folderId });
      await ctx.answerCallbackQuery({ text: 'Очищено.' });
      await renderFolderView(ctx, u.id, wsId, folderId);
      return;
    }

    if (p.a === 'a:folder_delete_q') {
      const wsId = Number(p.ws);
      const folderId = Number(p.f);
      const access = await getFolderAccess(u.id, wsId);
      if (!access || !access.isOwner) return ctx.answerCallbackQuery({ text: 'Только owner.' });
      const kb = new InlineKeyboard()
        .text('🗑 Удалить', `a:folder_delete_do|ws:${wsId}|f:${folderId}`)
        .text('❌ Отмена', `a:folder_open|ws:${wsId}|f:${folderId}`);
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, 'Удалить папку полностью?', { reply_markup: kb });
      return;
    }

    if (p.a === 'a:folder_delete_do') {
      const wsId = Number(p.ws);
      const folderId = Number(p.f);
      const access = await getFolderAccess(u.id, wsId);
      if (!access || !access.isOwner) return ctx.answerCallbackQuery({ text: 'Только owner.' });
      await db.deleteChannelFolder(folderId);
      await db.auditWorkspace(wsId, u.id, 'folders.deleted', { folderId });
      await ctx.answerCallbackQuery({ text: 'Удалено.' });
      await renderFoldersHome(ctx, u.id, wsId);
      return;
    }

    if (p.a === 'a:folder_export') {
      const wsId = Number(p.ws);
      const folderId = Number(p.f);
      const access = await getFolderAccess(u.id, wsId);
      if (!access) return answerRecovery(ctx, 'folder');
      const folder = await db.getChannelFolder(folderId);
      if (!folder || Number(folder.workspace_id) !== Number(wsId)) return ctx.answerCallbackQuery({ text: 'Папка не найдена.' });
      const items = await db.listChannelFolderItems(folderId);
      const lines = items.map(i => i.channel_username);
      const head = `📁 ${folder.title}\n`;
      const payload = head + (lines.length ? lines.join('\n') : '(пусто)');
      await ctx.answerCallbackQuery({ text: 'Отправил списком.' });

      // chunk to avoid Telegram limit
      const maxLen = 3500;
      let buf = '';
      for (const line of payload.split('\n')) {
        if ((buf + line + '\n').length > maxLen) {
          await ctx.reply(buf);
          buf = '';
        }
        buf += line + '\n';
      }
      if (buf.trim()) await ctx.reply(buf.trim());
      return;
    }

    if (p.a === 'a:ws_editors') {
      const editorsEnabled = String(CFG.WORKSPACE_EDITORS_ENABLED || '').trim() === '1';
      if (!editorsEnabled) return ctx.answerCallbackQuery({ text: 'Отключено.' });
      await ctx.answerCallbackQuery();
      await renderWsEditors(ctx, u.id, Number(p.ws));
      return;
    }

    if (p.a === 'a:ws_editor_invite') {
      const editorsEnabled = String(CFG.WORKSPACE_EDITORS_ENABLED || '').trim() === '1';
      if (!editorsEnabled) return ctx.answerCallbackQuery({ text: 'Отключено.' });
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      const token = randomToken(8);
      const key = k(['ws_editor_invite', wsId, token]);
      await redis.set(key, { ownerUserId: u.id }, { ex: Number(CFG.WORKSPACE_EDITOR_INVITE_TTL_MIN || 10) * 60 });

      const link = `https://t.me/${CFG.BOT_USERNAME}?start=fed_${wsId}_${token}`;
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, `👥 <b>Invite editor</b>\n\nСсылка на ${CFG.WORKSPACE_EDITOR_INVITE_TTL_MIN || 10} минут:\n${escapeHtml(link)}\n\nРедактор сможет управлять папками этого Workspace.`, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: navKb(`a:ws_editors|ws:${wsId}`)
      });
      return;
    }

    if (p.a === 'a:ws_editor_add_username') {
      const editorsEnabled = String(CFG.WORKSPACE_EDITORS_ENABLED || '').trim() === '1';
      if (!editorsEnabled) return ctx.answerCallbackQuery({ text: 'Отключено.' });
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, '➕ Введи @username редактора (он должен уже запускать бота /start).', {
        reply_markup: navKb(`a:ws_editors|ws:${wsId}`)
      });
      await setExpectText(ctx.from.id, { type: 'ws_editor_username', wsId });
      return;
    }

    if (p.a === 'a:ws_editor_rm_q') {
      const editorsEnabled = String(CFG.WORKSPACE_EDITORS_ENABLED || '').trim() === '1';
      if (!editorsEnabled) return ctx.answerCallbackQuery({ text: 'Отключено.' });
      const wsId = Number(p.ws);
      const targetUserId = Number(p.u);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');

      const kb = new InlineKeyboard()
        .text('✅ Удалить', `a:ws_editor_rm_do|ws:${wsId}|u:${targetUserId}`)
        .text('❌ Отмена', `a:ws_editors|ws:${wsId}`);
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, 'Удалить редактора?', { reply_markup: kb });
      return;
    }

    if (p.a === 'a:ws_editor_rm_do') {
      const editorsEnabled = String(CFG.WORKSPACE_EDITORS_ENABLED || '').trim() === '1';
      if (!editorsEnabled) return ctx.answerCallbackQuery({ text: 'Отключено.' });
      const wsId = Number(p.ws);
      const targetUserId = Number(p.u);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      await db.removeWorkspaceEditor(wsId, targetUserId);
      try { await invalidateRoleFlagsCache(targetUserId); } catch {}
      await db.auditWorkspace(wsId, u.id, 'ws.editor_removed', { userId: targetUserId });
      await ctx.answerCallbackQuery({ text: 'Удалено.' });
      await renderWsEditors(ctx, u.id, wsId);
      return;
    }

    throw new Error('workspace_domain.unreachable_folder_action:' + String(p?.a || 'missing'));
  })();
  return true;
}
