import { BROADCAST_ACTION } from './actions.js';
import {
  isBroadcastAudienceAction,
  isBroadcastComposerAction,
  isBroadcastDispatchAction,
  isBroadcastOperationsAction,
} from './policy.js';

function requireFunction(deps, name) {
  const value = deps?.[name];
  if (typeof value !== 'function') {
    throw new Error(`broadcast_domain.missing_dependency:${name}`);
  }
  return value;
}

function requireValue(deps, name) {
  const value = deps?.[name];
  if (value === null || value === undefined) {
    throw new Error(`broadcast_domain.missing_dependency:${name}`);
  }
  return value;
}

async function requireAdmin(ctx, deps) {
  const isAdmin = requireFunction(deps, 'isAdmin');
  if (isAdmin(ctx)) return true;
  await ctx.answerCallbackQuery({ text: 'Нет доступа.' });
  return false;
}

function makeOperationsBackKeyboard(deps) {
  const InlineKeyboard = requireValue(deps, 'InlineKeyboard');
  const kbAdminFooter = requireFunction(deps, 'kbAdminFooter');
  const kb = new InlineKeyboard();
  kbAdminFooter(kb, '⬅️ Операции', 'a:admin_ops');
  return kb;
}

function makeStartAgainKeyboard(deps) {
  const InlineKeyboard = requireValue(deps, 'InlineKeyboard');
  const commsCb = requireValue(deps, 'commsCb');
  return new InlineKeyboard()
    .text('📣 Начать заново', commsCb.bcStart())
    .row()
    .text('⬅️ Админка', 'a:admin_home')
    .row()
    .text('📋 Меню', 'a:menu')
    .text('🏠 Домой', 'a:home');
}

