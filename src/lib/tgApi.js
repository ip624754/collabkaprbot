import { CFG } from './config.js';

function envInt(name, def, opts = {}) {
  const raw = process?.env?.[name];
  if (raw === undefined || raw === null || raw === '') return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  let v = Math.trunc(n);
  if (opts.min !== undefined && v < opts.min) v = opts.min;
  if (opts.max !== undefined && v > opts.max) v = opts.max;
  return v;
}

export const TG_HTTP_TIMEOUT_MS = envInt('TG_HTTP_TIMEOUT_MS', 5500, { min: 1000, max: 30000 });
export const TG_HTTP_MEDIA_TIMEOUT_MS = envInt('TG_HTTP_MEDIA_TIMEOUT_MS', 15000, { min: 1000, max: 60000 });

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

export async function tgSendMessageRaw(chatId, text, opts = {}) {
  const token = String(CFG.BOT_TOKEN || '').trim();
  if (!token) throw new Error('bot_token_missing');
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: String(text || ''),
    ...opts,
  };
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: tgTimeoutSignal(opts.timeout_ms),
  });
  const j = await r.json().catch(() => null);
  return { ok: r.ok && !!j?.ok, status: r.status, body: j };
}
