import { CFG } from '../../../src/lib/config.js';
import { redis, k } from '../../../src/lib/redis.js';
import { buildAuthorizeUrl } from '../../../src/lib/igOAuth.js';

function noStore(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
}

function html(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.35;padding:24px;max-width:720px;margin:0 auto;">${body}</body></html>`;
}

function randomState() {
  try { return globalThis.crypto?.randomUUID?.() || String(Date.now()) + Math.random().toString(16).slice(2); } catch { return String(Date.now()) + Math.random().toString(16).slice(2); }
}

export default async function handler(req, res) {
  try {
    noStore(res);

    if (!CFG.IG_OAUTH_ENABLED) {
      res.status(503).send(html('IG OAuth disabled', '<h2>Instagram OAuth отключён</h2><p>Администратор ещё не включил IG_OAUTH_ENABLED.</p>'));
      return;
    }

    const t = String(req.query?.t || '').trim();
    if (!t) {
      res.status(400).send(html('Bad request', '<h2>Ошибка</h2><p>Не передан параметр <code>t</code>.</p>'));
      return;
    }

    const tKey = k(['ig_oauth_t', t]);
    const payload = await redis.get(tKey);
    if (!payload || !payload.wsId) {
      res.status(410).send(html('Expired', '<h2>Ссылка устарела</h2><p>Вернись в бот и нажми «Подключить Instagram» ещё раз.</p>'));
      return;
    }

    if (!CFG.PUBLIC_BASE_URL) {
      res.status(500).send(html('Misconfigured', '<h2>Ошибка конфигурации</h2><p>Не задан <code>PUBLIC_BASE_URL</code>.</p>'));
      return;
    }

    const redirectUri = String(CFG.PUBLIC_BASE_URL).replace(/\/$/, '') + '/api/ig/oauth/callback';

    const state = randomState();
    const sKey = k(['ig_oauth_state', state]);
    await redis.set(sKey, payload, { ex: 10 * 60 }); // 10 min

    const url = buildAuthorizeUrl({ state, redirectUri });

    res.status(302).setHeader('Location', url).end();
  } catch (e) {
    try { console.error('[IG-OAUTH] start error', e); } catch {}
    res.status(500).setHeader('Cache-Control', 'no-store').end('internal_error');
  }
}
