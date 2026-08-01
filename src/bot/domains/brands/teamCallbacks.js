import { isBrandTeamMembershipAction } from './policy.js';

function bindDependencies(deps, names) {
  for (const name of names) {
    if (deps?.[name] === null || deps?.[name] === undefined) {
      throw new Error('brand_domain.missing_dependency:' + name);
    }
  }
  return deps;
}

const REQUIRED_DEPENDENCIES = Object.freeze([
  'CFG',
  'InlineKeyboard',
  'brandManagerLimitInfo',
  'brandManagerRemoveConfirmKb',
  'brandManagersListKb',
  'brandTeamKb',
  'clearBmActiveBrand',
  'db',
  'disableBrandManagerState',
  'ensureBrandTeamUnlocked',
  'escapeHtml',
  'getBmActiveBrand',
  'k',
  'navKb',
  'randomToken',
  'redis',
  'safeBrandProfiles',
  'safeEditOrReply',
  'setExpectText',
]);

export async function handleBrandTeamMembershipCallback(ctx, p, u, deps = {}) {
  if (!isBrandTeamMembershipAction(p?.a)) return false;
  const bound = bindDependencies(deps, REQUIRED_DEPENDENCIES);
  const {
    CFG,
    InlineKeyboard,
    brandManagerLimitInfo,
    brandManagerRemoveConfirmKb,
    brandManagersListKb,
    brandTeamKb,
    clearBmActiveBrand,
    db,
    disableBrandManagerState,
    ensureBrandTeamUnlocked,
    escapeHtml,
    getBmActiveBrand,
    k,
    navKb,
    randomToken,
    redis,
    safeBrandProfiles,
    safeEditOrReply,
    setExpectText,
  } = bound;

  await (async () => {
if (p.a === 'a:brand_team_help') {
          await ctx.answerCallbackQuery();
          const wsId = Number(p.w || p.ws || 0);
          const ret = String(p.ret || 'menu');
          const backCb = (ret === 'bx')
            ? `a:bx_open|ws:${wsId}`
            : (ret === 'profile')
              ? `a:brand_profile|ws:${wsId}|ret:brand`
              : 'a:menu';
          const linkRet = (ret === 'bx') ? 'brand_team_bx' : 'brand_team';
          const text = `👔 <b>Менеджеры бренда — как работает доступ</b>

Кнопка «👔 Менеджеры бренда» <b>всегда видна</b>.

Доступ открывается, когда:
1) ✅ заполнены 4 базовых поля профиля бренда (Название, Ниши, Контакт, Ссылка)
2) ✅ активен <b>Brand Plan</b> (покупка или подаренный)

Это сделано, чтобы:
— у команды бренда был единый “контур” (профиль + инструменты)
— избежать спама и пустых аккаунтов в CRM

После выполнения условий просто открой «👔 Менеджеры бренда» ещё раз — доступ откроется.`;

          const kb = new InlineKeyboard()
            .text('👔 Менеджеры бренда', `a:brand_team|ws:${wsId}|ret:${ret}`).row()
            .text('🏷 Профиль бренда', `a:brand_profile|ws:${wsId}|ret:${linkRet}`)
            .text('⭐️ Brand Plan', `a:brand_plan|ws:${wsId}|ret:${linkRet}`)
            .row()
            .text('⬅️ Назад', backCb).text('🏠 Домой', 'a:home');

          await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
          return;
        }

if (p.a === 'a:brand_team') {
      await ctx.answerCallbackQuery();

      const wsId = Number(p.w || p.ws || 0);
      const ret = String(p.ret || 'menu');
      const backCb = (ret === 'bx')
        ? `a:bx_open|ws:${wsId}`
        : (ret === 'profile')
          ? `a:brand_profile|ws:${wsId}|ret:brand`
          : 'a:menu';

      const gate = await ensureBrandTeamUnlocked(ctx, u, { backCb, wsId, ret });
      if (!gate) return;


      const managers = await db.listBrandManagers(u.id);
      const count = managers.length;
      const mLim = await brandManagerLimitInfo(u.id);

      const limitLine = `Лимит: <b>${mLim.count}/${mLim.max}</b>`;

      const text = `👔 <b>Менеджеры бренда</b>

Добавь менеджеров — они смогут быстрее отвечать на заявки и закрывать сделки.
У менеджера нет доступа к оплатам, профилю бренда и управлению командой.

Сейчас менеджеров: <b>${count}</b>
${limitLine}`;

      await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: brandTeamKb({ wsId, ret, backCb }) });
      return;
    }

if (p.a === 'a:bm_invite') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      const ret = String(p.ret || 'menu');
      const backCb = (ret === 'bx') ? `a:bx_open|ws:${wsId}` : 'a:menu';
      const gate = await ensureBrandTeamUnlocked(ctx, u, { backCb, wsId, ret });
      if (!gate) return;
      const token = randomToken(10);
      await redis.set(
        k(['bm_invite', token]),
        { brandUserId: u.id, addedByUserId: u.id },
        { ex: 24 * 3600 }
      );

      const link = `https://t.me/${CFG.BOT_USERNAME}?start=bminv_${token}`;
      const text = `🔗 <b>Приглашение менеджера</b>

Ссылка одноразовая, действует <b>24 часа</b>.
Отправь её человеку, которого хочешь добавить в команду:

${link}`;

      await safeEditOrReply(ctx, text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: navKb(`a:brand_team|ws:${wsId}|ret:${ret}`),
      });
      return;
    }

