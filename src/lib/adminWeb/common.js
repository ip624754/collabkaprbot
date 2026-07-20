import crypto from 'node:crypto';
import { CFG } from '../config.js';

export function json(res, status, payload) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(JSON.stringify(payload));
}

export function html(res, status, markup) {
  res.status(status);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(markup);
}

export class RequestBodyTooLargeError extends Error {
  constructor(limitBytes) {
    super('request_body_too_large');
    this.name = 'RequestBodyTooLargeError';
    this.code = 'REQUEST_BODY_TOO_LARGE';
    this.statusCode = 413;
    this.limitBytes = Number(limitBytes || 0) || 0;
  }
}

function assertBodySizeWithinLimit(sizeBytes, limitBytes) {
  if (Number(sizeBytes || 0) > Number(limitBytes || 0)) {
    throw new RequestBodyTooLargeError(limitBytes);
  }
}

export async function readJsonBody(req, { maxBytes = CFG.ADMIN_WEB_JSON_BODY_MAX_BYTES } = {}) {
  const limitBytes = Math.max(1, Number(maxBytes || 0) || 64 * 1024);
  const contentLength = Number(req?.headers?.['content-length'] || 0) || 0;
  if (contentLength > 0) assertBodySizeWithinLimit(contentLength, limitBytes);

  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    const serialized = JSON.stringify(req.body);
    assertBodySizeWithinLimit(Buffer.byteLength(serialized, 'utf8'), limitBytes);
    return req.body;
  }

  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body, 'utf8');
    assertBodySizeWithinLimit(rawBody.length, limitBytes);
    const raw = rawBody.toString('utf8').trim();
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error('invalid_json');
    }
  }

  const chunks = [];
  let totalBytes = 0;
  for await (const rawChunk of req) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
    totalBytes += chunk.length;
    assertBodySizeWithinLimit(totalBytes, limitBytes);
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function isRequestBodyTooLargeError(error) {
  return error?.code === 'REQUEST_BODY_TOO_LARGE' || Number(error?.statusCode || 0) === 413;
}

export function parseCookies(req) {
  const header = String(req.headers?.cookie || '');
  const out = {};
  for (const pair of header.split(/;\s*/)) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(v || '');
  }
  return out;
}

export function setCookie(res, name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(String(value || ''))}`];
  parts.push(`Path=${opts.path || '/'}`);
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Number(opts.maxAge) || 0)}`);
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  if (opts.secure !== false) parts.push('Secure');
  parts.push(`SameSite=${opts.sameSite || 'Strict'}`);
  if (opts.expires instanceof Date) parts.push(`Expires=${opts.expires.toUTCString()}`);
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearCookie(res, name) {
  setCookie(res, name, '', { maxAge: 0, expires: new Date(0) });
}

export function nowIso() {
  return new Date().toISOString();
}

export function sha256(input) {
  return crypto.createHash('sha256').update(String(input || '')).digest('hex');
}

export function hmacSha256(secret, payload) {
  return crypto.createHmac('sha256', String(secret || '')).update(String(payload || '')).digest('hex');
}

export function randomId(size = 24) {
  return crypto.randomBytes(size).toString('hex');
}

export function randomCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function timingSafeEq(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (aa.length !== bb.length) return false;
  try {
    return crypto.timingSafeEqual(aa, bb);
  } catch {
    return false;
  }
}

export function getClientIp(req) {
  const hdr = req.headers || {};
  const direct = hdr['x-forwarded-for'] || hdr['x-real-ip'] || req.socket?.remoteAddress || '';
  return String(Array.isArray(direct) ? direct[0] : direct).split(',')[0].trim();
}

export function shortUa(req) {
  const ua = String(req.headers?.['user-agent'] || '');
  return ua.slice(0, 180);
}

export function getAdminWebBaseUrl() {
  return String(CFG.PUBLIC_BASE_URL || '').replace(/\/$/, '');
}


export function getRequestUrl(req) {
  const host = String(req?.headers?.host || 'localhost');
  const proto = String(req?.headers?.['x-forwarded-proto'] || 'https');
  const raw = String(req?.url || '/');
  return new URL(raw, `${proto}://${host}`);
}

export function getSearchParam(req, key, fallback = '') {
  try {
    const value = getRequestUrl(req).searchParams.get(String(key || ''));
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

export function hasSearchParam(req, key) {
  try {
    return getRequestUrl(req).searchParams.has(String(key || ''));
  } catch {
    return false;
  }
}

export function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
