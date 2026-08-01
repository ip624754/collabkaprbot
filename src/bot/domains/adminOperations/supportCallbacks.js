import { isAdminSupportAction } from './policy.js';

function bindDependencies(deps, names) {
  for (const name of names) {
    if (deps?.[name] === null || deps?.[name] === undefined) {
      throw new Error('admin_operations_domain.missing_dependency:' + name);
    }
  }
  return deps;
}

const REQUIRED_DEPENDENCIES = Object.freeze([
  'DEGRADED_COPY',
  'InlineKeyboard',
  'TG_SAFE_BODY_MAX',
  'clearExpectText',
  'clipCodepoints',
  'db',
  'escapeHtml',
  'isSuperAdminTg',
  'k',
  'redis',
  'renderAdminSupportHome',
  'renderAdminSupportList',
  'renderAdminSupportThread',
  'safeEditOrReply',
  'setExpectText',
]);

export async function handleAdminSupportCallback(ctx, p, u, deps = {}) {
  if (!isAdminSupportAction(p?.a)) return false;
  const bound = bindDependencies(deps, REQUIRED_DEPENDENCIES);
  const {
    DEGRADED_COPY,
    InlineKeyboard,
    TG_SAFE_BODY_MAX,
    clearExpectText,
    clipCodepoints,
    db,
    escapeHtml,
    isSuperAdminTg,
    k,
    redis,
    renderAdminSupportHome,
    renderAdminSupportList,
    renderAdminSupportThread,
    safeEditOrReply,
    setExpectText,
  } = bound;

  await (async () => {
if (p.a === 'a:admin_support') {
  const isAdmin = isSuperAdminTg(ctx.from.id);
  if (!isAdmin) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
  await ctx.answerCallbackQuery();
  try { await clearExpectText(ctx.from.id); } catch {}
  await renderAdminSupportHome(ctx);
  return;
}
if (p.a === 'a:admin_support_list') {
  const isAdmin = isSuperAdminTg(ctx.from.id);
  if (!isAdmin) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
  await ctx.answerCallbackQuery();
  try { await clearExpectText(ctx.from.id); } catch {}
  await renderAdminSupportList(ctx, String(p.s || 'all'), Math.max(0, Number(p.p || 0) || 0));
  return;
}
if (p.a === 'a:admin_support_view') {
  const isAdmin = isSuperAdminTg(ctx.from.id);
  if (!isAdmin) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
  await ctx.answerCallbackQuery();
  try { await clearExpectText(ctx.from.id); } catch {}
  await renderAdminSupportThread(ctx, Number(p.id || 0), { backStatus: String(p.s || 'all'), page: Math.max(0, Number(p.p || 0) || 0) });
  return;
}
if (p.a === 'a:admin_support_set') {
  const isAdmin = isSuperAdminTg(ctx.from.id);
  if (!isAdmin) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
  const threadId = Number(p.id || 0);
  const status = String(p.st || 'open');
  const backStatus = String(p.s || 'all');
  const backPage = Math.max(0, Number(p.p || 0) || 0);
  const statusLabel = status === 'closed' ? 'закрыт' : status === 'waiting_operator' ? 'переоткрыт' : 'обновлён';
  const statusSummary = status === 'closed'
    ? 'Тикет закрыт оператором.'
    : status === 'waiting_operator'
      ? 'Тикет переоткрыт и ждёт оператора.'
      : 'Статус тикета обновлён.';
  const res = await db.setSupportThreadStatusForAdmin({
    threadId,
    status,
    operatorTgId: Number(ctx.from.id || 0),
    summary: statusSummary,
  });
  if (!res?.ok) {
    await ctx.answerCallbackQuery({ text: 'Не удалось обновить тикет.' });
    await renderAdminSupportThread(ctx, threadId, { backStatus, page: backPage });
    return;
  }
  await ctx.answerCallbackQuery({ text: `✅ Тикет ${statusLabel}` });
  await renderAdminSupportThread(ctx, threadId, { backStatus, page: backPage });
  return;
}
if (p.a === 'a:adm_support_qr') {
  if (!isSuperAdminTg(ctx.from.id)) {
    try { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); } catch {}
    return;
  }
  const targetTgId = Number(p.tg || 0);
  const targetUserId = Number(p.uid || 0);
  const supportThreadId = Number(p.th || 0);
  const key = String(p.k || '').trim();
  if (!targetTgId) {
    try { await ctx.answerCallbackQuery({ text: 'Нет TG ID.' }); } catch {}
    return;
  }
  const TPL = {
    ack: 'Принято ✅\n\nПриняли запрос. Сейчас посмотрим и вернёмся с ответом.',
    need: 'Нужны детали ❓\n\nУточни, пожалуйста: что именно не получается (шаги), и если есть — скрин/ошибка.',
    done: 'Готово ✅\n\nСделали. Проверь, пожалуйста, сейчас. Если что — напиши ещё раз.',
    wip: 'В работе ⏳\n\nПриняли в работу. Дадим обновление, как только будет результат.',
  };
  const raw = TPL[key] || '';
  if (!raw) {
    try { await ctx.answerCallbackQuery({ text: 'Шаблон не найден.' }); } catch {}
    return;
  }
  const safe = clipCodepoints(raw, TG_SAFE_BODY_MAX).text;
  const userMsg = `💬 <b>Ответ поддержки</b>\n\n${escapeHtml(safe)}\n\n<i>Можешь просто ответить следующим сообщением — я отправлю это в тот же диалог с поддержкой.</i>`;
  let ok = false;
  try {
    const kb = new InlineKeyboard().text('💬 Поддержка', 'a:support').text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');
    await ctx.api.sendMessage(targetTgId, userMsg, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
    ok = true;
  } catch {
    try { await ctx.answerCallbackQuery({ text: '❌ Не удалось отправить (возможно, бот заблокирован).', show_alert: true }); } catch {}
  }
  if (ok) {
    try {
      await db.markSupportThreadOperatorReply({
        threadId: supportThreadId,
        userId: targetUserId,
        userTgId: targetTgId,
        operatorTgId: Number(ctx.from.id || 0),
        status: key === 'done' ? 'closed' : 'waiting_user',
        close: key === 'done',
        summary: safe,
      });
    } catch {}
    try { await ctx.answerCallbackQuery({ text: key === 'done' ? '✅ Отправлено и закрыто' : '✅ Отправлено пользователю' }); } catch {}
    try {
      const forumThreadId = Number(ctx.callbackQuery?.message?.message_thread_id || 0);
      const threadTail = supportThreadId ? `|th:${supportThreadId}` : '';
      const kb = new InlineKeyboard()
        .text('✍️ Ещё ответ', `a:adm_support_reply|tg:${targetTgId}|uid:${targetUserId || 0}${threadTail}`)
        .text('👤 Карточка', `a:adm_ucard|id:${targetUserId || 0}|f:all|p:0`)
        .row()
        .text('⬅️ Операции', 'a:admin_ops')
        .row()
        .text('📋 Меню', 'a:menu')
        .text('🏠 Домой', 'a:home');
      const out = key === 'done'
        ? `✅ Быстрый ответ отправлен и тикет отмечен как <b>closed</b> (tg:${targetTgId}).`
        : `✅ Быстрый ответ отправлен (tg:${targetTgId}).`;
      const opts = { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true };
      if (forumThreadId) opts.message_thread_id = forumThreadId;
      await ctx.api.sendMessage(ctx.chat.id, out, opts);
    } catch {}
  }
  return;
}
if (p.a === 'a:adm_support_reply') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return;
  const targetTgId = Number(p.tg || 0);
  const targetUserId = Number(p.uid || 0);
  const supportThreadId = Number(p.th || 0);
  if (!targetTgId) return ctx.answerCallbackQuery({ text: 'Нет TG ID.' });
  const chatType = String(ctx.chat?.type || '');
  const isPrivate = chatType === 'private';
  if (isPrivate) {
    const kb = new InlineKeyboard().text('❌ Отмена', 'a:admin_home');
    await safeEditOrReply(ctx, `✍️ <b>Ответ пользователю</b> (tg:${targetTgId})

Напиши текст ответа одним сообщением — я отправлю его пользователю от имени поддержки.`, { parse_mode: 'HTML', reply_markup: kb });
    await setExpectText(ctx.from.id, { type: 'adm_support_reply', targetTgId, targetUserId, threadId: supportThreadId });
    return;
  }
  const exSec = 20 * 60;
  const sessionKey = k(['adm_support_reply', String(ctx.from.id)]);
  const originMsgId = Number(ctx.callbackQuery?.message?.message_id || 0);
  const originTopicThreadId = Number(ctx.callbackQuery?.message?.message_thread_id || 0);
  const promptText = `✍️ <b>Ответ пользователю</b> (tg:${targetTgId})

Отправь текст <b>Reply</b> на <b>тикет</b> (сообщение с кнопками) или на <b>эту подсказку</b> — я доставлю его пользователю от имени поддержки.

<i>Отмена:</i> нажми «❌ Отмена» (или ответь <code>/cancel</code>).`;
  const kb = new InlineKeyboard().text('❌ Отмена', 'a:adm_support_reply_cancel');
  const sendOpts = { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb };
  if (originTopicThreadId) sendOpts.message_thread_id = originTopicThreadId;
  const prompt = await ctx.api.sendMessage(ctx.chat.id, promptText, sendOpts);
  let sessionOk = false;
  try {
    await redis.set(sessionKey, {
      targetTgId,
      targetUserId,
      supportThreadId,
      chatId: ctx.chat.id,
      promptMsgId: prompt.message_id,
      originMsgId,
      topicThreadId: originTopicThreadId,
      createdAt: new Date().toISOString(),
    }, { ex: exSec });
    sessionOk = true;
  } catch { sessionOk = false; }
  if (!sessionOk) {
    const failText = `⚠️ <b>Сейчас кеш/сессии недоступны</b>

Я не могу принять ответ в группе.

${DEGRADED_COPY.line}

Что можно сделать:
• Используй «Быстрый ответ» (кнопки-шаблоны)
• Попробуй позже

<i>Эта сессия не активна.</i>`;
    try {
      await ctx.api.editMessageText(ctx.chat.id, prompt.message_id, failText, {
        parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: new InlineKeyboard(),
      });
    } catch {}
  }
  return;
}
if (p.a === 'a:adm_support_reply_cancel') {
  try { await ctx.answerCallbackQuery(); } catch {}
  if (!isSuperAdminTg(ctx.from.id)) return;
  const chatId = Number(ctx.chat?.id || 0);
  const msgId = Number(ctx.callbackQuery?.message?.message_id || 0);
  const sessKey = k(['adm_support_reply', String(ctx.from.id)]);
  let sess = null;
  let redisOk = true;
  try { sess = await redis.get(sessKey); } catch { redisOk = false; sess = null; }
  if (sess && msgId && Number(sess.promptMsgId || 0) && Number(sess.promptMsgId || 0) !== msgId) {
    try { await ctx.answerCallbackQuery({ text: 'Сессия уже другая.', show_alert: true }); } catch {}
    return;
  }
  let delOk = false;
  if (redisOk) {
    try { await redis.del(sessKey); delOk = true; } catch { delOk = false; }
  }
  let textOut = '';
  if (!redisOk) textOut = `⚠️ <b>Отмена не подтверждена</b>

Кеш недоступен. Сессия могла остаться активной. Лучше не отвечай на этот промпт и попробуй позже.`;
  else if (!sess) textOut = `⏱ <b>Сессия уже завершена</b>

Если нужно — нажми «✍️ Ответить» ещё раз.`;
  else if (delOk) textOut = `❌ <b>Отменено</b>

Ответ не будет отправлен.`;
  else textOut = `⚠️ <b>Не удалось отменить</b>

Кеш недоступен. Сессия могла остаться активной. Лучше не отвечай на этот промпт и попробуй позже.`;
  try {
    await ctx.api.editMessageText(chatId, msgId, textOut, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: new InlineKeyboard(),
    });
  } catch {}
  return;
}
  })();
  return true;
}