export async function handleBroadcastComposerCallback(ctx, p, _u, deps = {}) {
  const action = String(p?.a || '').trim();
  if (!isBroadcastComposerAction(action)) return false;
  if (!(await requireAdmin(ctx, deps))) return true;

  const InlineKeyboard = requireValue(deps, 'InlineKeyboard');
  const commsCb = requireValue(deps, 'commsCb');
  const safeEditOrReply = requireFunction(deps, 'safeEditOrReply');
  const clearExpectText = requireFunction(deps, 'clearExpectText');
  const clearDraft = requireFunction(deps, 'clearDraft');
  const getDraft = requireFunction(deps, 'getDraft');
  const setDraft = requireFunction(deps, 'setDraft');
  const setExpectText = requireFunction(deps, 'setExpectText');
  const renderBroadcastSimpleComposer = requireFunction(deps, 'renderBroadcastSimpleComposer');

  if (action === BROADCAST_ACTION.START) {
    await ctx.answerCallbackQuery();
    try { await clearExpectText(ctx.from.id); } catch {}
    await renderBroadcastSimpleComposer(ctx);
    return true;
  }

  if (action === BROADCAST_ACTION.START_ADVANCED) {
    await ctx.answerCallbackQuery();
    try { await clearDraft(ctx.from.id); } catch {}
    await safeEditOrReply(
      ctx,
      `🧰 <b>Расширенный редактор</b>\n\nОтправь текст, фото, видео, GIF или документ.`,
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text('⬅️ Простой редактор', commsCb.bcStart()),
      }
    );
    await setExpectText(ctx.from.id, { type: 'bc_content' }, 30 * 60);
    return true;
  }

  if (action === BROADCAST_ACTION.SIMPLE_TEXT) {
    await ctx.answerCallbackQuery();
    await safeEditOrReply(
      ctx,
      `📝 <b>Текст рассылки</b>\n\nОтправь текст одним сообщением.`,
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text('⬅️ К редактору', commsCb.bcStart()),
      }
    );
    await setExpectText(ctx.from.id, { type: 'bc_simple_text' }, 30 * 60);
    return true;
  }

  if (action === BROADCAST_ACTION.SIMPLE_MEDIA) {
    await ctx.answerCallbackQuery();
    await safeEditOrReply(
      ctx,
      `🖼 <b>Картинка рассылки</b>\n\nОтправь фото одним сообщением.`,
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text('⬅️ К редактору', commsCb.bcStart()),
      }
    );
    await setExpectText(ctx.from.id, { type: 'bc_simple_media' }, 30 * 60);
    return true;
  }

  if (action === BROADCAST_ACTION.SIMPLE_MEDIA_CLEAR) {
    await ctx.answerCallbackQuery({ text: 'Картинка удалена.' });
    const getBroadcastRememberedAudience = requireFunction(deps, 'getBroadcastRememberedAudience');
    const rememberedAudience = await getBroadcastRememberedAudience(ctx.from.id);
    const draft = (await getDraft(ctx.from.id)) || {
      mode: 'simple',
      audience: rememberedAudience || 'all',
      buttons: [],
    };
    delete draft.mediaType;
    delete draft.fileId;
    delete draft.caption;
    draft.mode = 'simple';
    await setDraft(ctx.from.id, draft, 30 * 60);
    await renderBroadcastSimpleComposer(ctx);
    return true;
  }

  if (action === BROADCAST_ACTION.SIMPLE_BUTTON) {
    const renderBroadcastSimpleButtonPicker = requireFunction(deps, 'renderBroadcastSimpleButtonPicker');
    await ctx.answerCallbackQuery();
    const draft = await getDraft(ctx.from.id);
    await renderBroadcastSimpleButtonPicker(ctx, draft || {});
    return true;
  }

  if (action === BROADCAST_ACTION.SIMPLE_BUTTON_PRESET) {
    const broadcastSimpleButtonPresets = requireFunction(deps, 'broadcastSimpleButtonPresets');
    const getBroadcastRememberedAudience = requireFunction(deps, 'getBroadcastRememberedAudience');
    const escapeHtml = requireFunction(deps, 'escapeHtml');
    const presetKey = String(p?.k || '');
    const preset = broadcastSimpleButtonPresets().find((item) => item.key === presetKey);
    if (!preset) {
      await ctx.answerCallbackQuery({ text: 'Готовый вариант недоступен.' });
      return true;
    }
    await ctx.answerCallbackQuery({ text: 'Кнопка сохранена.' });
    const rememberedAudience = await getBroadcastRememberedAudience(ctx.from.id);
    const draft = (await getDraft(ctx.from.id)) || {
      mode: 'simple',
      audience: rememberedAudience || 'all',
      buttons: [],
    };
    draft.mode = 'simple';
    if (!draft.audience) draft.audience = rememberedAudience || 'all';
    draft.buttons = [{ text: preset.label, url: preset.url }];
    await setDraft(ctx.from.id, draft, 30 * 60);
    await renderBroadcastSimpleComposer(
      ctx,
      `✅ Кнопка preset: <b>${escapeHtml(preset.label)}</b>`
    );
    return true;
  }

  if (action === BROADCAST_ACTION.SIMPLE_BUTTON_CUSTOM) {
    await ctx.answerCallbackQuery();
    await safeEditOrReply(
      ctx,
      `✍️ <b>Своя кнопка</b>\n\nОтправь строку в формате:\n<code>Текст кнопки | https://...</code>\n\nПоддерживаются также:\n• <code>t.me/...</code>\n• shortcuts <code>gw_123</code> / <code>bp_123</code> / <code>offer_123</code>`,
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
          .text('⬅️ К кнопкам', commsCb.bcSimpleButton())
          .row()
          .text('📋 Меню', 'a:menu')
          .text('🏠 Домой', 'a:home'),
      }
    );
    await setExpectText(ctx.from.id, { type: 'bc_simple_button_input' }, 30 * 60);
    return true;
  }

  if (action === BROADCAST_ACTION.SIMPLE_BUTTON_CLEAR) {
    const getBroadcastRememberedAudience = requireFunction(deps, 'getBroadcastRememberedAudience');
    await ctx.answerCallbackQuery({ text: 'Кнопка очищена.' });
    const rememberedAudience = await getBroadcastRememberedAudience(ctx.from.id);
    const draft = (await getDraft(ctx.from.id)) || {
      mode: 'simple',
      audience: rememberedAudience || 'all',
      buttons: [],
    };
    draft.mode = 'simple';
    if (!draft.audience) draft.audience = rememberedAudience || 'all';
    draft.buttons = [];
    await setDraft(ctx.from.id, draft, 30 * 60);
    await renderBroadcastSimpleComposer(ctx, '✅ Кнопка удалена.');
    return true;
  }

  if (action === BROADCAST_ACTION.PREVIEW) {
    const broadcastDraftHasContent = requireFunction(deps, 'broadcastDraftHasContent');
    const sendBroadcastPreviewToOperator = requireFunction(deps, 'sendBroadcastPreviewToOperator');
    const renderBroadcastPreview = requireFunction(deps, 'renderBroadcastPreview');
    const escapeHtml = requireFunction(deps, 'escapeHtml');
    const draft = await getDraft(ctx.from.id);
    if (!draft || !broadcastDraftHasContent(draft)) {
      await ctx.answerCallbackQuery({ text: 'Нет контента для preview.' });
      return true;
    }
    await ctx.answerCallbackQuery({ text: 'Отправляю preview…' });
    try {
      await sendBroadcastPreviewToOperator(ctx, draft);
      if (String(draft.mode || '') === 'simple') {
        await renderBroadcastSimpleComposer(
          ctx,
          '👁 Предпросмотр отправлен в этот чат отдельным сообщением.'
        );
      } else {
        await renderBroadcastPreview(ctx, draft, {
          banner: '👁 Предпросмотр отправлен в этот чат отдельным сообщением.',
        });
      }
    } catch (error) {
      await safeEditOrReply(
        ctx,
        `⚠️ Не удалось отправить предпросмотр: ${escapeHtml(String(error?.message || error).slice(0, 160))}`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard().text(
            '⬅️ К редактору',
            String(draft?.mode || '') === 'simple' ? commsCb.bcStart() : commsCb.bcBtnDone()
          ),
        }
      );
    }
    return true;
  }

  if (action === BROADCAST_ACTION.SEND_QUESTION) {
    const broadcastDraftHasContent = requireFunction(deps, 'broadcastDraftHasContent');
    const renderBroadcastPreview = requireFunction(deps, 'renderBroadcastPreview');
    await ctx.answerCallbackQuery();
    const draft = await getDraft(ctx.from.id);
    if (!draft || !broadcastDraftHasContent(draft)) {
      await safeEditOrReply(ctx, '⚠️ Нет контента для отправки.', {
        reply_markup: new InlineKeyboard()
          .text('⬅️ К редактору', commsCb.bcStart())
          .row()
          .text('📋 Меню', 'a:menu')
          .text('🏠 Домой', 'a:home'),
      });
      return true;
    }
    await renderBroadcastPreview(ctx, draft);
    return true;
  }

  if (action === BROADCAST_ACTION.SIMPLE_CLEAR) {
    const getBroadcastRememberedAudience = requireFunction(deps, 'getBroadcastRememberedAudience');
    await ctx.answerCallbackQuery({ text: 'Черновик очищен.' });
    try { await clearExpectText(ctx.from.id); } catch {}
    await setDraft(
      ctx.from.id,
      {
        mode: 'simple',
        audience: (await getBroadcastRememberedAudience(ctx.from.id)) || 'all',
        buttons: [],
      },
      30 * 60
    );
    await renderBroadcastSimpleComposer(ctx, '✅ Draft очищен.');
    return true;
  }

  if (action === BROADCAST_ACTION.BUTTONS) {
    const broadcastDraftHasContent = requireFunction(deps, 'broadcastDraftHasContent');
    await ctx.answerCallbackQuery();
    const draft = await getDraft(ctx.from.id);
    if (!draft || !broadcastDraftHasContent(draft)) {
      await safeEditOrReply(ctx, '⚠️ Нет черновика.', {
        reply_markup: makeStartAgainKeyboard(deps),
      });
      return true;
    }
    await safeEditOrReply(
      ctx,
      `🔗 <b>Кнопки</b>\n\nМожно двумя способами:\n1) <b>Шаблоны</b> — выбери ниже (Конкурс/Профиль/Оффер)\n2) <b>Вручную</b> — отправь до 3 строк:\n<code>Текст кнопки | ссылка</code>\n\nСсылка может быть любой:\n• <code>https://...</code> (любая внешняя)\n• <code>t.me/...</code>\n• shortcut <code>gw_123</code> / <code>bp_123</code> / <code>offer_123</code>\n\nПример:\n<code>Перейти в X | https://x.com/...</code>\n\nКогда готово — нажми «✅ Готово».`,
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
          .text('🎁 Конкурс', BROADCAST_ACTION.TEMPLATE_GIVEAWAY)
          .text('🏷 Профиль', BROADCAST_ACTION.TEMPLATE_BRAND_PROFILE)
          .row()
          .text('🎬 Оффер', BROADCAST_ACTION.TEMPLATE_OFFER)
          .text('✅ Готово', commsCb.bcBtnDone())
          .row()
          .text('⬅️ Отмена', commsCb.bcStart())
          .text('⬅️ Админка', 'a:admin_home')
          .row()
          .text('📋 Меню', 'a:menu')
          .text('🏠 Домой', 'a:home'),
      }
    );
    await setExpectText(ctx.from.id, { type: 'bc_button_input' }, 30 * 60);
    return true;
  }

  if (
    action === BROADCAST_ACTION.TEMPLATE_GIVEAWAY ||
    action === BROADCAST_ACTION.TEMPLATE_BRAND_PROFILE ||
    action === BROADCAST_ACTION.TEMPLATE_OFFER
  ) {
    const broadcastDraftHasContent = requireFunction(deps, 'broadcastDraftHasContent');
    const escapeHtml = requireFunction(deps, 'escapeHtml');
    await ctx.answerCallbackQuery();
    const draft = await getDraft(ctx.from.id);
    if (!draft || !broadcastDraftHasContent(draft)) {
      await safeEditOrReply(ctx, '⚠️ Нет черновика.', {
        reply_markup: makeStartAgainKeyboard(deps),
      });
      return true;
    }

    const kind = action === BROADCAST_ACTION.TEMPLATE_GIVEAWAY
      ? 'gw'
      : action === BROADCAST_ACTION.TEMPLATE_BRAND_PROFILE
        ? 'bp'
        : 'offer';
    const label = kind === 'gw'
      ? '🎁 Конкурс'
      : kind === 'bp'
        ? '🏷 Профиль бренда'
        : '🎬 Оффер';
    const hint = kind === 'gw'
      ? 'ID конкурса (число), пример: <code>123</code>'
      : kind === 'bp'
        ? 'ID профиля бренда (число), пример: <code>123</code>'
        : 'ID оффера (число), пример: <code>123</code>';

    await safeEditOrReply(
      ctx,
      `🔗 <b>${escapeHtml(label)}</b>\n\nОтправь ${hint}.\n\nМожно указать свой текст кнопки так:\n<code>123 | Мой текст</code>\n\n⬅️ «Назад» вернёт к вводу кнопок.`,
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
          .text('⬅️ Назад к кнопкам', commsCb.bcButtons())
          .row()
          .text('✅ Готово', commsCb.bcBtnDone())
          .text('⬅️ Отмена', commsCb.bcStart()),
      }
    );
    await setExpectText(ctx.from.id, { type: 'bc_btn_tpl_id', kind }, 10 * 60);
    return true;
  }

  if (action === BROADCAST_ACTION.BUTTONS_DONE) {
    const renderBroadcastAudiencePicker = requireFunction(deps, 'renderBroadcastAudiencePicker');
    await ctx.answerCallbackQuery();
    try { await clearExpectText(ctx.from.id); } catch {}
    await renderBroadcastAudiencePicker(ctx);
    return true;
  }

  throw new Error(`broadcast_domain.unreachable_composer_action:${action}`);
}

