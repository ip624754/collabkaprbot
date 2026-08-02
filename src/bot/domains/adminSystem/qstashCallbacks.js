import { isAdminQStashAction } from './policy.js';

function bindDependencies(deps, names) {
  for (const name of names) {
    if (deps?.[name] === null || deps?.[name] === undefined) {
      throw new Error('admin_system_domain.missing_dependency:' + name);
    }
  }
  return deps;
}

const REQUIRED_DEPENDENCIES = Object.freeze([
  'InlineKeyboard',
  'escapeHtml',
  'getQStashDeliveryUrl',
  'getQStashLibHealth',
  'isSuperAdminTg',
  'k',
  'qstashPublishJSON',
  'randomToken',
  'redis',
  'renderAdminQStashStatus',
  'safeEditOrReply',
]);

export async function handleAdminQStashCallback(ctx, p, u, deps = {}) {
  if (!isAdminQStashAction(p?.a)) return false;
  const bound = bindDependencies(deps, REQUIRED_DEPENDENCIES);
  const {
    InlineKeyboard,
    escapeHtml,
    getQStashDeliveryUrl,
    getQStashLibHealth,
    isSuperAdminTg,
    k,
    qstashPublishJSON,
    randomToken,
    redis,
    renderAdminQStashStatus,
    safeEditOrReply,
  } = bound;

  await (async () => {
    if (p.a === 'a:admin_qstash_status') {
      const isAdmin = isSuperAdminTg(ctx.from.id);
      if (!isAdmin) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery();
      await renderAdminQStashStatus(ctx);
      return;
    }

    if (p.a === 'a:admin_qstash_ping') {
      const isAdmin = isSuperAdminTg(ctx.from.id);
      if (!isAdmin) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery({ text: 'Пинг отправляю…' });

      const lib = getQStashLibHealth();
      if (!lib.available) {
        const em = String(lib?.error?.message || 'missing');
        await safeEditOrReply(
          ctx,
          `⛔ QStash недоступен: пакет <code>@upstash/qstash</code> не установлен.

Причина: <code>${escapeHtml(em.slice(0, 220))}</code>

Решение: обнови <code>package.json</code> (dependencies) и сделай redeploy.`,
          { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('⬅️ Назад', 'a:admin_qstash_status') }
        );
        return;
      }

      if (!(process.env.QSTASH_TOKEN || '')) {
        await safeEditOrReply(
          ctx,
          '⛔ QSTASH_TOKEN не задан в Vercel. Ping недоступен.',
          { reply_markup: new InlineKeyboard().text('⬅️ Назад', 'a:admin_qstash_status') }
        );
        return;
      }

      const url = getQStashDeliveryUrl('/api/qstash/ping');
      if (!url) {
        await safeEditOrReply(
          ctx,
          '⛔ PUBLIC_BASE_URL не задан. Ping недоступен.',
          { reply_markup: new InlineKeyboard().text('⬅️ Назад', 'a:admin_qstash_status') }
        );
        return;
      }

      const nonce = randomToken();
      const nowIso = new Date().toISOString();

      // Best-effort: remember what we enqueued (Redis-only).
      try {
        await redis.set(k(['qstash', 'ping', 'last_enqueued_at']), nowIso, { ex: 14 * 24 * 60 * 60 });
        await redis.set(k(['qstash', 'ping', 'last_enqueued_nonce']), String(nonce), { ex: 14 * 24 * 60 * 60 });
      } catch {}

      try {
        await qstashPublishJSON({
          url,
          body: {
            kind: 'signed_ping',
            ts: nowIso,
            nonce,
            by_tg_id: Number(ctx.from.id || 0) || 0,
          },
          deduplicationId: `qping:${nonce}`,
          retries: 0,
          timeout: '10s',
        });
      } catch (e) {
        const msg = String(e?.message || e || 'error');
        await safeEditOrReply(
          ctx,
          `⛔ Не удалось отправить ping через QStash.

Причина: <code>${escapeHtml(msg)}</code>

Подсказка: это не всегда ENV/signing keys. Часто причина — invalid DeduplicationId format, QStash/network сбой или неверный PUBLIC_BASE_URL.`,
          { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('⬅️ Назад', 'a:admin_qstash_status') }
        );
        return;
      }

      await renderAdminQStashStatus(ctx);
      return;
    }
  })();
  return true;
}
