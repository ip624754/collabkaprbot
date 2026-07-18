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

export async function notifyLoginChallenge({ challengeId, code, expiresAt, ua, ip, buildDecisionUrl }) {
  const ids = getAdminApproverIds();
  if (!CFG.BOT_TOKEN || !ids.length) return { ok: false, reason: 'approvers_not_configured' };

  const lines = [
    '<b>Запрос входа в веб-админку</b>',
    '',
    `Запрос: <code>${escapeHtml(String(challengeId).slice(0, 8))}</code>`,
    `Истекает: <code>${escapeHtml(expiresAt)}</code>`,
  ];
  if (ip) lines.push(`IP: <code>${escapeHtml(ip)}</code>`);
  if (ua) lines.push(`UA: <code>${escapeHtml(ua)}</code>`);
  lines.push('', `Резервный код: <code>${escapeHtml(code)}</code>`);
  if (typeof buildDecisionUrl !== 'function') {
    lines.push('', '<i>Ссылки подтверждения недоступны: PUBLIC_BASE_URL не настроен. Используй резервный код на экране входа.</i>');
  }

  const results = [];
  for (const id of ids) {
    const approveUrl = typeof buildDecisionUrl === 'function' ? buildDecisionUrl('approve', id) : '';
    const denyUrl = typeof buildDecisionUrl === 'function' ? buildDecisionUrl('deny', id) : '';
    const payload = { text: lines.join('\n') };
    if (approveUrl && denyUrl) {
      payload.reply_markup = {
        inline_keyboard: [[
          { text: '✅ Одобрить', url: approveUrl },
          { text: '❌ Отклонить', url: denyUrl },
        ]],
      };
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      results.push(await sendTelegramMessage(id, payload));
    } catch (e) {
      results.push({ ok: false, error: String(e?.message || e) });
    }
  }
  return { ok: results.some((x) => x.ok), results };
}
