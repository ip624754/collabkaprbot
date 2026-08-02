import { isAdminMessageTemplateAction } from './policy.js';

function bindDependencies(deps, names) {
  for (const name of names) {
    if (deps?.[name] === null || deps?.[name] === undefined) {
      throw new Error('admin_communications_domain.missing_dependency:' + name);
    }
  }
  return deps;
}

const REQUIRED_DEPENDENCIES = Object.freeze([
  'DEFAULT_ADMIN_DM_TEMPLATES',
  'InlineKeyboard',
  'TG_SAFE_BODY_MAX',
  'adminDmPlaceholdersHelpHtml',
  'applyAdminDmPlaceholders',
  'buildAdminDmPlaceholderValues',
  'clearExpectText',
  'clipCodepoints',
  'containsUrl',
  'db',
  'escapeHtml',
  'findAdminDmTemplate',
  'getAdminDmTemplatesWithMeta',
  'isSuperAdminTg',
  'kbAdminFooter',
  'randomToken',
  'redis',
  'renderAdminDmTemplateView',
  'renderAdminDmTemplates',
  'renderAdminDmUserMessageHtml',
  'resetAdminDmTemplates',
  'safeEditOrReply',
  'sendAdminMessageToUser',
  'setAdminDmTemplates',
  'setExpectText',
]);

