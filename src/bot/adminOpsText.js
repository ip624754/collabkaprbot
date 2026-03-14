import { escapeHtml, fmtTs } from './helpers.js';

function appendOpsReasonBlock(text, cfg = {}) {
  const cnt = Number(cfg.count) || 0;
  const last = cfg.lastAt ? String(cfg.lastAt) : '';
  if (!(cnt > 0 || last)) return text;

  const where = cfg.lastWhere ? String(cfg.lastWhere) : '';
  const payload = cfg.lastPayload ? String(cfg.lastPayload) : '';
  const offerId = cfg.lastOfferId ? String(cfg.lastOfferId) : '';
  const age = Number(cfg.lastAgeSec) || 0;
  const via = cfg.lastVia ? String(cfg.lastVia) : '';

  const lastTail = last ? `<code>${escapeHtml(last)}</code>` : '—';
  const whereTail = where ? `; <code>${escapeHtml(where)}</code>` : '';

  if (cfg.kind === 'broadcast_db_overload') {
    return text + `⚠️ <b>Broadcast: DB overload</b> — сегодня: <b>${cnt}</b>; last: ${lastTail}${whereTail}\n\n`;
  }

  if (cfg.kind === 'broadcast_tick_deferred_redis') {
    return text + `⚠️ <b>Broadcast: tick deferred (Redis)</b> — сегодня: <b>${cnt}</b>; last: ${lastTail}${whereTail}\n\n`;
  }

  if (cfg.kind === 'qstash_reschedule_failed') {
    const payloadTail = payload ? `; last: <code>${escapeHtml(payload)}</code>` : '';
    return text + `⚠️ <b>QStash: reschedule failed</b> — сегодня: <b>${cnt}</b>; at: ${lastTail}${whereTail}${payloadTail}\n\n`;
  }

  if (cfg.kind === 'official_publish_stuck') {
    const offerTail = offerId ? `; offer: <b>#${escapeHtml(offerId)}</b>` : '';
    const ageTail = age > 0 ? `; age: ~<b>${escapeHtml(String(age))}</b>s` : '';
    const viaTail = via ? `; via: <code>${escapeHtml(via)}</code>` : '';
    return text + `⚠️ <b>OFFICIAL: publish stuck</b> — сегодня: <b>${cnt}</b>; at: ${lastTail}${offerTail}${ageTail}${viaTail}\n\n`;
  }

  return text;
}

export function buildAdminOpsText({
  banner = '',
  redisState = null,
  paymentsState = null,
  opsState = null,
  pendingSnapshot = null,
} = {}) {
  let text = '🧰 Админка → Операции\n\n';

  try {
    const b = String(banner || '').trim();
    if (b) text = `${escapeHtml(b)}\n\n${text}`;
  } catch {
    // ignore
  }

  if (redisState?.configured === false) {
    text += '⚠️ <b>Redis не настроен</b> — часть системных тумблеров/кешей отключена.\n\n';
  } else if (redisState?.probeFailed) {
    text += '⚠️ <b>Redis degraded</b> — не удалось выполнить probe.\n\n';
  } else if (redisState) {
    if (redisState.ok) {
      const ms = Math.max(0, Number(redisState.latencyMs) || 0);
      text += `✅ <b>Redis OK</b> (${ms}ms)\n\n`;
    } else {
      const err = redisState.error ? String(redisState.error) : '';
      const tail = err ? `\n<code>${escapeHtml(err.slice(0, 120))}</code>` : '';
      text += '⚠️ <b>Redis degraded</b> — возможны сбои в тумблерах/кешах/троттлах.' + tail + '\n\n';
    }
  }

  const hkey = String(paymentsState?.hmacKey || '').trim();
  const minLen = 32;
  if (paymentsState) {
    if (!hkey) {
      text += '🚨 <b>Payments: HMAC key отсутствует</b> — подпись invoice_payload не проверяется (высокий риск).\n\n';
    } else if (hkey.length < minLen) {
      text += `⚠️ <b>Payments: HMAC key слишком короткий</b> (${hkey.length} < ${minLen}) — рекомендуется ключ ≥ ${minLen} символов.\n\n`;
    }

    const payFb = paymentsState.fallbackState || {};
    const envOn = !!payFb?.envEnabled;
    const rtOn = !!payFb?.runtimeEnabled;
    const rt = payFb?.runtime || {};
    const effective = !!payFb?.effective;

    if (effective) {
      const src = rtOn ? (envOn ? 'env+runtime' : 'runtime') : 'env';
      text += `🚨 <b>Payments: fallback apply ENABLED</b> (<code>${escapeHtml(src)}</code>) — включай только на инцидент/хвосты, затем выключай.\n`;

      if (rtOn) {
        const by = rt.byTgId ? `tg:${escapeHtml(String(rt.byTgId))}` : (rt.byUser ? escapeHtml(String(rt.byUser)) : '—');
        const reason = rt.reason ? escapeHtml(String(rt.reason).slice(0, 120)) : '—';
        const at = fmtTs(rt.at);
        const until = rt.expAt ? fmtTs(rt.expAt) : '—';
        const activeTail = Number.isFinite(rt.hoursActive) ? `; active ~<b>${escapeHtml(String(rt.hoursActive))}</b>h` : '';
        text += `• runtime: since <b>${escapeHtml(at)}</b>; until <b>${escapeHtml(until)}</b>${activeTail}; by <b>${by}</b>; reason: <i>${reason}</i>\n`;
      }

      text += '• ops reminder: каждые ~2h, пока runtime ON\n';

      text += '• выключить: ⚙️ <b>Админка → Система</b> → <b>Payments fallback apply</b> → runtime OFF\n\n';
    }
  }

  for (const item of Array.isArray(opsState?.items) ? opsState.items : []) {
    text = appendOpsReasonBlock(text, item);
  }

  if (pendingSnapshot?.visible) {
    text += '📦 <b>Broadcast pending snapshot</b> <i>(Redis snapshot only; не DB truth)</i>\n';
    if (pendingSnapshot.ok === false) {
      text += '• ⚠️ недоступно (Redis degraded)\n\n';
    } else if (!pendingSnapshot.snap) {
      text += '• пусто\n\n';
    } else {
      const ts = pendingSnapshot.snap.ts
        ? `<code>${escapeHtml(String(pendingSnapshot.snap.ts).slice(0, 19))}</code>`
        : '—';
      const bid = pendingSnapshot.snap.broadcast_id ? `<b>#${pendingSnapshot.snap.broadcast_id}</b>` : '—';
      const pc = Number(pendingSnapshot.snap.pending_count) || 0;
      text += `• broadcast: ${bid}; pending: <b>${pc}</b>; ts: ${ts}\n\n`;
    }
  }

  text += '• 👥 Пользователи — каталог, фильтры, карточка\n';
  text += '• 💰 Платежи — manual/apply\n';
  text += '• 📣 Рассылка — broadcast по аудитории\n';
  text += '• 📜 Аудит — поиск/экспорт событий\n';
  text += '• 📈 Метрики — DAU/MAU, конверсии\n';

  return text;
}
