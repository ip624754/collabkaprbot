import { CFG } from './config.js';

const TG_HTTP_TIMEOUT_MS = Math.max(1000, Number(process?.env?.TG_HTTP_TIMEOUT_MS || 5500) || 5500);

export function tgTimeoutSignal(ms = TG_HTTP_TIMEOUT_MS) {
  const t = Math.max(1, Number(ms) || 1);
  try {
    return AbortSignal.timeout(t);
  } catch {
    const ac = new AbortController();
    setTimeout(() => { try { ac.abort(); } catch {} }, t);
    return ac.signal;
  }
}

export async function tgSendMessage(chatId, text, opts = {}) {
  const token = CFG.BOT_TOKEN;
  if (!token) throw new Error('BOT_TOKEN_missing');
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = {
    chat_id: chatId,
    text: String(text || ''),
    parse_mode: opts.parse_mode || 'HTML',
    disable_web_page_preview: opts.disable_web_page_preview ?? true,
  };
  if (opts.reply_markup) body.reply_markup = opts.reply_markup;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: tgTimeoutSignal(opts.timeout_ms),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok || !data?.ok) {
    const e = new Error(String(data?.description || `tg_http_${r.status}`));
    e.details = data;
    throw e;
  }
  return data.result;
}
