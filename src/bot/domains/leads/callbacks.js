import {
  isLeadAcquisitionAction,
  isLeadWorkflowAction,
  isLeadAuditAction,
} from './policy.js';

const REQUIRED_DEPENDENCIES = Object.freeze([
  'BX_HOME',
  'CFG',
  'InlineKeyboard',
  'LEAD_NOTE_TEMPLATES',
  'LEAD_STATUSES',
  'answerRecovery',
  'apiFromCtx',
  'brandLeadDialogButtonLabel',
  'brandLeadProfileButtonLabel',
  'brandReplyKb',
  'clearExpectText',
  'clipText',
  'creatorLeadOpenButtonLabel',
  'db',
  'errInfo',
  'escapeHtml',
  'extractLeadNoteTags',
  'getCuratorMode',
  'getExpectText',
  'getLeadForActorSafe',
  'getRoleFlags',
  'isBrandBasicComplete',
  'isSuperAdminTg',
  'leadStatusFromCb',
  'leadStatusToCb',
  'navKb',
  'normLeadNoteTplKey',
  'normLeadStatus',
  'notifyWorkspaceTeam',
  'renderBrandLeadDialog',
  'renderBrandProfileHome',
  'renderCuratorAudit',
  'renderCuratorInbox',
  'renderLeadNotesViewer',
  'renderLeadTemplatePreview',
  'renderLeadTemplates',
  'renderLeadView',
  'renderRecovery',
  'renderStaleButton',
  'renderWsLeadCompose',
  'renderWsLeadsList',
  'renderWsPublicProfile',
  'resolveBxHomeFromUi',
  'retFromCb',
  'retPartShort',
  'safeBrandProfiles',
  'safeEditOrReply',
  'safeLeadWrite',
  'sendLeadTemplateReply',
  'sendMessageWithFallback',
  'setExpectText',
  'withTimeout',
]);

function bindDependencies(deps) {
  for (const name of REQUIRED_DEPENDENCIES) {
    if (deps?.[name] === null || deps?.[name] === undefined) {
      throw new Error('leads_domain.missing_dependency:' + name);
    }
  }
  return deps;
}

export async function handleLeadAcquisitionCallback(ctx, p, u, deps = {}) {
  if (!isLeadAcquisitionAction(p?.a)) return false;
  const bound = bindDependencies(deps);
  const {
  BX_HOME,
  CFG,
  InlineKeyboard,
  LEAD_NOTE_TEMPLATES,
  LEAD_STATUSES,
  answerRecovery,
  apiFromCtx,
  brandLeadDialogButtonLabel,
  brandLeadProfileButtonLabel,
  brandReplyKb,
  clearExpectText,
  clipText,
  creatorLeadOpenButtonLabel,
  db,
  errInfo,
  escapeHtml,
  extractLeadNoteTags,
  getCuratorMode,
  getExpectText,
  getLeadForActorSafe,
  getRoleFlags,
  isBrandBasicComplete,
  isSuperAdminTg,
  leadStatusFromCb,
  leadStatusToCb,
  navKb,
  normLeadNoteTplKey,
  normLeadStatus,
  notifyWorkspaceTeam,
  renderBrandLeadDialog,
  renderBrandProfileHome,
  renderCuratorAudit,
  renderCuratorInbox,
  renderLeadNotesViewer,
  renderLeadTemplatePreview,
  renderLeadTemplates,
  renderLeadView,
  renderRecovery,
  renderStaleButton,
  renderWsLeadCompose,
  renderWsLeadsList,
  renderWsPublicProfile,
  resolveBxHomeFromUi,
  retFromCb,
  retPartShort,
  safeBrandProfiles,
  safeEditOrReply,
  safeLeadWrite,
  sendLeadTemplateReply,
  sendMessageWithFallback,
  setExpectText,
  withTimeout
  } = bound;

  await (async () => {
    if (p.a === 'a:send_request_to_creator') {
      const wsId = Number(p.ws || p.w || p.wsId || 0);
      if (!wsId) {
        try { await ctx.answerCallbackQuery({ text: 'Кнопка устарела. Открой витрину заново.', show_alert: true }); } catch {}
        return;
      }
      // fall-through: reuse a:wsp_lead_new logic
      try { p.a = 'a:wsp_lead_new'; p.ws = wsId; } catch {}
    }
    if (p.a === 'a:wsp_lead_new') {
          const wsId = Number(p.w || p.ws || 0);
    	      if (!wsId) {
    	        await renderStaleButton(ctx, { text: '⚠️ Витрина не найдена или кнопка устарела. Открой витрину заново и попробуй снова.', backCb: 'a:menu' });
    	        return;
    	      }

    	      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);

          // Prevent self-apply and curator-mode confusion (old buttons may still exist)
          const ws = await db.getWorkspaceAny(wsId);
          if (!ws) {
            await answerRecovery(ctx, 'channel', { showAlert: true });
            return;
          }

          const isOwner = Number(u.id) === Number(ws.owner_user_id);

          let curMode = false;
          try {
            const flags = await getRoleFlags(u, ctx.from.id);
            curMode = !!(flags?.isCurator || flags?.isAdmin) && (await getCuratorMode(ctx.from.id));
          } catch {
            curMode = false;
          }

          if (isOwner) {
            await ctx.answerCallbackQuery({
              text: 'Это твоя витрина. Заявку оставляют бренды — поделись ссылкой.',
              show_alert: true
            });
            try {
            await renderWsPublicProfile(ctx, wsId, { backCb: `a:ws_profile|ws:${wsId}` });
          } catch (e) {
            const cid = ctx?.state?.cid || `${ctx?.update?.update_id ?? 0}-${ctx?.from?.id ?? 0}`;
            try { console.warn('[wsp_preview] error', { cid, wsId, err: String(e?.message || e) }); } catch {}
            const kb = new InlineKeyboard().text('↩️ Назад', `a:ws_profile|ws:${wsId}`);
            await safeEditOrReply(ctx, '⚠️ Не удалось открыть предпросмотр. Попробуй ещё раз.', { reply_markup: kb });
          }
            return;
          }

          if (curMode) {
            await ctx.answerCallbackQuery({
              text: 'Ты в режиме куратора. Чтобы оставить заявку как бренд — выйди в обычный режим и переключись в Brand.',
              show_alert: true
            });
            await renderWsPublicProfile(ctx, wsId);
            return;
          }

          // Gate by Brand Profile (basic 3 fields) and skip Step 1 when complete
          if (CFG.BRAND_PROFILE_REQUIRED) {
            const prof = await safeBrandProfiles(() => db.getBrandProfile(u.id), async () => null);
            if (!isBrandBasicComplete(prof)) {
              await ctx.answerCallbackQuery({ text: 'Заполни профиль бренда (4 поля: Название, Ниша, Контакт, Ссылка), чтобы оставить заявку.', show_alert: true });
              await renderBrandProfileHome(ctx, u.id, { wsId, ret: 'lead', edit: true });
              return;
            }

            const contact = String(prof.contact || '').trim().slice(0, 200);
            await ctx.answerCallbackQuery();
            await setExpectText(ctx.from.id, {
              type: 'wsp_lead_step2',
              wsId,
              contact,
              brandName: String(prof.brand_name || '').trim() || null,
              brandLink: String(prof.brand_link || '').trim() || null,
            });
            await renderWsLeadCompose(ctx, wsId, 2, { contact });
            return;
          }

          await ctx.answerCallbackQuery();
          await setExpectText(ctx.from.id, { type: 'wsp_lead_step1', wsId });
          await renderWsLeadCompose(ctx, wsId, 1);
          return;
        }
        if (p.a === 'a:blead_view') {
          await ctx.answerCallbackQuery();
          const leadId = Number(p.id || 0);
          const wsId = Number(p.w || p.ws || 0);
          try {
            const exp = await getExpectText(ctx.from.id);
            if (exp && exp.type === 'blead_reply') await clearExpectText(ctx.from.id);
          } catch {}
          await renderBrandLeadDialog(ctx, u.id, leadId, wsId);
          return;
        }
        if (p.a === 'a:blead_reply') {
          await ctx.answerCallbackQuery();
          const leadId = Number(p.id || 0);
          const wsId = Number(p.w || p.ws || 0);
          if (!leadId) return;

          await setExpectText(ctx.from.id, { type: 'blead_reply', leadId, wsId });

          const kb = new InlineKeyboard()
            .text('❌ Отмена', `a:blead_cancel|id:${leadId}|w:${wsId || 0}`)
            .row()
            .text('📋 Меню', 'a:menu')
            .text('🏠 Домой', 'a:home');

          await safeEditOrReply(
            ctx,
            '✍️ Напиши сообщение креатору. Оно уйдёт в диалог по этой заявке.',
            { parse_mode: 'HTML', reply_markup: kb },
          );
          return;
        }
        if (p.a === 'a:blead_cancel') {
          await ctx.answerCallbackQuery();
          const leadId = Number(p.id || 0);
          const wsId = Number(p.w || p.ws || 0);
          try { await clearExpectText(ctx.from.id); } catch {}
          await renderBrandLeadDialog(ctx, u.id, leadId, wsId);
          return;
        }
  })();
  return true;
}

