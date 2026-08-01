import { isDirectoryPublicWorkspaceAction, isDirectorySearchAction } from './policy.js';

function bindDependencies(deps, names) {
  for (const name of names) {
    if (deps?.[name] === null || deps?.[name] === undefined) {
      throw new Error('directory_domain.missing_dependency:' + name);
    }
  }
  return deps;
}

const SEARCH_REQUIRED_DEPENDENCIES = Object.freeze([
  'BX_HOME',
  'PM_LIMITS',
  'pmGetState',
  'pmResetState',
  'pmSetState',
  'renderProfileMatchingHome',
  'renderProfileMatchingPick',
  'renderProfileMatchingResults',
  'renderWsPublicProfile',
  'resolveBmBrandContext',
  'resolveBxHomeFromUi',
]);

const PUBLIC_WORKSPACE_REQUIRED_DEPENDENCIES = Object.freeze([
  'BRAND_APP_ACCEPT_COST',
  'BX_HOME',
  'CFG',
  'CONTACT_UNLOCK_COST',
  'CONTACT_UNLOCK_TTL_DAYS',
  'CONTACT_UNLOCK_TTL_SEC',
  'InlineKeyboard',
  'MONETIZATION_CB_TIMEOUT_MS',
  'MONETIZATION_TOKEN_LOCK_TTL_SEC',
  'acquireLock',
  'brandLeadProfileButtonLabel',
  'brandLeadWhatNextText',
  'deLinkifyText',
  'enqueueMonetizationRetry',
  'escapeHtml',
  'isMonetizationAsyncRetryEnabled',
  'isTransientNeonError',
  'releaseLock',
  'renderBrandPass',
  'setBrandCreditsCache',
  'setMonUnlockDiag',
  'shortUrl',
  'wsTgUrlFromContact',
  'answerRecovery',
  'brandLeadContactUnlockButtonLabel',
  'brandLeadDialogButtonLabel',
  'brandPassCreditsBlockLines',
  'contactUnlockActionLabel',
  'contactUnlockBtnLabel',
  'db',
  'getBrandCreditsRedisOnly',
  'k',
  'redis',
  'renderStaleButton',
  'renderWsPublicProfile',
  'resolveBxHomeFromUi',
  'ruPlural',
  'safeEditOrReply',
  'withTimeout',
]);

export async function handleDirectorySearchCallback(ctx, p, u, deps = {}) {
  if (!isDirectorySearchAction(p?.a)) return false;
  const bound = bindDependencies(deps, SEARCH_REQUIRED_DEPENDENCIES);
  const {
    BX_HOME,
    PM_LIMITS,
    pmGetState,
    pmResetState,
    pmSetState,
    renderProfileMatchingHome,
    renderProfileMatchingPick,
    renderProfileMatchingResults,
    renderWsPublicProfile,
    resolveBmBrandContext,
    resolveBxHomeFromUi,
  } = bound;

  await (async () => {
    if (p.a === 'a:pm_home') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);

      const bm = wsId === 0 ? await resolveBmBrandContext(ctx, u) : { enabled: false };
      const effectiveUserId = (wsId === 0 && bm.enabled) ? bm.brandUserId : u.id;

      await renderProfileMatchingHome(ctx, effectiveUserId, wsId);
      return;
    }

    if (p.a === 'a:pm_reset') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      await pmResetState(ctx.from.id, wsId);
      await renderProfileMatchingHome(ctx, u.id, wsId);
      return;
    }

    if (p.a === 'a:pm_pick') {
      await ctx.answerCallbackQuery();
      await renderProfileMatchingPick(ctx, u.id, Number(p.ws || 0), String(p.t || 'v'));
      return;
    }

    if (p.a === 'a:pm_tog') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const type = String(p.t || 'v');
      const key = String(p.k || '');

      const st = await pmGetState(ctx.from.id, wsId);
      const sel = type === 'v' ? st.v : st.f;
      const max = type === 'v' ? PM_LIMITS.verticals : PM_LIMITS.formats;

      const has = sel.includes(key);
      let next = has ? sel.filter(x => x !== key) : [...sel, key];

      if (!has && next.length > max) {
        await ctx.answerCallbackQuery({ text: `Лимит: максимум ${max}`, show_alert: true });
        await renderProfileMatchingPick(ctx, u.id, wsId, type);
        return;
      }

      next = Array.from(new Set(next));
      if (type === 'v') st.v = next;
      else st.f = next;

      await pmSetState(ctx.from.id, wsId, st);
      await renderProfileMatchingPick(ctx, u.id, wsId, type);
      return;
    }

    if (p.a === 'a:pm_run') {
      await ctx.answerCallbackQuery();
      await renderProfileMatchingResults(ctx, u.id, Number(p.ws || 0), Number(p.p || 0));
      return;
    }

    if (p.a === 'a:pm_view') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const target = Number(p.id || 0);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages
      if (!target) return;
      await renderWsPublicProfile(ctx, target, { backCb: `a:pm_run|ws:${wsId}|p:${page}` });
      return;
    }

    throw new Error('directory_domain.unreachable_search_action:' + String(p?.a || 'missing'));
  })();
  return true;
}

