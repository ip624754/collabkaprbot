import { isWorkspaceProfileAction } from './policy.js';

function bindDependencies(deps, names) {
  for (const name of names) {
    if (deps?.[name] === null || deps?.[name] === undefined) {
      throw new Error('workspace_domain.missing_dependency:' + name);
    }
  }
  return deps;
}

const REQUIRED_DEPENDENCIES = Object.freeze([
  'InlineKeyboard',
  'answerRecovery',
  'clearExpectText',
  'db',
  'deLinkifyText',
  'detectLegacyContactForMigration',
  'escapeHtml',
  'isSuperAdminTg',
  'navKb',
  'renderStaleButton',
  'renderWsProfile',
  'renderWsProfileContactsClearMenu',
  'renderWsProfileContactsStructured',
  'renderWsProfileFormats',
  'renderWsProfileMode',
  'renderWsProfileVerticals',
  'safeEditOrReply',
  'setExpectText',
  'wsProfileContactsObj',
]);

export async function handleWorkspaceProfileCallback(ctx, p, u, deps = {}) {
  if (!isWorkspaceProfileAction(p?.a)) return false;
  const bound = bindDependencies(deps, REQUIRED_DEPENDENCIES);
  const {
    InlineKeyboard,
    answerRecovery,
    clearExpectText,
    db,
    deLinkifyText,
    detectLegacyContactForMigration,
    escapeHtml,
    isSuperAdminTg,
    navKb,
    renderStaleButton,
    renderWsProfile,
    renderWsProfileContactsClearMenu,
    renderWsProfileContactsStructured,
    renderWsProfileFormats,
    renderWsProfileMode,
    renderWsProfileVerticals,
    safeEditOrReply,
    setExpectText,
    wsProfileContactsObj,
  } = bound;

  await (async () => {
    if (p.a === 'a:ws_profile') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const wsId = Number(p.w || p.ws || 0);
      if (!wsId) {
        await safeEditOrReply(ctx, '⚠️ Канал не выбран. Открой 📋 Меню → выбери канал и повтори шаг.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') });
        return;
      }
      await renderWsProfile(ctx, u.id, wsId);
      return;
    }

    if (p.a === 'a:ws_prof_mode') {
          await ctx.answerCallbackQuery();
          await renderWsProfileMode(ctx, u.id, Number(p.ws));
          return;
        }

    if (p.a === 'a:ws_prof_mode_set') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws);
      const mode = String(p.m || 'both');
      const allowed = ['channel', 'ugc', 'both'];
      if (!allowed.includes(mode)) return ctx.answerCallbackQuery({ text: 'Неверный режим.' });
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      await db.setWorkspaceSetting(wsId, { profile_mode: mode });
      await db.auditWorkspace(wsId, u.id, 'ws.profile_mode_updated', { mode });
      await renderWsProfileMode(ctx, u.id, wsId);
      return;
    }

    if (p.a === 'a:ws_prof_verticals') {
      await ctx.answerCallbackQuery();
      await renderWsProfileVerticals(ctx, u.id, Number(p.ws));
      return;
    }

    if (p.a === 'a:ws_prof_vert_t') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const key = String(p.v || '');
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');

      const cur = Array.isArray(ws.profile_verticals) ? ws.profile_verticals.map(String) : [];
      const has = cur.includes(key);
      let next = cur.filter(x => x !== key);
      if (!has) {
        if (cur.length >= 3) {
          await ctx.answerCallbackQuery({ text: 'Максимум 3 ниши.', show_alert: true });
          return renderWsProfileVerticals(ctx, u.id, wsId);
        }
        next = [...cur, key];
      }
      await db.setWorkspaceSetting(wsId, { profile_verticals: next });
      await db.auditWorkspace(wsId, u.id, 'ws.profile_verticals_updated', { count: next.length });
      await renderWsProfileVerticals(ctx, u.id, wsId);
      return;
    }

    if (p.a === 'a:ws_prof_vert_clear') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      await db.setWorkspaceSetting(wsId, { profile_verticals: [] });
      await db.auditWorkspace(wsId, u.id, 'ws.profile_verticals_cleared', {});
      await renderWsProfileVerticals(ctx, u.id, wsId);
      return;
    }

    if (p.a === 'a:ws_prof_formats') {
      await ctx.answerCallbackQuery();
      await renderWsProfileFormats(ctx, u.id, Number(p.ws));
      return;
    }

    if (p.a === 'a:ws_prof_fmt_t') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const key = String(p.f || '');
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');

      const cur = Array.isArray(ws.profile_formats) ? ws.profile_formats.map(String) : [];
      const has = cur.includes(key);
      let next = cur.filter(x => x !== key);
      if (!has) {
        if (cur.length >= 5) {
          await ctx.answerCallbackQuery({ text: 'Максимум 5 форматов.', show_alert: true });
          return renderWsProfileFormats(ctx, u.id, wsId);
        }
        next = [...cur, key];
      }
      await db.setWorkspaceSetting(wsId, { profile_formats: next });
      await db.auditWorkspace(wsId, u.id, 'ws.profile_formats_updated', { count: next.length });
      await renderWsProfileFormats(ctx, u.id, wsId);
      return;
    }

    if (p.a === 'a:ws_prof_fmt_clear') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');
      await db.setWorkspaceSetting(wsId, { profile_formats: [] });
      await db.auditWorkspace(wsId, u.id, 'ws.profile_formats_cleared', {});
      await renderWsProfileFormats(ctx, u.id, wsId);
      return;
    }

    if (p.a === 'a:ws_prof_contacts') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      if (!wsId) { await renderStaleButton(ctx, { text: '⚠️ Кнопка устарела. Открой 📋 Меню → выбери канал и повтори.', backCb: 'a:ws_list' }); return; }
      await renderWsProfileContactsStructured(ctx, u.id, wsId);
      return;
    }

    if (p.a === 'a:ws_prof_contacts_migrate') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      if (!wsId) { await renderStaleButton(ctx, { text: '⚠️ Кнопка устарела. Открой 📋 Меню → выбери канал и повтори.', backCb: 'a:ws_list' }); return; }

      const isAdmin = isSuperAdminTg(ctx.from?.id);
      const ws = isAdmin ? await db.getWorkspaceAny(wsId) : await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');

      const legacy = ws.profile_contact ? String(ws.profile_contact).trim() : '';
      if (!legacy) {
        await renderWsProfileContactsStructured(ctx, u.id, wsId, { flashHtml: 'ℹ️ Legacy контакт пуст — переносить нечего.' });
        return;
      }

      const r = detectLegacyContactForMigration(legacy);
      const label = { tg: 'Telegram', email: 'Email', phone: 'Phone', site: 'Website' };

      if (!r.ok) {
        const reason = (() => {
          if (r.reason === 'too_long') return 'слишком длинный текст';
          if (r.reason === 'no_match') return 'не нашёл tg/email/phone/url';
          if (r.reason === 'ambiguous_multi_types') return 'нашёл сразу несколько типов контактов';
          if (r.reason === 'ambiguous_multi_values') return 'нашёл несколько вариантов одного типа';
          return 'не могу распознать безопасно';
        })();

        const hint = `⚠️ <b>Не получилось перенести</b>\nПричина: <b>${escapeHtml(reason)}</b>\n\nСовет: оставь в «Контакт» <b>только одно</b> значение (например только @user или только почту), либо заполни поля вручную.`;

        await renderWsProfileContactsStructured(ctx, u.id, wsId, { flashHtml: hint });
        return;
      }

      const o = wsProfileContactsObj(ws);
      const cur = o[r.key] ? String(o[r.key]) : '';
      if (cur && cur !== String(r.value)) {
        const msg = `⚠️ Поле <b>${escapeHtml(label[r.key] || r.key)}</b> уже заполнено.\n\nТекущее: <code>${escapeHtml(deLinkifyText(cur))}</code>\nНайдено в legacy: <code>${escapeHtml(deLinkifyText(String(r.value)))}</code>\n\nЕсли хочешь заменить — сначала очисти поле, потом введи нужное значение.`;
        await renderWsProfileContactsStructured(ctx, u.id, wsId, { flashHtml: msg });
        return;
      }

      o[r.key] = String(r.value);
      await db.setWorkspaceSetting(wsId, { profile_contacts: o, profile_contacts_v: 1 });
      try { await db.auditWorkspace(wsId, u.id, 'ws.profile_contacts_migrated', { from: 'legacy', key: r.key }); } catch {}

      const okMsg = `✅ Перенёс в <b>${escapeHtml(label[r.key] || r.key)}</b>: <code>${escapeHtml(deLinkifyText(String(r.value)))}</code>\n\nПоле «Контакт» оставил как есть (по желанию можно очистить).`;
      await renderWsProfileContactsStructured(ctx, u.id, wsId, { flashHtml: okMsg });
      return;
    }

    if (p.a === 'a:ws_prof_contacts_edit') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const key = String(p.k || '');
      const allowed = ['tg', 'email', 'phone', 'site'];
      if (!wsId) { await renderStaleButton(ctx, { text: '⚠️ Кнопка устарела. Открой 📋 Меню → выбери канал и повтори.', backCb: 'a:ws_list' }); return; }
      if (!allowed.includes(key)) return ctx.answerCallbackQuery({ text: 'Неверное поле.' });

      const prompts = {
        tg: '✍️ Telegram username (рекомендуется): пришли @user или ссылку t.me/user.\n\nДостаточно 1 контакта — обычно Telegram.',
        email: '✍️ Email (опционально): пришли почту вида name@domain.com.',
        phone: '✍️ Phone (опционально, не обязателен): пришли номер (можно с пробелами/скобками). Сохраню в формате +цифры.',
        site: '✍️ Website (опционально): пришли ссылку или домен (example.com).\n\nВажно: t.me лучше указать в Telegram username.',
      };

      const kb = new InlineKeyboard()
        .text('🧹 Очистить', `a:ws_prof_contacts_clear_k|ws:${wsId}|k:${key}`)
        .row()
        .text('⬅️ Отмена', `a:ws_prof_contacts|ws:${wsId}`)
        .text('👤 Профиль', `a:ws_profile|ws:${wsId}`)
        .row()
        .text('📋 Меню', 'a:menu')
        .text('🏠 Домой', 'a:home');

      await safeEditOrReply(ctx, prompts[key] || prompts.tg, { reply_markup: kb });

      await setExpectText(ctx.from.id, { type: 'ws_prof_contacts_edit', wsId, key, chatId: ctx.chat?.id, messageId: ctx.callbackQuery?.message?.message_id });
      return;
    }

    if (p.a === 'a:ws_prof_contacts_clear') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      if (!wsId) { await renderStaleButton(ctx, { text: '⚠️ Кнопка устарела. Открой 📋 Меню → выбери канал и повтори.', backCb: 'a:ws_list' }); return; }
      await renderWsProfileContactsClearMenu(ctx, u.id, wsId);
      return;
    }

    if (p.a === 'a:ws_prof_contacts_clear_k') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const key = String(p.k || '');
      const allowed = ['tg', 'email', 'phone', 'site', 'other'];
      if (!wsId) { await renderStaleButton(ctx, { text: '⚠️ Кнопка устарела. Открой 📋 Меню → выбери канал и повтори.', backCb: 'a:ws_list' }); return; }
      if (!allowed.includes(key)) return ctx.answerCallbackQuery({ text: 'Неверное поле.' });

      const isAdmin = isSuperAdminTg(ctx.from?.id);
      const ws = isAdmin ? await db.getWorkspaceAny(wsId) : await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');

      const o = wsProfileContactsObj(ws);
      delete o[key];

      await db.setWorkspaceSetting(wsId, { profile_contacts: o, profile_contacts_v: 1 });
      try { await db.auditWorkspace(wsId, u.id, 'ws.profile_contacts_cleared', { key }); } catch {}
      await renderWsProfileContactsStructured(ctx, u.id, wsId);
      return;
    }

    if (p.a === 'a:ws_prof_clear') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const field = String(p.f || '');
      if (!wsId) {
        await renderStaleButton(ctx, { text: '⚠️ Кнопка устарела. Открой 📋 Меню → выбери канал и повтори.', backCb: 'a:ws_list' });
        return;
      }

      const allowed = new Set(['contact', 'ig', 'portfolio', 'about']);
      if (!allowed.has(field)) return ctx.answerCallbackQuery({ text: 'Неверное поле.' });

      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');

      if (field === 'contact') await db.setWorkspaceSetting(wsId, { profile_contact: null });
      if (field === 'ig') await db.setWorkspaceSetting(wsId, { profile_ig: null });
      if (field === 'portfolio') await db.setWorkspaceSetting(wsId, { profile_portfolio_urls: [] });
      if (field === 'about') await db.setWorkspaceSetting(wsId, { profile_about: null });
      try { await db.auditWorkspace(wsId, u.id, 'ws.profile_updated', { field, cleared: true, via: 'button' }); } catch {}

      // If user was in expectText mode for this edit — drop it to avoid confusion.
      try { await clearExpectText(ctx.from.id); } catch {}
      try { await ctx.answerCallbackQuery({ text: '✅ Очищено' }); } catch {}
      await renderWsProfile(ctx, u.id, wsId);
      return;
    }

    if (p.a === 'a:ws_prof_edit') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const field = String(p.f || 'title');
      const prompts = {
        title: '✍️ Введи название витрины (как тебя видит бренд).',
        niche: '✍️ Введи нишу (устар.) — лучше выбрать “🏷 Ниши”.',
        ig: '✍️ Пришли Instagram: @handle или ссылку на профиль (instagram.com/handle).',
        about: '✍️ Короткое описание (1–2 предложения).\n\nПример: “Тестирую косметику и делаю распаковки. Люблю честные обзоры.”',
        portfolio: '✍️ Пришли 1–3 ссылки на портфолио (каждая с новой строки или в одном сообщении).',
        contact: '✍️ Контакт: @username / ссылка / почта.\n\n💡 Достаточно 1 контакта — обычно Telegram.\nЕсли хочешь — заполни «📇 Контакты (структурно)»: там контакты валидируются и показываются бренду только после разлока.',
        geo: '✍️ Введи город/гео.'
      };

      const kb = new InlineKeyboard();
      if (['contact', 'ig', 'portfolio', 'about'].includes(field)) {
        kb.text('🧹 Очистить', `a:ws_prof_clear|ws:${wsId}|f:${field}`).row();
      }
      kb.text('⬅️ Отмена', `a:ws_profile|ws:${wsId}`).text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');

      await safeEditOrReply(ctx, prompts[field] || prompts.title, { reply_markup: kb });
      await setExpectText(ctx.from.id, { type: 'ws_profile_edit', wsId, field, chatId: ctx.chat?.id, messageId: ctx.callbackQuery?.message?.message_id });
      return;
    }

    if (p.a === 'a:ws_prof_reset') {
          await ctx.answerCallbackQuery();
          const wsId = Number(p.ws);
          const ws = await db.getWorkspace(u.id, wsId);
          if (!ws) return answerRecovery(ctx, 'channel');

          const text =
            `🧹 <b>Сбросить витрину?</b>

    Это очистит публичные поля витрины:
    • Название
    • Ниши и форматы
    • Гео и описание
    • Instagram и ссылки портфолио
    • Контакты (legacy + структурно)

    <b>Не трогаем</b>: диалоги/заявки, оплаты, PRO и подключение канала.

    После сброса профиль станет “как новый” — можно заполнить заново.`;

          const kb = new InlineKeyboard()
            .text('🧹 Да, сбросить', `a:ws_prof_reset_ok|ws:${wsId}`)
            .row()
            .text('⬅️ Отмена', `a:ws_profile|ws:${wsId}`)
            .text('📋 Меню', 'a:menu')
            .text('🏠 Домой', 'a:home');

          await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
          return;
        }

    if (p.a === 'a:ws_prof_reset_ok') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');

      await db.setWorkspaceSetting(wsId, {
        profile_title: null,
        profile_niche: null,
        profile_ig: null,
        profile_verticals: [],
        profile_formats: [],
        profile_geo: null,
        profile_contact: null,
        profile_contacts: {},
        profile_contacts_v: 1,
        profile_portfolio_urls: [],
        profile_about: null,
        profile_mode: 'both',
      });

      try { await db.auditWorkspace(wsId, u.id, 'ws.profile_reset', { scope: 'public_fields' }); } catch { }

      try { await ctx.answerCallbackQuery({ text: '✅ Витрина сброшена', show_alert: true }); } catch { }
      await renderWsProfile(ctx, u.id, wsId);
      return;
    }

    throw new Error('workspace_domain.unreachable_profile_action:' + String(p?.a || 'missing'));
  })();
  return true;
}
