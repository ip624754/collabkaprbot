import { isUserVerificationAction } from './policy.js';

function bindDependencies(deps, names) {
  for (const name of names) {
    if (deps?.[name] === null || deps?.[name] === undefined) {
      throw new Error('user_services_domain.missing_dependency:' + name);
    }
  }
  return deps;
}

const REQUIRED_DEPENDENCIES = Object.freeze([
  'CFG',
  'InlineKeyboard',
  'UI_MODES',
  'calcWsProfileProgress',
  'db',
  'getActiveWorkspace',
  'getRoleFlags',
  'getUiMode',
  'isBrandBasicComplete',
  'isBrandExtendedComplete',
  'mainMenuKb',
  'navKb',
  'renderVerifyHome',
  'renderVerifyInfo',
  'safeBrandProfiles',
  'safeEditOrReply',
  'safeUserVerifications',
  'setExpectText',
]);

export async function handleUserVerificationCallback(ctx, p, u, deps = {}) {
  if (!isUserVerificationAction(p?.a)) return false;
  const bound = bindDependencies(deps, REQUIRED_DEPENDENCIES);
  const {
    CFG,
    InlineKeyboard,
    UI_MODES,
    calcWsProfileProgress,
    db,
    getActiveWorkspace,
    getRoleFlags,
    getUiMode,
    isBrandBasicComplete,
    isBrandExtendedComplete,
    mainMenuKb,
    navKb,
    renderVerifyHome,
    renderVerifyInfo,
    safeBrandProfiles,
    safeEditOrReply,
    safeUserVerifications,
    setExpectText,
  } = bound;

  await (async () => {
    if (p.a === 'a:verify_home') {
      await ctx.answerCallbackQuery();
      if (!CFG.VERIFICATION_ENABLED) {
        await safeEditOrReply(ctx, '✅ Верификация сейчас отключена.', { reply_markup: mainMenuKb(await getRoleFlags(u, ctx.from.id)) });
        return;
      }
      await renderVerifyHome(ctx, u);
      return;
    }

    if (p.a === 'a:verify_info') {
      await ctx.answerCallbackQuery();
      await renderVerifyInfo(ctx);
      return;
    }

    if (p.a === 'a:verify_kind') {
      await ctx.answerCallbackQuery();
      if (!CFG.VERIFICATION_ENABLED) {
        await ctx.answerCallbackQuery({ text: 'Верификация отключена.' });
        return;
      }

      const uiMode = await getUiMode(ctx.from.id);
      const kind = (uiMode === UI_MODES.BRAND) ? 'brand' : 'creator';

      const existing = await safeUserVerifications(() => db.getUserVerification(u.id), async () => null);
      const exStatus = String(existing?.status || '').toUpperCase();
      const exKind = String(existing?.kind || '').toLowerCase();
      if (existing && exKind && exKind !== kind) {
        const want = kind === 'brand' ? '🏷 Бренд' : '🤳 Креатор';
        const have = exKind === 'brand' ? '🏷 Бренд' : '🤳 Креатор';
        const switchCb = exKind === 'brand' ? 'a:onb_brand' : 'a:onb_creator';
        const switchLabel = exKind === 'brand' ? '🏷 Режим бренда' : '🤳 Режим креатора';
        let what = 'заявка/статус';
        if (exStatus === 'APPROVED') what = '✅ Verified';
        else if (exStatus === 'PENDING') what = '⏳ заявка';
        else if (exStatus === 'REJECTED') what = '❌ отклонённая заявка';

        await safeEditOrReply(ctx, `✅ <b>Верификация</b>

У тебя уже есть ${what} в другом режиме: <b>${have}</b>.

В системе хранится <b>одна</b> верификация на пользователя.
Чтобы не потерять текущий статус — переключись в нужный режим.

Сейчас открыт режим: <b>${want}</b>.

Если нужно поменять тип верификации — напиши администратору.`, {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard().text(switchLabel, switchCb).row().text('⬅️ Назад', 'a:verify_home')
        });
        return;
      }

      if (kind === 'creator') {
        let ws = null;
        let wsId = 0;

        try { wsId = Number(await getActiveWorkspace(ctx.from.id)) || 0; } catch { wsId = 0; }

        if (wsId) {
          try { ws = await db.getWorkspace(u.id, wsId); } catch { ws = null; }
        }

        if (!ws) {
          try {
            const list = await db.listWorkspaces(u.id);
            if (list && list.length) {
              ws = list[0];
              wsId = Number(ws.id) || wsId;
            }
          } catch {
            ws = null;
          }
        }

        if (!ws) {
          await safeEditOrReply(ctx,
            `✅ <b>Верификация креатора</b>

Сначала подключи канал (workspace), потом заполни витрину — так модерации проще проверить.`,
            {
              parse_mode: 'HTML',
              reply_markup: new InlineKeyboard()
                .text('🚀 Подключить канал', 'a:setup')
                .row()
                .text('⬅️ Назад', 'a:verify_home')
            }
          );
          return;
        }

        const prog = calcWsProfileProgress(ws);
        const ok = !!(prog.aboutOk && (prog.portfolioOk || prog.igOk) && (prog.contactOk || !!ws.channel_username));
        if (!ok) {
          await safeEditOrReply(ctx,
            `✅ <b>Верификация креатора</b>

Чтобы подать заявку, заполни витрину минимум:
• 📝 описание
• 🔗 портфолио или 📸 Instagram
• ✉️ контакт (или @канал)

<i>Зачем:</i> меньше спама и быстрее проверка.`,
            {
              parse_mode: 'HTML',
              reply_markup: new InlineKeyboard()
                .text('👤 Профиль канала', `a:ws_profile|ws:${wsId || ws.id}`)
                .row()
                .text('⬅️ Назад', 'a:verify_home')
            }
          );
          return;
        }
      }

      if (kind === 'brand') {
        const prof = await safeBrandProfiles(() => db.getBrandProfile(u.id), async () => null);

        if (!isBrandBasicComplete(prof)) {
          await safeEditOrReply(ctx,
            `🏷 <b>Верификация Brand</b>

Чтобы подать заявку как бренд, заполни базовый профиль:
• название
• ниша
• контакт
• ссылка`,
            {
              parse_mode: 'HTML',
              reply_markup: new InlineKeyboard()
                .text('🏷 Профиль бренда', 'a:brand_profile|ws:0|ret:verify')
                .row()
                .text('⬅️ Назад', 'a:verify_home')
            }
          );
          return;
        }

        if (CFG.BRAND_VERIFY_REQUIRES_EXTENDED && !isBrandExtendedComplete(prof)) {
          await safeEditOrReply(ctx,
            `🏷 <b>Верификация Brand</b>

Чтобы подать заявку как бренд, заполни расширенный профиль:
• ниша
• гео
• форматы сотрудничества

<i>Зачем:</i> модерации нужны факты, а креаторам — понятность.`,
            {
              parse_mode: 'HTML',
              reply_markup: new InlineKeyboard()
                .text('🏷 Профиль бренда', 'a:brand_profile|ws:0|ret:verify')
                .row()
                .text('⬅️ Назад', 'a:verify_home')
            }
          );
          return;
        }
      }

      await setExpectText(ctx.from.id, { type: 'verify_submit', kind });
      await safeEditOrReply(ctx,
        `✅ <b>Заявка на верификацию</b>

Отправь одним сообщением:
1) ссылку на твой канал/профиль
2) 2–3 цифры/факта (охваты/подписчики/ниша)
3) контакты для связи
4) коротко: что предлагаешь / что ищешь

<i>Важно:</i> только текст (1 сообщение).`,
        { parse_mode: 'HTML', reply_markup: navKb('a:verify_home') }
      );
      return;
    }
  })();
  return true;
}
