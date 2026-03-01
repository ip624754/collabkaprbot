import { InlineKeyboard } from 'grammy';
import { CFG } from '../lib/config.js';
import { acquireLock, releaseLock, k, redis } from '../lib/redis.js';

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function dayKey() {
  // YYYYMMDD UTC
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function normalizeChatId(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  // Prefer number when possible.
  if (/^-?\d+$/.test(s)) return Number(s);
  return s;
}

export function resolveOpsTargets() {
  const supportChatId = normalizeChatId(CFG.SUPPORT_CHAT_ID);
  if (supportChatId) return [supportChatId];

  const admins = Array.isArray(CFG.SUPER_ADMIN_TG_IDS) ? CFG.SUPER_ADMIN_TG_IDS : [];
  const targets = [];
  for (const a of admins) {
    const id = normalizeChatId(a);
    if (id) targets.push(id);
  }
  return targets;
}

function bufferKey(group) {
  return k(['ops', 'alerts', String(group || 'ops'), 'd', dayKey()]);
}

function lastSentKey(group) {
  return k(['ops', 'alerts', String(group || 'ops'), 'last_sent']);
}

function dedupKey(group, dedupId) {
  return k(['ops', 'alerts', String(group || 'ops'), 'dedup', String(dedupId || '')]);
}

function uniq(arr) {
  const out = [];
  const seen = new Set();
  for (const x of arr) {
    const kx = String(x);
    if (!kx || seen.has(kx)) continue;
    seen.add(kx);
    out.push(x);
  }
  return out;
}

export async function queueOpsAlert(api, {
  group = 'ops',
  reason = 'error',
  title = '',
  paymentId = null,
  userId = null,
  tgId = null,
  kind = '',
  payload = '',
  extra = [],
} = {}) {
  try {
    // "Silent" mode: keep the operator chat quiet; only failures/errors should pass.
    try {
      if (CFG.OPS_ALERT_SILENT) {
        const r = String(reason || '').toLowerCase();
        const isErrorish = r.includes('error') || r.includes('failed') || r.includes('exception') || r.includes('panic');
        if (!isErrorish) return { queued: false, skipped: 'silent' };
      }
    } catch {
      // ignore
    }

    const targets = resolveOpsTargets();
    if (!targets.length) return { queued: false, skipped: 'no_targets' };

    const g = String(group || 'ops');
    const bufK = bufferKey(g);

    // Dedup same payment+reason for a short window.
    const dId = paymentId ? `p:${paymentId}|r:${reason}` : `r:${reason}|k:${kind}|u:${userId || ''}`;
    const dK = dedupKey(g, dId);
    try {
      const ok = await redis.set(dK, '1', { nx: true, ex: Math.max(60, Math.min(30 * 60, Number(CFG.OPS_ALERT_SUMMARY_SEC || 600))) });
      if (!ok) return { queued: false, skipped: 'dedup' };
    } catch {
      // ignore dedup failure
    }

    const ev = {
      ts: new Date().toISOString(),
      reason: String(reason || 'error'),
      title: String(title || ''),
      paymentId: paymentId ? Number(paymentId) : null,
      userId: userId ? Number(userId) : null,
      tgId: tgId ? Number(tgId) : null,
      kind: String(kind || ''),
      payload: String(payload || '').slice(0, 180),
      extra: (Array.isArray(extra) ? extra : []).map((s) => String(s || '').slice(0, 300)).filter(Boolean),
    };

    try {
      // Atomic LPUSH + LTRIM + EXPIRE to prevent race between buffer push and trim.
      const maxBuf = Math.max(10, Number(CFG.OPS_ALERT_BUFFER_MAX || 200));
      const ttlSec = 2 * 24 * 60 * 60;
      const opsLua = `
        redis.call('LPUSH', KEYS[1], ARGV[1])
        redis.call('LTRIM', KEYS[1], 0, tonumber(ARGV[2]) - 1)
        redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
        return 1
      `;
      await redis.eval(opsLua, [bufK], [JSON.stringify(ev), String(maxBuf), String(ttlSec)]);
    } catch {
      // If buffer is unavailable, fall back to immediate send.
      return await flushOpsAlerts(api, g, { force: true, fallbackSingle: ev });
    }

    // If enough time has passed since the last digest — flush immediately (one digest).
    const lastRaw = await redis.get(lastSentKey(g));
    const last = Number(lastRaw) || 0;
    const win = Number(CFG.OPS_ALERT_SUMMARY_SEC || 600);
    if (!last || (nowSec() - last) >= win) {
      return await flushOpsAlerts(api, g, { force: true });
    }

    return { queued: true, flushed: false };
  } catch {
    return { queued: false, error: 'queue_failed' };
  }
}

export async function flushOpsAlerts(api, group = 'ops', { force = false, fallbackSingle = null } = {}) {
  const g = String(group || 'ops');
  const targets = resolveOpsTargets();
  if (!targets.length) return { sent: 0, skipped: 'no_targets' };

  const lockKey = k(['lock', 'ops_alerts_flush', g]);
  const lock = await acquireLock(lockKey, 20);
  if (!lock) return { sent: 0, skipped: 'locked' };

  try {
    const win = Number(CFG.OPS_ALERT_SUMMARY_SEC || 600);
    const lastRaw = await redis.get(lastSentKey(g));
    const last = Number(lastRaw) || 0;
    if (!force && last && (nowSec() - last) < win) return { sent: 0, skipped: 'window' };

    const bufK = bufferKey(g);
    let raw = [];
    try {
      raw = await redis.lrange(bufK, 0, -1);
    } catch {
      raw = [];
    }

    let events = [];
    for (const r of raw || []) {
      try {
        const parsed = typeof r === 'string' ? JSON.parse(r) : r;
        if (parsed) events.push(parsed);
      } catch {
        // ignore
      }
    }
    if (fallbackSingle) events.push(fallbackSingle);
    if (!events.length) return { sent: 0, skipped: 'empty' };

    // newest first
    events.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));

    const byReason = {};
    const byKind = {};
    const payIds = [];
    for (const e of events) {
      const r = String(e.reason || 'error');
      byReason[r] = (byReason[r] || 0) + 1;
      const knd = String(e.kind || '').trim() || 'ops';
      byKind[knd] = (byKind[knd] || 0) + 1;
      if (e.paymentId) payIds.push(Number(e.paymentId));
    }
    const uniqPay = uniq(payIds).slice(0, 5);

    const silent = !!CFG.OPS_ALERT_SILENT;
    const head = `⚠️ <b>OPS</b>${silent ? ' · <b>quiet</b>' : ''} · <b>${esc(g)}</b> · <b>${events.length}</b> событий`;
    const lines = [head, ''];

    for (const [r, c] of Object.entries(byReason).sort((a, b) => Number(b[1]) - Number(a[1]))) {
      lines.push(`• <b>${esc(r)}</b>: <code>${c}</code>`);
    }

    const kinds = Object.entries(byKind).sort((a, b) => Number(b[1]) - Number(a[1]));
    if (kinds.length > 1) {
      lines.push('');
      lines.push('<b>По типам:</b>');
      for (const [knd, c] of kinds) {
        lines.push(`• <b>${esc(knd)}</b>: <code>${c}</code>`);
      }
    }

    // show last few events (compact)
    const tail = events.slice(0, 8).map((e) => {
      const pid = e.paymentId ? `#${e.paymentId}` : '';
      const knd = e.kind ? `${e.kind}` : '';
      const ttl = e.title ? ` — ${e.title}` : '';
      return `- ${esc(String(e.ts || '').replace('T', ' ').slice(0, 19))} ${esc(pid)} ${esc(String(e.reason || ''))} ${esc(knd)}${esc(ttl)}`.trim();
    });
    if (tail.length) {
      lines.push('', '<b>Последние:</b>');
      lines.push(...tail);
    }

    const kb = new InlineKeyboard();
    const hasPayments = uniqPay.length > 0 || events.some((e) => String(e.kind || '').toLowerCase().includes('pay'));
    if (hasPayments) {
      // Open ORPHANED list in bot admin.
      kb.text('💳 ORPHANED', 'a:admin_payments|st:ORPHANED|p:0');
      kb.row();
      for (const id of uniqPay) {
        kb.text(`🧾 #${id}`, `a:admin_pay_view|id:${id}|st:ORPHANED|p:0`).row();
      }
    }
    kb.text('👑 Админка', 'a:admin_home');

    const msg = lines.join('\n');

    let sent = 0;
    for (const t of targets) {
      try {
        await api.sendMessage(t, msg, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb });
        sent += 1;
      } catch {
        // ignore
      }
    }

    // Mark flushed.
    try {
      await redis.set(lastSentKey(g), String(nowSec()), { ex: 2 * 24 * 60 * 60 });
      await redis.del(bufK);
    } catch {
      // ignore
    }

    return { sent, flushed: true, events: events.length };
  } finally {
    await releaseLock(lockKey, lock.token);
  }
}