export async function handleBroadcastAudienceCallback(ctx, p, _u, deps = {}) {
  const action = String(p?.a || '').trim();
  if (!isBroadcastAudienceAction(action)) return false;
  if (!(await requireAdmin(ctx, deps))) return true;

  const getDraft = requireFunction(deps, 'getDraft');
  const renderBroadcastAudiencePicker = requireFunction(deps, 'renderBroadcastAudiencePicker');

  if (action === BROADCAST_ACTION.SIMPLE_AUDIENCE) {
    await ctx.answerCallbackQuery();
    await renderBroadcastAudiencePicker(ctx);
    return true;
  }

  if (action === BROADCAST_ACTION.AUDIENCE) {
    const setDraft = requireFunction(deps, 'setDraft');
    const setBroadcastRememberedAudience = requireFunction(deps, 'setBroadcastRememberedAudience');
    const broadcastDraftHasContent = requireFunction(deps, 'broadcastDraftHasContent');
    const renderBroadcastSimpleComposer = requireFunction(deps, 'renderBroadcastSimpleComposer');
    const renderBroadcastPreview = requireFunction(deps, 'renderBroadcastPreview');
    const audienceLabel = requireFunction(deps, 'audienceLabel');
    const escapeHtml = requireFunction(deps, 'escapeHtml');
    const safeEditOrReply = requireFunction(deps, 'safeEditOrReply');

    await ctx.answerCallbackQuery();
    const audience = String(p?.aud || 'all').toLowerCase();
    const draft = await getDraft(ctx.from.id);
    if (!draft || !broadcastDraftHasContent(draft)) {
      await safeEditOrReply(ctx, '⚠️ Нет черновика. Начни сначала.', {
        reply_markup: makeStartAgainKeyboard(deps),
      });
      return true;
    }
    draft.audience = audience;
    await setDraft(ctx.from.id, draft, 30 * 60);
    await setBroadcastRememberedAudience(ctx.from.id, audience);
    const banner = `✅ Аудитория: <b>${escapeHtml(audienceLabel(audience))}</b>`;
    if (String(draft.mode || '') === 'simple') {
      await renderBroadcastSimpleComposer(ctx, banner);
    } else {
      await renderBroadcastPreview(ctx, draft, { banner });
    }
    return true;
  }

  throw new Error(`broadcast_domain.unreachable_audience_action:${action}`);
}

