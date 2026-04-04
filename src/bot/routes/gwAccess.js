export async function handleGwAccessRoute(ctx, p, u, deps = {}) {
  const action = String(p?.a || '');
  if (
    action !== 'a:gw_access' &&
    action !== 'a:gw_access_recheck' &&
    action !== 'a:gw_access_checkme' &&
    action !== 'a:gw_access_user_prompt'
  ) {
    return false;
  }

  const gwId = Number(p?.i || 0);
  const ownerUserId = Number(u?.id || 0);
  const { renderGwAccess, redis, db, safeEditOrReply, navKb, setExpectText } = deps;

  if (!gwId || !ownerUserId) {
    throw new Error('gw_access_route.invalid_context');
  }

  if (typeof renderGwAccess !== 'function') {
    throw new Error('gw_access_route.missing_renderGwAccess');
  }
  if (!redis || !db) {
    throw new Error('gw_access_route.missing_deps');
  }

  if (action === 'a:gw_access') {
    await renderGwAccess({ ctx, gwId, ownerUserId, redis, db, forceRecheck: false });
    return true;
  }

  if (action === 'a:gw_access_recheck') {
    await renderGwAccess({ ctx, gwId, ownerUserId, redis, db, forceRecheck: true });
    return true;
  }

  if (action === 'a:gw_access_checkme') {
    await renderGwAccess({
      ctx,
      gwId,
      ownerUserId,
      redis,
      db,
      forceRecheck: true,
      checkUserId: Number(ctx?.from?.id || 0),
    });
    return true;
  }

  if (action === 'a:gw_access_user_prompt') {
    if (typeof safeEditOrReply !== 'function' || typeof navKb !== 'function' || typeof setExpectText !== 'function') {
      throw new Error('gw_access_route.missing_prompt_deps');
    }

    await safeEditOrReply(
      ctx,
      `🧩 <b>Проверка участника</b>\n\nПришли <b>user_id</b> цифрами.\n\nПример: <code>611377976</code>`,
      { parse_mode: 'HTML', reply_markup: navKb(`a:gw_access|i:${gwId}`) }
    );
    await setExpectText(ctx.from.id, { type: 'gw_access_userid', gwId });
    return true;
  }

  return false;
}
