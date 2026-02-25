import { Client } from '@upstash/qstash';
import { CFG } from './config.js';

let _client = null;

function getClient() {
  if (_client) return _client;
  const token = process.env.QSTASH_TOKEN || '';
  if (!token) return null;
  _client = new Client({ token });
  return _client;
}

export function getQStashDeliveryUrl(pathname) {
  const base = String(CFG.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  if (!base) return '';
  const p = String(pathname || '').startsWith('/') ? pathname : `/${pathname}`;
  return `${base}${p}`;
}

export async function qstashPublishJSON({
  url,
  body,
  deduplicationId,
  delaySec,
  retries,
  flowControl,
  timeout,
}) {
  const client = getClient();
  if (!client) throw new Error('qstash_token_missing');
  const headers = {};
  if (deduplicationId) headers['Upstash-Deduplication-Id'] = String(deduplicationId);

  const r = await client.publishJSON({
    url,
    body,
    headers,
    ...(delaySec ? { delay: `${Math.max(1, Math.floor(delaySec))}s` } : {}),
    ...(typeof retries === 'number' ? { retries } : {}),
    ...(timeout ? { timeout } : {}),
    ...(flowControl ? { flowControl } : {}),
  });

  return r;
}

export function getBroadcastFlowControl(broadcastId) {
  const bid = Number(broadcastId) || 0;
  return {
    key: `broadcast:${bid || 'na'}`,
    parallelism: Number(CFG.QSTASH_BROADCAST_PARALLELISM || 8),
    ratePerSecond: Number(CFG.QSTASH_BROADCAST_RATE_PER_SEC || 20),
  };
}