export async function handleBroadcastDispatchCallback(ctx, p, _u, deps = {}) {
  const action = String(p?.a || '').trim();
  if (!isBroadcastDispatchAction(action)) return false;
  if (!(await requireAdmin(ctx, deps))) return true;

  const safeEditOrReply = requireFunction(deps, 'safeEditOrReply');
  const clearDraft = requireFunction(deps, 'clearDraft');
  const clearExpectText = requireFunction(deps, 'clearExpectText');

  if (action === BROADCAST_ACTION.CANCEL) {
    const renderAdminHome = requireFunction(deps, 'renderAdminHome');
    await ctx.answerCallbackQuery();
    try { await clearExpectText(ctx.from.id); } catch {}
    try { await clearDraft(ctx.from.id); } catch {}
    await renderAdminHome(ctx);
    return true;
  }

  if (action === BROADCAST_ACTION.CONFIRM) {
    const InlineKeyboard = requireValue(deps, 'InlineKeyboard');
    const commsCb = requireValue(deps, 'commsCb');
    const rateLimit = requireFunction(deps, 'rateLimit');
    const key = requireFunction(deps, 'key');
    const db = requireValue(deps, 'db');
    const getDraft = requireFunction(deps, 'getDraft');
    const buildBroadcastPayloadFromDraft = requireFunction(deps, 'buildBroadcastPayloadFromDraft');
    const audienceLabel = requireFunction(deps, 'audienceLabel');
    const escapeHtml = requireFunction(deps, 'escapeHtml');
    const buildBroadcastFirstBatchSafetyText = requireFunction(
      deps,
      'buildBroadcastFirstBatchSafetyText'
    );
    const kbAdminFooter = requireFunction(deps, 'kbAdminFooter');

    await ctx.answerCallbackQuery();

    try {
      const rate = await rateLimit(key(['rl', 'bc_confirm', ctx.from.id]), {
        limit: 1,
        windowSec: 60,
      });
      if (!rate.ok && !rate.allowed) {
        await safeEditOrReply(ctx, '⏳ Подожди минуту перед следующей рассылкой.', {
          reply_markup: makeOperationsBackKeyboard(deps),
        });
        return true;
      }
    } catch {}

    const creator = await db.upsertUser(ctx.from.id, ctx.from.username ?? null);
    const draft = await getDraft(ctx.from.id);
    if (!draft || !draft.type) {
      await safeEditOrReply(ctx, '⚠️ Нет черновика.', {
        reply_markup: makeStartAgainKeyboard(deps),
      });
      return true;
    }

    try {
      const payload = buildBroadcastPayloadFromDraft(draft);
      const total = await db.countBroadcastAudience(draft.audience || 'all');
      const result = await db.createBroadcastIdempotent(
        {
          createdByUserId: creator.id,
          audience: draft.audience || 'all',
          draftType: payload.draftType || 'text',
          draftText: payload.draftText || null,
          draftFileId: payload.draftFileId || null,
          draftCaption: payload.draftCaption || null,
          buttonsJson: payload.buttons && payload.buttons.length
            ? JSON.stringify(payload.buttons)
            : null,
          totalCount: total,
        },
        {
          statementTimeoutMs: 8000,
          dedupWindowSec: 45,
        }
      );

      if (!result?.ok) {
        const busy = result?.error === 'busy';
        await safeEditOrReply(
          ctx,
          busy ? '⏳ Уже создаю рассылку…' : '⚠️ Не удалось создать рассылку.',
          { reply_markup: makeOperationsBackKeyboard(deps) }
        );
        return true;
      }

      const broadcast = result?.broadcast;
      if (!broadcast) {
        await safeEditOrReply(ctx, '⚠️ Ошибка при создании рассылки.', {
          reply_markup: makeOperationsBackKeyboard(deps),
        });
        return true;
      }

      try { await clearDraft(ctx.from.id); } catch {}
      const safetyLines = buildBroadcastFirstBatchSafetyText();
      const successHints = [
        'Сначала открой карточку и дождись первой партии.',
        'Потом обнови карточку и проверь отправлено / повтор / пропущено / ошибки.',
        'Только после этого решай, нужен ли следующий шаг.',
      ];
      const keyboard = new InlineKeyboard();
      keyboard
        .text(`📊 Открыть #${broadcast.id}`, commsCb.bcView(broadcast.id))
        .text('📣 К списку', commsCb.bcList(0))
        .row();
      kbAdminFooter(keyboard, '⬅️ Операции', 'a:admin_ops');

      await safeEditOrReply(
        ctx,
        `✅ <b>Рассылка #${broadcast.id} ${result?.deduped ? 'уже создана' : 'создана'}</b>\n\n📊 Аудитория: <b>${audienceLabel(draft.audience)}</b>\n👥 Получателей: <b>${total}</b>\n📋 Статус: <b>PENDING</b>\n\n<b>Проверка первой партии</b>\n• ${escapeHtml(safetyLines[0])}\n• ${escapeHtml(safetyLines[1])}\n• ${escapeHtml(safetyLines[2])}\n\n<b>Итог доставки</b>\n• отправлено: <b>0</b>\n• повтор / ожидание: <b>0</b>\n• пропущено: <b>0</b>\n• ошибки: <b>0</b>\n• основные причины: —\n• следующее действие: открой карточку, проверь первую партию и обнови данные.\n\n<b>Что делать дальше</b>\n• ${escapeHtml(successHints[0])}\n• ${escapeHtml(successHints[1])}\n• ${escapeHtml(successHints[2])}\n\n⏳ Рассылка будет запущена при следующем тике cron.`,
        {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        }
      );
    } catch (error) {
      console.error('[ADMIN] broadcast confirm error', error);
      try {
        deps?.logger?.error?.({ error }, 'broadcast confirm error');
      } catch {}
      await safeEditOrReply(ctx, '⚠️ Ошибка при создании рассылки.', {
        reply_markup: makeOperationsBackKeyboard(deps),
      });
    }
    return true;
  }

  throw new Error(`broadcast_domain.unreachable_dispatch_action:${action}`);
}

