import { isWorkspaceSocialAction } from './policy.js';

function bindDependencies(deps, names) {
  for (const name of names) {
    if (deps?.[name] === null || deps?.[name] === undefined) {
      throw new Error('workspace_domain.missing_dependency:' + name);
    }
  }
  return deps;
}

const REQUIRED_DEPENDENCIES = Object.freeze([
  'BX_HOME',
  'CFG',
  'InlineKeyboard',
  'answerRecovery',
  'copySafetyRecoveryKb',
  'copySafetyUnavailableHtml',
  'db',
  'k',
  'navKb',
  'randomToken',
  'redis',
  'renderStaleButton',
  'renderWsIgDmTemplate',
  'renderWsIgTemplatesMenu',
  'renderWsIgVerifyComment',
  'renderWsIgVerifyStart',
  'renderWsIgVerifyStatus',
  'renderWsShareMenu',
  'reportCopySafetyDiagnostic',
  'resolveBxHomeFromUi',
  'safeEditOrReply',
  'sendWsIgTemplateMessage',
  'sendWsShareTextMessage',
]);

export async function handleWorkspaceSocialCallback(ctx, p, u, deps = {}) {
  if (!isWorkspaceSocialAction(p?.a)) return false;
  const bound = bindDependencies(deps, REQUIRED_DEPENDENCIES);
  const {
    BX_HOME,
    CFG,
    InlineKeyboard,
    answerRecovery,
    copySafetyRecoveryKb,
    copySafetyUnavailableHtml,
    db,
    k,
    navKb,
    randomToken,
    redis,
    renderStaleButton,
    renderWsIgDmTemplate,
    renderWsIgTemplatesMenu,
    renderWsIgVerifyComment,
    renderWsIgVerifyStart,
    renderWsIgVerifyStatus,
    renderWsShareMenu,
    reportCopySafetyDiagnostic,
    resolveBxHomeFromUi,
    safeEditOrReply,
    sendWsIgTemplateMessage,
    sendWsShareTextMessage,
  } = bound;

  await (async () => {
    if (p.a === 'a:ws_share') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const wsId = Number(p.w || p.ws || 0);
      if (!wsId) { await safeEditOrReply(ctx, '⚠️ Кнопка устарела. Открой 📋 Меню → выбери канал заново.', { reply_markup: navKb('a:ws_list') }); return; }
      await renderWsShareMenu(ctx, u.id, wsId, String(p.ret || '') || null);
      return;
    }

    if (p.a === 'a:ws_share_send') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      if (!wsId) {
        await renderStaleButton(ctx, { text: '⚠️ Кнопка устарела. Открой 📋 Меню → выбери канал и повтори.', backCb: 'a:ws_list' });
        return;
      }
      const v = String(p.v || 'short') === 'long' ? 'long' : 'short';
      await sendWsShareTextMessage(ctx, u.id, wsId, v);
      return;
    }

    if (p.a === 'a:ws_ig_templates') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      if (!wsId) { await renderStaleButton(ctx, { text: '⚠️ Кнопка устарела. Открой 📋 Меню → выбери канал и повтори.', backCb: 'a:ws_list' }); return; }
      await renderWsIgTemplatesMenu(ctx, u.id, wsId);
      return;
    }

    if (p.a === 'a:ws_ig_templates_send') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      if (!wsId) { await renderStaleButton(ctx, { text: '⚠️ Кнопка устарела. Открой 📋 Меню → выбери канал и повтори.', backCb: 'a:ws_list' }); return; }
      const t = String(p.t || 'story');
      await sendWsIgTemplateMessage(ctx, u.id, wsId, t);
      return;
    }

    if (p.a === 'a:ws_ig_dm') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      if (!wsId) { await renderStaleButton(ctx, { text: '⚠️ Кнопка устарела. Открой 📋 Меню → выбери канал и повтори.', backCb: 'a:ws_list' }); return; }
      const tone = String(p.tone || 'soft');
      const i = Number(p.i || 0);
      await renderWsIgDmTemplate(ctx, u.id, wsId, tone, i);
      return;
    }

    if (p.a === 'a:ws_ig_verify') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      if (!wsId) { await renderStaleButton(ctx, { text: '⚠️ Кнопка устарела. Открой 📋 Меню → выбери канал и повтори.', backCb: 'a:ws_list' }); return; }

      // Launch-safe: IG OAuth can be temporarily hidden from UI while Meta side is unstable.
      if (!CFG.IG_OAUTH_UI_ENABLED) {
        const kb = new InlineKeyboard().text('↩️ Назад', `a:ws_profile|ws:${wsId}`).text('📋 Меню', 'a:menu').row().text('🏠 Домой', 'a:home');
        await safeEditOrReply(ctx, 'Эта функция пока тебе недоступна.', { reply_markup: kb });
        return;
      }

      const ret = String(p.ret || 'ws_profile');
      await renderWsIgVerifyStart(ctx, u.id, wsId, { ret });
      return;
    }

    if (p.a === 'a:ws_ig_verify_comment') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      if (!wsId) { await renderStaleButton(ctx, { text: '⚠️ Кнопка устарела. Открой 📋 Меню → выбери канал и повтори.', backCb: 'a:ws_list' }); return; }
      if (!CFG.IG_OAUTH_UI_ENABLED) {
        const kb = new InlineKeyboard().text('↩️ Назад', `a:ws_profile|ws:${wsId}`).text('📋 Меню', 'a:menu').row().text('🏠 Домой', 'a:home');
        await safeEditOrReply(ctx, 'Эта функция пока тебе недоступна.', { reply_markup: kb });
        return;
      }
      const ret = String(p.ret || 'ws_profile');
      await renderWsIgVerifyComment(ctx, u.id, wsId, { ret });
      return;
    }

    if (p.a === 'a:ws_ig_verify_status') {
      const wsId = Number(p.w || p.ws || 0);
      if (!wsId) { try { await ctx.answerCallbackQuery(); } catch {} await renderStaleButton(ctx, { text: '⚠️ Кнопка устарела. Открой 📋 Меню → выбери канал и повтори.', backCb: 'a:ws_list' }); return; }
      if (!CFG.IG_OAUTH_UI_ENABLED) {
        try { await ctx.answerCallbackQuery(); } catch {}
        const kb = new InlineKeyboard().text('↩️ Назад', `a:ws_profile|ws:${wsId}`).text('📋 Меню', 'a:menu').row().text('🏠 Домой', 'a:home');
        await safeEditOrReply(ctx, 'Эта функция пока тебе недоступна.', { reply_markup: kb });
        return;
      }
      const ret = String(p.ret || 'ws_profile');
      await renderWsIgVerifyStatus(ctx, u.id, wsId, { ret });
      return;
    }

    if (p.a === 'a:ws_ig_verify_oauth') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      if (!wsId) { await renderStaleButton(ctx, { text: '⚠️ Кнопка устарела. Открой 📋 Меню → выбери канал и повтори.', backCb: 'a:ws_list' }); return; }

      if (!CFG.IG_OAUTH_UI_ENABLED) {
        const kb = new InlineKeyboard().text('↩️ Назад', `a:ws_profile|ws:${wsId}`).text('📋 Меню', 'a:menu').row().text('🏠 Домой', 'a:home');
        await safeEditOrReply(ctx, 'Эта функция пока тебе недоступна.', { reply_markup: kb });
        return;
      }

      const igOAuthBackCb = 'a:ws_ig_verify|ws:' + wsId;
      const igOAuthUnavailable = async (code, details = {}) => {
        reportCopySafetyDiagnostic(code, details);
        await safeEditOrReply(ctx, copySafetyUnavailableHtml('Подключение Instagram временно недоступно'), {
          parse_mode: 'HTML',
          reply_markup: copySafetyRecoveryKb(igOAuthBackCb),
        });
      };

      if (!CFG.IG_OAUTH_ENABLED) {
        await igOAuthUnavailable('ig_oauth_disabled', { config: 'IG_OAUTH_ENABLED' });
        return;
      }

      if (!CFG.IG_TOKEN_ENC_KEY_VALID) {
        await igOAuthUnavailable('ig_oauth_encryption_key_invalid', { config: 'IG_TOKEN_ENC_KEY' });
        return;
      }

      if (!CFG.IG_OAUTH_CLIENT_ID || !CFG.IG_OAUTH_CLIENT_SECRET) {
        await igOAuthUnavailable('ig_oauth_client_config_missing', {
          config: ['IG_OAUTH_CLIENT_ID', 'IG_OAUTH_CLIENT_SECRET'],
        });
        return;
      }

      if (!CFG.PUBLIC_BASE_URL) {
        await igOAuthUnavailable('ig_oauth_public_base_url_missing', { config: 'PUBLIC_BASE_URL' });
        return;
      }

      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return answerRecovery(ctx, 'channel');

      // One-time token for web OAuth start (TTL 10 min).
      const t = randomToken();
      const payload = { wsId: Number(wsId), ownerUserId: Number(u.id), tgId: Number(ctx.from.id), created_at: new Date().toISOString() };
      try { await redis.set(k(['ig_oauth_t', t]), payload, { ex: 10 * 60 }); } catch {}

      const url = String(CFG.PUBLIC_BASE_URL).replace(/\/$/, '') + `/api/ig/oauth/start?t=${encodeURIComponent(t)}`;

      const kb = new InlineKeyboard()
        .url('🌐 Открыть подключение', url)
        .row()
        .text('🔄 Статус', `a:ws_ig_verify_status|ws:${wsId}|ret:${String(p.ret || 'ws_profile')}`)
        .row()
        .text('⬅️ Назад', `a:ws_ig_verify|ws:${wsId}|ret:${String(p.ret || 'ws_profile')}`)
        .text('📋 Меню', 'a:menu')
        .row()
        .text('🏠 Домой', 'a:home');

      const msg =
        `🔗 <b>Подключение Instagram через OAuth</b>\n\n` +
        `1) Нажми кнопку ниже и авторизуйся в Meta/Instagram\n` +
        `2) Разреши доступ приложению\n` +
        `3) После успеха вернись в бот — бейдж <b>verified</b> появится автоматически\n\n` +
        `ℹ️ Требуется IG <b>Business/Creator</b>, привязанный к Facebook Page.`;

      await safeEditOrReply(ctx, msg, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
      return;
    }

    throw new Error('workspace_domain.unreachable_social_action:' + String(p?.a || 'missing'));
  })();
  return true;
}