export async function handleAdminMessageTemplateCallback(ctx, p, u, deps = {}) {
  if (!isAdminMessageTemplateAction(p?.a)) return false;
  const bound = bindDependencies(deps, REQUIRED_DEPENDENCIES);
  const {
    DEFAULT_ADMIN_DM_TEMPLATES,
    InlineKeyboard,
    TG_SAFE_BODY_MAX,
    adminDmPlaceholdersHelpHtml,
    applyAdminDmPlaceholders,
    buildAdminDmPlaceholderValues,
    clearExpectText,
    clipCodepoints,
    containsUrl,
    db,
    escapeHtml,
    findAdminDmTemplate,
    getAdminDmTemplatesWithMeta,
    isSuperAdminTg,
    kbAdminFooter,
    randomToken,
    redis,
    renderAdminDmTemplateView,
    renderAdminDmTemplates,
    renderAdminDmUserMessageHtml,
    resetAdminDmTemplates,
    safeEditOrReply,
    sendAdminMessageToUser,
    setAdminDmTemplates,
    setExpectText,
  } = bound;

  await (async () => {
if (p.a === 'a:adm_umsg_tpl') {
      await ctx.answerCallbackQuery();
      if (!isSuperAdminTg(ctx.from.id)) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      try { await clearExpectText(ctx.from.id); } catch {}

      const uid = Number(p.id || 0);
      const tplId = String(p.t || '').trim(); // new (Redis templates)
      const key = String(p.k || '').trim(); // legacy (defaults only)
      const f = String(p.f || 'all').toLowerCase();
      const page = Math.max(0, Number(p.p) || 0);

      let raw = '';
      let usedDefaultKey = '';
      let tplLabel = '';

      if (tplId) {
        const { tpls } = await getAdminDmTemplatesWithMeta();
        const it = findAdminDmTemplate(tpls.items, tplId);
        raw = String(it?.text || '').trim();
        tplLabel = String(it?.label || '').trim();
      }

      if (!raw && key) {
        // Fallback to built-in defaults for old callback data.
        const TPL = {
          ack: DEFAULT_ADMIN_DM_TEMPLATES.find((t) => t.id === 'ack')?.text || '',
          need: DEFAULT_ADMIN_DM_TEMPLATES.find((t) => t.id === 'need')?.text || '',
          done: DEFAULT_ADMIN_DM_TEMPLATES.find((t) => t.id === 'done')?.text || '',
          wip: DEFAULT_ADMIN_DM_TEMPLATES.find((t) => t.id === 'wip')?.text || '',
          pay: DEFAULT_ADMIN_DM_TEMPLATES.find((t) => t.id === 'pay')?.text || '',
          limit: DEFAULT_ADMIN_DM_TEMPLATES.find((t) => t.id === 'limit')?.text || '',
        };
        raw = TPL[key] || '';
        if (raw) {
          usedDefaultKey = key;
          tplLabel = String(DEFAULT_ADMIN_DM_TEMPLATES.find((t) => t.id === key)?.label || '').trim();
        }
      }

      if (!raw) return ctx.answerCallbackQuery({ text: 'Шаблон не найден.' });

      const row = await db.getUserTgIdByUserId(uid);
      const targetTgId = Number(row?.tg_id || 0);
      const uname = row?.tg_username ? '@' + String(row.tg_username) : '';
      if (!targetTgId) return ctx.answerCallbackQuery({ text: 'Нет TG ID.' });

      const token = randomToken(8);

const rawMeta = clipCodepoints(raw, TG_SAFE_BODY_MAX);
const safeRaw = rawMeta.text;

const phVals = await buildAdminDmPlaceholderValues(ctx, targetTgId, { username: String(row?.tg_username || '') });
const phRes = applyAdminDmPlaceholders(safeRaw, phVals);
const expandedMeta = clipCodepoints(String(phRes.text || ''), TG_SAFE_BODY_MAX);
const expandedPlain = expandedMeta.text;
const bodyHtml = escapeHtml(expandedPlain);
const phUsed = phRes.used || [];
const phUnknown = phRes.unknown || [];

const warnLines = [];
if (rawMeta.wasClipped) warnLines.push(`⚠️ Обрезано: ${rawMeta.origLen} → ${rawMeta.newLen} (лимит ${TG_SAFE_BODY_MAX}).`);
if (expandedMeta.wasClipped && (!rawMeta.wasClipped || expandedMeta.origLen !== rawMeta.origLen)) {
  warnLines.push(`⚠️ После подстановки: ${expandedMeta.origLen} → ${expandedMeta.newLen} (лимит ${TG_SAFE_BODY_MAX}).`);
}
if (containsUrl(expandedPlain)) warnLines.push('🔗 В тексте есть ссылка — проверь перед отправкой.');
const warnHtml = warnLines.length ? `\n\n<i>${escapeHtml(warnLines.join('\n'))}</i>` : '';

      let stored = false;
      try {
        await redis.set(k(['adm_umsg', token]), {
          byAdminTgId: Number(ctx.from.id),
          targetUserId: uid,
          targetTgId,
          targetUsername: String(row?.tg_username || ''),
          templateRaw: safeRaw,
          templateId: tplId || usedDefaultKey || '',
          templateLabel: tplLabel || '',
          phUsed,
          phUnknown,
          createdAt: new Date().toISOString(),
        }, { ex: 10 * 60 });
        stored = true;
      } catch {
        stored = false;
      }

      // If Redis is unavailable, send immediately (no confirm screen).
      if (!stored) {
        await sendAdminMessageToUser(ctx, {
          byAdminTgId: Number(ctx.from.id),
          targetUserId: uid,
          targetTgId,
          targetUsername: String(row?.tg_username || ''),
          templateRaw: raw,
        }, { f, page, backUid: uid });
        return;
      }

      let phInfo = '';
      if (phUsed.length) {
        const tags = phUsed.map((k) => `<code>{{${escapeHtml(String(k))}}}</code>`).join(' ');
        phInfo += `
📎 Подставим: ${tags}`;
      }
      if (phUnknown.length) {
        const tags = phUnknown.map((k) => `<code>{{${escapeHtml(String(k))}}}</code>`).join(' ');
        phInfo += `
⚠️ Неизвестные: ${tags}`;
      }

      const preview = renderAdminDmUserMessageHtml(bodyHtml);
      const kb = new InlineKeyboard()
        .text('✅ Отправить', `a:adm_umsg_send|tk:${token}|f:${f}|p:${page}|wn:1`)
        .text('⚪ Без «Что дальше»', `a:adm_umsg_send|tk:${token}|f:${f}|p:${page}|wn:0`)
        .row()
        .text('❌ Отмена', `a:adm_umsg|id:${uid}|f:${f}|p:${page}`)
        .row()
        .text('📎 Вставить', `a:adm_ph|r:umsg|id:${uid}|f:${f}|p:${page}`)
        .row()
        .text('⬅️ К карточке', `a:adm_ucard|id:${uid}|f:${f}|p:${page}`)
        .row();

      kbAdminFooter(kb, '⬅️ Операции', 'a:admin_ops');

      await safeEditOrReply(ctx,
        `👀 <b>Предпросмотр</b>${uname ? ` (${escapeHtml(uname)})` : ''}${phInfo}\n\n${preview}`,
        { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true }
      );
      return;
    }
if (p.a === 'a:admin_umsg_tpls') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return;
  await renderAdminDmTemplates(ctx, Math.max(0, Number(p.p) || 0));
  return;
}
if (p.a === 'a:admin_umsg_tpl_view') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return;
  await renderAdminDmTemplateView(ctx, String(p.tid || ''), Math.max(0, Number(p.p) || 0));
  return;
}
if (p.a === 'a:admin_umsg_tpl_add') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return;
  const page = Math.max(0, Number(p.p) || 0);
  await safeEditOrReply(ctx, `➕ <b>Новый шаблон личного сообщения</b>\n\n1-я строка — название.\nДальше — текст шаблона.`, { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('⬅️ Назад', `a:admin_umsg_tpls|p:${page}`) });
  await setExpectText(ctx.from.id, { type: 'admin_umsg_tpl_add', page }, 20 * 60);
  return;
}
if (p.a === 'a:admin_umsg_tpl_edit') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return;
  const page = Math.max(0, Number(p.p) || 0);
  const tplId = String(p.tid || '');
  await safeEditOrReply(ctx, `✏️ <b>Изменить шаблон личного сообщения</b>\n\n1-я строка — название.\nДальше — новый текст.`, { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('⬅️ Назад', `a:admin_umsg_tpl_view|tid:${tplId}|p:${page}`) });
  await setExpectText(ctx.from.id, { type: 'admin_umsg_tpl_edit', tplId, page }, 20 * 60);
  return;
}
if (p.a === 'a:admin_umsg_tpl_del_q') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return;
  const page = Math.max(0, Number(p.p) || 0);
  const tplId = String(p.tid || '');
  const kb = new InlineKeyboard().text('🗑 Удалить', `a:admin_umsg_tpl_del|tid:${tplId}|p:${page}`).text('❌ Отмена', `a:admin_umsg_tpl_view|tid:${tplId}|p:${page}`);
  await safeEditOrReply(ctx, '🗑 <b>Удалить шаблон?</b>', { parse_mode: 'HTML', reply_markup: kb });
  return;
}
if (p.a === 'a:admin_umsg_tpl_del') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return;
  const page = Math.max(0, Number(p.p) || 0);
  const tplId = String(p.tid || '');
  const { tpls } = await getAdminDmTemplatesWithMeta();
  const items = (Array.isArray(tpls.items) ? tpls.items : []).filter((x) => String(x.id || '') !== tplId);
  await setAdminDmTemplates({ version: Number(tpls.version || 0) + 1, updatedAt: new Date().toISOString(), items });
  await renderAdminDmTemplates(ctx, page);
  return;
}
if (p.a === 'a:admin_umsg_tpl_reset_q') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return;
  const page = Math.max(0, Number(p.p) || 0);
  const kb = new InlineKeyboard().text('♻️ Сбросить', `a:admin_umsg_tpl_reset|p:${page}`).text('❌ Отмена', `a:admin_umsg_tpls|p:${page}`);
  await safeEditOrReply(ctx, '♻️ <b>Восстановить стандартные шаблоны?</b>', { parse_mode: 'HTML', reply_markup: kb });
  return;
}
if (p.a === 'a:admin_umsg_tpl_reset') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return;
  await resetAdminDmTemplates();
  await renderAdminDmTemplates(ctx, 0);
  return;
}
if (p.a === 'a:adm_ph') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

  const ret = String(p.r || '').trim();
  const uid = Number(p.id || 0);
  const tplId = String(p.tid || '').trim();
  const f = String(p.f || 'all').toLowerCase();
  const page = Math.max(0, Number(p.p) || 0);

  let backCb = 'a:admin_home';
  if (ret === 'umsg') backCb = `a:adm_umsg|id:${uid}|f:${f}|p:${page}`;
  else if (ret === 'umsg_free') backCb = `a:adm_umsg_free|id:${uid}|f:${f}|p:${page}`;
  else if (ret === 'tpl_list') backCb = `a:admin_umsg_tpls|p:${page}`;
  else if (ret === 'tpl_add') backCb = `a:admin_umsg_tpl_add|p:${page}`;
  else if (ret === 'tpl_edit') backCb = `a:admin_umsg_tpl_edit|tid:${tplId}|p:${page}`;
  else if (ret === 'tpl_view') backCb = `a:admin_umsg_tpl_view|tid:${tplId}|p:${page}`;

  let sectionBackText = '⬅️ Админка';
  let sectionBackCb = 'a:admin_home';
  if (['tpl_list', 'tpl_add', 'tpl_edit', 'tpl_view'].includes(ret)) {
    sectionBackText = '⬅️ Коммуникации';
    sectionBackCb = 'a:admin_comms';
  } else if (['umsg', 'umsg_free'].includes(ret)) {
    sectionBackText = '⬅️ Операции';
    sectionBackCb = 'a:admin_ops';
  }

  const kb = new InlineKeyboard().text('⬅️ Назад', backCb);
  kbAdminFooter(kb, sectionBackText, sectionBackCb);

  await safeEditOrReply(ctx, adminDmPlaceholdersHelpHtml(), { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  return;
}
  })();
  return true;
}
