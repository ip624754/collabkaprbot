import { broadcastTick, giveawaysTick, igVerifyTick, auditFlushTick } from '../src/bot/cron.js';
import { queueOpsDigestSafe } from '../src/lib/opsDigest.js';
import { CFG, assertEnv } from '../src/lib/config.js';
import { timingSafeEq } from '../src/lib/adminWeb/common.js';
import { getCronJobFailureHandled, isCronJobFailureHandled } from '../src/lib/cronFailure.js';

function getBearerToken(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || '';
  const s = String(h || '').trim();
  const m = s.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

function getJob(req) {
  // Не трогаем query-getter: в Vercel это getter, который внутри дергает legacy url.parse()
  // и поднимает DEP0169. Парсим URL только через WHATWG URL API.
  try {
    const u = new URL(req.url, 'http://localhost');
    const j = u.searchParams.get('job');
    return j ? String(j) : '';
  } catch {
    return '';
  }
}

function asMethodOk(req) {
  return req.method === 'GET' || req.method === 'POST';
}

async function runJob(job) {
  switch (String(job || '')) {
    case 'broadcast-tick':
      return await broadcastTick();
    case 'giveaways-tick':
      return await giveawaysTick();
    case 'ig-verify-tick':
      return await igVerifyTick();
    case 'audit-flush-tick':
      return await auditFlushTick();
    default:
      return { _unknownJob: true };
  }
}

export default async function handler(req, res) {
  try {
    if (!asMethodOk(req)) {
      res.status(405).end('Method Not Allowed');
      return;
    }

    res.setHeader('Cache-Control', 'no-store');

    if (!CFG.CRON_SECRET) {
      res.status(500).json({ ok: false, error: 'cron_secret_missing' });
      return;
    }

    const token = getBearerToken(req);
    if (!token || !timingSafeEq(token, CFG.CRON_SECRET)) {
      res.status(401).json({ ok: false, error: 'unauthorized' });
      return;
    }

    assertEnv();

    const job = getJob(req);
    if (!job) {
      res.status(400).json({ ok: false, error: 'job_missing' });
      return;
    }

    // Master kill-switch: close IG surface if explicitly disabled.
    if (job === 'ig-verify-tick' && !CFG.IG_ROUTES_ENABLED) {
      res.status(404).end('not_found');
      return;
    }

    const r = await runJob(job);
    if (r && r._unknownJob) {
      res.status(400).json({ ok: false, error: 'unknown_job', job });
      return;
    }

    res.status(200).json({ ok: true, job, ...r });
  } catch (e) {
    console.error('[CRON-ROUTER] error', e);

    // A cron job reports its own authoritative failure with job/error classification.
    // The router alerts only for failures outside that owned job boundary.
    if (!isCronJobFailureHandled(e)) {
      try {
        const job = getJob(req) || '';
        await queueOpsDigestSafe({
          group: 'ops',
          reason: 'cron_router_failed',
          title: 'cron_router crashed',
          kind: 'cron',
          payload: job ? `job=${job}` : '',
          extra: [String(e?.name || 'Error') + ': ' + String(e?.message || e).slice(0, 180)],
          dedupId: job ? `cron_router:${job}` : 'cron_router',
        });
      } catch {
        // ignore
      }
    } else {
      try {
        console.warn('[CRON-ROUTER] duplicate alert suppressed', getCronJobFailureHandled(e));
      } catch {}
    }

    res.status(500).json({ ok: false, error: 'internal_error' });
  }
}
