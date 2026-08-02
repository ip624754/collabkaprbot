import { isAdminDeliveryHardSkipAction } from './policy.js';

function bindDependencies(deps, names) {
  for (const name of names) {
    if (deps?.[name] === null || deps?.[name] === undefined) {
      throw new Error('admin_system_domain.missing_dependency:' + name);
    }
  }
  return deps;
}

const REQUIRED_DEPENDENCIES = Object.freeze([
  'InputFile',
  'InlineKeyboard',
  'adminHardSkipHitsExport',
  'adminHardSkipUnskip',
  'clearExpectText',
  'isSuperAdminTg',
  'navKb',
  'renderAdminHardSkipHits',
  'renderAdminHardSkipHome',
  'renderAdminHardSkipView',
  'safeEditOrReply',
  'setExpectText',
]);

export async function handleAdminDeliveryHardSkipCallback(ctx, p, u, deps = {}) {
  if (!isAdminDeliveryHardSkipAction(p?.a)) return false;
  const bound = bindDependencies(deps, REQUIRED_DEPENDENCIES);
  const {
    InputFile,
    InlineKeyboard,
    adminHardSkipHitsExport,
    adminHardSkipUnskip,
    clearExpectText,
    isSuperAdminTg,
    navKb,
    renderAdminHardSkipHits,
    renderAdminHardSkipHome,
    renderAdminHardSkipView,
    safeEditOrReply,
    setExpectText,
  } = bound;

  await (async () => {
    if (p.a === 'a:hs_home') {
      const isAdmin = isSuperAdminTg(ctx.from.id);
      if (!isAdmin) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
      await ctx.answerCallbackQuery();
      try { await clearExpectText(ctx.from.id); } catch {}
      await renderAdminHardSkipHome(ctx, Math.max(0, Number(p.p || 0) || 0));
      return;
    }

if (p.a === 'a:hs_hits') {
  const isAdmin = isSuperAdminTg(ctx.from.id);
  if (!isAdmin) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
  await ctx.answerCallbackQuery();
  try { await clearExpectText(ctx.from.id); } catch {}
  await renderAdminHardSkipHits(ctx, Math.max(0, Number(p.p || 0) || 0), p.r || 'all');
  return;
}

    if (p.a === 'a:hs_find') {
      const isAdmin = isSuperAdminTg(ctx.from.id);
      if (!isAdmin) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
      await ctx.answerCallbackQuery();
      const page = Math.max(0, Number(p.p || 0) || 0);
      await safeEditOrReply(ctx, '🔎 Введи Telegram ID, чтобы проверить статус доставки.\n\nПример: <code>222047659</code>', {
        parse_mode: 'HTML',
        reply_markup: navKb('a:hs_home|p:' + page)
      });
      try { await setExpectText(ctx.from.id, { type: 'hs_find', backCb: `a:hs_home|p:${page}` }, 10 * 60); } catch {}
      return;
    }
    if (p.a === 'a:hs_view') {
      const isAdmin = isSuperAdminTg(ctx.from.id);
      if (!isAdmin) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
      await ctx.answerCallbackQuery();
      await renderAdminHardSkipView(ctx, Number(p.tg || 0));
      return;
    }
    if (p.a === 'a:hs_unskip') {
      const isAdmin = isSuperAdminTg(ctx.from.id);
      if (!isAdmin) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
      await ctx.answerCallbackQuery();
      const tgId = Number(p.tg || 0);
      await adminHardSkipUnskip(tgId);
      await renderAdminHardSkipView(ctx, tgId, { toast: '✅ Снято' });
      return;
    }

    if (p.a === 'a:hs_hits_export') {
      const isAdmin = isSuperAdminTg(ctx.from.id);
      if (!isAdmin) { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); return; }
      await ctx.answerCallbackQuery({ text: 'Готовлю экспорт…' });
      const page = Math.max(0, Number(p.p || 0) || 0);
      const rf = String(p.r || 'all').trim().toLowerCase() || 'all';
      const ex = await adminHardSkipHitsExport(rf);
      if (!ex.ok) {
        await renderAdminHardSkipHits(ctx, page, rf, { toast: '⚠️ Redis недоступен — экспорт временно недоступен.' });
        return;
      }

      const tag = String(rf || 'all').toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 24) || 'all';
      const ts = new Date().toISOString().slice(0, 10);
      const header = [
        'Collabka PR — Hard-skip HIT Export',
        `Exported: ${new Date().toISOString()}`,
        `Filter: ${tag}`,
        `Rows: ${ex.items.length}/${ex.total}`,
        `Scan window: ${ex.scanN}`,
        '---',
      ].join('\n');
      const body = (ex.items || []).map((it) => {
        const bc = it.broadcastId ? ` | bc:${it.broadcastId}` : '';
        const uid = it.userId ? ` | uid:${it.userId}` : '';
        const via = it.via ? ` | via:${it.via}` : '';
        return `${it.at || '—'} | tg:${it.tgId} | ${it.r}${bc}${uid}${via}`;
      }).join('\n');
      const txt = header + '\n' + (body || 'EMPTY');
      const filename = `hard_skip_hits_${tag}_${ts}.txt`;

      await ctx.replyWithDocument(
        new InputFile(Buffer.from(txt, 'utf-8'), filename),
        {
          caption: `📤 Экспорт: ${ex.items.length} событий · фильтр: ${tag}`,
          reply_markup: new InlineKeyboard()
            .text('🧾 Пропуски', `a:hs_hits|p:${page}|r:${rf}`)
            .text('⬅️ Система', 'a:admin_sys')
            .row()
            .text('📋 Меню', 'a:menu')
            .text('🏠 Домой', 'a:home')
        }
      );

      await renderAdminHardSkipHits(ctx, page, rf, { toast: `📤 Экспорт готов: ${ex.items.length}` });
      return;
    }
  })();
  return true;
}
