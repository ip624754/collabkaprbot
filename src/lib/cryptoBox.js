import crypto from 'crypto';
import { CFG } from './config.js';

function getKey() {
  const k = CFG.IG_TOKEN_ENC_KEY_BYTES;
  if (!k || k.length < 32) return null;
  return k.subarray(0, 32);
}

export function encryptText(plain) {
  const key = getKey();
  if (!key) throw new Error('IG_TOKEN_ENC_KEY_invalid');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plain || ''), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decryptText(enc) {
  const key = getKey();
  if (!key) throw new Error('IG_TOKEN_ENC_KEY_invalid');
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
