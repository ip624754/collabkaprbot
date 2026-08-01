import { isAdminUserAction } from './policy.js';

function bindDependencies(deps, names) {
  for (const name of names) {
    if (deps?.[name] === null || deps?.[name] === undefined) {
      throw new Error('admin_operations_domain.missing_dependency:' + name);
    }
  }
  return deps;
}

const REQUIRED_DEPENDENCIES = Object.freeze([
  'BRAND_PLANS',
  'CFG',
  'InlineKeyboard',
  'clearAdminUserNote',
  'clearAdminUsersQuery',
  'clearExpectText',
  'db',
  'escapeHtml',
  'getAdminDmTemplatesWithMeta',
  'getAdminUsersQuery',
  'isSuperAdminTg',
  'k',
  'kbAdminFooter',
  'redis',
  'renderAdminUserCard',
  'renderAdminUserNote',
  'renderAdminUsers',
  'safeEditOrReply',
  'sendAdminMessageToUser',
  'sendAdminUsersCsv',
  'setExpectText',
  'toggleAdminUserNoteTag',
]);

export async function handleAdminUsersCallback(ctx, p, u, deps = {}) {
  if (!isAdminUserAction(p?.a)) return false;
  const bound = bindDependencies(deps, REQUIRED_DEPENDENCIES);
  const {
    BRAND_PLANS,
    CFG,
    InlineKeyboard,
    clearAdminUserNote,
    clearAdminUsersQuery,
    clearExpectText,
    db,
    escapeHtml,
    getAdminDmTemplatesWithMeta,
    getAdminUsersQuery,
    isSuperAdminTg,
    k,
    kbAdminFooter,
    redis,
    renderAdminUserCard,
    renderAdminUserNote,
    renderAdminUsers,
    safeEditOrReply,
    sendAdminMessageToUser,
    sendAdminUsersCsv,
    setExpectText,
    toggleAdminUserNoteTag,
  } = bound;

  await (async () => {
if (p.a === 'a:admin_users') {
  const isAdmin = isSuperAdminTg(ctx.from.id);
  if (!isAdmin) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
  await ctx.answerCallbackQuery();

  // Cancel any pending expectText (e.g., users search input) when returning to list.
  try { await clearExpectText(ctx.from.id); } catch {}
  const f = String(p.f || 'all').toLowerCase();
  const page = Math.max(0, Number(p.p) || 0);
  await renderAdminUsers(ctx, f, page);
  return;
}
if (p.a === 'a:admin_users_search') {
  const isAdmin = isSuperAdminTg(ctx.from.id);
  if (!isAdmin) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
  await ctx.answerCallbackQuery();
  const f = String(p.f || 'all').toLowerCase();
  const kb = new InlineKeyboard()
    .text('⬅️ Отмена', `a:admin_users|f:${f}|p:0`)
    .row()
    .text('🧹 Сбросить поиск', `a:admin_users_reset|f:${f}|p:0`)
    .row()
    .text('⬅️ Система', 'a:admin_sys')
    .row()
    .text('📋 Меню', 'a:menu')
    .text('🏠 Домой', 'a:home');
  await safeEditOrReply(ctx, '🔎 Введи @username или tg_id (цифрами).', { reply_markup: kb });
  await setExpectText(ctx.from.id, { type: 'admin_users_search', f });
  return;
}
if (p.a === 'a:admin_users_reset') {
  const isAdmin = isSuperAdminTg(ctx.from.id);
  if (!isAdmin) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
  await ctx.answerCallbackQuery();
  try { await clearExpectText(ctx.from.id); } catch {}
  const f = String(p.f || 'all').toLowerCase();
  const page = Math.max(0, Number(p.p) || 0);
  await clearAdminUsersQuery(Number(ctx.from.id));
  await renderAdminUsers(ctx, f, page);
  return;
}
if (p.a === 'a:adm_ucard') {
  const isAdmin = isSuperAdminTg(ctx.from.id);
  if (!isAdmin) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
  await ctx.answerCallbackQuery();
  try { await clearExpectText(ctx.from.id); } catch {}
  const uid = Number(p.id || 0);
  const f = String(p.f || 'all').toLowerCase();
  const page = Math.max(0, Number(p.p) || 0);
  await renderAdminUserCard(ctx, uid, f, page);
  return;
}
if (p.a === 'a:adm_ucopy') {
  if (!isSuperAdminTg(ctx.from.id)) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
  const uid = Number(p.id || 0);
  const card = await db.getUserCardById(uid);
  const tgId = Number(card?.tg_id || 0);
  await ctx.answerCallbackQuery({ text: tgId ? `TG ID: ${tgId}` : 'TG ID не найден.', show_alert: true });
  return;
}
if (p.a === 'a:adm_ucsv') {
  if (!isSuperAdminTg(ctx.from.id)) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
  await ctx.answerCallbackQuery({ text: 'Готовлю CSV…' });
  const filter = String(p.f || 'all').toLowerCase();
  let q = '';
  try { q = String(await getAdminUsersQuery(Number(ctx.from.id)) || ''); } catch {}
  await sendAdminUsersCsv(ctx, filter, q);
  return;
}
if (p.a === 'a:adm_umsg') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
  try { await clearExpectText(ctx.from.id); } catch {}

  const uid = Number(p.id || 0);
  const f = String(p.f || 'all').toLowerCase();
  const page = Math.max(0, Number(p.p) || 0);

  const row = await db.getUserTgIdByUserId(uid);
  const targetTgId = Number(row?.tg_id || 0);
  const uname = row?.tg_username ? '@' + String(row.tg_username) : '—';

  if (!uid || !targetTgId) {
    await safeEditOrReply(ctx, '⚠️ Не удалось найти пользователя (нет tg_id).', {
      reply_markup: (() => {
        const kb = new InlineKeyboard().text('⬅️ К карточке', `a:adm_ucard|id:${uid}|f:${f}|p:${page}`);
        kbAdminFooter(kb, '⬅️ Операции', 'a:admin_ops');
        return kb;
      })()
    });
    return;
  }

  const kb = new InlineKeyboard();

  const { tpls } = await getAdminDmTemplatesWithMeta();
  const items = Array.isArray(tpls.items) ? tpls.items.slice(0, 12) : [];

  // Templates (2 columns) — компактнее и быстрее для админа
  for (let i = 0; i < items.length; i += 2) {
    const a = items[i];
    const b = items[i + 1];
    if (a) kb.text(String(a.label || '—'), `a:adm_umsg_tpl|id:${uid}|t:${String(a.id || '')}|f:${f}|p:${page}`);
    if (b) kb.text(String(b.label || '—'), `a:adm_umsg_tpl|id:${uid}|t:${String(b.id || '')}|f:${f}|p:${page}`);
    kb.row();
  }

  kb.text('📎 Вставить', `a:adm_ph|r:umsg|id:${uid}|f:${f}|p:${page}`)
    .text('✍️ Свободный текст', `a:adm_umsg_free|id:${uid}|f:${f}|p:${page}`)
    .row();

  kb.text('📌 Шаблоны (админ)', 'a:admin_umsg_tpls|p:0')
    .text('📤 Исходящие', 'a:admin_outbox|p:0')
    .row();

  kb.text('⬅️ Назад', `a:adm_ucard|id:${uid}|f:${f}|p:${page}`)
    .text('⬅️ Операции', 'a:admin_ops')
    .row();

  kb.text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');

  await safeEditOrReply(
    ctx,
    `✉️ <b>Сообщение пользователю</b>

User ID: <code>${uid}</code>
TG ID: <code>${targetTgId}</code>
Username: ${escapeHtml(uname)}

Выбери шаблон или отправь свой текст.`,
    { parse_mode: 'HTML', reply_markup: kb }
  );
  return;
}
if (p.a === 'a:adm_umsg_free') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

  const chatType = String(ctx.chat?.type || '');
  if (chatType !== 'private') {
    const uid = Number(p.id || 0);
    const f = String(p.f || 'all').toLowerCase();
    const page = Math.max(0, Number(p.p) || 0);
    await safeEditOrReply(ctx, '✍️ Свободный текст можно вводить только в личном чате с ботом (DM).\n\nОткрой бота в личке и повтори действие.', {
      reply_markup: (() => {
        const kb = new InlineKeyboard().text('⬅️ Назад', `a:adm_umsg|id:${uid}|f:${f}|p:${page}`);
        kbAdminFooter(kb, '⬅️ Операции', 'a:admin_ops');
        return kb;
      })()
    });
    return;
  }

  const uid = Number(p.id || 0);
  const f = String(p.f || 'all').toLowerCase();
  const page = Math.max(0, Number(p.p) || 0);
  const kb = new InlineKeyboard()
    .text('❌ Отмена', `a:adm_umsg|id:${uid}|f:${f}|p:${page}`)
    .row()
    .text('⬅️ К карточке', `a:adm_ucard|id:${uid}|f:${f}|p:${page}`)
    .row();

  kbAdminFooter(kb, '⬅️ Операции', 'a:admin_ops');
  await safeEditOrReply(
    ctx,
    `✍️ <b>Свободный текст</b>\n\nНапиши сообщение одним текстом (можно со ссылками).\n\nПотом я покажу предпросмотр и попрошу подтвердить отправку.`,
    { parse_mode: 'HTML', reply_markup: kb }
  );

  try {
    const row = await db.getUserTgIdByUserId(uid);
    await setExpectText(ctx.from.id, { type: 'adm_user_msg_text', uid, targetTgId: Number(row?.tg_id || 0), targetUsername: String(row?.tg_username || ''), f, page });
  } catch {
    // If Redis degraded, expectText may fail. Keep UX.
  }
  return;
}
if (p.a === 'a:adm_umsg_send') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
  try { await clearExpectText(ctx.from.id); } catch {}

  const f = String(p.f || 'all').toLowerCase();
  const page = Math.max(0, Number(p.p) || 0);
  const token = String(p.tk || '').trim();

  const withNext = String(p.wn || '') !== '0';

  // Fallback path when Redis was unavailable on preview step.
  const noStore = String(p.nostore || '') === '1';
  if (noStore) {
    const uid = Number(p.id || 0);
    const key = String(p.k || '').trim();
    const TPL = {
      ack: 'Принято ✅\n\nПриняли запрос. Если нужны детали — уточним и вернёмся с ответом.',
      need: 'Нужны детали ❓\n\nУточни, пожалуйста: шаги воспроизведения + что видишь на экране. Если есть — скрин/видео.',
      done: 'Готово ✅\n\nСделали. Проверь, пожалуйста, сейчас. Если что-то ещё — напиши в поддержку.',
      wip: 'В работе ⏳\n\nПриняли в работу. Вернёмся с обновлением, как только будет результат.',
      pay: 'По оплате/кредитам 💳\n\nПосмотрели ситуацию. Если видишь несоответствие — пришли, пожалуйста, скрин и время операции (по МСК).',
      limit: 'Ограничение ℹ️\n\nСейчас действие недоступно из-за ограничения/статуса. Если это неожиданно — напиши в поддержку, мы проверим.',
    };
    const plain = TPL[key] || '';
    if (!plain) return ctx.answerCallbackQuery({ text: 'Шаблон не найден.' });
    const row = await db.getUserTgIdByUserId(uid);
    const targetTgId = Number(row?.tg_id || 0);
    if (!targetTgId) return ctx.answerCallbackQuery({ text: 'Нет TG ID.' });
    const payload = {
      byAdminTgId: Number(ctx.from.id),
      targetUserId: uid,
      targetTgId,
      targetUsername: String(row?.tg_username || ''),
      templateRaw: plain,
    };
    await sendAdminMessageToUser(ctx, payload, { f, page, backUid: uid, withNext });
    return;
  }

  if (!token) return ctx.answerCallbackQuery({ text: 'Сессия истекла.' });

  let data = null;
  try { data = await redis.get(k(['adm_umsg', token])); } catch { data = null; }
  if (!data || Number(data.byAdminTgId || 0) !== Number(ctx.from.id)) {
    await safeEditOrReply(ctx, '⚠️ Сессия истекла. Открой сообщение заново.', {
      reply_markup: (() => {
      const kb = new InlineKeyboard();
      kbAdminFooter(kb, '⬅️ Операции', 'a:admin_ops');
      return kb;
    })()
    });
    return;
  }

  await sendAdminMessageToUser(ctx, data, { f, page, backUid: Number(data.targetUserId || 0), withNext });
  try { await redis.del(k(['adm_umsg', token])); } catch {}
  return;
}
if (p.a === 'a:adm_unote') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return;
  try { await clearExpectText(ctx.from.id); } catch {}
  const uid = Number(p.id || 0);
  const f = String(p.f || 'all').toLowerCase();
  const page = Math.max(0, Number(p.p) || 0);
  await renderAdminUserNote(ctx, uid, f, page);
  return;
}
if (p.a === 'a:adm_unote_edit') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return;
  try { await clearExpectText(ctx.from.id); } catch {}

  const uid = Number(p.id || 0);
  const f = String(p.f || 'all').toLowerCase();
  const page = Math.max(0, Number(p.p) || 0);

  const kb = new InlineKeyboard()
    .text('⬅️ К карточке', `a:adm_ucard|id:${uid}|f:${f}|p:${page}`)
    .text('🧹 Очистить', `a:adm_unote_clear_q|id:${uid}|f:${f}|p:${page}`)
    .row();
  kbAdminFooter(kb, '⬅️ Пользователи', `a:admin_users|f:${f}|p:${page}`);

  await safeEditOrReply(
    ctx,
    `✏️ <b>Заметка админа</b>

Отправь заметку <b>одним сообщением</b>.

Команды:
• <code>clear</code> — очистить заметку
• <code>/cancel</code> — отмена (вернёт к карточке)`,
    { parse_mode: 'HTML', reply_markup: kb }
  );

  await setExpectText(ctx.from.id, { type: 'adm_user_note', uid, f, page }, 20 * 60);
  return;
}
if (p.a === 'a:adm_unote_tag') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return;
  try { await clearExpectText(ctx.from.id); } catch {}

  const uid = Number(p.id || 0);
  const tagId = String(p.t || '').trim();
  const f = String(p.f || 'all').toLowerCase();
  const page = Math.max(0, Number(p.p) || 0);

  if (uid && tagId) {
    await toggleAdminUserNoteTag(uid, tagId, { byAdminTgId: ctx.from.id, byAdminUsername: String(ctx.from?.username || '') });
  }

  await renderAdminUserNote(ctx, uid, f, page);
  return;
}
if (p.a === 'a:adm_unote_clear_q') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return;

  const uid = Number(p.id || 0);
  const f = String(p.f || 'all').toLowerCase();
  const page = Math.max(0, Number(p.p) || 0);

  const kb = new InlineKeyboard()
    .text('🧹 Очистить', `a:adm_unote_clear|id:${uid}|f:${f}|p:${page}`)
    .text('❌ Отмена', `a:adm_unote|id:${uid}|f:${f}|p:${page}`)
    .row()
    .text('⬅️ К карточке', `a:adm_ucard|id:${uid}|f:${f}|p:${page}`)
    .row();

  kbAdminFooter(kb, '⬅️ Операции', 'a:admin_ops');

  await safeEditOrReply(ctx, '🧹 <b>Очистить заметку и теги?</b>', { parse_mode: 'HTML', reply_markup: kb });
  return;
}
if (p.a === 'a:adm_unote_clear') {
  await ctx.answerCallbackQuery();
  if (!isSuperAdminTg(ctx.from.id)) return;
  try { await clearExpectText(ctx.from.id); } catch {}

  const uid = Number(p.id || 0);
  const f = String(p.f || 'all').toLowerCase();
  const page = Math.max(0, Number(p.p) || 0);

  await clearAdminUserNote(uid);
  await renderAdminUserNote(ctx, uid, f, page);
  return;
}
if (p.a === 'a:adm_uban_q') {
  if (!isSuperAdminTg(ctx.from.id)) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
  await ctx.answerCallbackQuery();
  const uid = Number(p.id || 0);
  const ban = String(p.v || '1') === '1';
  const f = String(p.f || 'all').toLowerCase();
  const page = Math.max(0, Number(p.p) || 0);
  const kb = new InlineKeyboard()
    .text(ban ? '🚫 Заблокировать' : '✅ Разбанить', `a:adm_uban_do|id:${uid}|v:${ban ? 1 : 0}|f:${f}|p:${page}`)
    .text('❌ Отмена', `a:adm_ucard|id:${uid}|f:${f}|p:${page}`);
  await safeEditOrReply(ctx, `${ban ? '🚫' : '✅'} <b>Подтверждение</b>

${ban ? 'Заблокировать' : 'Разбанить'} пользователя?`, { parse_mode: 'HTML', reply_markup: kb });
  return;
}
if (p.a === 'a:adm_uban_do') {
  if (!isSuperAdminTg(ctx.from.id)) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
  const uid = Number(p.id || 0);
  const ban = String(p.v || '1') === '1';
  const f = String(p.f || 'all').toLowerCase();
  const page = Math.max(0, Number(p.p) || 0);
  if (ban) await db.banUser(uid); else await db.unbanUser(uid);
  await ctx.answerCallbackQuery({ text: ban ? 'Пользователь заблокирован.' : 'Пользователь разбанен.' });
  await renderAdminUserCard(ctx, uid, f, page);
  return;
}
if (p.a === 'a:adm_urevoke_q') {
  if (!isSuperAdminTg(ctx.from.id)) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
  await ctx.answerCallbackQuery();
  const uid = Number(p.id || 0);
  const type = String(p.t || '');
  const f = String(p.f || 'all').toLowerCase();
  const page = Math.max(0, Number(p.p) || 0);
  const labels = { bp: 'Brand Plan', bp_gcr: 'Brand Plan + подарочные кредиты', gcr: 'подарочные кредиты', pro: 'PRO', cr: 'все кредиты' };
  const kb = new InlineKeyboard()
    .text('⛔ Подтвердить', `a:adm_urevoke_do|id:${uid}|t:${type}|f:${f}|p:${page}`)
    .text('❌ Отмена', `a:adm_ucard|id:${uid}|f:${f}|p:${page}`);
  await safeEditOrReply(ctx, `⛔ <b>Подтверждение</b>

Забрать: <b>${escapeHtml(labels[type] || type)}</b>?`, { parse_mode: 'HTML', reply_markup: kb });
  return;
}
if (p.a === 'a:adm_urevoke_do') {
  if (!isSuperAdminTg(ctx.from.id)) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
  const uid = Number(p.id || 0);
  const type = String(p.t || '');
  const f = String(p.f || 'all').toLowerCase();
  const page = Math.max(0, Number(p.p) || 0);
  if (type === 'bp') await db.revokeBrandPlan(uid);
  else if (type === 'bp_gcr') { await db.revokeBrandPlan(uid); await db.revokeGiftedBrandCredits(uid); }
  else if (type === 'gcr') await db.revokeGiftedBrandCredits(uid);
  else if (type === 'pro') await db.revokeAllWorkspacePro(uid);
  else if (type === 'cr') await db.resetBrandCredits(uid);
  else { await ctx.answerCallbackQuery({ text: 'Неизвестный тип.' }); return; }
  await ctx.answerCallbackQuery({ text: 'Изменение применено ✅' });
  await renderAdminUserCard(ctx, uid, f, page);
  return;
}
if (p.a === 'a:adm_ugift') {
  if (!isSuperAdminTg(ctx.from.id)) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
  await ctx.answerCallbackQuery();
  const uid = Number(p.id || 0);
  const f = String(p.f || 'all').toLowerCase();
  const page = Math.max(0, Number(p.p) || 0);
  const card = await db.getUserCardById(uid);
  const username = String(card?.tg_username || '').replace(/^@/, '').trim().toLowerCase();
  if (!card || !username) {
    await safeEditOrReply(ctx, '⚠️ Для подарка нужен username пользователя.', { reply_markup: new InlineKeyboard().text('⬅️ К карточке', `a:adm_ucard|id:${uid}|f:${f}|p:${page}`) });
    return;
  }
  const kb = new InlineKeyboard()
    .text(`⭐️ Brand Plan Старт (${CFG.BRAND_PLAN_DURATION_DAYS}д)`, `a:adm_ugift_do|id:${uid}|t:bp_start|f:${f}|p:${page}`).row()
    .text(`🚀 Brand Plan Про (${CFG.BRAND_PLAN_DURATION_DAYS}д)`, `a:adm_ugift_do|id:${uid}|t:bp_pro|f:${f}|p:${page}`).row()
    .text(`✨ PRO Креатор (${CFG.PRO_DURATION_DAYS}д)`, `a:adm_ugift_do|id:${uid}|t:pro|f:${f}|p:${page}`).row()
    .text('⬅️ К карточке', `a:adm_ucard|id:${uid}|f:${f}|p:${page}`);
  await safeEditOrReply(ctx, `🎁 <b>Подарить подписку</b>

Пользователь: <b>@${escapeHtml(username)}</b>`, { parse_mode: 'HTML', reply_markup: kb });
  return;
}
if (p.a === 'a:adm_ugift_do') {
  if (!isSuperAdminTg(ctx.from.id)) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
  const uid = Number(p.id || 0);
  const giftType = String(p.t || '');
  const f = String(p.f || 'all').toLowerCase();
  const page = Math.max(0, Number(p.p) || 0);
  const card = await db.getUserCardById(uid);
  if (!card) { await ctx.answerCallbackQuery({ text: 'Пользователь не найден.' }); return; }
  if (giftType === 'bp_start' || giftType === 'bp_pro') {
    const planId = giftType === 'bp_start' ? 'start' : 'pro';
    const planDef = BRAND_PLANS.find((pl) => pl.id === planId);
    await db.activateBrandPlan(uid, planId, CFG.BRAND_PLAN_DURATION_DAYS);
    if (planDef?.credits) await db.addGiftedBrandCredits(uid, planDef.credits);
  } else if (giftType === 'pro') {
    const wsList = await db.listWorkspaces(uid);
    for (const ws of wsList) await db.activateWorkspacePro(ws.id, CFG.PRO_DURATION_DAYS);
  } else {
    await ctx.answerCallbackQuery({ text: 'Неизвестный тип подарка.' });
    return;
  }
  await ctx.answerCallbackQuery({ text: 'Подарок применён ✅' });
  await renderAdminUserCard(ctx, uid, f, page);
  return;
}
  })();
  return true;
}