export async function handleLeadWorkflowCallback(ctx, p, u, deps = {}) {
  if (!isLeadWorkflowAction(p?.a)) return false;
  const bound = bindDependencies(deps);
  const {
  BX_HOME,
  CFG,
  InlineKeyboard,
  LEAD_NOTE_TEMPLATES,
  LEAD_STATUSES,
  answerRecovery,
  apiFromCtx,
  brandLeadDialogButtonLabel,
  brandLeadProfileButtonLabel,
  brandReplyKb,
  clearExpectText,
  clipText,
  creatorLeadOpenButtonLabel,
  db,
  errInfo,
  escapeHtml,
  extractLeadNoteTags,
  getCuratorMode,
  getExpectText,
  getLeadForActorSafe,
  getRoleFlags,
  isBrandBasicComplete,
  isSuperAdminTg,
  leadStatusFromCb,
  leadStatusToCb,
  navKb,
  normLeadNoteTplKey,
  normLeadStatus,
  notifyWorkspaceTeam,
  renderBrandLeadDialog,
  renderBrandProfileHome,
  renderCuratorAudit,
  renderCuratorInbox,
  renderLeadNotesViewer,
  renderLeadTemplatePreview,
  renderLeadTemplates,
  renderLeadView,
  renderRecovery,
  renderStaleButton,
  renderWsLeadCompose,
  renderWsLeadsList,
  renderWsPublicProfile,
  resolveBxHomeFromUi,
  retFromCb,
  retPartShort,
  safeBrandProfiles,
  safeEditOrReply,
  safeLeadWrite,
  sendLeadTemplateReply,
  sendMessageWithFallback,
  setExpectText,
  withTimeout
  } = bound;

  await (async () => {
        if (p.a === 'a:lead_view') {
          try { await ctx.answerCallbackQuery(); } catch {}
          const leadId = Number(p.id || 0);
          if (!leadId) {
            await safeEditOrReply(ctx, '⚠️ Кнопка устарела. Открой 📨 Заявки от брендов и выбери заявку ещё раз.', { reply_markup: navKb('a:menu') });
            return;
          }
          const wsId = Number(p.w || p.ws || 0);
          const st = leadStatusFromCb(String(p.s || 'new'));
          const page = Number(p.p || 0);
          const retKey = String(p.ret || retFromCb(p.r) || '').trim();
          const rPart = retKey ? retPartShort(retKey) : '';
          const af = ['all','my','free'].includes(String(p.af || '')) ? String(p.af) : 'all';
          const backCb = (retKey === 'ci')
            ? `a:cur_inbox|s:${leadStatusToCb(st)}|p:${page}|af:${af}`
            : (wsId ? `a:ws_leads|w:${wsId}|s:${leadStatusToCb(st)}|p:${page}${rPart}` : 'a:menu');
          await safeEditOrReply(ctx, '⏳ Открываю карточку…', { reply_markup: navKb(backCb) });
          try {
            await withTimeout(renderLeadView(ctx, u.id, leadId, { wsId: wsId || null, status: st, page, ret: retKey, af: String(p.af || '') }), 15000, 'lead.view');
          } catch (e) {
            const cid = ctx.state?.cid || null;
            const label = (e && (e.label || e.stepId)) ? String(e.label || e.stepId) : String((e && e.message) ? e.message : 'unknown');
            try { console.warn('[lead_view] timeout/error', { cid, leadId, wsId, label, err: errInfo(e) }); } catch {}
            await safeEditOrReply(ctx, `⚠️ Карточка заявки загружается слишком долго.

    step: ${label}

    cid: ${cid || '—'}`, { reply_markup: navKb(backCb) });
          }
          return;
        }
        if (p.a === 'a:lead_tpls') {
          try { await ctx.answerCallbackQuery(); } catch {}
          const leadId = Number(p.id || 0);
          if (!leadId) {
            await safeEditOrReply(ctx, '⚠️ Кнопка устарела. Открой 📨 Заявки от брендов и выбери заявку ещё раз.', { reply_markup: navKb('a:menu') });
            return;
          }
          const wsId = Number(p.w || p.ws || 0);
          const st = leadStatusFromCb(String(p.s || 'new'));
          const retKey = String(p.ret || retFromCb(p.r) || '').trim();
          await renderLeadTemplates(ctx, u.id, leadId, { wsId: wsId || null, status: st, page: Number(p.p || 0), ret: retKey });
          return;
        }
        if (p.a === 'a:lead_tpl') {
          try { await ctx.answerCallbackQuery(); } catch {}
          const leadId = Number(p.id || 0);
          if (!leadId) {
            await safeEditOrReply(ctx, '⚠️ Кнопка устарела. Открой 📨 Заявки от брендов и выбери заявку ещё раз.', { reply_markup: navKb('a:menu') });
            return;
          }
          const key = String(p.k || 'discuss');
          const wsId = Number(p.w || p.ws || 0);
          const st = leadStatusFromCb(String(p.s || 'new'));
          const page = Number(p.p || 0);
          const retKey = String(p.ret || retFromCb(p.r) || '').trim();
          try {
            await renderLeadTemplatePreview(ctx, u.id, leadId, key, { wsId: wsId || null, status: st, page, ret: retKey });
          } catch (e) {
            try { console.warn('[lead_tpl_preview] unhandled', { leadId, key, cid: ctx.state?.cid || null, err: errInfo(e) }); } catch {}
            const text = '⚠️ Не удалось открыть предпросмотр. Попробуй ещё раз или используй «✍️ Ответить». ';
            const rPart = retKey ? retPartShort(retKey) : '';
            const kb = new InlineKeyboard()
              .text('⬅️ Назад', `a:lead_view|id:${leadId}|w:${wsId || 0}|s:${leadStatusToCb(st)}|p:${page}${rPart}`)
              .text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');
            try { await safeEditOrReply(ctx, text, { reply_markup: kb }); } catch { await ctx.reply(text, { reply_markup: kb }); }
          }
          return;
        }
        if (p.a === 'a:lead_tpl_send') {
          try { await ctx.answerCallbackQuery(); } catch {}
          const leadId = Number(p.id || 0);
          if (!leadId) {
            await safeEditOrReply(ctx, '⚠️ Кнопка устарела. Открой 📨 Заявки от брендов и выбери заявку ещё раз.', { reply_markup: navKb('a:menu') });
            return;
          }
          const key = String(p.k || 'discuss');
          const wsId = Number(p.w || p.ws || 0);
          const st = leadStatusFromCb(String(p.s || 'new'));
          const page = Number(p.p || 0);
          const retKey = String(p.ret || retFromCb(p.r) || '').trim();
          try {
            await sendLeadTemplateReply(ctx, u.id, leadId, key, { wsId: wsId || null, status: st, page, ret: retKey });
          } catch (e) {
            try { console.warn('[lead_tpl_send] unhandled', { leadId, key, cid: ctx.state?.cid || null, err: errInfo(e) }); } catch {}
            const text = '⚠️ Не удалось отправить шаблон. Попробуй ещё раз или используй «✍️ Ответить». ';
            const rPart = retKey ? retPartShort(retKey) : '';
            const kb = new InlineKeyboard()
              .text('⬅️ Назад', `a:lead_view|id:${leadId}|w:${wsId || 0}|s:${leadStatusToCb(st)}|p:${page}${rPart}`)
              .text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');
            try { await safeEditOrReply(ctx, text, { reply_markup: kb }); } catch { await ctx.reply(text, { reply_markup: kb }); }
          }
          return;
        }
    if (p.a === 'a:lead_assign') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const leadId = Number(p.id || 0);
      if (!leadId) return;
      const action = String(p.do || '');
      const lead = await getLeadForActorSafe(ctx, u.id, leadId);
      if (!lead) { try { await answerRecovery(ctx, 'application'); } catch {} return; }
      const wsId = Number(lead.workspace_id);

      // Only curator/owner/admin can assign.
      const isOwner = Number(lead.owner_user_id || 0) === Number(u.id);
      const isAdmin = isSuperAdminTg(ctx.from?.id);
      let isCurator = false;
      if (!isOwner && !isAdmin) {
        try { isCurator = await db.isCuratorForWorkspace(wsId, u.id); } catch {}
      }
      if (!isOwner && !isAdmin && !isCurator) {
        try { await answerRecovery(ctx, 'application'); } catch {}
        return;
      }

      if (action === 'me') {
        // Assign to me — but warn if already assigned to someone else
        if (lead.assigned_user_id && Number(lead.assigned_user_id) !== Number(u.id)) {
          let assignedWho = 'другой куратор';
          try {
            const au = await db.getUserById(Number(lead.assigned_user_id));
            if (au?.tg_username) assignedWho = '@' + au.tg_username;
          } catch {}
          const kb = new InlineKeyboard()
            .text('✅ Всё равно взять', `a:lead_assign|id:${leadId}|w:${wsId}|s:${p.s || 'n'}|p:${p.p || 0}${retPartShort(p.r || '')}|do:force`)
            .text('❌ Отмена', `a:lead_view|id:${leadId}|w:${wsId}|s:${p.s || 'n'}|p:${p.p || 0}${retPartShort(p.r || '')}`);
          await safeEditOrReply(ctx, `⚠️ Заявка #${leadId} уже назначена на <b>${escapeHtml(assignedWho)}</b>.\n\nПерензначить на себя?`, { parse_mode: 'HTML', reply_markup: kb });
          return;
        }
        await db.assignBrandLead(leadId, u.id);
        await db.auditWorkspace(wsId, u.id, 'lead.assigned', { leadId, to: u.id });
        try { await ctx.answerCallbackQuery({ text: '👤 Взял себе' }); } catch {}
      } else if (action === 'force') {
        await db.assignBrandLead(leadId, u.id);
        await db.auditWorkspace(wsId, u.id, 'lead.reassigned', { leadId, to: u.id, from: lead.assigned_user_id });
        try { await ctx.answerCallbackQuery({ text: '👤 Переназначил на себя' }); } catch {}
      } else if (action === 'un') {
        await db.unassignBrandLead(leadId);
        await db.auditWorkspace(wsId, u.id, 'lead.unassigned', { leadId });
        try { await ctx.answerCallbackQuery({ text: '❌ Снял назначение' }); } catch {}
      } else if (action === 're') {
        // Same as 'me' — reassign button for "assigned to other"
        if (lead.assigned_user_id && Number(lead.assigned_user_id) !== Number(u.id)) {
          let assignedWho = 'другой';
          try {
            const au = await db.getUserById(Number(lead.assigned_user_id));
            if (au?.tg_username) assignedWho = '@' + au.tg_username;
          } catch {}
          const kb = new InlineKeyboard()
            .text('✅ Переназначить', `a:lead_assign|id:${leadId}|w:${wsId}|s:${p.s || 'n'}|p:${p.p || 0}${retPartShort(p.r || '')}|do:force`)
            .text('❌ Отмена', `a:lead_view|id:${leadId}|w:${wsId}|s:${p.s || 'n'}|p:${p.p || 0}${retPartShort(p.r || '')}`);
          await safeEditOrReply(ctx, `⚠️ Заявка назначена на <b>${escapeHtml(assignedWho)}</b>. Переназначить?`, { parse_mode: 'HTML', reply_markup: kb });
          return;
        }
        await db.assignBrandLead(leadId, u.id);
        await db.auditWorkspace(wsId, u.id, 'lead.assigned', { leadId, to: u.id });
      }

      // N4: Notify owner that lead was assigned/reassigned
      if (action === 'me' || action === 'force') {
        try {
          const actorName = ctx.from?.username ? '@' + ctx.from.username : `id:${u.id}`;
          const notifText =
            `👤 <b>Заявка #${leadId} взята в работу</b>

    ` +
            `Куратор: <b>${escapeHtml(actorName)}</b>${action === 'force' ? ' (переназначил)' : ''}

    ` +
            `<b>Что дальше:</b>
    ` +
            `• Открой карточку заявки.
    ` +
            `• Если нужно — переназначь куратора в карточке.
    `;
          const notifKb = new InlineKeyboard()
            .text(creatorLeadOpenButtonLabel(leadId), `a:lead_view|id:${leadId}|w:${wsId}|s:n|p:0`)
            .row().text('🗑 Убрать', 'a:nd');
          await notifyWorkspaceTeam(apiFromCtx(ctx), wsId, {
            text: notifText,
            kb: notifKb,
            exclude: new Set([Number(ctx.from?.id || 0)])
          });
        } catch {}
      }

      // Re-render lead view
      const retKey = String(p.ret || p.r || '').trim();
      await renderLeadView(ctx, u.id, leadId, { wsId, status: leadStatusFromCb(p.s || 'n'), page: Number(p.p || 0), ret: retKey });
      return;
    }
    if (p.a === 'a:lead_del_q') {
      await ctx.answerCallbackQuery();
      const leadId = Number(p.id || 0);
      if (!leadId) return;
      const st = p.s || 'n';
      const pg = Number(p.p || 0);
      const rPart = p.ret || p.r ? `|ret:${p.ret || p.r}` : '';
      const wsId = Number(p.w || 0);
      const kb = new InlineKeyboard()
        .text('🗑 Удалить', `a:lead_del_do|id:${leadId}|w:${wsId}|s:${st}|p:${pg}${rPart}`)
        .text('❌ Отмена', `a:lead_view|id:${leadId}|w:${wsId}|s:${st}|p:${pg}${rPart}`);
      await safeEditOrReply(ctx, '🗑 Удалить заявку из списка?\n\nОтправитель не узнает.', { reply_markup: kb });
      return;
    }
    if (p.a === 'a:lead_del_do') {
      await ctx.answerCallbackQuery();
      const leadId = Number(p.id || 0);
      if (!leadId) return;
      const lead = await getLeadForActorSafe(ctx, u.id, leadId);
      if (!lead) { try { await answerRecovery(ctx, 'application'); } catch {} return; }
      const wsIdReal = Number(lead.workspace_id);

      // Soft delete is global (deleted_by_user_ids affects team listing) — restrict to curator/owner/admin.
      const isOwner = Number(lead.owner_user_id || 0) === Number(u.id);
      const isAdmin = isSuperAdminTg(ctx.from?.id);
      let isCurator = false;
      if (!isOwner && !isAdmin) {
        try { isCurator = await db.isCuratorForWorkspace(wsIdReal, u.id); } catch {}
      }
      if (!isOwner && !isAdmin && !isCurator) {
        try { await answerRecovery(ctx, 'application'); } catch {}
        return;
      }

      await db.softDeleteBrandLead(leadId, u.id);
      await ctx.answerCallbackQuery({ text: '🗑 Заявка удалена' });
      const retKey = String(p.ret || p.r || '').trim();
      if (retKey === 'ci') {
        await renderCuratorInbox(ctx, u.id, leadStatusFromCb(p.s || 'n'), Number(p.p || 0));
      } else {
        await renderWsLeadsList(ctx, u.id, wsIdReal, leadStatusFromCb(p.s || 'n'), Number(p.p || 0));
      }
      return;
    }
    if (p.a === 'a:lead_set') {
          const leadId = Number(p.id || 0);
          if (!leadId) {
            await safeEditOrReply(ctx, '⚠️ Кнопка устарела. Открой 📨 Заявки от брендов и выбери заявку ещё раз.', { reply_markup: navKb('a:menu') });
            return;
          }
          const lead = await getLeadForActorSafe(ctx, u.id, leadId);
          if (!lead) {
            await safeEditOrReply(ctx, '⚠️ Заявка не найдена. Открой 📨 Заявки от брендов и выбери заявку ещё раз.', { reply_markup: navKb('a:menu') });
            return;
          }
          const wsId = Number(lead.workspace_id);
          const ws = await db.getWorkspaceAny(wsId);
          if (!ws) {
            await safeEditOrReply(ctx, '⚠️ Канал не найден. Открой 📋 Меню и выбери канал заново.', { reply_markup: navKb('a:menu') });
            return;
          }
          const isOwner = Number(ws.owner_user_id) === Number(u.id);
          const isAdmin = isSuperAdminTg(ctx.from?.id);
          let isCurator = false;
          if (!isOwner && !isAdmin) {
            try { isCurator = await db.isCuratorForWorkspace(wsId, u.id); } catch {}
          }
          if (!isOwner && !isAdmin && !isCurator) {
            await renderRecovery(ctx, 'application', { backCb: 'a:menu' });
            return;
          }

          const st = leadStatusFromCb(String(p.st || 'new'));
          const backWsId = Number(p.w || p.ws || 0);
          const backStatus = leadStatusFromCb(String(p.s || 'new'));
          const backPage = Number(p.p || 0);
          const retKey = String(p.ret || retFromCb(p.r) || '').trim();
          let updated = null;

          // If curator (not owner/admin), record meta so owner can see performance.
          const isCuratorActor = isCurator && !isOwner && !isAdmin;
          if (isCuratorActor && st === 'in_progress') {
            updated = await safeLeadWrite(() => db.markBrandLeadTakenInWork(leadId, Number(u.id)), { op: 'lead_taken', leadId });
          } else if (isCuratorActor && st === 'closed') {
            updated = await safeLeadWrite(() => db.markBrandLeadClosedBy(leadId, Number(u.id)), { op: 'lead_closed', leadId });
          } else {
            updated = await safeLeadWrite(() => db.updateBrandLeadStatus(leadId, st), { op: 'lead_status', leadId, st });
          }
          if (!updated) {
            const text = '⚠️ Не удалось обновить статус заявки. Попробуй ещё раз.';
            const rPart = retKey ? retPartShort(retKey) : '';
            const kb = new InlineKeyboard()
              .text('⬅️ Назад', `a:lead_view|id:${leadId}|w:${backWsId || wsId || 0}|s:${leadStatusToCb(backStatus)}|p:${backPage}${rPart}`)
              .text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');
            try { await safeEditOrReply(ctx, text, { reply_markup: kb }); } catch { await ctx.reply(text, { reply_markup: kb }); }
            return;
          }

          // Status-change envelope (for audit + notifications)
          const actorRole = isAdmin ? 'admin' : (isCuratorActor ? 'curator' : 'owner');
          const stBefore = normLeadStatus(lead.status);
          let stAfter = normLeadStatus(st);
          // Curator meta-updates only change from NEW -> IN_PROGRESS, and set CLOSED if not already closed
          if (isCuratorActor && stAfter === 'in_progress' && stBefore !== 'new') stAfter = stBefore;
          if (isCuratorActor && stAfter === 'closed' && stBefore === 'closed') stAfter = stBefore;
          const statusChanged = !!(stAfter && stBefore && stAfter !== stBefore);

          // Brand-side signal (reverse): when owner/curator changes status manually, notify the brand with safe "what next".
          if (statusChanged) {
            try {
              const brandTgId = Number(lead.brand_tg_id || 0);
              if (brandTgId) {
                let brandCredits = 0;
                try {
                  const uid = Number(lead.brand_user_id || 0);
                  if (uid) brandCredits = await db.getBrandCredits(uid);
                  else brandCredits = await db.getBrandCreditsByTgId(brandTgId);
                } catch {}

                const titleBefore = (LEAD_STATUSES[normLeadStatus(stBefore)] || {}).title || String(stBefore);
                const titleAfter = (LEAD_STATUSES[normLeadStatus(stAfter)] || {}).title || String(stAfter);
                const fromName = String(ws.profile_title || ws.title || 'Креатор');

                const outToBrand =
                  `🔄 <b>Статус заявки #${leadId} обновлён</b>

    ` +
                  `🧑‍🎨 Креатор: <b>${escapeHtml(String(fromName))}</b>
    ` +
                  `Статус: <b>${escapeHtml(String(titleBefore))} → ${escapeHtml(String(titleAfter))}</b>

    ` +
                  `<b>Что дальше:</b>
    ` +
                  `• Если нужно уточнить — открой «${brandLeadDialogButtonLabel(leadId)}» и напиши сообщение.
    ` +
                  `• Или посмотри «${brandLeadProfileButtonLabel()}».`;

                const kbToBrand = brandReplyKb(ws, wsId, brandCredits, leadId);
                await sendMessageWithFallback(apiFromCtx(ctx), brandTgId, outToBrand, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kbToBrand });
              }
            } catch {}
          }

          // Owner-only audit (workspace_audit): status change
          try {
            if (statusChanged) {
              await db.auditWorkspace(wsId, u.id, 'lead.status_changed', {
                lead_id: Number(leadId),
                from: String(stBefore),
                to: String(stAfter),
                reason: 'manual',
                actor_role: actorRole
              });
            }
          } catch {}

          // N5: Notify owner/assigned curator (only) when curator changed status (no spam)
          if (isCuratorActor && statusChanged) {
            try {
              const chName = ws.channel_username ? '@' + ws.channel_username : (ws.title || '');
              const actorName = ctx.from?.username ? '@' + ctx.from.username : `id:${u.id}`;
              const titleBefore = (LEAD_STATUSES[normLeadStatus(stBefore)] || {}).title || String(stBefore);
              const titleAfter = (LEAD_STATUSES[normLeadStatus(stAfter)] || {}).title || String(stAfter);
              const notifText =
                `🔄 <b>Статус заявки #${leadId} изменён</b>\n\n` +
                `Канал: <b>${escapeHtml(String(chName))}</b>\n` +
                `Куратор: <b>${escapeHtml(String(actorName))}</b>\n` +
                `Статус: <b>${escapeHtml(String(titleBefore))} → ${escapeHtml(String(titleAfter))}</b>\n\n` +
                `<b>Что дальше:</b>\n` +
                `• Открой карточку заявки и посмотри тред.\n` +
                `• Если нужно — ответь бренду или добавь заметку.`;
              const notifKb = new InlineKeyboard()
                .text(creatorLeadOpenButtonLabel(leadId), `a:lead_view|id:${leadId}|w:${wsId}|s:n|p:0`)
                .row().text('🗑 Убрать', 'a:nd');

              // If lead has assigned curator — notify only them (+ owner). If not — notify only owner.
              const assignedTo = lead.assigned_user_id ? Number(lead.assigned_user_id) : Number(u.id);
              await notifyWorkspaceTeam(apiFromCtx(ctx), wsId, {
                text: notifText,
                kb: notifKb,
                exclude: new Set([Number(ctx.from?.id || 0)]),
                onlyAssigned: assignedTo || null
              });
            } catch {}
          }

          try {
            const flash = stBefore === stAfter
              ? `Статус уже: ${(LEAD_STATUSES[stAfter]?.title || stAfter)}`
              : `Статус обновлён: ${(LEAD_STATUSES[stBefore]?.title || stBefore)} → ${(LEAD_STATUSES[stAfter]?.title || stAfter)}`;
            try { await ctx.answerCallbackQuery({ text: `✅ ${flash}` }); } catch {}
            await renderLeadView(ctx, u.id, leadId, { wsId: wsId || null, status: backStatus || st, page: backPage, ret: retKey, flash });
          } catch (e) {
            try { console.warn('[lead_set] unhandled', { leadId, st, cid: ctx.state?.cid || null, err: errInfo(e) }); } catch {}
            const text = '✅ Статус обновлён. (Экран не удалось перерисовать — открой заявку заново.)';
            const rPart = retKey ? retPartShort(retKey) : '';
            const kb = new InlineKeyboard()
              .text('⬅️ Назад', `a:ws_leads|w:${backWsId || wsId || 0}|s:${leadStatusToCb(backStatus || st)}|p:${backPage}${rPart}`)
              .text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');
            try { await safeEditOrReply(ctx, text, { reply_markup: kb }); } catch { await ctx.reply(text, { reply_markup: kb }); }
          }
          return;
        }
        if (p.a === 'a:lead_notes') {
          try { await ctx.answerCallbackQuery(); } catch {}
          const leadId = Number(p.id || 0);
          if (!leadId) return;

          const wsId = Number(p.w || p.ws || 0);
          const backStatus = leadStatusFromCb(String(p.s || 'new'));
          const backPage = Number(p.p || 0);
          const retKey = String(p.ret || retFromCb(p.r) || '').trim() || null;
          const notesPage = Math.max(0, Number(p.n || 0));

          await renderLeadNotesViewer(ctx, u.id, leadId, { wsId: wsId || null, status: backStatus, page: backPage, ret: retKey }, notesPage);
          return;
        }
        if (p.a === 'a:lead_note_cancel') {
          try { await ctx.answerCallbackQuery(); } catch {}
          try { if (ctx.from?.id) await clearExpectText(ctx.from.id); } catch {}
          const leadId = Number(p.id || 0);
          if (!leadId) return;

          const wsId = Number(p.w || p.ws || 0);
          const backStatus = leadStatusFromCb(String(p.s || 'new'));
          const backPage = Number(p.p || 0);
          const retKey = String(p.ret || retFromCb(p.r) || '').trim() || null;
          const notesPage = (p.nb !== undefined && p.nb !== null) ? Math.max(0, Number(p.nb || 0)) : null;

          if (notesPage !== null) {
            await renderLeadNotesViewer(ctx, u.id, leadId, { wsId: wsId || null, status: backStatus, page: backPage, ret: retKey }, notesPage);
            return;
          }

          await renderLeadView(ctx, u.id, leadId, { wsId: wsId || null, status: backStatus, page: backPage, ret: retKey });
          return;
        }
        if (p.a === 'a:lead_note') {
          try { await ctx.answerCallbackQuery(); } catch {}
          const tgId = ctx.from?.id;
          if (!tgId) return;

          const leadId = Number(p.id || 0);
          if (!leadId) return;

          const lead = await getLeadForActorSafe(ctx, u.id, leadId);
          if (!lead) {
            await safeEditOrReply(ctx, '⚠️ Заявка не найдена. Открой 📨 Заявки от брендов и выбери заявку ещё раз.', { reply_markup: navKb('a:menu') });
            return;
          }

          const wsId = Number(lead.workspace_id);
          const ws = await db.getWorkspaceAny(wsId);
          if (!ws) {
            await safeEditOrReply(ctx, '⚠️ Канал не найден. Открой 📋 Меню и выбери канал заново.', { reply_markup: navKb('a:menu') });
            return;
          }

          const isOwner = Number(ws.owner_user_id) === Number(u.id);
          const isAdmin = isSuperAdminTg(ctx.from?.id);
          let isCurator = false;
          if (!isOwner && !isAdmin) {
            try { isCurator = await db.isCuratorForWorkspace(wsId, u.id); } catch {}
          }
          if (!isOwner && !isAdmin && !isCurator) {
            await renderRecovery(ctx, 'application', { backCb: 'a:menu' });
            return;
          }

          const actorRole = isOwner ? 'owner' : (isAdmin ? 'admin' : 'curator');

          const backStatus = leadStatusFromCb(String(p.s || 'new'));
          const backPage = Number(p.p || 0);
          const retKey = String(p.ret || retFromCb(p.r) || '').trim() || null;
          const notesPage = (p.nb !== undefined && p.nb !== null) ? Math.max(0, Number(p.nb || 0)) : null;
          const rPart = retKey ? retPartShort(retKey) : '';
          const nbPart = (notesPage !== null) ? `|nb:${notesPage}` : '';

          const backCb = (notesPage !== null)
            ? `a:lead_notes|id:${leadId}|w:${wsId}|n:${notesPage}|s:${leadStatusToCb(backStatus)}|p:${backPage}${rPart}`
            : `a:lead_view|id:${leadId}|w:${wsId}|s:${leadStatusToCb(backStatus)}|p:${backPage}${rPart}`;

          const kb = new InlineKeyboard()
            .text(LEAD_NOTE_TEMPLATES.wb.label, `a:lead_note_tpl|id:${leadId}|w:${wsId}|k:wb|s:${leadStatusToCb(backStatus)}|p:${backPage}${nbPart}${rPart}`)
            .text(LEAD_NOTE_TEMPLATES.bd.label, `a:lead_note_tpl|id:${leadId}|w:${wsId}|k:bd|s:${leadStatusToCb(backStatus)}|p:${backPage}${nbPart}${rPart}`)
            .row()
            .text(LEAD_NOTE_TEMPLATES.fm.label, `a:lead_note_tpl|id:${leadId}|w:${wsId}|k:fm|s:${leadStatusToCb(backStatus)}|p:${backPage}${nbPart}${rPart}`)
            .text(LEAD_NOTE_TEMPLATES.fu.label, `a:lead_note_tpl|id:${leadId}|w:${wsId}|k:fu|s:${leadStatusToCb(backStatus)}|p:${backPage}${nbPart}${rPart}`)
            .row()
            .text(LEAD_NOTE_TEMPLATES.ur.label, `a:lead_note_tpl|id:${leadId}|w:${wsId}|k:ur|s:${leadStatusToCb(backStatus)}|p:${backPage}${nbPart}${rPart}`)
            .text(LEAD_NOTE_TEMPLATES.sp.label, `a:lead_note_tpl|id:${leadId}|w:${wsId}|k:sp|s:${leadStatusToCb(backStatus)}|p:${backPage}${nbPart}${rPart}`)
            .row()
            .text('✍️ Ввести вручную', `a:lead_note_text|id:${leadId}|w:${wsId}|s:${leadStatusToCb(backStatus)}|p:${backPage}${nbPart}${rPart}`)
            .row()
            .text('⬅️ Назад', backCb)
            .text('📋 Меню', 'a:menu')
            .text('🏠 Домой', 'a:home');

          const prompt = `📝 <b>Новая заметка</b> • заявка #${leadId}
    ` +
            `Роль: <b>${escapeHtml(actorRole)}</b>

    ` +
            `Выбери быстрый шаблон или введи текст вручную.
    ` +
            `Теги можно добавлять прямо в тексте: <code>#brief</code> <code>#price</code> <code>#urgent</code>.`;

          await safeEditOrReply(ctx, prompt, { parse_mode: 'HTML', reply_markup: kb });
          return;
        }
        if (p.a === 'a:lead_note_text') {
          try { await ctx.answerCallbackQuery(); } catch {}
          const tgId = ctx.from?.id;
          if (!tgId) return;
          const leadId = Number(p.id || 0);
          if (!leadId) return;

          const lead = await getLeadForActorSafe(ctx, u.id, leadId);
          if (!lead) {
            await safeEditOrReply(ctx, '⚠️ Заявка не найдена. Открой 📨 Заявки от брендов и выбери заявку ещё раз.', { reply_markup: navKb('a:menu') });
            return;
          }

          const wsId = Number(lead.workspace_id);
          const ws = await db.getWorkspaceAny(wsId);
          if (!ws) {
            await safeEditOrReply(ctx, '⚠️ Канал не найден. Открой 📋 Меню и выбери канал заново.', { reply_markup: navKb('a:menu') });
            return;
          }

          const isOwner = Number(ws.owner_user_id) === Number(u.id);
          const isAdmin = isSuperAdminTg(ctx.from?.id);
          let isCurator = false;
          if (!isOwner && !isAdmin) {
            try { isCurator = await db.isCuratorForWorkspace(wsId, u.id); } catch {}
          }
          if (!isOwner && !isAdmin && !isCurator) {
            await renderRecovery(ctx, 'application', { backCb: 'a:menu' });
            return;
          }

          const actorRole = isOwner ? 'owner' : (isAdmin ? 'admin' : 'curator');

          const backStatus = leadStatusFromCb(String(p.s || 'new'));
          const backPage = Number(p.p || 0);
          const retKey = String(p.ret || retFromCb(p.r) || '').trim() || null;
          const notesPage = (p.nb !== undefined && p.nb !== null) ? Math.max(0, Number(p.nb || 0)) : null;
          const rPart = retKey ? retPartShort(retKey) : '';

          await setExpectText(tgId, {
            type: 'lead_note',
            leadId,
            wsId,
            backStatus,
            backPage,
            ret: retKey,
            nb: notesPage,
            role: actorRole,
            backCb: `a:lead_view|id:${leadId}|w:${wsId}|s:${leadStatusToCb(backStatus)}|p:${backPage}${rPart}`,
          });

          const nbPart = (notesPage !== null) ? `|nb:${notesPage}` : '';
          const kb = new InlineKeyboard()
            .text('⬅️ Назад', `a:lead_note_cancel|id:${leadId}|w:${wsId}|s:${leadStatusToCb(backStatus)}|p:${backPage}${nbPart}${rPart}`)
            .text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');

          const prompt = `📝 <b>Заметка</b> к заявке #${leadId}

    Пришли одним сообщением (до 800 символов).

    Теги: добавь в тексте, например <code>#brief</code> <code>#price</code> <code>#urgent</code>.
    Заметка видна только внутри команды.`;
          await safeEditOrReply(ctx, prompt, { parse_mode: 'HTML', reply_markup: kb });
          return;
        }
        if (p.a === 'a:lead_note_tpl') {
          try { await ctx.answerCallbackQuery(); } catch {}
          const leadId = Number(p.id || 0);
          if (!leadId) return;

          const lead = await getLeadForActorSafe(ctx, u.id, leadId);
          if (!lead) {
            await safeEditOrReply(ctx, '⚠️ Заявка не найдена. Открой 📨 Заявки от брендов и выбери заявку ещё раз.', { reply_markup: navKb('a:menu') });
            return;
          }

          const wsId = Number(lead.workspace_id);
          const ws = await db.getWorkspaceAny(wsId);
          if (!ws) {
            await safeEditOrReply(ctx, '⚠️ Канал не найден. Открой 📋 Меню и выбери канал заново.', { reply_markup: navKb('a:menu') });
            return;
          }

          const isOwner = Number(ws.owner_user_id) === Number(u.id);
          const isAdmin = isSuperAdminTg(ctx.from?.id);
          let isCurator = false;
          if (!isOwner && !isAdmin) {
            try { isCurator = await db.isCuratorForWorkspace(wsId, u.id); } catch {}
          }
          if (!isOwner && !isAdmin && !isCurator) {
            await renderRecovery(ctx, 'application', { backCb: 'a:menu' });
            return;
          }

          const actorRole = isOwner ? 'owner' : (isAdmin ? 'admin' : 'curator');

          const tplKey = normLeadNoteTplKey(p.k);
          const tpl = LEAD_NOTE_TEMPLATES[tplKey] || LEAD_NOTE_TEMPLATES.wb;

          const saved = await safeLeadWrite(
            () => db.appendBrandLeadCuratorNote(leadId, u.id, tpl.text, { role: actorRole }),
            { op: 'lead_note_tpl', leadId },
          );
          if (!saved) {
            const backStatus = leadStatusFromCb(String(p.s || 'new'));
            const backPage = Number(p.p || 0);
            const retKey = String(p.ret || retFromCb(p.r) || '').trim() || null;
            const notesPage = (p.nb !== undefined && p.nb !== null) ? Math.max(0, Number(p.nb || 0)) : null;
            const rPart = retKey ? retPartShort(retKey) : '';
            const nbPart = (notesPage !== null) ? `|nb:${notesPage}` : '';
            const backCb = (notesPage !== null)
              ? `a:lead_notes|id:${leadId}|w:${wsId}|n:${notesPage}|s:${leadStatusToCb(backStatus)}|p:${backPage}${rPart}`
              : `a:lead_view|id:${leadId}|w:${wsId}|s:${leadStatusToCb(backStatus)}|p:${backPage}${rPart}`;
            const kb = new InlineKeyboard()
              .text('⬅️ Назад', backCb)
              .text('📋 Меню', 'a:menu')
              .text('🏠 Домой', 'a:home');
            await safeEditOrReply(ctx, '⚠️ Не смог сохранить заметку. Попробуй ещё раз.', { reply_markup: kb });
            return;
          }

          // Audit (owner-only журнал): заметка добавлена (шаблон)
          try {
            const tags = extractLeadNoteTags(tpl.text);
            const preview = clipText(tpl.text.replace(/\s+/g, ' '), 160);
            await db.auditWorkspace(wsId, u.id, 'lead.note_added', {
              lead_id: leadId,
              actor_role: actorRole,
              preview,
              tags,
              tpl_key: tplKey,
              tpl_label: tpl.label
            });
          } catch {}

          const backStatus = leadStatusFromCb(String(p.s || 'new'));
          const backPage = Number(p.p || 0);
          const retKey = String(p.ret || retFromCb(p.r) || '').trim() || null;
          const notesPage = (p.nb !== undefined && p.nb !== null) ? Math.max(0, Number(p.nb || 0)) : null;

          if (notesPage !== null) {
            await renderLeadNotesViewer(ctx, u.id, leadId, { wsId: wsId || null, status: backStatus, page: backPage, ret: retKey }, 0);
            return;
          }

          await renderLeadView(ctx, u.id, leadId, { wsId: wsId || null, status: backStatus, page: backPage, ret: retKey });
          return;
        }
        if (p.a === 'a:lead_reply') {
          try { await ctx.answerCallbackQuery(); } catch {}
          const leadId = Number(p.id || 0);
          if (!leadId) return;

          const lead = await getLeadForActorSafe(ctx, u.id, leadId);
          if (!lead) return safeEditOrReply(ctx, 'Заявка не найдена.');

          const ws = await db.getWorkspaceAny(Number(lead.workspace_id));
          if (!ws) return safeEditOrReply(ctx, 'Канал не найден.');

          const isOwner = Number(ws.owner_user_id) === Number(u.id);
          const isAdmin = isSuperAdminTg(ctx.from.id);
          if (!isOwner && !isAdmin) { await renderRecovery(ctx, 'application', { backCb: 'a:ws_list' }); return; }

          const backStatus = leadStatusFromCb(String(p.s || 'new'));
          const retKey = String(p.ret || retFromCb(p.r) || '').trim();
          await setExpectText(ctx.from.id, { type: 'lead_reply', leadId, wsId: Number(ws.id), backStatus, backPage: Number(p.p || 0), ret: retKey });

          const rPart = retKey ? retPartShort(retKey) : '';
          const kb = new InlineKeyboard()
            .text('⬅️ Назад', `a:lead_view|id:${leadId}|w:${Number(ws.id)}|s:${leadStatusToCb(backStatus)}|p:${Number(p.p || 0)}${rPart}`);

          await safeEditOrReply(ctx,
            `✍️ <b>Ответ на заявку #${leadId}</b>

    Напиши ответ одним сообщением.`,
            { parse_mode: 'HTML', reply_markup: kb }
          );
          return;
        }
  })();
  return true;
}

