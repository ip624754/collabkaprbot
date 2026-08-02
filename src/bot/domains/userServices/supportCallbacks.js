import { isUserSupportAction } from './policy.js';

function bindDependencies(deps, names) {
  for (const name of names) {
    if (deps?.[name] === null || deps?.[name] === undefined) {
      throw new Error('user_services_domain.missing_dependency:' + name);
    }
  }
  return deps;
}

const REQUIRED_DEPENDENCIES = Object.freeze([
  'InlineKeyboard',
  'navKb',
  'safeEditOrReply',
  'setExpectText',
]);

function supportText() {
  return `💬 <b>Поддержка</b>

` +
    `Если что-то не работает или есть вопрос — напиши одним сообщением.
` +
    `Я отправлю это в поддержку и вернусь с ответом здесь.

` +
    `Что помогает быстрее решить:
` +
    `• в каком режиме ты был (Креатор / Бренд / Менеджер)
` +
    `• что нажимал (кнопки)
` +
    `• текст ошибки из логов/скрин (опиши)

` +
    `⚠️ Спам/реклама — бан.`;
}

export async function handleUserSupportCallback(ctx, p, u, deps = {}) {
  if (!isUserSupportAction(p?.a)) return false;
  const bound = bindDependencies(deps, REQUIRED_DEPENDENCIES);
  const { InlineKeyboard, navKb, safeEditOrReply, setExpectText } = bound;

  await (async () => {
    if (p.a === 'a:support_push') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const src = String(p?.src || '');
      if (src !== 'admmsg') {
        try {
          const chatId = ctx?.callbackQuery?.message?.chat?.id;
          const msgId = ctx?.callbackQuery?.message?.message_id;
          if (chatId && msgId) {
            await ctx.api.editMessageReplyMarkup(chatId, msgId, { reply_markup: undefined });
          }
        } catch {}
      }

      const kb = (src === 'admmsg')
        ? new InlineKeyboard()
            .text('✍️ Написать в поддержку', 'a:support_write')
            .row()
            .text('📋 Меню', 'a:menu')
        : new InlineKeyboard()
            .text('✍️ Написать в поддержку', 'a:support_write')
            .row()
            .text('🧭 Быстрый старт', 'a:guide')
            .text('📋 Меню', 'a:menu')
            .text('🏠 Домой', 'a:home');

      try {
        await ctx.reply(supportText(), { parse_mode: 'HTML', reply_markup: kb });
      } catch {
        await safeEditOrReply(ctx, supportText(), { parse_mode: 'HTML', reply_markup: kb });
      }
      return;
    }

    if (p.a === 'a:support') {
      const kb = new InlineKeyboard()
        .text('✍️ Написать в поддержку', 'a:support_write')
        .row();

      if (!u?.is_deleted) kb.text('🗑 Удалить аккаунт', 'a:acc_del_q').row();

      kb.text('🧭 Быстрый старт', 'a:guide')
        .text('📋 Меню', 'a:menu')
        .text('🏠 Домой', 'a:home');

      await safeEditOrReply(ctx, supportText(), { parse_mode: 'HTML', reply_markup: kb });
      return;
    }

    if (p.a === 'a:support_write') {
      await ctx.answerCallbackQuery();
      await setExpectText(ctx.from.id, { type: 'support_any', backCb: 'a:support' });

      const text = `✍️ <b>Пришли одним сообщением</b> текст или фото/скрин (можно с подписью).

Пример: «В режиме Brand нажимаю X → ошибка Y».

Я отправлю это в поддержку. После ответа поддержки можно будет просто ответить следующим сообщением.`;

      await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: navKb('a:support') });
      return;
    }
  })();
  return true;
}
