import { createRequire } from 'node:module';
import { CFG } from './config.js';
import { queueOpsDigestSafe } from './opsDigest.js';

// QStash is an optional dependency. If the package is missing in a given deploy,
// the bot must NOT crash — QStash features become disabled instead.
//
// Why: users sometimes apply hotfix zips without updating package.json.
// In that case a static ESM import would hard-crash the whole function.
const require = createRequire(import.meta.url);

let QStashMod = null;
let QStashLoadError = null;
try {
  // eslint-disable-next-line global-require
  QStashMod = require('@upstash/qstash');
} catch (e) {
  QStashLoadError = e;
}

const Client = QStashMod?.Client || null;
const Receiver = QStashMod?.Receiver || null;

export function isQStashLibAvailable() {
  return !!Client && !!Receiver;
}

export function getQStashConfigSnapshot() {
  const publishConfigured = !!String(CFG.QSTASH_TOKEN || '').trim();
  const verifyConfigured = !!String(CFG.QSTASH_CURRENT_SIGNING_KEY || '').trim();
  const nextSigningKeyConfigured = !!String(CFG.QSTASH_NEXT_SIGNING_KEY || '').trim();
  const urlConfigured = !!String(CFG.QSTASH_URL || '').trim();
  const fullyConfigured = publishConfigured && verifyConfigured;
  const partiallyConfigured = !fullyConfigured && (publishConfigured || verifyConfigured || nextSigningKeyConfigured || urlConfigured);

  return {
    publishConfigured,
    verifyConfigured,
    nextSigningKeyConfigured,
    urlConfigured,
    fullyConfigured,
    partiallyConfigured,
    status: fullyConfigured ? 'fully_configured' : (partiallyConfigured ? 'partially_configured' : 'not_configured'),
  };
}

export function getQStashLibHealth() {
  return {
    available: isQStashLibAvailable(),
    error: QStashLoadError
      ? {
          code: String(QStashLoadError?.code || ''),
          message: String(QStashLoadError?.message || QStashLoadError),
        }
      : null,
  };
}

let _client = null;

function getClientOrNull() {
  if (_client) return _client;
  if (!Client) throw new Error('qstash_lib_missing');
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

export function sanitizeQStashDeduplicationId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const safe = raw
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 180);

  return safe || 'qstash-dedup';
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
  const client = getClientOrNull();
  if (!client) throw new Error('qstash_token_missing');
  const headers = {};
  const dedupHeaderValue = sanitizeQStashDeduplicationId(deduplicationId);
  if (dedupHeaderValue) headers['Upstash-Deduplication-Id'] = dedupHeaderValue;

  let r;
  try {
    r = await client.publishJSON({
      url,
      body,
      headers,
      ...(delaySec ? { delay: `${Math.max(1, Math.floor(delaySec))}s` } : {}),
      ...(typeof retries === 'number' ? { retries } : {}),
      ...(timeout ? { timeout } : {}),
      ...(flowControl ? { flowControl } : {}),
    });
  } catch (e) {
    // Digest ops alert (anti-spam): QStash publish failures are expensive and often indicate misconfig or outage.
    await queueOpsDigestSafe({
      group: 'ops',
      reason: 'qstash_publish_failed',
      title: 'QStash publishJSON failed',
      kind: 'qstash',
      payload: String(url || '').slice(0, 180),
      extra: [
        dedupHeaderValue ? `dedup: ${dedupHeaderValue.slice(0, 120)}` : '',
        dedupHeaderValue && String(deduplicationId || '') !== dedupHeaderValue
          ? `dedup_raw: ${String(deduplicationId).slice(0, 120)}`
          : '',
        delaySec ? `delaySec: ${Math.floor(delaySec)}` : '',
        typeof retries === 'number' ? `retries: ${retries}` : '',
        String(e?.name || 'Error') + ': ' + String(e?.message || e).slice(0, 180),
      ].filter(Boolean),
      dedupId: deduplicationId ? `qstash_pub:${String(deduplicationId).slice(0, 140)}` : `qstash_pub:${String(url || '').slice(0, 140)}`,
    });
    throw e;
  }

  return r;
}

export async function qstashVerifySignature({ signature, body, url }) {
  if (!Receiver) throw new Error('qstash_lib_missing');
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY || '';
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY || '';
  if (!signature || !currentSigningKey) throw new Error('qstash_signature_missing');
  if (!url) throw new Error('public_base_url_missing');

  const receiver = new Receiver({ currentSigningKey, nextSigningKey });
  const isValid = await receiver.verify({ body: String(body || ''), signature, url: String(url) });
  if (!isValid) throw new Error('qstash_invalid_signature');
  return true;
}

export function getBroadcastFlowControl(broadcastId) {
  const bid = Number(broadcastId) || 0;
  return {
    key: `broadcast.${bid || 'na'}`,
    parallelism: Number(CFG.QSTASH_BROADCAST_PARALLELISM || 8),
    ratePerSecond: Number(CFG.QSTASH_BROADCAST_RATE_PER_SEC || 20),
  };
}