if (p.a === 'a:bm_add_username') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      const ret = String(p.ret || 'menu');
      const backCb = (ret === 'bx') ? `a:bx_open|ws:${wsId}` : 'a:menu';
      const gate = await ensureBrandTeamUnlocked(ctx, u, { backCb, wsId, ret });
      if (!gate) return;
      await setExpectText(ctx.from.id, { type: 'bm_username' });
      await safeEditOrReply(ctx, 'Введи @username менеджера одним сообщением (пример: @manager).', {
        reply_markup: navKb(`a:brand_team|ws:${wsId}|ret:${ret}`),
      });
      return;
    }

if (p.a === 'a:bm_list') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      const ret = String(p.ret || 'menu');
      const backCb = (ret === 'bx') ? `a:bx_open|ws:${wsId}` : 'a:menu';
      const gate = await ensureBrandTeamUnlocked(ctx, u, { backCb, wsId, ret });
      if (!gate) return;
      const managers = await db.listBrandManagers(u.id);
      if (!managers.length) {
        await safeEditOrReply(ctx, 'Пока менеджеров нет. Добавь менеджера через приглашение или по @username.', {
          reply_markup: navKb(`a:brand_team|ws:${wsId}|ret:${ret}`),
        });
        return;
      }

      const lines = managers.map((m) => {
        const label = m.tg_username ? `@${m.tg_username}` : `id:${m.tg_id}`;
        return `• ${escapeHtml(label)}`;
      }).join('\n');

      await safeEditOrReply(ctx, `👥 <b>Менеджеры бренда</b>\n\n${lines}\n\nНажми на кнопку, чтобы удалить менеджера.`, {
        parse_mode: 'HTML',
        reply_markup: brandManagersListKb(managers),
      });
      return;
    }

if (p.a === 'a:bm_rm_q') {
      await ctx.answerCallbackQuery();
      const gate = await ensureBrandTeamUnlocked(ctx, u);
      if (!gate) return;
      const managerUserId = Number(p.u || 0);
      if (!managerUserId) return;

      const info = await db.getUserTgIdByUserId(managerUserId);
      const label = info?.tg_username ? `@${info.tg_username}` : (info?.tg_id ? `id:${info.tg_id}` : `user #${managerUserId}`);

      await safeEditOrReply(ctx, `Удалить менеджера <b>${escapeHtml(label)}</b> из команды бренда?`, {
        parse_mode: 'HTML',
        reply_markup: brandManagerRemoveConfirmKb(managerUserId),
      });
      return;
    }

if (p.a === 'a:bm_rm_ok') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      const ret = String(p.ret || 'menu');
      const gate = await ensureBrandTeamUnlocked(ctx, u);
      if (!gate) return;
      const managerUserId = Number(p.u || 0);
      if (!managerUserId) return;
      await db.removeBrandManager(u.id, managerUserId);

      // Best-effort notification to removed manager
      let notifyOk = false;
      try {
        const mi = await db.getUserTgIdByUserId(managerUserId);
        const managerTgId = Number(mi?.tg_id || 0);
        if (managerTgId) {
          // clean up manager state if this brand was active
          try {
            const active = await getBmActiveBrand(managerTgId);
            if (active === u.id) await clearBmActiveBrand(managerTgId);
          } catch { }

          // if no more brands left -> disable manager mode
          try {
            const still = await db.listBrandsForManager(managerUserId);
            if (!still || !still.length) await disableBrandManagerState(managerTgId);
          } catch { }

          const prof = await safeBrandProfiles(() => db.getBrandProfile(u.id), async () => null);
          const brandLabel = prof?.brand_name ? String(prof.brand_name).trim()
            : (prof?.tg_username ? `@${String(prof.tg_username).trim()}` : `Бренд #${u.id}`);

          const msg = `⛔️ <b>Доступ отозван</b>\n\nТебя удалили из команды бренда <b>${escapeHtml(brandLabel)}</b>.\n\nЕсли у тебя есть другие бренды — открой кабинет менеджера и выбери бренд.`;
          const kb = new InlineKeyboard()
            .text('🧑‍💼 Я менеджер бренда', 'a:bm_home')
            .row()
            .text('🗑 Убрать', 'a:nd')
            .row()
            .text('📋 Меню', 'a:menu')
            .text('🏠 Домой', 'a:home');
          await ctx.api.sendMessage(managerTgId, msg, { parse_mode: 'HTML', reply_markup: kb });
          notifyOk = true;
        }
      } catch { }

      // refresh list
      const managers = await db.listBrandManagers(u.id);
      if (!managers.length) {
        await safeEditOrReply(ctx, '✅ Менеджер удалён. Сейчас менеджеров нет.', {
          reply_markup: navKb(`a:brand_team|ws:${wsId}|ret:${ret}`),
        });
        return;
      }
      const lines = managers.map((m) => {
        const label = m.tg_username ? `@${m.tg_username}` : `id:${m.tg_id}`;
        return `• ${escapeHtml(label)}`;
      }).join('\n');

      const note = notifyOk ? '\n\n📩 Менеджеру отправлено уведомление.' : '';
      await safeEditOrReply(ctx, `✅ Менеджер удалён.${note}\n\n👥 <b>Менеджеры бренда</b>\n\n${lines}`, {
        parse_mode: 'HTML',
        reply_markup: brandManagersListKb(managers),
      });
      return;
    }

    throw new Error('brand_domain.unreachable_team_membership_action:' + String(p?.a || 'missing'));
  })();
  return true;
}
