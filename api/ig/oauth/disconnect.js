import { CFG } from '../../../src/lib/config.js';
import { redis, k } from '../../../src/lib/redis.js';
import * as db from '../../../src/db/queries.js';
import { tgSendMessage } from '../../../src/lib/tgApi.js';

function firstOpsTarget() {
  if (CFG.SUPPORT_CHAT_ID) return CFG.SUPPORT_CHAT_ID;
  const admins = Array.isArray(CFG.SUPER_ADMIN_TG_IDS) ? CFG.SUPER_ADMIN_TG_IDS : [];
  return admins.length ? admins[0] : null;
}

async function opsAlertOnce(dedupId, text) {
  try {
    const t = firstOpsTarget();
    if (!t) return;
    const dk = k(['ops', 'ig', String(dedupId || 'alert')]);
    const ok = await redis.set(dk, '1', { nx: true, ex: 6 * 60 * 60 });
    if (!ok) return;
    await tgSendMessage(t, text, { parse_mode: 'HTML', disable_web_page_preview: true });
  } catch {
    // ignore
  }
}

function getParam(req, name) {
  try {
    const u = new URL(req.url, 'http://localhost');
    const v = u.searchParams.get(name);
    return v ? String(v) : '';
  } catch {
    return '';
  }
}

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');

    // Kill-switch: if IG OAuth UI is hidden, the OAuth routes must be closed too.
    if (!CFG.IG_ROUTES_ENABLED || !CFG.IG_OAUTH_UI_ENABLED) {
      res.status(404).end('not_found');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).end('Method Not Allowed');
      return;
    }

    if (!CFG.IG_OAUTH_ENABLED) {
      res.status(503).json({ ok: false, error: 'disabled' });
      return;
    }

    if (!CFG.IG_TOKEN_ENC_KEY_VALID) {
      await opsAlertOnce(
        'enc_key_invalid',
        `⚠️ <b>IG OAuth misconfigured</b>\n\n` +
          `IG_TOKEN_ENC_KEY invalid (${String(CFG.IG_TOKEN_ENC_KEY_KIND || 'invalid')}).\n` +
          `Expected: hex64 (32 bytes) or base64/base64url (>=32 bytes).`
      );
      res.status(503).json({ ok: false, error: 'misconfigured', reason: 'IG_TOKEN_ENC_KEY_invalid' });
      return;
    }

    const t = getParam(req, 't').trim();
    if (!t) { res.status(400).json({ ok: false, error: 'missing_t' }); return; }

    const payload = await redis.get(k(['ig_oauth_t', t]));
    if (!payload?.wsId) { res.status(410).json({ ok: false, error: 'expired' }); return; }

    await db.deleteIgOAuthAccount(payload.wsId);
    res.status(200).json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
}
