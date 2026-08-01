import { isAdminNoticeAction } from './policy.js';

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
  'clearDraft',
  'clearExpectText',
  'commsCb',
  'getSysNotice',
  'isSuperAdminTg',
  'kbAdminFooter',
  'normalizeNoticeSeverity',
  'normalizeNoticeTarget',
  'renderAdminSysNotice',
  'safeEditOrReply',
  'setExpectText',
  'setSysNotice',
]);

export async function handleAdminNoticeCallback(ctx, p, u, deps = {}) {
  if (!isAdminNoticeAction(p?.a)) return false;
  const bound = bindDependencies(deps, REQUIRED_DEPENDENCIES);
  const {
    InlineKeyboard,
    clearDraft,
    clearExpectText,
    commsCb,
    getSysNotice,
    isSuperAdminTg,
    kbAdminFooter,
    normalizeNoticeSeverity,
    normalizeNoticeTarget,
    renderAdminSysNotice,
    safeEditOrReply,
    setExpectText,
    setSysNotice,
  } = bound;

  await (async () => {
if (p.a === 'a:admin_notice') {
      await ctx.answerCallbackQuery();
      if (!isSuperAdminTg(ctx.from.id)) return;
      try { await clearExpectText(ctx.from.id); } catch {}
      try { await clearDraft(ctx.from.id); } catch {}
      await renderAdminSysNotice(ctx);
      return;
    }
if (p.a === 'a:admin_notice_toggle') {
      await ctx.answerCallbackQuery();
      if (!isSuperAdminTg(ctx.from.id)) return;
      const cur = await getSysNotice();
      cur.active = !cur.active;
      cur.updatedAt = new Date().toISOString();
      await setSysNotice(cur);
      await renderAdminSysNotice(ctx);
      return;
    }
if (p.a === 'a:admin_notice_sev') {
      await ctx.answerCallbackQuery();
      if (!isSuperAdminTg(ctx.from.id)) return;
      const cur = await getSysNotice();
      const order = ['info', 'warn', 'critical'];
      const now = normalizeNoticeSeverity(cur.severity);
      const i = order.indexOf(now);
      cur.severity = order[(i + 1 + order.length) % order.length];
      cur.updatedAt = new Date().toISOString();
      await setSysNotice(cur);
      await renderAdminSysNotice(ctx);
      return;
    }
if (p.a === 'a:admin_notice_target') {
      await ctx.answerCallbackQuery();
      if (!isSuperAdminTg(ctx.from.id)) return;
      const cur = await getSysNotice();
      const order = ['all', 'brand', 'creator'];
      const now = normalizeNoticeTarget(cur.target);
      const i = order.indexOf(now);
      cur.target = order[(i + 1 + order.length) % order.length];
      cur.updatedAt = new Date().toISOString();
      await setSysNotice(cur);
      await renderAdminSysNotice(ctx);
      return;
    }
if (p.a === 'a:admin_notice_cta') {
      await ctx.answerCallbackQuery();
      if (!isSuperAdminTg(ctx.from.id)) return;

      const kb = new InlineKeyboard().text('⬅️ Назад', commsCb.adminNotice());
      kbAdminFooter(kb, '⬅️ Коммуникации', 'a:admin_comms');

      await safeEditOrReply(
        ctx,
        `🔗 <b>CTA‑кнопка (опционально)</b>

Отправь одним сообщением:

1-я строка — текст кнопки (необязательно)
2-я строка — URL (обязательно, http/https)

Пример:
<pre>Подробнее
https://collabka.com/status</pre>

Команда: <code>clear</code> — убрать CTA.`,
        { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true }
      );

      await setExpectText(ctx.from.id, { type: 'admin_notice_cta' });
      return;
    }
if (p.a === 'a:admin_notice_expire') {
      await ctx.answerCallbackQuery();
      if (!isSuperAdminTg(ctx.from.id)) return;

      const kb = new InlineKeyboard().text('⬅️ Назад', commsCb.adminNotice());
      kbAdminFooter(kb, '⬅️ Коммуникации', 'a:admin_comms');

      await safeEditOrReply(
        ctx,
        `⏰ <b>Auto‑expire (опционально)</b>

Укажи дедлайн, после которого объявление <b>не показывается</b>.

Форматы:
• ISO со смещением: <code>2026-03-01T12:00:00-05:00</code>
• Epoch seconds: <code>1772366400</code>

Команда: <code>off</code> / <code>clear</code> — убрать expire.`,
        { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true }
      );

      await setExpectText(ctx.from.id, { type: 'admin_notice_expire' });
      return;
    }
if (p.a === 'a:admin_notice_clear') {
      await ctx.answerCallbackQuery();
      if (!isSuperAdminTg(ctx.from.id)) return;
      const cur = await getSysNotice();
      cur.text = '';
      cur.updatedAt = new Date().toISOString();
      await setSysNotice(cur);
      await renderAdminSysNotice(ctx);
      return;
    }
if (p.a === 'a:admin_notice_publish') {
      await ctx.answerCallbackQuery();
      if (!isSuperAdminTg(ctx.from.id)) return;
      const cur = await getSysNotice();
      if (!String(cur.text || '').trim()) {
        await ctx.answerCallbackQuery({ text: 'Сначала задай текст.', show_alert: true });
        await renderAdminSysNotice(ctx);
        return;
      }
      cur.version = Math.max(0, Number(cur.version || 0)) + 1;
      cur.active = true;
      cur.updatedAt = new Date().toISOString();
      await setSysNotice(cur);
      await ctx.answerCallbackQuery({ text: `Опубликовано: v${cur.version}` });
      await renderAdminSysNotice(ctx);
      return;
    }
if (p.a === 'a:admin_notice_text') {
      await ctx.answerCallbackQuery();
      if (!isSuperAdminTg(ctx.from.id)) return;

      const kb = new InlineKeyboard().text('⬅️ Назад', commsCb.adminNotice());
      kbAdminFooter(kb, '⬅️ Коммуникации', 'a:admin_comms');

      await safeEditOrReply(
        ctx,
        `📣 <b>Системное объявление</b>

Введи текст <b>одним сообщением</b>.
Команда: <code>clear</code> — очистить текст.

После сохранения нажми «🚀 Опубликовать», чтобы пользователи увидели новую версию.`,
        { parse_mode: 'HTML', reply_markup: kb }
      );

      await setExpectText(ctx.from.id, { type: 'admin_notice_text' });
      return;
    }
  })();
  return true;
}
