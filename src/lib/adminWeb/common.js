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

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
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
  return String(Math.floor(100000 + Math.random() * 900000));
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

export function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
