import { CFG } from '../config.js';
import { escapeHtml } from './common.js';

const TELEGRAM_API = `https://api.telegram.org/bot${CFG.BOT_TOKEN}`;

export function getAdminApproverIds() {
  const explicit = Array.isArray(CFG.ADMIN_WEB_APPROVER_TG_IDS) ? CFG.ADMIN_WEB_APPROVER_TG_IDS : [];
  if (explicit.length) return explicit.map((x) => Number(x)).filter(Boolean);
  const fallback = Array.isArray(CFG.SUPER_ADMIN_TG_IDS) ? CFG.SUPER_ADMIN_TG_IDS : [];
  return fallback.map((x) => Number(x)).filter(Boolean);
}

export async function sendTelegramMessage(chatId, payload) {
  const r = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: Number(chatId),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...payload,
    }),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: !!j?.ok, data: j };
}

export async function notifyLoginChallenge({
  challengeId,
  code,
  fallbackEnabled = false,
  fallbackActorTgId = 0,
  expiresAt,
  ua,
  ip,
  buildDecisionCallback,
}) {
  const ids = getAdminApproverIds();
  if (!CFG.BOT_TOKEN || !ids.length) return { ok: false, reason: 'approvers_not_configured' };

  const baseLines = [
    '<b>Запрос входа в веб-админку</b>',
    '',
    `Запрос: <code>${escapeHtml(String(challengeId).slice(0, 8))}</code>`,
    `Истекает: <code>${escapeHtml(expiresAt)}</code>`,
  ];
  if (ip) baseLines.push(`IP: <code>${escapeHtml(ip)}</code>`);
  if (ua) baseLines.push(`UA: <code>${escapeHtml(ua)}</code>`);
  baseLines.push('', '<b>Подтверди или отклони вход кнопкой ниже.</b>');

  const approveCallback = typeof buildDecisionCallback === 'function'
    ? buildDecisionCallback(challengeId, 'approve')
    : '';
  const denyCallback = typeof buildDecisionCallback === 'function'
    ? buildDecisionCallback(challengeId, 'deny')
    : '';
  if (!approveCallback || !denyCallback) return { ok: false, reason: 'decision_callback_unavailable' };

  const results = [];
  for (const id of ids) {
    const lines = [...baseLines];
    if (fallbackEnabled && code && Number(id) === Number(fallbackActorTgId || 0)) {
      lines.push('', `Аварийный одноразовый код: <code>${escapeHtml(code)}</code>`);
      lines.push('<i>Код работает только в исходном браузере и блокируется после лимита ошибок.</i>');
    }
    const payload = {
      text: lines.join('\n'),
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Одобрить', callback_data: approveCallback },
          { text: '❌ Отклонить', callback_data: denyCallback },
        ]],
      },
    };
    try {
      // eslint-disable-next-line no-await-in-loop
      results.push(await sendTelegramMessage(id, payload));
    } catch (e) {
      results.push({ ok: false, error: String(e?.message || e) });
    }
  }
  return { ok: results.some((x) => x.ok), results };
}
