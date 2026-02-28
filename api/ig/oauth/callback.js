import { CFG } from '../../../src/lib/config.js';
import { consumeOnce, k } from '../../../src/lib/redis.js';
import { exchangeCodeForShortLivedToken, exchangeForLongLivedToken, listPages, getPageIgBusinessAccount, getIgUser, getMe, listPermissions, listBusinesses, listBusinessPages } from '../../../src/lib/igOAuth.js';
import { encryptText } from '../../../src/lib/cryptoBox.js';
import { tgSendMessage } from '../../../src/lib/tgApi.js';
import * as db from '../../../src/db/queries.js';

function noStore(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function html(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.35;padding:24px;max-width:720px;margin:0 auto;">${body}</body></html>`;
}

function parseJsonb(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(String(raw)); } catch { return {}; }
}

export default async function handler(req, res) {
  try {
    noStore(res);

    // Kill-switch: if IG OAuth UI is hidden, the OAuth routes must be closed too.
    if (!CFG.IG_OAUTH_UI_ENABLED) {
      res.status(404).send(html('Not found', '<h2>Not found</h2>'));
      return;
    }

    if (!CFG.IG_OAUTH_ENABLED) {
      res.status(503).send(html('IG OAuth disabled', '<h2>Instagram OAuth отключён</h2><p>Администратор ещё не включил IG_OAUTH_ENABLED.</p>'));
      return;
    }

    const code = String(req.query?.code || '').trim();
    const state = String(req.query?.state || '').trim();
    if (!code || !state) {
      res.status(400).send(html('Bad request', '<h2>Ошибка</h2><p>Не хватает параметров <code>code</code>/<code>state</code>.</p>'));
      return;
    }

    if (!CFG.PUBLIC_BASE_URL) {
      res.status(500).send(html('Misconfigured', '<h2>Ошибка конфигурации</h2><p>Не задан <code>PUBLIC_BASE_URL</code>.</p>'));
      return;
    }
    const redirectUri = String(CFG.PUBLIC_BASE_URL).replace(/\/$/, '') + '/api/ig/oauth/callback';

    const payload = await consumeOnce(k(['ig_oauth_state', state]));
    if (!payload || !payload.wsId || !payload.ownerUserId || !payload.tgId) {
      res.status(410).send(html('Expired', '<h2>Сессия устарела</h2><p>Вернись в бот и нажми «Подключить Instagram» ещё раз.</p>'));
      return;
    }

    // 1) exchange code -> short-lived token
    const t1 = await exchangeCodeForShortLivedToken({ code, redirectUri });
    const shortToken = t1?.access_token;
    if (!shortToken) throw new Error('short_token_missing');

    // 2) short -> long-lived token
    const t2 = await exchangeForLongLivedToken({ shortLivedToken: shortToken });
    const accessToken = t2?.access_token;
    const expiresIn = Number(t2?.expires_in || 0);
    if (!accessToken) throw new Error('long_token_missing');

    const tokenExpiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

    // 3) Discover Page-backed IG user.
    // Use the short-lived token for asset discovery: it is guaranteed to be tied to the just-approved
    // Business Login session and its granular asset selection.
    let me = null;
    let perms = null;
    let biz = null;

    try { me = await getMe({ accessToken: shortToken }); } catch {}
    try { perms = await listPermissions({ accessToken: shortToken }); } catch {}

    const pages = await listPages({ accessToken: shortToken });
    let data = Array.isArray(pages?.data) ? pages.data : [];

    // Fallback: some Meta account types (and some New Page Experience setups) don't surface Pages in /me/accounts,
    // but do surface them via Business Manager edges. This requires business_management.
    if (data.length === 0) {
      try {
        biz = await listBusinesses({ accessToken: shortToken });
        const bizList = Array.isArray(biz?.data) ? biz.data : [];
        const agg = [];
        for (const b of bizList.slice(0, 10)) {
          const pages2 = await listBusinessPages({ businessId: b.id, accessToken: shortToken });
          if (Array.isArray(pages2?.data)) agg.push(...pages2.data.map(p => ({ ...p, _bizId: b.id })));
        }
        if (agg.length) data = agg;
      } catch {}
    }

    function pickId(x) {
      if (!x) return null;
      if (typeof x === 'string' || typeof x === 'number') return String(x);
      if (typeof x === 'object') {
        if (x.id) return String(x.id);
      }
      return null;
    }

    function extractIgId(r) {
      // Graph sometimes returns a nested object with {id}, sometimes a plain id.
      return (
        pickId(r?.instagram_business_account) ||
        pickId(r?.connected_instagram_account) ||
        null
      );
    }

    let igUserId = null;
    const diag = [];
    for (const p of data) {
      const pageId = p?.id;
      if (!pageId) continue;

      const pageToken = p?.access_token ? String(p.access_token) : null;

      // Try multiple tokens for max compatibility across Meta account setups.
      // 1) Page token (if present)
      // 2) Short-lived user token (granular session)
      // 3) Long-lived user token (stored)
      const tryTokens = [pageToken, shortToken, accessToken].filter(Boolean);
      let lastErr = null;

      for (const tok of tryTokens) {
        try {
          const r = await getPageIgBusinessAccount({ pageId, accessToken: tok });
          const ig = extractIgId(r);
          diag.push({ pageId: String(pageId), ok: true, hasIg: Boolean(ig) });
          if (ig) { igUserId = String(ig); break; }
          // If request succeeded but no IG link, no need to retry other tokens.
          break;
        } catch (e) {
          lastErr = e;
        }
      }

      if (lastErr) {
        try {
          diag.push({
            pageId: String(pageId),
            ok: false,
            code: lastErr?.code || null,
            msg: String(lastErr?.message || 'error')
          });
        } catch {
          diag.push({ pageId: String(pageId), ok: false, code: null, msg: 'error' });
        }
      }

      if (igUserId) break;
    }

    if (!igUserId) {
            const pagesCount = data.length;
      const diagTxt = (() => {
        try {
          const permsArr = Array.isArray(perms?.data) ? perms.data : [];
          const granted = permsArr.filter(x => x?.status === 'granted').map(x => x?.permission).filter(Boolean);
          const denied = permsArr.filter(x => x?.status === 'declined').map(x => x?.permission).filter(Boolean);

          const bizCount = Array.isArray(biz?.data) ? biz.data.length : 0;

          const items = diag.slice(0, 10).map(d => {
            if (d.ok) return `page ${d.pageId}: ok (hasIG=${d.hasIg ? 'yes' : 'no'})`;
            return `page ${d.pageId}: err (${d.code || 'code?'}) ${d.msg}`;
          }).join('<br>');

          const head = [
            me?.id ? `me=${esc(me.id)}` : null,
            `pages=${pagesCount}`,
            bizCount ? `biz=${bizCount}` : null,
          ].filter(Boolean).join(' · ');

          const permsLine = granted.length
            ? `<br>perms(granted): ${esc(granted.slice(0, 12).join(','))}${granted.length > 12 ? '…' : ''}`
            : (denied.length ? `<br>perms(denied): ${esc(denied.slice(0, 12).join(','))}${denied.length > 12 ? '…' : ''}` : '');

          const body = items ? `<br>${items}` : '';

          return `<hr><p style="font-size:12px;opacity:.85"><b>debug</b>: ${head}${permsLine}${body}</p>`;
        } catch {
          return '';
        }
      })();

      const hint = pagesCount === 0
        ? '<h2>Meta не вернула ни одной Facebook Page</h2><p>Мы получили токен, но список Pages оказался пустым. Обычно это значит одно из двух: (1) Meta не выдала доступ к Pages, или (2) ты вошёл(а) через бизнес‑аккаунт/профиль, который не отдаёт Pages через Graph.</p><p>Попробуй ещё раз и выбери <b>только</b> страницу <b>Collabkapr</b> и Instagram <b>collabkapr</b>. Если снова будет 0 Pages — смотри блок <b>debug</b> ниже: он покажет, какие permissions реально выданы.</p>'
        : '<h2>Не найден Instagram, привязанный к Facebook Page</h2><p>Проверь, что IG аккаунт — профессиональный (Business/Creator) и он привязан к Facebook Page, которой ты управляешь.</p><p>Вернись в бот и попробуй ещё раз.</p>';

      res.status(422).send(html('No linked IG', hint + diagTxt));
      return;
    }

    const igUser = await getIgUser({ igUserId, accessToken });
    const username = String(igUser?.username || '').replace(/^@/, '').trim();
    const accountType = igUser?.account_type ? String(igUser.account_type) : null;
    if (!username) throw new Error('ig_username_missing');

    // 4) persist token (encrypted) + binding
    const enc = encryptText(accessToken);
    await db.upsertIgOAuthAccount(payload.wsId, {
      igUserId,
      igUsername: username,
      accountType,
      status: 'CONNECTED',
      accessTokenEnc: enc,
      tokenExpiresAt,
      scope: CFG.IG_OAUTH_SCOPES || null
    });

    // 5) update workspace profile contacts (verified badge + handle) and legacy profile_ig
    const ws = await db.getWorkspace(payload.ownerUserId, payload.wsId);
    if (ws) {
      const o = parseJsonb(ws.profile_contacts);
      const ig0 = (o.ig && typeof o.ig === 'object') ? o.ig : {};
      ig0.handle = username;
      ig0.url = `https://www.instagram.com/${username}/`;
      ig0.verified = true;
      ig0.verified_at = new Date().toISOString();
      ig0.verified_method = 'oauth';
      // drop pending legacy
      if (ig0.pending) delete ig0.pending;
      o.ig = ig0;

      await db.setWorkspaceSetting(payload.wsId, { profile_contacts: o, profile_contacts_v: 1, profile_ig: username });
      try { await db.auditWorkspace(payload.wsId, payload.ownerUserId, 'ws.ig_oauth_connected', { account_type: accountType || null }); } catch {}
    }

    // 6) notify in Telegram (best effort)
    try {
      const chatId = Number(payload.tgId);
      if (chatId) {
        const msg =
          `✅ <b>Instagram подключён</b>\n\n` +
          `Аккаунт: <code>@${esc(username)}</code>\n` +
          `Статус: <b>verified</b> (бейдж виден брендам до разлока)\n\n` +
          `ℹ️ Handle брендам не раскрывается до разблокировки контактов.`;
        await tgSendMessage(chatId, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
      }
    } catch {}

    res.status(200).send(
      html(
        'Connected',
        `<h2>✅ Instagram подключён</h2><p>Аккаунт: <b>@${esc(username)}</b></p><p>Можно закрыть вкладку и вернуться в Telegram.</p>`
      )
    );
  } catch (e) {
    try { console.error('[IG-OAUTH] callback error', e); } catch {}
    res.status(500).send(html('Error', `<h2>Ошибка подключения</h2><p>${esc(e?.message || 'internal_error')}</p><p>Вернись в бот и попробуй ещё раз.</p>`));
  }
}
