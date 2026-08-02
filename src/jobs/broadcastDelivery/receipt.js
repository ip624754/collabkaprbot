import { queueOpsDigestSafe } from '../../lib/opsDigest.js';

export async function emitBroadcastDeliveryUnknown({ broadcastId, userId, attemptId, reason, dbPersisted }) {
  try {
    await queueOpsDigestSafe({
      group: 'ops',
      reason: 'broadcast_delivery_unknown',
      title: 'Broadcast delivery needs reconciliation',
      kind: 'qstash',
      payload: `broadcast=${Number(broadcastId || 0) || 0}`,
      extra: [
        `user=${Number(userId || 0) || 0}`,
        attemptId ? `attempt=${String(attemptId)}` : '',
        dbPersisted ? 'state=delivery_unknown' : 'state=sending_unconfirmed',
        String(reason || 'delivery_outcome_unknown').slice(0, 180),
      ].filter(Boolean),
      dedupId: `broadcast_delivery_unknown:${Number(broadcastId || 0) || 0}:${Number(userId || 0) || 0}`,
    });
  } catch {
    // Redis-only observability must not change delivery state.
  }
}