export async function handleBroadcastOperationsCallback(ctx, p, _u, deps = {}) {
  const action = String(p?.a || '').trim();
  if (!isBroadcastOperationsAction(action)) return false;
  if (!(await requireAdmin(ctx, deps))) return true;

  if (action === BROADCAST_ACTION.LIST) {
    const renderBroadcastList = requireFunction(deps, 'renderBroadcastList');
    await ctx.answerCallbackQuery();
    await renderBroadcastList(ctx, Number(p?.p || 0));
    return true;
  }

  if (action === BROADCAST_ACTION.VIEW) {
    const renderBroadcastView = requireFunction(deps, 'renderBroadcastView');
    await ctx.answerCallbackQuery();
    await renderBroadcastView(ctx, Number(p?.id || 0));
    return true;
  }

  if (action === BROADCAST_ACTION.BLOCKED) {
    const renderBroadcastBlocked = requireFunction(deps, 'renderBroadcastBlocked');
    await ctx.answerCallbackQuery();
    const page = Math.max(0, Number(p?.p || 0) || 0);
    const tab = String(p?.t || 'hard');
    await renderBroadcastBlocked(ctx, Number(p?.id || 0), page, tab);
    return true;
  }

  if (
    action === BROADCAST_ACTION.PAUSE ||
    action === BROADCAST_ACTION.RESUME ||
    action === BROADCAST_ACTION.STOP
  ) {
    const db = requireValue(deps, 'db');
    const renderBroadcastView = requireFunction(deps, 'renderBroadcastView');
    const broadcastId = Number(p?.id || 0);
    const broadcast = await db.getBroadcast(broadcastId);

    if (action === BROADCAST_ACTION.PAUSE) {
      if (broadcast && (broadcast.status === 'RUNNING' || broadcast.status === 'PENDING')) {
        await db.updateBroadcast(broadcast.id, { status: 'PAUSED' });
        await ctx.answerCallbackQuery({ text: '⏸ Рассылка приостановлена.' });
      } else {
        await ctx.answerCallbackQuery({ text: 'Нельзя приостановить.' });
      }
      await renderBroadcastView(ctx, broadcastId);
      return true;
    }

    if (action === BROADCAST_ACTION.RESUME) {
      if (broadcast && broadcast.status === 'PAUSED') {
        await db.updateBroadcast(broadcast.id, { status: 'RUNNING' });
        await ctx.answerCallbackQuery({ text: '▶️ Рассылка возобновлена.' });
      } else {
        await ctx.answerCallbackQuery({ text: 'Нельзя возобновить.' });
      }
      await renderBroadcastView(ctx, broadcastId);
      return true;
    }

    if (
      broadcast &&
      (broadcast.status === 'RUNNING' ||
        broadcast.status === 'PAUSED' ||
        broadcast.status === 'PENDING')
    ) {
      await db.updateBroadcast(broadcast.id, {
        status: 'STOPPED',
        finished_at: new Date().toISOString(),
      });
      await ctx.answerCallbackQuery({ text: '🛑 Рассылка остановлена.' });
    } else {
      await ctx.answerCallbackQuery({ text: 'Нельзя остановить.' });
    }
    await renderBroadcastView(ctx, broadcastId);
    return true;
  }

  if (action === BROADCAST_ACTION.QSTASH_TOGGLE) {
    const getOperatorControlSnapshot = requireFunction(deps, 'getOperatorControlSnapshot');
    const setOperatorControlToggle = requireFunction(deps, 'setOperatorControlToggle');
    const renderAdminSystem = requireFunction(deps, 'renderAdminSystem');
    await ctx.answerCallbackQuery();
    const control = await getOperatorControlSnapshot({ limit: 1 });
    const current = !!control?.byId?.broadcast_qstash_fanout?.value;
    await setOperatorControlToggle('broadcast_qstash_fanout', !current, {
      actorTgId: Number(ctx.from.id || 0) || 0,
      actorUsername: ctx.from?.username || '',
      note: 'telegram_admin',
    });
    await renderAdminSystem(ctx);
    return true;
  }

  throw new Error(`broadcast_domain.unreachable_operations_action:${action}`);
}