export async function handleLeadAuditCallback(ctx, p, u, deps = {}) {
  if (!isLeadAuditAction(p?.a)) return false;
  const bound = bindDependencies(deps);
  const {
  BX_HOME,
  CFG,
  InlineKeyboard,
  LEAD_NOTE_TEMPLATES,
  LEAD_STATUSES,
  answerRecovery,
  apiFromCtx,
  brandLeadDialogButtonLabel,
  brandLeadProfileButtonLabel,
  brandReplyKb,
  clearExpectText,
  clipText,
  creatorLeadOpenButtonLabel,
  db,
  errInfo,
  escapeHtml,
  extractLeadNoteTags,
  getCuratorMode,
  getExpectText,
  getLeadForActorSafe,
  getRoleFlags,
  isBrandBasicComplete,
  isSuperAdminTg,
  leadStatusFromCb,
  leadStatusToCb,
  navKb,
  normLeadNoteTplKey,
  normLeadStatus,
  notifyWorkspaceTeam,
  renderBrandLeadDialog,
  renderBrandProfileHome,
  renderCuratorAudit,
  renderCuratorInbox,
  renderLeadNotesViewer,
  renderLeadTemplatePreview,
  renderLeadTemplates,
  renderLeadView,
  renderRecovery,
  renderStaleButton,
  renderWsLeadCompose,
  renderWsLeadsList,
  renderWsPublicProfile,
  resolveBxHomeFromUi,
  retFromCb,
  retPartShort,
  safeBrandProfiles,
  safeEditOrReply,
  safeLeadWrite,
  sendLeadTemplateReply,
  sendMessageWithFallback,
  setExpectText,
  withTimeout
  } = bound;

  await (async () => {
    if (p.a === 'a:ca') {
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
  })();
  return true;
}

