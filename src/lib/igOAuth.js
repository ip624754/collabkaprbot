import { CFG } from './config.js';

function gv() {
  const v = String(CFG.IG_OAUTH_GRAPH_VERSION || 'v25.0').trim();
  return v.startsWith('v') ? v : `v${v}`;
}

function base() {
  return `https://graph.facebook.com/${gv()}`;
}

function fbDialog() {
  return `https://www.facebook.com/${gv()}/dialog/oauth`;
}

function qs(params) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === null || v === undefined) continue;
    const s = String(v);
    if (!s) continue;
    u.set(k, s);
  }
  return u.toString();
}

async function jget(url) {
  const r = await fetch(url, { method: 'GET' });
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!r.ok) {
    const err = data?.error?.message || data?.error || `http_${r.status}`;
    const code = data?.error?.code || r.status;
    const e = new Error(String(err));
    e.code = code;
    e.details = data;
    throw e;
  }
  if (data?.error) {
    const e = new Error(String(data.error?.message || data.error));
    e.code = data.error?.code || 'graph_error';
    e.details = data;
    throw e;
  }
  return data;
}

export function buildAuthorizeUrl({ state, redirectUri }) {
  const scopes = String(CFG.IG_OAUTH_SCOPES || 'instagram_basic,pages_show_list,pages_read_engagement')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .join(',');
  const url = `${fbDialog()}?${qs({
    client_id: CFG.IG_OAUTH_CLIENT_ID,
    redirect_uri: redirectUri,
    state,
    scope: scopes,
    response_type: 'code',
  })}`;
  return url;
}

export async function exchangeCodeForShortLivedToken({ code, redirectUri }) {
  const url = `${base()}/oauth/access_token?${qs({
    client_id: CFG.IG_OAUTH_CLIENT_ID,
    client_secret: CFG.IG_OAUTH_CLIENT_SECRET,
    redirect_uri: redirectUri,
    code,
  })}`;
  return await jget(url);
}

export async function exchangeForLongLivedToken({ shortLivedToken }) {
  const url = `${base()}/oauth/access_token?${qs({
    grant_type: 'fb_exchange_token',
    client_id: CFG.IG_OAUTH_CLIENT_ID,
    client_secret: CFG.IG_OAUTH_CLIENT_SECRET,
    fb_exchange_token: shortLivedToken,
  })}`;
  return await jget(url);
}

export async function listPages({ accessToken }) {
  const url = `${base()}/me/accounts?${qs({ access_token: accessToken })}`;
  return await jget(url);
}

export async function getPageIgBusinessAccount({ pageId, accessToken }) {
  const url = `${base()}/${encodeURIComponent(String(pageId))}?${qs({
    fields: 'instagram_business_account',
    access_token: accessToken
  })}`;
  return await jget(url);
}

export async function getIgUser({ igUserId, accessToken }) {
  const url = `${base()}/${encodeURIComponent(String(igUserId))}?${qs({
    fields: 'username,account_type',
    access_token: accessToken
  })}`;
  return await jget(url);
}
