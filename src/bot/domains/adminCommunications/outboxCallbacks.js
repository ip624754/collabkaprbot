import { isAdminOutboxAction } from './policy.js';

function bindDependencies(deps, names) {
  for (const name of names) {
    if (deps?.[name] === null || deps?.[name] === undefined) {
      throw new Error('admin_communications_domain.missing_dependency:' + name);
    }
  }
  return deps;
}

const REQUIRED_DEPENDENCIES = Object.freeze([
  'InlineKeyboard',
  'TG_SAFE_BODY_MAX',
  'applyAdminDmPlaceholders',
  'buildAdminDmPlaceholderValues',
  'clearAdminOutbox',
  'clearExpectText',
  'clipCodepoints',
  'clipText',
  'commsCb',
  'containsUrl',
  'escapeHtml',
  'getAdminDmTemplatesWithMeta',
  'getAdminOutboxItemByIndex',
  'isSuperAdminTg',
  'k',
  'kbAdminFooter',
  'randomToken',
  'redis',
  'renderAdminDmTemplateView',
  'renderAdminDmUserMessageHtml',
  'renderAdminOutbox',
  'renderAdminOutboxView',
  'renderAdminUserNote',
  'safeEditOrReply',
  'setAdminDmTemplates',
  'setAdminUserNoteReturn',
]);

