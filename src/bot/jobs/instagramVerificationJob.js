// STEP590G1: Instagram verification cron job.
// Compatibility extraction only: preserve cron behavior, locks, TTLs and route contracts.
import * as db from '../../db/queries.js';
import { getBot } from '../bot.js';
import { CFG } from '../../lib/config.js';
import { CRON_LOCK_TTL_SEC, k, redis, withLock, writeCronLastRun } from './cronRuntime.js';

// BEGIN MOVED CRON BODY: instagram
export async function igVerifyTick() {
  const lockKey = k(['lock', 'ig_verify_tick']);
  const startedAt = Date.now();

  // Optional feature: enabled only if explicitly configured.
  const enabled = !!CFG.IG_VERIFY_TICK_ENABLED && !!String(CFG.IG_VERIFY_ACCESS_TOKEN || '').trim() && !!String(CFG.IG_VERIFY_MEDIA_ID || '').trim();
  if (!enabled) {
    const out = { enabled: false, checked: 0, verified: 0, duration_ms: Date.now() - startedAt };
    await writeCronLastRun('ig_verify_tick', { ts: new Date().toISOString(), ...out });
    return out;
  }

  return await withLock(lockKey, CRON_LOCK_TTL_SEC, async () => {
    const nowIso = new Date().toISOString();
    // DB truth: pending codes live in workspace_settings.profile_contacts. Redis is only accelerator.
    const pendingRows = await db.listIgVerifyPendingWorkspaces(300);
    const pendingByCode = new Map(); // code -> { wsId, ownerUserId, profile_contacts }
    for (const r of pendingRows || []) {
      const wsId = Number(r.workspace_id || 0);
      const ownerUserId = Number(r.owner_user_id || 0);
      const pc = r.profile_contacts || {};
      const ig = (pc.ig && typeof pc.ig === 'object') ? pc.ig : null;
      const code = ig?.pending?.code ? String(ig.pending.code).trim().toUpperCase() : '';
      if (!wsId || !ownerUserId || !code) continue;
      pendingByCode.set(code, { wsId, ownerUserId, profile_contacts: pc });
    }

    const codes = new Set(pendingByCode.keys());
    if (codes.size === 0) {
      const out0 = { enabled: true, checked: 0, verified: 0, duration_ms: Date.now() - startedAt };
      await writeCronLastRun('ig_verify_tick', { ts: nowIso, ...out0 });
      return out0;
    }

    const comments = await fetchIgVerificationComments({
      mediaId: String(CFG.IG_VERIFY_MEDIA_ID),
      accessToken: String(CFG.IG_VERIFY_ACCESS_TOKEN),
      limit: Number(CFG.IG_VERIFY_COMMENTS_LIMIT || 50) || 50,
    });

    let verified = 0;
    let checked = 0;

    for (const c of comments) {
      checked += 1;
      const text = String(c.text || '');
      const username = String(c.username || '').replace(/^@/, '').trim();
      if (!text || !username) continue;

      const foundCodes = extractIgVerifyCodes(text);
      if (!foundCodes.length) continue;

      for (const code of foundCodes) {
        const kcode = code.trim().toUpperCase();
        if (!codes.has(kcode)) continue;
        const row = pendingByCode.get(kcode);
        if (!row) continue;

        // Update DB truth: verified=true, handle/url from Graph username ONLY (ignore any user input).
        const pc0 = row.profile_contacts || {};
        const ig0 = (pc0.ig && typeof pc0.ig === 'object') ? pc0.ig : {};
        ig0.verified = true;
        ig0.verified_at = nowIso;
        ig0.verified_method = 'comment';
        ig0.handle = username;
        ig0.url = `https://www.instagram.com/${username}/`;
        delete ig0.pending;
        pc0.ig = ig0;

        try {
          await db.setWorkspaceSetting(row.wsId, { profile_contacts: pc0, profile_contacts_v: 1 });
        } catch (e) {
          console.error('[IG-VERIFY] db.setWorkspaceSetting failed', { wsId: row.wsId }, e);
          continue;
        }

        // Best-effort: clear Redis accelerator keys.
        try {
          await redis.del(k(['ig_pending', kcode]));
          await redis.del(k(['ig_ws_pending', row.wsId]));
        } catch {}

        // Best-effort notify creator (owner) in Telegram.
        try {
          await getBot().api.sendMessage(
            row.ownerUserId,
            `✅ Instagram верифицирован!\n\nБейдж доверия теперь виден брендам в витрине (до unlock).`,
            { disable_web_page_preview: true }
          );
        } catch {}

        verified += 1;

        // Avoid double-processing if multiple comments contain same code.
        codes.delete(kcode);
        pendingByCode.delete(kcode);
        break;
      }

      if (codes.size === 0) break;
    }

    const out = { enabled: true, checked, verified, pending: pendingByCode.size, duration_ms: Date.now() - startedAt };
    await writeCronLastRun('ig_verify_tick', { ts: nowIso, ...out });
    return out;
  });
}

function extractIgVerifyCodes(text) {
  const s = String(text || '');
  // Accept typical variants: "COLLABKA-XXXXXX" (letters/digits, length 4..12)
  const re = /\bCOLLABKA-[A-Z0-9]{4,12}\b/gi;
  const out = [];
  let m;
  while ((m = re.exec(s))) {
    out.push(String(m[0] || '').toUpperCase());
    if (out.length >= 5) break; // keep bounded
  }
  return out;
}

async function fetchIgVerificationComments({ mediaId, accessToken, limit }) {
  const out = [];
  const lim = Math.max(5, Math.min(Number(limit || 0) || 50, 200));
  const url = new URL(`https://graph.facebook.com/v19.0/${encodeURIComponent(String(mediaId))}/comments`);
  url.searchParams.set('fields', 'id,text,username,timestamp');
  url.searchParams.set('limit', String(lim));
  url.searchParams.set('access_token', String(accessToken));

  // NOTE: no IG API calls in hot paths; this runs only from cron.
  let nextUrl = url.toString();
  const seen = new Set();

  for (let page = 0; page < 5 && nextUrl; page++) {
    const resp = await fetch(nextUrl, { method: 'GET' });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`IG comments fetch failed: ${resp.status} ${txt.slice(0, 300)}`);
    }

    const js = await resp.json();
    const data = Array.isArray(js?.data) ? js.data : [];
    for (const x of data) {
      const id = x?.id ? String(x.id) : '';
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      out.push({
        id: x?.id,
        text: x?.text,
        username: x?.username,
        timestamp: x?.timestamp,
      });
    }

    nextUrl = js?.paging?.next || null;
    if (!nextUrl) break;
    if (out.length >= 1000) break;
  }

  return out;
}
// END MOVED CRON BODY: instagram
