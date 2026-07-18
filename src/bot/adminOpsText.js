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
  const whereTail = where ? ` · источник <code>${escapeHtml(where)}</code>` : '';

  if (cfg.kind === 'broadcast_db_overload') {
    return text + `⚠️ <b>Рассылка: перегрузка БД</b>\n• Сегодня: <b>${cnt}</b> · последнее событие: ${lastTail}${whereTail}\n• Диагностика: <code>broadcast_db_overload</code>\n\n`;
  }

  if (cfg.kind === 'broadcast_tick_deferred_redis') {
    return text + `⚠️ <b>Рассылка отложена: Redis недоступен</b>\n• Сегодня: <b>${cnt}</b> · последнее событие: ${lastTail}${whereTail}\n• Диагностика: <code>broadcast_tick_deferred_redis</code>\n\n`;
  }

  if (cfg.kind === 'qstash_reschedule_failed') {
    const payloadTail = payload ? ` · payload <code>${escapeHtml(payload)}</code>` : '';
    return text + `⚠️ <b>QStash: повтор не поставлен в очередь</b>\n• Сегодня: <b>${cnt}</b> · последнее событие: ${lastTail}${whereTail}${payloadTail}\n• Диагностика: <code>qstash_reschedule_failed</code>\n\n`;
  }

  if (cfg.kind === 'official_publish_stuck') {
    const offerTail = offerId ? ` · оффер <b>#${escapeHtml(offerId)}</b>` : '';
    const ageTail = age > 0 ? ` · возраст ~<b>${escapeHtml(String(age))}</b> сек.` : '';
    const viaTail = via ? ` · путь <code>${escapeHtml(via)}</code>` : '';
    return text + `⚠️ <b>Официальная публикация зависла</b>\n• Сегодня: <b>${cnt}</b> · последнее событие: ${lastTail}${offerTail}${ageTail}${viaTail}\n• Диагностика: <code>official_publish_stuck</code>\n\n`;
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
    text += '⚠️ <b>Redis не настроен</b>\nЧасть переключателей, кешей и ограничителей недоступна.\n\n';
  } else if (redisState?.probeFailed) {
    text += '⚠️ <b>Redis недоступен</b>\nПроверка соединения не завершилась. Диагностика: <code>redis_probe_failed</code>.\n\n';
  } else if (redisState) {
    if (redisState.ok) {
      const ms = Math.max(0, Number(redisState.latencyMs) || 0);
      text += `✅ <b>Redis работает</b> · ${ms} мс\n\n`;
    } else {
      const err = redisState.error ? String(redisState.error) : '';
      const tail = err ? `\n<code>${escapeHtml(err.slice(0, 120))}</code>` : '';
      text += '⚠️ <b>Redis недоступен</b>\nПереключатели, кеши и ограничители могут работать в резервном режиме.' + tail + '\n\n';
    }
  }

  const hkey = String(paymentsState?.hmacKey || '').trim();
  const minLen = 32;
  if (paymentsState) {
    if (!hkey) {
      text += '🚨 <b>Платежи: HMAC-ключ не задан</b>\nПодпись <code>invoice_payload</code> не проверяется. Это высокий риск.\n\n';
    } else if (hkey.length < minLen) {
      text += `⚠️ <b>Платежи: HMAC-ключ слишком короткий</b>\nСейчас: ${hkey.length}; минимум по политике: ${minLen} символа.\n\n`;
    }

    const payFb = paymentsState.fallbackState || {};
    const envOn = !!payFb?.envEnabled;
    const rtOn = !!payFb?.runtimeEnabled;
    const rt = payFb?.runtime || {};
    const effective = !!payFb?.effective;

    if (effective) {
      const src = rtOn ? (envOn ? 'env+runtime' : 'runtime') : 'env';
      text += `🚨 <b>Резервное применение платежей включено</b>\n• Источник: <code>${escapeHtml(src)}</code>\n• Используй только для инцидента или хвоста платежей. После восстановления выключи.\n`;
      if (rtOn) {
        const by = rt.byTgId ? `tg:${escapeHtml(String(rt.byTgId))}` : (rt.byUser ? escapeHtml(String(rt.byUser)) : '—');
        const reason = rt.reason ? escapeHtml(String(rt.reason).slice(0, 120)) : '—';
        text += `• Включено: <b>${escapeHtml(fmtTs(rt.at))}</b> · до <b>${escapeHtml(rt.expAt ? fmtTs(rt.expAt) : '—')}</b> · кем <b>${by}</b>\n`;
        text += `• Причина: <i>${reason}</i>\n`;
      }
      text += '• Выключить: ⚙️ <b>Система</b> → <b>Резерв платежей</b> → runtime OFF\n\n';
    }
  }

  for (const item of Array.isArray(opsState?.items) ? opsState.items : []) text = appendOpsReasonBlock(text, item);

  if (pendingSnapshot?.visible) {
    text += '📦 <b>Снимок очереди рассылки</b>\n';
    text += '<i>Это снимок Redis, а не итоговое состояние БД.</i>\n';
    if (pendingSnapshot.ok === false) {
      text += '• Недоступно: Redis не отвечает.\n\n';
    } else if (!pendingSnapshot.snap) {
      text += '• Очередь на снимке пуста.\n\n';
    } else {
      const ts = pendingSnapshot.snap.ts ? `<code>${escapeHtml(String(pendingSnapshot.snap.ts).slice(0, 19))}</code>` : '—';
      const bid = pendingSnapshot.snap.broadcast_id ? `<b>#${pendingSnapshot.snap.broadcast_id}</b>` : '—';
      const pc = Number(pendingSnapshot.snap.pending_count) || 0;
      text += `• Рассылка: ${bid} · ожидает: <b>${pc}</b> · время: ${ts}\n\n`;
    }
  }

  text += '• 👥 Пользователи — каталог, фильтры и карточки\n';
  text += '• 💰 Платежи — ручная проверка и применение\n';
  text += '• 📣 Рассылка — запуск и контроль доставки\n';
  text += '• 📜 Аудит — поиск и экспорт событий\n';
  text += '• 📈 Метрики — DAU, MAU и конверсии\n';

  return text;
}
