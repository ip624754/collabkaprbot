import crypto from 'crypto';
import { CFG } from './config.js';

function toKeyBytes(input) {
  const s = String(input || '').trim();
  if (!s) return null;

  // Try hex
  if (/^[0-9a-fA-F]{64}$/.test(s)) {
    return Buffer.from(s, 'hex');
  }

  // Try base64 (len>=43 is typical for 32 bytes)
  try {
    const b = Buffer.from(s, 'base64');
    if (b.length >= 32) return b.subarray(0, 32);
  } catch {}

  // Fallback: derive 32 bytes from utf8 via sha256
  return crypto.createHash('sha256').update(s, 'utf8').digest();
}

function getKey() {
  const k = toKeyBytes(CFG.IG_TOKEN_ENC_KEY || '');
  if (!k || k.length < 32) return null;
  return k.subarray(0, 32);
}

export function encryptText(plain) {
  const key = getKey();
  if (!key) throw new Error('IG_TOKEN_ENC_KEY_missing');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plain || ''), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decryptText(enc) {
  const key = getKey();
  if (!key) throw new Error('IG_TOKEN_ENC_KEY_missing');
  const s = String(enc || '');
  const m = s.match(/^v1:([^:]+):([^:]+):(.+)$/);
  if (!m) throw new Error('ciphertext_invalid');
  const iv = Buffer.from(m[1], 'base64');
  const tag = Buffer.from(m[2], 'base64');
  const ct = Buffer.from(m[3], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}