export async function handleAdminOutboxCallback(ctx, p, u, deps = {}) {
  if (!isAdminOutboxAction(p?.a)) return false;
  const bound = bindDependencies(deps, REQUIRED_DEPENDENCIES);
  const {
    InlineKeyboard,
    TG_SAFE_BODY_MAX,
    applyAdminDmPlaceholders,
    buildAdminDmPlaceholderValues,
    clearAdminOutbox,
    clearExpectText,
    clipCodepoints,
    clipText,
    commsCb,
    containsUrl,
    escapeHtml,
    getAdminDmTemplatesWithMeta,
    getAdminOutboxItemByIndex,
    isSuperAdminTg,
    k,
    kbAdminFooter,
    randomToken,
    redis,
    renderAdminDmTemplateView,
    renderAdminDmUserMessageHtml,
    renderAdminOutbox,
    renderAdminOutboxView,
    renderAdminUserNote,
    safeEditOrReply,
    setAdminDmTemplates,
    setAdminUserNoteReturn,
  } = bound;

  await (async () => {
if (p.a === 'a:admin_outbox') {
      await ctx.answerCallbackQuery();
      if (!isSuperAdminTg(ctx.from.id)) return;
      try { await clearExpectText(ctx.from.id); } catch {}
      const page = Math.max(0, Number(p.p) || 0);
      await renderAdminOutbox(ctx, page);
      return;
    }
if (p.a === 'a:admin_outbox_v') {
      await ctx.answerCallbackQuery();
      if (!isSuperAdminTg(ctx.from.id)) return;
      try { await clearExpectText(ctx.from.id); } catch {}
      const idx = Math.max(0, Number(p.i) || 0);
      const page = Math.max(0, Number(p.p) || 0);
      await renderAdminOutboxView(ctx, idx, page);
      return;
    }
if (p.a === 'a:admin_outbox_note') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return;
  const idx = Math.max(0, Number(p.i) || 0);
  const page = Math.max(0, Number(p.p) || 0);

  const it = await getAdminOutboxItemByIndex(idx);
  const uid = Number(it?.target_user_id || 0);

  if (!uid) {
    await safeEditOrReply(ctx, '⚠️ Нет user_id у записи (нельзя открыть заметку).', {
      reply_markup: (() => {
        const kb = new InlineKeyboard().text('⬅️ Назад', commsCb.adminOutboxView(idx, page));
        kbAdminFooter(kb, '⬅️ Коммуникации', 'a:admin_comms');
        return kb;
      })()
    });
    return;
  }

  // Preserve return route back to Outbox for this admin (short TTL).
  await setAdminUserNoteReturn(ctx.from.id, {
    uid,
    backText: '⬅️ Исходящие',
    backCb: commsCb.adminOutboxView(idx, page),
    sectionBackText: '⬅️ Коммуникации',
    sectionBackCb: 'a:admin_comms',
  });

  await renderAdminUserNote(ctx, uid, 'all', 0);
  return;
}
if (p.a === 'a:admin_outbox_repeat') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return;

  const chatType = String(ctx.chat?.type || '');
  if (chatType !== 'private') {
    const idx = Math.max(0, Number(p.i) || 0);
    const page = Math.max(0, Number(p.p) || 0);
    await safeEditOrReply(ctx, '✉️ Повтор из исходящих доступен только в <b>личном чате</b> с ботом, чтобы не светить содержимое сообщений в группах.', {
      parse_mode: 'HTML',
      reply_markup: (() => {
        const kb = new InlineKeyboard().text('⬅️ Назад', commsCb.adminOutboxView(idx, page));
        kbAdminFooter(kb, '⬅️ Коммуникации', 'a:admin_comms');
        return kb;
      })()
    });
    return;
  }

  const idx = Math.max(0, Number(p.i) || 0);
  const page = Math.max(0, Number(p.p) || 0);

  const it = await getAdminOutboxItemByIndex(idx);
  if (!it) return ctx.answerCallbackQuery({ text: 'Запись не найдена.' });

  const uid = Number(it.target_user_id || 0);
  const targetTgId = Number(it.target_tg_id || 0);
  const targetUsername = String(it.target_username || '').trim();
const raw0 = String(it.snippet || it.preview || '').trim();
const rawMeta = clipCodepoints(raw0, TG_SAFE_BODY_MAX);
const templateRaw = rawMeta.text;

  if (!targetTgId || !templateRaw) {
    await safeEditOrReply(ctx, '⚠️ Нельзя повторить: нет TG ID или текста.', {
      reply_markup: (() => {
        const kb = new InlineKeyboard().text('⬅️ Назад', commsCb.adminOutboxView(idx, page));
        kbAdminFooter(kb, '⬅️ Коммуникации', 'a:admin_comms');
        return kb;
      })()
    });
    return;
  }

  // Apply placeholders (best-effort) — useful if admin intentionally keeps {{...}} in the text.
  const phVals = await buildAdminDmPlaceholderValues(ctx, targetTgId, { username: targetUsername });
const phRes = applyAdminDmPlaceholders(templateRaw, phVals);
const expandedMeta = clipCodepoints(String(phRes.text || ''), TG_SAFE_BODY_MAX);
const expandedPlain = expandedMeta.text;
const bodyHtml = escapeHtml(expandedPlain);

const warnLines = [];
if (rawMeta.wasClipped) warnLines.push(`⚠️ Обрезано: ${rawMeta.origLen} → ${rawMeta.newLen} (лимит ${TG_SAFE_BODY_MAX}).`);
if (expandedMeta.wasClipped && (!rawMeta.wasClipped || expandedMeta.origLen !== rawMeta.origLen)) {
  warnLines.push(`⚠️ После подстановки: ${expandedMeta.origLen} → ${expandedMeta.newLen} (лимит ${TG_SAFE_BODY_MAX}).`);
}
if (containsUrl(expandedPlain)) warnLines.push('🔗 В тексте есть ссылка — проверь перед отправкой.');
const warnHtml = warnLines.length ? `\n\n<i>${escapeHtml(warnLines.join('\n'))}</i>` : '';
  const phUsed = phRes.used || [];
  const phUnknown = phRes.unknown || [];

  const token = randomToken(8);

  let stored = false;
  try {
    await redis.set(k(['adm_umsg', token]), {
      byAdminTgId: Number(ctx.from.id),
      targetUserId: uid,
      targetTgId,
      targetUsername,
      templateRaw,
      templateId: 'outbox_repeat',
      templateLabel: 'Повтор из исходящих',
      phUsed,
      phUnknown,
      // Return route for sendAdminMessageToUser (so “done/back” stays inside Outbox)
      retCb: commsCb.adminOutboxView(idx, page),
      retText: '⬅️ Исходящие',
      sectionBackText: '⬅️ Коммуникации',
      sectionBackCb: 'a:admin_comms',
      createdAt: new Date().toISOString(),
    }, { ex: 10 * 60 });
    stored = true;
  } catch {
    stored = false;
  }

  if (!stored) {
    await safeEditOrReply(ctx, '⚠️ Redis недоступен — нельзя безопасно показать предпросмотр и подтверждение. Повтор отменён.', {
      reply_markup: (() => {
        const kb = new InlineKeyboard().text('⬅️ Назад', commsCb.adminOutboxView(idx, page));
        kbAdminFooter(kb, '⬅️ Коммуникации', 'a:admin_comms');
        return kb;
      })()
    });
    return;
  }

  let phInfo = '';
  if (phUsed.length) {
    const tags = phUsed.map((k) => `<code>{{${escapeHtml(String(k))}}}</code>`).join(' ');
    phInfo += `\n📎 Подставим: ${tags}`;
  }
  if (phUnknown.length) {
    const tags = phUnknown.map((k) => `<code>{{${escapeHtml(String(k))}}}</code>`).join(' ');
    phInfo += `\n⚠️ Неизвестные: ${tags}`;
  }

  const uname = targetUsername ? '@' + targetUsername : '';
  const preview = renderAdminDmUserMessageHtml(bodyHtml);

  const kb = new InlineKeyboard()
    .text('✅ Отправить', `a:adm_umsg_send|tk:${token}|f:all|p:0|wn:1`)
    .text('⚪ Без «Что дальше»', `a:adm_umsg_send|tk:${token}|f:all|p:0|wn:0`)
    .row()
    .text('❌ Отмена', commsCb.adminOutboxView(idx, page))
    .row();

  if (uid) kb.text('👤 Карточка', `a:adm_ucard|id:${uid}|f:all|p:0`).row();


  kbAdminFooter(kb, '⬅️ Коммуникации', 'a:admin_comms');
  await safeEditOrReply(ctx, `${preview}${warnHtml}${phInfo}`, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  return;
}
if (p.a === 'a:admin_outbox_to_tpl') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return;
  const idx = Math.max(0, Number(p.i) || 0);
  const page = Math.max(0, Number(p.p) || 0);
  const it = await getAdminOutboxItemByIndex(idx);
  const raw = String(it?.snippet || it?.preview || '').trim();
  if (!raw) { await ctx.answerCallbackQuery({ text: 'В записи нет текста.' }); return; }
  const { tpls } = await getAdminDmTemplatesWithMeta();
  const items = Array.isArray(tpls.items) ? tpls.items.map((x) => ({ ...x })) : [];
  const id = 't' + randomToken(6);
  const label = clipText(`Исходящие ${fmtTs(it?.ts || new Date().toISOString())}`, 48);
  items.push({ id, label, text: clipCodepoints(raw, TG_SAFE_BODY_MAX).text });
  await setAdminDmTemplates({ version: Number(tpls.version || 0) + 1, updatedAt: new Date().toISOString(), items });
  await renderAdminDmTemplateView(ctx, id, 0);
  return;
}
if (p.a === 'a:admin_outbox_clear_q') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return;
  const page = Math.max(0, Number(p.p) || 0);
  const kb = new InlineKeyboard().text('🧹 Очистить', commsCb.adminOutboxClear(page)).text('❌ Отмена', commsCb.adminOutbox(page));
  await safeEditOrReply(ctx, `🧹 <b>Очистить журнал исходящих?</b>\n\nБудет удалён только журнал в Redis. Уже отправленные сообщения в Telegram останутся у получателей.`, { parse_mode: 'HTML', reply_markup: kb });
  return;
}
if (p.a === 'a:admin_outbox_clear') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return;
  await clearAdminOutbox();
  await renderAdminOutbox(ctx, 0);
  return;
}
  })();
  return true;
}
