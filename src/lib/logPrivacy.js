import crypto from 'crypto';

const PRIVACY_KEY = String(
  process.env.LOG_PII_HASH_KEY
  || process.env.ADMIN_WEB_SESSION_SECRET
  || process.env.WEBHOOK_SECRET_TOKEN
  || ''
).trim();

function safeString(value, max = 180) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function opaqueLogRef(value, namespace = 'id') {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (!PRIVACY_KEY) return 'present';
  return crypto
    .createHmac('sha256', PRIVACY_KEY)
    .update(`${String(namespace || 'id')}:${raw}`)
    .digest('hex')
    .slice(0, 12);
}

export function redactLogText(value, max = 180) {
  let text = safeString(value, max * 2);
  text = text
    .replace(/\b\d{6,12}:[A-Za-z0-9_-]{20,}\b/g, '[BOT_TOKEN]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL]')
    .replace(/(^|\s)@[A-Za-z0-9_]{4,32}\b/g, '$1[USERNAME]')
    .replace(/\b\d{6,20}\b/g, '[ID]')
    .replace(/https?:\/\/[^\s?#]+\?[^\s]+/gi, (url) => {
      try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}?[REDACTED]`;
      } catch {
        return '[URL]';
      }
    });
  return safeString(text, max);
}

export function safeLogError(error) {
  const inner = error?.error || error || null;
  return {
    name: safeString(inner?.name || 'Error', 64),
    code: inner?.code ? safeString(inner.code, 48) : null,
    message: redactLogText(inner?.message || error?.message || error || '', 180),
  };
}

export function telegramUpdateLogSummary(update) {
  const actor = update?.message?.from
    || update?.callback_query?.from
    || update?.inline_query?.from
    || update?.chat_join_request?.from
    || null;
  const chat = update?.message?.chat
    || update?.callback_query?.message?.chat
    || update?.chat_join_request?.chat
    || null;

  let kind = 'other';
  let action = null;
  if (update?.callback_query) {
    kind = 'callback_query';
    action = String(update.callback_query.data || '').split('|')[0] || 'callback';
  } else if (update?.message?.text) {
    kind = 'message_text';
    const text = String(update.message.text || '');
    action = text.startsWith('/') ? text.split(/\s+/)[0] : 'message';
  } else if (update?.message) {
    kind = 'message';
    action = 'message';
  } else if (update?.inline_query) {
    kind = 'inline_query';
    action = 'inline_query';
  } else if (update?.chat_join_request) {
    kind = 'chat_join_request';
    action = 'chat_join_request';
  }

  return {
    update_id: update?.update_id ?? null,
    kind,
    action,
    actor_ref: opaqueLogRef(actor?.id, 'telegram_actor'),
    chat_ref: opaqueLogRef(chat?.id, 'telegram_chat'),
  };
}

export function contextLogSummary(ctx) {
  return telegramUpdateLogSummary(ctx?.update || {});
}

const IDENTIFIER_KEY = /^(?:tg_?id|tgid|chat_?id|chatid|from_?id|fromid|user_?id|userid|uid|actor_?tg_?id|actortgid)$/i;
const PRIVATE_TEXT_KEY = /^(?:username|text|caption|cb_data|data|payload|invoice_payload|email|phone)$/i;

export function sanitizeLogMeta(value, depth = 0) {
  if (depth > 5) return '[TRUNCATED]';
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeLogMeta(item, depth + 1));
  if (typeof value !== 'object') return typeof value === 'string' ? redactLogText(value, 180) : value;

  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (IDENTIFIER_KEY.test(key)) {
      out[`${key.replace(/_?id$/i, '')}_ref`] = opaqueLogRef(item, key.toLowerCase());
      continue;
    }
    if (PRIVATE_TEXT_KEY.test(key)) {
      out[key] = item ? '[REDACTED]' : item;
      continue;
    }
    if (key === 'err' || key === 'error') {
      out[key] = typeof item === 'object' ? safeLogError(item) : redactLogText(item, 180);
      continue;
    }
    out[key] = sanitizeLogMeta(item, depth + 1);
  }
  return out;
}
