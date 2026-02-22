import crypto from 'crypto';

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Convert Telegram message entities into HTML markup (safe for parse_mode=HTML).
// Used for admin broadcast drafts to preserve "link in word" (text_link) and basic formatting.
// If the input already looks like raw HTML tags, we keep it as-is (admins sometimes type HTML manually).
export function telegramEntitiesToHtml(text, entities) {
  const t = String(text ?? '');
  const ents0 = Array.isArray(entities) ? entities : [];
  if (!t || !ents0.length) return t;

  // Heuristic: if user typed raw HTML tags, do not escape/convert.
  // This keeps backward compatibility with manual "<b>..." formatting.
  if (/<\/?[a-z][\s\S]*?>/i.test(t)) return t;

  const supported = new Set([
    'bold',
    'italic',
    'underline',
    'strikethrough',
    'spoiler',
    'code',
    'pre',
    'text_link',
  ]);

  const ents = ents0
    .filter((e) => e && supported.has(String(e.type || '')))
    .filter((e) => Number.isInteger(e.offset) && Number.isInteger(e.length))
    .map((e) => {
      const start = Math.max(0, Number(e.offset));
      const end = Math.max(start, Math.min(t.length, start + Number(e.length)));
      return {
        type: String(e.type || ''),
        start,
        end,
        url: e.url ? String(e.url) : '',
        language: e.language ? String(e.language) : '',
      };
    })
    .filter((e) => e.end > e.start);

  if (!ents.length) return t;

  const openAt = new Map();
  const closeAt = new Map();
  const breaks = new Set([0, t.length]);

  for (const e of ents) {
    breaks.add(e.start);
    breaks.add(e.end);
    if (!openAt.has(e.start)) openAt.set(e.start, []);
    openAt.get(e.start).push(e);
    if (!closeAt.has(e.end)) closeAt.set(e.end, []);
    closeAt.get(e.end).push(e);
  }

  const orderOpen = (a, b) => (b.end - b.start) - (a.end - a.start);
  const orderClose = (a, b) => (a.end - a.start) - (b.end - b.start);

  const tagOpen = (e) => {
    switch (e.type) {
      case 'bold': return '<b>';
      case 'italic': return '<i>';
      case 'underline': return '<u>';
      case 'strikethrough': return '<s>';
      case 'spoiler': return '<span class="tg-spoiler">';
      case 'code': return '<code>';
      case 'pre':
        if (e.language) return `<pre><code class="language-${escapeHtml(e.language)}">`;
        return '<pre>';
      case 'text_link':
        if (!e.url) return '';
        return `<a href="${escapeHtml(e.url)}">`;
      default:
        return '';
    }
  };

  const tagClose = (e) => {
    switch (e.type) {
      case 'bold': return '</b>';
      case 'italic': return '</i>';
      case 'underline': return '</u>';
      case 'strikethrough': return '</s>';
      case 'spoiler': return '</span>';
      case 'code': return '</code>';
      case 'pre':
        if (e.language) return '</code></pre>';
        return '</pre>';
      case 'text_link':
        if (!e.url) return '';
        return '</a>';
      default:
        return '';
    }
  };

  const sortedBreaks = [...breaks].sort((a, b) => a - b);
  let out = '';
  let cur = 0;

  for (const pos of sortedBreaks) {
    if (pos > cur) out += escapeHtml(t.slice(cur, pos));

    const closers = closeAt.get(pos) || [];
    if (closers.length) {
      closers.sort(orderClose);
      for (const e of closers) out += tagClose(e);
    }

    const openers = openAt.get(pos) || [];
    if (openers.length) {
      openers.sort(orderOpen);
      for (const e of openers) out += tagOpen(e);
    }

    cur = pos;
  }

  return out;
}

