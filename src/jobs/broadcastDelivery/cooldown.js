import { getBroadcastCooldownUntilMs } from '../../bot/cron.js';

// Micro-memo for cooldown checks (per lambda instance).
// Prevents repeated Redis reads during QStash fan-out bursts.
const cooldownMemo = new Map(); // broadcastId -> { untilMs, expAtMs }
const COOLDOWN_MEMO_TTL_MS = Math.max(
  200,
  Math.min(10_000, Number(process.env.QSTASH_BC_COOLDOWN_MEMO_TTL_MS || 1500) || 1500)
);

function getCooldownMemo(broadcastId) {
  const v = cooldownMemo.get(String(broadcastId));
  if (!v) return null;
  if (Date.now() > Number(v.expAtMs || 0)) {
    cooldownMemo.delete(String(broadcastId));
    return null;
  }
  return Number(v.untilMs || 0) || 0;
}

function setCooldownMemo(broadcastId, untilMs) {
  cooldownMemo.set(String(broadcastId), {
    untilMs: Number(untilMs || 0) || 0,
    expAtMs: Date.now() + COOLDOWN_MEMO_TTL_MS,
  });
}

export async function getCooldownUntilFast(broadcastId) {
  const memo = getCooldownMemo(broadcastId);
  if (memo) return memo;
  const ms = await getBroadcastCooldownUntilMs(broadcastId);
  if (ms) setCooldownMemo(broadcastId, ms);
  return ms;
}
