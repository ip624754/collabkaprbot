import { CFG } from '../src/lib/config.js';

// Simple health endpoint (no secrets).
// Optional: show last cron ticks from Redis (no DB).
export default async function handler(_req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const base = { ok: true, ts: new Date().toISOString(), env: CFG.APP_ENV };

  // Redis is optional for /api/health (so it stays useful in minimal envs).
  if (!CFG.UPSTASH_REDIS_REST_URL || !CFG.UPSTASH_REDIS_REST_TOKEN) {
    res.status(200).json({ ...base, cron: { enabled: false } });
    return;
  }

  try {
    const { redis, k } = await import('../src/lib/redis.js');

    const [giveawaysTick, broadcastTick] = await Promise.all([
      redis.get(k(['cron', 'giveaways_tick', 'last_run'])),
      redis.get(k(['cron', 'broadcast_tick', 'last_run'])),
    ]);

    res.status(200).json({
      ...base,
      cron: {
        enabled: true,
        giveaways_tick: giveawaysTick || null,
        broadcast_tick: broadcastTick || null,
      },
    });
  } catch (_e) {
    res.status(200).json({
      ...base,
      cron: { enabled: true, error: 'redis_unavailable' },
    });
  }
}