export async function handleDirectoryPublicWorkspaceCallback(ctx, p, u, deps = {}) {
  if (!isDirectoryPublicWorkspaceAction(p?.a)) return false;
  const bound = bindDependencies(deps, PUBLIC_WORKSPACE_REQUIRED_DEPENDENCIES);
  const {
    BRAND_APP_ACCEPT_COST,
    BX_HOME,
    CFG,
    CONTACT_UNLOCK_COST,
    CONTACT_UNLOCK_TTL_DAYS,
    CONTACT_UNLOCK_TTL_SEC,
    InlineKeyboard,
    MONETIZATION_CB_TIMEOUT_MS,
    MONETIZATION_TOKEN_LOCK_TTL_SEC,
    acquireLock,
    answerRecovery,
    brandLeadContactUnlockButtonLabel,
    brandLeadProfileButtonLabel,
    brandLeadWhatNextText,
    brandLeadDialogButtonLabel,
    brandPassCreditsBlockLines,
    contactUnlockActionLabel,
    contactUnlockBtnLabel,
    db,
    deLinkifyText,
    enqueueMonetizationRetry,
    escapeHtml,
    getBrandCreditsRedisOnly,
    isMonetizationAsyncRetryEnabled,
    isTransientNeonError,
    k,
    redis,
    releaseLock,
    renderBrandPass,
    renderStaleButton,
    renderWsPublicProfile,
    resolveBxHomeFromUi,
    ruPlural,
    safeEditOrReply,
    setBrandCreditsCache,
    setMonUnlockDiag,
    shortUrl,
    withTimeout,
    wsTgUrlFromContact,
  } = bound;

  await (async () => {
if (p.a === 'a:wsp_preview') {
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      if (!wsId) return answerRecovery(ctx, 'channel', { showAlert: true });

      try { await ctx.answerCallbackQuery({ text: 'Открываю витрину…' }); } catch {}

      try {
        await renderWsPublicProfile(ctx, wsId, { backCb: `a:ws_profile|ws:${wsId}` });
      } catch (e) {
        const cid = ctx?.state?.cid || `${ctx?.update?.update_id ?? 0}-${ctx?.from?.id ?? 0}`;
        try { console.warn('[wsp_preview] error', { cid, wsId, err: String(e?.message || e) }); } catch {}
        const kb = new InlineKeyboard().text('↩️ Назад', `a:ws_profile|ws:${wsId}`);
        await safeEditOrReply(ctx, '⚠️ Не удалось открыть предпросмотр. Попробуй ещё раз.', { reply_markup: kb });
      }
      return;
    }

    if (p.a === 'a:wsp_open') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      if (!wsId) {
        await renderStaleButton(ctx, { text: '⚠️ Витрина не найдена или кнопка устарела. Открой 📋 Меню и повтори.', backCb: 'a:menu' });
        return;
      }

      await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);

      const mode = String(p.m || '').trim().toLowerCase();
      const ro = mode === 'ro' || String(p.ro || '').trim() === '1';

      const leadId = Number(p.l || 0);
      const ret = String(p.r || '').trim().toLowerCase();
      const fromLead = ret === 'bl' && !!leadId;

      const opts = {};
      if (ro || fromLead) opts.hideApply = true;
      if (fromLead) {
        opts.backCb = `a:blead_view|id:${leadId}|w:${wsId}`;
        opts.contactCbExtra = `|r:bl|l:${leadId}`;
        opts.dialogCb = `a:blead_view|id:${leadId}|w:${wsId}`;
        opts.brandLeadId = leadId;
      }

      await renderWsPublicProfile(ctx, wsId, opts);
      return;
    }

    if (p.a === 'a:wsp_contact_req') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      if (!wsId) {
        await renderStaleButton(ctx, { text: '⚠️ Витрина не найдена или кнопка устарела. Открой 📋 Меню и повтори.', backCb: 'a:menu' });
        return;
      }

      const ret = String(p.r || '').trim().toLowerCase();
      const leadId = Number(p.l || 0);
      const fromLead = ret === 'bl' && !!leadId;
      const ctxExtra = fromLead ? `|r:bl|l:${leadId}` : '';
      const backCb = fromLead ? `a:blead_view|id:${leadId}|w:${wsId}` : `a:wsp_open|ws:${wsId}`;

      // already unlocked?
      {
        const key = k(['wsp_contact', wsId, u.id]);
        let redisOk = true;
        try {
          if (await redis.get(key)) {
            try { await ctx.answerCallbackQuery({ text: 'Уже открыто ✅' }); } catch {}
            await renderWsPublicProfile(ctx, wsId, { revealContacts: true, hideApply: fromLead, backCb: backCb, contactCbExtra: ctxExtra, dialogCb: fromLead ? `a:blead_view|id:${leadId}|w:${wsId}` : '', brandLeadId: fromLead ? leadId : 0 });
            return;
          }
        } catch {
          redisOk = false;
        }

        // DB fallback ONLY when Redis is unavailable.
        if (!redisOk) {
          try {
            if (await withTimeout(db.isWorkspaceContactsUnlocked(u.id, wsId), 2500, 'wsp.unlock.db')) {
              try { await redis.set(key, 1, { ex: CONTACT_UNLOCK_TTL_SEC }); } catch {}
              try { await ctx.answerCallbackQuery({ text: 'Уже открыто ✅' }); } catch {}
              await renderWsPublicProfile(ctx, wsId, { revealContacts: true, hideApply: fromLead, backCb: backCb, contactCbExtra: ctxExtra, dialogCb: fromLead ? `a:blead_view|id:${leadId}|w:${wsId}` : '', brandLeadId: fromLead ? leadId : 0 });
              return;
            }
          } catch {}
        }
      }

      // STEP175: if unlock is already queued (token-lock exists), don't show the spending button again.
      {
        const lockKey = k(['mon', 'lock', 'wsp_contact_unlock', wsId, u.id]);
        let pending = false;
        try {
          pending = !!(await withTimeout(redis.get(lockKey), 1200, 'mon.lock'));
        } catch {
          pending = false;
        }

        if (pending) {
          const openCb = fromLead ? `a:wsp_open|ws:${wsId}|m:ro${ctxExtra}` : `a:wsp_open|ws:${wsId}`;
          const kb = new InlineKeyboard()
            .text('💬 Диалоги', 'a:bx_inbox|ws:0|p:0|h:mm')
            .text('🔄 Обновить', openCb)
            .row()
            .text('💳 Купить ещё', `a:brand_pass|ws:0|ret:wsp|rws:${wsId}`)
            .row()
            .text(fromLead ? brandLeadDialogButtonLabel(leadId) : '⬅️ Назад', backCb)
            .text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');

          const text =
            `⏳ <b>В обработке…</b>
<i>🔓 Открываем контакты</i>

Запрос уже в очереди. Нажми «🔄 Обновить» через 10–30 секунд.`;

          await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
          return;
        }
      }

      // IMPORTANT (STEP166): never hide monetization actions because of an unknown balance.
      // Balance can be "—" (Redis degradation / cold cache), but the click handler is DB-truth.
      const bal = await getBrandCreditsRedisOnly(u.id, { warm: true });
      const kb = new InlineKeyboard();
      kb.text(fromLead ? brandLeadContactUnlockButtonLabel() : contactUnlockActionLabel(), `a:wsp_contact_unlock|ws:${wsId}${ctxExtra}`).row();
      kb
        .text('💳 Купить ещё', `a:brand_pass|ws:0|ret:wsp|rws:${wsId}`)
        .row()
        .text(fromLead ? brandLeadDialogButtonLabel(leadId) : '⬅️ Назад', backCb);

      const balNum = (bal === null || bal === undefined) ? null : Number(bal || 0);
      const canUnlock = (CONTACT_UNLOCK_COST <= 0) || (balNum !== null && balNum >= CONTACT_UNLOCK_COST);
      const introCost = Math.max(1, Number(CFG.INTRO_COST_PER_INTRO || 1));

      const tail = canUnlock
        ? `Нажми «${fromLead ? brandLeadContactUnlockButtonLabel() : contactUnlockActionLabel()}» или купи кредиты.`
        : (balNum === null
          ? `Нажми «${fromLead ? brandLeadContactUnlockButtonLabel() : contactUnlockActionLabel()}» — баланс проверим при нажатии. Если кредитов не хватит, предложим докупить.`
          : `Недостаточно кредитов для ${fromLead ? brandLeadContactUnlockButtonLabel() : contactUnlockBtnLabel()}: нужно <b>${CONTACT_UNLOCK_COST}</b>, у тебя <b>${balNum}</b>. Купи кредиты и повтори.`);

      const text =
        `🔒 <b>Контакты на витрине скрыты</b>

Кредиты — расходуемые единицы бренда. Их покупают за Stars, но это не подписка.

Кредиты списываются за:
• Новый диалог: <b>${introCost}</b> ${ruPlural(introCost, 'кредит', 'кредита', 'кредитов')}
• Принять заявку и открыть сделку: <b>${BRAND_APP_ACCEPT_COST}</b> ${ruPlural(BRAND_APP_ACCEPT_COST, 'кредит', 'кредита', 'кредитов')}
• ${CONTACT_UNLOCK_COST <= 0 ? 'Контакты в витрине: <b>бесплатно</b>' : `Контакты в одной витрине: <b>${CONTACT_UNLOCK_COST}</b> ${ruPlural(CONTACT_UNLOCK_COST, 'кредит', 'кредита', 'кредитов')}`} на <b>${CONTACT_UNLOCK_TTL_DAYS}</b> ${ruPlural(CONTACT_UNLOCK_TTL_DAYS, 'день', 'дня', 'дней')}

Сообщения внутри открытого диалога бесплатны.

${brandPassCreditsBlockLines(bal, { showHintWhenUnknown: true }).join('\n')}

${tail}`;

      await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
      return;
    }

    if (p.a === 'a:wsp_contact_unlock') {
      const wsId = Number(p.w || p.ws || 0);
      if (!wsId) {
        await setMonUnlockDiag({ source: 'click',  status: 'skipped', errorCode: 'bad_ws_id', wsId: null });
        try { await answerRecovery(ctx, 'channel', { showAlert: true }); } catch {}
        return;
      }

      const dedupId = `mzr:wsp_contact_unlock:${wsId}:${Number(u.id || 0)}`;
      const asyncRetryEnabled = isMonetizationAsyncRetryEnabled();


      const redisDegraded = (ctx.state?.redisOk === false);
      const needFastTimeout = (asyncRetryEnabled || redisDegraded);

      const ret = String(p.r || '').trim().toLowerCase();
      const leadId = Number(p.l || 0);
      const fromLead = ret === 'bl' && !!leadId;
      const ctxExtra = fromLead ? `|r:bl|l:${leadId}` : '';
      const backCb = fromLead ? `a:blead_view|id:${leadId}|w:${wsId}` : `a:wsp_open|ws:${wsId}`;
      const roOpts = fromLead ? { hideApply: true, backCb, contactCbExtra: ctxExtra, dialogCb: backCb, brandLeadId: leadId } : {};

      const openCb = fromLead ? `a:wsp_open|ws:${wsId}|m:ro${ctxExtra}` : `a:wsp_open|ws:${wsId}`;
      const inboxCb = 'a:bx_inbox|ws:0|p:0|h:mm';
      const buyCb = `a:brand_pass|ws:0|ret:wsp|rws:${wsId}`;

      const renderUnlockPending = async (opts = {}) => {
        const alreadyQueued = !!opts.alreadyQueued;
        const reason = String(opts.reason || '').trim();
        try { await ctx.answerCallbackQuery({ text: alreadyQueued ? '⏳ Уже в обработке…' : '⏳ В обработке…', show_alert: false }); } catch {}

        const kb = new InlineKeyboard()
          .text('💬 Диалоги', inboxCb)
          .text('🔄 Обновить', openCb)
          .row()
          .text('💳 Купить ещё', buyCb)
          .row()
          .text(fromLead ? brandLeadDialogButtonLabel(leadId) : '⬅️ Назад', backCb)
          .text('📋 Меню', 'a:menu').text('🏠 Домой', 'a:home');

        const hint = alreadyQueued
          ? 'Запрос уже в обработке.'
          : (asyncRetryEnabled ? 'Мы поставили задачу в очередь.' : 'Запрос обрабатывается.');
        const extra = reason ? `${reason}\n\n` : '';

        await safeEditOrReply(
          ctx,
          `⏳ <b>В обработке…</b>
<i>🔓 Открываем контакты</i>

${extra}${hint} Нажми «🔄 Обновить» через 10–30 секунд.`,
          { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true }
        );
      };

      // owner/curator should never pay
      try {
        const ws = needFastTimeout
          ? await withTimeout(db.getWorkspaceAny(wsId), MONETIZATION_CB_TIMEOUT_MS, 'wsp.owner')
          : await db.getWorkspaceAny(wsId);
        if (ws && Number(ws.owner_user_id) === Number(u.id)) {
          await setMonUnlockDiag({ source: 'click',  status: 'skipped', errorCode: 'owner', wsId });
          try { await ctx.answerCallbackQuery({ text: 'Это твоя витрина ✅' }); } catch {}
          await renderWsPublicProfile(ctx, wsId, { revealContacts: true, ...roOpts });
          return;
        }
      } catch (e) {
        if (asyncRetryEnabled && isTransientNeonError(e)) {
          const q = await enqueueMonetizationRetry('wsp_contact_unlock', { ws_id: wsId, brand_user_id: Number(u.id || 0), actor_tg_id: Number(ctx.from?.id || 0) }, dedupId);
          if (q.ok) {
            await setMonUnlockDiag({ source: 'click',  status: 'ok', errorCode: 'queued', wsId });
                        await renderUnlockPending({ reason: 'База данных сейчас отвечает медленно — мы поставили задачу в очередь.' });
            return;
          }
        }

        if (redisDegraded && isTransientNeonError(e)) {
          await setMonUnlockDiag({ source: 'click',  status: 'ok', errorCode: 'degraded_timeout', wsId });
          await renderUnlockPending({ reason: 'Redis сейчас недоступен, база может отвечать медленно — попробуй обновить через 10–30 сек.' });
          return;
        }
      }

      // idempotency (cached in Redis)
      try {
        const key = k(['wsp_contact', wsId, u.id]);
        if (await redis.get(key)) {
          await setMonUnlockDiag({ source: 'click',  status: 'skipped', errorCode: 'already', wsId });
          try { await ctx.answerCallbackQuery({ text: 'Уже открыто ✅' }); } catch {}
          await renderWsPublicProfile(ctx, wsId, { revealContacts: true, ...roOpts });
          return;
        }
      } catch {}

      // STEP174: optimistic unlock (queue-first) when async retry is configured.
      // Goal: UX must not depend on synchronous Neon writes; DB-truth happens in QStash worker.
      if (asyncRetryEnabled) {
        const lockKey = k(['mon', 'lock', 'wsp_contact_unlock', wsId, u.id]);
        let lock = null;
        let lockErr = false;
        try {
          lock = await acquireLock(lockKey, MONETIZATION_TOKEN_LOCK_TTL_SEC);
        } catch {
          lockErr = true;
          lock = null;
        }

        if (!lockErr) {
          if (!lock) {
            await setMonUnlockDiag({ source: 'click',  status: 'skipped', errorCode: 'queued', wsId });
                        await renderUnlockPending({ alreadyQueued: true });
            return;
          }

          const q = await enqueueMonetizationRetry(
            'wsp_contact_unlock',
            { ws_id: wsId, brand_user_id: Number(u.id || 0), actor_tg_id: Number(ctx.from?.id || 0), lock_key: lockKey, lock_token: lock.token },
            dedupId
          );

          if (q.ok) {
            await setMonUnlockDiag({ source: 'click',  status: 'ok', errorCode: 'queued', wsId });
            await renderUnlockPending({ reason: 'Если кредитов не хватит — бот подскажет.' });
            return;
          }

          // enqueue failed → release lock and fall through to sync DB path
          try { await releaseLock(lockKey, lock.token); } catch {}
        }
      }

      let rUnlock = null;
      try {
        const opts = needFastTimeout ? { statementTimeoutMs: MONETIZATION_CB_TIMEOUT_MS } : null;
        rUnlock = needFastTimeout
          ? await withTimeout(
              db.unlockWorkspaceContactsWithCredits(u.id, wsId, CONTACT_UNLOCK_COST, CONTACT_UNLOCK_TTL_SEC, opts),
              MONETIZATION_CB_TIMEOUT_MS,
              'wsp.unlock'
            )
          : await db.unlockWorkspaceContactsWithCredits(u.id, wsId, CONTACT_UNLOCK_COST, CONTACT_UNLOCK_TTL_SEC);
      } catch (e) {
        if (asyncRetryEnabled && isTransientNeonError(e)) {
          const q = await enqueueMonetizationRetry('wsp_contact_unlock', { ws_id: wsId, brand_user_id: Number(u.id || 0), actor_tg_id: Number(ctx.from?.id || 0) }, dedupId);
          if (q.ok) {
            await setMonUnlockDiag({ source: 'click',  status: 'ok', errorCode: 'queued', wsId });
            await renderUnlockPending({ reason: 'База данных сейчас отвечает медленно — мы поставили задачу в очередь.' });
            return;
          }
        }

        if (redisDegraded && isTransientNeonError(e)) {
          await setMonUnlockDiag({ source: 'click',  status: 'ok', errorCode: 'degraded_timeout', wsId });
          await renderUnlockPending({ reason: 'Redis сейчас недоступен, база может отвечать медленно — попробуй обновить через 10–30 сек.' });
          return;
        }

        await setMonUnlockDiag({ source: 'click',  status: 'error', errorCode: 'db_error', wsId });

        try { await ctx.answerCallbackQuery({ text: 'Не получилось открыть контакты. Попробуй ещё раз.', show_alert: true }); } catch {}
        return;
      }
      if (!rUnlock?.ok) {
        if (rUnlock?.error === 'no_contacts' || rUnlock?.error === 'missing_ws') {
          const code = rUnlock?.error === 'missing_ws' ? 'missing_ws' : 'no_contacts';
          await setMonUnlockDiag({ source: 'click',  status: 'skipped', errorCode: code, wsId });

          try {
            const msg = (code === 'missing_ws')
              ? 'Витрина не найдена — списания не было.'
              : 'Контактов нет — списания не было.';
            await ctx.answerCallbackQuery({ text: msg, show_alert: true });
          } catch {}

          const kb = new InlineKeyboard()
.text(fromLead ? brandLeadProfileButtonLabel() : '🪟 Витрина', openCb)
            .text('💬 Диалоги', inboxCb)
            .row()
            .text(fromLead ? brandLeadDialogButtonLabel(leadId) : '⬅️ Назад', backCb)
            .text('📋 Меню', 'a:menu')
            .text('🏠 Домой', 'a:home');

          const text = (code === 'missing_ws')
            ? `⚠️ <b>Витрина не найдена</b>

Похоже, кнопка устарела или профиль удалён.
<b>Списания не было.</b>

Открой витрину заново через меню и повтори.`
            : `⚠️ <b>Контактов пока нет</b>

У креатора не заполнены контакты/ссылки для разлока.
<b>Списания не было.</b>

Попроси креатора добавить контакты (TG/Email/Website/IG/портфолио) и попробуй позже.`;

          await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
          return;
        }

        if (rUnlock?.error === 'busy') {
          await setMonUnlockDiag({ source: 'click',  status: 'skipped', errorCode: 'busy', wsId });
          await renderUnlockPending({ alreadyQueued: true });
          return;
        }
        if (rUnlock?.needPaywall) {
          await setMonUnlockDiag({ source: 'click',  status: 'ok', errorCode: 'need_paywall', wsId });
          try { await ctx.answerCallbackQuery({ text: 'Недостаточно кредитов. Докупи и повтори.', show_alert: true }); } catch {}
          await renderBrandPass(ctx, u.id, 0);
          return;
        }
        try { await ctx.answerCallbackQuery({ text: 'Не получилось открыть контакты. Попробуй ещё раз.', show_alert: true }); } catch {}
        return;
      }

      const left = rUnlock.left;
      const charged = !!rUnlock.charged;

      // STEP182: Redis-only breadcrumbs for 🔓 Разлок контактов
      try {
        await setMonUnlockDiag({ source: 'click',  status: 'ok', errorCode: charged ? 'charged' : 'ok', wsId });
      } catch {}


      // Best-effort: keep Redis cache in sync for UI (reduces Neon reads).
      if (charged && left !== null && left !== undefined) {
        try { await setBrandCreditsCache(u.id, left); } catch {}
      }

      // Cache unlock in Redis (best-effort). Even if not charged, this heals missing keys.
      try {
        const key = k(['wsp_contact', wsId, u.id]);
        await redis.set(key, 1, { ex: CONTACT_UNLOCK_TTL_SEC });
      } catch {}

      try {
        const msg = charged
          ? `✅ Контакты открыты на ${CONTACT_UNLOCK_TTL_DAYS} ${ruPlural(CONTACT_UNLOCK_TTL_DAYS,'день','дня','дней')}. Баланс: ${left}`
          : 'Уже открыто ✅';
        await ctx.answerCallbackQuery({ text: msg, show_alert: true });
      } catch {}
      await renderWsPublicProfile(ctx, wsId, { revealContacts: true, ...roOpts });

      // Brand-facing: send a compact contact pack right after paid unlock
      try {
        const ws2 = await db.getWorkspaceAny(wsId);
        if (ws2) {
          const followupDialogLabel = fromLead ? brandLeadDialogButtonLabel(leadId) : '⬅️ Назад';
          const followupProfileLabel = fromLead ? brandLeadProfileButtonLabel() : '🪟 Витрина';
          const followupWhatNext = fromLead ? brandLeadWhatNextText(leadId, 'contacts_open') : '';
          const ig2 = ws2.profile_ig ? String(ws2.profile_ig) : '';
          const ports2Raw = Array.isArray(ws2.profile_portfolio_urls) ? ws2.profile_portfolio_urls : [];
          const ports2 = ports2Raw.map((x) => String(x || '').trim()).filter(Boolean);
          const contactRaw2 = ws2.profile_contact ? String(ws2.profile_contact).trim() : '';
          const contactsObj2 = (ws2.profile_contacts && typeof ws2.profile_contacts === 'object') ? ws2.profile_contacts : null;
          const cTgRaw2 = contactsObj2?.tg ? String(contactsObj2.tg).trim() : '';
          const cTg2 = cTgRaw2.replace(/^@/, '');
          const cEmail2 = contactsObj2?.email ? String(contactsObj2.email).trim() : '';
          const cPhone2 = contactsObj2?.phone ? String(contactsObj2.phone).trim() : '';
          const cSiteRaw2 = contactsObj2?.site ? String(contactsObj2.site).trim() : '';
          const cSite2 = cSiteRaw2 && !/^https?:\/\//i.test(cSiteRaw2) ? ('https://' + cSiteRaw2.replace(/^\/+/, '')) : cSiteRaw2;
          const cOther2 = contactsObj2?.other ? String(contactsObj2.other).trim() : '';
          const hasStructured2 = !!(cTg2 || cEmail2 || cPhone2 || cSite2 || cOther2);

          const contactUrl2 = (() => {
            if (!contactRaw2) return null;
            const tg = wsTgUrlFromContact(contactRaw2);
            if (tg) return tg;
            if (/^https?:\/\//i.test(contactRaw2)) return contactRaw2;
            if (/^t\.me\//i.test(contactRaw2)) return 'https://' + contactRaw2;
            if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactRaw2)) return 'mailto:' + contactRaw2;
            return null;
          })();

          const lines = [];
          lines.push(`✅ <b>Контакт‑пакет</b> (доступ на <b>${CONTACT_UNLOCK_TTL_DAYS}</b> ${ruPlural(CONTACT_UNLOCK_TTL_DAYS,'день','дня','дней')})`);
          if (followupWhatNext) {
            lines.push('');
            lines.push(`💡 <b>Сейчас:</b> ${escapeHtml(followupWhatNext)}`);
          }
          lines.push('');
          if (ws2.channel_username) {
            const un = String(ws2.channel_username).replace(/^@/, '');
            lines.push(`• Telegram: <a href="https://t.me/${escapeHtml(un)}">@${escapeHtml(un)}</a>`);
          }

          if (hasStructured2) {
            if (cTg2) lines.push(`• TG username: <a href="https://t.me/${escapeHtml(cTg2)}">@${escapeHtml(cTg2)}</a>`);
            if (cEmail2) lines.push(`• Email: <a href="mailto:${escapeHtml(cEmail2)}">${escapeHtml(cEmail2)}</a>`);
            if (cPhone2) lines.push(`• Phone: <b>${escapeHtml(deLinkifyText(cPhone2))}</b>`);
            if (cSite2) lines.push(`• Website: <a href="${escapeHtml(cSite2)}">${escapeHtml(shortUrl(cSite2))}</a>`);
            if (cOther2) lines.push(`• Доп.: <b>${escapeHtml(deLinkifyText(cOther2))}</b>`);
          }

          if (contactRaw2) {
            if (contactUrl2) lines.push(`• Контакт: <a href="${escapeHtml(contactUrl2)}">${escapeHtml(contactRaw2)}</a>`);
            else lines.push(`• Контакт: <b>${escapeHtml(contactRaw2)}</b>`);
          }
          if (ig2) lines.push(`• Instagram: <a href="https://instagram.com/${escapeHtml(ig2)}">@${escapeHtml(ig2)}</a>`);
          if (ports2.length) {
            const u0 = String(ports2[0] || '').trim();
            if (u0) lines.push(`• Портфолио: <a href="${escapeHtml(u0)}">${escapeHtml(shortUrl(u0))}</a>${ports2.length > 1 ? ` <i>+ ещё ${ports2.length - 1}</i>` : ''}`);
          }

          const kb2 = new InlineKeyboard();
          if (ws2.channel_username) kb2.url('📣 Telegram канал', `https://t.me/${String(ws2.channel_username).replace(/^@/, '')}`);
          if (ig2) kb2.url('📸 Instagram', `https://instagram.com/${ig2}`);
          if (ports2.length) {
            const u0 = String(ports2[0] || '').trim();
            if (u0) kb2.url('🗂 Портфолио', u0);
          }
          if (fromLead) {
            kb2.row().text(followupDialogLabel, `a:blead_view|id:${leadId}|w:${wsId}`).text(followupProfileLabel, `a:wsp_open|ws:${wsId}|m:ro${ctxExtra}`);
            kb2.row().text('💳 Купить ещё', `a:brand_pass|ws:0|ret:wsp|rws:${wsId}`);
          } else {
            kb2.row().text(followupProfileLabel, `a:wsp_open|ws:${wsId}|m:ro${ctxExtra}`).text('💳 Купить ещё', `a:brand_pass|ws:0|ret:wsp|rws:${wsId}`);
          }

          await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb2, disable_web_page_preview: true });
        }
      } catch {}

      return;
    }




// ONBOARDING V2 (feature-flag)


    throw new Error('directory_domain.unreachable_public_workspace_action:' + String(p?.a || 'missing'));
  })();
  return true;
}