export function fmtTs(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return '—';

  // UX-default: Moscow time for all users (matches CRON_TZ=Europe/Moscow in QStash)
  try {
    const fmt = new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Europe/Moscow',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(d);
    const get = (t) => parts.find(p => p.type === t)?.value || '';
    const dd = get('day');
    const mm = get('month');
    const hh = get('hour');
    const mi = get('minute');
    if (dd && mm && hh && mi) return `${dd}.${mm} ${hh}:${mi} (МСК)`;
  } catch {
    // fall back to UTC below
  }

  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${dd}.${mm} ${hh}:${mi} (UTC)`;
}

export function randomToken(nBytes = 12) {
  return crypto.randomBytes(nBytes).toString('hex');
}

export function parseCb(data) {
  // example: a:gw_export|i:12|t:all
  // supports compact aliases (backward compatible):
  //  - w -> ws, r -> ret
  //  - s/st: n|ip|cl|sp -> new|in_progress|closed|spam
  //  - ret: wo|wp|wl|m|h -> ws_open|ws_profile|ws_list|menu|home
  const out = { raw: data };
  const parts = String(data || '').split('|');
  out.a = parts[0] || '';
  for (let i = 1; i < parts.length; i++) {
    let [k, v] = parts[i].split(':');
    if (!k) continue;
    if (k === 'w') k = 'ws';
    if (k === 'r') k = 'ret';
    out[k] = v;
  }

  const mapLeadStatus = (x) => {
    const v = String(x || '').toLowerCase().trim();
    if (v === 'n') return 'new';
    if (v === 'ip') return 'in_progress';
    if (v === 'cl') return 'closed';
    if (v === 'sp') return 'spam';
    return v;
  };

  const mapRet = (x) => {
    const v = String(x || '').toLowerCase().trim();
    if (v === 'wo') return 'ws_open';
    if (v === 'wp') return 'ws_profile';
    if (v === 'wl') return 'ws_list';
    if (v === 'm') return 'menu';
    if (v === 'h') return 'home';
    return v;
  };

  if (out.s) out.s = mapLeadStatus(out.s);
  if (out.st) out.st = mapLeadStatus(out.st);
  if (out.ret) out.ret = mapRet(out.ret);

  return out;
}

export function parseStartPayload(text) {
  const t = String(text || '');
  let m = t.match(/\/start\s+gwj_(\d+)/);
  if (m) return { type: 'gwj', id: Number(m[1]) };
  m = t.match(/\/start\s+gwc_(\d+)/);
  if (m) return { type: 'gwc', id: Number(m[1]) };
  m = t.match(/\/start\s+gw_(\d+)/);
  if (m) return { type: 'gw', id: Number(m[1]) };
  m = t.match(/\/start\s+gwo_(\d+)/);
  if (m) return { type: 'gwo', id: Number(m[1]) };
  m = t.match(/\/start\s+cur_(\d+)_(\w+)/);
  if (m) return { type: 'cur', wsId: Number(m[1]), token: m[2] };
  m = t.match(/\/start\s+fed_(\d+)_(\w+)/);
  if (m) return { type: 'fed', wsId: Number(m[1]), token: m[2] };
  m = t.match(/\/start\s+bxo_(\d+)/);
  if (m) return { type: 'bxo', id: Number(m[1]) };

  m = t.match(/\/start\s+bp_(\d+)/);
  if (m) return { type: 'bp', id: Number(m[1]) };

  m = t.match(/\/start\s+offer_(\d+)/);
  if (m) return { type: 'offer', id: Number(m[1]) };

  m = t.match(/\/start\s+bxth_(\d+)/);
  if (m) return { type: 'bxth', id: Number(m[1]) };

  m = t.match(/\/start\s+bminv_(\w+)/);
  if (m) return { type: 'bminv', token: m[1] };

  m = t.match(/\/start\s+wsp_(\d+)/);
  if (m) return { type: 'wsp', wsId: Number(m[1]) };

  m = t.match(/\/start\s+fs_(\w+)/);
  if (m) return { type: 'fs', tag: m[1] };

  // Lightweight acquisition source markers (no business logic):
  // - /start src_tg  (shared in Telegram)
  // - /start src_ig  (shared via Instagram)
  m = t.match(/\/start\s+src_(ig|tg)(?:\b|_)/);
  if (m) return { type: 'src', src: String(m[1] || '').toLowerCase() };

  return null;
}

export function nowIso() {
  return new Date().toISOString();
}

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

export function parseMoscowDateTime(input) {
  // expects "DD.MM HH:MM" Moscow time. Converts to Date (UTC) by subtracting 3 hours.
  const s = String(input || '').trim();
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const hh = Number(m[3]);
  const mi = Number(m[4]);
  const year = new Date().getUTCFullYear();
  // Moscow UTC+3
  const utc = new Date(Date.UTC(year, mm - 1, dd, hh - 3, mi, 0));
  return isNaN(utc.getTime()) ? null : utc;
}


export function computeThreadReplyStatus(thread, viewerUserId, opts = {}) {
  const afterHours = Number(opts.afterHours ?? 24);
  const retryEnabled = !!opts.retryEnabled;
  const now = opts.now instanceof Date ? opts.now : new Date();

  const buyerId = Number(thread?.buyer_user_id || 0);
  const sellerId = Number(thread?.seller_user_id || 0);
  const isBuyer = Number(viewerUserId || 0) === buyerId;
  const isSeller = Number(viewerUserId || 0) === sellerId;

  const buyerFirstMsgAt = thread?.buyer_first_msg_at ? new Date(thread.buyer_first_msg_at) : null;
  const sellerFirstReplyAt = thread?.seller_first_reply_at ? new Date(thread.seller_first_reply_at) : null;
  const retryIssuedAt = thread?.retry_issued_at ? new Date(thread.retry_issued_at) : null;

  let base = '';
  if (sellerFirstReplyAt) {
    base = '✅ ответил';
  } else if (buyerFirstMsgAt) {
    base = isBuyer ? '⏳ ждём ответ…' : '⏳ ждёт ваш ответ…';
  } else {
    base = isBuyer ? '✍️ напишите первым' : '⏳ ждёт сообщение…';
  }

  // Retry status (only meaningful for buyer/brand side)
  let retry = '';
  if (retryEnabled && isBuyer && buyerFirstMsgAt && !sellerFirstReplyAt) {
    if (retryIssuedAt) {
      retry = '🎟 повтор отправлен';
    } else if (Number.isFinite(afterHours) && afterHours > 0) {
      const elapsedH = (now.getTime() - buyerFirstMsgAt.getTime()) / 3600000;
      const left = Math.ceil(afterHours - elapsedH);
      if (elapsedH >= afterHours) retry = '♻️ можно повторить';
      else if (left > 0) retry = `⏳ повтор ~${left}ч`;
    }
  }

  return { base, retry, isBuyer, isSeller };
}

export function formatBxChargeLine(thread) {
  const src = String(thread?.intro_charge_source || '').toUpperCase();
  const cost = Number(thread?.intro_cost || 0);
  const chargedAt = thread?.intro_charged_at;

  if (!chargedAt && !src) return '';
  if (!cost && src !== 'RETRY') return '';

  let label = '';
  if (src === 'RETRY') label = 'Повтор';
  else if (src === 'CREDITS') label = 'Brand Pass';
  else if (src) label = src;

  if (label) return `💳 Списано: ${cost} · ${label}`;
  return `💳 Списано: ${cost}`;
}
