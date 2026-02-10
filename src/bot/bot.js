import { Bot, InlineKeyboard } from 'grammy';
import { CFG, assertEnv } from '../lib/config.js';
import logger from '../lib/logger.js';
import { redis, k, rateLimit, consumeOnce } from '../lib/redis.js';
import * as db from '../db/queries.js';
import { pool } from '../db/pool.js';
import { escapeHtml, fmtTs, parseCb, parseStartPayload, randomToken, addMinutes, parseMoscowDateTime, computeThreadReplyStatus, formatBxChargeLine } from './helpers.js';
import { parseSponsorsFromText, sponsorToChatId } from './sponsorParse.js';
import { setExpectText, getExpectText, clearExpectText, setDraft, getDraft, clearDraft } from './draft.js';
import { renderGwAccess } from './gwAccess.js';
import { makeSeed, makeXorShift32, sampleWithoutReplacement } from './prng.js';
import { notifyGiveawayEnded, notifyGiveawayWinnersReady } from './gwNotify.js';
import { createLoggingMiddleware } from './middleware/logging.js';
import { dispatchCallback } from './routes/callbacks.js';

let BOT;

// Brand Pass: brands pay credits for first contact (opening a new inbox thread)
// Contacts reveal on public vitrina is also gated by Brand Pass credits.
// Semantics: spend CONTACT_UNLOCK_COST credits to reveal contacts for a workspace; cached for CONTACT_UNLOCK_TTL_DAYS days (per brand user).
// Optional env overrides (Vercel → Project Settings → Environment Variables):
// - CONTACT_UNLOCK_COST (default: 1)
// - CONTACT_UNLOCK_TTL_DAYS (default: 30)
function envInt(name, def, opts = {}) {
  const raw = process?.env?.[name];
  if (raw === undefined || raw === null || raw === '') return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  let v = Math.trunc(n);
  if (opts.min !== undefined && v < opts.min) v = opts.min;
  if (opts.max !== undefined && v > opts.max) v = opts.max;
  return v;
}

const CONTACT_UNLOCK_COST = envInt('CONTACT_UNLOCK_COST', 1, { min: 0, max: 10 });
const CONTACT_UNLOCK_TTL_DAYS = envInt('CONTACT_UNLOCK_TTL_DAYS', 30, { min: 1, max: 365 });
const CONTACT_UNLOCK_TTL_SEC = CONTACT_UNLOCK_TTL_DAYS * 24 * 60 * 60;

function fmtCredits(n) {
  const x = Number(n || 0);
  return `${x} ${ruPlural(x, 'кредит', 'кредита', 'кредитов')}`;
}

function fmtDays(n) {
  const x = Number(n || 0);
  return `${x} ${ruPlural(x, 'день', 'дня', 'дней')}`;
}

function brandPassBalanceLineHtml(credits) {
  const x = Number(credits || 0);
  return `🎫 Brand Pass (кредиты): <b>${escapeHtml(fmtCredits(x))}</b>`;
}

function brandPassContactsNeedLineHtml(credits) {
  const have = Number(credits || 0);
  const need = Number(CONTACT_UNLOCK_COST || 0);
  if (!Number.isFinite(need) || need <= 0) return '';
  if (have >= need) return '';
  return `⚠️ Для ${contactUnlockBtnLabel()} нужно <b>${need}</b> ${ruPlural(need,'кредит','кредита','кредитов')}, у тебя <b>${have}</b>.`;
}

function contactUnlockBtnLabel() {
  const c = Number(CONTACT_UNLOCK_COST || 0);
  if (!Number.isFinite(c) || c <= 0) return '🔓 Контакты';
  return `🔓 Контакты (-${c})`;
}

function contactUnlockActionLabel() {
  const c = Number(CONTACT_UNLOCK_COST || 0);
  if (!Number.isFinite(c) || c <= 0) return '🔓 Показать контакты';
  return `🔓 Показать контакты (-${c})`;
}

function contactUnlockExplainLine() {
  const c = Number(CONTACT_UNLOCK_COST || 0);
  const costPart = (!Number.isFinite(c) || c <= 0)
    ? '0 кредитов (бесплатно)'
    : `${c} ${ruPlural(c, 'кредит', 'кредита', 'кредитов')}`;
  return `${costPart} → доступ на ${fmtDays(CONTACT_UNLOCK_TTL_DAYS)}`;
}

function contactsLockedHintHtml(hasCredits, bal = null) {
  const balLine = (bal === null || bal === undefined) ? '' : `
Баланс: <b>${escapeHtml(String(bal))}</b>`;
  if (hasCredits) {
    return `🔒 <b>Контакты скрыты</b>
Открой через «${contactUnlockBtnLabel()}» (${contactUnlockExplainLine()}).${balLine}`;
  }
  return `🔒 <b>Контакты скрыты</b>
Нужен <b>Brand Pass</b> (кредиты Stars). Купи и открой через «${contactUnlockBtnLabel()}» (${contactUnlockExplainLine()}).${balLine}`;
}

const BRAND_PACKS = [
  { id: 'S', credits: 10, stars: 199, title: 'Brand Pass S' },
  { id: 'M', credits: 30, stars: 499, title: 'Brand Pass M' },
  { id: 'L', credits: 100, stars: 1299, title: 'Brand Pass L' }
];

function getBrandPack(packId) {
  return BRAND_PACKS.find(p => p.id === String(packId)) || null;
}

// Brand tools subscriptions (Brand Plan)
const BRAND_PLANS = [
  { id: 'basic', title: 'Brand Plan Basic', stars: CFG.BRAND_PLAN_BASIC_PRICE },
  { id: 'max', title: 'Brand Plan Max', stars: CFG.BRAND_PLAN_MAX_PRICE }
];

const MATCH_TIERS = [
  { id: 'S', title: 'Match S', stars: CFG.MATCH_S_PRICE, count: CFG.MATCH_S_COUNT },
  { id: 'M', title: 'Match M', stars: CFG.MATCH_M_PRICE, count: CFG.MATCH_M_COUNT },
  { id: 'L', title: 'Match L', stars: CFG.MATCH_L_PRICE, count: CFG.MATCH_L_COUNT }
];

const FEATURED_DURATIONS = [
  { id: '1d', days: 1, title: '24ч', stars: CFG.FEATURED_1D_PRICE },
  { id: '7d', days: 7, title: '7 дней', stars: CFG.FEATURED_7D_PRICE },
  { id: '30d', days: 30, title: '30 дней', stars: CFG.FEATURED_30D_PRICE }
];
const OFFICIAL_DURATIONS = [
  { id: "1d", days: 1, label: "24ч", price: CFG.OFFICIAL_1D_PRICE },
  { id: "7d", days: 7, label: "7 дней", price: CFG.OFFICIAL_7D_PRICE },
  { id: "30d", days: 30, label: "30 дней", price: CFG.OFFICIAL_30D_PRICE }
];


const CRM_STAGES = [
  { id: 'new', title: '🆕 New' },
  { id: 'talk', title: '💬 Talk' },
  { id: 'deal', title: '🤝 Deal' },
  { id: 'paid', title: '💳 Paid' },
  { id: 'done', title: '✅ Done' }
];

function isSuperAdminTg(tgId) {
  return CFG.SUPER_ADMIN_TG_IDS.includes(Number(tgId));
}

function fmtWait(sec) {
  const s = Math.max(0, Number(sec || 0));
  if (!Number.isFinite(s) || s <= 0) return 'несколько секунд';
  if (s < 60) return `${Math.ceil(s)} сек.`;
  if (s < 3600) return `${Math.ceil(s / 60)} мин.`;
  return `${Math.ceil(s / 3600)} ч.`;
}

// Small numeric helper (used in callback parsing)
function num(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

// Unique string array (trim + dedupe, preserves order)
function uniqStrArr(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  const seen = new Set();
  for (const x of arr) {
    const s = String(x ?? '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

// Brand-facing: sanitize creator display name (no @, no t.me links) to prevent contact leaks
function safeCreatorDisplayName(ws) {
  const title = String(ws?.title || '').trim();
  const unameRaw = String(ws?.username || ws?.channel_username || '').trim();
  const uname = unameRaw.replace(/^@/, '');
  // prefer title, fallback to username, then generic
  let base = (title || uname || 'Креатор');
  // strip t.me links and @ mentions
  base = base.replace(/https?:\/\/t\.me\/[A-Za-z0-9_]+/gi, '');
  base = base.replace(/@/g, '');
  base = base.replace(/\s+/g, ' ').trim();
  if (base.length > 80) base = base.slice(0, 80).trim();
  return base || 'Креатор';
}

// Sponsors helpers (Jobs-style clarity)
function normalizeSponsorsList(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!item) continue;
    if (typeof item === 'string') {
      const s = item.trim();
      if (s) out.push(s);
      continue;
    }
    if (typeof item === 'object') {
      const s = String(item.sponsor_text ?? item.sponsorText ?? item.sponsor ?? item.text ?? item.handle ?? item.username ?? '').trim();
      if (s) out.push(s);
      continue;
    }
    const s = String(item).trim();
    if (s) out.push(s);
  }
  // unique preserve order
  return [...new Set(out)];
}

function fmtSponsorHandle(raw) {
  const item = raw && typeof raw === 'object'
    ? (raw.sponsor_text ?? raw.sponsorText ?? raw.sponsor ?? raw.text ?? raw.handle ?? raw.username)
    : raw;
  const handle = sponsorToChatId(item);
  return handle || String(item || '').trim();
}

function sponsorUrlFromHandle(handle) {
  const h = String(handle || '').trim();
  if (!h) return null;
  if (h.startsWith('@') && h.length > 1) return `https://t.me/${h.slice(1)}`;
  if (/^https?:\/\//i.test(h)) return h;
  return null;
}

function sponsorsInlineText(rawSponsors, max = 3) {
  const handles = normalizeSponsorsList(rawSponsors).map(fmtSponsorHandle).filter(Boolean);
  if (!handles.length) return '';
  const shown = handles.slice(0, max);
  const rest = handles.length - shown.length;
  const inline = shown.join(', ');
  return rest > 0 ? `${inline} +${rest}` : inline;
}

function ruPlural(n, one, few, many) {
  const x = Math.abs(Number(n) || 0);
  const mod10 = x % 10;
  const mod100 = x % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return few;
  return many;
}

function sponsorsBulletText(rawSponsors, max = 5) {
  const handles = normalizeSponsorsList(rawSponsors).map(fmtSponsorHandle).filter(Boolean);
  if (!handles.length) return '';
  const shown = handles.slice(0, max);
  const rest = handles.length - shown.length;
  const bullets = shown.map((h) => `• ${escapeHtml(h)}`).join(' ');
  return rest > 0 ? `${bullets} +${rest}` : bullets;
}

function sponsorsCountText(rawSponsors) {
  const handles = normalizeSponsorsList(rawSponsors).map(fmtSponsorHandle).filter(Boolean);
  const n = handles.length;
  if (!n) return '';
  const word = ruPlural(n, 'канал', 'канала', 'каналов');
  return `подписка на <b>${n}</b> ${word}`;
}

function sponsorStateIcon(state) {
  if (state === 'ok') return '✅';
  if (state === 'no') return '❌';
  if (state === 'unknown') return '⚠️';
  return '⚪';
}

// Giveaway winners formatting (Jobs-style: compact for small, truncated for big)
const GW_WINNERS_ONE_LINE_MAX = 3;
const GW_WINNERS_MAX_LINES = 10;

function fmtGwWinnerName(w) {
  const uname = w && w.username ? '@' + escapeHtml(String(w.username)) : null;
  if (uname) return uname;
  const id = w && (w.tg_id ?? w.tgId ?? w.user_id ?? w.userId);
  return `id:${Number(id || 0)}`;
}

/**
 * Formats winners list for channel text.
 * - If total winners <= oneLineMax: returns a single line "1) @a · 2) @b"
 * - Else returns multiline "1. @a\n2. @b" (truncated to maxLines) + "... +N ещё (см. в боте)"
 */
function formatGwWinners(winners, { oneLineMax = GW_WINNERS_ONE_LINE_MAX, maxLines = GW_WINNERS_MAX_LINES } = {}) {
  const items = (Array.isArray(winners) ? winners : []).map(w => ({
    place: Number(w.place || 0) || 0,
    name: fmtGwWinnerName(w),
  }));

  const total = items.length;
  if (!total) return { mode: 'none', text: '', total: 0, truncated: false, shown: 0 };

  // Ensure stable order by place if present
  items.sort((a, b) => (a.place || 0) - (b.place || 0));

  if (total <= oneLineMax) {
    const line = items.map(i => `${i.place || ''}`.trim()
      ? `${i.place}) ${i.name}`
      : i.name
    ).join(' · ');
    return { mode: 'one', text: line, total, truncated: false, shown: total };
  }

  const cap = Number.isFinite(maxLines) && maxLines > 0 ? Math.trunc(maxLines) : GW_WINNERS_MAX_LINES;
  const shownItems = items.slice(0, cap);
  const rest = total - shownItems.length;

  let body = shownItems.map(i => `${i.place || ''}`.trim()
    ? `${i.place}. ${i.name}`
    : i.name
  ).join('\n');

  if (rest > 0) {
    body += `\n… +${rest} ещё (см. в боте)`;
  }
  return { mode: 'lines', text: body, total, truncated: rest > 0, shown: shownItems.length };
}

// Giveaway winners formatting for owner-card (same pin-format + truncation, but with user links when no @username)
function fmtGwWinnerNameOwner(w) {
  const uname = w && w.username ? '@' + escapeHtml(String(w.username)) : null;
  if (uname) return uname;
  const id = w && (w.tg_id ?? w.tgId ?? w.user_id ?? w.userId);
  const uid = Number(id || 0);
  if (uid > 0) return `<a href="tg://user?id=${uid}">участник</a>`;
  return 'участник';
}

function formatGwWinnersOwner(winners, { oneLineMax = GW_WINNERS_ONE_LINE_MAX, maxLines = GW_WINNERS_MAX_LINES } = {}) {
  const items = (Array.isArray(winners) ? winners : []).map(w => ({
    place: Number(w.place || 0) || 0,
    name: fmtGwWinnerNameOwner(w),
  }));

  const total = items.length;
  if (!total) return { mode: 'none', text: '', total: 0, truncated: false, shown: 0 };

  // Ensure stable order by place if present
  items.sort((a, b) => (a.place || 0) - (b.place || 0));

  if (total <= oneLineMax) {
    const line = items.map(i => `${i.place || ''}`.trim()
      ? `${i.place}) ${i.name}`
      : i.name
    ).join(' · ');
    return { mode: 'one', text: line, total, truncated: false, shown: total };
  }

  const cap = Number.isFinite(maxLines) && maxLines > 0 ? Math.trunc(maxLines) : GW_WINNERS_MAX_LINES;
  const shownItems = items.slice(0, cap);
  const rest = total - shownItems.length;

  let body = shownItems.map(i => `${i.place || ''}`.trim()
    ? `${i.place}. ${i.name}`
    : i.name
  ).join('\n');

  if (rest > 0) {
    body += `\n… +${rest} ещё (см. в боте)`;
  }
  return { mode: 'lines', text: body, total, truncated: rest > 0, shown: shownItems.length };
}



// Runtime toggles (stored in Redis, editable from Admin)
const SYS_KEYS = {
  pay_accept: k(['sys', 'pay_accept']),
  pay_auto_apply: k(['sys', 'pay_auto_apply'])
};


// UI banners (optional): send banner image no more than once per N hours per slot per user
async function maybeSendBanner(ctx, slot, fileId) {
  try {
    const fid = String(fileId || '').trim();
    if (!fid) return;
    const uid = ctx?.from?.id ? Number(ctx.from.id) : 0;
    if (!uid) return;

    const hours = Number(CFG.BANNER_COOLDOWN_HOURS || 24);
    const ttlSec = (Number.isFinite(hours) && hours > 0 ? hours : 24) * 3600;

    const key = k(['ui_banner', slot || 'default', uid]);
    const seen = await redis.get(key);
    if (seen) return;

    await redis.set(key, '1', { ex: ttlSec });
    await ctx.replyWithPhoto(fid);
  } catch (_) {
    // ignore banner failures
  }
}

async function getSysBool(key, defaultValue = false) {
  try {
    const v = await redis.get(key);
    if (v === null || v === undefined) return Boolean(defaultValue);
    const s = String(v).toLowerCase();
    if (s === '1' || s === 'true' || s === 'on' || s === 'yes') return true;
    if (s === '0' || s === 'false' || s === 'off' || s === 'no') return false;
    return Boolean(defaultValue);
  } catch {
    return Boolean(defaultValue);
  }
}

async function setSysBool(key, value) {
  try {
    await redis.set(key, value ? '1' : '0');
    return true;
  } catch {
    return false;
  }
}

async function getPaymentsRuntimeFlags() {
  const accept = await getSysBool(SYS_KEYS.pay_accept, CFG.PAYMENTS_ACCEPT_DEFAULT);
  const autoApply = await getSysBool(SYS_KEYS.pay_auto_apply, CFG.PAYMENTS_AUTO_APPLY_DEFAULT);
  return { accept, autoApply };
}

// Backward-compatible alias (some flows call getPaymentMode)
async function getPaymentMode() {
  return getPaymentsRuntimeFlags();
}

async function sendStarsInvoice(ctx, { title, description, payload, amount, backCb }) {
  // Stars payments: currency XTR, prices must contain exactly one item.
  const chatId = ctx?.chat?.id;
  const userId = ctx?.from?.id;

  // Put the "cancel/help" hint into the invoice description to avoid sending a second message.
  // Keep it on a new paragraph to make Telegram UI readable.
  const fullDescription = `${description}

Если передумал — жми «📋 Меню».`;

  // Prices must contain exactly one item for Stars.
  // Telegram invoice UI shows it as: ⭐ <amount> <label>
  // Use a clean label to avoid "debug" look.
  const prices = [{ label: 'Stars', amount: Number(amount) }];

  try {
    // IMPORTANT: For sendInvoice, if reply_markup is present and non-empty,
    // the FIRST button MUST be a Pay button (otherwise Telegram returns REPLY_MARKUP_BUY_EMPTY).
    // We'll keep everything in ONE invoice message:
    //   row1: Pay
    //   row2: Back/Menu (regular callback buttons)
    const navRow = [];
    if (backCb && backCb !== 'a:menu' && backCb !== 'a:home') navRow.push({ text: '⬅️ Назад', callback_data: backCb });
    navRow.push({ text: '📋 Меню', callback_data: 'a:menu' });
    navRow.push({ text: '🏠 Home', callback_data: 'a:home' });

    const invoiceMarkup = {
      inline_keyboard: [
        [{ text: `⭐️ Оплатить ${Number(amount)}`, pay: true }],
        navRow,
      ],
    };

    // Stars: currency XTR, provider_token must be empty string
    await ctx.api.raw.sendInvoice({
      chat_id: chatId,
      title,
      description: fullDescription,
      payload,
      provider_token: '',
      currency: 'XTR',
      prices,
      reply_markup: invoiceMarkup,
    });

    return true;
  } catch (e) {
    const desc = String(e?.description || e?.error?.description || e?.message || e);
    console.error('[PAY] sendInvoice(stars) failed', {
      chat_id: chatId ?? null,
      from_id: userId ?? null,
      payload: String(payload || '').slice(0, 64),
      error: desc,
    });

    const isAdmin = isSuperAdminTg(userId);
    const text = isAdmin
      ? `❌ Не удалось отправить Stars-инвойс.
Причина: ${desc}

Проверь:
• Telegram клиент обновлён
• Тестируешь НЕ с аккаунта владельца бота
• Валидный Stars прайс (целое число Stars)
`
      : 'Не удалось отправить инвойс. Проверь, что Telegram обновлён и Stars доступны.';
    try {
      const kb = backCb ? navKb(backCb) : new InlineKeyboard().text('📋 Меню', 'a:menu');
      await ctx.reply(text, { reply_markup: kb });
    } catch {}
    return false;
  }
}

async function renderGwNewWorkspacePicker(ctx, ownerUserId, backCb = 'a:gw_list') {
  const wss = await db.listWorkspaces(ownerUserId);
  const kb = new InlineKeyboard();
  if (!wss.length) {
    kb.text('📋 Меню', 'a:menu');
    await safeEditOrReply(ctx, 'Сначала подключи канал: нажми «🚀 Подключить канал» в меню.', { reply_markup: kb });
    return;
  }

  for (const ws of wss) {
    const label = `📣 ${String(ws.title || ws.channel_username || ws.id).slice(0, 32)}`;
    kb.text(label, `a:gw_new|ws:${ws.id}`).row();
  }
  kbNavRow(kb, backCb);

  await safeEditOrReply(ctx, 
    `Выбери канал, где создать новый конкурс:`,
    { reply_markup: kb }
  );
}


async function getRoleFlags(userRow, tgId) {
  const isAdmin = isSuperAdminTg(tgId);
  const isModerator = isAdmin || (userRow ? await db.isNetworkModerator(userRow.id) : false);
  const isFolderEditor = userRow ? await db.hasAnyWorkspaceEditorRole(userRow.id) : false;
  const isCurator = userRow ? await db.hasAnyCuratorRole(userRow.id) : false;
  return { isAdmin, isModerator, isFolderEditor, isCurator };
}

async function isModerator(userRow, tgId) {
  return isSuperAdminTg(tgId) || (userRow ? await db.isNetworkModerator(userRow.id) : false);
}

function isMissingRelationError(err, relation) {
  if (!err) return false;
  if (err.code === '42P01') {
    return relation ? String(err.message || '').includes(relation) : true;
  }
  const msg = String(err.message || '');
  if (!msg) return false;
  if (relation) return msg.includes('does not exist') && msg.includes(relation);
  return msg.includes('does not exist');
}

async function safeUserVerifications(primaryFn, fallbackFn) {
  try {
    return await primaryFn();
  } catch (e) {
    if (isMissingRelationError(e, 'user_verifications')) {
      return await fallbackFn();
    }
    throw e;
  }
}


function stripHtmlTags(text) {
  return String(text || "").replace(/<\/?[^>]+>/g, "");
}

function describeTgSendError(e) {
  const raw = String((e && (e.description || e.message)) || e || "");
  const msg = raw.toLowerCase();
  if (msg.includes("bot was blocked")) return "креатор заблокировал бота";
  if (msg.includes("chat not found")) return "креатор ещё не нажал /start в этом боте";
  if (msg.includes("user is deactivated")) return "аккаунт пользователя деактивирован";
  if (msg.includes("too many requests")) return "лимит Telegram (слишком часто)";
  if (msg.includes("can't parse entities")) return "ошибка форматирования сообщения (HTML)";
  if (msg.includes("button_data_invalid")) return "ошибка кнопок (callback_data)";
  if (msg.includes("message is too long")) return "сообщение слишком длинное";
  if (msg.includes("forbidden")) return "Telegram запретил отправку (403)";
  return raw.length > 120 ? raw.slice(0, 120) + "…" : raw;
}

function apiFromCtx(ctx) {
  // Prefer ctx.api; fallback to BOT.api (initialized in getBot).
  try { if (ctx && ctx.api) return ctx.api; } catch {}
  try { if (BOT && BOT.api) return BOT.api; } catch {}
  return null;
}

async function sendMessageWithFallback(api, chatId, text, options = {}) {
  if (!api || typeof api.sendMessage !== 'function') {
    return { ok: false, err: new Error('BOT_API_NOT_READY') };
  }

  const base = { disable_web_page_preview: true, ...options };

  // Goal: keep reply_markup whenever possible.
  // Telegram errors are often either: HTML parse issues OR keyboard/callback issues.
  // We first try "full" (HTML + KB). If it fails, we retry with plain text but KEEP KB.
  // Only if that also fails we drop KB.
  const plain = stripHtmlTags(text);

  try {
    await api.sendMessage(chatId, text, base);
    return { ok: true, mode: 'full' };
  } catch (e1) {
    // 2nd try: plain text, keep KB (reply_markup)
    const o2 = { ...base };
    delete o2.parse_mode;
    try {
      await api.sendMessage(chatId, plain, o2);
      return { ok: true, mode: 'plain_kb', warn: e1 };
    } catch (e2) {
      // 3rd try: drop KB, keep HTML
      const o3 = { ...base };
      delete o3.reply_markup;
      try {
        await api.sendMessage(chatId, text, o3);
        return { ok: true, mode: 'no_kb', warn: e2 };
      } catch (e3) {
        // 4th try: plain text, no KB
        const o4 = { ...o3 };
        delete o4.parse_mode;
        try {
          await api.sendMessage(chatId, plain, o4);
          return { ok: true, mode: 'plain', warn: e3 };
        } catch (e4) {
          return { ok: false, err: e4, first: e1, second: e2, third: e3 };
        }
      }
    }
  }
}

function notifyReplyKb({ openCb, replyCb, replyLabel = '💬 Ответить' }) {
  const kb = new InlineKeyboard();
  if (openCb && replyCb) {
    kb.text('📨 Открыть заявку', openCb).text(replyLabel, replyCb).row();
  } else if (openCb) {
    kb.text('📨 Открыть заявку', openCb).row();
  } else if (replyCb) {
    kb.text(replyLabel, replyCb).row();
  }
  kb.row().text('🗑 Убрать', 'a:nd');
  kb.row().text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');
  return kb;
}







async function safeBrandProfiles(primaryFn, fallbackFn) {
  try {
    return await primaryFn();
  } catch (e) {
    if (isMissingRelationError(e, 'brand_profiles')) {
      return await fallbackFn();
    }
    throw e;
  }
}

async function safeBrandApplications(primaryFn, fallbackFn) {
  try {
    return await primaryFn();
  } catch (e) {
    if (isMissingRelationError(e, 'brand_applications')) {
      return await fallbackFn();
    }
    throw e;
  }
}


// Non-fatal write wrappers: keep UX responsive even if DB write fails (we still log).
function errInfo(e) {
  const x = (e && e.error) ? e.error : e;
  return {
    name: String(x && x.name ? x.name : "Error"),
    message: String((x && (x.message || x.description)) ? (x.message || x.description) : (x || "")),
    code: (x && Object.prototype.hasOwnProperty.call(x, "code")) ? x.code : null,
    detail: (x && Object.prototype.hasOwnProperty.call(x, "detail")) ? x.detail : null
  };
}

function withTimeout(promise, ms, label = 'op') {
  const t = Math.max(1, Number(ms) || 1);
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => {
      const e = new Error(`TIMEOUT:${label}`);
      e.code = 'TIMEOUT';
      reject(e);
    }, t);
    Promise.resolve(promise)
      .then(v => { clearTimeout(id); resolve(v); })
      .catch(err => { clearTimeout(id); reject(err); });
  });
}

async function redisGetSafe(key, ms = 1500) {
  try {
    return await withTimeout(redis.get(key), ms, `redis.get:${String(key).slice(0, 40)}`);
  } catch {
    return null;
  }
}

async function redisSetSafe(key, value, opts = undefined, ms = 1500) {
  try {
    const p = (opts === undefined) ? redis.set(key, value) : redis.set(key, value, opts);
    return await withTimeout(p, ms, `redis.set:${String(key).slice(0, 40)}`);
  } catch {
    return null;
  }
}

// HOME HUB onboarding hint (text banner): show no more than once per N hours per user.
function homeHubHintKey(uid) {
  return k(['ui_hint', 'home_hub', Number(uid || 0)]);
}

function homeHubHintTtlSec() {
  const hours = Number(process.env.HOME_HUB_HINT_HOURS || 24);
  const h = (Number.isFinite(hours) && hours > 0) ? hours : 24;
  return Math.trunc(h * 3600);
}

async function shouldShowHomeHubHint(uid) {
  const key = homeHubHintKey(uid);
  const seen = await redisGetSafe(key, 1500);
  return !seen;
}

async function markHomeHubHintSeen(uid) {
  const key = homeHubHintKey(uid);
  const ttlSec = homeHubHintTtlSec();
  await redisSetSafe(key, '1', { ex: ttlSec }, 1500);
}

// --- P0 HANG diagnostics (Woz): step logging + per-await timeouts ---
const P0_AWAIT_TIMEOUT_MS = Number(process.env.P0_AWAIT_TIMEOUT_MS || 8000);

function p0StepLog(ctx, stepId, phase, meta = {}) {
  try {
    const cid = ctx?.state?.cid || null;
    const payload = { phase, stepId: String(stepId || ''), cid, ...meta };
    console.warn('[P0]', payload);
  } catch {}
}

async function p0Await(ctx, stepId, label, fnOrPromise, ms = P0_AWAIT_TIMEOUT_MS) {
  const timeoutMs = Math.max(1, Number(ms) || P0_AWAIT_TIMEOUT_MS);
  const lbl = String(label || 'op');
  p0StepLog(ctx, stepId, 'BEFORE', { label: lbl, timeoutMs });
  try {
    const p = (typeof fnOrPromise === 'function') ? fnOrPromise() : fnOrPromise;
    const v = await withTimeout(p, timeoutMs, lbl);
    p0StepLog(ctx, stepId, 'AFTER', { label: lbl });
    return v;
  } catch (e) {
    const info = errInfo(e);
    const isTimeout = String(info.code || '') === 'TIMEOUT' || String(info.message || '').startsWith('TIMEOUT:');
    p0StepLog(ctx, stepId, isTimeout ? 'TIMEOUT' : 'ERROR', { label: lbl, timeoutMs, err: info });
    try { e.stepId = stepId; e.label = lbl; } catch {}
    throw e;
  }
}



async function safeBrandAppsWrite(primaryFn, meta = {}) {
  try {
    return await primaryFn();
  } catch (e) {
    try {
      console.warn("[brand_apps_write] failed", { ...meta, err: errInfo(e) });
    } catch {}
    return null;
  }
}

async function safeLeadWrite(primaryFn, meta = {}) {
  try {
    return await primaryFn();
  } catch (e) {
    try {
      console.warn("[lead_write] failed", { ...meta, err: errInfo(e) });
    } catch {}
    return null;
  }
}


function mainMenuKb(flags = {}) {
  const { isModerator = false, isAdmin = false, isFolderEditor = false, isCurator = false } = flags;

  const kb = new InlineKeyboard()
    .text('🚀 Подключить канал', 'a:setup')
    .text('📣 Мои каналы', 'a:ws_list')
    .row()
    .text('⭐️ PRO', 'a:pro_home')
    .row()
    .text('🎁 Розыгрыши', 'a:gw_list')
    .text('🎬 UGC / Офферы', 'a:bx_home')
    .row();

  if (isFolderEditor) {
    kb.text('📁 Папки', 'a:folders_my').text('🏷 Для брендов', 'a:bx_open|ws:0').row();
  } else {
    kb.text('🏷 Для брендов', 'a:bx_open|ws:0').row();
  }

  if (CFG.OFFICIAL_CHANNEL_USERNAME) {
    const uname = String(CFG.OFFICIAL_CHANNEL_USERNAME || '').replace(/^@/, '').trim();
    if (uname) kb.url('📢 Официальный канал', `https://t.me/${uname}`).row();
  }

  kb.text('🧭 Быстрый старт', 'a:guide').text('💬 Поддержка', 'a:support').row();
  kb.text('🔄 Обновить', 'a:main_menu').row();

  const extra = [];
  if (CFG.VERIFICATION_ENABLED) extra.push(['✅ Верификация', 'a:verify_home']);
  if (isCurator) extra.push(['🧹 Кураторы блогера', 'a:cur_home']);
  if (isModerator) extra.push(['🛡 Модерация', 'a:mod_home']);
  if (isAdmin) extra.push(['👑 Админка', 'a:admin_home']);

  for (let i = 0; i < extra.length; i += 2) {
    const a = extra[i];
    const b = extra[i + 1];
    kb.text(a[0], a[1]);
    if (b) kb.text(b[0], b[1]);
    kb.row();
  }

  kb.row().text('🏠 Home', 'a:home');

  return kb;
}


function mainMenuCreatorKb(flags = {}, opts = {}) {
  const { isModerator = false, isAdmin = false, isFolderEditor = false, isCurator = false } = flags;

  // Layout: пары там, где чаще жмут подряд; одиночные — для режимов/ролей.
  const kb = new InlineKeyboard()
    .text('🚀 Подключить канал', 'a:setup')
    .text('📣 Мои каналы', 'a:ws_list')
    .row();

  // Role shortcuts (single-row)
  if (isCurator) kb.text('🧹 Кабинет куратора', 'a:cur_home').row();
  if (CFG.VERIFICATION_ENABLED) kb.text('✅ Верификация', 'a:verify_home').row();

  kb
    .text('🎬 UGC / Офферы', 'a:bx_home')
    .text('🏷 Бренды', 'a:brands_home|p:0')
    .row()
    .text('⭐️ PRO', 'a:pro_home')
    .text('🎁 Розыгрыши', 'a:gw_list')
    .row();

  if (isFolderEditor) kb.text('📁 Папки', 'a:folders_my').row();

  kb
    .text('🧭 Быстрый старт', 'a:guide')
    .text('💬 Поддержка', 'a:support')
    .row();

  if (opts.canManager) {
    kb
      .text('🏷 Я бренд', 'a:ui_mode_set|m:brand|ret:menu')
      .text('🧑‍💼 Кабинет менеджера', 'a:bm_home')
      .row();
  } else {
    kb.text('🏷 Я бренд', 'a:ui_mode_set|m:brand|ret:menu').row();
  }

  // Staff shortcuts
  const extra = [];
  if (isModerator) extra.push(['🛡 Модерация', 'a:mod_home']);
  if (isAdmin) extra.push(['👑 Админка', 'a:admin_home']);

  for (let i = 0; i < extra.length; i += 2) {
    const a = extra[i];
    const b = extra[i + 1];
    kb.text(a[0], a[1]);
    if (b) kb.text(b[0], b[1]);
    kb.row();
  }

  kb.row().text('🏠 Home', 'a:home');

  return kb;
}

function mainMenuBrandKb(flags = {}, opts = {}) {
  const { isModerator = false, isAdmin = false, isCurator = false } = flags;
  const { isManager = false, hasMultipleBrands = false, canManager = false, teamLocked = false } = opts;

  const kb = new InlineKeyboard()
  .text('📰 Лента креаторов', 'a:bx_feed|ws:0|p:0|h:mm')
  .text('🎛 Фильтры креаторов', 'a:bx_filters|ws:0|p:0|h:mm|r:mm')
  .row()
  .text('🎯 Smart-подбор', 'a:bx_smart|ws:0|h:mm')
  .text('🔎 Поиск креаторов', 'a:pm_home|ws:0')
  .row()
  .text('📥 Inbox', 'a:bx_inbox|ws:0|p:0|h:mm')
  .text('📝 Заявки', 'a:brand_apps|ws:0|s:new|p:0')
  .row()
  .text('📌 Сделки', 'a:brand_deals|ws:0|st:negotiation|p:0');

  if (!isManager) {
    kb.text('🎫 Brand Pass', 'a:brand_pass|ws:0')
      .row()
      .text('🏷 Профиль бренда', 'a:brand_profile|ws:0|ret:brand')
      .text('⭐️ Подписка', 'a:brand_plan|ws:0')
      .row()
      .text(teamLocked ? '👔 Менеджеры бренда 🔒' : '👔 Менеджеры бренда', 'a:brand_team|ws:0');
  } else {
    kb.text('ℹ️ Права менеджера', 'a:bm_help')
      .row();
    if (hasMultipleBrands) {
      kb.text('🔁 Сменить бренд', 'a:bm_pick_brand|ret:menu')
        .row();
    }
    kb.text('🔓 Режим владельца', 'a:bm_mode_set|v:0|ret:menu');
  }

  kb.row()
    .text('🧭 Быстрый старт', 'a:guide')
    .text('💬 Поддержка', 'a:support')
    .row()
    .text('✨ Я Creator / канал', 'a:ui_mode_set|m:creator|ret:menu');

  const extra = [];
  if (CFG.VERIFICATION_ENABLED) extra.push(['✅ Верификация', 'a:verify_home']);
  if (isCurator) extra.push(['🧹 Кураторы блогера', 'a:cur_home']);
  if (isModerator) extra.push(['🛡 Модерация', 'a:mod_home']);
  if (isAdmin) extra.push(['👑 Админка', 'a:admin_home']);

  for (let i = 0; i < extra.length; i += 2) {
    const a = extra[i];
    const b = extra[i + 1];
    kb.row().text(a[0], a[1]);
    if (b) kb.text(b[0], b[1]);
  }

  
  if (!isManager && canManager) {
    kb.row().text('🧑‍💼 Режим менеджера', 'a:bm_mode_set|v:1|ret:menu');
  }

  kb.row().text('🏠 Home', 'a:home');

  return kb;
}

function bmModeKey(tgId) {
  return k(['bm_mode', Number(tgId || 0)]);
}
function bmActiveBrandKey(tgId) {
  return k(['bm_active_brand', Number(tgId || 0)]);
}
async function getBrandManagerMode(tgId) {
  const v = await redis.get(bmModeKey(tgId));
  return v === '1' || v === 1 || v === true;
}
async function setBrandManagerMode(tgId, enabled) {
  if (enabled) await redis.set(bmModeKey(tgId), '1');
  else await redis.del(bmModeKey(tgId));
}
async function getBmActiveBrand(tgId) {
  const v = await redis.get(bmActiveBrandKey(tgId));
  const n = Number(v || 0);
  return n || 0;
}
async function setBmActiveBrand(tgId, brandUserId) {
  const n = Number(brandUserId || 0);
  if (!n) return;
  await redis.set(bmActiveBrandKey(tgId), String(n));
}


function bmBrandLabelFromRow(row) {
  const id = Number(row?.user_id || 0);
  const name = row?.brand_name ? String(row.brand_name).trim() : '';
  const uname = row?.tg_username ? String(row.tg_username).trim() : '';
  if (name) return name;
  if (uname) return `@${uname}`;
  if (id) return `Бренд #${id}`;
  return 'Бренд';
}

async function clearBmActiveBrand(tgId) {
  await redis.del(bmActiveBrandKey(tgId));
}

async function disableBrandManagerState(tgId) {
  await setBrandManagerMode(tgId, false);
  await clearBmActiveBrand(tgId);
}

async function renderBmPickBrand(ctx, u, params = {}) {
  const edit = params.edit !== false;
  const ret = String(params.ret || 'menu');
  const wsId = Number(params.wsId || 0);
  const page = Number(params.page || 0);
  const h = normBxHome(params.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
  const r = normBxRet(params.r, wsId ? BX_HOME.BX_OPEN : h);

  const bm = await resolveBmBrandContext(ctx, u, { requirePickWhenMissingActive: true });

  if (bm.dbMissing) {
    const kb = new InlineKeyboard().text('📋 Меню', 'a:menu');
    const text = `⚠️ <b>Нужна миграция 026_brand_managers</b>

В Neon должна быть таблица <code>brand_managers</code>.`;
    if (edit) await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
    else await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
    return;
  }

  if (bm.revoked || !(bm.brands || []).length) {
    await disableBrandManagerState(ctx.from.id);
    const kb = new InlineKeyboard().text('📋 Меню', 'a:menu');
    const text = `⛔ <b>Доступ менеджера отозван</b>

Если это ошибка — попроси владельца бренда добавить тебя в «👔 Менеджеры бренда».`;
    if (edit) await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
    else await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
    return;
  }

  const brands = bm.brands || [];
  const active = await getBmActiveBrand(ctx.from.id);

  const kb = new InlineKeyboard();
  for (const b of brands) {
    const id = Number(b.user_id);
    const label = bmBrandLabelFromRow(b).slice(0, 32);
    const prefix = (id && id === Number(active)) ? '✅ ' : '';
    kb.text(`${prefix}${label}`, `a:bm_set_brand|bu:${id}|ret:${ret}|ws:${wsId}|p:${page}|h:${h}|r:${r}`).row();
  }

  const bxBack = bxReturnCb(wsId, page, h, r);

  const backCb = (
    ret === 'bx_inbox' ? `a:bx_inbox|ws:${wsId}|p:${page}|h:${h}` :
    ret === 'bx_feed' ? `a:bx_feed|ws:${wsId}|p:${page}|h:${h}` :
    ret === 'bx_open' ? `a:bx_open|ws:${wsId}` :
    ret === 'bx_filters' ? bxBack :
    ret === 'bx_fpick' ? bxBack :
    ret === 'bx_mpick' ? bxBack :
    ret === 'pm_home' ? `a:pm_home|ws:${wsId}` :
    ret === 'brand_apps' ? `a:brand_apps|ws:0|s:new|p:${page}` :
    ret === 'brand_deals' ? `a:brand_deals|ws:0|st:negotiation|p:${page}` :
    'a:menu'
  );

  kbNavRow(kb, backCb);

  const text = `🧑‍💼 <b>Выбери бренд для работы</b>

Я запомню выбор и открою кабинет выбранного бренда.`;
  if (edit) await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
  else await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
}

async function bmResolveAssert(ctx, u, wsId, ret = 'menu', page = 0, opts = {}) {
  const wsNum = Number(wsId);
  if (!Number.isFinite(wsNum) || wsNum !== 0) return { bm: { enabled: false }, userId: u.id };

  const bm = await resolveBmBrandContext(ctx, u, { requirePickWhenMissingActive: true });

  if (bm.dbMissing) {
    const kb = new InlineKeyboard().text('📋 Меню', 'a:menu');
    const text = `⚠️ <b>Нужна миграция 026_brand_managers</b>

В Neon должна быть таблица <code>brand_managers</code>.`;
    await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
    return null;
  }

  if (bm.revoked) {
    await disableBrandManagerState(ctx.from.id);
    const kb = new InlineKeyboard().text('📋 Меню', 'a:menu');
    const text = `⛔ <b>Доступ менеджера отозван</b>

Если это ошибка — попроси владельца бренда добавить тебя в «👔 Менеджеры бренда».`;
    await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
    return null;
  }

  if (bm.enabled && bm.needsPick) {
    const h = normBxHome(opts.h, wsNum ? BX_HOME.BX_OPEN : BX_HOME.MENU);
    const r = normBxRet(opts.r, wsNum ? BX_HOME.BX_OPEN : h);
    await renderBmPickBrand(ctx, u, { ret, wsId: wsNum, page, edit: true, h, r });
    return null;
  }

  return { bm, userId: (bm.enabled ? bm.brandUserId : u.id) };
}

async function resolveBmBrandContext(ctx, u, opts = {}) {
  const tgId = Number(ctx.from?.id || 0);
  const enabled = await getBrandManagerMode(tgId);
  if (!enabled) return { enabled: false, brands: [] };

  let brands = [];
  try {
    brands = await db.listBrandsForManager(u.id);
  } catch (e) {
    if (isMissingRelationError(e, 'brand_managers')) {
      return { enabled: false, brands: [], dbMissing: true };
    }
    return { enabled: false, brands: [] };
  }

  if (!brands.length) {
    return { enabled: false, brands: [], revoked: true };
  }

  const requirePickWhenMissingActive = !!opts.requirePickWhenMissingActive;
  const hasMultiple = brands.length > 1;

  let active = await getBmActiveBrand(tgId);
  const has = (id) => brands.some((b) => Number(b.user_id) === Number(id));

  if (!active || !has(active)) {
    if (hasMultiple && requirePickWhenMissingActive) {
      return { enabled: true, brands, needsPick: true, brandUserId: 0, brandLabel: '' };
    }
    active = Number(brands[0].user_id);
    await setBmActiveBrand(tgId, active);
  }

  const cur = brands.find((b) => Number(b.user_id) === Number(active)) || brands[0];
  const label = bmBrandLabelFromRow(cur);

  return { enabled: true, brandUserId: Number(cur.user_id), brandLabel: label, brands };
}

async function renderMainMenu(ctx, flags, params = {}) {
  const edit = params.edit !== false; // default true
  const u = params.user || (ctx.from ? await db.upsertUser(ctx.from.id, ctx.from.username ?? null) : null);

  // Track last UI home for resilient Back in BX flows
  if (ctx.from?.id) await setUiHome(ctx.from.id, BX_HOME.MAIN_MENU);

  const mode = await resolveUiMode(ctx.from?.id);
  let modeHuman = uiModeHuman(mode);
  let text;
  let kb;

  if (mode === UI_MODES.BRAND && u) {
    const bm = await resolveBmBrandContext(ctx, u, { requirePickWhenMissingActive: true });

    if (bm.dbMissing) {
      modeHuman = 'Brand Manager';
      text = `⚠️ <b>Нужна миграция 026_brand_managers</b>

В Neon должна быть таблица <code>brand_managers</code>.`;
      kb = new InlineKeyboard().text('📋 Меню', 'a:menu');
    } else if (bm.revoked) {
      await disableBrandManagerState(ctx.from.id);
      modeHuman = 'Brand Manager';
      text = `⛔ <b>Доступ менеджера отозван</b>

Если это ошибка — попроси владельца бренда добавить тебя в «👔 Менеджеры бренда».`;
      kb = new InlineKeyboard().text('📋 Меню', 'a:menu');
    } else if (bm.enabled && bm.needsPick) {
      await renderBmPickBrand(ctx, u, { ret: 'menu', wsId: 0, page: 0, edit });
      return;
    } else if (bm.enabled) {
      modeHuman = 'Brand Manager';
      const base = `🏠 <b>Главное меню</b>

<b>Ты сейчас в режиме:</b> <b>${modeHuman}</b>
<b>Бренд:</b> <b>${escapeHtml(bm.brandLabel)}</b>
`;
      text = base + `
Для команды бренда — Inbox и поиск креаторов.

Выбери действие:`;
      kb = mainMenuBrandKb(flags, { isManager: true, hasMultipleBrands: (bm.brands || []).length > 1 });
    } else {
      const base = `🏠 <b>Главное меню</b>

<b>Ты сейчас в режиме:</b> <b>${modeHuman}</b>
`;
      text = base + `
Для брендов — поиск креаторов, лента креаторов и Inbox.

Выбери действие:`;
      let canManager = false;
      try { canManager = (await db.listBrandsForManager(u.id)).length > 0; } catch { canManager = false; }

      // UX: show lock icon on Brand Team button until profile+purchase requirements met
      let teamLocked = false;
      try {
        const prof = await safeBrandProfiles(() => db.getBrandProfile(u.id), async () => null);
        const basicOk = isBrandBasicComplete(prof);
        let teamPaid = false;
        if (basicOk) {
          try { teamPaid = await db.hasBrandTeamUnlockPurchase(u.id); } catch { teamPaid = false; }
        }
        teamLocked = !(basicOk && teamPaid);
      } catch {
        teamLocked = false;
      }

      kb = mainMenuBrandKb(flags, { isManager: false, canManager, teamLocked });
    }
  } else if (mode === UI_MODES.BRAND) {
    const base = `🏠 <b>Главное меню</b>

<b>Ты сейчас в режиме:</b> <b>${modeHuman}</b>
`;
    text = base + `
Для брендов — поиск креаторов, лента креаторов и Inbox.

Выбери действие:`;
    kb = mainMenuBrandKb(flags, { isManager: false });
  } else {
    const base = `🏠 <b>Главное меню</b>

<b>Ты сейчас в режиме:</b> <b>${modeHuman}</b>
`;
    text = base + `
Для Creator/UGC — подключение канала, витрина, лента и розыгрыши.

Выбери действие:`;
    let canManager = false;
    if (u) {
      try { canManager = (await db.listBrandsForManager(u.id)).length > 0; } catch { canManager = false; }
    }
    kb = mainMenuCreatorKb(flags, { canManager });
  }

  const opts = { parse_mode: 'HTML', reply_markup: kb };
  if (edit && ctx.callbackQuery?.message) {
    await safeEditOrReply(ctx, text, opts);
  } else {
    await ctx.reply(text, opts);
  }
}



async function renderHomeHub(ctx, u, flags = {}, opts = {}) {
  const edit = opts.edit !== false;
  const tgId = Number(ctx?.from?.id || 0);

  const noHint = opts?.noHint === true;
  let showHint = false;
  try {
    if (!noHint && tgId) showHint = await shouldShowHomeHubHint(tgId);
  } catch {
    showHint = false;
  }

  const uiMode = await resolveUiMode(tgId);
  const bmMode = await getBrandManagerMode(tgId);
  const curMode = (flags?.isCurator ? await getCuratorMode(tgId) : false);

  // Can this user act as a brand manager (even if the mode is currently OFF)?
  let managerBrands = [];
  let canManager = false;
  try {
    managerBrands = await db.listBrandsForManager(u.id);
    canManager = Array.isArray(managerBrands) && managerBrands.length > 0;
  } catch (e) {
    canManager = false;
  }

  // Effective mode: curator overlay > brand manager > brand/creator UI mode
  const effective =
    curMode
      ? 'curator'
      : bmMode
        ? 'brand_manager'
        : normalizeUiMode(uiMode) === UI_MODES.BRAND
          ? 'brand'
          : 'creator';

  const modeLabel =
    effective === 'curator'
      ? 'Curator'
      : effective === 'brand_manager'
        ? 'Brand Manager'
        : uiModeHuman(uiMode);

  let hint = '';
  if (bmMode && canManager) {
    try {
      const active = await getBmActiveBrand(tgId);
      const row = managerBrands.find((b) => Number(b.user_id) == Number(active)) || managerBrands[0];
      const label = row ? bmBrandLabelFromRow(row) : '';
      if (label) hint += `
• Активный бренд: <b>${escapeHtml(label)}</b>`;
    } catch {}
  }
  if (curMode) hint += `
• Curator Mode: <b>ON</b>`;

  let mapText =
    (effective === 'brand' || effective === 'brand_manager')
      ? `
<b>Карта</b>
• 🎬 Офферы → 🎬 Офферы (лента) / 🔎 Поиск
• 📥 Inbox — диалоги и заявки
• 🎛 Фильтры — уточни подбор креаторов
`
      : `
<b>Карта</b>
• 🎬 Офферы → 📣 Мои каналы → выбери канал → 🎬 UGC / Офферы
• 📥 Inbox → 📣 Мои каналы → выбери канал → 📥 Inbox
• 📨 Заявки → 📣 Мои каналы → выбери канал → 📨 Заявки брендов
• 🏷 Каталог → кнопка «🏷 Каталог брендов» ниже
`;

  if (effective === 'curator') {
    mapText = `
<b>Карта</b>
• 🧹 Кабинет куратора — рабочий хаб
• 🔓 Обычный режим — вернуться в Creator/Brand
`;
  }

  const bannerText = showHint
    ? `
<b>Быстрый старт</b>
• Выбери режим ниже → откроется хаб роли (📋 Меню)
• Дальше следуй по “Карте” (офферы / диалоги / заявки / каталог)
`
    : '';

  const textMsg =
    `🏠 <b>HOME HUB</b>

` +
    bannerText +
    mapText +
    `Выбери режим работы.

` +
    `Текущий режим: <b>${escapeHtml(modeLabel)}</b>` +
    hint;

  const bCreator = `${effective === 'creator' ? '✅ ' : ''}✨ Creator / канал`;
  const bBrand = `${effective === 'brand' ? '✅ ' : ''}🏷 Бренд`;
  const bBm = `${effective === 'brand_manager' ? '✅ ' : ''}👔 Менеджеры бренда`;
  const bCur = `${effective === 'curator' ? '✅ ' : ''}🧹 Кураторы блогера`;

  const kb = new InlineKeyboard()
    .text(`▶️ Продолжить: ${modeLabel}`, 'a:menu')
    .row()
    .text(bCreator, 'a:home_mode|m:creator')
    .row()
    .text(bBrand, 'a:home_mode|m:brand');

  if (canManager) kb.row().text(bBm, 'a:home_mode|m:brand_manager');
  if (flags?.isCurator) kb.row().text(bCur, 'a:home_mode|m:curator');


  // Quick map shortcuts (mode-aware)
  if (effective === 'curator') {
    kb.row().text('🧹 Кабинет куратора', 'a:cur_home');
  } else if (effective === 'brand' || effective === 'brand_manager') {
    kb
      .row()
      .text('📥 Inbox', 'a:go_dialogs')
      .text('🎬 Офферы (лента)', 'a:bx_feed|ws:0|p:0|h:mm');
    kb
      .row()
      .text('🔎 Поиск', 'a:pm_home|ws:0')
      .text('🎛 Фильтры', 'a:bx_filters|ws:0|p:0|h:mm|r:mm');
  } else {
    kb.row().text('📣 Мои каналы', 'a:ws_list').text('🏷 Каталог брендов', 'a:brands_home');
  }

  // Staff shortcuts
  if (flags?.isModerator) kb.row().text('🛡 Модерация', 'a:mod_home');
  if (flags?.isAdmin) kb.row().text('👑 Админка', 'a:admin_home');

  kb
    .row()
    .text('📋 Меню', 'a:menu')
    .text('🧭 Быстрый старт', 'a:guide');

  if (showHint) kb.row().text('✅ Понятно', 'a:home_hint_ack');

  kb.row().text('💬 Поддержка', 'a:support');

  if (edit) await safeEditOrReply(ctx, textMsg, { parse_mode: 'HTML', reply_markup: kb });
  else await ctx.reply(textMsg, { parse_mode: 'HTML', reply_markup: kb });

  // Mark hint as shown (cooldown-based) after successful render.
  if (showHint && tgId) {
    try { await markHomeHubHintSeen(tgId); } catch {}
  }
}

async function renderRoleHub(ctx, u, flags) {
  // Role hub is a navigation home for Back in BX flows
  if (ctx.from?.id) await setUiHome(ctx.from.id, BX_HOME.MENU);
  // Role hub: Creator -> active workspace; Brand -> brand dashboard; Curator mode -> curator cabinet menu.
  const curMode = !!flags.isCurator && (await getCuratorMode(ctx.from.id));
  if (curMode) {
    // In Curator Mode, Menu should open the Curator Hub directly (no extra intermediate screen).
    await renderCuratorHome(ctx, u.id);
    return;
  }

  const mode = await resolveUiMode(ctx.from.id);
  const bmMode = await getBrandManagerMode(ctx.from.id);
  const isBrandish = normalizeUiMode(mode) === UI_MODES.BRAND || bmMode;

  if (mode === UI_MODES.BRAND) {
    const isManagerMode = await getBrandManagerMode(ctx.from.id);
    if (isManagerMode) {
      const bm = await resolveBmBrandContext(ctx, u, { requirePickWhenMissingActive: true });

      if (bm.dbMissing) {
        const msg = `⚠️ <b>Нужна миграция 026_brand_managers</b>

В Neon должна быть таблица <code>brand_managers</code>.`;
        await safeEditOrReply(ctx, msg, { parse_mode: 'HTML', reply_markup: navKb('a:main_menu') });
        return;
      }
      if (bm.revoked) {
        await disableBrandManagerState(ctx.from.id);
        const msg = `⛔ <b>Доступ менеджера отозван</b>

Если это ошибка — попроси владельца бренда добавить тебя в «👔 Менеджеры бренда».`;
        await safeEditOrReply(ctx, msg, { parse_mode: 'HTML', reply_markup: navKb('a:main_menu') });
        return;
      }

      if (bm.enabled && bm.needsPick) {
        await renderBmPickBrand(ctx, u, { ret: 'bx_inbox', wsId: 0, page: 0, edit: true });
        return;
      }

      await renderBxInbox(ctx, bm.brandUserId, 0, 0, { bm });
      return;
    }

    await renderBxOpen(ctx, u.id, 0);
    return;
  }

  // Creator hub
  const wsList = await db.listWorkspaces(u.id);
  if (!wsList.length) {
    await renderMainMenu(ctx, flags, { edit: true, user: u });
    return;
  }

  const active = await getActiveWorkspace(ctx.from.id);
  let wsId = wsList[0].id;
  if (active) {
    const a = wsList.find((w) => Number(w.id) === Number(active));
    if (a) wsId = a.id;
  }

  await renderWsOpen(ctx, u.id, wsId);
}


function curatorModeMenuKb(flags = {}) {
  const { isModerator = false, isAdmin = false } = flags;

  // Curator Mode: максимально коротко и по делу. Здесь только кураторские действия.
  // Доступ к своим каналам (как creator/owner) — через «🔓 Обычный режим».
  const kb = new InlineKeyboard()
    .text('👤 Кабинет куратора', 'a:cur_home')
    .row()
    .text('🧭 Быстрый старт', 'a:guide')
    .text('💬 Поддержка', 'a:support')
    .row()
    .text('🔄 Обновить', 'a:cur_home')
    .row()
    .text('🔓 Обычный режим', 'a:cur_mode_set|v:0|ret:menu')
    .row();

  const extra = [];
  if (isModerator) extra.push(['🛡 Модерация', 'a:mod_home']);
  if (isAdmin) extra.push(['👑 Админка', 'a:admin_home']);
  for (let i = 0; i < extra.length; i += 2) {
    const a = extra[i];
    const b = extra[i + 1];
    kb.row().text(a[0], a[1]);
    if (b) kb.text(b[0], b[1]);
  }

  kb.row().text('🏠 Home', 'a:home');

  return kb;
}




function onboardingKb(flags = {}) {
  const { isModerator = false, isAdmin = false } = flags;
  const kb = new InlineKeyboard()
    .text('✨ Я канал / Creator', 'a:onb_creator')
    .row()
    .text('🏷 Я бренд', 'a:onb_brand')
    .row()
    .text('🏠 Home', 'a:home');
  // keep quick access for staff even in onboarding
  if (CFG.VERIFICATION_ENABLED) kb.row().text('✅ Верификация', 'a:verify_home');
  if (isModerator) kb.row().text('🛡 Модерация', 'a:mod_home');
  if (isAdmin) kb.row().text('👑 Админка', 'a:admin_home');
  return kb;
}

function navKb(backCb) {
  // Unified HUB footer: Back (return-to) + Menu (role hub) + Home (home hub)
  const kb = new InlineKeyboard();
  if (backCb && backCb !== 'a:menu' && backCb !== 'a:home') kb.text('⬅️ Назад', backCb);
  kb.text('📋 Меню', 'a:menu');
  kb.text('🏠 Home', 'a:home');
  return kb;
}

function kbNavRow(kb, backCb) {
  // Adds a unified HUB footer row to an existing keyboard (Back -> return-to, Menu -> role hub, Home -> home hub)
  kb.row();
  if (backCb && backCb !== 'a:menu' && backCb !== 'a:home') kb.text('⬅️ Назад', backCb);
  kb.text('📋 Меню', 'a:menu');
  kb.text('🏠 Home', 'a:home');
  return kb;
}


async function safeEditOrReply(ctx, text, extra = {}, preferEdit = true) {
  // Telegram sometimes rejects edits (old message, deleted message, not modified, etc.).
  // We never want the UI to "do nothing": fallback to sending a new message.
  if (preferEdit && ctx?.callbackQuery?.message) {
    try {
      return await ctx.editMessageText(text, extra);
    } catch (e) {
      const msg = String(e?.description || e?.message || e);
      // If nothing changes — treat as success.
      if (msg.includes('message is not modified')) return;
      // Some messages can't be edited (invoice/service) — fallthrough to reply.
    }
  }
  try {
    return await ctx.reply(text, extra);
  } catch (e) {
    // Last resort: try edit again if reply is blocked (rare).
    if (ctx?.callbackQuery?.message) {
      try {
        return await ctx.editMessageText(text, extra);
      } catch (_) {}
    }
    throw e;
  }
}








async function safeDeleteIncomingUserMessage(ctx) {
  // Best-effort: remove the incoming user message after we consumed it
  // to keep the chat clean in text-input flows.
  //
  // Telegram allows bots to delete incoming messages in private chats
  // (see deleteMessage limitations in Bot API docs). We still treat this
  // as "best effort" and never fail the UX if deletion is not possible.
  try {
    const msg =
      ctx?.message ||
      ctx?.msg ||
      ctx?.update?.message ||
      ctx?.update?.edited_message ||
      null;

    const chat = msg?.chat || ctx?.chat || null;
    const chatId = chat?.id || null;
    const mid = msg?.message_id || null;

    if (!chatId || !mid) return false;

    // Only attempt cleanup in private chats (or when chat.type is missing).
    const ctype = String(chat?.type || '').toLowerCase();
    if (ctype && ctype !== 'private') return false;

    // Prefer grammY helper when available (targets the update message).
    try {
      if (typeof ctx.deleteMessage === 'function') {
        await ctx.deleteMessage();
        return true;
      }
    } catch (_) {}

    // Raw Bot API fallbacks
    try {
      await ctx.api.deleteMessage(chatId, mid);
      return true;
    } catch (_) {}

    try {
      if (typeof ctx.api.deleteMessages === 'function') {
        await ctx.api.deleteMessages(chatId, [mid]);
        return true;
      }
    } catch (_) {}

    // Business connection fallback (if present)
    try {
      const bcid = msg?.business_connection_id || msg?.businessConnectionId || null;
      if (bcid && typeof ctx.api.deleteBusinessMessages === 'function') {
        await ctx.api.deleteBusinessMessages(bcid, [mid]);
        return true;
      }
    } catch (_) {}

    return false;
  } catch (_) {
    return false;
  }
}





async function uiGuard(ctx, tag, fn) {
  try {
    return await fn();
  } catch (e) {
    console.error(`[UI:${tag}]`, e);
    try {
      await safeEditOrReply(ctx, `⚠️ <b>Ошибка</b>

Что-то пошло не так. Нажми «📋 Меню» и попробуй ещё раз.`, {
        parse_mode: 'HTML',
        reply_markup: navKb('a:menu'),
        disable_web_page_preview: true,
      });
    } catch (_) {}
  }
}


// -----------------------------
// BX Navigation helpers (home/return context)
// h: home anchor (mm=main_menu, mn=role hub, bo=bx_open)
// r: return anchor for nested screens (bf=bx_feed, mm/mn/bo)
// -----------------------------

const BX_HOME = { MAIN_MENU: 'mm', MENU: 'mn', BX_OPEN: 'bo' };

const UI_HOME_TTL_SEC = 7 * 24 * 3600;

function uiHomeKey(uid) {
  return k(['ui_home', Number(uid || 0)]);
}

async function setUiHome(uid, home) {
  try {
    const id = Number(uid || 0);
    if (!id) return;
    const h = normBxHome(home, BX_HOME.MENU);
    await redis.set(uiHomeKey(id), h, { ex: UI_HOME_TTL_SEC });
  } catch {
    // ignore
  }
}

async function getUiHome(uid) {
  try {
    const id = Number(uid || 0);
    if (!id) return null;
    const v = await redis.get(uiHomeKey(id));
    const s = String(v || '').trim();
    if (!s) return null;
    return normBxHome(s, BX_HOME.MENU);
  } catch {
    return null;
  }
}

async function resolveBxHomeFromUi(ctx, wsId, rawH, fallback) {
  const direct = String(rawH || '').trim();
  if (direct) return normBxHome(direct, fallback);
  const uid = ctx?.from?.id ? Number(ctx.from.id) : 0;
  if (uid) {
    const saved = await getUiHome(uid);
    if (saved) return normBxHome(saved, fallback);
  }
  // Last-resort default
  return normBxHome(fallback, BX_HOME.MENU);
}

function normBxHome(h, fallback = BX_HOME.MENU) {
  const v = String(h || '').trim().toLowerCase();
  if (v === BX_HOME.MAIN_MENU || v === BX_HOME.MENU || v === BX_HOME.BX_OPEN) return v;
  return fallback;
}

function normBxRet(r, fallback = BX_HOME.BX_OPEN) {
  const v = String(r || '').trim().toLowerCase();
  if (v === 'bf' || v === 'bs' || v === BX_HOME.MAIN_MENU || v === BX_HOME.MENU || v === BX_HOME.BX_OPEN) return v;
  return fallback;
}


function normBxTagFilterKey(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return '';
  if (v in {'goals':1,'goal':1,'goalstags':1,'goals_tags':1,'goals-tags':1}) return 'goals';
  if (v in {'req':1,'reqs':1,'requirement':1,'requirements':1,'reqtags':1,'req_tags':1,'req-tags':1}) return 'req';
  return '';
}

function bxHomeCb(wsId, h) {
  const home = normBxHome(h, BX_HOME.MENU);
  if (home === BX_HOME.MAIN_MENU) return 'a:main_menu';
  if (home === BX_HOME.BX_OPEN) return `a:bx_open|ws:${Number(wsId || 0)}`;
  return 'a:menu';
}

function bxReturnCb(wsId, page, h, r) {
  const home = normBxHome(h, BX_HOME.MENU);
  const ret = normBxRet(r, home === BX_HOME.BX_OPEN ? BX_HOME.BX_OPEN : home);
  if (ret === 'bf') return `a:bx_feed|ws:${Number(wsId || 0)}|p:${Number(page || 0)}|h:${home}`;
  if (ret === 'bs') return `a:bx_smart|ws:${Number(wsId || 0)}|h:${home}`;
  if (ret === BX_HOME.MAIN_MENU) return 'a:main_menu';
  if (ret === BX_HOME.BX_OPEN) return `a:bx_open|ws:${Number(wsId || 0)}`;
  return 'a:menu';
}

function expectBackCb(exp) {
  if (!exp || !exp.type) return 'a:menu';
  if (exp.backCb) return String(exp.backCb);
  if (exp.back) return String(exp.back);
  const t = String(exp.type || '');
  const wsId = exp.wsId ? Number(exp.wsId) : null;
  const gwId = exp.gwId ? Number(exp.gwId) : null;

  if (t === 'curator_username') return wsId ? `a:cur_manage|ws:${wsId}` : 'a:menu';
  if (t === 'bm_username') return 'a:brand_team|ws:0';
  if (t === 'curator_note') return (wsId && gwId) ? `a:cur_gw_open|ws:${wsId}|i:${gwId}` : 'a:cur_home';

  if (t.startsWith('folder_')) return wsId ? `a:folders_home|ws:${wsId}` : 'a:menu';

  if (t.startsWith('brand_')) return 'a:bx_open|ws:0';
  if (t.startsWith('verify_')) return 'a:verify_home';

  if (t.startsWith('wsp_')) return wsId ? `a:wsp_open|ws:${wsId}` : 'a:ws_list';
  if (t.startsWith('gw_')) return wsId ? `a:gw_list_ws|ws:${wsId}` : 'a:gw_list';
  if (t.startsWith('bx_')) return exp.back ? String(exp.back) : 'a:bx_open|ws:0';

  if (t.startsWith('mod_verif_')) return 'a:mod_home';

  return 'a:menu';
}

async function setActiveWorkspace(tgId, wsId) {
  await redis.set(k(['active_ws', tgId]), String(wsId), { ex: 30 * 24 * 3600 });
}
async function getActiveWorkspace(tgId) {
  const v = await redis.get(k(['active_ws', tgId]));
  const n = Number(v);
  return n > 0 ? n : null;
}

// Curator UI mode (hide non-curator actions to reduce confusion)
async function setCuratorMode(tgId, enabled) {
  await redis.set(k(['cur_mode', tgId]), enabled ? '1' : '0', { ex: 365 * 24 * 3600 });
}

async function getCuratorMode(tgId) {
  const v = await redis.get(k(['cur_mode', tgId]));
  return String(v || '') === '1';
}

// UI mode: Creator vs Brand (reduce main menu overload)
const UI_MODES = { CREATOR: 'creator', BRAND: 'brand' };

function normalizeUiMode(mode) {
  const m = String(mode || '').toLowerCase().trim();
  if (m === 'brand') return UI_MODES.BRAND;
  return UI_MODES.CREATOR;
}

async function setUiMode(tgId, mode) {
  await redis.set(k(['ui_mode', tgId]), normalizeUiMode(mode), { ex: 365 * 24 * 3600 });
}

async function getUiMode(tgId) {
  const v = await redis.get(k(['ui_mode', tgId]));
  return normalizeUiMode(v || '');
}

async function resolveUiMode(tgId) {
  // Default: Creator. Onboarding / explicit switch sets Brand.
  const v = await redis.get(k(['ui_mode', tgId]));
  if (v) return normalizeUiMode(v);
  return UI_MODES.CREATOR;
}

function uiModeHuman(mode) {
  const m = normalizeUiMode(mode);
  return m === UI_MODES.BRAND ? 'Brand' : 'Creator';
}


// Curator meta for a giveaway (safe helpers): "checked" mark + notes history (last 3)
const CUR_GW_META_TTL_SEC = 180 * 24 * 3600; // ~180 days

// Telegram is strict about UTF-8 validity for inline keyboard button text.
// If we truncate in the middle of a surrogate pair (emoji), Telegram may reject the request.
function stripBrokenSurrogates(input) {
  const s = String(input ?? '');
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    // High surrogate
    if (c >= 0xD800 && c <= 0xDBFF) {
      const n = s.charCodeAt(i + 1);
      // Valid pair
      if (n >= 0xDC00 && n <= 0xDFFF) {
        out += s[i] + s[i + 1];
        i++;
      }
      // Broken surrogate => drop
      continue;
    }
    // Low surrogate without a preceding high surrogate => drop
    if (c >= 0xDC00 && c <= 0xDFFF) continue;
    out += s[i];
  }
  return out;
}

function clipText(s, maxLen = 140) {
  const t = stripBrokenSurrogates(String(s ?? '')).trim();
  const n = Number(maxLen) || 0;
  if (!n) return t;
  const arr = [...t]; // iterate by code points (no broken emoji)
  if (arr.length <= n) return t;
  return arr.slice(0, Math.max(1, n - 1)).join('') + '…';
}

function curatorLabelFromTg(from) {
  const uname = from?.username ? `@${from.username}` : '';
  const name = [from?.first_name, from?.last_name].filter(Boolean).join(' ').trim();
  if (uname && name) return `${uname} (${name})`;
  return uname || name || `tg:${from?.id}`;
}

function curatorLabelFromMeta(meta) {
  if (!meta) return '—';
  const uname = meta.by_username ? `@${meta.by_username}` : '';
  const name = String(meta.by_name || '').trim();
  if (uname && name) return `${uname} (${name})`;
  return uname || name || (meta.by_tg_id ? `tg:${meta.by_tg_id}` : '—');
}

function curatorNotesBlock(notes) {
  if (!Array.isArray(notes) || notes.length === 0) return '📝 Заметки: —';
  const shown = notes.slice(0, 3);
  const lines = shown
    .map((n) => {
      const txt = clipText(String(n?.text || ''), 140);
      const who = curatorLabelFromMeta(n);
      const when = n?.at ? fmtTs(n.at) : '—';
      return `• ${escapeHtml(txt)}\n  — <b>${escapeHtml(who)}</b> · ${escapeHtml(when)}`;
    })
    .join('\n\n');
  return `📝 <b>Заметки</b> (последние ${shown.length}):\n${lines}`;
}










async function getCurGwChecked(gwId) {
  try { return await redis.get(k(['cur_gw_checked', gwId])); } catch { return null; }
}
async function setCurGwChecked(gwId, meta) {
  try { await redis.set(k(['cur_gw_checked', gwId]), meta, { ex: CUR_GW_META_TTL_SEC }); } catch {}
}

async function getCurGwNotes(gwId, limit = 3) {
  const lim = Math.max(1, Math.min(10, Number(limit) || 3));
  const listKey = k(['cur_gw_notes', gwId]);

  // Prefer list history (new)
  try {
    if (typeof redis.lrange === 'function') {
      const raw = await redis.lrange(listKey, 0, lim - 1);
      const out = [];
      if (Array.isArray(raw)) {
        for (const item of raw) {
          if (item == null) continue;
          if (typeof item === 'object') {
            out.push(item);
          } else if (typeof item === 'string') {
            try { out.push(JSON.parse(item)); } catch { out.push({ text: item, at: Date.now() }); }
          } else {
            out.push({ text: String(item), at: Date.now() });
          }
        }
      }
      if (out.length) return out;
    }
  } catch {
    // ignore
  }

  // Fallback: legacy single note (old)
  try {
    const legacy = await redis.get(k(['cur_gw_note', gwId]));
    if (legacy) return [legacy].slice(0, lim);
  } catch {
    // ignore
  }


// Fallback: if Redis was flushed, try restore from DB audit (no migrations).
try {
  const rows = await db.listGiveawayCuratorNotesAudit(gwId, lim);
  if (Array.isArray(rows) && rows.length) {
    const out = [];
    for (const r of rows) {
      const p = r?.payload || {};
      const t = String(p.text || '').trim();
      if (!t) continue;
      out.push({
        text: t,
        by_tg_id: p.by_tg_id || null,
        by_username: p.by_username || null,
        by_name: p.by_name || null,
        at: r.created_at || null,
      });
    }
    if (out.length) return out;
  }
} catch {
  // ignore
}
  return [];
}

async function getCurGwNote(gwId) {
  const notes = await getCurGwNotes(gwId, 1);
  return notes && notes.length ? notes[0] : null;
}

async function setCurGwNote(gwId, meta) {
  // Push into history list (new) + keep legacy "last note" key (compat)
  const listKey = k(['cur_gw_notes', gwId]);
  try {
    const payload = typeof meta === 'string' ? meta : JSON.stringify(meta);
    if (typeof redis.lpush === 'function') {
      await redis.lpush(listKey, payload);
      if (typeof redis.ltrim === 'function') await redis.ltrim(listKey, 0, 2);
      if (typeof redis.expire === 'function') await redis.expire(listKey, CUR_GW_META_TTL_SEC);
    }
  } catch {
    // ignore
  }

  try { await redis.set(k(['cur_gw_note', gwId]), meta, { ex: CUR_GW_META_TTL_SEC }); } catch {}
}

function wsMenuKb(wsId, opts = {}) {
  const { showCurator = false } = opts || {};

  // Пары = часто жмут подряд. Одиночные = режимы/редкие.
  const kb = new InlineKeyboard()
    .text('➕ Новый розыгрыш', `a:gw_new|ws:${wsId}`)
    .text('🎁 Розыгрыши', `a:gw_list_ws|ws:${wsId}`)
    .row()
    .text('🎬 UGC / Офферы', `a:bx_open|ws:${wsId}`)
    .text('📥 Inbox', `a:bx_inbox|ws:${wsId}|p:0|h:bo`)
    .row()
    .text('📨 Заявки брендов', `a:ws_leads|ws:${wsId}|s:new|p:0|ret:ws_open`)
    .text('📁 Папки', `a:folders_home|ws:${wsId}`)
    .row()
    .text('👤 Профиль', `a:ws_profile|ws:${wsId}`)
    .text('⭐️ PRO', `a:ws_pro|ws:${wsId}`)
    .row()
    .text('👥 Кураторы канала', `a:ws_settings|ws:${wsId}`)
    .text('🧾 История', `a:ws_history|ws:${wsId}`)
    .row();

  if (showCurator) kb.text('🧹 Кураторы блогера', 'a:cur_home').row();

  kb.row().text('⬅️ Назад', 'a:ws_list').text('📋 Меню', 'a:menu');
  kb.row().text('🏠 Home', 'a:home');
  return kb;
}


function wsSettingsKb(wsId, s) {
  const net = s.network_enabled ? '🌐 Сеть: ✅ ВКЛ' : '🌐 Сеть: ❌ ВЫКЛ';
  const cur = s.curator_enabled ? '👤 Куратор: ✅ ВКЛ' : '👤 Куратор: ❌ ВЫКЛ';

  const kb = new InlineKeyboard()
    .text(net, `a:net_q|ws:${wsId}|ret:ws`)
    .text(cur, `a:ws_toggle_cur|ws:${wsId}`)
    .row()
    .text('👥 Управление кураторами', `a:cur_manage|ws:${wsId}`)
    .text('🧾 История', `a:ws_history|ws:${wsId}`)
    .row();

  kb.row().text('⬅️ Назад', `a:ws_open|ws:${wsId}`).text('📋 Меню', 'a:menu');
  kb.row().text('🏠 Home', 'a:home');
  return kb;
}


function curManageKb(wsId, ws = null) {
  const enabled = !!ws?.curator_enabled;
  const toggleLabel = enabled ? '👤 Куратор: ✅ ВКЛ' : '👤 Куратор: ❌ ВЫКЛ';

  const kb = new InlineKeyboard();

  // Toggle — одиночная кнопка (режим).
  kb.text(toggleLabel, `a:ws_toggle_cur|ws:${wsId}|ret:cur_manage`).row();

  // Частые действия в паре.
  kb.text('👤 Пригласить ссылкой', `a:cur_invite|ws:${wsId}`)
    .text('➕ Добавить по @username', `a:cur_add_username|ws:${wsId}`)
    .row();

  kb.text('👥 Список кураторов', `a:cur_list|ws:${wsId}`)
    .text('🧾 История', `a:ws_history|ws:${wsId}`)
    .row();

  kb.row().text('⬅️ Назад', `a:ws_settings|ws:${wsId}`).text('📋 Меню', 'a:menu');
  kb.row().text('🏠 Home', 'a:home');
  return kb;
}


async function renderCuratorManage(ctx, ownerUserId, wsId, opts = {}) {
  const notice = opts.notice ? String(opts.notice) : '';
  const ws = await db.getWorkspace(ownerUserId, wsId);
  if (!ws) {
    try { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); } catch {}
    return;
  }
  try { await db.ensureWorkspaceSettings(wsId); } catch {}

  const title = ws.channel_username ? ('@' + ws.channel_username) : (ws.title || `Канал #${wsId}`);
  const curators = await db.listCurators(wsId);
  const count = curators?.length || 0;

  // Activity summary (last 30 days) from giveaway_audit
  let statsRows = [];
  try {
    statsRows = await db.getCuratorWorkspaceSummary(wsId, 30, 50);
  } catch {
    statsRows = [];
  }
  const statsById = new Map();
  for (const r of statsRows || []) {
    const uid = Number(r.user_id || 0);
    if (uid) statsById.set(uid, r);
  }

  const enabled = !!ws.curator_enabled;
  const status = enabled ? '✅ ВКЛ' : '❌ ВЫКЛ';

  const fmtUname = (c) => c?.tg_username ? '@' + escapeHtml(c.tg_username) : (c?.tg_id ? 'id:' + String(c.tg_id) : '—');

  const cards = (curators || []).slice(0, 12).map((c) => {
    const s = statsById.get(Number(c.user_id || 0)) || {};
    const actions = Number(s.actions || 0);
    const notes = Number(s.notes || 0);
    const reminders = Number(s.reminders || 0);
    const notifies = Number(s.notifies || 0);
    const last = s.last_at ? fmtTs(s.last_at) : null;
    const lines = [
      `👤 <b>${fmtUname(c)}</b>`,
      `• ⚡ Действий: <b>${actions}</b>`,
      `• 📝 Заметок: <b>${notes}</b>`,
      `• 📌 Напоминаний: <b>${reminders}</b>`,
      `• 📩 Уведомлений владельцу: <b>${notifies}</b>`,
      `• 🕒 Последнее: <b>${last ? escapeHtml(last) : '—'}</b>`,
    ];
    return lines.join('\n');
  }).join('\n\n');

  // Totals (only for listed curators)
  let totActions = 0, totNotes = 0, totRem = 0, totNot = 0;
  for (const c of curators || []) {
    const s = statsById.get(Number(c.user_id || 0));
    if (!s) continue;
    totActions += Number(s.actions || 0);
    totNotes += Number(s.notes || 0);
    totRem += Number(s.reminders || 0);
    totNot += Number(s.notifies || 0);
  }

  let activityLines = [];
  try {
    const items = await db.listWorkspaceAudit(wsId, 20);
    const curItems = (items || []).filter(i => {
      const a = String(i?.action || '');
      return a.includes('curator') || a.includes('ws.curator') || a.includes('gw.cur') || a.includes('gw.reminder');
    }).slice(0, 6);
    activityLines = curItems.map(i => `• ${fmtTs(i.created_at)} — <code>${escapeHtml(String(i.action || ''))}</code>`);
  } catch {
    activityLines = [];
  }

  const text = `${notice ? `✅ ${escapeHtml(notice)}

` : ''}👥 <b>Куратор HQ</b>

Канал: <b>${escapeHtml(title)}</b>
Доступ кураторов: <b>${status}</b>
Кураторов в списке: <b>${count}</b>

<b>Активность (30 дней):</b>
• ⚡ Действий: <b>${totActions}</b>
• 📝 Заметок: <b>${totNotes}</b>
• 📌 Напоминаний: <b>${totRem}</b>
• 📩 Уведомлений владельцу: <b>${totNot}</b>

<b>Команда (карточки):</b>
${count ? cards : 'Пока нет.'}

<b>Последние события:</b>
${activityLines.length ? activityLines.join('\n') : 'Пока пусто.'}

💡 Куратор открывает кабинет через «🧹 Кураторы блогера» в меню (если он назначен куратором хотя бы в одном канале).`;

  await safeEditOrReply(ctx, text, {
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: curManageKb(wsId, ws)
  });
}



function brandTeamKb() {
  return new InlineKeyboard()
    .text('👤 Пригласить ссылкой', 'a:bm_invite|ws:0')
    .row()
    .text('➕ Добавить по @username', 'a:bm_add_username|ws:0')
    .row()
    .text('👥 Список менеджеров', 'a:bm_list|ws:0')
    .row()
    .text('⬅️ Назад', 'a:menu');
}


// Brand Team access: unlock after basic profile + Brand Pass / Brand Plan
function brandTeamLockedKb() {
  return new InlineKeyboard()
    .text('🏷 Профиль бренда', 'a:brand_profile|ws:0|ret:brand')
    .row()
    .text('🎫 Brand Pass', 'a:brand_pass|ws:0')
    .text('⭐️ Brand Plan', 'a:brand_plan|ws:0')
    .row()
    .text('⬅️ Назад', 'a:menu');
}

async function getBrandTeamGateState(ownerUserId) {
  const prof = await safeBrandProfiles(
    () => db.getBrandProfile(ownerUserId),
    async () => ({ __missing_relation: true })
  );

  if (prof && prof.__missing_relation) {
    return {
      ok: false,
      missingRelation: true,
      basicDone: 0,
      missingBasic: ['Название', 'Ниши', 'Контакт', 'Ссылка'],
      teamPaid: false
    };
  }

  const p = prof || {};
  const meta = parseBrandMeta(p.meta);
  const hasNicheKey = !!String(meta?.niche_key || '').trim();
  const hasNicheText = !!String(p.niche || '').trim();
  const nicheDone = hasNicheKey || hasNicheText;
  const basic = [
    { key: 'brand_name', label: 'Название' },
    { key: 'niche', label: 'Ниши' },
    { key: 'contact', label: 'Контакт' },
    { key: 'brand_link', label: 'Ссылка' }
  ];

  const basicDone = [
    !!String(p.brand_name || '').trim(),
    nicheDone,
    !!String(p.contact || '').trim(),
    !!String(p.brand_link || '').trim()
  ].filter(Boolean).length;
  const missingBasic = [
    !String(p.brand_name || '').trim() ? 'Название' : null,
    !nicheDone ? 'Ниши' : null,
    !String(p.contact || '').trim() ? 'Контакт' : null,
    !String(p.brand_link || '').trim() ? 'Ссылка' : null,
  ].filter(Boolean);

  let teamPaid = false;
  try {
    teamPaid = await db.hasBrandTeamUnlockPurchase(ownerUserId);
  } catch {
    teamPaid = false;
  }
  if (!teamPaid) {
    try {
      teamPaid = await db.isBrandPlanActive(ownerUserId);
    } catch {
      teamPaid = false;
    }
  }

  const ok = isBrandBasicComplete(p) && teamPaid;
  return { ok, p, basicDone, missingBasic, teamPaid };
}

async function ensureBrandTeamUnlocked(ctx, u, { edit = true } = {}) {
  // Owner-only: managers cannot manage team
  const bm = await resolveBmBrandContext(ctx, u, { requirePickWhenMissingActive: false });

  if (bm.dbMissing) {
    const kb = new InlineKeyboard().text('📋 Меню', 'a:menu');
    const text = `⚠️ <b>Нужна миграция 026_brand_managers</b>\n\nВ Neon должна быть таблица <code>brand_managers</code>.`;
    if (edit) await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
    else await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
    return null;
  }

  if (bm.enabled && bm.brandUserId !== u.id) {
    const kb = navKb('a:menu');
    const text = `⛔ <b>Только владелец бренда</b>\n\nМенеджер не может управлять «👔 Менеджеры бренда».`;
    if (edit) await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
    else await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
    return null;
  }

  const st = await getBrandTeamGateState(u.id);

  if (st.missingRelation) {
    const kb = new InlineKeyboard().text('📋 Меню', 'a:menu');
    const text = `⚠️ <b>Нужна миграция 024_brand_profiles</b>\n\nВ Neon должна быть таблица <code>brand_profiles</code>.`;
    if (edit) await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
    else await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
    return null;
  }

  if (!st.ok) {
    const statusProfile = st.missingBasic && st.missingBasic.length
      ? `• Профиль: ${st.basicDone}/4 (не хватает: <b>${escapeHtml(st.missingBasic.join(', '))}</b>)`
      : `• Профиль: ${st.basicDone}/4`;

    const statusPay = st.teamPaid
      ? '• Покупка: ✅ найдена'
      : '• Покупка: ❌ нет (нужен Brand Pass / Brand Plan)';

    const text = `👔 <b>Менеджеры бренда</b>\n\nДобавь менеджеров, чтобы быстрее отвечать на заявки и закрывать сделки.\n\n<b>Условия доступа:</b>\n1) Заполнить профиль бренда (4 поля: Название, Ниша, Контакт, Ссылка)\n2) Купить <b>Brand Pass</b> или <b>Brand Plan</b>\n\n<b>Статус:</b>\n${statusProfile}\n${statusPay}\n\n<i>Зачем:</i> защита от спама и ценность брендовой покупки.`;

    const kb = brandTeamLockedKb();
    if (edit) await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
    else await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
    return null;
  }

  return st;
}

function brandManagersListKb(managers) {
  const kb = new InlineKeyboard();
  for (const m of managers) {
    const label = m.tg_username ? `@${m.tg_username}` : `id:${m.tg_id}`;
    kb.text(`🗑 ${label}`, `a:bm_rm_q|ws:0|u:${m.user_id}`).row();
  }
  kb.text('⬅️ Назад', 'a:brand_team|ws:0').text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');
  return kb;
}

function brandManagerRemoveConfirmKb(managerUserId) {
  return new InlineKeyboard()
    .text('✅ Удалить', `a:bm_rm_ok|ws:0|u:${managerUserId}`)
    .row()
    .text('⬅️ Отмена', 'a:bm_list|ws:0')
    .text('📋 Меню', 'a:menu');
}

function netConfirmKb(wsId, enabled, ret) {
  const actionLabel = enabled ? '❌ Выключить сеть' : '✅ Включить сеть';
  const v = enabled ? 0 : 1;
  const cancelCb = String(ret) === 'bx' ? `a:bx_open|ws:${wsId}` : `a:ws_settings|ws:${wsId}`;
  return new InlineKeyboard()
    .text(actionLabel, `a:net_set|ws:${wsId}|v:${v}|ret:${String(ret) === 'bx' ? 'bx' : 'ws'}`)
    .row()
    .text('⬅️ Отмена', cancelCb).text('📋 Меню', 'a:menu');
}

async function renderNetConfirm(ctx, ownerUserId, wsId, ret = 'ws') {
  const ws = await db.getWorkspace(ownerUserId, wsId);
  if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

  const enabled = !!ws.network_enabled;
  const state = enabled ? '🌐 Сеть: ✅ ВКЛ' : '🌐 Сеть: ❌ ВЫКЛ';
  const hint = enabled
    ? 'Если выключить, твой канал пропадёт из ленты и не сможет публиковать новые офферы в сети.'
    : 'Если включить, твой канал появится в сети и сможет видеть ленту и публиковать офферы.';

  await ctx.answerCallbackQuery();
  await safeEditOrReply(ctx, `🌐 <b>Сеть</b>\n\nСейчас: <b>${escapeHtml(state)}</b>\n\n${escapeHtml(hint)}`, {
    parse_mode: 'HTML',
    reply_markup: netConfirmKb(wsId, enabled, ret)
  });
}

function curListKb(wsId, curators) {
  const kb = new InlineKeyboard();
  for (const c of curators) {
    const label = c.tg_username ? `@${c.tg_username}` : `id:${c.tg_id}`;
    kb.text(`🗑 ${label}`, `a:cur_rm_q|ws:${wsId}|u:${c.user_id}`).row();
  }
  kb.text('⬅️ Назад', `a:cur_manage|ws:${wsId}`).text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');
  return kb;
}

// -----------------------------
// Barters Marketplace (v0.9.1)
// -----------------------------

function bxMenuKb(wsId, networkEnabled = true, opts = {}) {
  const { showCurator = false } = opts || {};
  const net = networkEnabled ? '🌐 Сеть: ✅ ВКЛ' : '🌐 Сеть: ❌ ВЫКЛ';
  const kb = new InlineKeyboard()
  .text('📥 Inbox', `a:bx_inbox|ws:${wsId}|p:0|h:bo`)
  .text('📰 Лента креаторов', `a:bx_feed|ws:${wsId}|p:0|h:bo`)
  .row()
  .text('📦 Мои офферы', `a:bx_my|ws:${wsId}|p:0`)
  .text('➕ Создать офер', `a:bx_new|ws:${wsId}`)
  .row()
  .text('🏷 Каталог брендов', 'a:brands_home|p:0');

  if (CFG.VERIFICATION_ENABLED) kb.row().text('✅ Верификация', 'a:verify_home');

  if (showCurator) kb.row().text('🧹 Кураторы блогера', 'a:cur_home');

  kb.row().text(net, `a:net_q|ws:${wsId}|ret:bx`);
  kbNavRow(kb, `a:ws_open|ws:${wsId}`);
  return kb;
}




function bxBrandMenuKb(wsId, credits, plan, retry = 0, opts = {}) {
  const { showCurator = false } = opts || {};
  const planLabel = plan?.active ? (plan.name === 'max' ? 'Max ✅' : 'Basic ✅') : 'OFF';
  const kb = new InlineKeyboard()
.text('📰 Лента креаторов', `a:bx_feed|ws:${wsId}|p:0|h:bo`)
.text('🎛 Фильтры креаторов', `a:bx_filters|ws:${wsId}|p:0|h:bo|r:bo`)
.row()
.text('🎯 Smart-подбор', `a:bx_smart|ws:${wsId}|h:bo`)
.text('🔎 Поиск креаторов', `a:pm_home|ws:${wsId}`)
.row()
.text('📥 Inbox', `a:bx_inbox|ws:${wsId}|p:0|h:bo`)
.text('📝 Заявки', `a:brand_apps|ws:${wsId}|s:new|p:0`)
.row()
.text(`🎫 Brand Pass · ${fmtCredits(credits)}${retry ? ' · 🎟' + retry : ''}`, `a:brand_pass|ws:${wsId}`)
.row()
.text('🏷 Профиль бренда', `a:brand_profile|ws:${wsId}|ret:brand`)
.text(`⭐️ Подписка: ${planLabel}`, `a:brand_plan|ws:${wsId}`)
.row()
.text('🧠 Smart Matching', `a:match_home|ws:${wsId}`)
.text('🔥 Featured', `a:feat_home|ws:${wsId}`);


  if (CFG.VERIFICATION_ENABLED) kb.row().text('✅ Верификация', 'a:verify_home');

  if (showCurator) kb.row().text('🧹 Кураторы блогера', 'a:cur_home');

  kbNavRow(kb, 'a:menu');
  return kb;
}




function isBrandBasicComplete(p) {
  if (!p) return false;
  const meta = parseBrandMeta(p.meta);
  const hasNicheKey = !!String(meta?.niche_key || '').trim();
  const hasNicheText = !!String(p.niche || '').trim();
  return !!(
    String(p.brand_name || '').trim() &&
    (hasNicheKey || hasNicheText) &&
    String(p.contact || '').trim() &&
    String(p.brand_link || '').trim()
  );
}

function isBrandExtendedComplete(p) {
  if (!p) return false;
  return isBrandBasicComplete(p) && !!(
    String(p.geo || '').trim() &&
    String(p.collab_types || '').trim()
  );
}

// Brand profile: structured collaboration types (stored as CSV in brand_profiles.collab_types).
// No migrations: we reuse the existing text field and keep backward-compat with old free-form values.
const BRAND_COLLAB_TYPES = [
  { key: 'stories', title: '📲 Сторис' },
  { key: 'reels', title: '🎞 Reels' },
  { key: 'post', title: '🧾 Пост' },
  { key: 'review', title: '🎥 Обзор' },
  { key: 'unboxing', title: '📦 Распаковка' },
  { key: 'ugc', title: '🧩 UGC (контент)' },
  { key: 'integration', title: '📣 Реклама/упоминание' },
  { key: 'giveaway', title: '🎁 Розыгрыш' },
  { key: 'ambassador', title: '🧿 Амбассадорство' },
  { key: 'barter', title: '🤝 Бартер' },
  { key: 'cert', title: '🎟 Сертификат' },
  { key: 'paid', title: '💸 ₽ (оплата)' },
  { key: 'mixed', title: '🔁 Смешано' },
  { key: 'other', title: '✨ Другое' }
];

const BRAND_COLLAB_KEYS = new Set(BRAND_COLLAB_TYPES.map(x => x.key));
const BRAND_COLLAB_ALIASES = {
  // ru
  'сторис': 'stories',
  'story': 'stories',
  'stories': 'stories',
  'рилс': 'reels',
  'reels': 'reels',
  'reel': 'reels',
  'пост': 'post',
  'post': 'post',
  'обзор': 'review',
  'review': 'review',
  'распаковка': 'unboxing',
  'unboxing': 'unboxing',
  'ugc': 'ugc',
  'югс': 'ugc',
  'интеграция': 'integration',
  'реклама': 'integration',
  'упоминание': 'integration',
  'integration': 'integration',
  'розыгрыш': 'giveaway',
  'giveaway': 'giveaway',
  'give away': 'giveaway',
  'амбассадор': 'ambassador',
  'амбассадорство': 'ambassador',
  'ambassador': 'ambassador',
  'бартер': 'barter',
  'barter': 'barter',
  'сертификат': 'cert',
  'cert': 'cert',
  'руб': 'paid',
  '₽': 'paid',
  'деньги': 'paid',
  'оплата': 'paid',
  'paid': 'paid',
  'смешано': 'mixed',
  'mixed': 'mixed',
  'другое': 'other',
  'other': 'other'
};

function parseBrandCollabTypes(raw) {
  const s = String(raw || '').trim();
  if (!s) return [];

  const parts = s
    .split(/[,;\n]+/g)
    .map((x) => String(x || '').trim())
    .filter(Boolean);

  const out = [];
  const seen = new Set();

  for (let p of parts) {
    // strip leading emojis / bullets
    p = p.replace(/^[^0-9a-zA-Zа-яА-Я]+/g, '').trim();
    if (!p) continue;
    const low = p.toLowerCase();
    const key = BRAND_COLLAB_ALIASES[low] || (BRAND_COLLAB_KEYS.has(low) ? low : null);
    if (!key) continue;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }

  return out;
}

function brandCollabTypesToCsv(keys) {
  const arr = Array.isArray(keys) ? keys.map(String).filter((k) => BRAND_COLLAB_KEYS.has(k)) : [];
  const seen = new Set();
  const out = [];
  for (const k of arr) {
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out.length ? out.join(',') : null;
}

function brandCollabTypesDisplay(raw) {
  const s = String(raw || '').trim();
  if (!s) return '—';
  const keys = parseBrandCollabTypes(s);
  if (keys.length) return fmtMatrix(keys, BRAND_COLLAB_TYPES);
  // legacy free-form value (keep as-is)
  return s;
}


// -----------------------------
// Brand profile: advanced structured meta (no migrations)
// Stored in brand_profiles.meta JSONB.
// -----------------------------

const BRAND_BUDGET_BUCKETS = [
  { key: 'barter_only', title: '🤝 Только бартер' },
  { key: 'up_to_10k', title: '💰 До 10k' },
  { key: '10_30k', title: '💵 10–30k' },
  { key: '30_100k', title: '💎 30–100k' },
  { key: '100k_plus', title: '🏆 100k+' },
  { key: 'custom', title: '✍️ Договоримся' }
];
const BRAND_BUDGET_KEYS = new Set(BRAND_BUDGET_BUCKETS.map(x => x.key));

const BRAND_GOALS_TAGS = [
  { key: 'awareness', title: '📣 Узнаваемость' },
  { key: 'sales', title: '🛒 Продажи' },
  { key: 'traffic', title: '🔗 Трафик' },
  { key: 'ugc', title: '🧩 UGC/контент' },
  { key: 'followers', title: '👥 Подписчики' },
  { key: 'offline', title: '📍 Оффлайн-визиты' },
  { key: 'loyalty', title: '❤️ Лояльность' }
];
const BRAND_GOALS_KEYS = new Set(BRAND_GOALS_TAGS.map(x => x.key));

const BRAND_REQ_TAGS = [
  { key: 'face', title: '🙂 Лицо в кадре' },
  { key: 'no_face', title: '😶 Без лица' },
  { key: 'script', title: '📝 По сценарию' },
  { key: 'native', title: '🌿 Нативно' },
  { key: 'before_after', title: '✨ До/после' },
  { key: 'deadline', title: '⏱ Дедлайн' },
  { key: 'report', title: '📊 Отчёт/статистика' }
];
const BRAND_REQ_KEYS = new Set(BRAND_REQ_TAGS.map(x => x.key));

function parseBrandMeta(meta) {
  if (!meta || typeof meta !== 'object') return {};
  return meta;
}

// Creator offer structured meta (used for brand-side filtering)
function parseOfferMeta(meta) {
  const m = (meta && typeof meta === 'object') ? meta : {};
  const goals = Array.isArray(m.goals_tags) ? m.goals_tags : [];
  const req = Array.isArray(m.req_tags) ? m.req_tags : [];

  const goalsSet = new Set(goals.map((x) => String(x || '')).filter((k) => BRAND_GOALS_KEYS.has(k)));
  const reqSet = new Set(req.map((x) => String(x || '')).filter((k) => BRAND_REQ_KEYS.has(k)));

  return {
    goals_tags: Array.from(goalsSet),
    req_tags: Array.from(reqSet)
  };
}

function offerMetaLinesHtml(meta) {
  const m = parseOfferMeta(meta);
  const lines = [];
  if (m.goals_tags.length) {
    lines.push(`🎯 Цели: <code>${escapeHtml(brandTagsPreview(m.goals_tags, BRAND_GOALS_TAGS, 8))}</code>`);
  }
  if (m.req_tags.length) {
    lines.push(`📎 Требования: <code>${escapeHtml(brandTagsPreview(m.req_tags, BRAND_REQ_TAGS, 8))}</code>`);
  }
  return lines.length ? lines.join('\n') : '';
}

function offerMetaCountsInline(meta) {
  const m = parseOfferMeta(meta);
  const g = Array.isArray(m.goals_tags) ? m.goals_tags.length : 0;
  const r = Array.isArray(m.req_tags) ? m.req_tags.length : 0;
  if (!g && !r) return '';
  const parts = [];
  if (g) parts.push(`🎯 ${g}`);
  if (r) parts.push(`📎 ${r}`);
  return parts.join(' · ');
}

function brandBudgetBucketTitle(key) {
  if (!key) return '—';
  return BRAND_BUDGET_BUCKETS.find(x => x.key === key)?.title || '—';
}

function brandTagsPreview(keys, defs, max = 6) {
  const arr = Array.isArray(keys) ? keys.map(String) : [];
  const allowed = new Set(defs.map((x) => x.key));
  const clean = [];
  const seen = new Set();
  for (const k of arr) {
    if (!allowed.has(k)) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    clean.push(k);
  }
  if (!clean.length) return '—';
  const nameOf = (k) => defs.find((x) => x.key === k)?.title || k;
  const take = clean.slice(0, max).map((k) => nameOf(k));
  const more = clean.length > max ? ` +${clean.length - max}` : '';
  return take.join(' · ') + more;
}


function brandTagsPreviewPretty(keys, defs, max = 6) {
  const arr = Array.isArray(keys) ? keys.map(String) : [];
  const allowed = new Set(defs.map((x) => x.key));
  const clean = [];
  const seen = new Set();
  for (const k of arr) {
    if (!allowed.has(k)) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    clean.push(k);
  }
  if (!clean.length) return '—';
  const nameOf = (k) => defs.find((x) => x.key === k)?.title || k;
  const take = clean.slice(0, max).map((k) => nameOf(k));
  const moreN = clean.length > max ? (clean.length - max) : 0;
  return take.join(', ') + (moreN ? ` + ещё ${moreN}` : '');
}

function joinPreviewWithTotal(keys, totalCount, labelFn, max = 6) {
  const arr = Array.isArray(keys) ? keys.map(String) : [];
  const clean = [];
  const seen = new Set();
  for (const k of arr) {
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    clean.push(k);
  }
  if (!clean.length) return '—';
  const take = clean.slice(0, max).map((k) => labelFn(k));
  const takeCount = take.length;
  const total = Number.isFinite(Number(totalCount)) ? Number(totalCount) : clean.length;
  const moreN = Math.max(0, total - takeCount);
  return take.join(', ') + (moreN ? ` + ещё ${moreN}` : '');
}

function formatBrandDetailsBlock(prof, opts = {}) {
  const p = prof || {};
  const variant = String(opts.variant || 'full');
  const meta = opts.meta || parseBrandMeta(p.meta);

  const geo = String(p.geo || '').trim();
  const budget = String(p.budget || '').trim();
  const goals = String(p.goals || '').trim();
  const req = String(p.requirements || '').trim();

  const budgetKey = BRAND_BUDGET_KEYS.has(String(meta.budget_bucket || '')) ? String(meta.budget_bucket) : '';
  const budgetBucketTitle = budgetKey ? brandBudgetBucketTitle(budgetKey) : '';

  const goalsTags = Array.isArray(meta.goals_tags) ? meta.goals_tags.map(String).filter((k) => BRAND_GOALS_KEYS.has(k)) : [];
  const reqTags = Array.isArray(meta.req_tags) ? meta.req_tags.map(String).filter((k) => BRAND_REQ_KEYS.has(k)) : [];

  const collabKeysAll = parseBrandCollabTypes(String(p.collab_types || '').trim());
  const payKeySet = new Set(['barter', 'cert', 'paid', 'mixed']);
  const allFormatsKeys = collabKeysAll.filter((k) => !payKeySet.has(k));
  const allPayKeys = collabKeysAll.filter((k) => payKeySet.has(k));

  const totals = (opts.totals && typeof opts.totals === 'object') ? opts.totals : {};
  const totalFormats = Number.isFinite(Number(totals.formats)) ? Number(totals.formats) : allFormatsKeys.length;
  const totalPay = Number.isFinite(Number(totals.pay)) ? Number(totals.pay) : allPayKeys.length;

  const splitTags = opts.splitTags || null;
  const shownFormats = Array.isArray(splitTags?.formatsArr) ? splitTags.formatsArr : allFormatsKeys;
  const shownPay = Array.isArray(splitTags?.payArr) ? splitTags.payArr : allPayKeys;

  if (variant === 'compact') {
    const lines = [];

    if (geo) lines.push(`📍 Гео: <b>${escapeHtml(geo)}</b>`);

    const fPrev = joinPreviewWithTotal(shownFormats, totalFormats, (k) => brandCollabTagLabel(k, 'long'), 6);
    if (fPrev !== '—') lines.push(`🎬 Форматы: <b>${escapeHtml(fPrev)}</b>`);

    const pPrev = joinPreviewWithTotal(shownPay, totalPay, (k) => brandCollabTagLabel(k, 'long'), 4);
    if (pPrev !== '—') lines.push(`💳 Оплата: <b>${escapeHtml(pPrev)}</b>`);

    if (budgetBucketTitle || budget) {
      const parts = [];
      if (budgetBucketTitle) parts.push(escapeHtml(budgetBucketTitle));
      if (budget) parts.push(escapeHtml(clipText(budget, 80)));
      lines.push(`💸 Бюджет: <b>${parts.join(' · ')}</b>`);
    }

    if (goalsTags.length || goals) {
      const gTag = goalsTags.length ? brandTagsPreviewPretty(goalsTags, BRAND_GOALS_TAGS, 6) : '—';
      const parts = [];
      if (gTag !== '—') parts.push(`<b>${escapeHtml(gTag)}</b>`);
      if (goals) parts.push(`<i>${escapeHtml(clipText(goals, 80))}</i>`);
      lines.push(`🎯 Цели: ${parts.length ? parts.join(' · ') : '<b>—</b>'}`);
    }

    if (reqTags.length || req) {
      const rTag = reqTags.length ? brandTagsPreviewPretty(reqTags, BRAND_REQ_TAGS, 6) : '—';
      const parts = [];
      if (rTag !== '—') parts.push(`<b>${escapeHtml(rTag)}</b>`);
      if (req) parts.push(`<i>${escapeHtml(clipText(req, 80))}</i>`);
      lines.push(`🧩 Требования: ${parts.length ? parts.join(' · ') : '<b>—</b>'}`);
    }

    return lines.length ? lines.join('\n') : '';
  }

  // full
  const sections = [];

  sections.push(`📍 <b>Гео</b>\n• <b>${escapeHtml(geo || '—')}</b>`);

  const fAll = allFormatsKeys.length
    ? allFormatsKeys.map((k) => brandCollabTagLabel(k, 'long')).join(' · ')
    : '—';
  const pAll = allPayKeys.length
    ? allPayKeys.map((k) => brandCollabTagLabel(k, 'long')).join(' · ')
    : '—';

  let fmt = `🎬 <b>Форматы</b>\n• Теги: <b>${escapeHtml(fAll)}</b>`;
  if (pAll !== '—') fmt += `\n• Оплата: <b>${escapeHtml(pAll)}</b>`;
  sections.push(fmt);

  let bud = `💸 <b>Бюджет</b>\n• Категория: <b>${escapeHtml(budgetBucketTitle || '—')}</b>`;
  if (budget) bud += `\n• Детали: ${escapeHtml(clipText(budget, 240))}`;
  sections.push(bud);

  const gTagFull = goalsTags.length ? brandTagsPreviewPretty(goalsTags, BRAND_GOALS_TAGS, 10) : '—';
  let g = `🎯 <b>Цели</b>\n• Теги: <b>${escapeHtml(gTagFull)}</b>`;
  if (goals) g += `\n• Детали: ${escapeHtml(clipText(goals, 240))}`;
  sections.push(g);

  const rTagFull = reqTags.length ? brandTagsPreviewPretty(reqTags, BRAND_REQ_TAGS, 10) : '—';
  let r = `🧩 <b>Требования</b>\n• Теги: <b>${escapeHtml(rTagFull)}</b>`;
  if (req) r += `\n• Детали: ${escapeHtml(clipText(req, 240))}`;
  sections.push(r);

  return sections.join('\n\n');
}

async function updateBrandMeta(ownerUserId, patch = {}) {
  const prof = await safeBrandProfiles(() => db.getBrandProfile(ownerUserId), async () => null);
  const cur = parseBrandMeta(prof?.meta);
  const next = { ...cur, ...patch };
  const saved = await safeBrandProfiles(() => db.upsertBrandProfile(ownerUserId, { meta: next }), async () => ({ __missing_relation: true }));
  return saved;
}

function brandCbSuffix(params = {}) {
  const wsId = Number(params.wsId || 0);
  const ret = String(params.ret || 'brand'); // brand | offer | lead | verify
  const bo = params.backOfferId ? Number(params.backOfferId) : null;
  const bp = params.backPage ? Number(params.backPage) : 0;
  let suf = `|ws:${wsId}|ret:${ret}`;
  if (bo) suf += `|bo:${bo}`;
  if (bp) suf += `|bp:${bp}`;
  return suf;
}

function brandBackCb(params = {}) {
  const wsId = Number(params.wsId || 0);
  const ret = String(params.ret || 'brand');
  const bo = params.backOfferId ? Number(params.backOfferId) : null;
  const bp = params.backPage ? Number(params.backPage) : 0;
  if (ret === 'offer' && bo) return `a:offer_open|ws:${wsId}|id:${bo}|p:${bp}`;
  if (ret === 'lead') return `a:bx_inbox|ws:${wsId}|p:${bp}|h:bo`;
  if (ret === 'verify') return 'a:verify_home';
  return wsId ? `a:bx_open|ws:${wsId}` : 'a:bx_open|ws:0';
}

function brandFieldPrompt(field) {
  const map = {
    brand_name: 'Название бренда',
    niche: 'Ниша (текст, legacy)',
    contact: 'Контакт для связи (TG @username или ссылка)',
    brand_link: 'Ссылка на бренд (сайт/Instagram/Telegram)',
    geo: 'Гео (город/страна)',
    budget: 'Детали бюджета (опционально)',
    goals: 'Детали целей (опционально)',
    requirements: 'Детали требований (опционально)'
  };
  const title = map[field] || 'Поле профиля';
  return `✍️ <b>${escapeHtml(title)}</b>

Отправь текст одним сообщением.`;
}

function brandFieldPromptKb(params = {}) {
  const suf = brandCbSuffix(params);
  const from = String(params.from || '');
  if (from === 'more') return new InlineKeyboard().text('⬅️ Назад', `a:brand_profile_more${suf}`).text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');
  // default: back to edit view of base profile
  return new InlineKeyboard().text('⬅️ Назад', `a:brand_profile_edit${suf}`).text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');
}

async function renderBrandProfileHome(ctx, ownerUserId, params = {}) {
  const wsId = Number(params.wsId || 0);
  const ret = String(params.ret || 'brand');
  const bo = params.backOfferId ? Number(params.backOfferId) : null;
  const bp = params.backPage ? Number(params.backPage) : 0;

  const prof = await safeBrandProfiles(
    () => db.getBrandProfile(ownerUserId),
    async () => ({ __missing_relation: true })
  );
  if (prof && prof.__missing_relation) {
    await safeEditOrReply(ctx, '⚠️ В базе нет таблицы brand_profiles. Применяй миграцию migrations/024_brand_profiles.sql в Neon и повтори.', {
      reply_markup: navKb('a:menu')
    });
    return;
  }

  const p = prof || {};
  const meta = parseBrandMeta(p.meta);
  const nicheKey = String(meta.niche_key || '').trim();
  const nicheLabel = BX_CATEGORIES.find((x) => x.key === nicheKey)?.label || '';
  const nicheText = String(p.niche || '').trim();
  const nicheDisplay = nicheLabel || nicheText || '—';
  const nicheOk = !!nicheLabel || !!nicheText;

  const filled = [
    !!String(p.brand_name || '').trim(),
    nicheOk,
    !!String(p.contact || '').trim(),
    !!String(p.brand_link || '').trim()
  ].filter(Boolean).length;

  const suf = brandCbSuffix({ wsId, ret, backOfferId: bo, backPage: bp });

  const flash = String(params.flash || '').trim();
  const flashBlock = flash ? `<i>${escapeHtml(flash)}</i>

` : '';

  const baseText = flashBlock + `🏷 <b>Профиль бренда</b> (${filled}/4)

` +
    `• Название: <b>${escapeHtml(p.brand_name || '—')}</b>
` +
    `• Ниши: <b>${escapeHtml(nicheDisplay)}</b>
` +
    `• Контакт: <b>${escapeHtml(p.contact || '—')}</b>
` +
    `• Ссылка: <b>${escapeHtml(p.brand_link || '—')}</b>

` +
    `⚠️ Заполни 4 поля, чтобы писать креаторам и попадать в каталог брендов.
` +
    `ℹ️ Раздел «Менеджеры бренда» доступен после покупки <b>Brand Pass</b> или <b>Brand Plan</b>.`;

  const kb = new InlineKeyboard();

  if (params.edit) {
    const text = baseText + `

Выбери поле для редактирования:`;
    kb
      .text('✏️ Название', `a:brand_prof_set${suf}|f:bn|from:home`)
      .row()
      .text('🏷 Ниши', `a:brand_niche_pick${suf}|from:home`)
      .text('✍️ Ниша (текст)', `a:brand_prof_set${suf}|f:ni|from:home`)
      .row()
      .text('📞 Контакт', `a:brand_prof_set${suf}|f:ct|from:home`)
      .text('🔗 Ссылка', `a:brand_prof_set${suf}|f:bl|from:home`)
      .row()
      .text('✨ Расширенный', `a:brand_profile_more${suf}`)
      .text('🧹 Сбросить профиль', `a:brand_prof_reset${suf}`)
      .row()
      .text('✅ Готово', `a:brand_profile${suf}`)
      .row()
      .text('⬅️ Назад', brandBackCb({ wsId, ret, backOfferId: bo, backPage: bp }))
      .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');

    const extra = { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true };
    if (ctx.callbackQuery?.message) await safeEditOrReply(ctx, text, extra);
    else await ctx.reply(text, extra);
    return;
  }

  kb
    .text(filled < 4 ? '✍️ Заполнить 4 поля' : '✏️ Изменить 4 поля', `a:brand_profile_edit${suf}`)
    .text('✨ Расширенный', `a:brand_profile_more${suf}`)
    .row()
    .text('🧹 Сбросить профиль', `a:brand_prof_reset${suf}`)
    .text('📋 Меню', 'a:menu')
    .row()
    .text('⬅️ Назад', brandBackCb({ wsId, ret, backOfferId: bo, backPage: bp }));

  const extra = { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true };
  if (params.edit && ctx.callbackQuery?.message) await safeEditOrReply(ctx, baseText, extra);
  else if (ctx.callbackQuery?.message) await safeEditOrReply(ctx, baseText, extra);
  else await ctx.reply(baseText, extra);
}

async function renderBrandNichePicker(ctx, ownerUserId, params = {}) {
  const wsId = Number(params.wsId || 0);
  const ret = String(params.ret || 'brand');
  const bo = params.backOfferId ? Number(params.backOfferId) : null;
  const bp = params.backPage ? Number(params.backPage) : 0;
  const from = String(params.from || 'home'); // home | more

  const prof = await safeBrandProfiles(() => db.getBrandProfile(ownerUserId), async () => null);
  const p = prof || {};
  const meta = parseBrandMeta(p.meta);
  const curKey = String(meta.niche_key || '').trim();
  const curLabel = BX_CATEGORIES.find((x) => x.key === curKey)?.label || '';
  const curText = String(p.niche || '').trim();

  const now = curLabel || curText || '—';

  const suf = brandCbSuffix({ wsId, ret, backOfferId: bo, backPage: bp });
  const backCb = from === 'more' ? `a:brand_profile_more${suf}` : `a:brand_profile_edit${suf}`;

  const mark = (key, label) => `${key === curKey ? '✅ ' : ''}${label}`;

  const kb = new InlineKeyboard();
  // Keep it very clear: single-select.
  for (const c of BX_CATEGORIES) {
    kb.text(mark(c.key, c.label), `a:brand_niche_set${suf}|k:${c.key}|from:${from}`).row();
  }
  kb.row();
  if (curKey) kb.text('🧹 Очистить', `a:brand_niche_clear${suf}|from:${from}`);
  kb.text('✅ Готово', backCb);
  kb.row();
  kbNavRow(kb, backCb);

  const text = `🏷 <b>Ниши бренда</b>
<i>Выбери категорию (как в фильтрах каталога брендов).</i>

Сейчас: <b>${escapeHtml(now)}</b>

Нажимай — ✅ покажет выбранное. Потом «✅ Готово» вернёт назад.`;

  await safeEditOrReply(ctx, text, {
    parse_mode: 'HTML',
    reply_markup: kb,
    disable_web_page_preview: true
  });
}

async function renderBrandBudgetBucketPicker(ctx, ownerUserId, params = {}) {
  const wsId = Number(params.wsId || 0);
  const ret = String(params.ret || 'brand');
  const bo = params.backOfferId ? Number(params.backOfferId) : null;
  const bp = params.backPage ? Number(params.backPage) : 0;

  const prof = await safeBrandProfiles(() => db.getBrandProfile(ownerUserId), async () => null);
  const meta = parseBrandMeta(prof?.meta);
  const cur = String(meta.budget_bucket || '');

  const text = `💰 <b>Бюджет (категория)</b>

` +
    `Сейчас: <b>${escapeHtml(brandBudgetBucketTitle(cur))}</b>

` +
    `<i>Эта категория используется креаторами в каталоге и фильтрах.</i>`;

  const suf = brandCbSuffix({ wsId, ret, backOfferId: bo, backPage: bp });
  const kb = new InlineKeyboard();
  BRAND_BUDGET_BUCKETS.forEach((it) => {
    const on = it.key === cur;
    kb.text(`${on ? '✅' : '▫️'} ${it.title}`, `a:brand_bb_set${suf}|k:${it.key}`).row();
  });
  kb.text('🧹 Очистить', `a:brand_bb_clear${suf}`)
    .text('✅ Готово', `a:brand_bb_done${suf}`);
  kbNavRow(kb, `a:brand_prof_more${suf}`);

  const opts = { parse_mode: 'HTML', reply_markup: kb };
  if (params.edit && ctx.callbackQuery?.message) await safeEditOrReply(ctx, text, opts);
  else await ctx.reply(text, opts);
}

async function renderBrandGoalsTagsPicker(ctx, ownerUserId, params = {}) {
  const wsId = Number(params.wsId || 0);
  const ret = String(params.ret || 'brand');
  const bo = params.backOfferId ? Number(params.backOfferId) : null;
  const bp = params.backPage ? Number(params.backPage) : 0;

  const prof = await safeBrandProfiles(() => db.getBrandProfile(ownerUserId), async () => null);
  const meta = parseBrandMeta(prof?.meta);
  const cur = Array.isArray(meta.goals_tags) ? meta.goals_tags.map(String) : [];
  const selected = cur.filter((k) => BRAND_GOALS_KEYS.has(k));

  const text = `🎯 <b>Цели (теги)</b>

` +
    `Сейчас: <b>${escapeHtml(brandTagsPreview(selected, BRAND_GOALS_TAGS, 6))}</b>

` +
    `<i>Эти теги используются креаторами в каталоге и фильтрах.</i>`;

  const suf = brandCbSuffix({ wsId, ret, backOfferId: bo, backPage: bp });
  const kb = new InlineKeyboard();
  BRAND_GOALS_TAGS.forEach((it, i) => {
    const on = selected.includes(it.key);
    kb.text(`${on ? '✅' : '▫️'} ${it.title}`, `a:brand_gt_t${suf}|k:${it.key}`);
    if (i % 2 === 1) kb.row();
  });
  kb.row().text('🧹 Сброс', `a:brand_gt_clear${suf}`).text('✅ Готово', `a:brand_gt_done${suf}`);
  kbNavRow(kb, `a:brand_prof_more${suf}`);

  const opts = { parse_mode: 'HTML', reply_markup: kb };
  if (params.edit && ctx.callbackQuery?.message) await safeEditOrReply(ctx, text, opts);
  else await ctx.reply(text, opts);
}

async function renderBrandReqTagsPicker(ctx, ownerUserId, params = {}) {
  const wsId = Number(params.wsId || 0);
  const ret = String(params.ret || 'brand');
  const bo = params.backOfferId ? Number(params.backOfferId) : null;
  const bp = params.backPage ? Number(params.backPage) : 0;

  const prof = await safeBrandProfiles(() => db.getBrandProfile(ownerUserId), async () => null);
  const meta = parseBrandMeta(prof?.meta);
  const cur = Array.isArray(meta.req_tags) ? meta.req_tags.map(String) : [];
  const selected = cur.filter((k) => BRAND_REQ_KEYS.has(k));

  const text = `📎 <b>Требования (теги)</b>

` +
    `Сейчас: <b>${escapeHtml(brandTagsPreview(selected, BRAND_REQ_TAGS, 6))}</b>

` +
    `<i>Эти теги используются креаторами в каталоге и фильтрах.</i>`;

  const suf = brandCbSuffix({ wsId, ret, backOfferId: bo, backPage: bp });
  const kb = new InlineKeyboard();
  BRAND_REQ_TAGS.forEach((it, i) => {
    const on = selected.includes(it.key);
    kb.text(`${on ? '✅' : '▫️'} ${it.title}`, `a:brand_rt_t${suf}|k:${it.key}`);
    if (i % 2 === 1) kb.row();
  });
  kb.row().text('🧹 Сброс', `a:brand_rt_clear${suf}`).text('✅ Готово', `a:brand_rt_done${suf}`);
  kbNavRow(kb, `a:brand_prof_more${suf}`);

  const opts = { parse_mode: 'HTML', reply_markup: kb };
  if (params.edit && ctx.callbackQuery?.message) await safeEditOrReply(ctx, text, opts);
  else await ctx.reply(text, opts);
}



async function renderBrandCollabTypesPicker(ctx, ownerUserId, params = {}) {
  const wsId = Number(params.wsId || 0);
  const ret = String(params.ret || 'brand');
  const bo = params.backOfferId ? Number(params.backOfferId) : null;
  const bp = params.backPage ? Number(params.backPage) : 0;

  const prof = await safeBrandProfiles(() => db.getBrandProfile(ownerUserId), async () => null);
  const raw = String(prof?.collab_types || '').trim();
  const selected = parseBrandCollabTypes(raw);

  const nowTxt = selected.length ? fmtMatrix(selected, BRAND_COLLAB_TYPES) : (raw ? raw : '—');
  const legacyHint = (!selected.length && raw)
    ? `

ℹ️ У тебя был текстовый список. Выбери пункты ниже — я переведу в структурированный формат.`
    : '';

  const text =
    `🧩 <b>Форматы сотрудничества</b>

` +
    `Выбери, что вы обычно делаете с креаторами (можно несколько).

` +
    `Сейчас: <b>${escapeHtml(nowTxt)}</b>

` +
    `Рекомендация: 3–10 пунктов.` +
    legacyHint;

  const suf = brandCbSuffix({ wsId, ret, backOfferId: bo, backPage: bp });
  const kb = new InlineKeyboard();

  BRAND_COLLAB_TYPES.forEach((it, i) => {
    const on = selected.includes(it.key);
    kb.text(`${on ? '✅' : '▫️'} ${it.title}`, `a:brand_ty_t${suf}|k:${it.key}`);
    if (i % 2 === 1) kb.row();
  });
  kb.row()
    .text('🧹 Сброс', `a:brand_ty_clear${suf}`)
    .text('✅ Готово', `a:brand_ty_done${suf}`);
  kbNavRow(kb, `a:brand_prof_more${suf}`);

  const opts = { parse_mode: 'HTML', reply_markup: kb };
  if (params.edit && ctx.callbackQuery?.message) {
    await safeEditOrReply(ctx, text, opts);
  } else {
    await ctx.reply(text, opts);
  }
}


async function renderBrandProfileMore(ctx, ownerUserId, params = {}) {
  const prof = await safeBrandProfiles(() => db.getBrandProfile(ownerUserId), async () => null);
  const p = prof || {};

  const meta = parseBrandMeta(p.meta);
  const budgetKey = BRAND_BUDGET_KEYS.has(String(meta.budget_bucket || '')) ? String(meta.budget_bucket) : '';
  const goalsTags = Array.isArray(meta.goals_tags) ? meta.goals_tags.map(String).filter((k) => BRAND_GOALS_KEYS.has(k)) : [];
  const reqTags = Array.isArray(meta.req_tags) ? meta.req_tags.map(String).filter((k) => BRAND_REQ_KEYS.has(k)) : [];

  const flash = String(params.flash || '').trim();
  const flashBlock = flash ? `<i>${escapeHtml(flash)}</i>

` : '';

  const details = formatBrandDetailsBlock(p, { variant: 'full', meta });

  const txt =
    flashBlock + `➕ <b>Расширенный профиль бренда</b>

` +
    `Заполни детали — это повышает доверие (и помогает в Brand-верификации).

` +
    `<i>Эти параметры используются креаторами в каталоге брендов и фильтрах.</i>
` +
    `<i>Чтобы попадать в выдачу по формату/оплате — заполни «🧩 Форматы».</i>

` +
    details;

  const suf = brandCbSuffix(params);
  const kb = new InlineKeyboard()
    .text('🌍 Гео', `a:brand_prof_set${suf}|f:ge|from:more`)
    .text('🧩 Форматы', `a:brand_prof_set${suf}|f:ty|from:more`)
    .row()
    .text('✍️ Детали бюджета', `a:brand_prof_set${suf}|f:bu|from:more`)
    .text('💠 Категория', `a:brand_bb_pick${suf}`)
    .row()
    .text('✍️ Детали целей', `a:brand_prof_set${suf}|f:go|from:more`)
    .text('🎯 Теги', `a:brand_gt_pick${suf}`)
    .row()
    .text('✍️ Детали требований', `a:brand_prof_set${suf}|f:rq|from:more`)
    .text('🏷 Теги', `a:brand_rt_pick${suf}`)
    .row();
  kbNavRow(kb, `a:brand_profile${suf}`);

  const opts = { parse_mode: 'HTML', reply_markup: kb };
  if (params.edit && ctx.callbackQuery?.message) {
    await safeEditOrReply(ctx, txt, opts);
  } else if (ctx.callbackQuery?.message) {
    await safeEditOrReply(ctx, txt, opts);
  } else {
    await ctx.reply(txt, opts);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Brand Directory (Creator): list brands with basic profile + paid (pass/plan)
// Commit 16
// ─────────────────────────────────────────────────────────────────────────────

function brandContactUrl(contactRaw) {
  const c = String(contactRaw || '').trim();
  if (!c) return null;
  if (/^https?:\/\//i.test(c)) return c;
  if (c.startsWith('@') && c.length > 1) return `https://t.me/${c.slice(1)}`;
  // common inputs: t.me/xxx or telegram.me/xxx
  if (/^(t\.me|telegram\.me)\//i.test(c)) return `https://${c}`;
  if (/^https?:\/\/(t\.me|telegram\.me)\//i.test(c)) return c;
  return null;
}

// Split badges by semantics: formats vs payment
// Examples:
//  - Formats: integration · review
//  - Pay: barter · cert

// Human labels for brand collab tags (stored as keys, shown as emoji+labels)
// short: compact (used in list buttons), long: readable (used in brand card)
const BRAND_COLLAB_TAG_LABELS = {
  // formats
  integration: { short: '📣Реклама', long: '📣 Реклама' },
  review: { short: '🔎Обзор', long: '🔎 Обзор' },
  unboxing: { short: '📦Распак', long: '📦 Распаковка' },
  giveaway: { short: '🎁Розыг', long: '🎁 Розыгрыш' },
  ugc: { short: '🎬UGC', long: '🎬 UGC' },
  other: { short: '✨Другое', long: '✨ Другое' },
  // payments
  barter: { short: '🤝Бартер', long: '🤝 Бартер' },
  cert: { short: '🎟Серт', long: '🎟 Сертификат' },
  paid: { short: '💰Оплата', long: '💰 Оплата' },
  mixed: { short: '🔀Микс', long: '🔀 Микс' }
};

function brandCollabTagLabel(key, mode = 'long') {
  const k = String(key || '').trim();
  if (!k) return '';
  const m = BRAND_COLLAB_TAG_LABELS[k];
  if (!m) return k;
  return mode === 'short' ? m.short : m.long;
}

function brandCollabTagBadgesSplit(raw, opts = {}) {
  const maxFormats = Math.max(0, Math.min(12, Number(opts.maxFormats ?? 4)));
  const maxPay = Math.max(0, Math.min(12, Number(opts.maxPay ?? 3)));
  const filter = opts.filter || null;

  const keys = parseBrandCollabTypes(String(raw || '').trim());
  if (!keys.length) return { formatsArr: [], payArr: [], formats: '', pay: '' };

  const payKeys = new Set(['barter', 'cert', 'paid', 'mixed']);
  const offerPref = {
    ad: ['integration', 'stories', 'reels', 'post', 'ambassador'],
    review: ['review', 'unboxing'],
    ugc: ['ugc'],
    giveaway: ['giveaway'],
    other: ['other']
  };
  const compPref = {
    barter: ['barter'],
    cert: ['cert'],
    paid: ['paid'],
    // backward-compat: older filters used 'rub'
    rub: ['paid'],
    mixed: ['mixed']
  };

  const pushUnique = (arr, seen, k) => {
    if (!k || seen.has(k)) return;
    seen.add(k);
    arr.push(k);
  };

  const formatsArr = [];
  const payArr = [];
  const seenF = new Set();
  const seenP = new Set();

  // Prefer tags that match active filters (so it's obvious why brand is shown)
  if (filter && filter.offerType && offerPref[filter.offerType]) {
    for (const k of offerPref[filter.offerType]) {
      if (keys.includes(k) && !payKeys.has(k)) pushUnique(formatsArr, seenF, k);
    }
  }
  if (filter && filter.compensationType && compPref[filter.compensationType]) {
    for (const k of compPref[filter.compensationType]) {
      if (keys.includes(k) && payKeys.has(k)) pushUnique(payArr, seenP, k);
    }
  }

  // Then fill the rest (formats first, then payments)
  for (const k of keys) {
    if (!payKeys.has(k)) pushUnique(formatsArr, seenF, k);
    if (maxFormats && formatsArr.length >= maxFormats) break;
  }
  for (const k of keys) {
    if (payKeys.has(k)) pushUnique(payArr, seenP, k);
    if (maxPay && payArr.length >= maxPay) break;
  }

  const formats = maxFormats ? formatsArr.slice(0, maxFormats).map(k => brandCollabTagLabel(k, 'long')).join(' · ') : '';
  const pay = maxPay ? payArr.slice(0, maxPay).map(k => brandCollabTagLabel(k, 'long')).join(' · ') : '';

  return { formatsArr, payArr, formats, pay };
}

// Back-compat single-line badges (older screens)
function brandCollabTagBadges(raw, opts = {}) {
  const max = Math.max(1, Math.min(12, Number(opts.max || 6)));
  const filter = opts.filter || null;

  // roughly split max across two groups
  const maxFormats = Math.max(1, Math.ceil(max * 0.6));
  const maxPay = Math.max(1, max - maxFormats);

  const split = brandCollabTagBadgesSplit(raw, { maxFormats, maxPay, filter });
  const parts = [];
  if (split.formats) parts.push(split.formats);
  if (split.pay) parts.push(split.pay);
  return parts.join(' · ');
}

function brandDirectoryButtonLabel(bp, filter = null) {
  const name = String(bp?.brand_name || 'Бренд').trim() || 'Бренд';
  const niche = String(bp?.niche || '').trim();

  const split = brandCollabTagBadgesSplit(bp?.collab_types, { maxFormats: 2, maxPay: 2, filter });
  const fmtMini = split.formatsArr.slice(0, 2).map(k => brandCollabTagLabel(k, 'short')).join('·');
  const payMini = split.payArr.slice(0, 2).map(k => brandCollabTagLabel(k, 'short')).join('·');

  const parts = [name];
  if (niche) parts.push(niche);
  if (fmtMini) parts.push(`Форматы:${fmtMini}`);
  if (payMini) parts.push(`Оплата:${payMini}`);

  // Telegram inline button text limit is 64 chars; keep some margin.
  return clipText(parts.join(' · '), 56);
}


// Brand Directory filters (Creator): stored in Redis per viewer (tgId)
// Shape: { category, offerType, compensationType, budgetBucket, goalsTags[], reqTags[] }
const BD_FILTER_TTL_SEC = 60 * 60 * 24 * 14;

function brandDirFilterKey(tgId) {
  const id = Number(tgId || 0);
  return k(['bd_filter', id]);
}

function parseMaybeJson(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return null;
}

async function getBrandDirFilter(tgId, legacyUserId = null) {
  const id = Number(tgId || 0);
  const legacyId = Number(legacyUserId || 0);

  // 1) Preferred: namespaced key
  const keyNew = brandDirFilterKey(id);
  let raw = null;
  try { raw = await redisGetSafe(keyNew); } catch { raw = null; }

  // 2) Legacy fallbacks (older commits stored by tgId or by db userId)
  let usedLegacy = false;
  if (!raw) {
    try {
      raw = await redisGetSafe(`bd_filter:${id}`);
      if (raw) usedLegacy = true;
    } catch {}
  }
  if (!raw && legacyId) {
    try {
      raw = await redisGetSafe(`bd_filter:${legacyId}`);
      if (raw) usedLegacy = true;
    } catch {}
  }

  const base = parseMaybeJson(raw) || {};

  const f = {
    category: typeof base.category === 'string' ? base.category : null,
    offerType: typeof base.offerType === 'string' ? base.offerType : null,
    compensationType: typeof base.compensationType === 'string' ? base.compensationType : null,
    budgetBucket: typeof base.budgetBucket === 'string' ? base.budgetBucket : null,
    goalsTags: Array.isArray(base.goalsTags) ? base.goalsTags : (typeof base.goalsTags === 'string' ? base.goalsTags.split(',') : []),
    reqTags: Array.isArray(base.reqTags) ? base.reqTags : (typeof base.reqTags === 'string' ? base.reqTags.split(',') : []),
  };

  if (!f.category || f.category === 'all') f.category = null;
  if (!f.offerType || f.offerType === 'all') f.offerType = null;
  if (!f.compensationType || f.compensationType === 'all') f.compensationType = null;
  if (!f.budgetBucket || f.budgetBucket === 'all') f.budgetBucket = null;

  // Backward-compat: older values used 'rub' for money. Canonical is 'paid' in Brand Directory.
  if (f.compensationType === 'rub') f.compensationType = 'paid';

  const allowedTypes = new Set(['ad', 'review', 'ugc', 'giveaway', 'other']);
  const allowedComp = new Set(['barter', 'cert', 'paid', 'mixed']);

  if (f.offerType && !allowedTypes.has(f.offerType)) f.offerType = null;
  if (f.compensationType && !allowedComp.has(f.compensationType)) f.compensationType = null;

  if (f.budgetBucket && !BRAND_BUDGET_KEYS.has(f.budgetBucket)) f.budgetBucket = null;
  f.goalsTags = uniqStrArr(f.goalsTags).filter((k2) => BRAND_GOALS_KEYS.has(k2));
  f.reqTags = uniqStrArr(f.reqTags).filter((k2) => BRAND_REQ_KEYS.has(k2));

  // Migrate legacy payload to namespaced key (best-effort)
  if (usedLegacy) {
    try { await redis.set(keyNew, f, { ex: BD_FILTER_TTL_SEC }); } catch {}
  }

  return f;
}

async function setBrandDirFilter(tgId, filter, legacyUserId = null) {
  const id = Number(tgId || 0);
  const legacyId = Number(legacyUserId || 0);
  if (!id) return;

  const payload = filter || {};
  const keyNew = brandDirFilterKey(id);

  // Preferred
  await redis.set(keyNew, payload, { ex: BD_FILTER_TTL_SEC });

  // Back-compat: also write legacy raw keys (stringified JSON)
  try { await redis.set(`bd_filter:${id}`, JSON.stringify(payload), { ex: BD_FILTER_TTL_SEC }); } catch {}
  if (legacyId) {
    try { await redis.set(`bd_filter:${legacyId}`, JSON.stringify(payload), { ex: BD_FILTER_TTL_SEC }); } catch {}
  }
}

function kbAddPairs(kb, items, perRow = 2) {
  const n = Math.max(1, Math.min(3, Number(perRow) || 2));
  let i = 0;
  for (const it of (items || [])) {
    if (!it) continue;
    kb.text(it.text, it.cb);
    i++;
    if (i % n === 0) kb.row();
  }
  if (i % n !== 0) kb.row();
}

function brandDirTypeLabel(t) {
  switch (String(t || '')) {
    case 'ad': return '📣 Реклама';
    case 'review': return '🎥 Обзор';
    case 'ugc': return '🎬 UGC';
    case 'giveaway': return '🎁 Розыгрыш';
    case 'other':
    default: return '✍️ Другое';
  }
}

function brandDirCompLabel(p) {
  switch (String(p || '')) {
    case 'barter': return '🤝 Бартер';
    case 'cert': return '🎟 Сертификат';
    case 'paid':
    case 'rub': return '💸 ₽';
    case 'mixed':
    default: return '🔁 Смешано';
  }
}

function brandDirFilterSummary(f) {
  const catLabel = f.category ? (BX_CATEGORIES.find((x) => x.key === f.category)?.label || f.category) : 'Все';
  const typeLabel = f.offerType ? brandDirTypeLabel(f.offerType) : 'Все';
  const compLabel = f.compensationType ? brandDirCompLabel(f.compensationType) : 'Все';
  const budLabel = f.budgetBucket ? brandBudgetBucketTitle(f.budgetBucket) : 'Все';
  const goalsLabel = f.goalsTags?.length ? `${f.goalsTags.length} тег(а)` : 'Все';
  const reqLabel = f.reqTags?.length ? `${f.reqTags.length} тег(а)` : 'Все';

  return `Категория: ${catLabel} · Формат: ${typeLabel} · Оплата: ${compLabel}` +
    ` · Бюджет: ${budLabel} · Цели: ${goalsLabel} · Требования: ${reqLabel}`;
}

function brandDirFiltersKb(f, page = 0) {
  const kb = new InlineKeyboard();

  const catLabel = f.category ? (BX_CATEGORIES.find((x) => x.key === f.category)?.label || f.category) : 'Все';
  const typeLabel = f.offerType ? brandDirTypeLabel(f.offerType) : 'Все';
  const compLabel = f.compensationType ? brandDirCompLabel(f.compensationType) : 'Все';
  const budLabel = f.budgetBucket ? brandBudgetBucketTitle(f.budgetBucket) : 'Все';
  const goalsLabel = f.goalsTags?.length ? `${f.goalsTags.length}` : 'Все';
  const reqLabel = f.reqTags?.length ? `${f.reqTags.length}` : 'Все';

  kb
    .text(`Категория: ${catLabel}`, `a:bd_fpick|k:cat|p:${page}`)
    .text(`Формат: ${typeLabel}`, `a:bd_fpick|k:type|p:${page}`)
    .row()
    .text(`Оплата: ${compLabel}`, `a:bd_fpick|k:comp|p:${page}`)
    .text(`Бюджет: ${budLabel}`, `a:bd_fpick|k:bud|p:${page}`)
    .row()
    .text(`Цели: ${goalsLabel}`, `a:bd_mpick|k:goals|p:${page}`)
    .text(`Треб.: ${reqLabel}`, `a:bd_mpick|k:req|p:${page}`)
    .row();

  kb
    .text('♻️ Сбросить', `a:bd_freset|p:0`)
    .text('📋 Показать бренды', `a:brands_home|p:0`);

  kbNavRow(kb, `a:brands_home|p:${page}`);
  return kb;
}


function brandDirPickKb(key, page = 0, currentVal = null) {
  const kb = new InlineKeyboard();
  const cur = currentVal == null ? null : String(currentVal);

  const mark = (val, label) => {
    const v = val == null ? 'all' : String(val);
    const on = (cur == null && v === 'all') || (cur != null && v === cur);
    return `${on ? '✅ ' : ''}${label}`;
  };

  const cb = (k2, v2) => `a:bd_fset|k:${k2}|v:${v2}|p:${page}|s:1`;

  if (key === 'cat') {
    kb.text(mark(null, 'Все'), cb('cat', 'all')).row();
    const items = BX_CATEGORIES.map((c) => ({
      text: mark(c.key, c.label),
      cb: cb('cat', c.key)
    }));
    kbAddPairs(kb, items, 2);
  }

  if (key === 'type') {
    kb.text(mark(null, 'Все'), cb('type', 'all')).row();
    const items = [
      { key: 'ad', title: '📣 Реклама' },
      { key: 'review', title: '🎥 Обзор' },
      { key: 'ugc', title: '🎬 UGC' },
      { key: 'giveaway', title: '🎁 Розыгрыш' },
      { key: 'other', title: '✍️ Другое' },
    ].map((t) => ({
      text: mark(t.key, t.title),
      cb: cb('type', t.key)
    }));
    kbAddPairs(kb, items, 2);
  }

  if (key === 'comp') {
    kb.text(mark(null, 'Все'), cb('comp', 'all')).row();
    const items = [
      { key: 'barter', title: '🤝 Бартер' },
      { key: 'cert', title: '🎟 Сертификат' },
      // Canonical is paid (stored in brand_profiles.collab_types)
      { key: 'paid', title: '💸 ₽' },
      { key: 'mixed', title: '🔁 Смешано' },
    ].map((t) => ({
      text: mark(t.key, t.title),
      cb: cb('comp', t.key)
    }));
    kbAddPairs(kb, items, 2);
  }

  if (key === 'bud') {
    kb.text(mark(null, 'Все'), cb('bud', 'all')).row();
    const items = BRAND_BUDGET_BUCKETS.map((b) => ({
      text: mark(b.key, b.title),
      cb: cb('bud', b.key)
    }));
    kbAddPairs(kb, items, 2);
  }

  // Explicit "done" to return to filters
  kb.row().text('✅ Готово', `a:brands_filters|p:${page}`);

  kbNavRow(kb, `a:brands_filters|p:${page}`);
  return kb;
}


function brandDirMultiPickKb(key, page, selected) {
  const kb = new InlineKeyboard();
  const set = new Set(selected || []);
  const list = key === 'goals' ? BRAND_GOALS_TAGS : BRAND_REQ_TAGS;

  for (const t of list) {
    const on = set.has(t.key);
    kb.text(`${on ? '✅ ' : ''}${t.title}`, `a:bd_mt|k:${key}|v:${t.key}|p:${page}`).row();
  }

  kb.row();
  if (set.size) kb.text('🧹 Очистить', `a:bd_mclear|k:${key}|p:${page}`);
  kb.text('✅ Готово', `a:bd_mdone|p:${page}`);
  kb.row();
  kbNavRow(kb, `a:brands_filters|p:${page}`);

  return kb;
}

async function renderBrandDirFilters(ctx, viewerUserId, params = {}) {
  const page = Math.max(0, Number(params.page || 0));
  let f = null;
  try {
    f = await withTimeout(getBrandDirFilter(viewerUserId, params.legacyUserId), 1800, 'brands.filter');
  } catch {
    f = {};
  }

  // Small helper count: makes it obvious whether "0 results" is data vs filter logic
  let matchCount = null;
  try {
    const c = await safeBrandProfiles(() => db.countBrandsDirectoryFiltered(f), async () => null);
    matchCount = c === null || c === undefined ? null : Number(c);
    if (!Number.isFinite(matchCount)) matchCount = null;
  } catch {
    matchCount = null;
  }

  const text = `🎛 <b>Фильтры брендов</b>
<i>Режим: 🎬 Креатор · Ты ищешь: 🏷 бренды</i>
<i>Фильтруем бренды по тому, что бренд заполнил в профиле.</i>

${escapeHtml(brandDirFilterSummary(f))}
${matchCount !== null ? `
Совпадений брендов: <b>${matchCount}</b>` : ''}

<i>Настройки применяются к каталогу сразу. Нажми «📋 Показать бренды», чтобы увидеть выдачу.</i>`;

  await safeEditOrReply(ctx, text, {
    parse_mode: 'HTML',
    reply_markup: brandDirFiltersKb(f, page),
    disable_web_page_preview: true
  });
}

async function renderBrandDirFilterPick(ctx, viewerUserId, params = {}) {
  const page = Math.max(0, Number(params.page || 0));
  const key = String(params.key || 'cat');
  const title = key === 'cat' ? 'Категория' : (key === 'type' ? 'Формат' : (key === 'comp' ? 'Оплата' : 'Бюджет'));

  const f = await getBrandDirFilter(viewerUserId, params.legacyUserId);

  const hint =
    key === 'cat' ? 'По нише, указанной брендом (поле «Ниша»).' :
    key === 'type' ? 'По 🧩 форматам сотрудничества в профиле бренда.' :
    key === 'comp' ? 'По 💳 оплате, указанной брендом в профиле.' :
    key === 'bud' ? 'По 💰 бюджету из расширенного профиля бренда.' :
    'По данным профиля бренда.';

  const cur =
    key === 'cat' ? (f.category ? (BX_CATEGORIES.find((x) => x.key === f.category)?.label || f.category) : 'Все') :
    key === 'type' ? (f.offerType ? brandDirTypeLabel(f.offerType) : 'Все') :
    key === 'comp' ? (f.compensationType ? brandDirCompLabel(f.compensationType) : 'Все') :
    key === 'bud' ? (f.budgetBucket ? brandBudgetBucketTitle(f.budgetBucket) : 'Все') :
    '—';

  const currentVal =
    key === 'cat' ? (f.category || null) :
    key === 'type' ? (f.offerType || null) :
    key === 'comp' ? (f.compensationType || null) :
    key === 'bud' ? (f.budgetBucket || null) :
    null;

  const text = `🎛 <b>${title}</b>
<i>${escapeHtml(hint)}</i>

Текущее: <b>${escapeHtml(cur)}</b>

Выбери значение:`;

  await safeEditOrReply(ctx, text, {
    parse_mode: 'HTML',
    reply_markup: brandDirPickKb(key, page, currentVal),
    disable_web_page_preview: true
  });
}

async function renderBrandDirMultiPick(ctx, viewerUserId, params = {}) {
  const page = Math.max(0, Number(params.page || 0));
  const key = String(params.key || 'goals');
  const f = await getBrandDirFilter(viewerUserId, params.legacyUserId);
  const selected = key === 'goals' ? f.goalsTags : f.reqTags;
  const title = key === 'goals' ? 'Цели (теги)' : 'Требования (теги)';

  const hint = key === 'goals'
    ? 'По 🎯 целям, которые бренд отметил в расширенном профиле.'
    : 'По 📎 требованиям, которые бренд отметил в расширенном профиле.';

  const text = `🎛 <b>${title}</b>
<i>${escapeHtml(hint)}</i>

Выбрано: <b>${selected.length || 0}</b>

Выбери теги:`;

  await safeEditOrReply(ctx, text, {
    parse_mode: 'HTML',
    reply_markup: brandDirMultiPickKb(key, page, selected),
    disable_web_page_preview: true
  });
}
async function renderBrandsDirectory(ctx, viewerUserId, params = {}) {
  const page = Math.max(0, Number(params.page || 0));
  const edit = !!params.edit;
  const PAGE_SIZE = 8;
  const offset = page * PAGE_SIZE;

  const stepId = `brands_home:p${page}`;

  const f = await p0Await(ctx, stepId, `${stepId}:getFilter`, () => getBrandDirFilter(viewerUserId, params.legacyUserId), 2500);

  const rows = await p0Await(ctx, stepId, `${stepId}:list`, () => withTimeout(
      safeBrandProfiles(
        () => db.listBrandsDirectoryFiltered(PAGE_SIZE + 1, offset, f),
        async () => ({ __missing_relation: true })
      ), 4500, 'brands.list'), 4500);
  if (rows && rows.__missing_relation) {
    const msg = '⚠️ В базе нет таблицы brand_profiles. Применяй миграцию migrations/024_brand_profiles.sql в Neon и повтори.';
    if (edit && ctx.callbackQuery?.message) await safeEditOrReply(ctx, msg, { reply_markup: navKb('a:menu') });
    else await ctx.reply(msg, { reply_markup: navKb('a:menu') });
    return;
  }

  const list = Array.isArray(rows) ? rows : [];
  const hasMore = list.length > PAGE_SIZE;
  const items = list.slice(0, PAGE_SIZE);

  const hasActiveFilters = !!(f.category || f.offerType || f.compensationType || f.budgetBucket || (f.goalsTags && f.goalsTags.length) || (f.reqTags && f.reqTags.length));
  let text = `🏷 <b>Каталог брендов</b>\n<i>Режим: 🎬 Креатор · Ты ищешь: 🏷 бренды</i>\n\n` +
    `Фильтры брендов: <b>${escapeHtml(brandDirFilterSummary(f))}</b>\n\n` +
    `<i>Фильтры берутся из настроек брендов (профиль → 🧩 Форматы + расширенный профиль: 💠 Бюджет/🎯 Цели/📎 Требования).</i>\n\n` +
    `Показываю бренды с заполненным профилем (4/4).\n\n`;

  if (!items.length) {
    if (hasActiveFilters) {
      text += `Ничего не найдено под выбранные фильтры.\n\n` +
        `💡 Фильтры строятся по настройкам брендов. Если бренд не выбрал «🧩 Форматы» (и при необходимости не заполнил 💠 Бюджет/🎯 Цели/📎 Требования), он может не попасть в выдачу.\n\n` +
        `Попробуй ослабить фильтры или нажми «♻️ Сброс».`;
    } else {
      text += `Пока брендов нет.\n\n` +
        `Если ты бренд — заполни профиль (4/4), тогда ты появишься в каталоге.`;
    }
  } else {
    text += `Выбери бренд:`;
  }

  const kb = new InlineKeyboard();
  kb.text('🎛 Фильтры брендов', `a:brands_filters|p:${page}`);
  if (hasActiveFilters) kb.text('♻️ Сброс', `a:bd_freset|p:${page}`);
  kb.row();
  for (const bp of items) {
    kb.text(brandDirectoryButtonLabel(bp, f), `a:brand_dir_open|u:${Number(bp.user_id)}|p:${page}`).row();
  }

  if (page > 0 || hasMore) {
    if (page > 0) kb.text('⬅️ Назад', `a:brands_home|p:${page - 1}`);
    if (hasMore) kb.text('➡️ Далее', `a:brands_home|p:${page + 1}`);
    kb.row();
  }

  kb.text('📋 Меню', 'a:menu');

  const extra = { parse_mode: 'HTML', reply_markup: kb };
  if (edit && ctx.callbackQuery?.message) await safeEditOrReply(ctx, text, extra);
  else await ctx.reply(text, extra);
}

async function renderBrandDirectoryCard(ctx, viewerUserId, params = {}) {
  const brandUserId = Number(params.brandUserId || 0);
  const backPage = Math.max(0, Number(params.backPage || 0));
  const edit = !!params.edit;
  if (!brandUserId) return;

  const prof = await safeBrandProfiles(
    () => db.getBrandProfile(brandUserId),
    async () => ({ __missing_relation: true })
  );
  if (prof && prof.__missing_relation) {
    const msg = '⚠️ В базе нет таблицы brand_profiles. Применяй миграцию migrations/024_brand_profiles.sql в Neon и повтори.';
    if (edit && ctx.callbackQuery?.message) await safeEditOrReply(ctx, msg, { reply_markup: navKb('a:menu') });
    else await ctx.reply(msg, { reply_markup: navKb('a:menu') });
    return;
  }
  if (!prof) {
    const kb = new InlineKeyboard();
    kbNavRow(kb, `a:brands_home|p:${backPage}`);
    if (edit && ctx.callbackQuery?.message) await safeEditOrReply(ctx, '⚠️ Бренд не найден.', { reply_markup: kb });
    else await ctx.reply('⚠️ Бренд не найден.', { reply_markup: kb });
    return;
  }

  const name = String(prof.brand_name || 'Бренд').trim() || 'Бренд';
  const niche = String(prof.niche || '').trim();
  const geo = String(prof.geo || '').trim();
  const formats = brandCollabTypesDisplay(String(prof.collab_types || '').trim());

  let viewerFilter = null;
  try {
    viewerFilter = await getBrandDirFilter(viewerUserId, params.legacyUserId);
  } catch (_) {
    viewerFilter = null;
  }
  const splitTags = brandCollabTagBadgesSplit(String(prof.collab_types || '').trim(), { maxFormats: 8, maxPay: 6, filter: viewerFilter });

  const meta = parseBrandMeta(prof.meta);
  const budgetBucketKey = BRAND_BUDGET_KEYS.has(String(meta.budget_bucket || '')) ? String(meta.budget_bucket) : '';
  const goalsTags = Array.isArray(meta.goals_tags) ? meta.goals_tags.map(String).filter((k) => BRAND_GOALS_KEYS.has(k)) : [];
  const reqTags = Array.isArray(meta.req_tags) ? meta.req_tags.map(String).filter((k) => BRAND_REQ_KEYS.has(k)) : [];
  const budgetBucketTitle = budgetBucketKey ? brandBudgetBucketTitle(budgetBucketKey) : '';
  const goalsTagsTitle = goalsTags.length ? brandTagsPreview(goalsTags, BRAND_GOALS_TAGS, 7) : '';
  const reqTagsTitle = reqTags.length ? brandTagsPreview(reqTags, BRAND_REQ_TAGS, 7) : '';

  const budget = String(prof.budget || '').trim();
  const goals = String(prof.goals || '').trim();
  const req = String(prof.requirements || '').trim();
  const link = String(prof.brand_link || '').trim();

  const collabKeysAll = parseBrandCollabTypes(String(prof.collab_types || '').trim());
  const payKeySet = new Set(['barter', 'cert', 'paid', 'mixed']);
  const totalFormats = collabKeysAll.filter((k) => !payKeySet.has(k)).length;
  const totalPay = collabKeysAll.filter((k) => payKeySet.has(k)).length;

  let text = `🏷 <b>${escapeHtml(name)}</b>

`;
  if (niche) text += `🎯 Ниша: <b>${escapeHtml(niche)}</b>

`;


  const compact = formatBrandDetailsBlock(prof, { variant: 'compact', meta, splitTags, totals: { formats: totalFormats, pay: totalPay } });
  if (compact) text += compact + `

`;

  const kb = new InlineKeyboard();
  const brandUrl = link && (/^https?:\/\//i.test(link) ? link : null);
  if (brandUrl) kb.url('🔗 Ссылка бренда', brandUrl).row();

  kb.text('📝 Оставить заявку', `a:brand_apply|u:${brandUserId}|p:${backPage}`).row();

  kb.text('⬅️ Назад к списку', `a:brands_home|p:${backPage}`).row();
  kb.text('📋 Меню', 'a:menu');

  const extra = { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true };
  if (edit && ctx.callbackQuery?.message) await safeEditOrReply(ctx, text, extra);
  else await ctx.reply(text, extra);
}

// --- Brand Directory: creator -> brand application draft (confirm before send) ---
function brandApplyDraftKey(tgId, brandUserId) {
  return k(['draft', 'brand_apply', String(tgId), String(brandUserId)]);
}

async function setBrandApplyDraft(tgId, brandUserId, draft, ttlSec = 20 * 60) {
  try {
    await redis.set(brandApplyDraftKey(tgId, brandUserId), draft, { ex: ttlSec });
  } catch (e) {
    try { console.warn('[REDIS] setBrandApplyDraft failed', { tgId, brandUserId, err: errInfo(e) }); } catch {}
  }
}

async function getBrandApplyDraft(tgId, brandUserId) {
  try {
    return await redis.get(brandApplyDraftKey(tgId, brandUserId));
  } catch (e) {
    try { console.warn('[REDIS] getBrandApplyDraft failed', { tgId, brandUserId, err: errInfo(e) }); } catch {}
    return null;
  }
}

async function clearBrandApplyDraft(tgId, brandUserId) {
  try {
    await redis.del(brandApplyDraftKey(tgId, brandUserId));
  } catch (e) {
    try { console.warn('[REDIS] clearBrandApplyDraft failed', { tgId, brandUserId, err: errInfo(e) }); } catch {}
  }
}

async function renderBrandApply(ctx, u, brandUserId, backPage, opts = {}) {
  const edit = !!opts.edit;
  const startWrite = !!opts.startWrite;
  if (!brandUserId) return;

  // Gate: заявки брендам отправляются только от подключённой витрины (активный канал)
  const activeWsId = await getActiveWorkspace(ctx.from.id);
  if (!activeWsId) {
    const backCb = `a:brand_dir_open|u:${brandUserId}|p:${backPage}`;
    let hasAnyWs = false;
    try { hasAnyWs = await db.userHasWorkspace(u.id); } catch {}

    const kbGate = new InlineKeyboard()
      .text('⬅️ Назад', backCb)
      .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home')
      .row();

    if (hasAnyWs) kbGate.text('📣 Мои каналы', 'a:ws_list');
    else kbGate.text('🚀 Подключить канал', 'a:setup');

    const gateText = hasAnyWs
      ? '⚠️ Чтобы отправить заявку бренду, сначала выбери активный канал (витрину).\n\nОткрой «📣 Мои каналы», выбери канал и повтори.'
      : '⚠️ Чтобы отправить заявку бренду, сначала подключи канал (витрину).\n\nНажми «🚀 Подключить канал», добавь бота админом в свой канал и повтори.';

    await safeEditOrReply(ctx, gateText, { reply_markup: kbGate }, edit);
    return;
  }

  // Validate active workspace belongs to this user (protect against stale/foreign active_ws)
  let activeWs = null;
  try { activeWs = await db.getWorkspaceAny(activeWsId); } catch {}
  if (!activeWs || Number(activeWs.owner_user_id || 0) !== Number(u.id || 0)) {
    const backCb = `a:brand_dir_open|u:${brandUserId}|p:${backPage}`;
    const kbGate = new InlineKeyboard()
      .text('⬅️ Назад', backCb)
      .text('📣 Мои каналы', 'a:ws_list')
      .row()
      .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');

    await safeEditOrReply(ctx, '⚠️ Выбери активный канал (витрину) в «📣 Мои каналы» и повтори.', { reply_markup: kbGate }, edit);
    return;
  }

  const prof = await safeBrandProfiles(() => db.getBrandProfile(brandUserId), async () => null);
  const brandName = String(prof?.brand_name || '').trim() || 'Бренд';

  if (startWrite) {
    // Short TTL: input mode should not hijack unrelated messages.
    await setExpectText(ctx.from.id, {
      type: 'brand_apply',
      brandUserId,
      backPage,
      wsId: activeWsId,
      backCb: `a:brand_dir_open|u:${brandUserId}|p:${backPage}`
    }, 5 * 60);
  }

  // show draft controls if exists
  const draft = await getBrandApplyDraft(ctx.from.id, brandUserId);
  const hasDraft = !!(draft && typeof draft === 'object' && String(draft.msg || '').trim());

  const kb = new InlineKeyboard();
  kb.text('✍️ Написать заявку', `a:brand_apply_write|u:${brandUserId}|p:${backPage}`);
  if (hasDraft) kb.text('👀 Предпросмотр', `a:brand_apply_preview|u:${brandUserId}|p:${backPage}`);
  kb.row();
  if (hasDraft) kb.text('🗑 Сбросить черновик', `a:brand_apply_clear|u:${brandUserId}|p:${backPage}`);

  // Quick contact improvement (if not filled) — increases chance of response
  const missingContact = !String(activeWs?.profile_contact || '').trim() && !String(ctx.from.username || '').trim();
  if (missingContact) kb.row().text('✍️ Добавить контакт', `a:ws_prof_edit|ws:${activeWsId}|f:contact`);

  kbNavRow(kb, `a:brand_dir_open|u:${brandUserId}|p:${backPage}`);

  const hint = startWrite
    ? '\n\n✅ Режим ввода включен — напиши сообщение внизу и отправь одним сообщением.\nПотом я покажу предпросмотр и кнопку «Отправить».'
    : '';

  const text = `📝 <b>Заявка бренду</b>\n\nБренд: <b>${escapeHtml(brandName)}</b>\n\n1) Нажми «✍️ Написать заявку»\n2) Напиши одним сообщением:\n• кто ты / канал\n• аудитория / охваты\n• что предлагаешь (формат)\n• условия (бартер/сертификат/оплата)\n• контакт\n\nЯ покажу предпросмотр и попрошу подтвердить отправку.${hint}`;

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true }, edit);
}

async function renderBrandApplyPreview(ctx, u, brandUserId, backPage, opts = {}) {
  const edit = !!opts.edit;
  const draft = await getBrandApplyDraft(ctx.from.id, brandUserId);
  const msg = String(draft?.msg || '').trim();
  if (!msg) {
    const kb = new InlineKeyboard();
    kb.text('✍️ Написать заявку', `a:brand_apply_write|u:${brandUserId}|p:${backPage}`);
    kbNavRow(kb, `a:brand_apply|u:${brandUserId}|p:${backPage}`);
    await safeEditOrReply(ctx, '⚠️ Черновик пуст. Нажми «✍️ Написать заявку».', { reply_markup: kb }, edit);
    return;
  }

  const prof = await safeBrandProfiles(() => db.getBrandProfile(brandUserId), async () => null);
  const brandName = String(prof?.brand_name || '').trim() || 'Бренд';

  const text = `👀 <b>Предпросмотр заявки</b>\n\nБренд: <b>${escapeHtml(brandName)}</b>\n\n<b>Текст:</b>\n<tg-spoiler>${escapeHtml(msg)}</tg-spoiler>\n\nОтправить?`;

  const kb = new InlineKeyboard()
    .text('✅ Отправить', `a:brand_apply_send|u:${brandUserId}|p:${backPage}`)
    .row()
    .text('✍️ Изменить', `a:brand_apply_write|u:${brandUserId}|p:${backPage}`)
    .text('🗑 Сбросить', `a:brand_apply_clear|u:${brandUserId}|p:${backPage}`);

  kbNavRow(kb, `a:brand_apply|u:${brandUserId}|p:${backPage}`);

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true }, edit);
}

async function sendBrandApplyDraft(ctx, u, brandUserId, backPage, opts = {}) {
  const edit = !!opts.edit;
  const draft = await getBrandApplyDraft(ctx.from.id, brandUserId);
  const msg = String(draft?.msg || '').trim();
  const wsId = Number(draft?.wsId || 0);

  if (!msg || !wsId) {
    const kb = new InlineKeyboard().text('✍️ Написать заявку', `a:brand_apply_write|u:${brandUserId}|p:${backPage}`);
    kbNavRow(kb, `a:brand_apply|u:${brandUserId}|p:${backPage}`);
    await safeEditOrReply(ctx, '⚠️ Черновик не найден. Нажми «✍️ Написать заявку».', { reply_markup: kb }, edit);
    return;
  }

  if (msg.length < 5) {
    const kb = new InlineKeyboard().text('✍️ Изменить', `a:brand_apply_write|u:${brandUserId}|p:${backPage}`);
    kbNavRow(kb, `a:brand_apply|u:${brandUserId}|p:${backPage}`);
    await safeEditOrReply(ctx, '⚠️ Сообщение слишком короткое. Напиши подробнее.', { reply_markup: kb }, edit);
    return;
  }
  if (msg.length > 3000) {
    const kb = new InlineKeyboard().text('✍️ Изменить', `a:brand_apply_write|u:${brandUserId}|p:${backPage}`);
    kbNavRow(kb, `a:brand_apply|u:${brandUserId}|p:${backPage}`);
    await safeEditOrReply(ctx, '⚠️ Сообщение слишком длинное. Укороти до ~3000 символов.', { reply_markup: kb }, edit);
    return;
  }

  // Rate limit (consume only on confirmed send)
  const rlPairKey = `brand_apply:${u.id}:${brandUserId}`;
  let okPair = { allowed: true, resetSec: 0 };
  try { okPair = await rateLimit(rlPairKey, { limit: 3, windowSec: 6 * 60 * 60 }); } catch {}
  if (!okPair.allowed) {
    const kb = new InlineKeyboard();
    kbNavRow(kb, `a:brand_apply|u:${brandUserId}|p:${backPage}`);
    await safeEditOrReply(ctx, '⏳ Слишком часто. Попробуй позже (лимит: 3 заявки этому бренду за 6 часов).', { reply_markup: kb }, edit);
    return;
  }

  const rlWsKey = `brand_apply_ws:${wsId}:${brandUserId}`;
  let okWs = { allowed: true, resetSec: 0 };
  try { okWs = await rateLimit(rlWsKey, { limit: 5, windowSec: 6 * 60 * 60 }); } catch {}
  if (!okWs.allowed) {
    const kb = new InlineKeyboard();
    kbNavRow(kb, `a:brand_apply|u:${brandUserId}|p:${backPage}`);
    await safeEditOrReply(ctx, '⏳ Этот канал уже отправлял слишком много заявок этому бренду (лимит: 5 / 6 часов). Попробуй позже.', { reply_markup: kb }, edit);
    return;
  }

  // Send + write to DB
  const api = apiFromCtx(ctx);

  // Best-effort: show immediate progress state
  try {
    const kb = navKb(`a:brand_apply|u:${brandUserId}|p:${backPage}`);
    await safeEditOrReply(ctx, '⏳ Отправляю заявку…', { reply_markup: kb }, edit);
  } catch {}

  let res = null;
  try {
    res = await safeBrandApplications(() => db.createBrandApplication({
      brandUserId,
      creatorUserId: u.id,
      creatorTgId: ctx.from.id,
      creatorUsername: ctx.from.username || null,
      message: msg,
      meta: { wsId }
    }), async () => null);
  } catch (e) {
    try { console.warn('[brand_apply_send] db.createBrandApplication failed', { cid: ctx.state?.cid || null, err: errInfo(e) }); } catch {}
    res = null;
  }

  if (!res) {
    const kb = navKb(`a:brand_apply|u:${brandUserId}|p:${backPage}`);
    await safeEditOrReply(ctx, '⚠️ Не удалось отправить заявку. Попробуй позже.', { reply_markup: kb }, edit);
    return;
  }

  // Notify brand owner + managers
  const prof = await safeBrandProfiles(() => db.getBrandProfile(brandUserId), async () => null);
  const brandName = String(prof?.brand_name || '').trim() || 'Бренд';

  // Workspace is optional here (used only for safe display name). Do not fail send flow if DB hiccups.
  let ws = null;
  try { ws = await db.getWorkspaceAny(wsId); } catch {}
  const creatorName = ws ? safeCreatorDisplayName(ws) : 'Креатор';
  const creatorLabel = `<b>${escapeHtml(creatorName)}</b>`;

  const notifText = `📝 <b>Новая заявка от креатора</b>\n\nБренд: <b>${escapeHtml(brandName)}</b>\nОт: ${creatorLabel}\n\n<b>Текст:</b>\n${escapeHtml(msg)}`;

  const kbNotif = new InlineKeyboard()
    .text('📥 Открыть в Inbox', `a:brand_app_view|id:${res.id}|s:new|p:0`)
    .row()
    .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');

  // Recipients: owner + managers + super admins
  const recipients = new Set();
  try {
    const ownerRow = await db.getUserTgIdByUserId(brandUserId);
    const ownerTid = Number(ownerRow?.tg_id || 0);
    if (ownerTid) recipients.add(ownerTid);
  } catch {}
  try {
    const mgrs = await db.listBrandManagers(brandUserId);
    for (const m of mgrs || []) {
      const tid = Number(m.tg_id || 0);
      if (tid) recipients.add(tid);
    }
  } catch {}
  for (const tid of (CFG.SUPER_ADMIN_TG_IDS || [])) recipients.add(Number(tid));

  for (const chatId of recipients) {
    try {
      await api.sendMessage(chatId, notifText, { parse_mode: 'HTML', reply_markup: kbNotif, disable_web_page_preview: true });
    } catch (e) {
      try { console.warn('[brand_apply_notify] failed', { chatId, cid: ctx.state?.cid || null, err: errInfo(e) }); } catch {}
    }
  }

  // cleanup draft
  await clearBrandApplyDraft(ctx.from.id, brandUserId);
  try { await clearExpectText(ctx.from.id); } catch {}

  // Done screen
  let canOpenInbox = Number(u.id) === Number(brandUserId) || isSuperAdminTg(ctx.from.id);
  if (!canOpenInbox) {
    try { canOpenInbox = await db.isBrandManager(brandUserId, u.id); } catch { canOpenInbox = false; }
  }

  const doneText = `✅ <b>Заявка отправлена</b>\n\nБренд увидит её в Inbox.\n\nХочешь продолжить?`;
  const kbDone = new InlineKeyboard()
    .text('🏷 Каталог брендов', `a:brands_home|p:${backPage}`)
    .row()
    .text('🔎 Открыть бренд', `a:brand_dir_open|u:${brandUserId}|p:${backPage}`)
    .text('✍️ Ещё заявку', `a:brand_apply|u:${brandUserId}|p:${backPage}`);

  if (canOpenInbox) kbDone.row().text('📥 Inbox бренда', 'a:brand_apps|ws:0|s:new|p:0');
  kbDone.row().text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');

  await safeEditOrReply(ctx, doneText, { parse_mode: 'HTML', reply_markup: kbDone, disable_web_page_preview: true }, edit);
}


function bxNeedNetworkKb(wsId) {
  return new InlineKeyboard()
    .text('🌐 Сеть: ❌ ВЫКЛ', `a:net_q|ws:${wsId}|ret:bx`)
    .row()
    .text('⬅️ Назад', `a:ws_open|ws:${wsId}`).text('📋 Меню', 'a:menu')
    .row()
    .text('🏠 Home', 'a:home');
}


const BX_CATEGORIES = [
  { key: 'cosmetics', label: '💄 Косметика' },
  { key: 'fashion', label: '👗 Одежда' },
  { key: 'unboxing', label: '📦 Распаковка' },
  { key: 'other', label: '✨ Другое' }
];

function bxCategoryLabel(c) {
  return BX_CATEGORIES.find((x) => x.key === c)?.label || '✨ Другое';
}

function bxCategoryKb(wsId) {
  const kb = new InlineKeyboard();
  for (const c of BX_CATEGORIES) {
    kb.text(c.label, `a:bx_cat|ws:${wsId}|c:${c.key}`).row();
  }
  kb.text('🧩 Шаблоны', `a:bx_preset_home|ws:${wsId}`).row();
  kb.text('⬅️ Отмена', `a:bx_open|ws:${wsId}`).text('📋 Меню', 'a:menu');
  return kb;
}

function bxKindKb(wsId) {
  return new InlineKeyboard()
    .text('🎬 UGC', `a:bx_kind|ws:${wsId}|k:ugc`).row()
    .text('📣 Интеграция', `a:bx_kind|ws:${wsId}|k:integration`).row()
    .text('⬅️ Отмена', `a:bx_open|ws:${wsId}`).text('📋 Меню', 'a:menu');
}

const BX_PRESETS = [
  {
    id: 'review_barter_unboxing',
    title: '📦 Распаковка за бартер (любой бренд)',
    category: 'unboxing',
    offer_type: 'review',
    compensation_type: 'barter',
    example:
      'Заголовок: Ищу бренд для распаковки/обзора\n\nУсловия: обзор + 3 сторис. Аудитория: 500–2k. Гео: РФ. Хочу: бартер (товары для обзора). Контакт: @myname'
  },
  {
    id: 'ad_cert_cosmetics',
    title: '📣 Упоминание/реклама за сертификат (косметика)',
    category: 'cosmetics',
    offer_type: 'ad',
    compensation_type: 'cert',
    example:
      'Заголовок: Возьму рекламный интеграл за сертификат\n\nФормат: пост/сторис (обсуждаемо). Аудитория: 1k+. Гео: ваш город/РФ. Хочу: сертификат/скидка. Контакт: @myname'
  },
  {
    id: 'giveaway_mixed_other',
    title: '🎁 Розыгрыш с магазином (смешано)',
    category: 'other',
    offer_type: 'giveaway',
    compensation_type: 'mixed',
    example:
      'Заголовок: Розыгрыш совместно с брендом\n\nФормат: конкурс в канале + отметки. Аудитория: 1k+. Нужен приз от бренда, готова помочь с механикой. Хочу: приз+сертификат/бартер. Контакт: @myname'
  }
];

function bxPresetKb(wsId) {
  return new InlineKeyboard()
    .text(BX_PRESETS[0].title, `a:bx_preset_apply|ws:${wsId}|id:${BX_PRESETS[0].id}`)
    .row()
    .text(BX_PRESETS[1].title, `a:bx_preset_apply|ws:${wsId}|id:${BX_PRESETS[1].id}`)
    .row()
    .text(BX_PRESETS[2].title, `a:bx_preset_apply|ws:${wsId}|id:${BX_PRESETS[2].id}`)
    .row()
    .text('⬅️ Назад', `a:bx_new|ws:${wsId}`).text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');
  }

function bxTypeKb(wsId) {
  return new InlineKeyboard()
    .text('📣 Реклама/упоминание', `a:bx_type|ws:${wsId}|t:ad`)
    .row()
    .text('🎥 Обзор/распаковка', `a:bx_type|ws:${wsId}|t:review`)
    .row()
    .text('🎁 Розыгрыш с магазином', `a:bx_type|ws:${wsId}|t:giveaway`)
    .row()
    .text('✍️ Другое', `a:bx_type|ws:${wsId}|t:other`)
    .row()
    .text('⬅️ Назад', `a:bx_new|ws:${wsId}`).text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');
}

function bxCompKb(wsId) {
  return new InlineKeyboard()
    .text('🤝 Бартер', `a:bx_comp|ws:${wsId}|p:barter`)
    .row()
    .text('🎟 Сертификат', `a:bx_comp|ws:${wsId}|p:cert`)
    .row()
    .text('💸 ₽', `a:bx_comp|ws:${wsId}|p:rub`)
    .row()
    .text('🔁 Смешано', `a:bx_comp|ws:${wsId}|p:mixed`)
    .row()
    .text('⬅️ Назад', `a:bx_new|ws:${wsId}`).text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');
}

function bxOfferTagsKb(wsId, meta, opts = {}) {
  const m = parseOfferMeta(meta);
  const goalsLabel = bxTagsLabel(m.goals_tags, 'goals', 'Не выбрано');
  const reqLabel = bxTagsLabel(m.req_tags, 'req', 'Не выбрано');

  const kb = new InlineKeyboard()
    .text(`🎯 Цели: ${goalsLabel}`, `a:bx_otpick|ws:${wsId}|k:goals`)
    .text(`📎 Требования: ${reqLabel}`, `a:bx_otpick|ws:${wsId}|k:req`)
    .row()
    .text('⏭ Пропустить', `a:bx_otskip|ws:${wsId}`)
    .text('➡️ Далее', `a:bx_otnext|ws:${wsId}`)
    .row();

  if (opts.showParams) {
    kb.text('⚙️ Изменить параметры', `a:bx_params|ws:${wsId}`).row();
  }

  kb.text('⬅️ Назад', `a:bx_comp_pick|ws:${wsId}`).text('❌ Отмена', `a:bx_open|ws:${wsId}`).row();

  return kb;
}

function bxOfferTagsPickerKb(wsId, key, meta, opts = {}) {
  const m = parseOfferMeta(meta);
  const sel = key === 'goals' ? m.goals_tags : m.req_tags;
  const defs = key === 'goals' ? BRAND_GOALS_TAGS : BRAND_REQ_TAGS;
  const title = key === 'goals' ? '🎯 Цели оффера' : '📎 Требования к бренду';

  const set = new Set(sel);
  const kb = new InlineKeyboard();

  const items = defs.map((t) => ({
    text: `${set.has(t.key) ? '✅ ' : ''}${t.title}`,
    cb: `a:bx_ott|ws:${wsId}|k:${key}|v:${t.key}`,
  }));
  kbAddPairs(kb, items, 2);
  kb.row();
  kb.text('🧹 Очистить', `a:bx_otclr|ws:${wsId}|k:${key}`)
    .text('✅ Готово', `a:bx_otdone|ws:${wsId}`);
  kbNavRow(kb, `a:bx_ottags|ws:${wsId}`);
  kb.__title = title;
  return kb;
}


async function renderBxOfferTagsStep(ctx, wsId, opts = {}) {
  const draft = (await getDraft(ctx.from.id)) || {};
  const meta = draft.offer_meta || {};
  const parsed = parseOfferMeta(meta);
  const goalsLabel = bxTagsLabel(parsed.goals_tags, 'goals', 'Не выбрано');
  const reqLabel = bxTagsLabel(parsed.req_tags, 'req', 'Не выбрано');

  const preset = opts.fromPreset || null;
  const presetNote = preset ? `\n\n<i>Шаблон: ${escapeHtml(String(preset.title || '')).slice(0, 60)}</i>` : '';

  const text =
`Шаг 5/6: <b>теги оффера</b>
<i>Опционально — можно пропустить.</i>

🎯 Цели: <b>${escapeHtml(goalsLabel)}</b>
📎 Требования: <b>${escapeHtml(reqLabel)}</b>

💡 Теги помогут брендам быстро фильтровать офферы.${presetNote}`;

  const kb = bxOfferTagsKb(wsId, meta, { showParams: Boolean(opts.showParams) });
  const send = (text, extra) => safeEditOrReply(ctx, text, extra, true);
  await send(text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
}

async function renderBxOfferTagsPicker(ctx, wsId, key) {
  const draft = (await getDraft(ctx.from.id)) || {};
  const meta = draft.offer_meta || {};
  const kb = bxOfferTagsPickerKb(wsId, key, meta);
  const title = kb.__title || (key === 'goals' ? '🎯 Цели оффера' : '📎 Требования');
  const parsed = parseOfferMeta(meta);
  const cur = key === 'goals' ? bxTagsLabel(parsed.goals_tags, 'goals', 'Не выбрано') : bxTagsLabel(parsed.req_tags, 'req', 'Не выбрано');
  const hint = key === 'goals'
    ? 'Выбери цели оффера (можно несколько).'
    : 'Выбери требования/условия для бренда (можно несколько).';

  const text =
`🎛 <b>${escapeHtml(title)}</b>
<i>${escapeHtml(hint)}</i>

Текущее: <b>${escapeHtml(cur)}</b>

Выбери теги:`;

  const send = (text, extra) => safeEditOrReply(ctx, text, extra, true);
  await send(text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
}

// ===== Barter Offer Wizard (Creator) — clearer text/publish flow =====

function bxWizTagsSummary(meta) {
  const parsed = parseOfferMeta(meta || {});
  return {
    goals: bxTagsLabel(parsed.goals_tags, 'goals', 'Не выбрано'),
    req: bxTagsLabel(parsed.req_tags, 'req', 'Не выбрано'),
  };
}

async function renderBxOfferDraftStep(ctx, wsId) {
  const draft = (await getDraft(ctx.from.id)) || {};
  const meta = draft.offer_meta || {};

  const kind = String(draft.kind || 'ugc');
  const kindLabel = kind === 'integration' ? '📣 Интеграция' : '🎬 UGC';

  const cat = draft.category ? bxCategoryLabel(draft.category) : '—';
  const type = draft.offer_type ? bxTypeLabel(draft.offer_type) : '—';
  const comp = draft.compensation_type ? bxCompLabel(draft.compensation_type) : '—';

  const tags = bxWizTagsSummary(meta);

  const tTitle = String(draft.offer_title || '').trim();
  const tContact = String(draft.offer_contact || '').trim();
  const hasText = Boolean(tTitle && String(draft.offer_desc || '').trim());

  const textStatus = hasText
    ? `✅ <b>${escapeHtml(tTitle)}</b>\nКонтакт: <b>${escapeHtml(tContact || '—')}</b>`
    : '❌ Текст ещё не задан';

  const text =
`Шаг 5/6: <b>текст оффера</b>\n<i>Тут же можно выбрать теги (опционально).</i>\n\n` +
`Параметры: ${escapeHtml(kindLabel)} · ${escapeHtml(cat)}\n` +
`${escapeHtml(type)} · ${escapeHtml(comp)}\n\n` +
`🎯 Цели: <b>${escapeHtml(tags.goals)}</b>\n` +
`📎 Требования: <b>${escapeHtml(tags.req)}</b>\n\n` +
`Текст: ${textStatus}\n\n` +
`Нажми <b>✍️ Ввести текст</b>, отправь 1 сообщение (заголовок + детали), затем на шаге 6 нажми <b>✅ Опубликовать</b>.`;

  const kb = new InlineKeyboard()
    .text(hasText ? '✍️ Изменить текст' : '✍️ Ввести текст', `a:bx_wtext|ws:${wsId}`)
    .row()
    .text('🎯 Теги (опц.)', `a:bx_wtags|ws:${wsId}`)
    .row()
    .text('➡️ Далее', `a:bx_w6|ws:${wsId}`);
  kbNavRow(kb, `a:bx_comp_pick|ws:${wsId}`);

  const send = (text, extra) => safeEditOrReply(ctx, text, extra, true);
  await send(text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
}

async function renderBxOfferTextInputStep(ctx, wsId, opts = {}) {
  const draft = (await getDraft(ctx.from.id)) || {};
  const kind = String(draft.kind || 'ugc');
  const example =
    kind === 'integration'
      ? 'Заголовок: Возьму интеграцию\n\nФормат: пост/сторис/репост. Охваты: ... Гео: ... Дедлайн: ... Условия: ...\nКонтакт: @myname'
      : 'Заголовок: Сниму UGC для бренда\n\nЧто сделаю: 1–3 вертикальных видео. Сроки: ... Референсы: ... Условия: ...\nКонтакт: @myname';

  const text =
`✍️ <b>Текст оффера</b>\n\n` +
`Отправь <b>одним сообщением</b>:\n` +
`• 1-я строка — заголовок\n` +
`• со 2-й строки — детали (что нужно / сроки / условия)\n\n` +
`⚠️ Контакт обязателен: @username или ссылка.\n\n` +
`Пример:\n<code>${escapeHtml(example)}</code>`;

  const backCb = String(opts.backCb || `a:bx_w5|ws:${wsId}`);
  const kb = navKb(backCb);
  const send = (text, extra) => safeEditOrReply(ctx, text, extra, true);
  await send(text, { parse_mode: 'HTML', reply_markup: kb });
  await setExpectText(ctx.from.id, { type: 'bx_offer_text', wsId, backCb });
}

function bxOfferWizTagsHomeKb(wsId, meta) {
  const parsed = parseOfferMeta(meta || {});
  const goalsLabel = bxTagsLabel(parsed.goals_tags, 'goals', 'Не выбрано');
  const reqLabel = bxTagsLabel(parsed.req_tags, 'req', 'Не выбрано');

  const kb = new InlineKeyboard()
    .text(`🎯 Цели: ${goalsLabel}`, `a:bx_wtagpick|ws:${wsId}|k:goals`)
    .row()
    .text(`📎 Требования: ${reqLabel}`, `a:bx_wtagpick|ws:${wsId}|k:req`)
    .row()
    .text('✅ Готово', `a:bx_w5|ws:${wsId}`);
  kbNavRow(kb, `a:bx_w5|ws:${wsId}`);
  return kb;
}

function bxOfferWizTagsPickerKb(wsId, key, meta) {
  const m = parseOfferMeta(meta || {});
  const sel = key === 'goals' ? m.goals_tags : m.req_tags;
  const defs = key === 'goals' ? BRAND_GOALS_TAGS : BRAND_REQ_TAGS;

  const set = new Set(Array.isArray(sel) ? sel : []);
  const kb = new InlineKeyboard();
  const items = defs.map((t) => ({
    text: `${set.has(t.key) ? '✅ ' : ''}${t.title}`,
    cb: `a:bx_wtagt|ws:${wsId}|k:${key}|v:${t.key}`,
  }));
  kbAddPairs(kb, items, 2);
  kb.row();
  kb.text('🧹 Очистить', `a:bx_wtagclr|ws:${wsId}|k:${key}`)
    .text('✅ Готово', `a:bx_wtagdone|ws:${wsId}`);
  kbNavRow(kb, `a:bx_wtags|ws:${wsId}`);
  kb.__title = key === 'goals' ? '🎯 Цели' : '📎 Требования';
  return kb;
}

async function renderBxOfferWizTagsHome(ctx, wsId) {
  const draft = (await getDraft(ctx.from.id)) || {};
  const meta = draft.offer_meta || {};
  const tags = bxWizTagsSummary(meta);

  const text =
`🎛 <b>Теги оффера</b>\n<i>Опционально — можно оставить пустым.</i>\n\n` +
`🎯 Цели: <b>${escapeHtml(tags.goals)}</b>\n` +
`📎 Требования: <b>${escapeHtml(tags.req)}</b>`;

  const kb = bxOfferWizTagsHomeKb(wsId, meta);
  const send = (text, extra) => safeEditOrReply(ctx, text, extra, true);
  await send(text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
}

async function renderBxOfferWizTagsPicker(ctx, wsId, key) {
  const draft = (await getDraft(ctx.from.id)) || {};
  const meta = draft.offer_meta || {};
  const kb = bxOfferWizTagsPickerKb(wsId, key, meta);
  const title = kb.__title || (key === 'goals' ? '🎯 Цели' : '📎 Требования');

  const parsed = parseOfferMeta(meta);
  const cur = key === 'goals'
    ? bxTagsLabel(parsed.goals_tags, 'goals', 'Не выбрано')
    : bxTagsLabel(parsed.req_tags, 'req', 'Не выбрано');

  const hint = key === 'goals'
    ? 'Выбери цели оффера (можно несколько).'
    : 'Выбери требования/условия для бренда (можно несколько).';

  const text =
`🎛 <b>${escapeHtml(title)}</b>\n<i>${escapeHtml(hint)}</i>\n\n` +
`Текущее: <b>${escapeHtml(cur)}</b>\n\nВыбери теги:`;

  const send = (text, extra) => safeEditOrReply(ctx, text, extra, true);
  await send(text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
}

async function renderBxOfferPreviewStep(ctx, wsId) {
  const draft = (await getDraft(ctx.from.id)) || {};
  const meta = draft.offer_meta || {};

  const kind = String(draft.kind || 'ugc');
  const kindLabel = kind === 'integration' ? '📣 Интеграция' : '🎬 UGC';
  const cat = draft.category ? bxCategoryLabel(draft.category) : '—';
  const type = draft.offer_type ? bxTypeLabel(draft.offer_type) : '—';
  const comp = draft.compensation_type ? bxCompLabel(draft.compensation_type) : '—';

  const tags = bxWizTagsSummary(meta);
  const tTitle = String(draft.offer_title || '').trim();
  const tDesc = String(draft.offer_desc || '').trim();
  const tContact = String(draft.offer_contact || '').trim();
  const hasText = Boolean(tTitle && tDesc);

  const textBody = hasText
    ? `<b>${escapeHtml(tTitle)}</b>\n${escapeHtml(tDesc)}\n\nКонтакт: <b>${escapeHtml(tContact || '—')}</b>`
    : '<i>Текст ещё не задан.</i>';

  const text =
`Шаг 6/6: <b>проверка и публикация</b>\n\n` +
`Параметры: ${escapeHtml(kindLabel)} · ${escapeHtml(cat)}\n` +
`${escapeHtml(type)} · ${escapeHtml(comp)}\n\n` +
`🎯 Цели: <b>${escapeHtml(tags.goals)}</b>\n` +
`📎 Требования: <b>${escapeHtml(tags.req)}</b>\n\n` +
`🧾 <b>Оффер</b>\n${textBody}`;

  const kb = new InlineKeyboard();
  if (hasText) {
    kb.text('✅ Опубликовать', `a:bx_publish|ws:${wsId}`).row();
  } else {
    kb.text('✍️ Ввести текст', `a:bx_wtext|ws:${wsId}`).row();
  }
  kb.text('✍️ Изменить текст', `a:bx_wtext|ws:${wsId}`)
    .text('🎯 Теги', `a:bx_wtags|ws:${wsId}`);
  kbNavRow(kb, `a:bx_w5|ws:${wsId}`);

  const send = (text, extra) => safeEditOrReply(ctx, text, extra, true);
  await send(text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
}

async function renderBxOfferTextStep(ctx, wsId) {
  // Legacy wrapper: old flows may still call this function.
  // We keep it but route to the clearer input step (text -> preview/publish).
  await renderBxOfferTextInputStep(ctx, wsId, { backCb: `a:bx_w5|ws:${wsId}` });
}

function bxTagsLabel(keys, kind, emptyLabel = 'Все') {
  const arr = Array.isArray(keys) ? keys : [];
  if (!arr.length) return emptyLabel;
  const defs = kind === 'goals' ? BRAND_GOALS_TAGS : BRAND_REQ_TAGS;
  const prev = brandTagsPreview(arr, defs, { max: 2 });
  return prev || `... (${arr.length})`;
}

function bxFiltersKb(wsId, f, page = 0, opts = {}) {
  const wsNum = Number(wsId || 0);
  const h = normBxHome(opts.h, wsNum ? BX_HOME.BX_OPEN : BX_HOME.MENU);
  const r = normBxRet(opts.r, wsNum ? BX_HOME.BX_OPEN : h);

  const kb = new InlineKeyboard();

  kb.text(`Категория: ${bxAnyLabel(f.category, 'cat')}`, `a:bx_fpick|ws:${wsId}|k:cat|rp:${page}|pg:0|p:0|h:${h}|r:${r}`)
    .text(`Формат: ${bxAnyLabel(f.offerType, 'type')}`, `a:bx_fpick|ws:${wsId}|k:type|rp:${page}|pg:0|p:0|h:${h}|r:${r}`)
    .row()
    .text(`Оплата: ${bxAnyLabel(f.compensationType, 'comp')}`, `a:bx_fpick|ws:${wsId}|k:comp|rp:${page}|pg:0|p:0|h:${h}|r:${r}`)
    .text(`🎯 Цели: ${bxTagsLabel(f.goalsTags, 'goals')}`, `a:bx_mpick|ws:${wsId}|k:goals|p:${page}|h:${h}|r:${r}`)
    .row()
    .text(`📎 Требования: ${bxTagsLabel(f.reqTags, 'req')}`, `a:bx_mpick|ws:${wsId}|k:req|p:${page}|h:${h}|r:${r}`)
    .row();

  kb.text('♻️ Сбросить', `a:bx_freset|ws:${wsId}|p:${page}|h:${h}|r:${r}`)
    .text('📋 Показать креаторов', `a:bx_feed|ws:${wsId}|p:0|h:${h}`)
    .row();

  kbNavRow(kb, bxReturnCb(wsNum, page, h, r));
  return kb;
}

function bxPickKb(wsId, key, selectedValue, retPage = 0, pickPage = 0, opts = {}) {
  const wsNum = Number(wsId || 0);
  const h = normBxHome(opts.h, wsNum ? BX_HOME.BX_OPEN : BX_HOME.MENU);
  const r = normBxRet(opts.r, wsNum ? BX_HOME.BX_OPEN : h);

  // Canonical keys (cat/type/comp). "All" is represented by null.
  const keys = key === 'cat' ? BX_CATS : (key === 'type' ? BX_TYPES : BX_COMPS);
  const list = (Array.isArray(keys) ? keys : [])
    .filter((v) => v) // remove null ("All"), it is rendered as separate button
    .map((v) => ({
      value: String(v),
      label: bxAnyLabel(String(v), key)
    }));

  const perPage = 10;
  const safeRetPage = Math.max(0, Number(retPage || 0));
  const safePickPage = Math.max(0, Number(pickPage || 0));
  const start = safePickPage * perPage;
  const slice = list.slice(start, start + perPage);

  const kb = new InlineKeyboard();

  // 'All' option
  const isAll = !selectedValue;
  kb.text(isAll ? '✅ Все' : 'Все', `a:bx_fset|ws:${wsNum}|k:${key}|v:all|rp:${safeRetPage}|pg:${safePickPage}|p:${safePickPage}|h:${h}|r:${r}`).row();

  // Options
  for (const it of slice) {
    const selected = String(selectedValue || '') === it.value;
    const label = selected ? `✅ ${it.label}` : it.label;
    kb.text(label, `a:bx_fset|ws:${wsNum}|k:${key}|v:${it.value}|rp:${safeRetPage}|pg:${safePickPage}|p:${safePickPage}|h:${h}|r:${r}`).row();
  }

  // Pagination
  if (list.length > perPage) {
    kb.row();
    if (start > 0) kb.text('⬅️', `a:bx_fpick|ws:${wsNum}|k:${key}|rp:${safeRetPage}|pg:${safePickPage - 1}|p:${safePickPage - 1}|h:${h}|r:${r}`);
    kb.text(`${safePickPage + 1}/${Math.ceil(list.length / perPage)}`, 'a:nop');
    if (start + perPage < list.length) kb.text('➡️', `a:bx_fpick|ws:${wsNum}|k:${key}|rp:${safeRetPage}|pg:${safePickPage + 1}|p:${safePickPage + 1}|h:${h}|r:${r}`);
  }

  // Actions
  kb.row();
  kb.text('🧹 Очистить', `a:bx_fset|ws:${wsNum}|k:${key}|v:all|rp:${safeRetPage}|pg:${safePickPage}|p:${safePickPage}|h:${h}|r:${r}`);
  kb.text('✅ Готово', `a:bx_filters|ws:${wsNum}|p:${safeRetPage}|h:${h}|r:${r}`);

  kbNavRow(kb, `a:bx_filters|ws:${wsNum}|p:${safeRetPage}|h:${h}|r:${r}`);
  return kb;
}

function bxMultiPickKb(wsId, key, selected, page = 0, opts = {}) {
  const wsNum = Number(wsId || 0);
  const h = normBxHome(opts.h, wsNum ? BX_HOME.BX_OPEN : BX_HOME.MENU);
  const r = normBxRet(opts.r, wsNum ? BX_HOME.BX_OPEN : h);

  const pickTitle = key === 'goals' ? '🎯 Цели' : '📎 Требования';
  const raw = key === 'goals' ? BRAND_GOALS_TAGS : BRAND_REQ_TAGS;
  const items = raw.map((t) => ({ value: String(t.key), label: String(t.title) }));
  const selSet = new Set((selected || []).map(String));

  const kb = new InlineKeyboard();
  // NOTE: kbAddPairs expects items shaped as { text, cb }.
  // If we pass { label, cb }, Telegram markup may render as "silent" buttons (no updates).
  const pairs = items.map((it) => ({
    text: selSet.has(String(it.value)) ? `✅ ${it.label}` : it.label,
    cb: `a:bx_mt|ws:${wsId}|k:${key}|v:${it.value}|p:${page}|h:${h}|r:${r}`
  }));
  kbAddPairs(kb, pairs, 2);

  kb.row();
  kb.text('🧹 Очистить', `a:bx_mclear|ws:${wsId}|k:${key}|p:${page}|h:${h}|r:${r}`)
    .text('✅ Готово', `a:bx_mdone|ws:${wsId}|k:${key}|p:${page}|h:${h}|r:${r}`)
    .row();

  kbNavRow(kb, `a:bx_filters|ws:${wsId}|p:${page}|h:${h}|r:${r}`);
  kb.__title = pickTitle;
  return kb;
}

function bxInboxNavKb(wsId, page, hasPrev, hasNext, opts = {}) {
  const wsNum = Number(wsId || 0);
  const h = normBxHome(opts.h, wsNum ? BX_HOME.BX_OPEN : BX_HOME.MENU);

  const kb = new InlineKeyboard();
  if (hasPrev) kb.text('⬅️', `a:bx_inbox|ws:${wsId}|p:${page - 1}|h:${h}`);
  if (hasNext) kb.text('➡️', `a:bx_inbox|ws:${wsId}|p:${page + 1}|h:${h}`);

  kbNavRow(kb, bxHomeCb(wsNum, h));
  return kb;
}

function bxThreadKb(wsId, threadId, opts = {}) {
  const back = opts.back || 'inbox';
  const page = Number(opts.page || 0);
  const offerId = opts.offerId ? Number(opts.offerId) : null;
  const canStage = !!opts.canStage;
  const curStage = opts.stage ? String(opts.stage) : null;
  const isBuyer = !!opts.isBuyer;
  const triage = String(opts.triage || 'open').toLowerCase();
  const proofsCount = Number.isFinite(Number(opts.proofsCount)) ? Number(opts.proofsCount) : null;
  const h = normBxHome(opts.h, Number(wsId || 0) ? BX_HOME.BX_OPEN : BX_HOME.MENU);

  const kb = new InlineKeyboard();

  if (canStage) {
    for (const st of CRM_STAGES) {
      const active = curStage && curStage === st.id;
      kb.text(
        active ? `✅ ${st.title}` : st.title,
        `a:bx_stage|ws:${wsId}|t:${threadId}|s:${st.id}|p:${page}|b:${back}${offerId ? `|o:${offerId}` : ''}|h:${h}`
      );
    }
    kb.row();
  }

  kb.text(
    '✍️ Ответить',
    `a:bx_thread_reply|ws:${wsId}|t:${threadId}|p:${page}|b:${back}${offerId ? `|o:${offerId}` : ''}|h:${h}`
  )
    .text(
      proofsCount !== null ? `🧾 Proofs: ${proofsCount}` : '🧾 Proofs',
      `a:bx_proofs|ws:${wsId}|t:${threadId}|p:${page}|b:${back}${offerId ? `|o:${offerId}` : ''}|h:${h}`
    )
    .row();

  // Buyer-side triage actions (brand lead management)
  if (isBuyer) {
    const inActive = triage === 'in_progress';
    const spamActive = triage === 'spam';
    const inNext = inActive ? 'open' : 'in_progress';
    const spamNext = spamActive ? 'open' : 'spam';
    kb.text(
      inActive ? '✅ 💬 В работу' : '💬 В работу',
      `a:bx_thread_triage|ws:${wsId}|t:${threadId}|s:${inNext}|p:${page}|b:${back}${offerId ? `|o:${offerId}` : ''}|h:${h}`
    ).text(
      spamActive ? '✅ 🗑 Спам' : '🗑 Спам',
      `a:bx_thread_triage|ws:${wsId}|t:${threadId}|s:${spamNext}|p:${page}|b:${back}${offerId ? `|o:${offerId}` : ''}|h:${h}`
    ).row();
  }

  kb.text(
    '✅ Закрыть',
    `a:bx_thread_close_q|ws:${wsId}|t:${threadId}|p:${page}|b:${back}${offerId ? `|o:${offerId}` : ''}|h:${h}`
  );

  if (opts.showRetryInfo) {
    const cbTail = `${offerId ? `|o:${offerId}` : ''}|b:${back}|p:${page}|h:${h}`;
    kb.row().text('ℹ️ Retry', `a:bx_retry_help|ws:${wsId}|t:${threadId}${cbTail}`);
  }

  if (offerId) kb.row().text('🔎 Оффер', `a:bx_pub|ws:${wsId}|o:${offerId}|p:${page}|h:${h}`);

  kb.row().text(
    '🚩 Жалоба',
    `a:bx_report_thread|ws:${wsId}|t:${threadId}|p:${page}|b:${back}${offerId ? `|o:${offerId}` : ''}|h:${h}`
  );

  const backCb = back === 'offer' && offerId
    ? `a:bx_pub|ws:${wsId}|o:${offerId}|p:${page}|h:${h}`
    : `a:bx_inbox|ws:${wsId}|p:${page}|h:${h}`;

  kbNavRow(kb, backCb);
  return kb;
}

function bxFeedNavKb(wsId, page, hasPrev, hasNext, opts = {}) {
  const wsNum = Number(wsId || 0);
  const h = normBxHome(opts.h, wsNum ? BX_HOME.BX_OPEN : BX_HOME.MENU);

  const kb = new InlineKeyboard();
  if (hasPrev) kb.text('⬅️', `a:bx_feed|ws:${wsId}|p:${page - 1}|h:${h}`);
  if (hasNext) kb.text('➡️', `a:bx_feed|ws:${wsId}|p:${page + 1}|h:${h}`);

  kb.row()
    .text('🎛 Фильтры креаторов', `a:bx_filters|ws:${wsId}|p:${page}|h:${h}|r:bf`)
    .text('📥 Inbox', `a:bx_inbox|ws:${wsId}|p:0|h:${h}`);

  kbNavRow(kb, bxHomeCb(wsNum, h));
  return kb;
}

function gwNewStepPrizeKb(wsId) {
  return new InlineKeyboard()
    .text('🤝 Бартер', `a:gw_prize|ws:${wsId}|t:barter`)
    .text('🎟 Сертификат', `a:gw_prize|ws:${wsId}|t:cert`)
    .row()
    .text('💰 Деньги ₽', `a:gw_prize|ws:${wsId}|t:rub`)
    .text('⭐ Stars', `a:gw_prize|ws:${wsId}|t:stars`)
    .row()
    .text('✨ Другое', `a:gw_prize|ws:${wsId}|t:other`)
    .text('🧩 Пресеты', `a:gw_preset_home|ws:${wsId}`)
    .row()
    .text('⬅️ Отмена', `a:ws_open|ws:${wsId}`).text('📋 Меню', 'a:menu');
}

const GW_PRESETS = [
  {
    id: 'product_barter',
    title: 'Розыгрыш продукта (бартер)',
    prize_type: 'barter',
    prize_value_text: 'Розыгрыш продукта от спонсора (бартер). Доставка/условия — уточняем в треде.'
  },
  {
    id: 'cert_discount',
    title: 'Сертификат / скидка',
    prize_type: 'cert',
    prize_value_text: 'Сертификат/скидка от магазина — условия и номинал в описании/в треде.'
  },
  {
    id: 'cash_rub',
    title: 'Денежный приз в ₽',
    prize_type: 'rub',
    prize_value_text: 'Денежный приз в ₽. Сумма и способ выплаты — указать в описании.'
  }
];

function gwPrizePrompt(prizeType) {
  switch (String(prizeType)) {
    case 'barter':
      return `<b>Бартер</b>

Опиши, что именно разыгрываем + условия/доставку.
Пример: <i>"Бьюти-бокс (1 победитель), доставка по РФ"</i>`;
    case 'cert':
      return `<b>Сертификат / скидка</b>

Укажи номинал и условия.
Пример: <i>"Сертификат 3 000₽ в @shopname (1 победитель)"</i>`;
    case 'rub':
      return `<b>Денежный приз в ₽</b>

Укажи сумму и способ выплаты.
Пример: <i>"2 000₽ на карту/СБП (1 победитель)"</i>`;
    case 'stars':
      return `<b>Приз в Stars</b>

Укажи количество Stars и условия.
Пример: <i>"500 Stars (1 победитель)"</i>`;
    case 'other':
    default:
      return `Опиши приз одним сообщением (коротко и понятно).
Пример: <i>"Подарок + доставка"</i>`;
  }
}

function gwPresetKb(wsId) {
  return new InlineKeyboard()
    .text(GW_PRESETS[0].title, `a:gw_preset_apply|ws:${wsId}|id:${GW_PRESETS[0].id}`)
    .row()
    .text(GW_PRESETS[1].title, `a:gw_preset_apply|ws:${wsId}|id:${GW_PRESETS[1].id}`)
    .row()
    .text(GW_PRESETS[2].title, `a:gw_preset_apply|ws:${wsId}|id:${GW_PRESETS[2].id}`)
    .row()
    .text('⬅️ Назад', `a:gw_new|ws:${wsId}`);
  }

function gwNewStepWinnersKb(wsId) {
  return new InlineKeyboard()
    .text('1', `a:gw_winners|ws:${wsId}|n:1`)
    .text('2', `a:gw_winners|ws:${wsId}|n:2`)
    .text('3', `a:gw_winners|ws:${wsId}|n:3`)
    .text('5', `a:gw_winners|ws:${wsId}|n:5`)
    .row()
    .text('✍️ Ввести число', `a:gw_winners_custom|ws:${wsId}`)
    .row()
    .text('⬅️ Назад', `a:gw_new|ws:${wsId}`);
}

function gwNewStepDeadlineKb(wsId) {
  return new InlineKeyboard()
    .text('⏳ 1 час', `a:gw_deadline|ws:${wsId}|m:60`)
    .text('⏳ 6 часов', `a:gw_deadline|ws:${wsId}|m:360`)
    .row()
    .text('⏳ 24 часа', `a:gw_deadline|ws:${wsId}|m:1440`)
    .text('⏳ 3 дня', `a:gw_deadline|ws:${wsId}|m:4320`)
    .row()
    .text('✍️ Ввести (DD.MM HH:MM МСК)', `a:gw_deadline_custom|ws:${wsId}`)
    .row()
    .text('⬅️ Назад', `a:gw_step_sponsors|ws:${wsId}`);
}

function gwSponsorsOptionalKb(wsId) {
  return new InlineKeyboard()
    .text('✅ Без спонсоров (соло)', `a:gw_sponsors_skip|ws:${wsId}`)
    .row()
    .text('✍️ Ввести списком', `a:gw_sponsors_enter|ws:${wsId}`)
    .row()
    .text('📁 Из папки', `a:gw_sponsors_from_folder|ws:${wsId}`)
    .row()
    .text('🧭 Что такое спонсоры?', `a:gw_sponsors_help|ws:${wsId}`)
    .row()
    .text('⬅️ Назад', `a:gw_new|ws:${wsId}`);
}



function gwSponsorsReviewKb(wsId) {
  return new InlineKeyboard()
    .text('✍️ Изменить', `a:gw_sponsors_edit|ws:${wsId}`)
    .text('🧹 Очистить', `a:gw_sponsors_clear|ws:${wsId}`)
    .row()
    .text('➡️ Дальше', `a:gw_sponsors_next|ws:${wsId}`)
    .row()
    .text('⬅️ Назад', `a:gw_step_sponsors|ws:${wsId}`);
}

function gwConfirmKb(wsId) {
  return new InlineKeyboard()
    .text('👁 Превью', `a:gw_preview|ws:${wsId}`)
    .text('📣 Опубликовать', `a:gw_publish|ws:${wsId}`)
    .row()
    .text('🖼 Медиа', `a:gw_media_step|ws:${wsId}`)
    .text('⬅️ Назад', `a:gw_step_deadline|ws:${wsId}`);
}

function gwMediaKb(wsId, hasMedia = false) {
  const kb = new InlineKeyboard()
    .text('🖼 Фото', `a:gw_media_photo|ws:${wsId}`)
    .text('🎞 GIF', `a:gw_media_gif|ws:${wsId}`)
    .row()
    .text('🎥 Видео', `a:gw_media_video|ws:${wsId}`)
    .text('👁 Превью', `a:gw_preview|ws:${wsId}`)
    .row();

  if (hasMedia) {
    kb.text('🗑 Убрать', `a:gw_media_clear|ws:${wsId}`)
      .text('✅ Дальше', `a:gw_media_skip|ws:${wsId}`);
  } else {
    kb.text('⏭ Пропустить', `a:gw_media_skip|ws:${wsId}`);
  }

  kb.row().text('⬅️ Назад', `a:gw_step_deadline|ws:${wsId}`);
  return kb;
}

async function renderGwConfirm(ctx, wsId, opts = {}) {
  const { edit = true } = opts;
  const draft = (await getDraft(ctx.from.id)) || {};

  const prize = (draft.prize_value_text || '').trim() || '—';
  const winners = Number(draft.winners_count || 0) || 1;
  const sponsors = Array.isArray(draft.sponsors) ? draft.sponsors : [];
  const ends = draft.ends_at ? fmtTs(draft.ends_at) : '—';

  const mediaLabel = draft.media_file_id
    ? (draft.media_type === 'photo' ? '🖼 Фото' : (draft.media_type === 'video' ? '🎥 Видео' : '🎞 GIF'))
    : '—';

  const sponsorLines = sponsors.length
    ? sponsors.map(x => `• ${escapeHtml(String(x))}`).join('\n')
    : '—';

  const text = `✅ <b>Черновик конкурса</b>

🎁 Приз: <b>${escapeHtml(prize)}</b>
🏆 Мест: <b>${winners}</b>
⏳ Итоги: <b>${escapeHtml(String(ends))}</b>
🖼 Медиа: <b>${escapeHtml(mediaLabel)}</b>

Спонсоры:
${sponsorLines}

Если всё ок — жми “📣 Опубликовать”.`;

  const extra = { parse_mode: 'HTML', reply_markup: gwConfirmKb(wsId) };
  if (edit) return safeEditOrReply(ctx, text, extra);
  return ctx.reply(text, extra);
}

async function renderGwMediaStep(ctx, wsId, opts = {}) {
  const { edit = true } = opts;
  const draft = (await getDraft(ctx.from.id)) || {};
  const hasMedia = !!draft.media_file_id;

  const current = hasMedia
    ? (draft.media_type === 'photo' ? '🖼 Фото' : (draft.media_type === 'video' ? '🎥 Видео' : '🎞 GIF'))
    : '—';

  const text = `🖼 <b>Медиа для поста</b> (необязательно)

Можно прикрепить фото, GIF или видео — так пост в канале выглядит “живее”.

Сейчас: <b>${escapeHtml(current)}</b>

Выбери действие:`;

  const extra = { parse_mode: 'HTML', reply_markup: gwMediaKb(wsId, hasMedia) };
  if (edit) return safeEditOrReply(ctx, text, extra);
  return ctx.reply(text, extra);
}


function gwOpenKb(g, flags = {}) {
  const { isAdmin = false, backCb } = flags;
  const gwId = g.id;
  const kb = new InlineKeyboard()
    .text('📊 Статистика', `a:gw_stats|i:${gwId}`)
    .text('🧾 Лог', `a:gw_log|i:${gwId}`)
    .row();
  if (isAdmin) kb.text('🧩 Проверка доступа', `a:gw_access|i:${gwId}`).row();
  const effSt = gwEffectiveStatusValue(g);

  const rawSt = String(g?.status || '').toUpperCase();
  const winnersDrawn = rawSt === 'WINNERS_DRAWN' || rawSt === 'RESULTS_PUBLISHED' || !!g?.winners_drawn_at;
  if (winnersDrawn) kb.text('🏆 Победители', `a:gw_wv|i:${gwId}`).row();
  const resultsPublished = rawSt === 'RESULTS_PUBLISHED' || (g?.results_message_id && Number(g.results_message_id) > 0);

  if (effSt !== 'ENDED' && effSt !== 'WINNERS_DRAWN' && effSt !== 'RESULTS_PUBLISHED' && effSt !== 'CANCELLED') {
    kb.text('📣 Напомнить проверить', `a:gw_remind_q|i:${gwId}`)
      .row();
    kb.text('🏁 Завершить', `a:gw_end_now|i:${gwId}`)
      .row();
  }

  // Manual draw (Jobs-style): after ENDED -> pick winners -> publish results
  if (effSt === 'ENDED' && !winnersDrawn) {
    kb.text('🏆 Выбрать победителей', `a:gw_draw_now|i:${gwId}`).row();
  }

  kb.text('👥 Кураторы канала', `a:ws_settings|ws:${g.workspace_id}`)
    .row();

  if ((rawSt === 'WINNERS_DRAWN' || winnersDrawn) && !resultsPublished && !g.results_message_id && g.published_chat_id) {
    kb.text('📣 Опубликовать итоги', `a:gw_publish_results|i:${gwId}`).row();
  }

  if (resultsPublished && g?.results_message_id && Number(g.results_message_id) > 0 && g.published_chat_id) {
    kb.text('✏️ Обновить итоги', `a:gw_results_refresh|i:${gwId}`).row();
  }

  kb
    .text('🗑 Удалить', `a:gw_del_q|i:${gwId}|ws:${g.workspace_id}`)
    .row()
    .text('⬅️ Назад', backCb || (g.workspace_id ? ('a:gw_list_ws|ws:' + g.workspace_id) : 'a:gw_list'));
  return kb;
}

function participantKb(gwId, entry, opts = {}) {
  const pub = opts.pub ? '|pub:1' : '';
  const kb = new InlineKeyboard()
    .text('🧾 Лог конкурса', `a:gw_log|i:${gwId}${pub}`).row();

  // If contest ended — do not allow joining/checking anymore (avoid confusion)
  if (opts.ended) {
    kb.text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home').row();
    if (opts.backTo?.text && opts.backTo?.cb) {
      kb.row().text(opts.backTo.text, opts.backTo.cb);
    }
    return kb;
  }

  if (!entry) {
    kb.text('🎟 Участвовать', `a:gw_join|i:${gwId}${pub}`).row();
  }

  const checkLabel = entry?.is_eligible ? '🔄 Проверить ещё раз' : '🔄 Проверить';
  kb.text(checkLabel, `a:gw_check|i:${gwId}${pub}`).row();

  if (opts.backTo?.text && opts.backTo?.cb) {
    kb.row().text(opts.backTo.text, opts.backTo.cb);
  }
  return kb;
}
function renderParticipantScreen(g, entry, opts = {}) {
  const statusEligible = Boolean(entry?.is_eligible);
  const nowMs = Date.now();
  const endMs = gwEndsAtMs(g?.ends_at);
  const st = String(g?.status || '').toUpperCase();
  const isEnded = (endMs !== null && nowMs >= endMs) || ['ENDED','WINNERS_DRAWN','RESULTS_PUBLISHED','CANCELLED'].includes(st);
  const endsTs = g?.ends_at ? escapeHtml(fmtTs(g.ends_at)) : '—';
  const endsLabel = isEnded ? '✅ Итоги' : '⏳ Итоги';
  // Status block (Jobs-style: one screen, no extra messages)
  let stLine;
  if (opts.checking) {
    stLine = '⏳ <b>проверяю подписки...</b>';
  } else if (statusEligible) {
    stLine = '✅ <b>участие подтверждено</b>';
  } else if (entry) {
    stLine = '✅ <b>участие записано</b> · нужно подтвердить подписки';
  } else {
    stLine = isEnded
      ? '🔴 <b>конкурс завершён</b>'
      : '🕒 <b>нажми “🎟 Участвовать”</b> чтобы записаться';
  }

  // Explain the blocker (first missing / unknown), if we know it
  let blockerLine = '';
  const blocker = opts.blocker || opts.elig?.firstBlocker;
  if (!opts.checking && !statusEligible && blocker) {
    const chat = blocker.chat;
    const handle = opts.elig?.firstBlockerHandle || (typeof chat === 'string' && chat.startsWith('@') ? chat : null);
    if (blocker.state === 'no') {
      blockerLine = handle
        ? `\n\n❌ Не хватает подписки: <b>${escapeHtml(handle)}</b>`
        : `\n\n❌ Не хватает подписки на один из каналов.`;
    } else if (blocker.state === 'unknown') {
      blockerLine = handle
        ? `\n\n⚠️ Не могу проверить: <b>${escapeHtml(handle)}</b> (бот не добавлен в канал)`
        : `\n\n⚠️ Бот не может проверить один из каналов-спонсоров.`;
    }
  }

  // Sponsors list (with simple status icons)
  const sponsors = normalizeSponsorsList(opts.sponsors);
  const stateMap = {};
  if (opts.elig?.results) {
    for (const r of opts.elig.results) stateMap[String(r.chat)] = r.state;
  }

  const iconFor = (st) => {
    if (st === 'ok') return '✅';
    if (st === 'no') return '❌';
    if (st === 'unknown') return '⚠️';
    return '⚪';
  };

  let sponsorsBlock = '';
  if (sponsors.length) {
    const lines = sponsors
      .map((s) => {
        const handle = fmtSponsorHandle(s);
        const st = stateMap[handle] || 'pending';
        return `${iconFor(st)} ${escapeHtml(handle)}`;
      })
      .join('\n');

    sponsorsBlock = `\n\n👥 <b>Спонсоры</b>\n${lines}`;

    const hasUnknown = Object.values(stateMap).includes('unknown');
    if (hasUnknown) {
      sponsorsBlock += `\n\n💡 Если бот не может проверить канал — попроси админа добавить бота в канал-спонсор.`;
    }
  }
  // Action hint (super short)
  const actionHint = (opts.checking || isEnded)
    ? ''
    : !entry
      ? `

Нажми “🎟 Участвовать”, чтобы записаться.`
      : !statusEligible
        ? `

Нажми “🔄 Проверить”, чтобы подтвердить подписки.`
        : '';

  const waitHint = opts.checking ? `

⏳ Это может занять 2–5 сек. Подожди…` : '';

  const tipLine = (opts.hint && !isEnded) ? `

💡 1) Участвовать  2) Проверить` : '';

  return (
    `🎁 <b>Конкурс #${g.id}</b>\n\n` +
    `🎁 Приз: ${escapeHtml(g.prize_value_text || '—')}\n` +
    `🏆 Мест: ${g.winners_count || 1}\n` +
    `${endsLabel}: ${endsTs}\n\n` +
    `Статус: ${stLine}\n` +
    `Статус конкурса: ${isEnded ? '🔴 Завершён' : '🟢 Идёт'}` +
    blockerLine +
    sponsorsBlock +
    actionHint +
    waitHint +
    tipLine
  );
}


async function ensureWorkspaceForOwner(ctx, ownerUserId) {
  const wsList = await db.listWorkspaces(ownerUserId);
  if (!wsList.length) {
    const u = await db.upsertUser(ctx.from.id, ctx.from.username ?? null);
    try { await clearExpectText(ctx.from.id); } catch {}
    const flags = await getRoleFlags(u, ctx.from.id);
    await ctx.reply('Сначала подключи канал: нажми “🚀 Подключить канал”.', { reply_markup: mainMenuKb(flags) });
    return null;
  }
  const active = await getActiveWorkspace(ctx.from.id);
  if (active) {
    const ws = await db.getWorkspace(ownerUserId, active);
    if (ws) return ws;
  }
  // pick first
  await setActiveWorkspace(ctx.from.id, wsList[0].id);
  return await db.getWorkspace(ownerUserId, wsList[0].id);
}

async function renderWsList(ctx, ownerUserId) {
  const items = await db.listWorkspaces(ownerUserId);
  if (!items.length) {
    await safeEditOrReply(ctx, `У тебя пока нет подключенных каналов.

Нажми “🚀 Подключить канал”.`, { reply_markup: mainMenuKb(await getRoleFlags(await db.upsertUser(ctx.from.id, ctx.from.username ?? null), ctx.from.id)) });
    return;
  }
  const kb = new InlineKeyboard();
  for (const w of items) {
    const label = w.channel_username ? `@${w.channel_username}` : w.title;
    kb.text(label, `a:ws_open|ws:${w.id}`).row();
  }
  kb.text('🚀 Подключить ещё', 'a:setup').text('⬅️ В меню', 'a:menu');
  await safeEditOrReply(ctx, `📣 <b>Мои каналы</b>

Это каналы, которые ты подключил к боту (workspace).

Выбери канал — дальше можно:
• ➕ создать новый конкурс
• 🎁 смотреть активные/прошлые конкурсы
• 🤝 бартер‑биржа и Inbox
• 👤 профиль/витрина и настройки

💡 Хочешь добавить ещё канал — жми «🚀 Подключить ещё».`, { parse_mode: 'HTML', reply_markup: kb });
}

async function renderWsOpen(ctx, ownerUserId, wsId) {
  const ws = await db.getWorkspace(ownerUserId, wsId);
  if (!ws) {
    await ctx.answerCallbackQuery({ text: 'Канал не найден.' });
    return;
  }
  await setActiveWorkspace(ctx.from.id, wsId);
  const title = ws.channel_username ? `@${ws.channel_username}` : ws.title;
  const isCurator = await db.hasAnyCuratorRole(ownerUserId);
  await safeEditOrReply(ctx, `📣 <b>${escapeHtml(title)}</b>

Выбери действие:
<i>Подсказка: 🎬 офферы → 📥 Inbox / 📰 лента. 📨 заявки брендов → входящие.</i>`, { parse_mode: 'HTML', reply_markup: wsMenuKb(wsId, { showCurator: isCurator }) });
}

async function renderWsSettings(ctx, ownerUserId, wsId) {
  const isAdmin = isSuperAdminTg(ctx.from?.id);
  const ws = isAdmin ? await db.getWorkspaceAny(wsId) : await db.getWorkspace(ownerUserId, wsId);
  if (!ws) { await safeEditOrReply(ctx, '⚠️ Канал не найден. Открой 📋 Меню → выбери канал и повтори.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') }); return; }
  if (!isAdmin && Number(ws.owner_user_id) !== Number(ownerUserId)) { await safeEditOrReply(ctx, '⚠️ Нет доступа. Открой 📋 Меню → выбери канал заново.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') }); return; }
  await db.ensureWorkspaceSettings(wsId);
  const s = await db.getWorkspace(ownerUserId, wsId);
  const settings = {
    network_enabled: s.network_enabled,
    curator_enabled: s.curator_enabled
  };
  await safeEditOrReply(ctx, `👥 <b>Кураторы и сеть</b>

Канал: <b>${escapeHtml(ws.channel_username ? '@' + ws.channel_username : ws.title)}</b>`, {
    parse_mode: 'HTML',
    reply_markup: wsSettingsKb(wsId, settings)
  });
}

async function renderWsHistory(ctx, ownerUserId, wsId) {
  const isAdmin = isSuperAdminTg(ctx.from?.id);
  const ws = isAdmin ? await db.getWorkspaceAny(wsId) : await db.getWorkspace(ownerUserId, wsId);
  if (!ws) { await safeEditOrReply(ctx, '⚠️ Канал не найден. Открой 📋 Меню → выбери канал и повтори.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') }); return; }
  if (!isAdmin && Number(ws.owner_user_id) !== Number(ownerUserId)) { await safeEditOrReply(ctx, '⚠️ Нет доступа. Открой 📋 Меню → выбери канал заново.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') }); return; }
  const items = await db.listWorkspaceAudit(wsId, 20);
  const lines = items.map(i => `• <b>${escapeHtml(i.action)}</b> — ${fmtTs(i.created_at)}`);
  const text = `🧾 <b>История действий</b>

${lines.length ? lines.join('\n') : 'Пока пусто.'}`;
  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: navKb(`a:ws_open|ws:${wsId}`) });
}



// Workspace Profile Matrix (IG leads → TG deals)
// Stored in workspace_settings (per-channel profile)
const PROFILE_VERTICALS = [
  { key: 'beauty', title: '💄 Косметика / уход' },
  { key: 'fashion', title: '👗 Одежда / обувь' },
  { key: 'jewelry', title: '💍 Украшения / аксессуары' },
  { key: 'home', title: '🏠 Дом / декор' },
  { key: 'food', title: '🍽️ Еда / кафе / FMCG' },
  { key: 'kids', title: '🧸 Дети / семья' },
  { key: 'fitness', title: '🧘 Фитнес / здоровье' },
  { key: 'tech', title: '📱 Тех / гаджеты' },
  { key: 'services', title: '🎓 Сервисы / обучение' }
];

const PROFILE_FORMATS = [
  { key: 'reels', title: '🎬 Вертикальное видео (Reels/TikTok)' },
  { key: 'stories', title: '📲 Stories / вставки' },
  { key: 'post', title: '🖼️ Фото / карусель' },
  { key: 'unboxing', title: '📦 Unboxing / распаковка' },
  { key: 'tryon', title: '🧥 Try-on / примерка' },
  { key: 'review', title: '⭐ Review / честный обзор' },
  { key: 'howto', title: '🧠 How‑to / инструкция' },
  { key: 'talking', title: '🗣️ Говорящая голова / отзыв' },
  { key: 'routine', title: '🧴 Routine / «как использую»' },
  { key: 'voice', title: '🎙️ Voice-over / без лица' },
  { key: 'ugc_ads', title: '🎯 UGC для рекламы (файлы)' },
  { key: 'giveaway', title: '🎁 Розыгрыш (опционально)' }
];

const PROFILE_MODE_LABELS = {
  channel: 'Канал (интеграции)',
  ugc: 'UGC (контент без аудитории)',
  both: 'Оба (канал + UGC)'
};

// ─────────────────────────────────────────────────────────────────────────────
// №4 Матчинг профилей (каталог витрин по нишам/форматам) — минимальный UX
// Brand → выбирает фильтры → получает список → открывает витрину → оставляет заявку
// ─────────────────────────────────────────────────────────────────────────────
const PM_LIMITS = { verticals: 3, formats: 5 };
const PM_PAGE_SIZE = 5;

function pmStateKey(tgId, wsId) {
  return k(['pm_state', tgId, Number(wsId || 0)]);
}

async function pmGetState(tgId, wsId) {
  const raw = await redis.get(pmStateKey(tgId, wsId));
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    v: Array.isArray(s.v) ? s.v.filter(Boolean) : [],
    f: Array.isArray(s.f) ? s.f.filter(Boolean) : []
  };
}

async function pmSetState(tgId, wsId, state) {
  await redis.set(pmStateKey(tgId, wsId), state, { ex: 60 * 60 }); // 1 час
}

async function pmResetState(tgId, wsId) {
  await redis.del(pmStateKey(tgId, wsId));
}

function pmHumanList(keys, dict) {
  if (!Array.isArray(keys) || !keys.length) return '—';
  const map = new Map(dict.map(d => [d.key, d.title]));
  return keys.map(k => map.get(k) || k).join(', ');
}

function pmHumanBullets(keys, dict) {
  if (!Array.isArray(keys) || !keys.length) return '—';
  const map = new Map(dict.map(d => [d.key, d.title]));
  return keys.map(k => `• ${map.get(k) || k}`).join('\n');
}


function contactUrlFromRaw(contactRaw) {
  const c = contactRaw ? String(contactRaw).trim() : '';
  if (!c) return null;
  const tg = wsTgUrlFromContact(c);
  if (tg) return tg;
  if (/^https?:\/\//i.test(c)) return c;
  if (/^t\.me\//i.test(c)) return 'https://' + c;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return 'mailto:' + c;
  return null;
}

async function pmAssertAccess(ctx, ownerUserId, wsId) {
  const wsNum = Number(wsId || 0);
  if (wsNum === 0) return true;
  const ws = await db.getWorkspace(ownerUserId, wsNum);
  if (!ws) {
    await ctx.answerCallbackQuery({ text: 'Нет доступа к этому workspace.', show_alert: true });
    return false;
  }
  return true;
}

async function renderProfileMatchingHome(ctx, ownerUserId, wsId) {
  if (!(await pmAssertAccess(ctx, ownerUserId, wsId))) return;

  const st = await pmGetState(ctx.from.id, wsId);

  const text =
    `🔎 <b>Поиск креаторов</b>\n\n` +
    `Выбираешь ниши и форматы — бот показывает подходящие витрины.\n\n` +
    `🏷 Ниши:
${escapeHtml(pmHumanBullets(st.v, PROFILE_VERTICALS))}
`
    + `🎬 Форматы:
${escapeHtml(pmHumanBullets(st.f, PROFILE_FORMATS))}

` +
    `Нажми «🔎 Найти», чтобы открыть список.\n` +
    `Подсказка: 1–2 ниши + 2–3 формата обычно дают лучший результат.`;

  const kb = new InlineKeyboard()
    .text(`🏷 Ниши (${st.v.length}/${PM_LIMITS.verticals})`, `a:pm_pick|ws:${wsId}|t:v`)
    .text(`🎬 Форматы (${st.f.length}/${PM_LIMITS.formats})`, `a:pm_pick|ws:${wsId}|t:f`)
    .row()
    .text('🔎 Найти', `a:pm_run|ws:${wsId}|p:0`)
    .text('🗑 Сброс', `a:pm_reset|ws:${wsId}`)
    .row()
    .text('⬅️ Назад', `a:bx_open|ws:${wsId}`);

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
}

async function renderProfileMatchingPick(ctx, ownerUserId, wsId, type) {
  if (!(await pmAssertAccess(ctx, ownerUserId, wsId))) return;

  const st = await pmGetState(ctx.from.id, wsId);
  const isV = type === 'v';
  const dict = isV ? PROFILE_VERTICALS : PROFILE_FORMATS;
  const sel = isV ? st.v : st.f;
  const max = isV ? PM_LIMITS.verticals : PM_LIMITS.formats;
  const title = isV ? '🏷 Выбор ниш' : '🎬 Выбор форматов';

  const kb = new InlineKeyboard();
  for (const it of dict) {
    const chosen = sel.includes(it.key);
    kb.text(`${chosen ? '✅ ' : ''}${it.title}`, `a:pm_tog|ws:${wsId}|t:${type}|k:${it.key}`).row();
  }
  kb.text('✅ Готово', `a:pm_home|ws:${wsId}`).text('🗑 Сброс', `a:pm_reset|ws:${wsId}`);

  const text =
    `${title}\n\n` +
    `Выбрано: <b>${sel.length}/${max}</b>\n` +
    `Нажимай по пунктам, чтобы включать/выключать ✅.`;

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
}

async function renderProfileMatchingResults(ctx, ownerUserId, wsId, page = 0) {
  if (!(await pmAssertAccess(ctx, ownerUserId, wsId))) return;

  const st = await pmGetState(ctx.from.id, wsId);
  const p = Math.max(0, Number(page || 0));
  const offset = p * PM_PAGE_SIZE;

  const rows = await db.searchWorkspaceProfilesByMatrix(st.v, st.f, offset, PM_PAGE_SIZE + 1);
  const hasNext = rows.length > PM_PAGE_SIZE;
  const items = rows.slice(0, PM_PAGE_SIZE);

  const head =
    `🔎 <b>Результаты поиска</b>\n\n` +
    `🏷 Ниши:
${escapeHtml(pmHumanBullets(st.v, PROFILE_VERTICALS))}
`
    + `🎬 Форматы:
${escapeHtml(pmHumanBullets(st.f, PROFILE_FORMATS))}

`;

  if (!items.length) {
    const kb = new InlineKeyboard()
      .text('⚙️ Изменить фильтры', `a:pm_home|ws:${wsId}`)
      .row()
      .text('⬅️ Назад', `a:bx_open|ws:${wsId}`);
    return safeEditOrReply(ctx, 
      head + '😶 Ничего не нашёл по фильтрам.\n\nПопробуй упростить фильтр (меньше ниш/форматов).',
      { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true }
    );
  }

  const lines = items
    .map((r, i) => {
      const name = String(r.profile_title || r.ws_title || '').trim() || `Креатор #${r.id}`;
      const mode = PROFILE_MODE_LABELS[String(r.profile_mode || 'both')] || PROFILE_MODE_LABELS.both;
      const geo = r.profile_geo || '—';
      return `${offset + i + 1}) <b>${escapeHtml(String(name))}</b> · ${escapeHtml(String(mode))} · ${escapeHtml(String(geo))}`;
    })
    .join('\n');

  const text = head + lines + `\n\nНажми «👤 …», чтобы открыть витрину.`;

  const kb = new InlineKeyboard();

  for (const r of items) {
    const name = String(r.profile_title || r.ws_title || '').trim() || `Креатор #${r.id}`;
    const short = String(name).slice(0, 28);
    kb.text(`👤 ${short}`, `a:pm_view|ws:${wsId}|id:${r.id}|p:${p}`);
    kb.row();
  }

  if (p > 0 || hasNext) {
    if (p > 0) kb.text('⬅️', `a:pm_run|ws:${wsId}|p:${p - 1}`);
    if (hasNext) kb.text('➡️', `a:pm_run|ws:${wsId}|p:${p + 1}`);
    kb.row();
  }

  kb.text('⚙️ Фильтры', `a:pm_home|ws:${wsId}`).text('⬅️ Назад', `a:bx_open|ws:${wsId}`);

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
}



const LEAD_STATUSES = {
  new: { key: 'new', title: '🆕 Новые', icon: '🆕' },
  in_progress: { key: 'in_progress', title: '💬 В работе', icon: '💬' },
  closed: { key: 'closed', title: '✅ Закрытые', icon: '✅' },
  spam: { key: 'spam', title: '🗑 Спам', icon: '🗑' }
};

function normLeadStatus(s) {
  const v = String(s || '').toLowerCase();
  if (v === 'new' || v === 'in_progress' || v === 'closed' || v === 'spam') return v;
  return 'new';
}

function leadStatusToCb(s) {
  const v = normLeadStatus(s);
  if (v === 'in_progress') return 'ip';
  if (v === 'closed') return 'cl';
  if (v === 'spam') return 'sp';
  return 'n';
}

// Backward/compact compat: allow passing compact status codes from callback_data
// (ip/cl/sp/n) as well as full enum values (in_progress/closed/spam/new).
function leadStatusFromCb(s) {
  const v = String(s || '').toLowerCase().trim();
  if (v === 'ip') return 'in_progress';
  if (v === 'cl') return 'closed';
  if (v === 'sp') return 'spam';
  if (v === 'n') return 'new';
  return normLeadStatus(v);
}

function retToCb(ret) {
  const k = String(ret || '').trim();
  if (!k) return '';
  if (k === 'ws_open') return 'wo';
  if (k === 'ws_profile') return 'wp';
  if (k === 'ws_list') return 'wl';
  if (k === 'menu') return 'm';
  if (k === 'home') return 'h';
  // keep unknown values as-is (backward compat)
  return k;
}

// Inverse mapping for compact return-to codes.
// Accepts either a compact code (wo/wp/wl/m/h) or a full key.
function retFromCb(code) {
  const c = String(code || '').trim();
  if (!c) return '';
  if (c === 'wo') return 'ws_open';
  if (c === 'wp') return 'ws_profile';
  if (c === 'wl') return 'ws_list';
  if (c === 'm') return 'menu';
  if (c === 'h') return 'home';
  // already full (or unknown) value
  return c;
}

function retPartShort(ret) {
  const code = retToCb(ret);
  return code ? `|r:${code}` : '';
}


function leadStatusIcon(s) {
  return (LEAD_STATUSES[normLeadStatus(s)] || LEAD_STATUSES.new).icon;
}

// -----------------------------
// Brand Leads: internal notes (meta)
// -----------------------------

const LEAD_NOTE_TEMPLATES = {
  wb: { key: 'wb', label: '⏳ Бриф', text: '⏳ Ждём бриф #brief', tags: ['brief'] },
  bd: { key: 'bd', label: '💰 Бюджет', text: '💰 Уточнить бюджет #price', tags: ['price'] },
  fm: { key: 'fm', label: '📌 Формат', text: '📌 Уточнить формат/площадку #format', tags: ['format'] },
  fu: { key: 'fu', label: '🔁 Follow-up', text: '🔁 Сделать follow-up #followup', tags: ['followup'] },
  sp: { key: 'sp', label: '🚫 Спам', text: '🚫 Похоже на спам #spam', tags: ['spam'] },
  ur: { key: 'ur', label: '⚡ Срочно', text: '⚡ Срочно проверить #urgent', tags: ['urgent'] },
};

function normLeadNoteTplKey(k) {
  const v = String(k || '').toLowerCase().trim();
  return LEAD_NOTE_TEMPLATES[v] ? v : 'wb';
}

function extractLeadNoteTags(text) {
  const s = String(text || '');
  const re = /#([a-zA-Z0-9_А-Яа-я]{2,24})/g;
  const out = [];
  let m;
  while ((m = re.exec(s))) {
    const tag = String(m[1] || '').trim().toLowerCase();
    if (!tag) continue;
    if (!out.includes(tag)) out.push(tag);
    if (out.length >= 8) break;
  }
  return out;
}

function normalizeLeadNotes(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const n of arr) {
    if (typeof n === 'string') {
      const t = n.trim();
      if (!t) continue;
      out.push({ by: 0, at: null, text: t, role: null, tags: extractLeadNoteTags(t) });
      continue;
    }
    if (!n || typeof n !== 'object') continue;

    const t = String(n.text || '').trim();
    if (!t) continue;

    const by = Number(n.by || 0) || 0;
    const at = n.at ? String(n.at) : null;
    const role = n.role ? String(n.role).trim().toLowerCase() : null;

    let tags = [];
    try {
      if (Array.isArray(n.tags)) {
        tags = n.tags.map((x) => String(x || '').trim().replace(/^#/, '').toLowerCase()).filter(Boolean);
      } else {
        tags = extractLeadNoteTags(t);
      }
      tags = Array.from(new Set(tags)).slice(0, 8);
    } catch {
      tags = extractLeadNoteTags(t);
    }

    out.push({ by, at, text: t, role, tags });
  }
  return out;
}

function fmtLeadNoteTags(tags) {
  const arr = Array.isArray(tags) ? tags : [];
  const uniq = Array.from(new Set(arr.map((x) => String(x || '').trim().replace(/^#/, '').toLowerCase()).filter(Boolean))).slice(0, 6);
  if (!uniq.length) return '';
  return ' ' + uniq.map((t) => `<code>#${escapeHtml(t)}</code>`).join(' ');
}



function wsBrandLink(wsId) {
  const un = String(CFG.BOT_USERNAME || '').replace(/^@/, '');
  if (!un) return null;
  return `https://t.me/${un}?start=wsp_${wsId}`;
}

function brandReplyKb(ws, wsId, brandCredits = 0, leadId = 0) {
  const kb = new InlineKeyboard();
  const lid = Number(leadId || 0);
  const ctxPart = lid ? `|r:bl|l:${lid}` : '';

  // Keep brands inside the bot (no direct contact links in replies).
  // Provide a clear way to continue the same deal thread.
  if (lid) kb.text('💬 Диалог', `a:blead_view|id:${lid}|w:${wsId}`);
  kb.text('🪟 Витрина', `a:wsp_open|ws:${wsId}|m:ro${ctxPart}`);

  kb.row();

  // Contacts are revealed via paid unlock (Brand Pass credits) to prevent free bypass.
  // UX: if balance is low — показываем и «Контакты», и быстрый путь купить Brand Pass.
  const bal = Number(brandCredits || 0);
  if (bal <= 0) {
    kb.text('🎫 Купить Brand Pass', 'a:brand_pass|ws:0');
  } else if (CONTACT_UNLOCK_COST > 0 && bal < CONTACT_UNLOCK_COST) {
    kb.text(contactUnlockBtnLabel(), `a:wsp_contact_req|ws:${wsId}${ctxPart}`)
      .text('🎫 Купить Brand Pass', 'a:brand_pass|ws:0');
  } else {
    kb.text(contactUnlockBtnLabel(), `a:wsp_contact_req|ws:${wsId}${ctxPart}`);
  }

  // Always include navigation buttons so brand isn't stuck with a text-only message.
  kb.row().text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');
  return kb;
}

function normalizeJsonb(v) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return null; }
  }
  return null;
}

async function appendBrandLeadThread(leadId, by, text) {
  const lid = Number(leadId || 0);
  if (!lid) return;
  const who = String(by || '').trim().toLowerCase() || 'system';
  const t = String(text || '').trim();
  if (!t) return;
  const safeText = t.length > 1200 ? t.slice(0, 1197) + '…' : t;

  // Store a lightweight dialog history inside brand_leads.meta.thread (no schema changes).
  try {
    await pool.query(
      `UPDATE brand_leads
       SET meta = jsonb_set(
         COALESCE(meta, '{}'::jsonb),
         '{thread}',
         (COALESCE(COALESCE(meta, '{}'::jsonb)->'thread', '[]'::jsonb) ||
           jsonb_build_array(jsonb_build_object(
             'by', $2::text,
             'at', NOW(),
             'text', $3::text
           ))
         ),
         true
       ),
       updated_at = NOW()
       WHERE id = $1`,
      [lid, who, safeText]
    );
  } catch {
    // never block the UX on thread logging
  }
}

function getBrandLeadThread(lead) {
  const meta = normalizeJsonb(lead?.meta) || {};
  const arr = Array.isArray(meta.thread) ? meta.thread : [];
  const out = [];
  for (const it of arr) {
    if (!it || typeof it !== 'object') continue;
    const by = String(it.by || '').trim().toLowerCase() || 'system';
    const at = it.at ? String(it.at) : null;
    const text = String(it.text || '').trim();
    if (!text) continue;
    out.push({ by, at, text });
  }
  return out;
}

function fmtBrandLeadThread(items, limit = 6) {
  const arr = Array.isArray(items) ? items : [];
  const tail = arr.slice(Math.max(0, arr.length - limit));
  if (!tail.length) return '';

  const whoTitle = (by) => {
    if (by === 'brand') return 'Бренд';
    if (by === 'creator') return 'Креатор';
    if (by === 'curator') return 'Куратор';
    return 'Система';
  };

  const lines = tail.map((x) => {
    const who = whoTitle(String(x.by || 'system'));
    const t = String(x.text || '').replace(/\s+/g, ' ').trim();
    const snippet = t.length > 180 ? t.slice(0, 177) + '…' : t;
    return `• <b>${escapeHtml(who)}:</b> ${escapeHtml(snippet)}`;
  });

  return `\n\n<b>Диалог</b>\n` + lines.join('\n');
}


function shortUrl(u) {
  const s = String(u || '').replace(/^https?:\/\//i, '');
  return s.length > 48 ? s.slice(0, 45) + '…' : s;
}

function fmtMatrix(keys, dict, empty = '—') {
  const arr = Array.isArray(keys) ? keys.map(String) : [];
  const set = new Set(arr);
  const titles = dict.filter(x => set.has(x.key)).map(x => x.title);
  return titles.length ? titles.join(', ') : empty;
}

function fmtMatrixList(ids, dict, empty = '—') {
  const arr = Array.isArray(ids) ? ids : [];

  // Aliases for legacy / short keys (some DB rows store simplified enums like 'kids', 'jewelry', 'reels').
  const ALIAS_VERTICALS = {
    kids: '🧸 Дети / семья',
    jewelry: '💍 Украшения / аксессуары',
    accessories: '💍 Украшения / аксессуары',
    beauty: '💄 Косметика / уход',
    fitness: '🧘 Фитнес / здоровье',
    health: '🧘 Фитнес / здоровье',
    tech: '📱 Тех / гаджеты',
    food: '🍽 Еда / кафе / FMCG',
    cafe: '🍽 Еда / кафе / FMCG',
    home: '🏠 Дом / декор',
    decor: '🏠 Дом / декор',
    services: '🎓 Сервисы / обучение',
    education: '🎓 Сервисы / обучение',
    fashion: '👗 Одежда / обувь',
    clothes: '👗 Одежда / обувь',
    shoes: '👗 Одежда / обувь',
  };

  const ALIAS_FORMATS = {
    reels: '🎬 Вертикальное видео (Reels/TikTok)',
    tiktok: '🎬 Вертикальное видео (Reels/TikTok)',
    vertical_video: '🎬 Вертикальное видео (Reels/TikTok)',
    howto: '🧠 How‑to / инструкция',
    how_to: '🧠 How‑to / инструкция',
    instruction: '🧠 How‑to / инструкция',
    voice: '🎙 Voice-over / без лица',
    voice_over: '🎙 Voice-over / без лица',
    talking: '🗣 Говорящая голова / отзыв',
    ugc_ads: '🎯 UGC для рекламы (файлы)',
    ugc: '🎯 UGC для рекламы (файлы)',
    giveaway: '🎁 Розыгрыш (опционально)',
    unboxing: '📦 Unboxing / распаковка',
    photo: '🖼 Фото / карусель',
    tryon: '👗 Try-on / примерка',
    review: '⭐ Review / честный обзор',
    stories: '📰 Stories / вставки',
  };

  const useAlias = (x) => {
    if (!x) return null;
    const key = String(x).trim();
    const isVert = (typeof PROFILE_VERTICALS !== 'undefined') && (dict === PROFILE_VERTICALS);
    const isFmt  = (typeof PROFILE_FORMATS !== 'undefined') && (dict === PROFILE_FORMATS);
    if (isVert) return ALIAS_VERTICALS[key] || null;
    if (isFmt)  return ALIAS_FORMATS[key] || null;
    return null;
  };

  const items = arr
    .map((x) => (dict && dict[x]) ? dict[x] : (useAlias(x) || x))
    .filter((x) => typeof x === 'string' && x.trim().length);

  if (!items.length) return empty;
  return items.map((x) => `• ${x}`).join('\n');
}




function wsIgHandleFromWs(ws) {
  const h = ws?.profile_ig ? String(ws.profile_ig).replace(/^@/, '') : '';
  return h ? h : null;
}

function wsIgUrlFromWs(ws) {
  const h = wsIgHandleFromWs(ws);
  return h ? `https://instagram.com/${h}` : null;
}

function wsTgUsernameFromContact(contact) {
  const raw = String(contact || '').trim();
  const m = raw.match(/^@([a-zA-Z0-9_]{5,})$/);
  return m ? m[1] : null;
}

function wsTgUrlFromContact(contact) {
  const un = wsTgUsernameFromContact(contact);
  return un ? `https://t.me/${un}` : null;
}

function deLinkifyText(input) {
  let s = String(input || '').trim();
  if (!s) return '';

  // Remove scheme to keep the text short and to avoid Telegram treating it as a clickable link.
  s = s.replace(/^https?:\/\//i, '');

  // Break @mentions and domains (no clickable @ / URL).
  s = s.replace(/@/g, '＠');
  s = s.replace(/\./g, '․');

  return s;
}

function formatWsContactCard(ws, wsId, opts = {}) {
  const plain = !!opts.plain;

  const channelUser = ws.channel_username ? String(ws.channel_username).replace(/^@/, '') : '';
  const channelLabel = channelUser ? ('@' + channelUser) : (ws.title || 'канал');
  const channelUrl = channelUser ? `https://t.me/${channelUser}` : null;

  const ig = wsIgHandleFromWs(ws);
  const igUrl = wsIgUrlFromWs(ws);

  const contact = ws.profile_contact ? String(ws.profile_contact) : null;
  const contactTgUrl = wsTgUrlFromContact(contact);

  const link = wsBrandLink(wsId);

  const lines = [];
  const title = String(ws.profile_title || channelLabel);
  lines.push(`👤 <b>${escapeHtml(title)}</b>`);

  if (plain) {
    if (channelLabel) lines.push(`📣 TG канал: <code>${escapeHtml(deLinkifyText(channelLabel))}</code>`);

    if (ig) {
      // Show both handle and URL (de-linkified), but never as <a href>.
      const igLine = igUrl ? `${igUrl} • @${ig}` : `@${ig}`;
      lines.push(`📸 IG: <code>${escapeHtml(deLinkifyText(igLine))}</code>`);
    }

    if (contact) lines.push(`✉️ Контакт: <code>${escapeHtml(deLinkifyText(contact))}</code>`);
    if (link) lines.push(`🔗 Витрина: <code>${escapeHtml(deLinkifyText(link))}</code>`);

    const ports = Array.isArray(ws.profile_portfolio_urls) ? ws.profile_portfolio_urls.filter(Boolean).slice(0, 3) : [];
    if (ports.length) {
      lines.push(`🗂 Портфолио:`);
      for (const u of ports) {
        lines.push(`• <code>${escapeHtml(deLinkifyText(String(u)))}</code>`);
      }
    }

    return lines.join('\n');
  }

  // Default: linked / clickable card.
  const channel = channelUser ? ('@' + channelUser) : (ws.title || 'канал');
  if (channelUrl) lines.push(`📣 TG канал: <a href="${escapeHtml(channelUrl)}">${escapeHtml(channel)}</a>`);
  else lines.push(`📣 TG канал: <b>${escapeHtml(channel)}</b>`);

  if (igUrl) lines.push(`📸 IG: <a href="${escapeHtml(igUrl)}">${escapeHtml(shortUrl(igUrl))}</a> <code>@${escapeHtml(ig)}</code>`);

  if (contactTgUrl) lines.push(`✉️ Контакт: <a href="${escapeHtml(contactTgUrl)}">${escapeHtml(contact)}</a>`);
  else if (contact) lines.push(`✉️ Контакт: <b>${escapeHtml(contact)}</b>`);

  if (link) lines.push(`🔗 Витрина: <a href="${escapeHtml(link)}">${escapeHtml(shortUrl(link))}</a>`);

  const ports = Array.isArray(ws.profile_portfolio_urls) ? ws.profile_portfolio_urls.filter(Boolean).slice(0, 3) : [];
  if (ports.length) {
    lines.push(`🗂 Портфолио:`);
    for (const u of ports) {
      lines.push(`• <a href="${escapeHtml(String(u))}">${escapeHtml(shortUrl(String(u)))}</a>`);
    }
  }

  return lines.join('\n');
}

function buildWsShareText(ws, wsId, variant = 'short') {
const link = wsBrandLink(wsId);

  // UI text shown inside bot (short/long preview).
  const v = String(variant || 'short');
  const fallbackTitle = ws.channel_username ? ('@' + String(ws.channel_username).replace(/^@/, '')) : (ws.title || 'Creator');
  const titleRaw = String(ws.profile_title || fallbackTitle || 'Creator');
  const title = titleRaw.replace(/^@/, '').trim();

  const verticals = fmtMatrixList(ws.profile_verticals, PROFILE_VERTICALS, '—');
  const formats = fmtMatrixList(ws.profile_formats, PROFILE_FORMATS, '—');
  const about = String(ws.profile_about || '').trim();

  if (v === 'long') {
    let t =
      `👋 Привет! Я делаю коллабы / UGC.\n\n`+
      (link ? `🔗 Витрина: ${link}\n\n` : '\n') +
      `🏷 Ниши:\n${verticals}\n` +
      `🎬 Форматы:\n${formats}\n` +
      (about ? `\nКоротко:\n${about}\n` : '') +
      `\nЧтобы оставить заявку: открой витрину и нажми «📝 Оставить заявку».`;
    return t;
  }

  // short
  let t =
    `👋 Привет! Я делаю коллабы / UGC.\n` +
    (link ? `🔗 Витрина: ${link}\n\n` : '\n') +
    `Оставь заявку: открой витрину и нажми «📝 Оставить заявку».`;
  return t;
}

function buildWsSharePlain(ws, wsId, variant = 'short') {
const link = wsBrandLink(wsId);

  const v = String(variant || 'short');
  const fallbackTitle = ws.channel_username ? ('@' + String(ws.channel_username).replace(/^@/, '')) : (ws.title || 'Creator');
  const titleRaw = String(ws.profile_title || fallbackTitle || 'Creator');
  const title = titleRaw.replace(/^@/, '').trim();

  const verticals = fmtMatrixList(ws.profile_verticals, PROFILE_VERTICALS, '—');
  const formats = fmtMatrixList(ws.profile_formats, PROFILE_FORMATS, '—');
  const about = String(ws.profile_about || '').trim();

  if (v === 'long') {
    let t =
      `👋 Привет! Я делаю коллабы / UGC.\n\n`+
      (link ? `🔗 Витрина: ${link}\n\n` : '\n') +
      `🏷 Ниши:\n${verticals}\n` +
      `🎬 Форматы:\n${formats}\n` +
      (about ? `\nКоротко:\n${about}\n` : '') +
      `\nЧтобы оставить заявку: открой витрину и нажми «📝 Оставить заявку».`;
    return t;
  }

  let t =
    `👋 Привет! Я делаю коллабы / UGC.\n` +
    (link ? `🔗 Витрина: ${link}\n\n` : '\n') +
    `Оставь заявку: открой витрину и нажми «📝 Оставить заявку».`;
  return t;
}


function buildLeadTemplateText(ws, lead, key = 'thanks') {
  const channel = ws.channel_username ? '@' + String(ws.channel_username).replace(/^@/, '') : ws.title;
  const to = String(ws.profile_title || channel);

  const wants = fmtMatrix(ws.profile_formats, PROFILE_FORMATS, 'UGC/интеграция');
  const formatsShort = wants;

  switch (String(key)) {
    case 'brief':
    case 'need_tz':
      return `Привет! Спасибо за заявку. Пришли, пожалуйста, бриф/ТЗ, референсы и дедлайн — я отвечу с форматом и ценой.`;
    case 'price':
    case 'budget':
      return `Привет! Чтобы назвать прайс, уточни: 🎬 UGC или 📣 интеграция, длительность/формат, дедлайн и бюджет (или диапазон).`;
    case 'timing':
      return `Привет! Подскажи дедлайн и объём (1/3/5 видео или другой пакет). Я скажу сроки производства и варианты.`;
    case 'delivery':
      return `Привет! Подскажи город/доставка и что за продукт — это влияет на сроки.`;
    case 'format':
      return `Привет! Уточни, пожалуйста, что нужно: 🎬 UGC или 📣 интеграция? По форматам у меня: ${formatsShort}.`;
    case 'decline':
      return `Спасибо за обращение! Сейчас не сможем взять эту интеграцию.

Если появится релевантный формат/бюджет — будем рады вернуться к диалогу.`;

    case 'discuss':
    case 'thanks':
    default:
      return `Привет! Спасибо за заявку. Давай обсудим детали: что за продукт, дедлайн, 🎬 UGC или 📣 интеграция и условия (бартер/бюджет).`;
  }
}
function normalizeIgHandle(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  let s = raw.replace(/\s+/g, '');
  s = s.replace(/^@/, '');

  // instagram.com/<handle>
  const m = s.match(/instagram\.com\/([^\/\?\#]+)/i);
  if (m) {
    const seg = String(m[1] || '').trim();
    const bad = ['reel', 'p', 'tv', 'stories', 'explore'].includes(seg.toLowerCase());
    if (bad) return null;
    const hm = seg.replace(/^@/, '').match(/^([A-Za-z0-9._]{2,30})$/);
    return hm ? hm[1] : null;
  }

  // If it's some other URL — reject
  if (/^https?:\/\//i.test(s)) return null;

  // plain handle
  const hm = s.match(/^([A-Za-z0-9._]{2,30})$/);
  if (!hm) return null;
  const bad = ['reel', 'p', 'tv', 'stories', 'explore'].includes(hm[1].toLowerCase());
  if (bad) return null;
  return hm[1];
}

function parseUrlsFromText(input, max = 3) {
  const text = String(input || '');
  const re = /(https?:\/\/[^\s<>"']+)/gi;
  const out = [];
  let m;
  while ((m = re.exec(text))) {
    let u = String(m[1] || '').trim();
    // strip trailing punctuation
    u = u.replace(/[)\],.!?]+$/g, '');
    if (!u) continue;
    if (!out.includes(u)) out.push(u);
    if (out.length >= max) break;
  }
  return out;
}

function extractFirstContact(input) {
  const text = String(input || '');
  const m = text.match(/@([a-zA-Z0-9_]{5,})/);
  if (m) return '@' + m[1];
  const tm = text.match(/(?:https?:\/\/)?t\.me\/([a-zA-Z0-9_]{5,})/i);
  if (tm) return '@' + tm[1];
  const urls = parseUrlsFromText(text, 1);
  if (urls.length) return urls[0];
  return null;
}

function wsProfileKb(wsId, ws) {
  const vCount = Array.isArray(ws.profile_verticals) ? ws.profile_verticals.length : 0;
  const fCount = Array.isArray(ws.profile_formats) ? ws.profile_formats.length : 0;

  // UX: "Предпросмотр" — главный CTA, дальше парные кнопки по смыслу.
  const kb = new InlineKeyboard()
    .text('👁 Предпросмотр', `a:wsp_preview|ws:${wsId}`)
    .row()
    .text(`🏷 Ниши (${vCount}/3)`, `a:ws_prof_verticals|ws:${wsId}`)
    .text(`🎬 Форматы (${fCount}/5)`, `a:ws_prof_formats|ws:${wsId}`)
    .row()
    .text('✏️ Название', `a:ws_prof_edit|ws:${wsId}|f:title`)
    .text('✏️ Контакт', `a:ws_prof_edit|ws:${wsId}|f:contact`)
    .row()
    .text('📸 Instagram', `a:ws_prof_edit|ws:${wsId}|f:ig`)
    .text('🔗 Портфолио', `a:ws_prof_edit|ws:${wsId}|f:portfolio`)
    .row()
    .text('✏️ Гео', `a:ws_prof_edit|ws:${wsId}|f:geo`)
    .text('📝 Описание', `a:ws_prof_edit|ws:${wsId}|f:about`)
    .row()
    .text('🧹 Сбросить витрину', `a:ws_prof_reset|ws:${wsId}`)
    .row()
    .text('🧩 Режим', `a:ws_prof_mode|ws:${wsId}`)
    .text('📌 IG шаблоны', `a:ws_ig_templates|ws:${wsId}`)
    .row()
    .text('⬅️ Назад', `a:ws_open|ws:${wsId}`).text('📋 Меню', 'a:menu')
    .row()
    .text('🏠 Home', 'a:home');

  return kb;
}


function hasText(v) {
  return v !== null && v !== undefined && String(v).trim().length > 0 && String(v).trim() !== '—';
}

function calcWsProfileProgress(ws) {
  // Core fields that most сильно влияют на конверсию
  const igOk = hasText(ws.profile_ig);
  const contactOk = hasText(ws.profile_contact);
  const verticalsOk = Array.isArray(ws.profile_verticals) && ws.profile_verticals.length > 0;
  const formatsOk = Array.isArray(ws.profile_formats) && ws.profile_formats.length > 0;
  const ports = Array.isArray(ws.profile_portfolio_urls) ? ws.profile_portfolio_urls : [];
  const portfolioOk = ports.length > 0;
  const aboutOk = hasText(ws.profile_about);

  const checks = [
    { key: 'ig', ok: igOk },
    { key: 'contact', ok: contactOk },
    { key: 'verticals', ok: verticalsOk },
    { key: 'formats', ok: formatsOk },
    { key: 'portfolio', ok: portfolioOk },
    { key: 'about', ok: aboutOk },
  ];

  const total = checks.length;
  const done = checks.filter(x => x.ok).length;
  const percent = Math.round((done / total) * 100);

  const missing = [];
  if (!portfolioOk) missing.push('🔗 Портфолио: добавь 1–3 ссылки — <b>самый сильный буст конверсии</b>');
  if (!formatsOk) missing.push('🎬 Форматы: выбери 3–5 (брендам проще выбрать)');
  if (!verticalsOk) missing.push('🏷 Ниши: выбери до 3 (точнее матчи)');
  if (!igOk) missing.push('📸 Instagram: укажи @ или ссылку (доверие)');
  if (!contactOk) missing.push('✉️ Контакт: @username / t.me/... (быстро договориться)');
  if (!aboutOk) missing.push('📝 Описание: 1–2 строки, что именно ты снимаешь');

  const nextHint = !portfolioOk
    ? '💡 Добавь 1 ссылку портфолио — это обычно сильнее всего повышает конверсию.'
    : '💡 Держи 1–3 лучших ссылок в портфолио — бренд решает по примерам.';

  return { total, done, percent, missing, portfolioOk, igOk, contactOk, verticalsOk, formatsOk, aboutOk, nextHint };
}


async function renderWsProfile(ctx, ownerUserId, wsId, opts = {}) {
  const isAdmin = isSuperAdminTg(ctx.from?.id);

  let ws0 = null;
  try {
    ws0 = isAdmin ? await db.getWorkspaceAny(wsId) : await db.getWorkspace(ownerUserId, wsId);
  } catch (_) {
    ws0 = null;
  }
  if (!ws0) { await safeEditOrReply(ctx, '⚠️ Канал не найден или нет доступа. Открой 📋 Меню → выбери канал и повтори.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') }); return; }

  try { await db.ensureWorkspaceSettings(wsId); } catch {}

  const ws = isAdmin ? await db.getWorkspaceAny(wsId) : await db.getWorkspace(ownerUserId, wsId);
  if (!ws) { await safeEditOrReply(ctx, '⚠️ Канал не найден или нет доступа. Открой 📋 Меню → выбери канал и повтори.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') }); return; }

  let isPro = false;
  try { isPro = await db.isWorkspacePro(wsId); } catch {}

  const channel = ws.channel_username ? '@' + ws.channel_username : ws.title;
  const name = ws.profile_title || channel;
  const mode = String(ws.profile_mode || 'both');
  const ig = ws.profile_ig ? String(ws.profile_ig) : null;

  const verticalsTxt = fmtMatrix(ws.profile_verticals, PROFILE_VERTICALS);
  const formatsTxt = fmtMatrix(ws.profile_formats, PROFILE_FORMATS);

  const geoRaw = ws.profile_geo ? String(ws.profile_geo).trim() : '';
  const contactRawTxt = ws.profile_contact ? String(ws.profile_contact).trim() : '';
  const aboutRaw = ws.profile_about ? String(ws.profile_about).trim() : '';

  const canUnlockContacts = !!contactRawTxt || !!ws.channel_username;

  const link = wsBrandLink(wsId);

  let igLine = '—';
  if (ig) {
    igLine =
      `<a href="https://instagram.com/${escapeHtml(ig)}">instagram.com/${escapeHtml(ig)}</a>\n` +
      `<code>@${escapeHtml(ig)}</code>`;
  }

  let portLine = '—';
  const ports = Array.isArray(ws.profile_portfolio_urls) ? ws.profile_portfolio_urls : [];
  if (ports.length) {
    portLine = ports
      .slice(0, 3)
      .map(u => `• <a href="${escapeHtml(String(u))}">${escapeHtml(shortUrl(u))}</a>`)
      .join('\n');
    if (ports.length > 3) portLine += `\n• <i>+ ещё ${ports.length - 3}</i>`;
  }

  const proLine = isPro ? '⭐️ PRO: <b>активен</b>' : '⭐️ PRO: <b>free</b>';
  const modeLine = PROFILE_MODE_LABELS[mode] || PROFILE_MODE_LABELS.both;

  const prog = calcWsProfileProgress(ws);
  const progressLine = `📈 Заполнено: <b>${prog.percent}%</b> (${prog.done}/${prog.total})`;

  const statusLines = [];
  statusLines.push(`<b>Статус</b>`);
  statusLines.push(`• Канал: <b>${escapeHtml(channel)}</b>`);
  statusLines.push(`• ${proLine}`);
  statusLines.push(`• ${progressLine}`);
  if (prog?.nextHint) statusLines.push(`• <i>${escapeHtml(String(prog.nextHint))}</i>`);

  if (prog?.missing?.length) {
    const missing = prog.missing.slice(0, 5);
    statusLines.push('');
    statusLines.push(`⚡️ <b>Что добавить, чтобы заявки шли чаще</b>`);
    statusLines.push(...missing.map(x => `• ${x}`));
    if (prog.missing.length > 5) statusLines.push(`• <i>+ ещё ${prog.missing.length - 5}</i>`);
  } else {
    statusLines.push('');
    statusLines.push(`✅ Профиль выглядит 🔥 — можно лить трафик из IG.`);
  }

  const blocks = [];
  blocks.push(`👤 <b>Профиль</b>`);
  blocks.push('');
  blocks.push(`Это твоя <b>витрина для брендов</b>. Заполни поля ниже и открой <b>предпросмотр</b>, чтобы увидеть, как она выглядит.`);
  blocks.push('');
  blocks.push(statusLines.join('\n'));

  // Основное
  {
    const lines = [];
    lines.push(`<b>Основное</b>`);
    lines.push(`• Название/витрина: <b>${escapeHtml(String(name || '—'))}</b>`);
    lines.push(`• Режим: <b>${escapeHtml(String(modeLine || '—'))}</b>`);
    lines.push(`• Ниши: <code>${escapeHtml(String(verticalsTxt || '—'))}</code>`);
    lines.push(`• Гео: <b>${escapeHtml(geoRaw || '—')}</b>`);
    blocks.push('');
    blocks.push(lines.join('\n'));
  }

  // Контент
  {
    const lines = [];
    lines.push(`<b>Контент</b>`);
    lines.push(`• Форматы: <code>${escapeHtml(String(formatsTxt || '—'))}</code>`);
    lines.push(`• Описание: ${escapeHtml(aboutRaw ? clipText(aboutRaw, 320) : '—')}`);
    blocks.push('');
    blocks.push(lines.join('\n'));
  }

  // Портфолио
  {
    const lines = [];
    lines.push(`<b>Портфолио</b>`);
    lines.push(`• Instagram:\n${igLine}`);
    lines.push(`• Ссылки/кейсы:\n${portLine}`);
    blocks.push('');
    blocks.push(lines.join('\n'));
  }

  // Контакты
  {
    const lines = [];
    lines.push(`<b>Контакты</b>`);
    lines.push(`• Контакт: <b>${escapeHtml(contactRawTxt || '—')}</b>`);
    blocks.push('');
    blocks.push(lines.join('\n'));
  }

  blocks.push('');
  blocks.push(
    link
      ? `🔗 <b>Ссылка для брендов</b> (вставь в IG bio / сторис):\n<code>${escapeHtml(link)}</code>`
      : `⚠️ Не задан BOT_USERNAME — ссылка для брендов недоступна.`
  );

  const text = blocks.join('\n');

  const extra = { parse_mode: 'HTML', reply_markup: wsProfileKb(wsId, ws), disable_web_page_preview: true };

  const et = opts && opts.editTarget ? opts.editTarget : null;
  if (et && et.chatId && et.messageId) {
    try {
      await ctx.api.editMessageText(Number(et.chatId), Number(et.messageId), text, extra);
      return;
    } catch {}
  }

  try {
    await safeEditOrReply(ctx, text, extra);
  } catch {
    await ctx.reply(text, extra);
  }
}




async function renderWsShareMenu(ctx, ownerUserId, wsId, ret = null) {
  const isAdmin = isSuperAdminTg(ctx.from?.id);
  const ws = isAdmin ? await db.getWorkspaceAny(wsId) : await db.getWorkspace(ownerUserId, wsId);
  if (!ws) { await safeEditOrReply(ctx, '⚠️ Канал не найден. Открой 📋 Меню → выбери канал и повтори.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') }); return; }
  if (!isAdmin && Number(ws.owner_user_id) !== Number(ownerUserId)) { await safeEditOrReply(ctx, '⚠️ Нет доступа. Открой 📋 Меню → выбери канал заново.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') }); return; }

  const link = wsBrandLink(wsId);

  const text =
    `🔗 <b>Поделиться витриной</b>\n\n` +
    `Покажу готовый текст в этом сообщении — ты сможешь скопировать и переслать бренду.\n\n` +
    (link ? `Витрина: <a href="${escapeHtml(link)}">${escapeHtml(link)}</a>\n\n` : '') +
    `Выбери вариант:`;

  const kb = new InlineKeyboard()
    .text('📄 Коротко', `a:ws_share_send|ws:${wsId}|v:short`)
    .text('📄 Подробно', `a:ws_share_send|ws:${wsId}|v:long`)
    .row();
  const retKey = String(ret || '').trim();
  const backCb = retKey === 'ws_open' ? `a:ws_open|ws:${wsId}` : `a:ws_profile|ws:${wsId}`;
  kbNavRow(kb, backCb);

  try {
    await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  } catch {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  }
}

async function sendWsShareTextMessage(ctx, ownerUserId, wsId, variant = 'short') {
  const isAdmin = isSuperAdminTg(ctx.from?.id);
  const ws = isAdmin ? await db.getWorkspaceAny(wsId) : await db.getWorkspace(ownerUserId, wsId);
  if (!ws) { await safeEditOrReply(ctx, '⚠️ Канал не найден. Открой 📋 Меню → выбери канал и повтори.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') }); return; }
  if (!isAdmin && Number(ws.owner_user_id) !== Number(ownerUserId)) { await safeEditOrReply(ctx, '⚠️ Нет доступа. Открой 📋 Меню → выбери канал заново.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') }); return; }

  const text = buildWsShareText(ws, wsId, variant);

  // Показываем текст в этом же сообщении (чтобы не оставлять "висящие" сообщения без кнопок)
  const link = wsBrandLink(wsId) || '';
  const channel = ws.channel_username ? '@' + String(ws.channel_username).replace(/^@/, '') : (ws.title || 'канал');
  const channelUrl = ws.channel_username ? `https://t.me/${String(ws.channel_username).replace(/^@/, '')}` : '';
  const ig = wsIgHandleFromWs(ws);
  const igUrl = wsIgUrlFromWs(ws);
  const plain = (() => {
  const fallbackTitle = ws.channel_username ? ('@' + String(ws.channel_username).replace(/^@/, '')) : (ws.title || 'Creator');
  const titleRaw = String(ws.profile_title || fallbackTitle || 'Creator');
    const title = titleRaw.replace(/^@/, '').trim();
    const verticals = fmtMatrixList(ws.profile_verticals, PROFILE_VERTICALS, '—');
    const formats = fmtMatrixList(ws.profile_formats, PROFILE_FORMATS, '—');
    const about = String(ws.profile_about || '').trim();

    if (String(variant) === 'long') {
      let t =
        `👋 Привет! Я делаю коллабы / UGC.\n\n`+
        (link ? `🔗 Витрина: ${link}\n\n` : '\n') +
        `🏷 Ниши:\n${verticals}\n` +
        `🎬 Форматы:\n${formats}\n` +
        (about ? `\nКоротко:\n${about}\n` : '') +
        `\nЧтобы оставить заявку: открой витрину и нажми «📝 Оставить заявку».`;
      return t;
    }

    // short
    let t =
      `👋 Привет! Я делаю коллабы / UGC.\n` +
      (link ? `🔗 Витрина: ${link}\n\n` : '\n') +
      `Оставь заявку: открой витрину и нажми «📝 Оставить заявку».`;
    return t;
  })();;;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent('⁠')}&text=${encodeURIComponent(plain)}`;

  const kb = new InlineKeyboard()
    .url('📨 Отправить', shareUrl)
    .row()
    .text('👤 Профиль', `a:ws_profile|ws:${wsId}`);
  kbNavRow(kb, `a:ws_share|ws:${wsId}`);

  try {
    await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  } catch {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  }

  try { await ctx.answerCallbackQuery({ text: '✅ Текст открыт' }); } catch {}
}


async function renderWsIgTemplatesMenu(ctx, ownerUserId, wsId) {
  const isAdmin = isSuperAdminTg(ctx.from?.id);
  const ws = isAdmin ? await db.getWorkspaceAny(wsId) : await db.getWorkspace(ownerUserId, wsId);
  if (!ws) { await safeEditOrReply(ctx, '⚠️ Канал не найден. Открой 📋 Меню → выбери канал и повтори.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') }); return; }
  if (!isAdmin && Number(ws.owner_user_id) !== Number(ownerUserId)) { await safeEditOrReply(ctx, '⚠️ Нет доступа. Открой 📋 Меню → выбери канал заново.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') }); return; }

  const link = wsBrandLink(wsId);
  const channel = ws.channel_username ? '@' + ws.channel_username : ws.title;
  const to = String(ws.profile_title || channel);

  const text =
    `📌 <b>Шаблоны для Instagram</b>\n\n` +
    `Скопируй текст ниже (покажу в этом сообщении) и вставь в Stories/пост/DM.\n` +
    `Ссылка ведёт бренда прямо в Telegram-воронку (витрина → заявка → сделка).\n\n` +
    `Канал: <b>${escapeHtml(channel)}</b>\n` +
    `Профиль: <b>${escapeHtml(to)}</b>\n` +
    (link ? `Витрина: <a href="${escapeHtml(link)}">${escapeHtml(link)}</a>\n\n` : '\n') +
    `Выбери формат:`;

  const kb = new InlineKeyboard()
    .text('📲 Stories', `a:ws_ig_templates_send|ws:${wsId}|t:story`)
    .text('🖼️ Пост', `a:ws_ig_templates_send|ws:${wsId}|t:post`)
    .row()
    .text('💬 DM бренду', `a:ws_ig_templates_send|ws:${wsId}|t:dm`)
    .text('🔖 Bio', `a:ws_ig_templates_send|ws:${wsId}|t:bio`)
    .row();
  kbNavRow(kb, `a:ws_profile|ws:${wsId}`);

  try {
    await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  } catch {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  }
}

function buildWsIgTemplate(ws, wsId, type = 'story') {
  const link = wsBrandLink(wsId) || '';
  const channel = ws.channel_username ? '@' + ws.channel_username : ws.title;
  const title = String(ws.profile_title || channel);

  const mode = String(ws.profile_mode || 'both');
  const modeLine = PROFILE_MODE_LABELS[mode] || PROFILE_MODE_LABELS.both;

  const verticalsTxt = fmtMatrix(ws.profile_verticals, PROFILE_VERTICALS);
  const formatsTxt = fmtMatrix(ws.profile_formats, PROFILE_FORMATS);

  const ig = ws.profile_ig ? String(ws.profile_ig).trim() : '';
  const igCode = ig ? `@${ig.replace(/^@/, '')}` : '';
  const igLink = ig ? `https://instagram.com/${ig.replace(/^@/, '')}` : '';

  const ports = Array.isArray(ws.profile_portfolio_urls) ? ws.profile_portfolio_urls : [];
  const port1 = ports[0] ? String(ports[0]) : '';

  const contact = ws.profile_contact ? String(ws.profile_contact).trim() : '';

  // Decide best "offer line" depending on mode
  const offerLine = (() => {
    if (mode === 'ugc') return 'UGC-контент для брендов (видео/сторис/распаковки) + материалы для рекламы.';
    if (mode === 'channel') return 'Интеграции в Telegram-канале + конкурсы/розыгрыши.';
    return 'UGC + интеграции в Telegram-канале + конкурсы/розыгрыши.';
  })();

  const common = {
    title,
    channel,
    modeLine,
    verticalsTxt,
    formatsTxt,
    link,
    igCode,
    igLink,
    port1,
    contact,
    offerLine
  };

  const templates = {
    story: [
      `Бренды 🤝 открыта к коллабам`,
      `${offerLine}`,
      `Ниши: ${verticalsTxt}`,
      `Форматы: ${formatsTxt}`,
      link ? `ТЗ/заявка в TG: ${link}` : `ТЗ/заявка в TG: (ссылка из профиля)`,
    ].join('\n'),
    post: [
      `Бренды, привет! Я ${title}.`,
      offerLine,
      `Ниши: ${verticalsTxt}`,
      `Форматы: ${formatsTxt}`,
      port1 ? `Портфолио: ${port1}` : `Портфолио: (ссылка в TG-профиле)`,
      link ? `Чтобы быстро обсудить — заполните заявку в Telegram: ${link}` : `Заявка в Telegram: (ссылка из профиля)`,
      igCode ? `IG: ${igCode}` : '',
    ].filter(Boolean).join('\n'),
    dm: [
      `Привет! Я ${title}.`,
      `Делаю: ${offerLine}`,
      `Ниши: ${verticalsTxt}. Форматы: ${formatsTxt}.`,
      port1 ? `Портфолио: ${port1}` : '',
      link ? `Если актуально — оставьте заявку/ТЗ в TG (1 мин): ${link}` : `Если актуально — напишите, пришлю ссылку в TG.`,
    ].filter(Boolean).join('\n'),
    bio: [
      `UGC + Collabs`,
      `Ниши: ${verticalsTxt}`,
      link ? `Заявка/ТЗ (TG): ${link}` : `Заявка/ТЗ (TG): (ссылка из профиля)`,
    ].join(' | ')
  };

  const raw = templates[type] || templates.story;

  // Wrapper message (HTML) with <pre> for easy copy
  const typeTitle = ({ story: 'Stories', post: 'Пост (подпись)', dm: 'DM бренду', bio: 'Bio строка' }[type] || 'Stories');

  const hint =
    type === 'story'
      ? `💡 В Stories добавь <b>стикер-ссылку</b> на витрину (Telegram).`
      : type === 'bio'
        ? `💡 Можно поставить в bio или в link-in-bio.`
        : `💡 Скопируй и вставь, потом при желании подправь 1–2 строки под себя.`;

  const extra =
    (igLink || contact)
      ? `\n\nКонтакты: ` +
        [igLink ? `<a href="${escapeHtml(igLink)}">${escapeHtml(igCode || igLink)}</a>` : null,
         contact ? escapeHtml(contact) : null]
        .filter(Boolean).join(' • ')
      : '';

  return (
    `📌 <b>Шаблон IG — ${escapeHtml(typeTitle)}</b>\n` +
    `${hint}\n\n` +
    `<pre>${escapeHtml(raw)}</pre>` +
    extra
  );
}

function buildWsIgDmRaw(ws, wsId, tone = 'soft', variantIndex = 0) {
  const link = wsBrandLink(wsId) || '';
  const channel = ws.channel_username ? '@' + ws.channel_username : ws.title;
  const title = String(ws.profile_title || channel);

  const mode = String(ws.profile_mode || 'both');
  const verticalsTxt = fmtMatrix(ws.profile_verticals, PROFILE_VERTICALS);
  const formatsTxt = fmtMatrix(ws.profile_formats, PROFILE_FORMATS);

  const igHandle = normalizeIgHandle(ws.profile_ig);
  const igCode = igHandle ? `@${igHandle}` : '';
  const ports = Array.isArray(ws.profile_portfolio_urls) ? ws.profile_portfolio_urls : [];
  const port1 = ports[0] ? String(ports[0]) : '';

  const offerLine = (() => {
    if (mode === 'ugc') return 'UGC-контент для брендов (видео/сторис/распаковки) + материалы для рекламы.';
    if (mode === 'channel') return 'Интеграции в Telegram-канале + конкурсы/розыгрыши.';
    return 'UGC + интеграции в Telegram-канале + конкурсы/розыгрыши.';
  })();

  const soft = [
    [
      `Привет! Я ${title} 👋`,
      `Увидела ваш бренд и хочу предложить коллаб: ${offerLine}`,
      `Ниши: ${verticalsTxt}. Форматы: ${formatsTxt}.`,
      port1 ? `Портфолио: ${port1}` : '',
      link ? `Если ок — можно быстро оставить ТЗ/заявку в TG (1 мин): ${link}` : '',
      igCode ? `Мой IG: ${igCode}` : '',
    ].filter(Boolean).join('\n'),
    [
      `Здравствуйте! Я ${title}.`,
      `Делаю ${offerLine}`,
      `Могу снять: ${formatsTxt} (ниши: ${verticalsTxt}).`,
      port1 ? `Примеры: ${port1}` : '',
      link ? `Чтобы не теряться — оставьте заявку в TG: ${link}` : '',
    ].filter(Boolean).join('\n'),
    [
      `Добрый день! Я ${title}.`,
      `Ищу коллабы с брендами в нишах: ${verticalsTxt}.`,
      `Форматы: ${formatsTxt}. ${offerLine}`,
      port1 ? `Портфолио: ${port1}` : '',
      link ? `Если интересно — вот витрина/заявка в TG: ${link}` : '',
    ].filter(Boolean).join('\n'),
  ];

  const hard = [
    [
      `Привет! Я ${title}.`,
      `Снимаю ${formatsTxt} для брендов (ниши: ${verticalsTxt}).`,
      `Могу сделать ${offerLine}`,
      port1 ? `Портфолио: ${port1}` : '',
      link ? `Если хотите обсудить быстро — ТЗ/заявка в TG: ${link}` : '',
    ].filter(Boolean).join('\n'),
    [
      `Привет 👋 ${title} на связи.`,
      `Нужно UGC/интеграция без долгих переписок?`,
      `${offerLine}`,
      `Ниши: ${verticalsTxt}. Форматы: ${formatsTxt}.`,
      link ? `Киньте ТЗ сюда (TG, 1 мин): ${link}` : '',
    ].filter(Boolean).join('\n'),
    [
      `Привет! Я ${title}.`,
      `Делаю контент “под рекламу” + быстрые согласования.`,
      `Форматы: ${formatsTxt}. Ниши: ${verticalsTxt}.`,
      port1 ? `Примеры: ${port1}` : '',
      link ? `Если актуально — заполните короткую заявку в TG: ${link}` : '',
    ].filter(Boolean).join('\n'),
  ];

  const t = String(tone || 'soft').toLowerCase();
  const pool = t === 'hard' ? hard : soft;
  const idx = Math.abs(Number(variantIndex || 0)) % pool.length;
  return { raw: pool[idx], idx, total: pool.length, tone: (t === 'hard' ? 'hard' : 'soft') };
}

function buildWsIgDmMessage(ws, wsId, tone = 'soft', variantIndex = 0) {
  const t = String(tone || 'soft').toLowerCase();
  const toneLabel = t === 'hard' ? '⚡ Директ' : '🤝 Мягкий';
  const { raw, idx, total } = buildWsIgDmRaw(ws, wsId, t, variantIndex);

  const hint =
    `💡 Это варианты для аккуратного аутрича/АБ-теста. Персонализируй 1 строку под бренд — конверсия выше.`;

  return (
    `📌 <b>DM бренду — ${escapeHtml(toneLabel)}</b> (${idx + 1}/${total})\n` +
    `${hint}\n\n` +
    `<pre>${escapeHtml(raw)}</pre>`
  );
}

async function renderWsIgDmTemplate(ctx, ownerUserId, wsId, tone = 'soft', variantIndex = 0) {
  const isAdmin = isSuperAdminTg(ctx.from?.id);
  const ws = isAdmin ? await db.getWorkspaceAny(wsId) : await db.getWorkspace(ownerUserId, wsId);
  if (!ws) { await safeEditOrReply(ctx, '⚠️ Канал не найден. Открой 📋 Меню → выбери канал и повтори.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') }); return; }
  if (!isAdmin && Number(ws.owner_user_id) !== Number(ownerUserId)) { await safeEditOrReply(ctx, '⚠️ Нет доступа. Открой 📋 Меню → выбери канал заново.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') }); return; }

  const t = String(tone || 'soft').toLowerCase();
  const toneNorm = (t === 'hard' ? 'hard' : 'soft');
  const i = Math.max(0, Number(variantIndex || 0));

  const text = buildWsIgDmMessage(ws, wsId, toneNorm, i);

  const kb = new InlineKeyboard()
    .text(`${toneNorm === 'soft' ? '✅ ' : ''}🤝 Мягкий`, `a:ws_ig_dm|ws:${wsId}|tone:soft|i:${toneNorm === 'soft' ? i : 0}`)
    .text(`${toneNorm === 'hard' ? '✅ ' : ''}⚡ Директ`, `a:ws_ig_dm|ws:${wsId}|tone:hard|i:${toneNorm === 'hard' ? i : 0}`)
    .row()
    .text('📤 Ещё вариант', `a:ws_ig_dm|ws:${wsId}|tone:${toneNorm}|i:${i + 1}`)
    .row()
    .text('⬅️ Назад', `a:ws_ig_templates|ws:${wsId}`).text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');

  try {
    await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  } catch {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  }
}



async function sendWsIgTemplateMessage(ctx, ownerUserId, wsId, type = 'story') {
  const isAdmin = isSuperAdminTg(ctx.from?.id);
  const ws = isAdmin ? await db.getWorkspaceAny(wsId) : await db.getWorkspace(ownerUserId, wsId);
  if (!ws) { await safeEditOrReply(ctx, '⚠️ Канал не найден. Открой 📋 Меню → выбери канал и повтори.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') }); return; }
  if (!isAdmin && Number(ws.owner_user_id) !== Number(ownerUserId)) { await safeEditOrReply(ctx, '⚠️ Нет доступа. Открой 📋 Меню → выбери канал заново.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') }); return; }

  const t = String(type || 'story');
  const allowed = ['story', 'post', 'dm', 'bio'];
  const tt = allowed.includes(t) ? t : 'story';

  // DM templates are interactive (tone + variants) to avoid sending many messages.
  if (tt === 'dm') {
    await renderWsIgDmTemplate(ctx, ownerUserId, wsId, 'soft', 0);
    try { await ctx.answerCallbackQuery({ text: '✅ DM шаблон открыт' }); } catch {}
    return;
  }

  const msg = buildWsIgTemplate(ws, wsId, tt);

  // Показываем шаблон в этом же сообщении (без лишнего спама в чате)
  const kb = new InlineKeyboard()
    .text('👤 Профиль', `a:ws_profile|ws:${wsId}`);
  kbNavRow(kb, `a:ws_ig_templates|ws:${wsId}`);

  try {
    await safeEditOrReply(ctx, msg, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  } catch {
    await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  }

  try { await ctx.answerCallbackQuery({ text: '✅ Шаблон открыт' }); } catch {}
}
async function renderWsProfileMode(ctx, ownerUserId, wsId) {
  const isAdmin = isSuperAdminTg(ctx.from?.id);
  const ws = isAdmin ? await db.getWorkspaceAny(wsId) : await db.getWorkspace(ownerUserId, wsId);
  if (!ws) { await safeEditOrReply(ctx, '⚠️ Канал не найден. Открой 📋 Меню → выбери канал и повтори.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') }); return; }
  if (!isAdmin && Number(ws.owner_user_id) !== Number(ownerUserId)) { await safeEditOrReply(ctx, '⚠️ Нет доступа. Открой 📋 Меню → выбери канал заново.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') }); return; }
  const cur = String(ws.profile_mode || 'both');

  const kb = new InlineKeyboard()
    .text(`${cur === 'channel' ? '✅ ' : ''}Канал`, `a:ws_prof_mode_set|ws:${wsId}|m:channel`)
    .text(`${cur === 'ugc' ? '✅ ' : ''}UGC`, `a:ws_prof_mode_set|ws:${wsId}|m:ugc`)
    .row()
    .text(`${cur === 'both' ? '✅ ' : ''}Оба`, `a:ws_prof_mode_set|ws:${wsId}|m:both`);
  kbNavRow(kb, `a:ws_profile|ws:${wsId}`);

  const text =
    `🧩 <b>Режим профиля</b>\n\n` +
    `• <b>Канал</b> — интеграции/посты в TG\n` +
    `• <b>UGC</b> — контент без аудитории (файлы)\n` +
    `• <b>Оба</b> — лучше по РФ-рынку\n\n` +
    `Сейчас: <b>${escapeHtml(PROFILE_MODE_LABELS[cur] || PROFILE_MODE_LABELS.both)}</b>`;

  const extra = { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true };
  try {
    await safeEditOrReply(ctx, text, extra);
  } catch {
    await ctx.reply(text, extra);
  }
}


async function renderWsProfileVerticals(ctx, ownerUserId, wsId) {
  const isAdmin = isSuperAdminTg(ctx.from?.id);
  const ws = isAdmin ? await db.getWorkspaceAny(wsId) : await db.getWorkspace(ownerUserId, wsId);
  if (!ws) { await safeEditOrReply(ctx, '⚠️ Канал не найден. Открой 📋 Меню → выбери канал и повтори.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') }); return; }
  if (!isAdmin && Number(ws.owner_user_id) !== Number(ownerUserId)) { await safeEditOrReply(ctx, '⚠️ Нет доступа. Открой 📋 Меню → выбери канал заново.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') }); return; }

  const selected = Array.isArray(ws.profile_verticals) ? ws.profile_verticals.map(String) : [];
  const kb = new InlineKeyboard();

  PROFILE_VERTICALS.forEach((it, i) => {
    const on = selected.includes(it.key);
    kb.text(`${on ? '✅ ' : ''}${it.title}`, `a:ws_prof_vert_t|ws:${wsId}|v:${it.key}`);
    if (i % 2 === 1) kb.row();
  });

  kb.row()
    .text('🧹 Очистить', `a:ws_prof_vert_clear|ws:${wsId}`)
    .text('✅ Готово', `a:ws_profile|ws:${wsId}`);

  kbNavRow(kb, `a:ws_profile|ws:${wsId}`);

  const text =
    `🏷 <b>Ниши</b> (максимум 3)\n\n` +
    `Выбери до 3 ниш — так брендам проще понять, ты про что.\n\n` +
    `Сейчас: <b>${escapeHtml(fmtMatrix(selected, PROFILE_VERTICALS))}</b>`;

  const extra = { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true };
  try {
    await safeEditOrReply(ctx, text, extra);
  } catch {
    await ctx.reply(text, extra);
  }
}


async function renderWsProfileFormats(ctx, ownerUserId, wsId) {
  const isAdmin = isSuperAdminTg(ctx.from?.id);
  const ws = isAdmin ? await db.getWorkspaceAny(wsId) : await db.getWorkspace(ownerUserId, wsId);
  if (!ws) { await safeEditOrReply(ctx, '⚠️ Канал не найден. Открой 📋 Меню → выбери канал и повтори.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') }); return; }
  if (!isAdmin && Number(ws.owner_user_id) !== Number(ownerUserId)) { await safeEditOrReply(ctx, '⚠️ Нет доступа. Открой 📋 Меню → выбери канал заново.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') }); return; }

  const selected = Array.isArray(ws.profile_formats) ? ws.profile_formats.map(String) : [];
  const kb = new InlineKeyboard();

  PROFILE_FORMATS.forEach((it, i) => {
    const on = selected.includes(it.key);
    kb.text(`${on ? '✅ ' : ''}${it.title}`, `a:ws_prof_fmt_t|ws:${wsId}|f:${it.key}`);
    if (i % 2 === 1) kb.row();
  });

  kb.row()
    .text('🧹 Очистить', `a:ws_prof_fmt_clear|ws:${wsId}`)
    .text('✅ Готово', `a:ws_profile|ws:${wsId}`);

  kbNavRow(kb, `a:ws_profile|ws:${wsId}`);

  const text =
    `🎬 <b>Форматы</b> (максимум 5)\n\n` +
    `Выбери форматы — так брендам проще сделать быстрый заказ.\n\n` +
    `Сейчас: <b>${escapeHtml(fmtMatrix(selected, PROFILE_FORMATS))}</b>`;

  const extra = { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true };
  try {
    await safeEditOrReply(ctx, text, extra);
  } catch {
    await ctx.reply(text, extra);
  }
}


async function renderWsPublicProfile(ctx, wsId, opts = {}) {
  const ws = await withTimeout(db.getWorkspaceAny(wsId), 4500, 'ws.get');
  if (!ws) return ctx.reply('Профиль не найден.');

  const viewer = ctx?.from ? await db.upsertUser(ctx.from.id, ctx.from.username ?? null) : null;
  const isOwner = viewer && Number(viewer.id) === Number(ws.owner_user_id);

  let curatorUi = false;
  try {
    if (viewer && ctx?.from?.id) {
      const flags = await getRoleFlags(viewer, ctx.from.id);
      if (flags?.isCurator) curatorUi = await getCuratorMode(ctx.from.id);
    }
  } catch {}

  const isPreview = !!isOwner || !!curatorUi;

  const isCuratorPreview = !!curatorUi && !isOwner;

  // Brand Pass: show current balance прямо в витрине/диалоге (brand-facing UX).
  // If credits fetch fails — keep null to avoid неправильные подсказки.
  let brandCredits = null;
  if (!isPreview && viewer) {
    try {
      brandCredits = Number(await withTimeout(db.getBrandCredits(viewer.id), 2500, 'brand.credits'));
      if (!Number.isFinite(brandCredits)) brandCredits = 0;
    } catch {
      brandCredits = null;
    }
  }

  const hideApply = !!opts?.hideApply;
  const contactCbExtra = String(opts?.contactCbExtra || '');

  // Public view: hide direct contacts/channel by default to prevent bypassing the bot.
  // Contacts can be revealed via paid unlock (Brand Pass credits) and cached in Redis.
  let unlocked = false;
  if (!isPreview && viewer) {
    try {
      const key = k(['wsp_contact', wsId, viewer.id]);
      unlocked = !!(await redis.get(key));
    } catch {
      unlocked = false;
    }
  }
  const revealContacts = !!isPreview || !!unlocked || !!opts?.revealContacts;

  const linksEnabled = !!revealContacts && !isCuratorPreview;

  const channel = ws.channel_username ? '@' + ws.channel_username : ws.title;
  const publicName = ws.profile_title || ws.title || 'UGC Creator';
  const name = revealContacts ? (ws.profile_title || channel) : publicName;
  const mode = String(ws.profile_mode || 'both');
  const ig = ws.profile_ig ? String(ws.profile_ig) : null;

  const verticalsTxt = fmtMatrix(ws.profile_verticals, PROFILE_VERTICALS);
  const formatsTxt = fmtMatrix(ws.profile_formats, PROFILE_FORMATS);
  const geoRaw = ws.profile_geo ? String(ws.profile_geo).trim() : '';
  const contactRawTxt = ws.profile_contact ? String(ws.profile_contact).trim() : '';
  const aboutRaw = ws.profile_about ? String(ws.profile_about).trim() : '';

  const canUnlockContacts = !!contactRawTxt || !!ws.channel_username;

  let igLine = '';
  if (ig) {
    if (linksEnabled) {
      igLine =
        `<a href="https://instagram.com/${escapeHtml(ig)}">instagram.com/${escapeHtml(ig)}</a>\n` +
        `<code>@${escapeHtml(ig)}</code>`;
    } else {
      const igPlain = deLinkifyText(`instagram.com/${ig} • @${ig}`);
      igLine = `<code>${escapeHtml(igPlain)}</code>`;
    }
  }

  let portLine = '';
  const ports = Array.isArray(ws.profile_portfolio_urls) ? ws.profile_portfolio_urls : [];
  if (ports.length) {
    if (linksEnabled) {
      portLine = ports
        .slice(0, 3)
        .map(u => `• <a href="${escapeHtml(String(u))}">${escapeHtml(shortUrl(u))}</a>`)
        .join('\n');
    } else {
      portLine = ports
        .slice(0, 3)
        .map(u => `• <code>${escapeHtml(deLinkifyText(String(u)))}</code>`)
        .join('\n');
    }
    if (ports.length > 3) portLine += `\n• <i>+ ещё ${ports.length - 3}</i>`;
  }

  const modeLine = PROFILE_MODE_LABELS[mode] || PROFILE_MODE_LABELS.both;
  const prog = isOwner ? calcWsProfileProgress(ws) : null;

  const blocks = [];
  blocks.push(`✨ <b>${escapeHtml(name)}</b>`);
  blocks.push('');
  if (isPreview) {
    blocks.push(`👁 <b>Предпросмотр</b>: так бренды видят твою витрину.`);
    if (isOwner) blocks.push(`🔗 Чтобы поделиться витриной — нажми «🔗 Поделиться» ниже.`);
  } else {
    if (hideApply) blocks.push(`🪟 Витрина (read-only): продолжай через «💬 Диалог». Контакты на витрине — через «${contactUnlockBtnLabel()}».`);
    else blocks.push(`🪟 Витрина: нажми «📝 Оставить заявку». Контакты на витрине — через «${contactUnlockBtnLabel()}».`);

    if (brandCredits !== null) {
      blocks.push(brandPassBalanceLineHtml(brandCredits));
      if (canUnlockContacts && !revealContacts) {
        const needLine = brandPassContactsNeedLineHtml(brandCredits);
        if (needLine) blocks.push(needLine);
      }
    }
  }

  // Основное
  {
    const lines = [];
    lines.push(`<b>Основное</b>`);
    lines.push(`• Канал: <b>${escapeHtml(revealContacts ? channel : '🔒 скрыто')}</b>`);
    lines.push(`• Режим: <b>${escapeHtml(modeLine)}</b>`);
    if (geoRaw) lines.push(`• Гео: <b>${escapeHtml(geoRaw)}</b>`);
    if (verticalsTxt && verticalsTxt !== '—') lines.push(`• Ниши: <code>${escapeHtml(clipText(verticalsTxt, 180))}</code>`);
    blocks.push('');
    blocks.push(lines.join('\n'));
  }

  // Контент
  {
    const lines = [];
    if ((formatsTxt && formatsTxt !== '—') || aboutRaw) {
      lines.push(`<b>Контент</b>`);
      if (formatsTxt && formatsTxt !== '—') lines.push(`• Форматы: <code>${escapeHtml(clipText(formatsTxt, 220))}</code>`);
      if (aboutRaw) lines.push(`• Описание: ${escapeHtml(clipText(aboutRaw, 320))}`);
      blocks.push('');
      blocks.push(lines.join('\n'));
    }
  }

  // Портфолио
  {
    const lines = [];
    if (igLine || portLine) {
      lines.push(`<b>Портфолио</b>`);
      if (igLine) lines.push(`• Instagram:\n${igLine}`);
      if (portLine) lines.push(`• Ссылки/кейсы:\n${portLine}`);
      blocks.push('');
      blocks.push(lines.join('\n'));
    }
  }

  // Контакты
  {
    const lines = [];
    if (canUnlockContacts) {
      lines.push(`<b>Контакты</b>`);
      if (revealContacts) {
        if (contactRawTxt) lines.push(`• Контакт: <b>${escapeHtml(contactRawTxt)}</b>`);
        else lines.push(`• Контакт: —`);
      } else {
        lines.push(`• Контакты: <b>🔒 скрыто</b> (открываются через «${contactUnlockBtnLabel()}»)`);
      }
      blocks.push('');
      blocks.push(lines.join('\n'));
    }
  }

  if (isPreview) {
    blocks.push('');
    blocks.push(`Это предпросмотр. Чтобы вернуться — используй «⬅️ Назад» или «📋 Меню».`);
  }

  if (isOwner && prog) {
    blocks.push('');
    blocks.push(`📈 <b>Твой профиль</b>: <b>${prog.percent}%</b>. ${prog.nextHint}`);
  }

  const text = blocks.filter((x) => x !== null && x !== undefined).join('\n');

  const contactRaw = contactRawTxt;
  const contactUrl = (() => {
    if (!contactRaw) return null;
    const tg = wsTgUrlFromContact(contactRaw);
    if (tg) return tg;
    if (/^https?:\/\//i.test(contactRaw)) return contactRaw;
    if (/^t\.me\//i.test(contactRaw)) return 'https://' + contactRaw;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactRaw)) return 'mailto:' + contactRaw;
    return null;
  })();

  const kb = new InlineKeyboard();

  // CTA row
  if (!isPreview) {
    const dialogCb = opts?.dialogCb ? String(opts.dialogCb) : '';

    // Row 1: dialog (if any) + apply (public)
    let rowHas = false;
    if (dialogCb) {
      kb.text('💬 Диалог', dialogCb);
      rowHas = true;
    }
    if (!hideApply) {
      kb.text('📝 Оставить заявку', `a:wsp_lead_new|ws:${wsId}`);
      rowHas = true;
    }
    if (rowHas) kb.row();

    // Row 2: contacts gate (or direct contact once unlocked)
    const hasHidden = !!contactRawTxt || !!ws.channel_username || !!contactUrl;
    if (linksEnabled) {
      if (contactUrl) {
        kb.url('💬 Написать', contactUrl);
        kb.row();
      }
    } else if (hasHidden) {
      // Brand-facing UX: если кредитов нет — сразу ведём на покупку.
      // Если кредитов мало — оставляем и «Контакты», и «Купить», чтобы путь был очевиден.
      const balNum = (brandCredits === null || brandCredits === undefined) ? null : Number(brandCredits || 0);
      if (CONTACT_UNLOCK_COST <= 0) {
        kb.text(contactUnlockBtnLabel(), `a:wsp_contact_req|ws:${wsId}${contactCbExtra}`);
      } else if (balNum !== null) {
        if (balNum <= 0) {
          kb.text('🎫 Купить Brand Pass', 'a:brand_pass|ws:0');
        } else if (balNum < CONTACT_UNLOCK_COST) {
          kb.text(contactUnlockBtnLabel(), `a:wsp_contact_req|ws:${wsId}${contactCbExtra}`)
            .text('🎫 Купить Brand Pass', 'a:brand_pass|ws:0');
        } else {
          kb.text(contactUnlockBtnLabel(), `a:wsp_contact_req|ws:${wsId}${contactCbExtra}`);
        }
      } else {
        kb.text(contactUnlockBtnLabel(), `a:wsp_contact_req|ws:${wsId}${contactCbExtra}`);
      }
      kb.row();
    }
  } else {
    // Preview: keep buttons minimal (no direct contact links).
  }

  // Owner-only CTA
  if (isOwner) {
    kb.text('🔗 Поделиться', `a:ws_share|ws:${wsId}`).row();
  }

  // Links
  if (ws.channel_username && linksEnabled) kb.url('📣 Telegram канал', `https://t.me/${String(ws.channel_username).replace(/^@/, '')}`);
  if (ig && linksEnabled) kb.url('📸 Instagram', `https://instagram.com/${ig}`);
  const backCb = opts?.backCb || (isOwner ? `a:ws_profile|ws:${wsId}` : null);
  if (backCb) kb.row().text('⬅️ Назад', backCb);
  kb.row().text('📋 Меню', 'a:menu');

  const extra = { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true };
  if (ctx.callbackQuery) await safeEditOrReply(ctx, text, extra);
  else await ctx.reply(text, extra);

}

async function renderWsLeadCompose(ctx, wsId, step = 1, draft = {}) {
  const ws = await db.getWorkspaceAny(wsId);
  if (!ws) return ctx.answerCallbackQuery({ text: 'Профиль не найден.' });

  const channelTitle = ws.title || 'канал';
  const link = wsBrandLink(wsId);

  const to = String(ws.profile_title || channelTitle);

  let text =
    `📩 <b>Запрос бренда</b>\n\n` +
    `Кому: <b>${escapeHtml(to)}</b>
` +
    `Канал: <b>${escapeHtml(channelTitle)}</b>
` +
    (link ? `Витрина: <a href="${escapeHtml(link)}">${escapeHtml(link)}</a>\n\n` : `\n`);

  if (Number(step) === 2) {
    const contact = String(draft?.contact || '').trim();
    text +=
      `✅ <b>Шаг 2/2</b>\n` +
      (contact ? `Контакт бренда: <b>${escapeHtml(contact)}</b>\n\n` : `\n`) +
      `Опиши запрос коротко:\n` +
      `• тип: UGC или интеграция\n` +
      `• объём (1/3/5 видео, серия, пак)\n` +
      `• бюджет или бартер\n` +
      `• сроки/дедлайн\n` +
      `• 1 строка про продукт/бренд\n\n` +
      `После отправки я мгновенно уведомлю владельца канала.`;
  } else {
    text +=
      `🧩 <b>Шаг 1/2</b>\n` +
      `Пришли контакт бренда (IG / @username / ссылка / сайт).\n` +
      `Пример: <code>@brand</code> или <code>https://instagram.com/brand</code>\n\n` +
      `Дальше я спрошу детали (что нужно + условия + дедлайн).`;
  }

  const kb = new InlineKeyboard()
    .text('⬅️ Назад', `a:wsp_open|ws:${wsId}`)
    .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');

  try {
    await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  } catch {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  }
}
function leadListTabsKb(wsId, counts, active, ret) {
  // Tabs for Creator Inbox (brand leads). Make them self-explanatory, like Brand Inbox.
  const a = normLeadStatus(active);

  const rPart = ret ? retPartShort(ret) : '';

  const kb = new InlineKeyboard()
    .text(`🆕 Новые ${counts.new ?? 0}`, `a:ws_leads|w:${wsId}|s:n|p:0${rPart}`)
    .text(`💬 В работе ${counts.in_progress ?? 0}`, `a:ws_leads|w:${wsId}|s:ip|p:0${rPart}`)
    .row()
    .text(`✅ Закрыты ${counts.closed ?? 0}`, `a:ws_leads|w:${wsId}|s:cl|p:0${rPart}`)
    .text(`🗑 Спам ${counts.spam ?? 0}`, `a:ws_leads|w:${wsId}|s:sp|p:0${rPart}`);

  // Mark active with a dot
  for (const row of kb.inline_keyboard) {
    for (const btn of row) {
      const d = String(btn.callback_data || '');
      const aCb = leadStatusToCb(a);
      if (d.includes(`|s:${aCb}|`) || d.includes(`|s:${a}|`)) btn.text = '• ' + btn.text;
    }
  }
  return kb;
}

async function renderWsLeadsList(ctx, ownerUserId, wsId, status = 'new', page = 0, ret = null) {
  const actorUserId = ownerUserId;
  const isAdmin = isSuperAdminTg(ctx.from?.id);
  const ws = await db.getWorkspaceAny(wsId);
  if (!ws) {
    await safeEditOrReply(ctx, '⚠️ Канал не найден. Открой 📋 Меню → выбери канал и повтори.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') });
    return;
  }

  const isOwner = Number(ws.owner_user_id) === Number(actorUserId);
  let isCurator = false;
  if (!isAdmin && !isOwner) {
    try { isCurator = await db.isCuratorForWorkspace(Number(wsId), Number(actorUserId)); } catch {}
  }
  if (!isAdmin && !isOwner && !isCurator) {
    await safeEditOrReply(ctx, '⚠️ Нет доступа. Открой 📋 Меню → выбери канал заново.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') });
    return;
  }

  const st = normLeadStatus(status);
  const p = Math.max(0, Number(page) || 0);
  const limit = 10;
  const offset = p * limit;

  const counts = await db.countBrandLeadsByStatus(wsId);
  const leads = await db.listBrandLeads(wsId, st, limit, offset);

  const channel = ws.channel_username ? '@' + ws.channel_username : ws.title;
  const textHeader =
    `📨 <b>Заявки брендов</b>\n\n` +
    `Канал: <b>${escapeHtml(channel)}</b>\n` +
    `Статус: <b>${escapeHtml((LEAD_STATUSES[st] || LEAD_STATUSES.new).title)}</b>\n\n`;

  const lines = leads.map((l) => {
    const who = l.brand_username ? '@' + String(l.brand_username).replace(/^@/, '') : (l.brand_name || 'brand');
    const snippet = String(l.message || '').replace(/\s+/g, ' ').slice(0, 60);
    return `${leadStatusIcon(l.status)} <b>#${l.id}</b> — ${escapeHtml(who)} — <i>${escapeHtml(snippet)}${String(l.message || '').length > 60 ? '…' : ''}</i>`;
  });

  const body = lines.length ? lines.join('\n') : 'Пока пусто. Заявки появятся, когда бренд нажмёт кнопку на витрине.';

  const kb = leadListTabsKb(wsId, counts, st, ret);

  const retKey = String(ret || '').trim();
  const rPart = retKey ? retPartShort(retKey) : '';

  // quick open buttons (max 8 to avoid huge kb)
  for (const l of leads.slice(0, 8)) {
    const whoBtn = l.brand_username
      ? '@' + String(l.brand_username).replace(/^@/, '')
      : (String(l.brand_name || '').trim() || 'brand');
    const whoShort = clipText(whoBtn, 16);
    const btnLabel = clipText(`${leadStatusIcon(l.status)} #${l.id} ${whoShort}`, 56);

    kb.row().text(btnLabel, `a:lead_view|id:${l.id}|w:${wsId}|s:${leadStatusToCb(st)}|p:${p}${rPart}`);
  }

  // pagination
  if (p > 0) {
    kb.row().text('⬅️', `a:ws_leads|w:${wsId}|s:${leadStatusToCb(st)}|p:${p - 1}${rPart}`);
  }
  if (leads.length === limit) {
    if (p > 0) kb.text('➡️', `a:ws_leads|w:${wsId}|s:${leadStatusToCb(st)}|p:${p + 1}${rPart}`);
    else kb.row().text('➡️', `a:ws_leads|w:${wsId}|s:${leadStatusToCb(st)}|p:${p + 1}${rPart}`);
  }
  let backCb = `a:ws_profile|ws:${wsId}`;
  if (retKey === 'ws_open') backCb = `a:ws_open|ws:${wsId}`;
  else if (retKey === 'cw') backCb = `a:cur_ws|ws:${wsId}`;
  else if (retKey === 'ws_list') backCb = 'a:ws_list';
  else if (retKey === 'menu') backCb = 'a:menu';
  else if (retKey === 'home') backCb = 'a:home';
  else if (!retKey && isCurator && !isOwner && !isAdmin) backCb = `a:cur_ws|ws:${wsId}`;
  kbNavRow(kb, backCb);

  try {
    await safeEditOrReply(ctx, textHeader + body, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  } catch {
    await ctx.reply(textHeader + body, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  }
}

async function renderLeadView(ctx, actorUserId, leadId, back = { wsId: null, status: 'new', page: 0, ret: '' }) {
  const stepId = `lead_view:${Number(leadId || 0)}`;
  const lead = await p0Await(ctx, stepId, `${stepId}:getLead`, () => db.getBrandLeadById(leadId), 4500);
  if (!lead) { await safeEditOrReply(ctx, '⚠️ Заявка не найдена или удалена. Открой 📨 Заявки брендов и выбери заявку ещё раз.', { parse_mode: 'HTML', reply_markup: navKb('a:menu') }); return; }

  const wsId = Number(lead.workspace_id);
  const ws = await p0Await(ctx, stepId, `${stepId}:getWs`, () => db.getWorkspaceAny(wsId), 4500);
  if (!ws) { await safeEditOrReply(ctx, '⚠️ Канал не найден или нет доступа. Открой 📋 Меню → выбери канал и повтори.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') }); return; }

  const isOwner = Number(ws.owner_user_id) === Number(actorUserId);
  const isAdmin = isSuperAdminTg(ctx.from?.id);
  let isCurator = false;
  if (!isOwner && !isAdmin) {
    try { isCurator = await db.isCuratorForWorkspace(wsId, actorUserId); } catch {}
  }
  if (!isOwner && !isAdmin && !isCurator) {
    await safeEditOrReply(ctx, '⚠️ Нет доступа к этой заявке. Открой 📋 Меню → выбери канал заново.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') });
    return;
  }
  const canManualReply = isOwner || isAdmin;
  const plainUi = !canManualReply; // curator view: no clickable URLs / @mentions

  const channel = ws.channel_username ? '@' + ws.channel_username : ws.title;
  const who = lead.brand_username ? '@' + String(lead.brand_username).replace(/^@/, '') : (lead.brand_name || 'brand');
  const when = lead.created_at ? fmtTs(lead.created_at) : '—';

  const link = wsBrandLink(wsId);

  const channelShown = plainUi ? deLinkifyText(channel) : channel;
  const whoShown = plainUi ? deLinkifyText(who) : who;
  const vitrinaLine = link
    ? (plainUi
        ? `Витрина: <code>${escapeHtml(deLinkifyText(link))}</code>
`
        : `Витрина: <a href="${escapeHtml(link)}">${escapeHtml(link)}</a>
`)
    : '';

  let text =
    `✉️ <b>Заявка #${lead.id}</b> ${leadStatusIcon(lead.status)}\n\n` +
    `Канал: <b>${escapeHtml(channelShown)}</b>\n` +
    vitrinaLine +
    `От: <b>${escapeHtml(whoShown)}</b>\n` +
    `Когда: <b>${escapeHtml(when)}</b>\n\n` +
    `<b>Текст:</b>\n${escapeHtml(stripBrokenSurrogates(String(lead.message || '—')))}`;

  if (lead.reply_text) {
    text += `\n\n<b>Ответ:</b>\n${escapeHtml(stripBrokenSurrogates(String(lead.reply_text)))}`;
  }

  const notesRaw = (lead.meta && Array.isArray(lead.meta.curator_notes)) ? lead.meta.curator_notes : [];
  const notes = normalizeLeadNotes(notesRaw);
  if (notes.length) {
    const last = notes.slice(-3).reverse();
    const lines = last.map((n) => {
      const by = n?.by ? `id:${n.by}` : 'id:?';
      const at = n?.at ? fmtTs(n.at) : '';
      const t = String(n?.text || '').trim();
      const clipped = clipText(t.replace(/\s+/g, ' '), 220);
      const tagsHtml = fmtLeadNoteTags(n?.tags || extractLeadNoteTags(t));
      return `• <code>${escapeHtml(by)}</code>${at ? ` • <i>${escapeHtml(at)}</i>` : ''}: ${escapeHtml(clipped)}${tagsHtml}`;
    }).join('\n');
    text += `\n\n📝 <b>Заметки</b>\n${lines}`;
  }

  const st = normLeadStatus(lead.status);

  const retKey = String(back?.ret || '').trim();
  const rPart = retKey ? retPartShort(retKey) : '';
  const listCb = `a:ws_leads|w:${wsId}|s:${leadStatusToCb(back.status)}|p:${back.page}${rPart}`;

  const kb = new InlineKeyboard();

  if (canManualReply) {
    kb.text('✍️ Ответить', `a:lead_reply|id:${lead.id}|w:${wsId}|s:${leadStatusToCb(back.status)}|p:${back.page}${rPart}`)
      .text('⚡ Шаблоны', `a:lead_tpls|id:${lead.id}|w:${wsId}|s:${leadStatusToCb(back.status)}|p:${back.page}${rPart}`)
      .row()
      .text('💬 В работу', `a:lead_set|id:${lead.id}|st:ip|w:${wsId}|s:${leadStatusToCb(back.status)}|p:${back.page}${rPart}`)
      .text('✅ Закрыть', `a:lead_set|id:${lead.id}|st:cl|w:${wsId}|s:${leadStatusToCb(back.status)}|p:${back.page}${rPart}`)
      .row()
      .text('🗑 Спам', `a:lead_set|id:${lead.id}|st:sp|w:${wsId}|s:${leadStatusToCb(back.status)}|p:${back.page}${rPart}`)
      .text('📝 Заметка', `a:lead_note|id:${lead.id}|w:${wsId}|s:${leadStatusToCb(back.status)}|p:${back.page}${rPart}`)
      .row();
    kb.text(`📝 Заметки (${notes.length})`, `a:lead_notes|id:${lead.id}|w:${wsId}|n:0|s:${leadStatusToCb(back.status)}|p:${back.page}${rPart}`)
      .row();
  } else {
    // Curator mode: only templates + status + internal notes (no manual replies)
    kb.text('✅ Принять', `a:lead_tpl_send|id:${lead.id}|k:discuss|w:${wsId}|s:${leadStatusToCb(back.status)}|p:${back.page}${rPart}`)
      .text('🧾 Детали', `a:lead_tpl_send|id:${lead.id}|k:brief|w:${wsId}|s:${leadStatusToCb(back.status)}|p:${back.page}${rPart}`)
      .row()
      .text('❌ Отказ', `a:lead_tpl_send|id:${lead.id}|k:decline|w:${wsId}|s:${leadStatusToCb(back.status)}|p:${back.page}${rPart}`)
      .text('📝 Заметка', `a:lead_note|id:${lead.id}|w:${wsId}|s:${leadStatusToCb(back.status)}|p:${back.page}${rPart}`)
      .row()
      .text(`📝 Заметки (${notes.length})`, `a:lead_notes|id:${lead.id}|w:${wsId}|n:0|s:${leadStatusToCb(back.status)}|p:${back.page}${rPart}`)
      .row()
      .text('⚡ Шаблоны', `a:lead_tpls|id:${lead.id}|w:${wsId}|s:${leadStatusToCb(back.status)}|p:${back.page}${rPart}`)
      .text('💬 В работу', `a:lead_set|id:${lead.id}|st:ip|w:${wsId}|s:${leadStatusToCb(back.status)}|p:${back.page}${rPart}`)
      .row()
      .text('✅ Закрыть', `a:lead_set|id:${lead.id}|st:cl|w:${wsId}|s:${leadStatusToCb(back.status)}|p:${back.page}${rPart}`)
      .row();
  }

  kbNavRow(kb, listCb);


  const extra = { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true };
  try {
    await p0Await(ctx, stepId, `${stepId}:sendEdit`, () => safeEditOrReply(ctx, text, extra), 8000);
  } catch {
    await p0Await(ctx, stepId, `${stepId}:sendReply`, () => ctx.reply(text, extra), 8000);
  }
}


async function renderBrandLeadDialog(ctx, brandUserId, leadId, wsId = 0) {
  const id = Number(leadId || 0);
  if (!id) {
    await safeEditOrReply(ctx, '⚠️ Диалог не найден. Открой сообщение с ответом креатора и нажми “💬 Диалог”.', { parse_mode: 'HTML', reply_markup: navKb('a:menu') });
    return;
  }

  const lead = await db.getBrandLeadById(id);
  if (!lead) {
    await safeEditOrReply(ctx, '⚠️ Диалог не найден или удалён. Открой 📋 Меню и повтори.', { parse_mode: 'HTML', reply_markup: navKb('a:menu') });
    return;
  }

  // Access: only the brand who created the lead (best-effort by brand_user_id and brand_tg_id)
  if (Number(lead.brand_user_id) !== Number(brandUserId) && Number(lead.brand_tg_id) !== Number(ctx.from?.id)) {
    await safeEditOrReply(ctx, '⚠️ Нет доступа к этому диалогу.', { parse_mode: 'HTML', reply_markup: navKb('a:menu') });
    return;
  }

  const realWsId = Number(wsId || lead.workspace_id || 0);
  const ws = realWsId ? await db.getWorkspaceAny(realWsId) : null;
  const channel = ws?.channel_username ? '@' + String(ws.channel_username) : (ws?.title || 'Креатор');

  let credits = 0;
  try { credits = Number(await db.getBrandCredits(brandUserId)); } catch {}

  const needContacts = Number(CONTACT_UNLOCK_COST || 0);
  const needsContactsTopup = needContacts > 0 && Number(credits || 0) < needContacts;
  const needLine = brandPassContactsNeedLineHtml(credits);

  const who = ws ? safeCreatorDisplayName(ws) : 'Креатор';
  const when = lead.created_at ? fmtTs(lead.created_at) : '—';
  const st = normLeadStatus(lead.status);
  const statusTitle = (LEAD_STATUSES[st] || LEAD_STATUSES.new).title;

  const meta = normalizeJsonb(lead.meta) || {};
  const thread = Array.isArray(meta.thread) ? meta.thread : [];
  const threadBlock = fmtBrandLeadThread(thread, 6);

  let text =
    `💬 <b>Диалог по заявке #${id}</b>

` +
    `Креатор: <b>${escapeHtml(who)}</b>
` +
    `Канал: <b>${escapeHtml(channel)}</b>
` +
    `Статус: <b>${escapeHtml(statusTitle)}</b>
` +
    `Создано: <code>${escapeHtml(String(when))}</code>
` +
    `${brandPassBalanceLineHtml(credits)}
` +
    (needLine ? `${needLine}
` : ``) +
    ``;

  text += `
<b>Заявка:</b>
${escapeHtml(stripBrokenSurrogates(String(lead.message || '—')))}
`;

  if (lead.reply_text) {
    text += `
<b>Последний ответ креатора:</b>
${escapeHtml(stripBrokenSurrogates(String(lead.reply_text || '')))}
`;
  }

  if (threadBlock) {
    text += `
<b>Последние сообщения:</b>
${threadBlock}`;
  }

  // Actions
  const kb = new InlineKeyboard();
  kb.text('✍️ Ответить', `a:blead_reply|id:${id}|w:${realWsId}`)
    .text('🪟 Витрина', `a:wsp_open|ws:${realWsId}|m:ro|r:bl|l:${id}`)
    .row();

  if (Number(credits || 0) <= 0) {
    kb.text('🎫 Купить Brand Pass', 'a:brand_pass|ws:0');
  } else if (needsContactsTopup) {
    kb.text(contactUnlockBtnLabel(), `a:wsp_contact_req|ws:${realWsId}|r:bl|l:${id}`)
      .text('🎫 Купить Brand Pass', 'a:brand_pass|ws:0');
  } else {
    kb.text(contactUnlockBtnLabel(), `a:wsp_contact_req|ws:${realWsId}|r:bl|l:${id}`);
  }

  kb.row().text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
}


async function renderLeadNotesViewer(ctx, actorUserId, leadId, back = { wsId: null, status: 'new', page: 0, ret: '' }, notesPage = 0) {
  const stepId = 'lead_notes_view';
  const id = Number(leadId || 0);
  if (!id) {
    await safeEditOrReply(ctx, '⚠️ Не найдена заявка. Открой 📨 Заявки брендов и выбери заявку ещё раз.', { reply_markup: navKb('a:menu') });
    return;
  }

  const lead = await p0Await(ctx, stepId, `${stepId}:getLead`, () => db.getBrandLeadById(id), 4500);
  if (!lead) {
    await safeEditOrReply(ctx, '⚠️ Заявка не найдена или удалена. Открой 📨 Заявки брендов и выбери заявку ещё раз.', { reply_markup: navKb('a:menu') });
    return;
  }

  const wsId = Number(lead.workspace_id);
  const ws = await p0Await(ctx, stepId, `${stepId}:getWs`, () => db.getWorkspaceAny(wsId), 4500);
  if (!ws) {
    await safeEditOrReply(ctx, '⚠️ Канал не найден или нет доступа. Открой 📋 Меню → выбери канал заново.', { reply_markup: navKb('a:ws_list') });
    return;
  }

  const isOwner = Number(ws.owner_user_id) === Number(actorUserId);
  const isAdmin = isSuperAdminTg(ctx.from?.id);
  let isCurator = false;
  if (!isOwner && !isAdmin) {
    try { isCurator = await db.isCuratorForWorkspace(wsId, actorUserId); } catch {}
  }
  if (!isOwner && !isAdmin && !isCurator) {
    await safeEditOrReply(ctx, '⚠️ Нет доступа к заметкам этой заявки.', { reply_markup: navKb('a:menu') });
    return;
  }

  const channel = ws.channel_username ? '@' + ws.channel_username : ws.title;
  const notesRaw = (lead.meta && Array.isArray(lead.meta.curator_notes)) ? lead.meta.curator_notes : [];
  const notes = normalizeLeadNotes(notesRaw);
  const total = notes.length;

  const pageSize = 6;
  const ordered = notes.slice().reverse(); // newest first
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pg = Math.max(0, Math.min(totalPages - 1, Number(notesPage || 0)));

  const slice = ordered.slice(pg * pageSize, (pg + 1) * pageSize);

  // Resolve authors (best-effort)
  const byIds = Array.from(new Set(slice.map(n => Number(n?.by || 0)).filter(Boolean)));
  const usersMap = new Map();
  if (byIds.length) {
    try {
      const rows = await db.listUsersByIds(byIds);
      for (const r of (rows || [])) usersMap.set(Number(r.id), r);
    } catch {}
  }

  const roleLabel = (byId) => {
    const row = usersMap.get(Number(byId)) || null;
    if (Number(byId) === Number(ws.owner_user_id)) return 'owner';
    if (row?.tg_id && isSuperAdminTg(Number(row.tg_id))) return 'admin';
    return 'curator';
  };

  const whoLabel = (byId, roleHint = '') => {
    const role = String(roleHint || '').trim() || (byId ? roleLabel(byId) : '—');
    const row = usersMap.get(Number(byId)) || null;
    const uname = row?.tg_username ? '@' + String(row.tg_username).replace(/^@/, '') : null;
    if (uname) return `${escapeHtml(uname)} <code>id:${escapeHtml(String(byId))}</code>${role ? ` • <i>${escapeHtml(role)}</i>` : ''}`;
    return `<code>id:${escapeHtml(String(byId || '?'))}</code>${role ? ` • <i>${escapeHtml(role)}</i>` : ''}`;
  };

  let text =
    `📝 <b>Заметки</b> • заявка #${lead.id}\n` +
    `Канал: <b>${escapeHtml(channel)}</b>\n` +
    `Всего: <b>${total}</b>\n` +
    `Стр: <b>${pg + 1}/${totalPages}</b>\n\n`;

  if (!total) {
    text += 'Пока нет заметок.\nНажми “📝 Добавить заметку”, чтобы оставить внутренний комментарий.';
  } else {
    const lines = slice.map((n, i) => {
      const by = Number(n?.by || 0);
      const at = n?.at ? fmtTs(n.at) : '';
      const t = String(n?.text || '').trim();
      const clipped = clipText(stripBrokenSurrogates(t).replace(/\s+/g, ' '), 420);
      const roleHint = String(n?.role || '').trim().toLowerCase();
      const tagsHtml = fmtLeadNoteTags(n?.tags || extractLeadNoteTags(t));
      const head = `• <b>${i + 1 + (pg * pageSize)}</b> • ${whoLabel(by, roleHint)}${at ? ` • <i>${escapeHtml(at)}</i>` : ''}`;
      return `${head}\n${escapeHtml(clipped)}${tagsHtml}`;
    }).join('\n\n');

    text += lines;
  }

  const backStatus = normLeadStatus(String(back?.status || 'new'));
  const backPage = Number(back?.page || 0);
  const retKey = String(back?.ret || '').trim();
  const rPart = retKey ? retPartShort(retKey) : '';

  const leadViewCb = `a:lead_view|id:${lead.id}|w:${wsId}|s:${leadStatusToCb(backStatus)}|p:${backPage}${rPart}`;
  const addCb = `a:lead_note|id:${lead.id}|w:${wsId}|s:${leadStatusToCb(backStatus)}|p:${backPage}|nb:${pg}${rPart}`;

  const kb = new InlineKeyboard();

  if (totalPages > 1) {
    if (pg > 0) kb.text('⬅️', `a:lead_notes|id:${lead.id}|w:${wsId}|n:${pg - 1}|s:${leadStatusToCb(backStatus)}|p:${backPage}${rPart}`);
    if (pg < totalPages - 1) kb.text('➡️', `a:lead_notes|id:${lead.id}|w:${wsId}|n:${pg + 1}|s:${leadStatusToCb(backStatus)}|p:${backPage}${rPart}`);
    kb.row();
  }

  kb.text('📝 Добавить заметку', addCb).row();

  kbNavRow(kb, leadViewCb);

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
}




// --- Brand Applications Inbox (Creator → Brand) ---

// Deal stages (no migrations; stored in brand_applications.meta.deal_stage)
const DEAL_STAGES = {
  negotiation: { id: 'negotiation', icon: '💬', label: 'Переговоры' },
  deal: { id: 'deal', icon: '🤝', label: 'Договорились' },
  paid: { id: 'paid', icon: '💳', label: 'Оплата' },
  done: { id: 'done', icon: '✅', label: 'Завершено' },
  lost: { id: 'lost', icon: '🗑', label: 'Потеряно' },
  all: { id: 'all', icon: '📌', label: 'Все' },
};

function normDealStage(s) {
  const k = String(s || '').toLowerCase().trim();
  return DEAL_STAGES[k] ? k : 'negotiation';
}

function dealStageTitle(s) {
  const k = String(s || '').toLowerCase().trim();
  const d = DEAL_STAGES[k];
  if (!d) return '📌 Сделка';
  return `${d.icon} ${d.label}`;
}

function getAppDealStage(app) {
  const s = app?.meta?.deal_stage;
  const k = String(s || '').toLowerCase().trim();
  return k && DEAL_STAGES[k] ? k : '';
}

function formatBrandAppThread(threadArr, limit = 6) {
  const rows = (Array.isArray(threadArr) ? threadArr : [])
    .filter(x => x && typeof x === 'object' && String(x.text || '').trim());

  if (!rows.length) return '';

  const tail = rows.slice(-Math.max(1, Number(limit) || 6));
  const lines = tail.map(m => {
    const from = String(m.from || '').toLowerCase();
    const icon = from === 'brand' ? '🏷️' : (from === 'creator' ? '🧑‍🎨' : (from === 'system' ? '⚙️' : '💬'));
    const t = m.at ? fmtTs(String(m.at)) : '';
    const body = String(m.text || '').trim().replace(/\s+/g, ' ');
    const short = body.length > 110 ? body.slice(0, 110).trim() + '…' : body;
    return `${icon} ${t ? `<code>${escapeHtml(t)}</code> ` : ''}${escapeHtml(short)}`;
  });

  return lines.join('\n');
}


function brandAppsTabsKb(counts = {}, active = 'new') {
  // Tabs for Brand Inbox (applications). Make them self-explanatory.
  const a = normLeadStatus(active);

  const kb = new InlineKeyboard()
    .text(`🆕 Новые ${counts.new ?? 0}`, `a:brand_apps|ws:0|s:new|p:0`)
    .text(`💬 В работе ${counts.in_progress ?? 0}`, `a:brand_apps|ws:0|s:in_progress|p:0`)
    .row()
    .text(`✅ Закрыты ${counts.closed ?? 0}`, `a:brand_apps|ws:0|s:closed|p:0`)
    .text(`🗑 Спам ${counts.spam ?? 0}`, `a:brand_apps|ws:0|s:spam|p:0`);

  // Mark active with a dot (cheap but readable)
  for (const row of kb.inline_keyboard) {
    for (const btn of row) {
      const d = String(btn.callback_data || '');
      if (d.includes(`|s:${a}|`)) btn.text = '• ' + btn.text;
    }
  }
  return kb;
}

function brandDealsTabsKb(counts = {}, active = 'negotiation') {
  const a = normDealStage(active);
  const kb = new InlineKeyboard()
    .text(`${DEAL_STAGES.negotiation.icon} ${counts.negotiation ?? 0}`, `a:brand_deals|ws:0|st:negotiation|p:0`)
    .text(`${DEAL_STAGES.deal.icon} ${counts.deal ?? 0}`, `a:brand_deals|ws:0|st:deal|p:0`)
    .text(`${DEAL_STAGES.paid.icon} ${counts.paid ?? 0}`, `a:brand_deals|ws:0|st:paid|p:0`)
    .row()
    .text(`${DEAL_STAGES.done.icon} ${counts.done ?? 0}`, `a:brand_deals|ws:0|st:done|p:0`)
    .text(`${DEAL_STAGES.lost.icon} ${counts.lost ?? 0}`, `a:brand_deals|ws:0|st:lost|p:0`)
    .text(`${DEAL_STAGES.all.icon} ${counts.all ?? 0}`, `a:brand_deals|ws:0|st:all|p:0`);

  // Mark active with a dot
  const rows = kb.inline_keyboard;
  for (const r of rows) {
    for (const b of r) {
      const cd = String(b.callback_data || '');
      const m = cd.match(/\bst:([^|]+)/);
      if (!m) continue;
      const st = String(m[1] || '').toLowerCase();
      if (st === a && !String(b.text).startsWith('• ')) {
        b.text = `• ${b.text}`;
      }
    }
  }
  return kb;
}

async function getBrandDealsSearch(tgId, brandUserId) {
  try {
    const v = await redis.get(k(['brandDealsSearch', tgId, Number(brandUserId)]));
    const s = String(v || '').trim();
    return s || '';
  } catch {
    return '';
  }
}

async function setBrandDealsSearch(tgId, brandUserId, query, ttlSec = 24 * 60 * 60) {
  try {
    const q = String(query || '').trim();
    if (!q) return;
    await redis.set(k(['brandDealsSearch', tgId, Number(brandUserId)]), q, { ex: ttlSec });
  } catch {}
}

async function clearBrandDealsSearch(tgId, brandUserId) {
  try {
    await redis.del(k(['brandDealsSearch', tgId, Number(brandUserId)]));
  } catch {}
}


async function getBrandDealsMineOnly(tgId, brandUserId) {
  try {
    const v = await redis.get(k(['brandDealsMineOnly', tgId, Number(brandUserId)]));
    return String(v || '') === '1';
  } catch {
    return false;
  }
}

async function setBrandDealsMineOnly(tgId, brandUserId, on = true, ttlSec = 24 * 60 * 60) {
  try {
    if (!on) {
      await redis.del(k(['brandDealsMineOnly', tgId, Number(brandUserId)]));
      return;
    }
    await redis.set(k(['brandDealsMineOnly', tgId, Number(brandUserId)]), '1', { ex: ttlSec });
  } catch {}
}

async function clearBrandDealsMineOnly(tgId, brandUserId) {
  try {
    await redis.del(k(['brandDealsMineOnly', tgId, Number(brandUserId)]));
  } catch {}
}

async function assertBrandAppsAccess(ctx, actorUserId, brandUserId) {
  const isOwner = Number(actorUserId) === Number(brandUserId);
  const isAdmin = isSuperAdminTg(ctx.from?.id);
  if (isOwner || isAdmin) return { ok: true, isOwner, isAdmin, isManager: false };

  const isManager = await safeBrandApplications(() => db.isBrandManager(brandUserId, actorUserId), async () => false);
  if (!isManager) {
    try { await ctx.answerCallbackQuery({ text: 'Доступ отозван.' }); } catch {}
    return { ok: false, isOwner: false, isAdmin, isManager: false };
  }

  // Auto-enter manager mode for better UX when opening from notifications
  try { await setBrandManagerMode(ctx.from.id, true); } catch {}
  try { await setUiMode(ctx.from.id, 'Brand'); } catch {}
  try { await setBmActiveBrand(ctx.from.id, brandUserId); } catch {}

  return { ok: true, isOwner: false, isAdmin, isManager: true };
}

async function renderBrandAppsList(ctx, actorUserId, brandUserId, status = 'new', page = 0) {
  const access = await assertBrandAppsAccess(ctx, actorUserId, brandUserId);
  if (!access.ok) return;

  const st = normLeadStatus(status);
  const p = Math.max(0, Number(page) || 0);
  const limit = 8;
  const offset = p * limit;

  const prof = await safeBrandProfiles(() => db.getBrandProfile(brandUserId), async () => null);
  const brandName = String(prof?.brand_name || '').trim() || 'Бренд';

  const counts = await safeBrandApplications(() => db.countBrandApplicationsByStatus(brandUserId), async () => ({
    new: 0, in_progress: 0, closed: 0, spam: 0
  }));

  const apps = await safeBrandApplications(() => db.listBrandApplications(brandUserId, st, limit, offset), async () => []);

  const header =
    `📨 <b>Заявки от креаторов</b>
` +
    `Бренд: <b>${escapeHtml(brandName)}</b>
` +
    `Статус: <b>${escapeHtml((LEAD_STATUSES[st] || LEAD_STATUSES.new).title)}</b>
` +
    `
<i>Фильтры: 🆕 Новые / 💬 В работе / ✅ Закрыты / 🗑 Спам.</i>
<i>Подсказка: открой ✉️ → выбери статус → ответь (✍️ или ⚡).</i>`;

  let body = '';
  if (!apps.length) {
    body = '\nПока пусто. Заявки появятся, когда креаторы нажимают “📝 Оставить заявку” в каталоге.';
  } else {
    const lines = apps.map((a, i) => {
      const who = a.creator_username
        ? '@' + String(a.creator_username).replace(/^@/, '')
        : (a.creator_tg_id ? `id:${a.creator_tg_id}` : 'creator');
      const when = a.created_at ? fmtTs(a.created_at) : '—';
      const msg = String(a.message || '').replace(/\s+/g, ' ').trim();
      const short = msg.length > 60 ? msg.slice(0, 60) + '…' : (msg || '—');
      return `${leadStatusIcon(a.status)} <b>#${a.id}</b> — <b>${escapeHtml(who)}</b> · <code>${escapeHtml(when)}</code>\n<code>${escapeHtml(short)}</code>`;
    });
    body = '\n\n' + lines.join('\n\n');
  }

  const kb = brandAppsTabsKb(counts, st);

  if (access.isManager) {
    kb.row().text('🔁 Сменить бренд', 'a:bm_pick_brand|ret:brand_apps|ws:0|p:0');
  }

  if (apps.length) {
    // Quick-open: one per row, with status + #id + who/id/snippet (readable & match list)
    for (const a of apps) {
      const username = a.creator_username ? '@' + String(a.creator_username).replace(/^@/, '') : '';
      const tgId = (!username && a.creator_tg_id) ? `id:${a.creator_tg_id}` : '';

      const msg = String(a.message || '').replace(/\s+/g, ' ').trim();
      const snippet = msg.length > 18 ? msg.slice(0, 18) + '…' : (msg || '');

      const tailRaw = username || tgId || snippet || 'creator';
      const tail = String(tailRaw).length > 18 ? String(tailRaw).slice(0, 18) + '…' : String(tailRaw);

      const label = `${leadStatusIcon(a.status)} #${a.id}${tail ? (' ' + tail) : ''}`;
      kb.row().text(label, `a:brand_app_view|id:${a.id}|s:${st}|p:${p}`);
    }
  }

  // Pagination
  const total = (counts[st] ?? 0) || 0;
  const hasPrev = p > 0;
  const hasNext = (offset + apps.length) < total;

  if (hasPrev || hasNext) kb.row();
  if (hasPrev) kb.text('⬅️', `a:brand_apps|ws:0|s:${st}|p:${p - 1}`);
  if (hasNext) kb.text('➡️', `a:brand_apps|ws:0|s:${st}|p:${p + 1}`);

  kbNavRow(kb, 'a:bx_open|ws:0');

  const text = header + body;

  try {
    await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  } catch {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  }
}

async function renderBrandDealsList(ctx, actorUserId, brandUserId, stage = 'negotiation', page = 0) {
  const access = await assertBrandAppsAccess(ctx, actorUserId, brandUserId);
  if (!access.ok) return;

  const st = normDealStage(stage);
  const p = Math.max(0, Number(page) || 0);
  const limit = 8;
  const offset = p * limit;

  const prof = await safeBrandProfiles(() => db.getBrandProfile(brandUserId), async () => null);
  const brandName = String(prof?.brand_name || '').trim() || 'Бренд';

  const mineOnly = access.isManager ? await getBrandDealsMineOnly(ctx.from.id, brandUserId) : false;
  const search = await getBrandDealsSearch(ctx.from.id, brandUserId);

  const counts = await safeBrandApplications(
    () => db.countBrandDealsByStage(brandUserId, mineOnly ? actorUserId : null),
    async () => ({ negotiation: 0, deal: 0, paid: 0, done: 0, lost: 0, all: 0 })
  );

  const items = await safeBrandApplications(
    () => search
      ? db.listBrandDealsFiltered(brandUserId, st, search, limit, offset, mineOnly ? actorUserId : null)
      : db.listBrandDeals(brandUserId, st, limit, offset, mineOnly ? actorUserId : null),
    async () => []
  );

  let header =
    `📌 <b>Сделки</b>\n` +
    `Бренд: <b>${escapeHtml(brandName)}</b>\n` +
    `Стадия: <b>${escapeHtml(dealStageTitle(st))}</b>\n`;

  // Filter indicator (ultra-clear)
  if (!mineOnly && !search) {
    header += `Фильтры: <b>нет</b>\n`;
  } else {
    const parts = [];
    if (mineOnly) parts.push('👤 <b>только мои</b>');
    if (search) parts.push(`🔎 <code>${escapeHtml(String(search))}</code>`);
    header += `Фильтры: ${parts.join(' · ')}\n`;
  }

  let body = '';
  if (!items.length) {
    body = '\nПока пусто. Сюда попадают заявки после “✅ Принять”.';
  } else {
    const lines = items.map((a, i) => {
      const who = a.creator_username
        ? '@' + String(a.creator_username).replace(/^@/, '')
        : (a.creator_tg_id ? `id:${a.creator_tg_id}` : 'creator');
      const when = a.updated_at ? fmtTs(a.updated_at) : (a.created_at ? fmtTs(a.created_at) : '—');
      const dealStage = getAppDealStage(a) || 'negotiation';
      const msg = String(a.message || '').replace(/\s+/g, ' ').trim();
      const short = msg.length > 60 ? msg.slice(0, 60) + '…' : (msg || '—');
      return `${offset + i + 1}. <b>${escapeHtml(who)}</b> · ${escapeHtml(when)}\n${escapeHtml(dealStageTitle(dealStage))}\n<code>${escapeHtml(short)}</code>`;
    });
    body = '\n\n' + lines.join('\n\n');
  }

  const kb = brandDealsTabsKb(counts, st);

  if (access.isManager) {
    kb.row().text('🔁 Сменить бренд', 'a:bm_pick_brand|ret:brand_deals|ws:0|p:0');
  }

  // Filters controls (separate reset buttons + full reset)
  if (access.isManager) {
    kb.row().text(
      mineOnly ? '❌ Сброс “только мои”' : '👤 Только мои',
      `a:brand_deals_mine_toggle|ws:0|st:${st}|p:${p}`
    );
  }

  kb.row().text('🔎 Поиск', `a:brand_deals_search|ws:0|st:${st}|p:${p}`);
  if (search) kb.text('❌ Сброс поиска', `a:brand_deals_search_clear|ws:0|st:${st}|p:${p}`);

  if (search || mineOnly) {
    kb.row().text('♻️ Сброс фильтров', `a:brand_deals_filters_clear|ws:0|st:${st}|p:${p}`);
  }

  if (items.length) {
    kb.row();
    for (const a of items) {
      kb.text(`#${a.id}`, `a:brand_deal_view|id:${a.id}|st:${st}|p:${p}`);
    }
  }

  // Pagination
  const total = search
    ? await safeBrandApplications(
        () => db.countBrandDealsFiltered(brandUserId, st, search, mineOnly ? actorUserId : null),
        async () => (offset + items.length)
      )
    : ((st === 'all' ? (counts.all ?? 0) : (counts[st] ?? 0)) || 0);

  const hasPrev = p > 0;
  const hasNext = (offset + items.length) < total;
  if (hasPrev || hasNext) kb.row();
  if (hasPrev) kb.text('⬅️', `a:brand_deals|ws:0|st:${st}|p:${p - 1}`);
  if (hasNext) kb.text('➡️', `a:brand_deals|ws:0|st:${st}|p:${p + 1}`);

  kbNavRow(kb, 'a:bx_open|ws:0');

  const text = header + body;
  try {
    await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  } catch {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  }
}

async function renderBrandDealView(ctx, actorUserId, appId, back = { stage: 'negotiation', page: 0 }) {
  const app = await safeBrandApplications(() => db.getBrandApplicationById(appId), async () => null);
  if (!app) { try { await ctx.answerCallbackQuery({ text: 'Сделка не найдена.' }); } catch {} return; }

  const brandUserId = Number(app.brand_user_id);
  const access = await assertBrandAppsAccess(ctx, actorUserId, brandUserId);
  if (!access.ok) return;

  const prof = await safeBrandProfiles(() => db.getBrandProfile(brandUserId), async () => null);
  const brandName = String(prof?.brand_name || '').trim() || 'Бренд';

  const stage = getAppDealStage(app) || 'negotiation';

  const who = app.creator_username
    ? '@' + String(app.creator_username).replace(/^@/, '')
    : (app.creator_tg_id ? `id:${app.creator_tg_id}` : 'creator');
  const when = app.updated_at ? fmtTs(app.updated_at) : (app.created_at ? fmtTs(app.created_at) : '—');
  const msg = String(app.message || '').trim();

const thread = Array.isArray(app?.meta?.thread) ? app.meta.thread : [];

let text =
  `📌 <b>Сделка</b>\n` +
  `Бренд: <b>${escapeHtml(brandName)}</b>\n` +
  `Креатор: <b>${escapeHtml(who)}</b>\n` +
  `Обновлено: <b>${escapeHtml(when)}</b>\n\n` +
  `Стадия: <b>${escapeHtml(dealStageTitle(stage))}</b>\n\n` +
  `<b>Сообщение:</b>\n<code>${escapeHtml(msg || '—')}</code>`;

if (app.reply_text) {
  text += `\n\n<b>Последний ответ бренда:</b>\n<code>${escapeHtml(String(app.reply_text))}</code>`;
}

const threadBlock = formatBrandAppThread(thread, 8);
if (threadBlock) {
  text += `\n\n<b>Диалог:</b>\n${threadBlock}`;
}

  const kb = new InlineKeyboard()
    .text(dealStageTitle('negotiation'), `a:brand_deal_set|id:${app.id}|st:negotiation|b:${back.stage}|p:${back.page}`)
    .text(dealStageTitle('deal'), `a:brand_deal_set|id:${app.id}|st:deal|b:${back.stage}|p:${back.page}`)
    .row()
    .text(dealStageTitle('paid'), `a:brand_deal_set|id:${app.id}|st:paid|b:${back.stage}|p:${back.page}`)
    .text(dealStageTitle('done'), `a:brand_deal_set|id:${app.id}|st:done|b:${back.stage}|p:${back.page}`)
    .row()
    .text(dealStageTitle('lost'), `a:brand_deal_set|id:${app.id}|st:lost|b:${back.stage}|p:${back.page}`)
    .row()
    .text('✍️ Ответить', `a:brand_deal_reply|id:${app.id}|b:${back.stage}|p:${back.page}`)
    .text('⚡ Шаблоны', `a:brand_deal_tpls|id:${app.id}|b:${back.stage}|p:${back.page}`)
    .row()
    .text('✉️ Открыть заявку', `a:brand_app_view|id:${app.id}|s:in_progress|p:0`)
    .row();

  if (access.isManager) {
    kb.text('🔁 Сменить бренд', 'a:bm_pick_brand|ret:brand_deals|ws:0|p:0').row();
  }

  const bStage = normDealStage(back.stage);
  const bPage = Math.max(0, Number(back.page) || 0);
  kbNavRow(kb, `a:brand_deals|ws:0|st:${bStage}|p:${bPage}`);

  try {
    await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  } catch {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  }
}

async function renderBrandAppView(ctx, actorUserId, appId, back = { status: 'new', page: 0 }) {
  const app = await safeBrandApplications(() => db.getBrandApplicationById(appId), async () => null);
  if (!app) { try { await ctx.answerCallbackQuery({ text: 'Заявка не найдена.' }); } catch {} return; }

  const brandUserId = Number(app.brand_user_id);
  const access = await assertBrandAppsAccess(ctx, actorUserId, brandUserId);
  if (!access.ok) return;

  const prof = await safeBrandProfiles(() => db.getBrandProfile(brandUserId), async () => null);
  const brandName = String(prof?.brand_name || '').trim() || 'Бренд';

  const who = app.creator_username ? '@' + String(app.creator_username).replace(/^@/, '') : (app.creator_tg_id ? `id:${app.creator_tg_id}` : 'creator');
  const when = app.created_at ? fmtTs(app.created_at) : '—';
  const st = normLeadStatus(app.status);

  // Micro-CRM thread (stored in meta.thread[])
  const thread = Array.isArray(app?.meta?.thread) ? app.meta.thread : [];

  const stTitle = (LEAD_STATUSES[st] || LEAD_STATUSES.new).title;

  const msgRaw = String(app.message || '').trim();
  const msgText = msgRaw ? clipText(msgRaw, 2400) : '—';
  const msgEsc = escapeHtml(msgText) + (msgRaw && msgRaw.length > 2400 ? '\n<i>(сокращено)</i>' : '');

  const replyRaw = String(app.reply_text || '').trim();
  const replyText = replyRaw ? clipText(replyRaw, 1600) : '';
  const replyEsc = replyRaw ? (escapeHtml(replyText) + (replyRaw.length > 1600 ? '\n<i>(сокращено)</i>' : '')) : '';

  let text =
    `✉️ <b>Заявка #${app.id}</b>  ·  <b>${escapeHtml(stTitle)}</b>

` +
    `🏷️ Бренд: <b>${escapeHtml(brandName)}</b>
` +
    `🧑‍🎨 Креатор: <b>${escapeHtml(who)}</b>
` +
    `🕒 Дата: <code>${escapeHtml(when)}</code>

` +
    `📝 <b>Сообщение</b>
${msgEsc}`;

  const dealStage = getAppDealStage(app);
  if (dealStage) {
    text += `

📌 <b>Сделка</b>
${escapeHtml(dealStageTitle(dealStage))}`;
  }

  if (replyEsc) {
    text += `

✍️ <b>Ответ бренда</b>
${replyEsc}`;
  }

  const threadBlock = formatBrandAppThread(thread, 6);
  if (threadBlock) {
    text += `

💬 <b>Диалог</b>
${threadBlock}`;
  }

  if (st === 'new') {
    text += `

💡 <i>Нажми ✅ Принять, чтобы открыть диалог: креатор получит кнопку “💬 Написать бренду”.</i>`;
  }

  // UX note: statuses are internal triage for brand inbox
  text += `

ℹ️ <i>Статусы “В работу / Закрыть / Спам” — внутренний triage бренда: они только сортируют заявки по вкладкам 🆕/💬/✅/🗑. Креатор их не видит.</i>`;

  const kb = new InlineKeyboard();
  if (st === 'new') kb.text('✅ Принять', `a:brand_app_accept|id:${app.id}|s:${back.status}|p:${back.page}`).row();

  if (dealStage) {
    kb.text('📌 В сделках', `a:brand_deal_view|id:${app.id}|st:${dealStage}|p:0`).row();
  }

  kb
    .text('✍️ Ответить', `a:brand_app_reply|id:${app.id}|s:${back.status}|p:${back.page}`)
    .text('⚡ Шаблоны', `a:brand_app_tpls|id:${app.id}|s:${back.status}|p:${back.page}`)
    .row()
    .text('💬 В работу', `a:brand_app_set|id:${app.id}|st:in_progress|s:${back.status}|p:${back.page}`)
    .text('✅ Закрыть', `a:brand_app_set|id:${app.id}|st:closed|s:${back.status}|p:${back.page}`)
    .row()
    .text('🗑 Спам', `a:brand_app_set|id:${app.id}|st:spam|s:${back.status}|p:${back.page}`);

  kbNavRow(kb, `a:brand_apps|ws:0|s:${back.status}|p:${back.page}`);

  try {
    await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  } catch {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  }
}

async function startBrandAppReply(ctx, actorUserId, appId, back) {
  const app = await safeBrandApplications(() => db.getBrandApplicationById(appId), async () => null);
  if (!app) { try { await ctx.answerCallbackQuery({ text: 'Заявка не найдена.' }); } catch {} return; }

  const brandUserId = Number(app.brand_user_id);
  const access = await assertBrandAppsAccess(ctx, actorUserId, brandUserId);
  if (!access.ok) return;

  const who = app.creator_username ? '@' + String(app.creator_username).replace(/^@/, '') : (app.creator_tg_id ? `id:${app.creator_tg_id}` : 'creator');

  await setExpectText(ctx.from.id, {
    type: 'brand_app_reply',
    appId: Number(app.id),
    brandUserId,
    creatorTgId: Number(app.creator_tg_id || 0),
    creatorUsername: app.creator_username ? String(app.creator_username).replace(/^@/, '') : null,
    backCb: `a:brand_app_view|id:${app.id}|s:${back.status}|p:${back.page}`,
    backStatus: back.status,
    backPage: back.page
  });

  const kb = new InlineKeyboard()
    .text('⬅️ Назад', `a:brand_app_view|id:${app.id}|s:${back.status}|p:${back.page}`)
    .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');

  const text =
    `✍️ <b>Ответ креатору</b>

` +
    `Заявка #${app.id} от <b>${escapeHtml(who)}</b>

` +
    `Напиши ответ одним сообщением — я отправлю его креатору.`;

  try {
    await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  } catch {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  }
}

async function startBrandDealReply(ctx, actorUserId, appId, back = { stage: 'negotiation', page: 0 }) {
  const app = await safeBrandApplications(() => db.getBrandApplicationById(appId), async () => null);
  if (!app) { try { await ctx.answerCallbackQuery({ text: 'Сделка не найдена.' }); } catch {} return; }

  const brandUserId = Number(app.brand_user_id);
  const access = await assertBrandAppsAccess(ctx, actorUserId, brandUserId);
  if (!access.ok) return;

  const creatorTgId = Number(app.creator_tg_id || 0);
  if (!creatorTgId) return ctx.reply('⚠️ У креатора нет TG id.');

  const who = app.creator_username ? '@' + String(app.creator_username).replace(/^@/, '') : (app.creator_tg_id ? `id:${app.creator_tg_id}` : 'creator');

  const backCb = `a:brand_deal_view|id:${app.id}|st:${normDealStage(back.stage)}|p:${Math.max(0, Number(back.page) || 0)}`;

  await setExpectText(ctx.from.id, {
    type: 'brand_app_reply',
    appId: Number(app.id),
    brandUserId: Number(brandUserId),
    creatorTgId: Number(creatorTgId),
    creatorUsername: app.creator_username || null,
    backCb
  });

  const kb = navKb(backCb);

  const text =
    `✍️ <b>Ответ креатору</b>

` +
    `Сделка #${app.id} · <b>${escapeHtml(String(who))}</b>

` +
    `Напиши ответ одним сообщением — я отправлю его креатору.`;

  try {
    await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  } catch {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  }
}

async function renderBrandDealTemplates(ctx, actorUserId, appId, back = { stage: 'negotiation', page: 0 }) {
  const app = await safeBrandApplications(() => db.getBrandApplicationById(appId), async () => null);
  if (!app) { try { await ctx.answerCallbackQuery({ text: 'Сделка не найдена.' }); } catch {} return; }

  const brandUserId = Number(app.brand_user_id);
  const access = await assertBrandAppsAccess(ctx, actorUserId, brandUserId);
  if (!access.ok) return;

  const prof = await safeBrandProfiles(() => db.getBrandProfile(brandUserId), async () => null);
  const brandName = String(prof?.brand_name || '').trim() || 'Бренд';
  const who = app.creator_username ? '@' + String(app.creator_username).replace(/^@/, '') : (app.creator_tg_id ? `id:${app.creator_tg_id}` : 'creator');

  const text =
    `⚡ <b>Быстрые ответы</b>

` +
    `Сделка #${app.id} от <b>${escapeHtml(String(who))}</b>

` +
    `Выбери шаблон → откроется предпросмотр → нажми “📨 Отправить”. После отправки у креатора появится кнопка “💬 Написать бренду”.`;

  const backCb = `a:brand_deal_view|id:${app.id}|st:${normDealStage(back.stage)}|p:${Math.max(0, Number(back.page) || 0)}`;

  const kb = new InlineKeyboard()
    .text('✅ Приняли — дальше', `a:brand_deal_tpl|id:${app.id}|k:next|b:${back.stage}|p:${back.page}`)
    .row()
    .text('📎 Прайс / медиа‑кит', `a:brand_deal_tpl|id:${app.id}|k:price|b:${back.stage}|p:${back.page}`)
    .row()
    .text('🧾 Уточнить детали', `a:brand_deal_tpl|id:${app.id}|k:brief|b:${back.stage}|p:${back.page}`)
    .row()
    .text('🤝 Бартер', `a:brand_deal_tpl|id:${app.id}|k:barter|b:${back.stage}|p:${back.page}`)
    .row()
    .text('⏱ Сроки', `a:brand_deal_tpl|id:${app.id}|k:timing|b:${back.stage}|p:${back.page}`)
    .row()
    .text('⬅️ Назад', backCb)
    .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');

  try {
    await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  } catch {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  }
}

async function sendBrandDealTemplateReply(ctx, actorUserId, appId, key, back = { stage: 'negotiation', page: 0 }) {
  const app = await safeBrandApplications(() => db.getBrandApplicationById(appId), async () => null);
  if (!app) { try { await ctx.answerCallbackQuery({ text: 'Сделка не найдена.' }); } catch {} return; }

  const brandUserId = Number(app.brand_user_id);
  const access = await assertBrandAppsAccess(ctx, actorUserId, brandUserId);
  if (!access.ok) return;

  const creatorTgId = Number(app.creator_tg_id || 0);
  if (!creatorTgId) { try { await ctx.answerCallbackQuery({ text: 'У креатора нет TG id.' }); } catch {} return; }

  const prof = await safeBrandProfiles(() => db.getBrandProfile(brandUserId), async () => null);
  const brandName = String(prof?.brand_name || '').trim() || 'Бренд';

  const replyText = buildBrandAppTemplateText(brandName, key);

  const cUrl = prof?.contact ? brandContactUrl(prof.contact) : null;
  const link = String(prof?.brand_link || '').trim();
  const linkLine = link ? `\n🔗 Сайт/ссылка: ${escapeHtml(link)}` : '';
  const contactLine = cUrl ? `\n✍️ Контакт: ${escapeHtml(String(prof.contact))}` : '';

  let outText =
    `📩 <b>Ответ бренда</b>\n\n` +
    `Бренд: <b>${escapeHtml(brandName)}</b>` +
    linkLine +
    contactLine +
    `\n\n<b>Сообщение:</b>\n${escapeHtml(replyText)}`;

  // Guard: Telegram max message length is 4096
  // If too long, drop contact/link and keep message only
  if (outText.length > 3900) {
    outText =
      `📩 <b>Ответ бренда</b>\n\n` +
      `Бренд: <b>${escapeHtml(brandName)}</b>` +
      `\n\n<b>Сообщение:</b>\n${escapeHtml(replyText)}`;
  }

  const outKb = new InlineKeyboard()
      .text('📨 Открыть заявку', `a:brand_app_card|id:${appId}`)
      .text('💬 Ответить', `a:brand_app_chat|id:${appId}`)
      .row()
      .text('📋 Меню', 'a:menu')
      .text('🏠 Home', 'a:home');

  try {
    const api = apiFromCtx(ctx);
    if (!api) throw new Error('BOT API not initialized');
    await api.sendMessage(creatorTgId, outText, { parse_mode: 'HTML', reply_markup: outKb, disable_web_page_preview: true });
  } catch (e) {
    const backCb = `a:brand_deal_view|id:${app.id}|st:${normDealStage(back.stage)}|p:${Math.max(0, Number(back.page) || 0)}`;
    await ctx.reply('❌ Не удалось отправить сообщение креатору. Возможно, он ещё не нажимал /start.', {
      reply_markup: navKb(backCb)
    });
    return;
  }

  // Persist
  await safeBrandAppsWrite(() => db.markBrandApplicationReplied(appId, replyText, actorUserId), { op: 'brand_app_mark_replied', appId });
  await safeBrandAppsWrite(() => db.appendBrandApplicationThreadMessage(appId, {
    from: 'brand',
    text: replyText,
    at: new Date().toISOString(),
    by_user_id: Number(actorUserId),
    by_tg_id: Number(ctx.from?.id || 0),
    by_username: ctx.from?.username || null
  }), { op: 'brand_app_thread_append', appId });
  if (normLeadStatus(app.status) === 'new') {
    await safeBrandAppsWrite(() => db.updateBrandApplicationStatus(appId, 'in_progress'), { op: 'brand_app_status', appId, st: 'in_progress' });
  }

  try { await ctx.answerCallbackQuery({ text: '✅ Отправлено' }); } catch {}
  await renderBrandDealView(ctx, actorUserId, appId, back);
}

function buildBrandAppTemplateText(brandName, key) {
  const k = String(key || '').toLowerCase();
  if (k === 'discuss') {
    return `Спасибо за заявку! ✅ Давайте обсудим детали.\nПришли, пожалуйста, прайс/медиа‑кит и примеры прошлых интеграций.`;
  }
  if (k === 'brief') {
    return `Супер. Чтобы быстро согласовать — пришли кратко: канал/ссылка, аудитория, форматы, сроки, примерные условия.`;
  }
  if (k === 'price') {
    return `Ок. Пришли, пожалуйста, прайс/пакеты + статистику (охваты/ER) и примеры публикаций.`;
  }
  if (k === 'barter') {
    return `Рассмотрим бартер 🤝 Напиши, какие форматы бартеришь и что тебе обычно нужно от бренда (товар/доставка/сроки).`;
  }
  if (k === 'timing') {
    return `Уточни по срокам: когда можешь подготовить контент и когда готов(а) к публикации?`;
  }
  if (k === 'next') {
    return `Приняли ✅ Давай дальше: пришли 2–3 варианта формата и ориентир по бюджету/условиям — выберем лучший.`;
  }
  return `Спасибо за заявку! ✅ Напиши, пожалуйста, чуть подробнее про формат и условия — и продолжим.`;
}


// --- TEMPLATE PREVIEW FLOW HELPER (apps/leads; bx-ready) ---
// Unifies: template list + preview UI so we don't maintain separate implementations.
// Payloads are NOT renamed. Only internal UI reuse.

const BRAND_APP_TPLS = [
  { key: 'next', label: '✅ Приняли — дальше', icon: '✅' },
  { key: 'price', label: '📎 Прайс / медиа‑кит', icon: '📎' },
  { key: 'brief', label: '🧾 Уточнить детали', icon: '🧾' },
  { key: 'barter', label: '🤝 Бартер', icon: '🤝' },
  { key: 'timing', label: '⏱ Сроки', icon: '⏱' },
];

const LEAD_TPLS = [
  { key: 'discuss', label: '✅ Спасибо, обсудим', icon: '✅' },
  { key: 'price', label: '💰 Прайс / бюджет', icon: '💰' },
  { key: 'brief', label: '🧾 Пришли бриф', icon: '🧾' },
  { key: 'timing', label: '⏱ Сроки / дедлайн', icon: '⏱' },
  { key: 'format', label: '🧩 UGC или интеграция?', icon: '🧩' },
  { key: 'decline', label: '❌ Отказ', icon: '❌' },
];

function kbTplList(kb, templates, mkCb) {
  for (const t of templates) kb.text(String(t.label), mkCb(String(t.key))).row();
  return kb;
}

function kbTplIconPicker(kb, templates, mkCb, perRow = 3) {
  let n = 0;
  for (const t of templates) {
    kb.text(String(t.icon || '•'), mkCb(String(t.key)));
    n += 1;
    if (n % perRow === 0 && n < templates.length) kb.row();
  }
  kb.row();
  return kb;
}

async function renderTemplatePreviewFlow(ctx, actorUserId, kind, id, key, backCb) {
  const k = String(kind || '').toLowerCase().trim();
  if (k === 'brand_app' || k === 'app' || k === 'apps') {
    return _renderTplFlowBrandApp(ctx, actorUserId, Number(id), key, backCb);
  }
  if (k === 'lead' || k === 'leads') {
    return _renderTplFlowLead(ctx, actorUserId, Number(id), key, backCb);
  }
  try { await ctx.answerCallbackQuery({ text: 'Unsupported template flow.' }); } catch {}
}

async function _renderTplFlowBrandApp(ctx, actorUserId, appId, key, back) {
  const app = await safeBrandApplications(() => db.getBrandApplicationById(appId), async () => null);
  if (!app) { try { await ctx.answerCallbackQuery({ text: 'Заявка не найдена.' }); } catch {} return; }

  const brandUserId = Number(app.brand_user_id);
  const access = await assertBrandAppsAccess(ctx, actorUserId, brandUserId);
  if (!access.ok) return;

  const prof = await safeBrandProfiles(() => db.getBrandProfile(brandUserId), async () => null);
  const brandName = String(prof?.brand_name || '').trim() || 'Бренд';

  // --- LIST ---
  if (!key) {
    const who = app.creator_username ? '@' + String(app.creator_username).replace(/^@/, '') : (app.creator_tg_id ? `id:${app.creator_tg_id}` : 'creator');

    const text =
      `⚡ <b>Быстрые ответы</b>\n\n` +
      `Заявка #${app.id} от <b>${escapeHtml(String(who))}</b>\n\n` +
      `Выбери шаблон → откроется предпросмотр → нажми “📨 Отправить”. После отправки у креатора появится кнопка “💬 Написать бренду”.`;

    const kb = new InlineKeyboard();
    kbTplList(kb, BRAND_APP_TPLS, (tplKey) => `a:brand_app_tpl|id:${app.id}|k:${tplKey}|s:${back.status}|p:${back.page}`);
    kb.text('⬅️ Назад', `a:brand_app_view|id:${app.id}|s:${back.status}|p:${back.page}`)
      .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');

    try {
      await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
    } catch {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
    }
    return;
  }

  // --- PREVIEW ---
  const creatorTgId = Number(app.creator_tg_id || 0);
  if (!creatorTgId) { try { await ctx.answerCallbackQuery({ text: 'У креатора нет TG id.' }); } catch {} return; }

  const replyText = buildBrandAppTemplateText(brandName, key);

  const cUrl = prof?.contact ? brandContactUrl(prof.contact) : null;
  const link = String(prof?.brand_link || '').trim();
  const linkLine = link ? `\n🔗 Сайт/ссылка: ${escapeHtml(link)}` : '';
  const contactLine = cUrl ? `\n✍️ Контакт: ${escapeHtml(String(prof.contact))}` : '';

  // Build exactly the same message as will be sent.
  let outText =
    `📩 <b>Ответ бренда</b>\n\n` +
    `Бренд: <b>${escapeHtml(brandName)}</b>` +
    linkLine +
    contactLine +
    `\n\n<b>Сообщение:</b>\n${escapeHtml(replyText)}`;

  // Guard: Telegram max message length is 4096
  if (outText.length > 3900) {
    outText =
      `📩 <b>Ответ бренда</b>\n\n` +
      `Бренд: <b>${escapeHtml(brandName)}</b>` +
      `\n\n<b>Сообщение:</b>\n${escapeHtml(replyText)}`;
  }

  let text =
    `🧾 <b>Предпросмотр</b>\n` +
    `<i>Это сообщение уйдёт креатору. Нажми “📨 Отправить”.</i>\n\n` +
    outText;

  if (text.length > 3900) text = outText;

  const kb = new InlineKeyboard();
  kbTplIconPicker(kb, BRAND_APP_TPLS, (tplKey) => `a:brand_app_tpl|id:${app.id}|k:${tplKey}|s:${back.status}|p:${back.page}`, 3);
  kb.text('📨 Отправить', `a:brand_app_tpl_send|id:${app.id}|k:${String(key || 'discuss')}|s:${back.status}|p:${back.page}`)
    .row()
    .text('🔄 Выбрать другой', `a:brand_app_tpls|id:${app.id}|s:${back.status}|p:${back.page}`)
    .text('✍️ Ответить', `a:brand_app_reply|id:${app.id}|s:${back.status}|p:${back.page}`);

  kbNavRow(kb, `a:brand_app_view|id:${app.id}|s:${back.status}|p:${back.page}`);

  try {
    await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  } catch {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  }
}

async function _renderTplFlowLead(ctx, actorUserId, leadId, key, back) {
  const lead = await db.getBrandLeadById(leadId);
  if (!lead) { await safeEditOrReply(ctx, '⚠️ Заявка не найдена или удалена. Открой 📨 Заявки брендов и выбери заявку ещё раз.', { parse_mode: 'HTML', reply_markup: navKb('a:menu') }); return; }

  const wsId = Number(lead.workspace_id);
  const ws = await db.getWorkspaceAny(wsId);
  if (!ws) { await safeEditOrReply(ctx, '⚠️ Канал не найден или нет доступа. Открой 📋 Меню → выбери канал и повтори.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') }); return; }

  const isOwner = Number(ws.owner_user_id) === Number(actorUserId);
  const isAdmin = isSuperAdminTg(ctx.from?.id);
  let isCurator = false;
  if (!isOwner && !isAdmin) {
    try { isCurator = await db.isCuratorForWorkspace(wsId, actorUserId); } catch {}
  }
  if (!isOwner && !isAdmin && !isCurator) {
    await safeEditOrReply(ctx, '⚠️ Нет доступа к этой заявке. Открой 📋 Меню → выбери канал заново.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') });
    return;
  }
  const canManualReply = isOwner || isAdmin;

  const retKey = String(back?.ret || '').trim();
  const rPart = retKey ? retPartShort(retKey) : '';

  // --- LIST ---
  if (!key) {
    const who = lead.brand_username ? '@' + String(lead.brand_username).replace(/^@/, '') : (lead.brand_name || 'brand');

    const text =
      `⚡ <b>Быстрые ответы</b>\n\n` +
      `Заявка #${lead.id} от <b>${escapeHtml(String(who))}</b>\n\n` +
      `Выбери шаблон → откроется предпросмотр → нажми “📨 Отправить”.`;

    const kb = new InlineKeyboard();
    kbTplList(kb, LEAD_TPLS, (tplKey) => `a:lead_tpl|id:${lead.id}|k:${tplKey}|w:${wsId}|s:${leadStatusToCb(back.status)}|p:${back.page}${rPart}`);
    if (canManualReply) {
      kb.text('✍️ Ответить вручную', `a:lead_reply|id:${lead.id}|w:${wsId}|s:${leadStatusToCb(back.status)}|p:${back.page}${rPart}`).row();
    }
    kb.text('⬅️ Назад', `a:lead_view|id:${lead.id}|w:${wsId}|s:${leadStatusToCb(back.status)}|p:${back.page}${rPart}`)
      .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');

    try {
      await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
    } catch {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
    }
    return;
  }

  // --- PREVIEW ---
  const tplKey = normLeadTplKey(key);
  const replyText = buildLeadTemplateText(ws, lead, tplKey);
  const plainContacts = isCurator && !isOwner && !isAdmin;
  const card = formatWsContactCard(ws, Number(ws.id), { plain: plainContacts });

  const who = lead.brand_username ? '@' + String(lead.brand_username).replace(/^@/, '') : (lead.brand_name || 'brand');

  // Exact message that will be sent to the brand (preview).
  let outText =
    `🧾 <b>Предпросмотр ответа</b>\n\n` +
    `Заявка #${lead.id} от <b>${escapeHtml(String(who))}</b>\n` +
    `Шаблон: <b>${escapeHtml(leadTplLabel(tplKey))}</b>\n\n` +
    `— — —\n` +
    `💬 <b>Ответ от ${escapeHtml(safeCreatorDisplayName({ title: ws.profile_title || ws.title, channel_username: ws.channel_username }))}</b>\n\n` +
    `${escapeHtml(String(replyText))}\n\n` +
    `<b>Контакты:</b>\n${card}`;

  // Safety: keep the preview readable and avoid Telegram 4096 hard-limit.
  if (outText.length > 3900) {
    outText =
      `🧾 <b>Предпросмотр ответа</b>\n\n` +
      `Заявка #${lead.id} от <b>${escapeHtml(String(who))}</b>\n` +
      `Шаблон: <b>${escapeHtml(leadTplLabel(tplKey))}</b>\n\n` +
      `💬 <b>Ответ</b>\n\n` +
      `${escapeHtml(String(replyText))}\n\n` +
      `⚠️ Контакты/витрина будут добавлены при отправке.`;
  }

  const kb = new InlineKeyboard();
  kbTplIconPicker(kb, LEAD_TPLS, (k2) => `a:lead_tpl|id:${lead.id}|k:${k2}|w:${wsId}|s:${leadStatusToCb(back.status)}|p:${back.page}${rPart}`, 3);
  kb.text('📨 Отправить', `a:lead_tpl_send|id:${lead.id}|k:${tplKey}|w:${wsId}|s:${leadStatusToCb(back.status)}|p:${back.page}${rPart}`)
    .row();
  kb.text('🗂 Шаблоны', `a:lead_tpls|id:${lead.id}|w:${wsId}|s:${leadStatusToCb(back.status)}|p:${back.page}${rPart}`);
  if (canManualReply) kb.text('✍️ Ответить', `a:lead_reply|id:${lead.id}|w:${wsId}|s:${leadStatusToCb(back.status)}|p:${back.page}${rPart}`);
  kb.row();
  kb.text('⬅️ Назад', `a:lead_view|id:${lead.id}|w:${wsId}|s:${leadStatusToCb(back.status)}|p:${back.page}${rPart}`)
    .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');

  try {
    await safeEditOrReply(ctx, outText, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  } catch {
    await ctx.reply(outText, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  }
}

async function renderBrandAppTemplates(ctx, actorUserId, appId, back) {
  return renderTemplatePreviewFlow(ctx, actorUserId, 'brand_app', appId, null, back);
}



async function renderBrandAppTemplatePreview(ctx, actorUserId, appId, key, back) {
  return renderTemplatePreviewFlow(ctx, actorUserId, 'brand_app', appId, key, back);
}


async function sendBrandAppTemplateReply(ctx, actorUserId, appId, key, back) {
  const app = await safeBrandApplications(() => db.getBrandApplicationById(appId), async () => null);
  if (!app) { try { await ctx.answerCallbackQuery({ text: 'Заявка не найдена.' }); } catch {} return; }

  const brandUserId = Number(app.brand_user_id);
  const access = await assertBrandAppsAccess(ctx, actorUserId, brandUserId);
  if (!access.ok) return;

  const creatorTgId = Number(app.creator_tg_id || 0);
  if (!creatorTgId) { try { await ctx.answerCallbackQuery({ text: 'У креатора нет TG id.' }); } catch {} return; }

  const prof = await safeBrandProfiles(() => db.getBrandProfile(brandUserId), async () => null);
  const brandName = String(prof?.brand_name || '').trim() || 'Бренд';

  const replyText = buildBrandAppTemplateText(brandName, key);

  const cUrl = prof?.contact ? brandContactUrl(prof.contact) : null;
  const link = String(prof?.brand_link || '').trim();
  const linkLine = link ? `\n🔗 Сайт/ссылка: ${escapeHtml(link)}` : '';
  const contactLine = cUrl ? `\n✍️ Контакт: ${escapeHtml(String(prof.contact))}` : '';

  // Guard: Telegram max message length is 4096
  // If too long, drop contact/link and keep message only
  let outText =
    `📩 <b>Ответ бренда</b>\n\n` +
    `Бренд: <b>${escapeHtml(brandName)}</b>` +
    linkLine +
    contactLine +
    `\n\n<b>Сообщение:</b>\n${escapeHtml(replyText)}`;

  if (outText.length > 3900) {
    outText =
      `📩 <b>Ответ бренда</b>\n\n` +
      `Бренд: <b>${escapeHtml(brandName)}</b>` +
      `\n\n<b>Сообщение:</b>\n${escapeHtml(replyText)}`;
  }

  const outKb = new InlineKeyboard()
    .text('📨 Открыть заявку', `a:brand_app_card|id:${app.id}`)
    .text('💬 Ответить', `a:brand_app_chat|id:${app.id}`)
    .row()
    .text('📋 Меню', 'a:menu')
    .text('🏠 Home', 'a:home');

  const sendRes = await sendMessageWithFallback(apiFromCtx(ctx), creatorTgId, outText, {
    parse_mode: 'HTML',
    reply_markup: outKb,
    disable_web_page_preview: true,
  });

  if (!sendRes.ok) {
    const reason = describeTgSendError(sendRes.err);
    console.warn('[brand_app_tpl] sendMessage failed', { appId: Number(appId), creatorTgId, reason, raw: String(sendRes.err?.description || sendRes.err?.message || sendRes.err || '') });

    const botLink = CFG.BOT_USERNAME ? `https://t.me/${CFG.BOT_USERNAME}` : null;
    const kb = new InlineKeyboard()
      .text('⬅️ Назад', `a:brand_app_view|id:${app.id}|s:${back.status}|p:${back.page}`)
      .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');
    if (botLink) kb.row().url('🔗 Ссылка креатору (/start)', botLink);

    const errMsg =
      `❌ <b>Не удалось доставить сообщение креатору</b>

` +
      `Причина: <i>${escapeHtml(reason)}</i>

` +
      `<b>Текст ответа (можно скопировать):</b>
${escapeHtml(replyText)}`;

    // Even error UI must be anti-silent.
    try {
      await safeEditOrReply(ctx, errMsg, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
    } catch {
      try {
        await ctx.reply(errMsg, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
      } catch {
        // last resort: plain text without HTML
        await ctx.reply(stripHtmlTags(errMsg), { reply_markup: kb, disable_web_page_preview: true }).catch(() => {});
      }
    }
    // we still persist the reply in the thread (brand pressed a template)
  }

  // Persist
  await safeBrandAppsWrite(() => db.markBrandApplicationReplied(appId, replyText, actorUserId), { op: 'brand_app_mark_replied', appId });
  await safeBrandAppsWrite(() => db.appendBrandApplicationThreadMessage(appId, {
    from: 'brand',
    text: replyText,
    at: new Date().toISOString(),
    by_user_id: Number(actorUserId),
    by_tg_id: Number(ctx.from?.id || 0),
    by_username: ctx.from?.username || null
  }), { op: 'brand_app_thread_append', appId });
  if (normLeadStatus(app.status) === 'new') {
    await safeBrandAppsWrite(() => db.updateBrandApplicationStatus(appId, 'in_progress'), { op: 'brand_app_status', appId, st: 'in_progress' });
  }

  if (!sendRes.ok) return;

  try { await ctx.answerCallbackQuery({ text: '✅ Отправлено' }); } catch {}

  // Guard: renderBrandAppView can fail (rare, but must be handled)
  try {
    await renderBrandAppView(ctx, actorUserId, appId, back);
  } catch (e) {
    try {
      console.warn('[brand_app_tpl] renderView failed', {
        appId,
        actorUserId,
        back,
        cid: ctx.state?.cid || null,
        err: errInfo(e)
      });
    } catch {}
    // Fallback: send confirmation message with navigation (no render)
    try {
      await ctx.reply('✅ Отправлено.', {
        reply_markup: new InlineKeyboard()
          .text('⬅️ Назад', `a:brand_app_view|id:${appId}|s:${back.status}|p:${back.page}`)
          .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home')
      });
    } catch {}
  }
}

async function acceptBrandApplication(ctx, actorUserId, appId, back) {
  const app = await safeBrandApplications(() => db.getBrandApplicationById(appId), async () => null);
  if (!app) { try { await ctx.answerCallbackQuery({ text: 'Заявка не найдена.' }); } catch {} return; }

  const brandUserId = Number(app.brand_user_id);
  const access = await assertBrandAppsAccess(ctx, actorUserId, brandUserId);
  if (!access.ok) return;

  // mark accepted (status=in_progress + meta.deal)
  await safeBrandAppsWrite(() => db.markBrandApplicationAccepted(appId, actorUserId), { op: 'brand_app_accept', appId });

  // notify creator
  const creatorTgId = Number(app.creator_tg_id || 0);
  if (creatorTgId) {
    const prof = await safeBrandProfiles(() => db.getBrandProfile(brandUserId), async () => null);
    const brandName = String(prof?.brand_name || '').trim() || 'Бренд';
    const outText =
      `✅ <b>Заявка принята</b>\n\n` +
      `Бренд <b>${escapeHtml(brandName)}</b> принял твою заявку.\n` +
      `Теперь можно продолжить диалог прямо в боте.`;

    const outKb = new InlineKeyboard()
    .text('💬 Написать бренду', `a:brand_app_chat|id:${app.id}`)
    .text('📨 Открыть заявку', `a:brand_app_card|id:${app.id}`)
    .row()
    .text('🪟 Открыть бренд', `a:brand_dir_open|u:${brandUserId}|p:0`)
    .row()
    .text('📋 Меню', 'a:menu')
    .text('🏠 Home', 'a:home');

    const sendRes = await sendMessageWithFallback(apiFromCtx(ctx), creatorTgId, outText, {
      parse_mode: 'HTML',
      reply_markup: outKb,
      disable_web_page_preview: true,
    });
    if (!sendRes.ok) {
      const reason = describeTgSendError(sendRes.err);
      console.warn('[brand_app_accept] notify creator failed', { appId: Number(appId), creatorTgId, reason, raw: String(sendRes.err?.description || sendRes.err?.message || sendRes.err || '') });
    }
  }

  await safeBrandAppsWrite(() => db.appendBrandApplicationThreadMessage(appId, {
    from: 'system',
    text: 'Заявка принята ✅',
    at: new Date().toISOString(),
    by_user_id: Number(actorUserId)
  }), { op: 'brand_app_thread_append', appId });

  try { await ctx.answerCallbackQuery({ text: '✅ Принято' }); } catch {}
  await renderBrandAppView(ctx, actorUserId, appId, back);
}


async function renderBrandAppCardForCreator(ctx, actorUserId, appId) {
  const app = await safeBrandApplications(() => db.getBrandApplicationById(appId), async () => null);
  if (!app) { try { await ctx.answerCallbackQuery({ text: 'Заявка не найдена.' }); } catch {} return; }

  if (Number(app.creator_user_id) !== Number(actorUserId)) {
    try { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); } catch {}
    return;
  }

  const brandUserId = Number(app.brand_user_id);
  const prof = await safeBrandProfiles(() => db.getBrandProfile(brandUserId), async () => null);
  const brandName = String(prof?.brand_name || '').trim() || 'Бренд';

  const st = normLeadStatus(app.status);
  const stTitle = (LEAD_STATUSES[st] || LEAD_STATUSES.new).title;
  const when = app.updated_at ? fmtTs(app.updated_at) : (app.created_at ? fmtTs(app.created_at) : '—');

  const msgRaw = String(app.message || '').trim();
  const msgShort = msgRaw ? clipText(msgRaw, 900) : '—';

  const thread = Array.isArray(app?.meta?.thread) ? app.meta.thread : [];
  let lastBrand = '';
  for (let i = thread.length - 1; i >= 0; i--) {
    const m = thread[i];
    if (m && String(m.from || '').toLowerCase() === 'brand' && String(m.text || '').trim()) {
      lastBrand = String(m.text || '').trim();
      break;
    }
  }
  const replyRaw = String(app.reply_text || '').trim();
  const lastReply = replyRaw || lastBrand;

  let text =
    `✉️ <b>Диалог по заявке #${app.id}</b>
` +
    `Бренд: <b>${escapeHtml(brandName)}</b>
` +
    `Статус: <b>${escapeHtml(stTitle)}</b>
` +
    `Обновлено: <code>${escapeHtml(when)}</code>

` +
    `📝 <b>Твоя заявка</b>
<code>${escapeHtml(msgShort)}</code>`;

  if (lastReply) {
    text += `

📩 <b>Последний ответ бренда</b>
<code>${escapeHtml(clipText(lastReply, 900))}</code>`;
  }

  const tail = formatBrandAppThread(thread, 4);
  if (tail) {
    text += `

💬 <b>Последние сообщения</b>
${tail}`;
  }

  if (st === 'new') {
    text += `

⏳ <i>Пока бренд не принял заявку — писать нельзя. Когда примут, появится кнопка “💬 Написать бренду”.</i>`;
  } else {
    text += `

💬 Нажми «Написать бренду» и отправь сообщение — оно попадёт в Inbox бренда.`;
  }

  const kb = new InlineKeyboard();
  if (st !== 'new') kb.text('💬 Написать бренду', `a:brand_app_chat|id:${app.id}`).row();
  kb.text('🪟 Открыть бренд', `a:brand_dir_open|u:${brandUserId}|p:0`).row();
  kb.text('📋 Меню', 'a:menu');

  try {
    await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  } catch {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  }
}

async function startBrandAppChatForCreator(ctx, actorUserId, appId) {
  const app = await safeBrandApplications(() => db.getBrandApplicationById(appId), async () => null);
  if (!app) { try { await ctx.answerCallbackQuery({ text: 'Заявка не найдена.' }); } catch {} return; }

  if (Number(app.creator_user_id) !== Number(actorUserId)) {
    try { await ctx.answerCallbackQuery({ text: 'Нет доступа.' }); } catch {}
    return;
  }

  const brandUserId = Number(app.brand_user_id);
  const prof = await safeBrandProfiles(() => db.getBrandProfile(brandUserId), async () => null);
  const brandName = String(prof?.brand_name || '').trim() || 'Бренд';

  // allow chat if accepted OR already in progress (brand replied / accepted)
  const st = normLeadStatus(app.status);
  if (st === 'new') {
    return ctx.answerCallbackQuery({ text: 'Бренд ещё не принял заявку.' });
  }

  await setExpectText(ctx.from.id, { type: 'brand_app_chat_send', appId: Number(app.id) });

  const kb = new InlineKeyboard()
    .text('🪟 Открыть бренд', `a:brand_dir_open|u:${brandUserId}|p:0`);

  // Keep context: Back goes to the dialog card (not straight to main menu)
  kbNavRow(kb, `a:brand_app_card|id:${app.id}`);

  const text =
    `💬 <b>Сообщение бренду</b>\n\n` +
    `Бренд: <b>${escapeHtml(brandName)}</b>\n` +
    `Заявка: #${app.id}\n\n` +
    `Напиши сообщение одним текстом — я доставлю его в Inbox бренда.`;

  try {
    await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  } catch {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  }
}



async function renderLeadTemplates(ctx, actorUserId, leadId, back) {
  return renderTemplatePreviewFlow(ctx, actorUserId, 'lead', leadId, null, back);
}


const LEAD_TPL_LABELS = {
  discuss: '✅ Спасибо, обсудим',
  price: '💰 Прайс / бюджет',
  brief: '🧾 Пришли бриф',
  timing: '⏱ Сроки / дедлайн',
  format: '🧩 UGC или интеграция?',
  decline: '❌ Отказ',
};

function normLeadTplKey(k) {
  const v = String(k || 'discuss').toLowerCase().trim();
  return LEAD_TPL_LABELS[v] ? v : 'discuss';
}

function leadTplLabel(k) {
  const kk = normLeadTplKey(k);
  return LEAD_TPL_LABELS[kk] || LEAD_TPL_LABELS.discuss;
}

async function renderLeadTemplatePreview(ctx, actorUserId, leadId, key, back) {
  return renderTemplatePreviewFlow(ctx, actorUserId, 'lead', leadId, key, back);
}


async function sendLeadTemplateReply(ctx, actorUserId, leadId, key, back) {
  const lead = await db.getBrandLeadById(leadId);
  if (!lead) { await safeEditOrReply(ctx, '⚠️ Заявка не найдена или удалена. Открой 📨 Заявки брендов и выбери заявку ещё раз.', { parse_mode: 'HTML', reply_markup: navKb('a:menu') }); return; }

  const wsId = Number(lead.workspace_id);
  const ws = await db.getWorkspaceAny(wsId);
  if (!ws) { await safeEditOrReply(ctx, '⚠️ Канал не найден или нет доступа. Открой 📋 Меню → выбери канал и повтори.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') }); return; }

  const isOwner = Number(ws.owner_user_id) === Number(actorUserId);
  const isAdmin = isSuperAdminTg(ctx.from?.id);
  let isCurator = false;
  if (!isOwner && !isAdmin) {
    try { isCurator = await db.isCuratorForWorkspace(wsId, actorUserId); } catch {}
  }
  if (!isOwner && !isAdmin && !isCurator) {
    await safeEditOrReply(ctx, '⚠️ Нет доступа к этой заявке. Открой 📋 Меню → выбери канал заново.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') });
    return;
  }
  const canManualReply = isOwner || isAdmin;

  const brandTgId = Number(lead.brand_tg_id || 0);
  if (!brandTgId) { try { await ctx.answerCallbackQuery({ text: 'У бренда нет TG id.' }); } catch {} return; }

  const tplKey = normLeadTplKey(key);
  const replyText = buildLeadTemplateText(ws, lead, tplKey);
  // Gate contacts in replies to prevent free bypass.
  let brandCredits = 0;
  try {
    const uid = Number(lead.brand_user_id || 0);
    if (uid) brandCredits = await db.getBrandCredits(uid);
    else if (brandTgId) brandCredits = await db.getBrandCreditsByTgId(brandTgId);
  } catch {}

  const fromName = String(ws.profile_title || ws.title || 'Креатор');
  const header = `💬 <b>Ответ от ${escapeHtml(fromName)}</b>`;
  const lockHint = contactsLockedHintHtml(Number(brandCredits || 0) > 0);

  let out = `${header}\n\n${escapeHtml(String(replyText))}\n\n${lockHint}`;
  if (out.length > 3900) {
    out = `${header}\n\n${escapeHtml(clipText(String(replyText), 2800))}\n\n${lockHint}`;
  }

  const kbToBrand = brandReplyKb(ws, wsId, brandCredits, leadId);
  const sendRes = await sendMessageWithFallback(apiFromCtx(ctx), brandTgId, out, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kbToBrand });
  if (!sendRes.ok) {
    const reason = describeTgSendError(sendRes.err);
    const retKey = String(back?.ret || '').trim();
    const retPart = retKey ? `|ret:${retKey}` : '';
    const kb = navKb(`a:lead_view|id:${leadId}|ws:${wsId}|s:${back.status}|p:${back.page}${retPart}`);
    const msg = `❌ Не удалось отправить сообщение бренду.

Причина: <b>${escapeHtml(reason)}</b>

💡 Возможно, бренд ещё не нажимал /start.`;
    try {
      await safeEditOrReply(ctx, msg, { parse_mode: 'HTML', reply_markup: kb });
    } catch {
      await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: kb });
    }
    return;
  }

  // Persist in-brand thread for the brand-side dialog
  await appendBrandLeadThread(leadId, 'creator', String(replyText));

  await safeLeadWrite(() => db.markBrandLeadReplied(leadId, replyText, Number(actorUserId)), { op: 'lead_mark_replied', leadId });

  // curator auto-note (internal)
  if (isCurator && !isOwner && !isAdmin) {
    const k = normLeadTplKey(tplKey);
    const lbl = LEAD_TPL_LABELS[k] || k;
    try { await safeLeadWrite(() => db.appendBrandLeadCuratorNote(leadId, Number(actorUserId), `Отправлен шаблон: ${lbl}`, { tags: ['template'] }), { op: 'lead_note_auto', leadId }); } catch {}
  }

  // status transitions
  const curSt = normLeadStatus(lead.status);
  if (normLeadTplKey(tplKey) === 'decline') {
    if (curSt !== 'closed') {
      await safeLeadWrite(() => db.updateBrandLeadStatus(leadId, 'closed'), { op: 'lead_status', leadId, st: 'closed' });
    }
  } else if (curSt === 'new') {
    await safeLeadWrite(() => db.updateBrandLeadStatus(leadId, 'in_progress'), { op: 'lead_status', leadId, st: 'in_progress' });
  }

  try { await ctx.answerCallbackQuery({ text: '✅ Отправлено' }); } catch {}
  try {
    await renderLeadView(ctx, actorUserId, leadId, back);
  } catch {
    const retPart = back?.ret ? `|ret:${String(back.ret)}` : '';
    await ctx.reply('✅ Отправлено.', { reply_markup: navKb(`a:lead_view|id:${leadId}|ws:${wsId}|s:${back.status}|p:${back.page}${retPart}`) });
  }
}
async function renderWsPro(ctx, ownerUserId, wsId) {
  const isAdmin = isSuperAdminTg(ctx.from?.id);
  const ws = isAdmin ? await db.getWorkspaceAny(wsId) : await db.getWorkspace(ownerUserId, wsId);
  if (!ws) { await safeEditOrReply(ctx, '⚠️ Канал не найден. Открой 📋 Меню → выбери канал и повтори.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') }); return; }
  if (!isAdmin && Number(ws.owner_user_id) !== Number(ownerUserId)) { await safeEditOrReply(ctx, '⚠️ Нет доступа. Открой 📋 Меню → выбери канал заново.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') }); return; }
  await db.ensureWorkspaceSettings(wsId);
  const s = await db.getWorkspace(ownerUserId, wsId);
  const isPro = await db.isWorkspacePro(wsId);
  const until = s.pro_until ? fmtTs(s.pro_until) : '—';

  const free = `Free: конкурсы + базовая биржа`;
  const pro = `PRO: bump чаще / больше офферов / pin в ленте / расширенная аналитика`;

  const text = `⭐️ <b>PRO</b>

Канал: <b>${escapeHtml(ws.channel_username ? '@' + ws.channel_username : ws.title)}</b>
План: <b>${escapeHtml(String(s.plan || 'free').toUpperCase())}</b>
PRO до: <b>${escapeHtml(until)}</b>

${escapeHtml(free)}
${escapeHtml(pro)}

Лимиты:
• Офферы: <b>${CFG.BARTER_MAX_ACTIVE_OFFERS_FREE}</b> (Free) / <b>${CFG.BARTER_MAX_ACTIVE_OFFERS_PRO}</b> (PRO)
• Bump: <b>${CFG.BARTER_BUMP_COOLDOWN_HOURS_FREE}ч</b> (Free) / <b>${CFG.BARTER_BUMP_COOLDOWN_HOURS_PRO}ч</b> (PRO)

Оплата: Telegram Stars или ссылкой.`;

  const kb = new InlineKeyboard();
  if (!isPro) {
    kb.text(`⭐️ Купить PRO (${CFG.PRO_STARS_PRICE} Stars)`, `a:ws_pro_buy|ws:${wsId}`).row();
    if (CFG.PRO_PAYMENT_URL) kb.url('🔗 Оплатить ссылкой', CFG.PRO_PAYMENT_URL).row();
  } else {
    kb.text('📌 Пин в ленте', `a:ws_pro_pin|ws:${wsId}`).row();
  }
  kb.text('⬅️ Назад', `a:ws_open|ws:${wsId}`);

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
}

async function renderWsProPinPick(ctx, ownerUserId, wsId) {
  const isAdmin = isSuperAdminTg(ctx.from?.id);
  const ws = isAdmin ? await db.getWorkspaceAny(wsId) : await db.getWorkspace(ownerUserId, wsId);
  if (!ws) { await safeEditOrReply(ctx, '⚠️ Канал не найден. Открой 📋 Меню → выбери канал и повтори.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') }); return; }
  if (!isAdmin && Number(ws.owner_user_id) !== Number(ownerUserId)) { await safeEditOrReply(ctx, '⚠️ Нет доступа. Открой 📋 Меню → выбери канал заново.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') }); return; }
  const isPro = await db.isWorkspacePro(wsId);
  if (!isPro) return ctx.answerCallbackQuery({ text: 'Доступно в PRO.' });

  const rows = await db.listBarterOffersForWorkspace(ownerUserId, wsId, 30, 0);
  const active = rows.filter(r => String(r.status).toUpperCase() === 'ACTIVE');
  const current = (await db.getWorkspace(ownerUserId, wsId)).pro_pinned_offer_id;

  const kb = new InlineKeyboard();
  for (const o of active.slice(0, 10)) {
    const isPinned = Number(current) === Number(o.id);
    const label = `${isPinned ? '📌' : '▫️'} #${o.id} ${o.title}`.slice(0, 60);
    kb.text(label, `a:ws_pro_pin_set|ws:${wsId}|o:${o.id}`).row();
  }
  kb.text('❌ Снять пин', `a:ws_pro_pin_clear|ws:${wsId}`).row();
  kb.text('⬅️ Назад', `a:ws_pro|ws:${wsId}`);

  await safeEditOrReply(ctx, `📌 <b>Пин в ленте</b>

Выбери оффер, который будет закреплен в ленте (только для PRO).`, {
    parse_mode: 'HTML',
    reply_markup: kb
  });
}


// --- Workspace channel folders (shared lists of @channels) ---
async function renderFoldersMy(ctx, userId) {
  const rows = await db.listWorkspaceEditorWorkspaces(userId);
  const kb = new InlineKeyboard();

  if (rows.length) {
    for (const w of rows.slice(0, 20)) {
      const name = w.channel_username ? '@' + w.channel_username : (w.title || `ws:${w.id}`);
      kb.text(`📁 ${String(name).slice(0, 48)}`, `a:folders_home|ws:${w.id}`).row();
    }
  }

  kb.text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');

  const text = rows.length
    ? `📁 <b>Папки</b>\n\nВыбери канал, где ты редактор:`
    : `📁 <b>Папки</b>\n\nПока тебя не назначили редактором папок ни в одном Workspace.`;

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
}

async function getFolderAccess(userId, wsId) {
  const wsOwned = await db.getWorkspace(userId, Number(wsId));
  if (wsOwned) return { ws: wsOwned, isOwner: true, canEdit: true };
  const isEd = await db.isWorkspaceEditor(Number(wsId), userId);
  if (!isEd) return null;
  const ws = await db.getWorkspaceById(Number(wsId));
  if (!ws) return null;
  return { ws, isOwner: false, canEdit: true };
}

function foldersHomeKb(access, folders) {
  const wsId = Number(access.ws.id);
  const kb = new InlineKeyboard();

  // Top actions (в пару, когда можно)
  if (access.canEdit && access.isOwner) {
    kb.text('➕ Новая папка', `a:folder_new|ws:${wsId}`)
      .text('👥 Editors', `a:ws_editors|ws:${wsId}`)
      .row();
  } else if (access.canEdit) {
    kb.text('➕ Новая папка', `a:folder_new|ws:${wsId}`).row();
  } else if (access.isOwner) {
    kb.text('👥 Editors', `a:ws_editors|ws:${wsId}`).row();
  }

  for (const f of folders) {
    const cnt = Number(f.items_count || 0);
    const title = String(f.title || 'Папка').slice(0, 40);
    kb.text(`📁 ${title} (${cnt})`, `a:folder_open|ws:${wsId}|f:${f.id}`).row();
  }

  const backCb = access.isOwner ? `a:ws_open|ws:${wsId}` : 'a:folders_my';
  kb.row().text('⬅️ Назад', backCb).text('📋 Меню', 'a:menu');
  kb.row().text('🏠 Home', 'a:home');
  return kb;
}


async function renderFoldersHome(ctx, userId, wsId) {
  const access = await getFolderAccess(userId, wsId);
  if (!access) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

  const folders = await db.listChannelFolders(Number(wsId));
  const isPro = await db.isWorkspacePro(Number(wsId));
  const max = isPro ? CFG.WORKSPACE_FOLDER_MAX_ITEMS_PRO : CFG.WORKSPACE_FOLDER_MAX_ITEMS_FREE;

  const title = access.ws.channel_username ? '@' + access.ws.channel_username : (access.ws.title || `ws:${wsId}`);
  const text = `📁 <b>Папки</b>\n\nКанал: <b>${escapeHtml(String(title))}</b>\nЛимит каналов в папке: <b>${max}</b>\n\nСоздай папку и добавь @каналы для совместных конкурсов/офферов.`;

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: foldersHomeKb(access, folders) });
}

function folderViewKb(access, wsId, folderId) {
  const kb = new InlineKeyboard();

  // Управление каналами: часто жмут подряд → в пары.
  if (access.canEdit) {
    kb.text('➕ Добавить каналы', `a:folder_add|ws:${wsId}|f:${folderId}`)
      .text('➖ Удалить каналы', `a:folder_remove|ws:${wsId}|f:${folderId}`)
      .row()
      .text('✏️ Переименовать', `a:folder_rename|ws:${wsId}|f:${folderId}`)
      .text('📤 Выгрузить списком', `a:folder_export|ws:${wsId}|f:${folderId}`)
      .row();

    // Деструктивные действия — ниже.
    if (access.isOwner) {
      kb.text('🧹 Очистить', `a:folder_clear_q|ws:${wsId}|f:${folderId}`)
        .text('🗑 Удалить папку', `a:folder_delete_q|ws:${wsId}|f:${folderId}`)
        .row();
    } else {
      kb.text('🧹 Очистить', `a:folder_clear_q|ws:${wsId}|f:${folderId}`).row();
    }
  } else {
    // Read-only
    kb.text('📤 Выгрузить списком', `a:folder_export|ws:${wsId}|f:${folderId}`).row();
  }

  kb.row().text('⬅️ Назад', `a:folders_home|ws:${wsId}`).text('📋 Меню', 'a:menu');
  kb.row().text('🏠 Home', 'a:home');
  return kb;
}


async function renderFolderView(ctx, userId, wsId, folderId) {
  const access = await getFolderAccess(userId, wsId);
  if (!access) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

  const folder = await db.getChannelFolder(Number(folderId));
  if (!folder || Number(folder.workspace_id) !== Number(wsId)) {
    return ctx.answerCallbackQuery({ text: 'Папка не найдена.' });
  }

  const items = await db.listChannelFolderItems(Number(folderId));
  const isPro = await db.isWorkspacePro(Number(wsId));
  const max = isPro ? CFG.WORKSPACE_FOLDER_MAX_ITEMS_PRO : CFG.WORKSPACE_FOLDER_MAX_ITEMS_FREE;

  const shown = items.slice(0, 25).map(i => `• ${escapeHtml(i.channel_username)}`);
  const more = items.length > 25 ? `\n…и ещё <b>${items.length - 25}</b>` : '';

  const title = access.ws.channel_username ? '@' + access.ws.channel_username : (access.ws.title || `ws:${wsId}`);

  const text = `📁 <b>${escapeHtml(String(folder.title || 'Папка'))}</b>\n` +
    `Канал: <b>${escapeHtml(String(title))}</b>\n` +
    `Каналы: <b>${items.length}</b> / <b>${max}</b>\n\n` +
    (shown.length ? shown.join('\n') : 'Пока пусто.') +
    more;

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: folderViewKb(access, Number(wsId), Number(folderId)) });
}

async function renderWsEditors(ctx, ownerUserId, wsId) {
  const ws = await db.getWorkspace(ownerUserId, Number(wsId));
  if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

  const editors = await db.listWorkspaceEditors(Number(wsId));

  const kb = new InlineKeyboard()
    .text('➕ Invite link', `a:ws_editor_invite|ws:${wsId}`)
    .row()
    .text('➕ Добавить по @username', `a:ws_editor_add_username|ws:${wsId}`)
    .row();

  if (editors.length) {
    for (const e of editors.slice(0, 20)) {
      const label = e.tg_username ? '@' + e.tg_username : ('id:' + e.tg_id);
      kb.text(`❌ ${String(label).slice(0, 28)}`, `a:ws_editor_rm_q|ws:${wsId}|u:${e.user_id}`).row();
    }
  }

  kb.text('⬅️ Назад', `a:folders_home|ws:${wsId}`);

  const lines = editors.map(e => `• ${e.tg_username ? '@' + escapeHtml(e.tg_username) : 'id:' + escapeHtml(String(e.tg_id))}`);

  const text = `👥 <b>Editors</b>\n\n` +
    `Редакторы могут управлять папками (добавлять/удалять @каналы).\n` +
    `По умолчанию папки редактирует только owner.\n\n` +
    (lines.length ? lines.join('\n') : 'Пока нет редакторов.');

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
}


function bxTypeLabel(t) {
  switch (t) {
    case 'ad': return '📣 Реклама/упоминание';
    case 'review': return '🎥 Обзор/распаковка';
    case 'giveaway': return '🎁 Розыгрыш';
    default: return '✍️ Другое';
  }
}

function bxCompLabel(p) {
  switch (p) {
    case 'barter': return '🤝 Бартер';
    case 'cert': return '🎟 Сертификат';
    case 'rub': return '💸 ₽';
    default: return '🔁 Смешано';
  }
}

const BX_CATS = [null, 'cosmetics', 'fashion', 'unboxing', 'other'];
const BX_TYPES = [null, 'ad', 'review', 'giveaway', 'other'];
const BX_COMPS = [null, 'barter', 'cert', 'rub', 'mixed'];

function bxAnyLabel(v, kind) {
  if (!v) return 'Все';
  if (kind == 'cat') return bxCategoryLabel(v);
  if (kind == 'type') return bxTypeLabel(v);
  return bxCompLabel(v);
}


const BX_FILTER_TTL_SEC = 30 * 24 * 3600;

function bxFilterKeyScoped(tgId, ownerUserId, wsNum) {
  const scopeId = Number(ownerUserId || 0) || Number(tgId || 0);
  if (!scopeId) return null;
  const w = Number(wsNum || 0);
  if (w === 0) return k(['bx_filter_brand', scopeId]);
  return k(['bx_filter_ws', scopeId, w]);
}

function bxLegacyFilterKey(tgId, wsNum) {
  const id = Number(tgId || 0);
  if (!id) return null;
  return k(['bx_filter', id, Number(wsNum || 0)]);
}

async function getBxFilterScoped(tgId, ownerUserId, wsId) {
  const wsNum = Number(wsId || 0);
  const key = bxFilterKeyScoped(tgId, ownerUserId, wsNum);
  const legacyKey = bxLegacyFilterKey(tgId, wsNum);

  let v = null;
  let migrated = false;

  if (key) {
    try { v = await redis.get(key); } catch { v = null; }
  }

  // Legacy migration:
  // - previously used: bx_filter:<tgId>:<wsNum>
  // - now:
  //   wsNum==0 -> bx_filter_brand:<ownerUserId>
  //   wsNum>0  -> bx_filter_ws:<ownerUserId>:<wsNum>
  if (!v && key && legacyKey) {
    try {
      const old = await redis.get(legacyKey);
      if (old) {
        v = old;
        migrated = true;
      }
    } catch {}
  }

  const base = v || {};
  const f = {
    category: base.category ?? base.cat ?? null,
    offerType: base.offerType ?? base.type ?? null,
    compensationType: base.compensationType ?? base.comp ?? null,
    goalsTags: Array.isArray(base.goalsTags ?? base.goals) ? (base.goalsTags ?? base.goals) : [],
    reqTags: Array.isArray(base.reqTags ?? base.req) ? (base.reqTags ?? base.req) : [],
  };

  // Normalize values
  if (f.category === 'all') f.category = null;
  if (f.offerType === 'all') f.offerType = null;
  if (f.compensationType === 'all') f.compensationType = null;
  if (!Array.isArray(f.goalsTags)) f.goalsTags = [];
  if (!Array.isArray(f.reqTags)) f.reqTags = [];

  const needsPersist =
    migrated ||
    ('cat' in base) || ('type' in base) || ('comp' in base) || ('goals' in base) || ('req' in base) ||
    (base.category === 'all') || (base.offerType === 'all') || (base.compensationType === 'all') ||
    !Array.isArray(base.goalsTags) || !Array.isArray(base.reqTags);

  if (needsPersist && key) {
    try {
      await redis.set(key, f, { ex: BX_FILTER_TTL_SEC });
    } catch {}
  }

  return f;
}

async function setBxFilterScoped(tgId, ownerUserId, wsId, patch) {
  const wsNum = Number(wsId || 0);
  const key = bxFilterKeyScoped(tgId, ownerUserId, wsNum);
  const cur = await getBxFilterScoped(tgId, ownerUserId, wsNum);
  const next = { ...cur, ...(patch || {}) };

  // Normalize
  if (next.category === 'all') next.category = null;
  if (next.offerType === 'all') next.offerType = null;
  if (next.compensationType === 'all') next.compensationType = null;
  if (!Array.isArray(next.goalsTags)) next.goalsTags = [];
  if (!Array.isArray(next.reqTags)) next.reqTags = [];

  if (!key) return next;
  await redis.set(key, next, { ex: BX_FILTER_TTL_SEC });
  return next;
}

function bxFilterSummary(f) {
  const parts = [
    `Кат: ${bxAnyLabel(f.category, 'cat')}`,
    `Формат: ${bxAnyLabel(f.offerType, 'type')}`,
    `Оплата: ${bxAnyLabel(f.compensationType, 'comp')}`,
    `🎯 ${bxTagsLabel(f.goalsTags, 'goals')}`,
    `📎 ${bxTagsLabel(f.reqTags, 'req')}`,
  ];
  return parts.join(' · ');
}

function bxBrandOnlyNoticeKb() {
  return new InlineKeyboard()
    .text('🏷 Каталог брендов', 'a:brands_home|p:0')
    .text('🏷 Я бренд', 'a:ui_mode_set|m:brand|ret:menu')
    .row()
    .text('📋 Меню', 'a:menu');
}

async function renderBxBrandOnlyNotice(ctx) {
  const text = `📰 <b>Лента креаторов</b>
<i>Режим: 🎬 Креатор · Ты ищешь: 🏷 бренды</i>

Этот раздел доступен только в режиме <b>Brand</b>.

В режиме <b>Creator</b> вместо ленты — 🏷 Каталог брендов.`;
  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: bxBrandOnlyNoticeKb() });
}

function deriveBxSmartPrefillFromBrandProfile(prof) {
  const keys = parseBrandCollabTypes(String(prof?.collab_types || '').trim());
  const has = (arr) => arr.some((k) => keys.includes(k));

  const wantsAd = has(['integration', 'stories', 'reels', 'post', 'ambassador', 'ad']);
  const wantsReview = has(['review', 'unboxing']);
  const wantsGiveaway = has(['giveaway']);
  const wantsOther = has(['other']);
  const hasUgc = keys.includes('ugc');

  // Conservative: set offerType only when it's clearly one bucket (and not only 'ugc')
  const typeBuckets = [];
  if (wantsAd) typeBuckets.push('ad');
  if (wantsReview) typeBuckets.push('review');
  if (wantsGiveaway) typeBuckets.push('giveaway');
  if (wantsOther) typeBuckets.push('other');

  let offerType = null;
  if (!hasUgc && typeBuckets.length === 1) offerType = typeBuckets[0];

  // Compensation: map brand 'paid' -> bx 'rub'
  const cRub = keys.includes('paid') || keys.includes('rub');
  const cBarter = keys.includes('barter');
  const cCert = keys.includes('cert');
  const cMixed = keys.includes('mixed');

  let compensationType = null;
  if (cMixed) compensationType = 'mixed';
  else {
    const comps = [];
    if (cRub) comps.push('rub');
    if (cBarter) comps.push('barter');
    if (cCert) comps.push('cert');
    if (comps.length === 1) compensationType = comps[0];
    else if (comps.length > 1) compensationType = 'mixed';
  }

  return { offerType, compensationType, keys };
}

function bxSmartPrefillText(next, info, totalAll, totalFiltered) {
  const src = info?.keys?.length ? info.keys.join(', ') : '—';
  const typeLine = `Формат: <b>${escapeHtml(bxAnyLabel(next.offerType, 'type'))}</b>`;
  const compLine = `Оплата: <b>${escapeHtml(bxAnyLabel(next.compensationType, 'comp'))}</b>`;

  const ratio = (Number.isFinite(totalAll) && totalAll > 0)
    ? `(${Math.round((totalFiltered / totalAll) * 100)}%)`
    : '';

  const hint = totalFiltered === 0
    ? `

💡 Сейчас <b>0</b> результатов. Попробуй «🎛 Фильтры креаторов» или «♻️ Сбросить» (всё).`
    : '';

  return `🎯 <b>Smart-подбор</b>

Я выставил безопасные фильтры для ленты:
${typeLine}
${compLine}

Категорию <b>не трогаю</b> (всегда «Все»), чтобы не обнулять выдачу.

Результатов в ленте: <b>${totalFiltered}</b> из <b>${totalAll}</b> ${ratio}

<i>Источник: профиль бренда → 🧩 Форматы</i>
<tg-spoiler>${escapeHtml(src)}</tg-spoiler>${hint}`;
}

function bxSmartKb(wsId, opts = {}) {
  const wsNum = Number(wsId || 0);
  const h = normBxHome(opts.h, wsNum ? BX_HOME.BX_OPEN : BX_HOME.MENU);
  return new InlineKeyboard()
    .text('📰 Открыть ленту', `a:bx_feed|ws:${wsId}|p:0|h:${h}`)
    .text('🎛 Фильтры креаторов', `a:bx_filters|ws:${wsId}|p:0|h:${h}|r:bs`)
    .row()
    .text('♻️ Сбросить', `a:bx_smart_reset|ws:${wsId}|h:${h}`)
    .text('📋 Меню', 'a:menu');
}

async function renderBxOpen(ctx, ownerUserId, wsId) {
  // BX cabinet is a navigation home for Back in BX flows
  if (ownerUserId) await setUiHome(ownerUserId, BX_HOME.BX_OPEN);
  const isCurator = ownerUserId ? await db.hasAnyCuratorRole(ownerUserId) : false;
  const wsNum = Number(wsId || 0);
  if (wsNum === 0) {
    const credits = await db.getBrandCredits(ownerUserId);
    const retry = CFG.INTRO_RETRY_ENABLED ? await db.countAvailableBrandRetryCredits(ownerUserId) : 0;
    const planRow = await db.getBrandPlan(ownerUserId);
    const active = await db.isBrandPlanActive(ownerUserId);
    const planName = active ? String(planRow?.brand_plan || 'basic').toLowerCase() : null;
    const plan = { active, name: planName, until: planRow?.brand_plan_until };

    const untilTxt = (active && planRow?.brand_plan_until) ? `
До: <b>${escapeHtml(fmtTs(planRow.brand_plan_until))}</b>` : '';

    await safeEditOrReply(ctx, 
      `🏷 <b>Для брендов</b>

Здесь бренд может работать с UGC/офферами без подключения канала.

${brandPassBalanceLineHtml(credits)}
🎟 Retry-кредиты: <b>${retry}</b>
⭐️ Brand Plan: <b>${active ? (planName === 'max' ? 'Max' : 'Basic') : 'OFF'}</b>${untilTxt}

Выбери действие:`,
      { parse_mode: 'HTML', reply_markup: bxBrandMenuKb(0, credits, plan, retry, { showCurator: isCurator }) }
    );
    return;
  }

  const ws = await db.getWorkspace(ownerUserId, wsNum);
  if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

  if (!ws.network_enabled) {
    await safeEditOrReply(ctx, 
      `🎬 <b>UGC / Офферы</b>

Это лента UGC/Collab офферов: контент, интеграции, бартер/бюджет.

Чтобы видеть ленту и публиковать офферы, включи “🌐 Сеть”.`,
      { parse_mode: 'HTML', reply_markup: bxNeedNetworkKb(wsNum) }
    );
    return;
  }

  await safeEditOrReply(ctx, 
    `🎬 <b>UGC / Офферы</b>

Канал: <b>${escapeHtml(ws.channel_username ? '@' + ws.channel_username : ws.title)}</b>

• Создать офер — твой UGC/оффер увидят бренды в «📰 Лента креаторов»
• 📥 Inbox — переписка по офферам (бренд ↔ блогер)
• 📰 Лента креаторов — посмотреть выдачу глазами бренда
• Мои офферы — пауза/удаление`,
    { parse_mode: 'HTML', reply_markup: bxMenuKb(wsNum, ws.network_enabled, { showCurator: isCurator }) }
  );
}

async function renderBxFeed(ctx, ownerUserId, wsId, page = 0, opts = {}) {
  try {
  const wsNum = Number(wsId || 0);
  if (wsNum !== 0) {
    const ws = await db.getWorkspace(ownerUserId, wsNum);
    if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
    if (!ws.network_enabled) return renderBxOpen(ctx, ownerUserId, wsNum);
  }

  const filter = await getBxFilterScoped(ctx.from.id, ownerUserId, wsNum);
  const h = normBxHome(opts.h, wsNum ? BX_HOME.BX_OPEN : BX_HOME.MENU);


  const limit = CFG.BARTER_FEED_PAGE_SIZE;
  const offset = page * limit;
  const total = await db.countNetworkBarterOffers({
    category: filter.category,
    offerType: filter.offerType,
    compensationType: filter.compensationType,
    goalsTags: filter.goalsTags,
    reqTags: filter.reqTags,
  });
  let rows;
  if (CFG.VERIFICATION_ENABLED) {
    rows = await safeUserVerifications(
      () => db.listNetworkBarterOffersWithVerified({
        category: filter.category,
        offerType: filter.offerType,
        compensationType: filter.compensationType,
        goalsTags: filter.goalsTags,
        reqTags: filter.reqTags,
        limit,
        offset,
      }),
      () => db.listNetworkBarterOffers({
        category: filter.category,
        offerType: filter.offerType,
        compensationType: filter.compensationType,
        goalsTags: filter.goalsTags,
        reqTags: filter.reqTags,
        limit,
        offset,
      })
    );
  } else {
    rows = await db.listNetworkBarterOffers({
      category: filter.category,
      offerType: filter.offerType,
      compensationType: filter.compensationType,
      goalsTags: filter.goalsTags,
      reqTags: filter.reqTags,
      limit,
      offset,
    });
  }

  const featured = await db.listActiveFeatured(CFG.FEATURED_MAX_SLOTS);

  const header = `📰 <b>Лента креаторов</b>
<i>Режим: 🏷 Бренд · Ты ищешь: 🎬 креаторов</i>
<tg-spoiler>Фильтры: ${escapeHtml(bxFilterSummary(filter))}</tg-spoiler>`;

  const featLines = featured.map((f) => {
    const title = (f.title || 'Featured').toString();
    const body = (f.body || '').toString();
    const contact = (f.contact || '').toString();
    const blurb = body ? body.replace(/\s+/g, ' ').slice(0, 90) : '';
    const c = contact ? `
Контакт: <b>${escapeHtml(contact.slice(0, 64))}</b>` : '';
    return `🔥 <b>${escapeHtml(title.slice(0, 64))}</b>${blurb ? `
${escapeHtml(blurb)}${body.length > 90 ? '…' : ''}` : ''}${c}`;
  });

  const offerLines = rows.map((o) => {
    const ch = safeCreatorDisplayName({ title: o.ws_title, channel_username: o.channel_username });
    const metaCounts = offerMetaCountsInline(o.meta);
    const metaSuffix = metaCounts ? ` · ${metaCounts}` : '';
    return `#${o.id} · ${escapeHtml(bxCategoryLabel(o.category))}
<b>${escapeHtml(o.title)}</b>
${escapeHtml(bxTypeLabel(o.offer_type))} · ${escapeHtml(bxCompLabel(o.compensation_type))}${metaSuffix}
Канал: ${escapeHtml(ch)}${o.creator_verified ? ' ✅' : ''}`;
  });

  const text = `${header}

${featLines.length ? `🔥 <b>Featured</b>

${featLines.join('\n\n')}

` : ''}${offerLines.length ? offerLines.join('\n\n') : 'Пока нет офферов по этим фильтрам.'}`;

  const kb = new InlineKeyboard();

  for (const f of featured) {
    kb.text(`🔥 #F${f.id}`, `a:feat_view|ws:${wsNum}|id:${f.id}|p:${page}|h:${h}`).row();
  }
  for (const o of rows) {
    kb.text(`🔎 #${o.id}`, `a:bx_pub|ws:${wsNum}|o:${o.id}|p:${page}|h:${h}`).row();
  }

  const hasPrev = page > 0;
  const hasNext = offset + rows.length < total;
  const nav = bxFeedNavKb(wsNum, page, hasPrev, hasNext, { h });
  for (const row of nav.inline_keyboard) kb.inline_keyboard.push(row);

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
  } catch (e) {
    console.error('[bx_feed]', e);
    await safeEditOrReply(ctx, `⚠️ <b>Ошибка</b>

Не удалось загрузить экран. Нажми «📋 Меню» и попробуй ещё раз.`, {
      parse_mode: 'HTML',
      reply_markup: navKb('a:menu'),
      disable_web_page_preview: true,
    });
  }
}

async function renderBxMy(ctx, ownerUserId, wsId, page = 0) {
  const ws = await db.getWorkspace(ownerUserId, wsId);
  if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
  if (!ws.network_enabled) return renderBxOpen(ctx, ownerUserId, wsId);

  const limit = 8;
  const offset = page * limit;
  const rows = await db.listBarterOffersForOwnerWorkspace(ownerUserId, wsId, limit, offset);

  const kb = new InlineKeyboard();
  kb.text('📁 Архив', `a:bx_my_arch|ws:${wsId}|p:0`).row();
  for (const o of rows) {
    const st = String(o.status || 'ACTIVE').toUpperCase();
    const stEmoji = st === 'ACTIVE' ? '✅' : (st === 'PAUSED' ? '⏸' : '⛔');
    kb
      .text(`${stEmoji} #${o.id} · ${o.title}`, `a:bx_view|ws:${wsId}|o:${o.id}|back:my|p:${page}`)
      .text('🗑', `a:bx_archive|ws:${wsId}|o:${o.id}|p:${page}`)
      .row();
  }
  kbNavRow(kb, `a:bx_open|ws:${wsId}`);

  await safeEditOrReply(ctx, 
    `📦 <b>Мои офферы</b>

Нажми оффер, чтобы открыть. Кнопка 🗑 — архивирует и сразу убирает из списка.`,
    { parse_mode: 'HTML', reply_markup: kb }
  );
}

async function renderBxMyArchive(ctx, ownerUserId, wsId, page = 0) {
  const ws = await db.getWorkspace(ownerUserId, wsId);
  if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
  if (!ws.network_enabled) return renderBxOpen(ctx, ownerUserId, wsId);

  const limit = 8;
  const offset = page * limit;
  const rows = await db.listArchivedBarterOffersForOwnerWorkspace(ownerUserId, wsId, limit, offset);

  const kb = new InlineKeyboard();

  if (!rows.length) {
    kbNavRow(kb, `a:bx_my|ws:${wsId}|p:0`);
    await safeEditOrReply(ctx, 
      `📁 <b>Архив офферов</b>

Пока пусто. Нажми 🗑 в «Мои офферы», чтобы архивировать оффер (он останется в истории).`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
    return;
  }

  for (const o of rows) {
    kb
      .text(`⛔ #${o.id} · ${o.title}`, `a:bx_view|ws:${wsId}|o:${o.id}|back:arch|p:${page}`)
      .text('↩️', `a:bx_restore|ws:${wsId}|o:${o.id}|p:${page}`)
      .row();
  }

  const hasPrev = page > 0;
  const hasNext = rows.length === limit;
  if (hasPrev || hasNext) {
    const nav = new InlineKeyboard();
    if (hasPrev) nav.text('⬅️', `a:bx_my_arch|ws:${wsId}|p:${page - 1}`);
    if (hasNext) nav.text('➡️', `a:bx_my_arch|ws:${wsId}|p:${page + 1}`);
    kb.inline_keyboard.push(nav.inline_keyboard[0]);
  }

  kbNavRow(kb, `a:bx_my|ws:${wsId}|p:0`);

  await safeEditOrReply(ctx, 
    `📁 <b>Архив офферов</b>

Открой оффер, чтобы посмотреть. ↩️ — вернуть в активные.`,
    { parse_mode: 'HTML', reply_markup: kb }
  );
}


function bxMediaLabel(mt) {
  const t = String(mt || '').toLowerCase();
  if (t === 'photo') return '🖼 Фото';
  if (t === 'video') return '🎥 Видео';
  if (t === 'animation') return '🎞 GIF';
  return '—';
}

function bxMediaKb(wsId, offerId, back = 'my', pageOrHasMedia = 0, maybeHasMedia = false) {
  // Backward compatible:
  // - old signature: (wsId, offerId, back, hasMedia)
  // - new signature: (wsId, offerId, back, page, hasMedia)
  let page = 0;
  let hasMedia = false;
  if (typeof pageOrHasMedia === 'boolean') {
    hasMedia = pageOrHasMedia;
  } else {
    page = Math.max(0, Number(pageOrHasMedia || 0));
    hasMedia = Boolean(maybeHasMedia);
  }

  const kb = new InlineKeyboard()
    .text('🖼 Фото', `a:bx_media_photo|ws:${wsId}|o:${offerId}|back:${back}|p:${page}`)
    .text('🎞 GIF', `a:bx_media_gif|ws:${wsId}|o:${offerId}|back:${back}|p:${page}`)
    .row()
    .text('🎥 Видео', `a:bx_media_video|ws:${wsId}|o:${offerId}|back:${back}|p:${page}`)
    .text('👁 Превью', `a:bx_media_preview|ws:${wsId}|o:${offerId}|back:${back}|p:${page}`)
    .row();

  if (hasMedia) {
    kb
      .text('🗑 Убрать', `a:bx_media_clear|ws:${wsId}|o:${offerId}|back:${back}|p:${page}`)
      .text('✅ Готово', `a:bx_view|ws:${wsId}|o:${offerId}|back:${back}|p:${page}`);
  } else {
    kb.text('✅ Готово', `a:bx_view|ws:${wsId}|o:${offerId}|back:${back}|p:${page}`);
  }

  kbNavRow(kb, `a:bx_view|ws:${wsId}|o:${offerId}|back:${back}|p:${page}`);
  return kb;
}

async function renderBxMediaStep(ctx, ownerUserId, wsId, offerId, back = 'my', opts = {}) {
  const { edit = true } = opts;
  const o = await db.getBarterOfferForOwner(ownerUserId, offerId);
  if (!o) {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: 'Нет доступа.' });
    return;
  }

  const hasMedia = !!(o.media_file_id && String(o.media_type || '').trim());
  const text =
`📎 <b>Медиа оффера #${o.id}</b>

Текущее: <b>${escapeHtml(bxMediaLabel(o.media_type))}</b>

ℹ️ Медиа появится в официальном канале только при <b>PAID-размещении</b>.
(Внутри “Мои офферы” медиа не показываем — только в официальной публикации.)

Выбери тип и пришли файл одним сообщением.`;

  const kb = bxMediaKb(wsId, offerId, back, Number(opts.page || 0), hasMedia);
  const send = (text, extra) => safeEditOrReply(ctx, text, extra, Boolean(edit));
  await send(text, { parse_mode: 'HTML', reply_markup: kb });
}

async function sendBxPreview(ctx, ownerUserId, wsId, offerId, back = 'my', page = 0) {
  const o = await db.getBarterOfferForOwner(ownerUserId, offerId);
  if (!o) {
    const kb = navKb('a:menu');
    await safeEditOrReply(ctx, '⚠️ <b>Оффер не найден</b>\n\nНажми «📋 Меню» и открой «🤝 Мои офферы» заново.', { parse_mode: 'HTML', reply_markup: kb });
    return;
  }

  const { text } = await buildOfficialOfferPost(o, { forCaption: true });
  const bPage = Math.max(0, Number(page || 0));
  const backCb = `a:bx_view|ws:${wsId}|o:${offerId}|back:${back}|p:${bPage}`;
  const kb = navKb(backCb);

  const note = `\n\n<b>ℹ️ Превью</b>\n<i>• Это превью — пересылать не нужно\n• Кнопки официального канала появятся при публикации\n• Медиа попадёт в официальный канал только при PAID-размещении</i>`;
  const previewText = `${text}${note}`;

  // UX: превью — это экран (не «мертвое» сообщение). Всегда держим Back/Menu.
  await safeEditOrReply(ctx, previewText, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb });

  // Если у оффера есть медиа — отправляем отдельным сообщением, но навигацию оставляем в текущем экране.
  if (o.media_file_id) {
    try {
      if (String(o.media_type) === 'photo') {
        await ctx.replyWithPhoto(o.media_file_id, { caption: text, parse_mode: 'HTML', reply_markup: kb });
      } else if (String(o.media_type) === 'animation') {
        await ctx.replyWithAnimation(o.media_file_id, { caption: text, parse_mode: 'HTML', reply_markup: kb });
      } else if (String(o.media_type) === 'video') {
        await ctx.replyWithVideo(o.media_file_id, { caption: text, parse_mode: 'HTML', reply_markup: kb });
      }
    } catch (_) {
      // ignore: основной экран превью уже показан
    }
  }
}


async function renderBxView(ctx, ownerUserId, wsId, offerId, back = 'feed', page = 0) {
  const o = await db.getBarterOfferForOwner(ownerUserId, offerId);
  if (!o) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

  const st = String(o.status || 'ACTIVE').toUpperCase();
  const contact = String(o.contact || '').trim();

  const stEmoji = st === 'ACTIVE' ? '🟢' : (st === 'PAUSED' ? '⏸' : (st === 'CLOSED' ? '🗄' : 'ℹ️'));

  let partnerSection = '';
  let partnerBtnLabel = '📁 Папка партнёров';
  if (o.partner_folder_id) {
    try {
      const folder = await db.getChannelFolder(Number(o.partner_folder_id));
      if (folder && Number(folder.workspace_id) === Number(wsId)) {
        const items = await db.listChannelFolderItems(folder.id);
        const shown = items.slice(0, 10).map((i) => i.channel_username).filter(Boolean);
        const moreLine = items.length > shown.length ? `
… и ещё ${items.length - shown.length}` : '';
        const safeTitle = escapeHtml(String(folder.title || '').slice(0, 40));
        const shownList = shown.map((x) => escapeHtml(String(x))).join('\n');
        partnerSection = `<b>Партнёры</b>
• Папка: “${safeTitle}” (<b>${items.length}</b>)
${shownList ? `<code>${shownList}</code>` : '<i>Папка пустая</i>'}${moreLine}`;
        partnerBtnLabel = `📁 Папка: ${String(folder.title || '').slice(0, 18)} (${items.length})`;
      }
    } catch (_) {
      // ignore
    }
  }

  const m = parseOfferMeta(o.meta);
  const tagLines = [];
  if (m.goals_tags.length) {
    const g = brandTagsPreviewPretty(m.goals_tags, BRAND_GOALS_TAGS, 8);
    tagLines.push(`• 🎯 Цели: <code>${escapeHtml(g)}</code>`);
  }
  if (m.req_tags.length) {
    const r = brandTagsPreviewPretty(m.req_tags, BRAND_REQ_TAGS, 8);
    tagLines.push(`• 📎 Требования: <code>${escapeHtml(r)}</code>`);
  }
  const tagsBlock = tagLines.length ? `<b>Теги</b>
${tagLines.join('\n')}

` : '';

  const paramsLines = [
    `• Категория: <b>${escapeHtml(bxCategoryLabel(o.category))}</b>`,
    `• Формат: <b>${escapeHtml(bxTypeLabel(o.offer_type))}</b>`,
    `• Оплата: <b>${escapeHtml(bxCompLabel(o.compensation_type))}</b>`,
    `• Медиа: <b>${escapeHtml(bxMediaLabel(o.media_type))}</b>`,
  ];

  const title = String(o.title || '').trim();
  const desc = String(o.description || '').trim();

  const text =
`🤝 <b>Оффер #${o.id}</b>

<b>${escapeHtml(title || '—')}</b>

<b>Статус</b>
• ${stEmoji} <b>${escapeHtml(st)}</b>

<b>Параметры</b>
${paramsLines.join('\n')}

${tagsBlock}<b>Описание</b>
${escapeHtml(desc || '—')}${partnerSection ? `

${partnerSection}` : ''}${contact ? `

<b>Контакт</b>
• <b>${escapeHtml(contact)}</b>` : ''}`;

  const kb = new InlineKeyboard();
  if (st === 'ACTIVE') {
    kb.text('⬆️ Поднять', `a:bx_bump|ws:${wsId}|o:${o.id}`).row();

    kb.text(partnerBtnLabel, `a:bx_partner_folder_pick|ws:${wsId}|o:${o.id}`).row();
    kb.text('📎 Медиа', `a:bx_media_step|ws:${wsId}|o:${o.id}|back:${back}|p:${page}`)
      .text('👁 Превью', `a:bx_media_preview|ws:${wsId}|o:${o.id}|back:${back}|p:${page}`)
      .row();

    if (CFG.OFFICIAL_PUBLISH_ENABLED) {
      kb.text('📣 Офиц.канал', `a:off_manage|ws:${wsId}|o:${o.id}|p:${page}|back:${back}`).row();
    }

    const wsInfo = await db.getWorkspace(ownerUserId, wsId);
    const isPro = await db.isWorkspacePro(wsId);
    if (isPro) {
      const pinnedId = wsInfo.pro_pinned_offer_id ? Number(wsInfo.pro_pinned_offer_id) : null;
      if (pinnedId === Number(o.id)) {
        kb.text('📌 Снять пин', `a:bx_pin_clear|ws:${wsId}|o:${o.id}`).row();
      } else {
        kb.text('📌 Закрепить в ленте', `a:bx_pin_set|ws:${wsId}|o:${o.id}`).row();
      }
    }
  }
  if (st === 'PAUSED') {
    if (CFG.OFFICIAL_PUBLISH_ENABLED) {
      kb.text('📣 Офиц.канал', `a:off_manage|ws:${wsId}|o:${o.id}|p:${page}|back:${back}`).row();
    }
  }

  if (st === 'CLOSED') {
    kb.text('↩️ Восстановить', `a:bx_restore|ws:${wsId}|o:${o.id}|p:${page}`).row();
  } else if (st === 'ACTIVE') {
    kb.text('⏸ Пауза', `a:bx_pause|ws:${wsId}|o:${o.id}`)
      .text('🗄 В архив', `a:bx_del_q|ws:${wsId}|o:${o.id}|p:${page}`)
      .row();
  } else if (st === 'PAUSED') {
    kb.text('✅ Возобновить', `a:bx_resume|ws:${wsId}|o:${o.id}`)
      .text('🗄 В архив', `a:bx_del_q|ws:${wsId}|o:${o.id}|p:${page}`)
      .row();
  } else {
    kb.text('🗄 В архив', `a:bx_del_q|ws:${wsId}|o:${o.id}|p:${page}`).row();
  }


  const shareUrl = offerShareUrl(o.id, title, desc);
  if (shareUrl) kb.url('🔗 Поделиться', shareUrl).row();

  const bPage = Math.max(0, Number(page) || 0);
  const backCb = back === 'my'
    ? `a:bx_my|ws:${wsId}|p:${bPage}`
    : (back === 'arch' ? `a:bx_my_arch|ws:${wsId}|p:${bPage}` : `a:bx_feed|ws:${wsId}|p:${bPage}|h:bo`);
  kbNavRow(kb, backCb);

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
}



async function renderBxFilters(ctx, ownerUserId, wsId, page = 0, opts = {}) {
  try {
  const wsNum = Number(wsId || 0);
  if (wsNum !== 0) {
    const ws = await db.getWorkspace(ownerUserId, wsNum);
    if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
    if (!ws.network_enabled) return renderBxOpen(ctx, ownerUserId, wsNum);
  }

  const f = await getBxFilterScoped(ctx.from.id, ownerUserId, wsNum);
  const text = `🎛 <b>Фильтры креаторов</b>
<i>Режим: 🏷 Бренд · Ты ищешь: 🎬 креаторов</i>
<i>Фильтруем креаторов по тому, что они указали в оффере.</i>
<i>Для тегов: совпадение по любому из выбранных.</i>

${escapeHtml(bxFilterSummary(f))}

<i>Настройки применяются к ленте сразу. Нажми «📋 Показать креаторов», чтобы увидеть выдачу.</i>`;
  await safeEditOrReply(ctx, text, {
    parse_mode: 'HTML',
    reply_markup: bxFiltersKb(wsNum, f, page, opts)
  });
  } catch (e) {
    console.error('[bx_filters]', e);
    await safeEditOrReply(ctx, `⚠️ <b>Ошибка</b>

Не удалось загрузить экран. Нажми «📋 Меню» и попробуй ещё раз.`, {
      parse_mode: 'HTML',
      reply_markup: navKb('a:menu'),
      disable_web_page_preview: true,
    });
  }
}

async function renderBxFilterPick(ctx, ownerUserId, wsId, key, retPage = 0, pickPage = 0, opts = {}) {
  try {
  const wsNum = Number(wsId || 0);
  if (wsNum !== 0) {
    const ws = await db.getWorkspace(ownerUserId, wsNum);
    if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
    if (!ws.network_enabled) return renderBxOpen(ctx, ownerUserId, wsNum);
  }

  const title = key === 'cat' ? 'Категория' : (key === 'type' ? 'Формат' : 'Оплата');
  const f = await getBxFilterScoped(ctx.from.id, ownerUserId, wsNum);

  const selectedValue = key === 'cat' ? f.category : (key === 'type' ? f.offerType : f.compensationType);

  const hint =
    key === 'cat' ? 'По категории оффера креатора.' :
    key === 'type' ? 'По формату оффера креатора.' :
    'По оплате в оффере креатора.';

  const cur =
    key === 'cat' ? bxAnyLabel(f.category, 'cat') :
    key === 'type' ? bxAnyLabel(f.offerType, 'type') :
    bxAnyLabel(f.compensationType, 'comp');

  const text = `🎛 <b>${title}</b>
<i>${escapeHtml(hint)}</i>

Текущее: <b>${escapeHtml(cur)}</b>

Выбери значение:`;

  await safeEditOrReply(ctx, text, {
    parse_mode: 'HTML',
    reply_markup: bxPickKb(wsNum, key, selectedValue, retPage, pickPage, opts),
    disable_web_page_preview: true
  });
  } catch (e) {
    console.error('[bx_filter_pick]', e);
    await safeEditOrReply(ctx, `⚠️ <b>Ошибка</b>

Не удалось загрузить экран. Нажми «📋 Меню» и попробуй ещё раз.`, {
      parse_mode: 'HTML',
      reply_markup: navKb('a:menu'),
      disable_web_page_preview: true,
    });
  }
}

async function renderBxFilterMultiPick(ctx, ownerUserId, wsId, key, page = 0, opts = {}) {
  try {
  const wsNum = Number(wsId || 0);
  if (wsNum !== 0) {
    const ws = await db.getWorkspace(ownerUserId, wsNum);
    if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
    if (!ws.network_enabled) return renderBxOpen(ctx, ownerUserId, wsNum);
  }

  const f = await getBxFilterScoped(ctx.from.id, ownerUserId, wsNum);
  const title = key === 'goals' ? '🎯 Цели' : '📎 Требования';
  const hint = key === 'goals'
    ? 'Фильтруем креаторов по целям в их оффере.'
    : 'Фильтруем креаторов по условиям/требованиям в их оффере.';

  const cur = key === 'goals'
    ? bxTagsLabel(f.goalsTags, 'goals')
    : bxTagsLabel(f.reqTags, 'req');

  const text = `🎛 <b>${escapeHtml(title)}</b>
<i>${escapeHtml(hint)}</i>
<i>Совпадение: любой из выбранных тегов.</i>

Текущее: <b>${escapeHtml(cur)}</b>

Выбери теги (можно несколько):`;

  const sel = key === 'goals' ? f.goalsTags : f.reqTags;
  await safeEditOrReply(ctx, text, {
    parse_mode: 'HTML',
    reply_markup: bxMultiPickKb(wsNum, key, sel, page, opts),
    disable_web_page_preview: true
  });
  } catch (e) {
    console.error('[bx_filter_mpick]', e);
    await safeEditOrReply(ctx, `⚠️ <b>Ошибка</b>

Не удалось загрузить экран. Нажми «📋 Меню» и попробуй ещё раз.`, {
      parse_mode: 'HTML',
      reply_markup: navKb('a:menu'),
      disable_web_page_preview: true,
    });
  }
}

async function renderBxPublicView(ctx, userId, wsId, offerId, page = 0, opts = {}) {
  const o = CFG.VERIFICATION_ENABLED
    ? await safeUserVerifications(() => db.getBarterOfferPublicWithVerified(offerId), () => db.getBarterOfferPublic(offerId))
    : await db.getBarterOfferPublic(offerId);

  const fail = async (msg) => {
    if (ctx.callbackQuery) return ctx.answerCallbackQuery({ text: msg, show_alert: true });
    return ctx.reply(msg);
  };

  if (!o) return fail('Оффер не найден.');
  if (String(o.status || '').toUpperCase() !== 'ACTIVE') return fail('Оффер закрыт.');
  if (!o.network_enabled) return fail('Оффер вне сети.');

  const isOwner = Number(o.owner_user_id) === Number(userId);
  const ch = safeCreatorDisplayName({ title: o.ws_title, channel_username: o.channel_username });
  const contactRaw = (o.contact || '').trim();
  const contact = isOwner ? contactRaw : '';
  const hasContact = Boolean(contactRaw);

  let partnerBlock = '';
  if (o.partner_folder_id) {
    try {
      const folder = await db.getChannelFolder(Number(o.partner_folder_id));
      if (folder && Number(folder.workspace_id) === Number(wsId)) {
        const items = await db.listChannelFolderItems(folder.id);
        const safeTitle = escapeHtml(String(folder.title || '').slice(0, 40));
        if (isOwner) {
          const shown = items.slice(0, 10).map((i) => i.channel_username);
          const more = items.length > shown.length ? `\n… и ещё ${items.length - shown.length}` : '';
          partnerBlock = `\n\nПартнёры (папка “${safeTitle}”, ${items.length}):\n${shown.map((x) => escapeHtml(x)).join('\n')}${more}`;
        } else {
          partnerBlock = `\n\nПартнёры (папка “${safeTitle}”, ${items.length}).`;
        }
      }
    } catch (_) {}
  }

  const metaLines = offerMetaLinesHtml(o.meta);

  const text =
    `🤝 <b>Оффер #${o.id}</b>\n\n` +
    `Категория: <b>${escapeHtml(bxCategoryLabel(o.category))}</b>\n` +
    `Формат: <b>${escapeHtml(bxTypeLabel(o.offer_type))}</b>\n` +
    `Оплата: <b>${escapeHtml(bxCompLabel(o.compensation_type))}</b>\n\n` +
    `${metaLines ? `${metaLines}\n\n` : ''}` +
    `<b>${escapeHtml(o.title)}</b>\n\n` +
    `${escapeHtml(o.description)}${partnerBlock}\n\n` +
    `Канал: <b>${escapeHtml(ch)}${o.creator_verified ? ' ✅' : ''}</b>\n` +
    `${isOwner ? (contact ? `Контакт: <b>${escapeHtml(contact)}</b>\n` : '') : (hasContact ? `Контакты: <b>🔒 скрыты</b>\n` : '')}` +
    `\nЕсли бот не может проверить каналы — попроси админа добавить бота в канал-спонсор.`;

  const h = normBxHome(opts.h, Number(wsId || 0) ? BX_HOME.BX_OPEN : BX_HOME.MENU);

  const kb = new InlineKeyboard().text('💬 Написать', `a:bx_msg|ws:${wsId}|o:${offerId}|p:${page}|h:${h}`);

  let canOfficial = false;
  if (CFG.OFFICIAL_PUBLISH_ENABLED) {
    try {
      canOfficial = isOwner || (await isModerator({ id: userId }, ctx.from?.id));
    } catch {
      canOfficial = isOwner;
    }
  }

  if (canOfficial) {
    const cb = isOwner
      ? `a:off_manage|ws:${wsId}|o:${offerId}|p:${page}|back:my`
      : `a:off_manage|ws:${wsId}|o:${offerId}|p:${page}|h:${h}`;
    kb.row().text('📣 Офиц.канал', cb);
  }

  kb.row().text('🚩 Жалоба', `a:bx_report_offer|ws:${wsId}|o:${offerId}|p:${page}|h:${h}`);
  // Back: for non-owners this wsId feed is inaccessible; send them to Brand Mode feed
  const backCb = isOwner ? `a:bx_my|ws:${wsId}|p:0` : `a:bx_feed|ws:0|p:0|h:${h}`;
  kbNavRow(kb, backCb);

  const send = (text, extra) => safeEditOrReply(ctx, text, extra, true);
  await send(text, { parse_mode: 'HTML', reply_markup: kb });
}

// -----------------------------
// Official channel publishing (barter offers)
// -----------------------------

function offerDeepLink(offerId) {
  const u = String(CFG.BOT_USERNAME || '').trim();
  if (!u) return '';
  return `https://t.me/${u}?start=bxo_${offerId}`;
}


function offerShareUrl(offerId, title = '', description = '') {
  const link = offerDeepLink(offerId);
  if (!link) return '';
  const t = String(title || '').trim();
  const d = String(description || '').trim();
  let text = t || 'Оффер';
  if (d) text += `

${truncateText(d, 280)}`;
  // Opens Telegram share sheet (pick chat/contact) with prefilled text+link
  return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
}

function truncateText(s, maxLen = 800) {
  const txt = String(s || '').trim();
  const cps = Array.from(txt);
  if (cps.length <= maxLen) return txt;
  const keep = Math.max(0, Number(maxLen) - 1);
  return cps.slice(0, keep).join('') + '…';
}

async function safeOfficialPosts(primaryFn, fallbackFn) {
  try {
    return await primaryFn();
  } catch (e) {
    if (isMissingRelationError(e, 'official_posts')) {
      return await fallbackFn();
    }
    throw e;
  }
}

async function notifyOfficialQueueAdmins(api, input = {}) {
  try {
    const admins = Array.isArray(CFG.SUPER_ADMIN_TG_IDS) ? CFG.SUPER_ADMIN_TG_IDS : [];
    if (!admins.length) return { sent: 0, skipped: 'no_admins' };

    const offerId = Number(input.offerId || 0);
    const wsId = Number(input.wsId || 0);
    if (!offerId) return { sent: 0, skipped: 'no_offer' };

    const kind = String(input.kind || 'queue').toLowerCase(); // paid | manual | queue
    const rl = await rateLimit(k(['notify', 'offq', offerId, kind]), { limit: 1, windowSec: 10 * 60 });
    if (!rl.allowed) return { sent: 0, skipped: 'rate_limited' };

    const offerTitle = String(input.offerTitle || '').trim();
    const wsTitle = String(input.wsTitle || '').trim();
    const channelUsername = String(input.channelUsername || '').trim();

    const fromTag = String(input.fromTag || '').trim();
    const days = input.days ? Number(input.days) : null;
    const paymentId = input.paymentId ? Number(input.paymentId) : null;

    const head = kind === 'paid'
      ? '💳 <b>OFFICIAL: оплата за слот</b>'
      : '📝 <b>OFFICIAL: заявка в очередь</b>';

    const offerLine = offerTitle ? `#${offerId} · ${escapeHtml(offerTitle.slice(0, 64))}` : `#${offerId}`;
    const wsLine = channelUsername
      ? `Канал: <b>@${escapeHtml(channelUsername.replace(/^@/, ''))}</b>`
      : (wsTitle ? `Канал: <b>${escapeHtml(wsTitle.slice(0, 80))}</b>` : '');

    const meta = [];
    if (days) meta.push(`Слот: <b>${days}д</b>`);
    if (paymentId) meta.push(`PaymentId: <code>${paymentId}</code>`);
    if (fromTag) meta.push(`От: <b>${escapeHtml(fromTag)}</b>`);

    const lines = [];
    lines.push(head, '');
    lines.push(`Оффер: <b>${offerLine}</b>`);
    if (wsLine) lines.push(wsLine);
    if (meta.length) {
      lines.push('');
      for (const x of meta) lines.push(x);
    }
    lines.push('', '<i>Действия: открыть карточку или опубликовать.</i>');
    const text = lines.join('\\n');

    const kb = new InlineKeyboard();
    if (wsId) kb.text('✅ Опубликовать', `a:off_pub|ws:${wsId}|o:${offerId}|p:0`).row();
    if (wsId) kb.text('📣 Карточка', `a:off_manage|ws:${wsId}|o:${offerId}|p:0`);
    kb.text('📋 Очередь', 'a:off_queue|p:0');

    let sent = 0;
    for (const a of admins) {
      const res = await sendMessageWithFallback(api, a, text, { parse_mode: 'HTML', reply_markup: kb });
      if (res && res.ok) sent += 1;
    }
    return { sent };
  } catch (e) {
    return { sent: 0, error: String(e?.message || e) };
  }
}



async function buildOfficialOfferPost(offerRow, opts = {}) {
  const forCaption = Boolean(opts.forCaption);

  const offerId = Number(offerRow.id);
  const ch = offerRow.channel_username ? `@${offerRow.channel_username}` : (offerRow.ws_title || 'канал');
  const contact = (offerRow.contact || '').trim();
  const link = offerDeepLink(offerId);

  const title = escapeHtml(String(offerRow.title || ''));
  const desc = escapeHtml(truncateText(offerRow.description || '', forCaption ? 520 : 900));
  const cat = escapeHtml(bxCategoryLabel(offerRow.category));
  const fmt = escapeHtml(bxTypeLabel(offerRow.offer_type));
  const comp = escapeHtml(bxCompLabel(offerRow.compensation_type));
  const metaLines = offerMetaLinesHtml(offerRow.meta);

  const text =
    `🤝 <b>Коллабка</b> · оффер #${offerId}

` +
    `Категория: <b>${cat}</b>
` +
    `Формат: <b>${fmt}</b>
` +
    `Оплата: <b>${comp}</b>

` +
    `${metaLines ? `${metaLines}

` : ''}` +
    `<b>${title}</b>

` +
    `${desc}

` +
    `Канал: <b>${escapeHtml(ch)}${offerRow.creator_verified ? ' ✅' : ''}</b>
` +
    `${contact ? `Контакт: <b>${escapeHtml(contact)}</b>
` : ''}` +
    `${link ? `
Открыть в боте: ${escapeHtml(link)}` : ''}`;

  const kb = new InlineKeyboard();
  if (link) kb.url('🚀 Открыть оффер', link);
  return { text, kb };
}

async function publishOfferToOfficialChannel(api, offerId, opts = {}) {
  if (!CFG.OFFICIAL_PUBLISH_ENABLED) throw new Error('OFFICIAL_PUBLISH_ENABLED=false');

  const channelId = Number(CFG.OFFICIAL_CHANNEL_ID || 0);
  if (!channelId) throw new Error('OFFICIAL_CHANNEL_ID is missing');

  // Normalize placement type.
  const placementRaw = String(opts.placementType || 'MANUAL').toUpperCase();
  const keepExpiry = !!opts.keepExpiry;

  // Existing DB record (if any).
  const existing = await safeOfficialPosts(() => db.getOfficialPostByOfferId(offerId), async () => null);
  let placementType = placementRaw;
  if (placementType === 'UPDATE') {
    placementType = existing?.placement_type ? String(existing.placement_type).toUpperCase() : 'MANUAL';
  }
  if (!['MANUAL', 'PAID'].includes(placementType)) placementType = 'MANUAL';

  const offer = CFG.VERIFICATION_ENABLED
    ? await safeUserVerifications(() => db.getBarterOfferPublicWithVerified(offerId), () => db.getBarterOfferPublic(offerId))
    : await db.getBarterOfferPublic(offerId);

  if (!offer) throw new Error('Offer not found');
  if (String(offer.status || '').toUpperCase() !== 'ACTIVE') throw new Error('Offer is not active');
  if (!offer.network_enabled) throw new Error('Offer is not in network');

  // Slot params
  const defaultDays = Math.max(1, Number(CFG.OFFICIAL_MANUAL_DEFAULT_DAYS || 3));
  const days = Math.max(
    1,
    Number(opts.days || existing?.slot_days || defaultDays)
  );

  // Expiry: keep existing if asked, otherwise (re)compute.
  let slotExpiresAt = null;
  if (keepExpiry && existing?.slot_expires_at) {
    try { slotExpiresAt = new Date(existing.slot_expires_at).toISOString(); } catch { slotExpiresAt = null; }
  }
  if (!slotExpiresAt) slotExpiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const paymentId = opts.paymentId ? Number(opts.paymentId) : (existing?.payment_id ? Number(existing.payment_id) : null);
  const publishedByUserId = opts.publishedByUserId ? Number(opts.publishedByUserId) : null;

  // Build message
  const hasMedia = !!(offer.media_file_id && String(offer.media_type || '').trim());
  const built = await buildOfficialOfferPost(offer, { forCaption: hasMedia });
  const text = built.text;
  const replyMarkup = built.kb;

  const isActive = String(existing?.status || '').toUpperCase() === 'ACTIVE' && existing?.message_id;
  let messageId = isActive ? Number(existing.message_id) : null;

  async function tryEditExisting() {
    if (!messageId) return false;
    // Try both (text vs media).
    try {
      await api.editMessageText(channelId, messageId, text, { parse_mode: 'HTML', reply_markup: replyMarkup });
      return true;
    } catch {}
    try {
      await api.editMessageCaption(channelId, messageId, { caption: text, parse_mode: 'HTML', reply_markup: replyMarkup });
      return true;
    } catch {}
    return false;
  }

  const edited = await tryEditExisting();
  if (!edited) {
    // Send new message
    let sent;
    const mt = String(offer.media_type || '').toLowerCase();
    const fid = String(offer.media_file_id || '').trim();

    if (hasMedia && fid) {
      if (mt === 'photo') {
        sent = await api.sendPhoto(channelId, fid, { caption: text, parse_mode: 'HTML', reply_markup: replyMarkup });
      } else if (mt === 'video') {
        sent = await api.sendVideo(channelId, fid, { caption: text, parse_mode: 'HTML', reply_markup: replyMarkup });
      } else if (mt === 'animation' || mt === 'gif') {
        sent = await api.sendAnimation(channelId, fid, { caption: text, parse_mode: 'HTML', reply_markup: replyMarkup });
      } else {
        sent = await api.sendMessage(channelId, text, { parse_mode: 'HTML', reply_markup: replyMarkup });
      }
    } else {
      sent = await api.sendMessage(channelId, text, { parse_mode: 'HTML', reply_markup: replyMarkup });
    }

    const newId = sent?.message_id ? Number(sent.message_id) : null;
    if (!newId) throw new Error('Failed to publish: missing message_id');

    // Remove old message (best-effort) if it existed.
    if (messageId && newId !== messageId) {
      try { await api.deleteMessage(channelId, messageId); } catch {}
    }
    messageId = newId;
  }

  // Persist ACTIVE post record
  await safeOfficialPosts(
    () => db.setOfficialPostActive(offerId, {
      channelChatId: channelId,
      messageId,
      placementType,
      paymentId,
      slotDays: days,
      slotExpiresAt,
      publishedByUserId
    }),
    async () => null
  );

  // If this was a paid placement, mark payment as "applied" (best-effort).
  if (placementType === 'PAID' && paymentId && publishedByUserId) {
    try {
      await db.markPaymentApplied(paymentId, publishedByUserId, `official_publish:${offerId}`);
    } catch {
      // ignore
    }
  }

  return { ok: true, messageId, placementType, days, slotExpiresAt };
}



async function removeOfficialOfferPost(api, offerId, reason = 'REMOVED') {
  const existing = await safeOfficialPosts(() => db.getOfficialPostByOfferId(offerId), async () => null);
  if (!existing) return { removed: false };
  const channelId = Number(existing.channel_chat_id || 0);
  const msgId = Number(existing.message_id || 0);
  if (channelId && msgId) {
    try {
      const text = reason === 'EXPIRED'
        ? '⌛️ Размещение истекло.'
        : '📴 Размещение снято.';
      try {
        await api.editMessageText(channelId, msgId, text, { parse_mode: 'HTML' });
      } catch (_) {
        try { await api.editMessageCaption(channelId, msgId, { caption: text, parse_mode: 'HTML' }); } catch (_) {}
      }
    } catch (_) {}
  }

  await safeOfficialPosts(
    () => db.setOfficialPostStatus(offerId, reason, { lastError: null }),
    async () => null,
  );

  return { removed: true };
}

async function renderOfficialManageView(ctx, userId, wsId, offerId, page = 0, back = '') {
  if (!CFG.OFFICIAL_PUBLISH_ENABLED) {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: 'Официальный канал выключен.', show_alert: true });
    return;
  }

  const offer = CFG.VERIFICATION_ENABLED
    ? await safeUserVerifications(() => db.getBarterOfferPublicWithVerified(offerId), () => db.getBarterOfferPublic(offerId))
    : await db.getBarterOfferPublic(offerId);

  if (!offer) {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: 'Оффер не найден.', show_alert: true });
    return;
  }

  const isOwner = Number(offer.owner_user_id) === Number(userId);
  const isMod = await isModerator({ id: userId }, ctx.from?.id);
  if (!isOwner && !isMod) {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: 'Нет доступа.', show_alert: true });
    return;
  }

  const post = await safeOfficialPosts(() => db.getOfficialPostByOfferId(offerId), async () => null);
  const st = String(post?.status || 'NONE').toUpperCase();

  const statusLabel = {
    NONE: '—',
    PENDING: '⏳ Pending',
    ACTIVE: '✅ Active',
    REMOVED: '📴 Removed',
    EXPIRED: '⌛️ Expired',
    ERROR: '⚠️ Error',
  }[st] || st;

  const expiresLine = post?.slot_expires_at ? `
Слот до: <b>${escapeHtml(new Date(post.slot_expires_at).toLocaleString('ru-RU'))}</b>` : '';
  const mode = String(CFG.OFFICIAL_PUBLISH_MODE || 'manual').toLowerCase();

  const rawU = String(CFG.OFFICIAL_CHANNEL_USERNAME || '').trim();
  const chU = rawU.replace(/^@/, '');
  const chHandle = chU ? `@${chU}` : String(CFG.OFFICIAL_CHANNEL_ID || '').trim();
  const chUrl = chU ? `https://t.me/${chU}` : '';

  const modeHint = mode === 'paid'
    ? 'paid — слот покупается за Stars, модератор публикует.'
    : (mode === 'manual'
      ? 'manual — заявка в очередь, модератор публикует.'
      : (mode === 'mixed' ? 'mixed — можно заявкой или покупкой за Stars.' : ''));

  const pricesLine = (mode === 'paid' || mode === 'mixed')
    ? OFFICIAL_DURATIONS.map((d) => `${d.label}: ${d.price} Stars`).join(' · ')
    : '';
  const pricesBlock = pricesLine ? `

Тарифы: <b>${escapeHtml(pricesLine)}</b>` : '';

  const chHtml = chUrl ? `<a href="${escapeHtml(chUrl)}">${escapeHtml(chHandle)}</a>` : escapeHtml(chHandle);

  const text = `📣 <b>Официальный канал</b>

Оффер: <b>#${offerId}</b>
Статус: <b>${escapeHtml(statusLabel)}</b>${expiresLine}

Режим: <b>${escapeHtml(mode)}</b>
<i>${escapeHtml(modeHint)}</i>
Канал: <b>${chHtml}</b>${pricesBlock}`;

  const kb = new InlineKeyboard();

  if (chUrl) kb.url('📢 Открыть канал', chUrl).row();


  const canRequest = isOwner && (mode === 'manual' || mode === 'mixed');
  if (canRequest) {
    if (st === 'PENDING') {
      kb.text('⏳ В очереди (отменить)', `a:off_req_cancel|ws:${wsId}|o:${offerId}|p:${page}|back:${back}`).row();
    } else if (st !== 'ACTIVE') {
      kb.text('📝 В очередь публикаций', `a:off_req_home|ws:${wsId}|o:${offerId}|p:${page}|back:${back}`).row();
    }
  }

  if (isOwner && (mode === 'paid' || mode === 'mixed')) {
    kb.text('💳 Купить размещение', `a:off_buy_home|ws:${wsId}|o:${offerId}|p:${page}|back:${back}`).row();
  }
  const canPublishManual = isMod && (mode === 'manual' || mode === 'mixed');
  // Commit F: in paid mode allow publish only if there is a paid PENDING record
  const canPublishPaid = isMod && (mode === 'paid' || mode === 'mixed') && st === 'PENDING' && post?.payment_id;
  if (canPublishManual || canPublishPaid) {
    kb.text('✅ Опубликовать сейчас', `a:off_pub|ws:${wsId}|o:${offerId}|p:${page}|back:${back}`).row();
  }

  if (isMod && st === 'ACTIVE') {
    kb.text('♻️ Обновить пост', `a:off_upd|ws:${wsId}|o:${offerId}|p:${page}|back:${back}`).row();
  }

  if (isMod && (st === 'ACTIVE' || st === 'PENDING')) {
    kb.text('🗑 Снять', `a:off_rm|ws:${wsId}|o:${offerId}|p:${page}|back:${back}`).row();
  }

  const backSafe = String(back || '').trim();
  const backToOfferCb = (backSafe === 'my' || backSafe === 'arch' || backSafe === 'feed')
    ? `a:bx_view|ws:${wsId}|o:${offerId}|back:${backSafe}|p:${page}`
    : `a:bx_pub|ws:${wsId}|o:${offerId}|p:${page}|h:bo`;
  kb.text('⬅️ Назад к офферу', backToOfferCb);

  const send = (text, extra) => safeEditOrReply(ctx, text, extra, true);
  await send(text, { parse_mode: 'HTML', reply_markup: kb });
}


async function renderOfficialRequestHome(ctx, userId, wsId, offerId, page = 0, back = '') {
  if (!CFG.OFFICIAL_PUBLISH_ENABLED) {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: 'Официальный канал выключен.', show_alert: true });
    return;
  }
  const mode = String(CFG.OFFICIAL_PUBLISH_MODE || 'manual').toLowerCase();
  if (!(mode === 'manual' || mode === 'mixed')) {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: 'Очередь доступна только в manual/mixed.', show_alert: true });
    return;
  }

  const offer = await db.getBarterOfferPublic(offerId);
  if (!offer) {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: 'Оффер не найден.', show_alert: true });
    return;
  }

  const isOwner = Number(offer.owner_user_id) === Number(userId);
  const isMod = await isModerator({ id: userId }, ctx.from?.id);

  // Allow owner (or moderator) to create a PENDING draft.
  if (!isOwner && !isMod) {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: 'Нет доступа.', show_alert: true });
    return;
  }

  const defaultDays = Math.max(1, Number(CFG.OFFICIAL_MANUAL_DEFAULT_DAYS || 3));

  const text = `📝 <b>Заявка в официальный канал</b>

Оффер: <b>#${offerId}</b>

Выбери длительность слота (можно потом продлить/перепостить):

• 1 день — быстрый тест
• 7 дней — нормальный слот
• 30 дней — “топ‑слот”`;

  const kb = new InlineKeyboard()
    .text(`🕒 1 день`, `a:off_req|ws:${wsId}|o:${offerId}|days:1|p:${page}|back:${back}`)
    .text(`📅 7 дней`, `a:off_req|ws:${wsId}|o:${offerId}|days:7|p:${page}|back:${back}`)
    .row()
    .text(`🏆 30 дней`, `a:off_req|ws:${wsId}|o:${offerId}|days:30|p:${page}|back:${back}`)
    .row()
    .text(`⚙️ По умолчанию (${defaultDays}д)`, `a:off_req|ws:${wsId}|o:${offerId}|days:${defaultDays}|p:${page}`)
    .row()
    .text('⬅️ Назад', `a:off_manage|ws:${wsId}|o:${offerId}|p:${page}|back:${back}`)
    .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');

  if (ctx.callbackQuery) await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
  else await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
}



async function renderOfficialBuyHome(ctx, userId, wsId, offerId, page = 0, back = '') {
  const mode = String(CFG.OFFICIAL_PUBLISH_MODE || 'manual').toLowerCase();
  if (!(mode === 'paid' || mode === 'mixed')) {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: 'Покупка размещения выключена.', show_alert: true });
    return;
  }

  const offer = await db.getBarterOfferPublic(offerId);
  if (!offer) {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: 'Оффер не найден.', show_alert: true });
    return;
  }
  const isOwner = Number(offer.owner_user_id) === Number(userId);
  if (!isOwner) {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: 'Только владелец канала может купить слот.', show_alert: true });
    return;
  }

  const text = `💳 <b>Размещение в официальном канале</b>

Оффер #${offerId}

Выбери срок слота:`;

  const kb = new InlineKeyboard();
  for (const d of OFFICIAL_DURATIONS) {
    kb.text(`⭐ ${d.label} · ${d.price} Stars`, `a:off_buy|ws:${wsId}|o:${offerId}|dur:${d.id}|p:${page}|back:${back}`).row();
  }
  kbNavRow(kb, `a:off_manage|ws:${wsId}|o:${offerId}|p:${page}|back:${back}`);

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
}

async function renderOfficialQueue(ctx, userId, page = 0) {
  const isMod = await isModerator({ id: userId }, ctx.from?.id);
  if (!isMod) {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: 'Нет доступа.', show_alert: true });
    return;
  }

  const limit = 8;
  const offset = page * limit;

  const total = await safeOfficialPosts(() => db.countOfficialPending(), async () => 0);
  const rows = await safeOfficialPosts(() => db.listOfficialPending(limit, offset), async () => []);

  const text = `📣 <b>Офиц.канал: очередь</b>

Pending: <b>${total}</b>${total ? '' : '\n\nПока пусто.'}`;
  const kb = new InlineKeyboard();

  for (const r of rows) {
    const icon = String(r.placement_type || '').toUpperCase() === 'PAID' ? '💳' : '📝';
    const days = r.slot_days ? ` · ${r.slot_days}д` : '';
    const title = escapeHtml(String(r.offer_title || '').slice(0, 35));
    const line = `${icon} #${r.offer_id}${days} · ${title}`;
    kb.text(line, `a:off_manage|ws:${r.workspace_id}|o:${r.offer_id}|p:0`).row();
  }

  const hasPrev = page > 0;
  const hasNext = rows.length >= limit;
  if (hasPrev) kb.text('⬅️', `a:off_queue|p:${page - 1}`);
  if (hasNext) kb.text('➡️', `a:off_queue|p:${page + 1}`);
  if (hasPrev || hasNext) kb.row();
  kb.text('⬅️ В админку', 'a:admin');

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
}
async function renderBrandPaywall(ctx, userId, wsId, offerId, page = 0) {
  const cost = Math.max(1, Number(CFG.INTRO_COST_PER_INTRO || 1));
  const trialCredits = Math.max(0, Number(CFG.INTRO_TRIAL_CREDITS || 0));

  // Verification-aware daily limit
  let isVerified = false;
  if (CFG.VERIFICATION_ENABLED) {
    const v = await safeUserVerifications(() => db.getUserVerification(userId), async () => null);
    isVerified = String(v?.status || '').toUpperCase() === 'APPROVED';
  }
  const dailyLimit = Math.max(0, Number(isVerified ? CFG.INTRO_DAILY_LIMIT : CFG.INTRO_DAILY_LIMIT_UNVERIFIED));

  const meta = (await db.getBrandIntroMeta(userId)) || { brand_credits: 0, brand_trial_granted: false };
  const credits = Number(meta.brand_credits || 0);
  let usedToday = 0;
  try {
    usedToday = await db.getIntroDailyUsage(userId);
  } catch {
    usedToday = 0;
  }

  const retry = CFG.INTRO_RETRY_ENABLED ? await db.countAvailableBrandRetryCredits(userId) : 0;

  const afterH = Number(CFG.INTRO_RETRY_AFTER_HOURS || 24);
  const expD = Number(CFG.INTRO_RETRY_EXPIRES_DAYS || 7);
  const retryHintLine = CFG.INTRO_RETRY_ENABLED
    ? `
ℹ️ Retry-кредит: если креатор не отвечает за <b>${afterH}ч</b> → 1 retry на <b>${expD}</b> ${ruPlural(expD,'день','дня','дней')}.`
    : '';

  const trialLine = !meta.brand_trial_granted && trialCredits > 0
    ? `
🎁 Стартовый бонус: <b>${trialCredits}</b> кредит(ов) (1 раз, при первом интро — новом диалоге).
`
    : '';

  const limitLine = dailyLimit > 0
    ? `
📆 Лимит интро (новых диалогов) в день: <b>${dailyLimit}</b> (сегодня использовано: <b>${usedToday}</b>).
`
    : '';

  const verifiedLimit = Math.max(0, Number(CFG.INTRO_DAILY_LIMIT || 0));
  const unverifiedLimit = Math.max(0, Number(CFG.INTRO_DAILY_LIMIT_UNVERIFIED || 0));
  const verifyHintLine = (CFG.VERIFICATION_ENABLED && !isVerified && verifiedLimit > unverifiedLimit)
    ? `

✅ Пройди <b>верификацию</b>, чтобы увеличить лимит до <b>${verifiedLimit}</b> интро (новых диалогов)/день.
`
    : '';

  const text = `🔒 <b>Нужен Brand Pass</b>

<b>Brand Pass</b> = кредиты (Stars).

<b>Как работает:</b>
• 💬 Интро = новый диалог: <b>${cost}</b> ${ruPlural(cost,'кредит','кредита','кредитов')}
• Переписка внутри открытого диалога — бесплатна

${CONTACT_UNLOCK_COST <= 0 ? '🔓 Контакты на витрине: <b>бесплатно</b>' : `🔓 Контакты на витрине: <b>${CONTACT_UNLOCK_COST}</b> ${ruPlural(CONTACT_UNLOCK_COST,'кредит','кредита','кредитов')}`} → доступ на <b>${CONTACT_UNLOCK_TTL_DAYS}</b> ${ruPlural(CONTACT_UNLOCK_TTL_DAYS,'день','дня','дней')} (на одну витрину).
👥 Раздел «Менеджеры бренда» открывается после покупки Brand Pass или Brand Plan.
${trialLine}${limitLine}${verifyHintLine}
${brandPassBalanceLineHtml(credits)}
🎟 Retry-кредиты: <b>${retry}</b>${retryHintLine}

Выбери пакет:`;

  const kb = new InlineKeyboard();
  if (CFG.VERIFICATION_ENABLED && !isVerified && verifiedLimit > unverifiedLimit) {
    kb.text('✅ Увеличить лимит (верификация)', 'a:verify_home').row();
  }
  for (const p of BRAND_PACKS) {
    const intros = Math.max(1, Math.floor(Number(p.credits || 0) / Math.max(1, cost)));
    kb.text(`⭐ ${p.title} · ≈ ${intros} ${ruPlural(intros,'интро-диалог','интро-диалога','интро-диалогов')}`, `a:brand_buy|ws:${wsId}|o:${offerId}|pack:${p.id}|p:${page}`).row();
  }
  kb.text('⭐️ Brand Plan', `a:brand_plan|ws:${wsId}`).text('🎯 Smart Matching', `a:match_home|ws:${wsId}`).row();
  kbNavRow(kb, `a:bx_pub|ws:${wsId}|o:${offerId}|p:${page}|h:bo`);

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
}

async function renderBxInbox(ctx, userId, wsId, page = 0, opts = {}) {

  const wsNum = Number(wsId || 0);
  const h = normBxHome(opts.h, wsNum ? BX_HOME.BX_OPEN : BX_HOME.MENU);

  const limit = CFG.BARTER_INBOX_PAGE_SIZE;
  const offset = page * limit;
  const rows = CFG.VERIFICATION_ENABLED
    ? await safeUserVerifications(() => db.listBarterThreadsForUserWithVerified(userId, limit, offset), () => db.listBarterThreadsForUser(userId, limit, offset))
    : await db.listBarterThreadsForUser(userId, limit, offset);

  let header = `📥 <b>Inbox</b>`;

  // Brand Manager: show current brand + quick switch прямо в Inbox
  if (opts?.bm?.enabled) {
    header += `\n\n<b>Бренд:</b> <b>${escapeHtml(opts.bm.brandLabel || '—')}</b>`;
  }

  header += `\n\nПереписка по офферам (бренд ↔ блогер).`;

  const kb = new InlineKeyboard();

  if (opts?.bm?.enabled && (opts.bm.brands || []).length > 1) {
    kb.text('🔁 Сменить бренд', `a:bm_pick_brand|ret:bx_inbox|ws:${wsId}|p:${page}|h:${h}`).row();
  }

  for (const t of rows) {
    const other = t.other_username ? '@' + t.other_username : ('user #' + t.other_user_id);
    const v = t.other_verified ? ' ✅' : '';
    // Buyer-side indicators
    let triageEmoji = '';
    let stageEmoji = '';
    if (Number(t.buyer_user_id) === Number(userId)) {
      const triage = String(t.triage_status || 'open').toLowerCase();
      if (triage === 'in_progress') triageEmoji = '💬';
      else if (triage === 'spam') triageEmoji = '🗑';

      if (t.buyer_stage) {
        const st = CRM_STAGES.find((s) => s.id === String(t.buyer_stage));
        stageEmoji = st ? String(st.title).trim().split(' ')[0] : '';
      }
    }

    const emojis = [triageEmoji, stageEmoji].filter(Boolean).join(' ');
    const prefix = emojis ? `#${t.id} ${emojis}` : `#${t.id}`;

    const st = computeThreadReplyStatus(t, userId, {
      retryEnabled: CFG.INTRO_RETRY_ENABLED,
      afterHours: CFG.INTRO_RETRY_AFTER_HOURS
    });
    const stLine = st.retry ? `${st.base} · ${st.retry}` : st.base;

    const line = `${prefix} · ${stLine} · ${escapeHtml(t.offer_title || 'оффер')} · ${escapeHtml(other)}${v}`;
    kb.text(line.slice(0, 60), `a:bx_thread|ws:${wsId}|t:${t.id}|p:${page}|b:inbox|h:${h}`).row();
  }

  const hasPrev = page > 0;
  const hasNext = rows.length >= limit; // heuristic
  const nav = bxInboxNavKb(wsId, page, hasPrev, hasNext, { h });
  for (const row of nav.inline_keyboard) kb.inline_keyboard.push(row);

  const emptyTail = rows.length ? '' : `

Пока нет переписок.

💬 Интро = новый диалог. Бренду нужен Brand Pass (кредиты), креатору — просто отвечать здесь.`;

  await safeEditOrReply(ctx, header + emptyTail, { parse_mode: 'HTML', reply_markup: kb });
}

async function buildBxThreadView(userId, threadId) {
  const thread = CFG.VERIFICATION_ENABLED
    ? await safeUserVerifications(() => db.getBarterThreadForUserWithVerified(threadId, userId), () => db.getBarterThreadForUser(threadId, userId))
    : await db.getBarterThreadForUser(threadId, userId);
  if (!thread) return null;

  // Proofs are optional (feature may be deployed later)
  let proofsCount = 0;
  try {
    proofsCount = await db.countBarterThreadProofs(threadId);
  } catch (e) {
    if (!isMissingRelationError(e, 'barter_thread_proofs')) throw e;
    proofsCount = 0;
  }
  const msgs = await db.listBarterMessages(threadId, 12);
  msgs.reverse();

  const isBuyer = Number(thread.buyer_user_id) === Number(userId);
  const otherUserId = isBuyer ? thread.seller_user_id : thread.buyer_user_id;
  const otherUsername = isBuyer ? thread.seller_username : thread.buyer_username;
  const otherVerified = isBuyer ? Boolean(thread.seller_verified) : Boolean(thread.buyer_verified);
  const other = otherUsername ? '@' + otherUsername : ('user #' + otherUserId);
  const otherMark = otherVerified ? ' ✅' : '';
  const status = String(thread.status || 'OPEN').toUpperCase();
  const stageTitle = thread.buyer_stage
    ? (CRM_STAGES.find((s) => s.id === String(thread.buyer_stage))?.title || String(thread.buyer_stage))
    : null;

  // Buyer-side triage
  const triage = String(thread.triage_status || 'open').toLowerCase();
  const triageTitle = isBuyer
    ? (triage === 'in_progress' ? '💬 В работе' : (triage === 'spam' ? '🗑 Спам' : '🆕 Открыт'))
    : null;

const replySt = computeThreadReplyStatus(thread, userId, {
  retryEnabled: CFG.INTRO_RETRY_ENABLED,
  afterHours: CFG.INTRO_RETRY_AFTER_HOURS
});
const replyLine = `Ответ: <b>${escapeHtml(replySt.base)}</b>`;
const retryLine = replySt.retry ? `Retry: <b>${escapeHtml(replySt.retry)}</b>` : null;

const chargeLine = isBuyer ? formatBxChargeLine(thread) : '';
const chargeHtml = chargeLine ? `${escapeHtml(chargeLine)}` : null;
	const offerMeta = offerMetaLinesHtml(thread.offer_meta);

  const headLines = [
    `💬 <b>Диалог #${thread.id}</b>`,
    `Оффер: <b>${escapeHtml(thread.offer_title || '—')}</b>`,
	    offerMeta ? offerMeta : null,
    `С кем: <b>${escapeHtml(other)}${otherMark}</b>`,
    `Статус: <b>${escapeHtml(status)}</b>`,
    triageTitle ? `Триаж: <b>${escapeHtml(triageTitle)}</b>` : null,
    stageTitle ? `CRM: <b>${escapeHtml(stageTitle)}</b>` : null,
    replyLine,
    retryLine,
    chargeHtml
  ].filter(Boolean);

  const head = headLines.join('\n');

  const body = msgs.length ? msgs.map(m => {
    const who = Number(m.sender_user_id) === Number(userId) ? 'Вы' : (m.tg_username ? '@' + m.tg_username : 'Собеседник');
    const ts = m.created_at ? fmtTs(m.created_at) : '';
    return `<b>${escapeHtml(who)}</b> <tg-spoiler>${escapeHtml(ts)}</tg-spoiler>
${escapeHtml(m.body)}`;
  }).join('\n\n') : 'Сообщений пока нет.';

  const text = `${head}

${body}`;
  return { thread, text, proofsCount };
}

async function renderBxThread(ctx, userId, wsId, threadId, opts = {}) {
  const built = await buildBxThreadView(userId, threadId);
  if (!built) return ctx.answerCallbackQuery({ text: 'Диалог не найден.' });
  const { thread, text, proofsCount } = built;

  let canStage = false;
  const curStage = thread.buyer_stage ? String(thread.buyer_stage) : null;
  if (Number(thread.buyer_user_id) === Number(userId)) {
    canStage = await db.isBrandPlanActive(userId);
  }


  const replySt = computeThreadReplyStatus(thread, userId, {
    retryEnabled: CFG.INTRO_RETRY_ENABLED,
    afterHours: CFG.INTRO_RETRY_AFTER_HOURS
  });
  const showRetryInfo = replySt.isBuyer && CFG.INTRO_RETRY_ENABLED && thread.buyer_first_msg_at && !thread.seller_first_reply_at;

  const kb = bxThreadKb(wsId, threadId, {
    ...opts,
    offerId: thread.offer_id,
    canStage,
    stage: curStage,
    triage: String(thread.triage_status || 'open').toLowerCase(),
    isBuyer: Number(thread.buyer_user_id) === Number(userId),
    proofsCount,
    showRetryInfo,
    retryText: replySt.retry || ''
  });
  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
}

function bxProofsKb(wsId, threadId, opts = {}) {
  const back = opts.back || 'inbox';
  const page = Number(opts.page || 0);
  const offerId = opts.offerId ? Number(opts.offerId) : null;

  const h = normBxHome(opts.h, Number(wsId || 0) ? BX_HOME.BX_OPEN : BX_HOME.MENU);
  const cbTail = `${offerId ? `|o:${offerId}` : ''}|b:${back}|p:${page}|h:${h}`;
  return new InlineKeyboard()
    .text('➕ Ссылка', `a:bx_proof_link|ws:${wsId}|t:${threadId}${cbTail}`)
    .text('📎 Скрин', `a:bx_proof_photo|ws:${wsId}|t:${threadId}${cbTail}`)
    .row()
    .text('⬅️ Назад', `a:bx_thread|ws:${wsId}|t:${threadId}|p:${page}${offerId ? `|o:${offerId}` : ''}|b:${back}|h:${h}`);
}

async function renderBxProofs(ctx, userId, wsId, threadId, opts = {}) {
  const built = await buildBxThreadView(userId, threadId);
  if (!built) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
  const offerId = built.thread.offer_id ? Number(built.thread.offer_id) : null;

  let proofs = [];
  try {
    proofs = await db.listBarterThreadProofs(threadId, 12);
  } catch (e) {
    if (!isMissingRelationError(e, 'barter_thread_proofs')) throw e;
    proofs = [];
  }

  const lines = proofs.map((p) => {
    const ts = p.created_at ? fmtTs(p.created_at) : '';
    if (String(p.kind) === 'LINK') {
      const url = String(p.url || '').trim();
      const shown = url.length > 120 ? (url.slice(0, 117) + '…') : url;
      return `🔗 <b>${escapeHtml(shown)}</b> <tg-spoiler>${escapeHtml(ts)}</tg-spoiler>`;
    }
    return `🖼 <b>Скрин</b> <tg-spoiler>${escapeHtml(ts)}</tg-spoiler>`;
  });

  const text =
`🧾 <b>Proofs</b>

Сюда можно добавить подтверждение, что пост опубликован:
• ссылка на пост (t.me/...)
• скрин (фото)

${lines.length ? lines.join('\n') : 'Пока пусто.'}`;

  await safeEditOrReply(ctx, text, {
    parse_mode: 'HTML',
    reply_markup: bxProofsKb(wsId, threadId, { ...opts, offerId })
  });
  }

// -----------------------------
// Brand Mode tools: Brand Pass topup / Brand Plan / Matching / Featured
// -----------------------------

function brandPlanStatusText(planRow, active) {
  if (!active) return 'OFF';
  const name = String(planRow?.brand_plan || 'basic').toLowerCase();
  const until = planRow?.brand_plan_until ? fmtTs(planRow.brand_plan_until) : null;
  const label = name === 'max' ? 'Max' : 'Basic';
  return until ? `${label} (до ${until})` : label;
}

async function renderBrandPassTopup(ctx, userId, wsId) {
  const credits = await db.getBrandCredits(userId);
  const retry = CFG.INTRO_RETRY_ENABLED ? await db.countAvailableBrandRetryCredits(userId) : 0;
  const introCost = Math.max(1, Number(CFG.INTRO_COST_PER_INTRO || 1));
  const afterH = Number(CFG.INTRO_RETRY_AFTER_HOURS || 24);
  const expD = Number(CFG.INTRO_RETRY_EXPIRES_DAYS || 7);
  const kb = new InlineKeyboard();
  for (const p of BRAND_PACKS) {
    kb.text(`💳 ${p.title} · ${p.credits} ${ruPlural(p.credits,'кредит','кредита','кредитов')} · ${p.stars}⭐️`, `a:brand_buy|ws:${wsId}|pack:${p.id}`).row();
  }
  kb.text('⬅️ Назад', `a:bx_open|ws:${wsId}`);

  await safeEditOrReply(ctx, 
    `🎫 <b>Brand Pass</b> = кредиты (Stars)

${brandPassBalanceLineHtml(credits)}
🎟 Retry-кредиты: <b>${retry}</b>

<b>Как работает:</b>
• 💬 Интро = новый диалог: <b>${introCost}</b> ${ruPlural(introCost,'кредит','кредита','кредитов')}
• Переписка внутри открытого диалога — бесплатна
• ${CONTACT_UNLOCK_COST <= 0 ? '🔓 Контакты на витрине: <b>бесплатно</b>' : `🔓 Контакты на витрине: <b>${CONTACT_UNLOCK_COST}</b> ${ruPlural(CONTACT_UNLOCK_COST,'кредит','кредита','кредитов')}`} → доступ на <b>${CONTACT_UNLOCK_TTL_DAYS}</b> ${ruPlural(CONTACT_UNLOCK_TTL_DAYS,'день','дня','дней')}

Retry-кредит начисляется, если креатор не отвечает за <b>${afterH}ч</b> (действует <b>${expD}</b> ${ruPlural(expD,'день','дня','дней')}).

👥 «Менеджеры бренда» открываются после покупки Brand Pass или Brand Plan.

Выбери пакет пополнения ниже:`,
    { parse_mode: 'HTML', reply_markup: kb }
  );
}

// Back-compat alias (some UI buttons still call renderBrandPass)
async function renderBrandPass(ctx, userId, wsId) {
  return renderBrandPassTopup(ctx, userId, wsId);
}

async function renderBrandPlan(ctx, userId, wsId) {
  const planRow = await db.getBrandPlan(userId);
  const active = await db.isBrandPlanActive(userId);
  const status = brandPlanStatusText(planRow, active);

  const kb = new InlineKeyboard();
  for (const pl of BRAND_PLANS) {
    kb.text(`⭐️ ${pl.id === 'max' ? 'Max' : 'Basic'} · ${pl.stars}⭐️/30д`, `a:brand_plan_buy|ws:${wsId}|plan:${pl.id}`).row();
  }
  kb.text('⬅️ Назад', `a:bx_open|ws:${wsId}`);

  await safeEditOrReply(ctx, 
    `⭐️ <b>Brand Plan</b>

Статус: <b>${escapeHtml(status)}</b>

Brand Plan даёт инструменты внутри Inbox (CRM-стадии) и быстрые действия.
Также открывает «Менеджеры бренда» (добавление менеджеров).
Кредиты Brand Pass покупаются отдельно.`,
    { parse_mode: 'HTML', reply_markup: kb }
  );
}

async function renderMatchingHome(ctx, wsId) {
  const kb = new InlineKeyboard();
  for (const t of MATCH_TIERS) {
    kb.text(`🎯 ${t.title} · ${t.count} каналов · ${t.stars}⭐️`, `a:match_buy|ws:${wsId}|tier:${t.id}`).row();
  }
  kb.text('⬅️ Назад', `a:bx_open|ws:${wsId}`);

  await safeEditOrReply(ctx, 
    `🎯 <b>Smart Matching</b>

Платишь Stars за экономию времени: бот подберёт релевантные микро-каналы под твой бриф.

После оплаты отправь бриф текстом (ниша, гео, аудитория, формат).`,
    { parse_mode: 'HTML', reply_markup: kb }
  );
}

async function renderFeaturedHome(ctx, userId, wsId) {
  const kb = new InlineKeyboard();
  for (const d of FEATURED_DURATIONS) {
    kb.text(`🔥 ${d.title} · ${d.stars}⭐️`, `a:feat_buy|ws:${wsId}|dur:${d.id}`).row();
  }
  kb.text('⬅️ Назад', `a:bx_open|ws:${wsId}`);

  await safeEditOrReply(ctx, 
    `🔥 <b>Featured</b>

Подними внимание: твой блок появится сверху в ленте у всех (бренд + блогеры).

После оплаты отправь контент: 1 строка — заголовок, далее описание, последняя строка — контакт (@username / ссылка).`,
    { parse_mode: 'HTML', reply_markup: kb }
  );
}

async function renderFeaturedView(ctx, userId, wsId, id, page = 0, h = BX_HOME.MENU) {
  const f = await db.getFeaturedPlacement(id);
  if (!f || String(f.status) !== 'ACTIVE') return ctx.answerCallbackQuery({ text: 'Featured не найден.' });

  const ends = f.ends_at ? fmtTs(f.ends_at) : '—';
  const title = f.title || 'Featured';
  const body = f.body || '';
  const contact = f.contact || '';

  const kb = new InlineKeyboard();
  if (Number(f.user_id) === Number(userId)) {
    kb.text('⛔ Остановить', `a:feat_stop|ws:${wsId}|id:${id}|p:${page}|h:${h}`).row();
  }
  kbNavRow(kb, `a:bx_feed|ws:${wsId}|p:${page}|h:${h}`);

  await safeEditOrReply(ctx, 
    `🔥 <b>${escapeHtml(String(title))}</b>

${escapeHtml(String(body))}

${contact ? `Контакт: <b>${escapeHtml(String(contact))}</b>
` : ''}До: <b>${escapeHtml(String(ends))}</b>`,
    { parse_mode: 'HTML', reply_markup: kb }
  );
}

// Giveaway status labels (RU + emoji)
function gwStatusLabel(status) {
  const st = String(status || '').toUpperCase();
  switch (st) {
    case 'ACTIVE':
      return '🟢 Идёт';
    case 'RUNNING':
      return '🟢 Идёт';
    case 'ENDED':
      return '🏁 Завершён';
    case 'DRAFT':
      return '📝 Черновик';
    case 'PAUSED':
      return '⏸ Пауза';
    case 'WINNERS_DRAWN':
      return '🎲 Победители выбраны';
    case 'RESULTS_PUBLISHED':
      return '🏆 Итоги опубликованы';
    case 'CANCELLED':
      return '⛔ Отменён';
    case 'PUBLISHED':
      return '📣 Опубликован';
    default:
      return st ? `ℹ️ ${st}` : '—';
  }
}

// Effective giveaway status (fixes "ИДЁТ" when дедлайн уже прошёл)
function gwEndsAtMs(endsAt) {
  if (!endsAt) return null;
  const t = new Date(endsAt).getTime();
  return Number.isFinite(t) ? t : null;
}

function gwIsEndedByTime(g, nowMs = Date.now()) {
  const endMs = gwEndsAtMs(g?.ends_at);
  return endMs !== null && nowMs >= endMs;
}

function gwEffectiveStatusValue(g, nowMs = Date.now()) {
  const st = String(g?.status || '').toUpperCase();
  // Terminal states keep as-is
  if (['ENDED','WINNERS_DRAWN','RESULTS_PUBLISHED','CANCELLED'].includes(st)) return st;
  // If deadline passed — treat as ENDED (even if DB still says ACTIVE/PAUSED/PUBLISHED/RUNNING)
  if (gwIsEndedByTime(g, nowMs) && ['ACTIVE','PAUSED','PUBLISHED','RUNNING'].includes(st)) return 'ENDED';
  return st || '';
}

function gwEndsLine(g, nowMs = Date.now()) {
  const endMs = gwEndsAtMs(g?.ends_at);
  if (endMs === null) return 'Дедлайн: <b>—</b>';
  const ended = nowMs >= endMs;
  const ts = escapeHtml(fmtTs(g.ends_at));
  return ended ? `✅ Закончился: <b>${ts}</b>` : `⏳ Закончится: <b>${ts}</b>`;
}


async function renderGwList(ctx, ownerUserId, wsId = null) {
  const items = await db.listGiveaways(ownerUserId, 25);
  const wsNum = (wsId === null || wsId === undefined) ? null : Number(wsId);
  // workspace_id can come from PG as a string (BIGINT), so compare by Number to avoid empty lists
  const filtered = wsNum ? items.filter(x => Number(x.workspace_id) === wsNum) : items;

  const activeWs = wsNum || (ctx?.from?.id ? await getActiveWorkspace(ctx.from.id) : null);
  const createCb = activeWs ? `a:gw_new|ws:${activeWs}` : 'a:gw_new_pick';

  const kb = new InlineKeyboard();
  kb.text('➕ Новый розыгрыш', createCb);
  if (!wsId) kb.text('📣 Выбрать канал', 'a:gw_new_pick');
  kb.row();

  if (!filtered.length) {
    kb.text('⬅️ Назад', wsId ? `a:ws_open|ws:${wsId}` : 'a:menu');
    await safeEditOrReply(ctx, `🎁 Розыгрышей пока нет.

Жми «➕ Новый розыгрыш», чтобы создать первый.`, { reply_markup: kb });
    return;
  }

  const nowMs = Date.now();

  for (const g of filtered) {
    const st = gwStatusLabel(gwEffectiveStatusValue(g, nowMs));
    const wsLabel = !wsId ? ` · ${String(g.workspace_title || '').slice(0, 18)}` : '';
    kb.text(`#${g.id} · ${st}${wsLabel}`, `a:gw_open|i:${g.id}`)
      .text('🗑', `a:gw_del_q|i:${g.id}|ws:${g.workspace_id}`)
      .row();
  }

  kb.text('⬅️ Назад', wsId ? `a:ws_open|ws:${wsId}` : 'a:menu');
  await safeEditOrReply(ctx, 
    `🎁 <b>${wsId ? 'Розыгрыши канала' : 'Розыгрыши'}</b>

Выбери розыгрыш (или создай новый):`,
    { parse_mode: 'HTML', reply_markup: kb }
  );
}

async function renderGwOpen(ctx, ownerUserId, gwId) {
  const g = await db.getGiveawayForOwner(gwId, ownerUserId);
  if (!g) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

  // Lazy auto-end: if дедлайн прошёл, чтобы статус не "врал" даже без cron
  const nowMs = Date.now();
  const effSt = gwEffectiveStatusValue(g, nowMs);
  const rawSt = String(g.status || '').toUpperCase();
  if (effSt === 'ENDED' && rawSt !== 'ENDED' && gwIsEndedByTime(g, nowMs)) {
    try {
      await db.updateGiveaway(gwId, { status: 'ENDED' });
      await db.auditGiveaway(gwId, g.workspace_id, ownerUserId, 'gw.ended_lazy', { by_time: true });
      g.status = 'ENDED';
    } catch {}
  }
  const sponsors = await db.listGiveawaySponsors(gwId);
  const sponsorLines = sponsors.map(s => `• ${escapeHtml(s.sponsor_text)}`).join('\n') || '—';

  const checked = await getCurGwChecked(g.id);
  const notes = await getCurGwNotes(g.id, 3);

  const checkedLine = checked
    ? `✅ Проверено: <b>${escapeHtml(curatorLabelFromMeta(checked))}</b> · ${escapeHtml(fmtTs(checked.at))}`
    : '✅ Проверено: —';

  const notesBlock = curatorNotesBlock(notes);

  // Winners (read-only): show in card once drawn
  const winnersDrawn = rawSt === 'WINNERS_DRAWN' || rawSt === 'RESULTS_PUBLISHED' || !!g.winners_drawn_at;
  const resultsPublished = rawSt === 'RESULTS_PUBLISHED' || (g.results_message_id && Number(g.results_message_id) > 0);
  let winnersSection = '';
  if (winnersDrawn) {
    const winners = await db.exportGiveawayWinnersForPublish(gwId, ownerUserId);
    const wf = formatGwWinnersOwner(winners);
    const winnersLines = wf.text || '—';
    const pubLabel = resultsPublished ? '✅ опубликовано' : '🏁 готовы';
    winnersSection = `

🏆 <b>Победители</b> (${pubLabel})
${winnersLines}`;
  }

  const text = `🎁 <b>Конкурс #${g.id}</b>

Статус: <b>${escapeHtml(gwStatusLabel(gwEffectiveStatusValue(g)))}</b>
Приз: <b>${escapeHtml(g.prize_value_text || '—')}</b>
Мест: <b>${g.winners_count}</b>
${gwEndsLine(g)}

Спонсоры:\n${sponsorLines}${winnersSection}

👤 <b>Куратор</b>
${checkedLine}
${notesBlock}

Если ведёшь конкурс не один — пригласи помощника (👥 Кураторы канала → 👤 Пригласить куратора).`;
  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: gwOpenKb(g, { isAdmin: isSuperAdminTg(ctx.from?.id) }) });
}


async function renderGwWinnersView(ctx, ownerUserId, gwId) {
  const g = await db.getGiveawayForOwner(gwId, ownerUserId);
  if (!g) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

  const rawSt = String(g.status || '').toUpperCase();
  const winnersDrawn = rawSt === 'WINNERS_DRAWN' || rawSt === 'RESULTS_PUBLISHED' || !!g.winners_drawn_at;
  const resultsPublished = rawSt === 'RESULTS_PUBLISHED' || (g.results_message_id && Number(g.results_message_id) > 0);

  const winners = winnersDrawn ? await db.exportGiveawayWinnersForPublish(gwId, ownerUserId) : [];
  const wf = formatGwWinnersOwner(winners);
  const winnersLines = wf.text || '—';
  const winnersBlock = wf.mode === 'one'
    ? `🏆 Победители: ${wf.text}`
    : `${winnersBlock}`;

  const pubLabel = resultsPublished ? '✅ Итоги опубликованы' : '🏁 Итоги готовы';
  const text = `🏆 <b>Победители конкурса #${g.id}</b>

${pubLabel}
${gwEndsLine(g)}

${winnersBlock}

ℹ️ Это read-only экран. Публикация итогов — из карточки конкурса.`;

  const kb = new InlineKeyboard()
    .text('⬅️ Назад', `a:gw_open|i:${gwId}`)
    .row()
    .text('🧾 Лог', `a:gw_log|i:${gwId}`)
    .row()
    .text('📋 Меню', 'a:menu')
    .text('🏠 Home', 'a:home');

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
}


async function renderGwStats(ctx, ownerUserId, gwId) {
  const st = await db.getGiveawayStats(gwId, ownerUserId);
  if (!st) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
  const total = Number(st.entries_total || 0);
  const elig = Number(st.eligible_count || 0);
  const notElig = Number(st.not_eligible_count || 0);
  const eligPct = total > 0 ? Math.round((elig / total) * 1000) / 10 : 0;
  const text =
`📊 <b>Статистика конкурса #${gwId}</b>

👥 Entries total: <b>${total}</b>
✅ Eligible: <b>${elig}</b>  (<b>${eligPct}%</b>)
⚠️ Not eligible: <b>${notElig}</b>

🕒 Last join: <b>${fmtTs(st.last_joined_at)}</b>
🔎 Last check: <b>${fmtTs(st.last_checked_at)}</b>

🔍 Transparency log: 🧾`;

  const kb = new InlineKeyboard()
    .text('✅ Готовность конкурса', `a:gw_preflight|i:${gwId}`)
    .row()
    .text('ℹ️ Почему не прошёл', `a:gw_why|i:${gwId}`)
    .row()
    .text('🧾 Transparency log', `a:gw_log|i:${gwId}`)
    .row()
    .text('📤 Экспорт всех', `a:gw_export|i:${gwId}|t:all`)
    .row()
    .text('📤 Экспорт eligible', `a:gw_export|i:${gwId}|t:eligible`)
    .row()
    .text('🏆 Экспорт winners', `a:gw_export|i:${gwId}|t:winners`)
    .row();

  if (isSuperAdminTg(ctx.from?.id)) kb.text('🧩 Проверка доступа', `a:gw_access|i:${gwId}`).row();

  kb
    .text('📣 Напомнить проверить', `a:gw_remind_q|i:${gwId}`)
    .row()
    .text('⬅️ Назад', `a:gw_open|i:${gwId}`);

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
}

async function renderGwLog(ctx, ownerUserIdOrNull, gwId) {
  // both owner & participants can open log: show last audit rows
  const rows = await db.listGiveawayAudit(gwId, 30);
  const lines = rows.map(r => `• <b>${escapeHtml(r.action)}</b> — ${fmtTs(r.created_at)}`);
  const text = `🧾 <b>Лог конкурса #${gwId}</b>

${lines.length ? lines.join('\n') : 'Пока пусто.'}`;
  const back = ownerUserIdOrNull ? `a:gw_open|i:${gwId}` : `a:gw_open_public|i:${gwId}`;
  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: navKb(back) });
}

async function renderGwOpenPublic(ctx, gwId, userId) {
  const g = await db.getGiveawayInfoForUser(gwId);
  if (!g) return ctx.answerCallbackQuery({ text: 'Конкурс не найден.' });
  const entry = await db.getEntryStatus(gwId, userId);

  const sponsorRows = await db.listGiveawaySponsors(gwId);
  const sponsors = (sponsorRows || []).map(r => r.sponsor_text).filter(Boolean);

  const text = renderParticipantScreen(g, entry, { hint: true, sponsors });
  const st = gwEffectiveStatusValue(g);
  const ended = ['ENDED','WINNERS_DRAWN','RESULTS_PUBLISHED','CANCELLED'].includes(st);
  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: participantKb(gwId, entry, { pub: true, ended }) });
}

// ----------------------
// Curator cabinet (safe permissions)
// ----------------------

function wsLabelNice(w) {
  const title = String(w?.title || '').trim();
  const unameRaw = String(w?.channel_username || '').trim();
  const uname = unameRaw ? (unameRaw.startsWith('@') ? unameRaw : '@' + unameRaw) : '';
  if (title && uname) return `${title} ${uname}`.trim();
  if (title) return title;
  if (uname) return uname;
  return `Канал #${w?.id}`;
}

function curatorHomeKb(items, modeEnabled = false) {
  const kb = new InlineKeyboard();

  // Mode toggle (persisted in Redis). Keep the curator inside the cabinet when toggling.
  const label = modeEnabled ? '🧹 Режим куратора: ✅ ВКЛ' : '🧹 Режим куратора: ❌ ВЫКЛ';
  kb.text(label, `a:cur_mode_set|v:${modeEnabled ? 0 : 1}|ret:cur`).row();

  // Quick exit to the normal (full) menu.
  if (modeEnabled) kb.text('🔓 Обычный режим', 'a:cur_mode_set|v:0|ret:menu').row();

  // Help / support (в curator mode тут нет “Мои каналы”, чтобы не путать: свои каналы доступны через обычный режим).
  kb.text('🧭 Быстрый старт', 'a:guide').text('💬 Поддержка', 'a:support').row();

  for (const w of items) {
    const on = !!w.curator_enabled;
    const label = `${on ? '✅' : '❌'} ${wsLabelNice(w)}`;
    kb.text(label, `a:cur_ws|ws:${w.id}`).row();
  }

  // Unified hub footer (Back -> Home Hub, Menu -> Role Hub, Home -> Home Hub).
  kb.row().text('⬅️ Назад', 'a:home').text('📋 Меню', 'a:menu');
  kb.row().text('🏠 Home', 'a:home');
  return kb;
}

async function renderCuratorHome(ctx, userId) {
  const items = await db.listCuratorWorkspaces(userId);
  const modeEnabled = await getCuratorMode(ctx.from.id);
  const enabledCnt = items.filter((x) => !!x.curator_enabled).length;
  const disabledCnt = Math.max(0, items.length - enabledCnt);
  const text = `👤 <b>Куратор</b>

Тут ты смотришь конкурсы чужих каналов, где тебя назначили куратором.

<b>Как пользоваться:</b>
• Жми на канал ниже → увидишь конкурсы.
• ✅ — доступ включён, можно работать.
• ❌ — владелец выключил куратора (попроси включить или выйди из канала).

<b>Что тебе доступно:</b> 📊 Статистика • 🧾 Лог • 📣 Напомнить проверить • ✅ Проверено • 📝 Заметки

🧹 <b>Режим куратора</b> — прячет лишнее меню (оставляет только кураторское).

Каналов: <b>${items.length}</b> (✅ ${enabledCnt} · ❌ ${disabledCnt})

${items.length ? 'Выбери канал:' : 'Пока тебя не назначили куратором ни в одном канале.'}`;
  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: curatorHomeKb(items, modeEnabled) });
}

// Same as renderCuratorHome, but for /start (new message instead of edit)
async function replyCuratorHome(ctx, userId) {
  const items = await db.listCuratorWorkspaces(userId);
  const modeEnabled = await getCuratorMode(ctx.from.id);
  const enabledCnt = items.filter((x) => !!x.curator_enabled).length;
  const disabledCnt = Math.max(0, items.length - enabledCnt);
  const text = `👤 <b>Куратор</b>

Тут ты смотришь конкурсы чужих каналов, где тебя назначили куратором.

<b>Как пользоваться:</b>
• Жми на канал ниже → увидишь конкурсы.
• ✅ — доступ включён, можно работать.
• ❌ — владелец выключил куратора (попроси включить или выйди из канала).

<b>Что тебе доступно:</b> 📊 Статистика • 🧾 Лог • 📣 Напомнить проверить • ✅ Проверено • 📝 Заметки

🧹 <b>Режим куратора</b> — прячет лишнее меню (оставляет только кураторское).

Каналов: <b>${items.length}</b> (✅ ${enabledCnt} · ❌ ${disabledCnt})

${items.length ? 'Выбери канал:' : 'Пока тебя не назначили куратором ни в одном канале.'}`;

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: curatorHomeKb(items, modeEnabled) });
}

function curatorWsKb(wsId, giveaways, checkedSet = new Set(), leadCounts = null) {
  const kb = new InlineKeyboard();
  const nowMs = Date.now();

  for (const g of giveaways) {
    const gwId = Number(g?.id || 0);
    if (!gwId) continue;

    const eff = gwEffectiveStatusValue(g, nowMs);
    const st = gwStatusLabel(eff);

    kb.text(`🎁 #${gwId} · ${st}`, `a:cur_gw_open|ws:${wsId}|i:${gwId}`);

    // Quick actions:
    // - ✅ / ☑️ mark as "checked" (internal)
    // - 📣 remind participants to open bot and press "Проверить" (only for non-terminal contests)
    const isChecked = checkedSet && typeof checkedSet.has === 'function' ? checkedSet.has(gwId) : false;
    kb.text(isChecked ? '☑️' : '✅', `a:cur_gw_check_q|ws:${wsId}|i:${gwId}`);

    if (!['ENDED','WINNERS_DRAWN','RESULTS_PUBLISHED','CANCELLED'].includes(String(eff || ''))) {
      kb.text('📣', `a:cur_gw_remind_q|ws:${wsId}|i:${gwId}`);
    }

    kb.row();
  }

  const newLeads = leadCounts ? Number(leadCounts.new || 0) : 0;
  const leadBadge = newLeads ? ` (${newLeads})` : '';
  kb.text(`📨 Inbox брендов${leadBadge}`, `a:ws_leads|w:${wsId}|s:n|p:0${retPartShort('cw')}`).row();

  kb.text('❌ Выйти из канала', `a:cur_leave_q|ws:${wsId}`).row();

  // Footer per invariants
  kb.row().text('⬅️ Назад', 'a:cur_home').text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');
  return kb;
}


async function renderCuratorWorkspace(ctx, userId, wsId) {
  const wsIdNum = Number(wsId);
  const ws = await db.getWorkspaceAny(wsIdNum);

  const wsTitle = ws ? wsLabelNice(ws) : `Канал #${wsIdNum}`;

  // If owner disabled curator mode — show info + allow leaving
  if (ws && !ws.curator_enabled) {
    const kb = new InlineKeyboard()
      .text('❌ Выйти из канала', `a:cur_leave_q|ws:${wsIdNum}`)
      .row()
      .text('⬅️ Назад', 'a:cur_home');
    const text = `👤 <b>Куратор</b> • ${escapeHtml(wsTitle)}

Режим куратора в этом канале выключен владельцем.

Если хочешь — выйди из канала (удалишь свою роль куратора).`;
    await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
    return;
  }

  const giveaways = await db.listGiveawaysForCurator(wsIdNum, userId, 30);

    let leadCounts = null;
  try { leadCounts = await db.countBrandLeadsByStatus(wsIdNum); } catch {}

  
  const leadsLine = leadCounts
    ? `

📨 Заявки брендов: <b>${Number(leadCounts.new || 0)}</b> новых · <b>${Number(leadCounts.in_progress || 0)}</b> в работе`
    : '';

  
  const text = `👤 <b>Куратор</b> • ${escapeHtml(wsTitle)}${leadsLine}

${giveaways.length ? 'Конкурсы:' : 'Пока нет конкурсов.'}

Подсказка: ✅/☑️ — отметить «проверено», 📣 — напомнить участникам нажать «Проверить».

Если тебя назначили по ошибке или помощь больше не нужна — нажми “❌ Выйти из канала”.`;
    // Preload "checked" meta for quick status icons (best-effort; Redis).
  const checkedSet = new Set();
  for (const gg of giveaways) {
    const gid = Number(gg?.id || 0);
    if (!gid) continue;
    try {
      const meta = await getCurGwChecked(gid);
      if (meta) checkedSet.add(gid);
    } catch {}
  }

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: curatorWsKb(wsIdNum, giveaways, checkedSet, leadCounts) });
}

function curatorGwKb(wsId, gwId) {
  return new InlineKeyboard()
    .text('📊 Статистика', `a:cur_gw_stats|ws:${wsId}|i:${gwId}`)
    .text('🧾 Лог', `a:cur_gw_log|ws:${wsId}|i:${gwId}`)
    .row()
    .text('✅ Проверено', `a:cur_gw_check_q|ws:${wsId}|i:${gwId}`)
    .text('📝 Заметки', `a:cur_gw_note_q|ws:${wsId}|i:${gwId}`)
    .row()
    .text('📣 Напомнить проверить', `a:cur_gw_remind_q|ws:${wsId}|i:${gwId}`)
    .row()
    .text('📩 Владельцу', `a:cur_gw_owner_q|ws:${wsId}|i:${gwId}`)
    .row()
    .text('⬅️ Назад', `a:cur_ws|ws:${wsId}`);
}

async function renderCuratorGiveawayOpen(ctx, userId, wsId, gwId) {
  const g = await db.getGiveawayForCurator(Number(gwId), userId);
  if (!g || Number(g.workspace_id) !== Number(wsId)) {
    return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
  }

  const checked = await getCurGwChecked(g.id);
  const notes = await getCurGwNotes(g.id, 3);

  const checkedLine = checked
    ? `✅ Проверено: <b>${escapeHtml(curatorLabelFromMeta(checked))}</b> · ${escapeHtml(fmtTs(checked.at))}`
    : '✅ Проверено: —';

  const notesBlock = curatorNotesBlock(notes);

  const text = `🎁 <b>Конкурс #${g.id}</b>

Статус: <b>${escapeHtml(gwStatusLabel(gwEffectiveStatusValue(g)))}</b>
Приз: <b>${escapeHtml(g.prize_value_text || '—')}</b>
Мест: <b>${g.winners_count}</b>
${gwEndsLine(g)}

${checkedLine}
${notesBlock}

Режим: <b>Куратор</b> (безопасные права)`;
  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: curatorGwKb(Number(wsId), Number(gwId)) });
}

async function renderCuratorGiveawayStats(ctx, userId, wsId, gwId) {
  const st = await db.getGiveawayStatsForCurator(Number(gwId), userId);
  if (!st) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

  const text = `📊 <b>Статистика конкурса #${gwId}</b>

Всего заявок: <b>${st.entries_total ?? 0}</b>
Прошли проверку: <b>${st.eligible_count ?? 0}</b>
Не прошли: <b>${st.not_eligible_count ?? 0}</b>
Последняя заявка: <b>${st.last_joined_at ? escapeHtml(fmtTs(st.last_joined_at)) : '—'}</b>
Последняя проверка: <b>${st.last_checked_at ? escapeHtml(fmtTs(st.last_checked_at)) : '—'}</b>`;

  const kb = new InlineKeyboard()
    .text('🧾 Лог', `a:cur_gw_log|ws:${wsId}|i:${gwId}`)
    .row()
    .text('⬅️ Назад', `a:cur_gw_open|ws:${wsId}|i:${gwId}`);

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
}

async function renderCuratorGiveawayLog(ctx, userId, wsId, gwId) {
  const g = await db.getGiveawayForCurator(Number(gwId), userId);
  if (!g) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
  const rows = await db.listGiveawayAudit(Number(gwId), 30);
  const lines = rows.map(r => `• <b>${escapeHtml(r.action)}</b> — ${fmtTs(r.created_at)}`);
  const text = `🧾 <b>Лог конкурса #${gwId}</b>

${lines.length ? lines.join('\n') : 'Пока пусто.'}`;
  const kb = navKb(`a:cur_gw_open|ws:${wsId}|i:${gwId}`);
  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
}

async function renderCuratorGiveawayRemindQ(ctx, userId, wsId, gwId) {
  const g = await db.getGiveawayForCurator(Number(gwId), userId);
  if (!g) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

  const text = `📣 <b>Напомнить проверить</b>

Бот отправит сообщение в канал конкурса, чтобы участники открыли бота и нажали <b>«Проверить»</b>.

Отправить сейчас?`;
  const kb = new InlineKeyboard()
    .text('✅ Отправить', `a:cur_gw_remind_send|ws:${wsId}|i:${gwId}`)
    .text('⬅️ Отмена', `a:cur_gw_open|ws:${wsId}|i:${gwId}`);
  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
}

async function renderCuratorGiveawayRemindSend(ctx, userId, wsId, gwId) {
  const g = await db.getGiveawayForCurator(Number(gwId), userId);
  if (!g) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

  const chatId = g.published_chat_id ?? g.published_chat ?? g.channel_id ?? null;
  if (!chatId) {
    await ctx.answerCallbackQuery({ text: 'Не найден канал конкурса.' });
    return renderCuratorGiveawayOpen(ctx, userId, wsId, gwId);
  }

  // rate-limit: 1 remind per 10 minutes per giveaway
  const rlKey = k(['rl', 'gw_remind', String(gwId)]);
  const rl = await rateLimit(rlKey, { limit: 1, windowSec: 10 * 60 });
  if (!rl.allowed) {
    await ctx.answerCallbackQuery({ text: `⏳ Слишком часто. Подожди ${fmtWait(rl.resetSec || 60)}.` });
    return;
  }

  // Use URL button (works reliably inside channel posts and always opens the bot).
  const link = `https://t.me/${CFG.BOT_USERNAME}?start=gw_${g.id}`;
  const msg = `🔔 <b>Проверка участия</b>

Открой бота и нажми <b>«Проверить»</b>, чтобы подтвердить подписки.

🤖 Бот: ${escapeHtml(link)}`;
  const kb = { inline_keyboard: [[{ text: '🤖 Открыть бота', url: link }]] };

  try {
    const replyParams = g.published_message_id ? { reply_parameters: { message_id: Number(g.published_message_id), allow_sending_without_reply: true } } : {};
    await ctx.api.sendMessage(chatId, msg, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb, ...replyParams });
    await db.auditGiveaway(g.id, g.workspace_id, userId, 'gw.reminder_posted', { actor_role: 'curator' });
    await ctx.answerCallbackQuery({ text: '✅ Отправлено' });
  } catch (e) {
    await ctx.answerCallbackQuery({ text: 'Не удалось отправить в канал.' });
  }

  
await renderCuratorGiveawayOpen(ctx, userId, wsId, gwId);
}

async function renderCuratorGiveawayOwnerNotifyQ(ctx, userId, wsId, gwId) {
  const g = await db.getGiveawayForCurator(Number(gwId), userId);
  if (!g) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

  const checked = await getCurGwChecked(g.id);
  const notes = await getCurGwNotes(g.id, 3);
  const checkedLine = checked
    ? `✅ Проверено: <b>${escapeHtml(curatorLabelFromMeta(checked))}</b> · ${fmtTs(checked.at)}`
    : '✅ Проверено: —';

  const chTitle = g.ws_title || 'канал';
  const chUser = g.ws_username ? `@${g.ws_username}` : '';

  const msg = `📩 <b>Сообщение владельцу</b>

Отправлю владельцу короткий апдейт по конкурсу <b>#${g.id}</b>.

🏷 Канал: <b>${escapeHtml(chTitle)}</b>${chUser ? ` (${escapeHtml(chUser)})` : ''}
${checkedLine}
${curatorNotesBlock(notes)}

⏱ Лимит: 1 раз / 10 минут на конкурс.`;

  const kb = new InlineKeyboard()
    .text('📩 Отправить', `a:cur_gw_owner_send|ws:${wsId}|i:${gwId}`)
    .row()
    .text('❌ Отмена', `a:cur_gw_open|ws:${wsId}|i:${gwId}`);

  await safeEditOrReply(ctx, msg, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb });
}

async function renderCuratorGiveawayOwnerNotifySend(ctx, userId, wsId, gwId) {
  const g = await db.getGiveawayForCurator(Number(gwId), userId);
  if (!g) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

  // rate-limit: 1 notify per 10 minutes per giveaway (protect owner from spam)
  const rlKey = k(['rl', 'cur_owner_notify', String(g.id), String(userId)]);
  const rl = await rateLimit(rlKey, { limit: 1, windowSec: 10 * 60 });
  if (!rl.allowed) {
    await ctx.answerCallbackQuery({ text: `⏳ Слишком часто. Подожди ${fmtWait(rl.resetSec || 60)}.` });
    return;
  }

  const ownerTgId = await db.getUserTgIdByUserId(g.owner_user_id);
  if (!ownerTgId) {
    await ctx.answerCallbackQuery({ text: 'Не найден владелец.' });
    return;
  }

  const checked = await getCurGwChecked(g.id);
  const notes = await getCurGwNotes(g.id, 3);
  const checkedLine = checked
    ? `✅ Проверено: <b>${escapeHtml(curatorLabelFromMeta(checked))}</b> · ${fmtTs(checked.at)}`
    : '✅ Проверено: —';

  const actor = ctx.from?.username ? `@${ctx.from.username}` : (ctx.from?.first_name ? ctx.from.first_name : 'куратор');
  const chTitle = g.ws_title || 'канал';
  const chUser = g.ws_username ? `@${g.ws_username}` : '';

  const link = `https://t.me/${CFG.BOT_USERNAME}?start=gwo_${g.id}`;
  const out = `📩 <b>Апдейт от куратора</b>

От: <b>${escapeHtml(actor)}</b>
Конкурс: <b>#${g.id}</b>
Канал: <b>${escapeHtml(chTitle)}</b>${chUser ? ` (${escapeHtml(chUser)})` : ''}
${checkedLine}
${curatorNotesBlock(notes)}

Открыть конкурс: ${escapeHtml(link)}`;

  const kb = new InlineKeyboard()
    .text('🎁 Открыть конкурс', `a:gw_open|i:${g.id}`)
    .row()
    .url('🤖 Открыть бота', link)
    .row()
    .text('🗑 Убрать', 'a:nd')
    .row()
    .text('📋 Меню', 'a:menu')
    .text('🏠 Home', 'a:home');

  try {
    await ctx.api.sendMessage(ownerTgId, out, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb });
    await db.auditGiveaway(g.id, g.workspace_id, userId, 'curator.owner_notified', { actor_role: 'curator' });
    await ctx.answerCallbackQuery({ text: '📩 Отправлено' });
  } catch (e) {
    await ctx.answerCallbackQuery({ text: 'Не удалось отправить владельцу.' });
  }

  await renderCuratorGiveawayOpen(ctx, userId, wsId, gwId);
}


function formatChatRef(chat) {
  const s = String(chat);
  // For -100... channel ids we keep as-is; for @username we keep as-is.
  return s;
}

async function checkBotAccessCached(api, chat, botId, { forceRecheck = false } = {}) {
  const key = k(['acc2', chat]);
  if (forceRecheck) {
    try { await redis.del(key); } catch {}
  }

  const cached = await redis.get(key);
  if (cached) {
    try { return typeof cached === 'string' ? JSON.parse(cached) : cached; } catch {}
  }

  try {
    const cm = await api.getChatMember(chat, botId);
    const st = String(cm.status || '');
    let res;
    if (st === 'administrator' || st === 'creator') res = { state: 'admin', status: st };
    else if (st === 'member') res = { state: 'member', status: st };
    else if (st === 'left' || st === 'kicked') res = { state: 'no', status: st };
    else res = { state: 'no', status: st || 'unknown' };
    await redis.set(key, JSON.stringify(res), { ex: 10 * 60 });
    return res;
  } catch (e) {
    const res = { state: 'no', status: 'error', reason: String(e?.message || e) };
    await redis.set(key, JSON.stringify(res), { ex: 5 * 60 });
    return res;
  }
}

function accessLine(chat, a) {
  const ref = formatChatRef(chat);
  if (a.state === 'admin') return `✅ ${ref} — bot: <b>admin</b>`;
  if (a.state === 'member') return `🟦 ${ref} — bot: <b>member</b>`;
  return `❌ ${ref} — bot: <b>no access</b>`;
}

export async function renderGwPreflight(ctx, ownerUserId, gwId, { forceRecheck = false } = {}) {
  const g = await db.getGiveawayForOwner(gwId, ownerUserId);
  if (!g) {
    await safeEditOrReply(ctx, 'Нет доступа.');
    return;
  }

  const botId = await ensureBotId(ctx);
  const botUsername = CFG.BOT_USERNAME || 'YourBotUsername';

  // Main chat where giveaway is/will be published
  const mainChat = g.published_chat_id ?? g.published_chat ?? g.channel_id ?? null;

  const sponsorsRaw = await db.listGiveawaySponsors(gwId);
  const sponsorChats = sponsorsRaw.map(s => sponsorToChatId(s.sponsor_text)).filter(Boolean);

  const chats = [...new Set([mainChat, ...sponsorChats].filter(Boolean).map((x) => String(x)))];

  let mainAcc = null;
  if (mainChat) mainAcc = await checkBotAccessCached(ctx.api, String(mainChat), botId, { forceRecheck });

  const results = [];
  for (const chat of sponsorChats.map(String)) {
    const a = await checkBotAccessCached(ctx.api, chat, botId, { forceRecheck });
    results.push({ chat, a });
  }

  const adminCount = results.filter(r => r.a.state === 'admin').length + (mainAcc?.state === 'admin' ? 1 : 0);
  const memberCount = results.filter(r => r.a.state === 'member').length + (mainAcc?.state === 'member' ? 1 : 0);
  const noCount = results.filter(r => r.a.state === 'no').length + (mainAcc?.state === 'no' ? 1 : 0);

  let verdict = '✅ <b>Готово к запуску</b>';
  let hint = `Можно публиковать — бот сможет проверять подписки.`;

  if (!mainChat) {
    verdict = '⚠️ <b>Не выбран канал конкурса</b>';
    hint = 'Сначала опубликуй конкурс в канал (или перепроверь, что бот подключён к workspace).';
  } else if (noCount > 0) {
    verdict = '❌ <b>Не готово: нет доступа</b>';
    hint = `Добавь бота @${escapeHtml(botUsername)} админом в каналы, где стоит ❌.`;
  } else if (memberCount > 0) {
    verdict = '⚠️ <b>Почти готово</b>';
    hint = `Лучше выдать боту @${escapeHtml(botUsername)} права <b>админа</b> в каналах (сейчас часть каналов — member).`;
  }

  const lines = [];
  lines.push(`<b>Канал конкурса</b>:`);
  lines.push(mainChat ? accessLine(String(mainChat), mainAcc) : '—');

  lines.push('');
  lines.push(`<b>Спонсоры</b>: ${sponsorChats.length ? '' : '—'}`);
  if (sponsorChats.length) {
    for (const r of results) lines.push(accessLine(r.chat, r.a));
  }

  const text =
`🧪 <b>Готовность конкурса #${gwId}</b>

${verdict}
${hint}

${lines.join('\n')}

<i>Зачем это:</i> чтобы бот мог подтвердить подписки участников, ему нужен доступ к каналам.`;

  const kb = new InlineKeyboard()
    .text('🔄 Перепроверить', `a:gw_preflight|i:${gwId}|r:1`)
    .row()
    .text('⬅️ Назад', `a:gw_stats|i:${gwId}`);

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });

  try {
    await db.auditGiveaway(gwId, g.workspace_id, ownerUserId, 'gw.preflight_checked', {
      mainChat: mainChat ? String(mainChat) : null,
      sponsors: sponsorChats.map(String),
      adminCount, memberCount, noCount
    });
  } catch {}
}

export async function renderGwWhyMenu(ctx, ownerUserId, gwId) {
  const g = await db.getGiveawayForOwner(gwId, ownerUserId);
  if (!g) {
    await safeEditOrReply(ctx, 'Нет доступа.');
    return;
  }

  const kb = new InlineKeyboard()
    .text('🔎 Ввести ID', `a:gw_why_enter|i:${gwId}`)
    .row()
    .text('📨 Переслать сообщение', `a:gw_why_forward|i:${gwId}`)
    .row()
    .text('⬅️ Назад', `a:gw_stats|i:${gwId}`);

  await safeEditOrReply(ctx, 
    `ℹ️ <b>Почему участник не прошёл</b>\n\nВыбери режим:\n• <b>Ввести ID</b> — быстро и надёжно.\n• <b>Переслать сообщение</b> — сработает только если у участника выключена “Forward privacy”.`,
    { parse_mode: 'HTML', reply_markup: kb }
  );
}

async function clearEligibilityCacheForGw(gwId, userTgId) {
  let mainChat = null;
  try {
    const g = await db.getGiveawayInfoForUser(gwId);
    mainChat = g?.published_chat_id ?? g?.published_chat ?? g?.channel_id ?? null;
  } catch {}
  const sponsors = await db.listGiveawaySponsors(gwId);
  const sponsorChats = sponsors.map(s => sponsorToChatId(s.sponsor_text)).filter(Boolean);

  const chats = [...new Set([mainChat, ...sponsorChats].filter(Boolean).map((x) => String(x)))];
  for (const chat of chats) {
    try { await redis.del(k(['cm', chat, userTgId])); } catch {}
  }
}

function buildWhyText({ gwId, targetUserId, check }) {
  const who = `<a href="tg://user?id=${Number(targetUserId)}">id:${Number(targetUserId)}</a>`;
  const ok = check.isEligible ? '✅ <b>Eligible</b>' : (check.unknown ? '❔ <b>Не могу проверить полностью</b>' : '⚠️ <b>Not eligible</b>');

  const lines = (check.results || []).map(r => {
    const ref = formatChatRef(r.chat);
    if (r.status === 'ok') return `✅ ${ref} — подписка OK`;
    if (r.status === 'no') return `❌ ${ref} — <b>нет подписки</b>`;
    return `❔ ${ref} — <b>не могу проверить</b> (нет доступа/приватный канал)`;
  });

  let help = 'Если участник подписался только что — пусть нажмёт “Проверить” заново.';
  if (check.unknown) help = 'Есть ❔: обычно это значит, что бот не админ в одном из каналов или канал приватный.';
  if (!check.isEligible && !check.unknown) help = 'Есть ❌: участник не подписан на один из каналов.';

  const text =
`ℹ️ <b>Почему не прошёл</b> · конкурс #${gwId}

Участник: ${who}
Результат: ${ok}

${lines.length ? lines.join('\n') : 'Нет каналов для проверки.'}

<i>${help}</i>`;
  return text;
}

export async function renderGwWhyResult(ctx, ownerUserId, gwId, targetUserId, { forceRecheck = false } = {}) {
  const g = await db.getGiveawayForOwner(gwId, ownerUserId);
  if (!g) {
    await safeEditOrReply(ctx, 'Нет доступа.');
    return;
  }

  if (forceRecheck) await clearEligibilityCacheForGw(gwId, targetUserId);

  const check = await doEligibilityCheck(ctx, gwId, targetUserId);
  const text = buildWhyText({ gwId, targetUserId, check });

  const kb = new InlineKeyboard()
    .text('🔄 Проверить ещё раз', `a:gw_why_recheck|i:${gwId}|tu:${Number(targetUserId)}`)
    .row()
    .text('🔎 Проверить другого', `a:gw_why_enter|i:${gwId}`)
    .row()
    .text('⬅️ Назад', `a:gw_stats|i:${gwId}`);

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
}

export async function sendGwWhyResult(ctx, ownerUserId, gwId, targetUserId, { forceRecheck = false } = {}) {
  const g = await db.getGiveawayForOwner(gwId, ownerUserId);
  if (!g) {
    await ctx.reply('Нет доступа.');
    return;
  }

  if (forceRecheck) await clearEligibilityCacheForGw(gwId, targetUserId);

  const check = await doEligibilityCheck(ctx, gwId, targetUserId);
  const text = buildWhyText({ gwId, targetUserId, check });

  const kb = new InlineKeyboard()
    .text('🔄 Проверить ещё раз', `a:gw_why_recheck|i:${gwId}|tu:${Number(targetUserId)}`)
    .row()
    .text('🔎 Проверить другого', `a:gw_why_enter|i:${gwId}`)
    .row()
    .text('⬅️ Назад', `a:gw_stats|i:${gwId}`);

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
}


async function ensureBotId(ctx) {
  if (CFG.BOT_ID) return CFG.BOT_ID;
  const me = await ctx.api.getMe();
  return me.id;
}

async function getChatMemberStateCached(ctx, chat, userTgId) {
  const cacheKey = k(['cm', chat, userTgId]);
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return String(cached);
  } catch {}

  let state = 'unknown';
  try {
    const cm = await ctx.api.getChatMember(chat, userTgId);
    const st = String(cm?.status || '');
    const ok = (st === 'member' || st === 'administrator' || st === 'creator' || st === 'restricted');
    state = ok ? 'ok' : 'no';
  } catch {
    state = 'unknown';
  }

  // IMPORTANT UX: do NOT cache negative too long, otherwise user subscribes but still sees ❌ for minutes.
  const ex = state === 'ok' ? 10 * 60 : 10;
  try {
    await redis.set(cacheKey, state, { ex });
  } catch {}
  return state;
}

async function doEligibilityCheck(ctx, gwId, userTgId) {
  // One check at a time per user+giveaway (avoid double-taps and Telegram retry storms)
  const resKey = k(['gw_check', gwId, userTgId]);
  const lockKey = k(['lock', 'gw_check', gwId, userTgId]);

  try {
    const cached = await redis.get(resKey);
    if (cached) return cached;
  } catch {}

  let lock = null;
  try {
    lock = await redis.set(lockKey, '1', { nx: true, ex: 15 });
  } catch {
    lock = null;
  }

  if (!lock) {
    // If a check is already running, return cached result if we have it; otherwise return a small "busy" payload.
    try {
      const cached = await redis.get(resKey);
      if (cached) return cached;
    } catch {}
    return { isEligible: false, unknown: true, results: [], firstBlocker: null, firstBlockerHandle: null, sponsors: [], busy: true };
  }

  try {
    // Always check the main giveaway channel (where the post is published), plus optional sponsor channels.
    let mainChat = null;
    try {
      const g = await db.getGiveawayInfoForUser(gwId);
      mainChat = g?.published_chat_id ?? g?.published_chat ?? g?.channel_id ?? null;
    } catch {}

    const sponsorRows = await db.listGiveawaySponsors(gwId);
    const sponsors = normalizeSponsorsList((sponsorRows || []).map((s) => s?.sponsor_text ?? s?.sponsorText ?? s));

    const sponsorChats = [];
    const chatToHandle = new Map();
    for (const s of sponsors) {
      const chat = sponsorToChatId(s);
      if (!chat) continue;
      sponsorChats.push(chat);
      // Prefer @handle for UI when possible
      chatToHandle.set(String(chat), (String(chat).startsWith('@') ? String(chat) : (String(s).startsWith('@') ? String(s) : null)));
    }

    const chats = [...new Set([mainChat, ...sponsorChats].filter(Boolean).map((x) => String(x)))];

    const results = [];
    let unknown = false;
    let firstBlocker = null;

    const checkChat = async (chat) => {
      const state = await getChatMemberStateCached(ctx, chat, userTgId);
      const handle = chatToHandle.get(String(chat)) || (String(chat).startsWith('@') ? String(chat) : null);
      return { chat, state, handle };
    };

    // Parallelize for small lists (feels snappier), and keep fail-fast for larger ones.
    if (chats.length <= 9) {  // ≤8 sponsors (+ main)
      const arr = await Promise.all(chats.map(checkChat));
      for (const r of arr) results.push({ chat: r.chat, state: r.state, handle: r.handle });
      const bad = arr.find((r) => r.state !== 'ok');
      if (bad) {
        firstBlocker = { chat: bad.chat, state: bad.state };
        if (bad.state === 'unknown') unknown = true;
      }
    } else {
      for (const chat of chats) {
        const r = await checkChat(chat);
        results.push({ chat: r.chat, state: r.state, handle: r.handle });
        if (r.state !== 'ok') {
          if (r.state === 'unknown') unknown = true;
          firstBlocker = { chat: r.chat, state: r.state };
          break;
        }
      }
    }

    const isEligible = results.length === chats.length && results.every((r) => r.state === 'ok') && !unknown;
    const firstBlockerHandle = firstBlocker ? (chatToHandle.get(String(firstBlocker.chat)) || (String(firstBlocker.chat).startsWith('@') ? String(firstBlocker.chat) : null)) : null;

    const payload = { isEligible, unknown, results, firstBlocker, firstBlockerHandle, sponsors };
    try {
      // Cache OK for longer; cache NO/UNKNOWN briefly (so subscribing updates quickly).
      const ttl = isEligible ? 60 : 10;
      await redis.set(resKey, payload, { ex: ttl });
    } catch {}

    return payload;
  } finally {
    try { await redis.del(lockKey); } catch {}
  }
}

async function renderSetupInstructions(ctx) {
  const text =
`🚀 <b>Подключение канала</b>

1) Добавь бота админом в свой канал.
2) Перешли сюда любой пост из канала (forward).

Бот создаст workspace и ты сможешь запускать конкурсы.`;
  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('⬅️ В меню', 'a:menu') });
}

export function getBot() {
  if (BOT) return BOT;
  assertEnv();
  const bot = new Bot(CFG.BOT_TOKEN);

  // P0 Observability: correlation id + structured logs (zero UI/behavior change).
  // IMPORTANT: this middleware never logs secrets and never logs arbitrary user text.
  bot.use(createLoggingMiddleware({ logger }));

  // Never log ctx/api/token. Log only safe identifiers.
  bot.catch((err) => {
    const ctx = err?.ctx;
    const cid = ctx?.state?.cid || `${ctx?.update?.update_id ?? 0}-${ctx?.from?.id ?? 0}`;
    logger.error({
      cid,
      update_id: ctx?.update?.update_id ?? null,
      chat_id: ctx?.chat?.id ?? null,
      from_id: ctx?.from?.id ?? null,
      username: ctx?.from?.username ?? null,
      err: {
        name: String(err?.error?.name || err?.name || 'Error'),
        message: String(err?.error?.message || err?.message || err?.error || err),
      },
    }, 'bot.error');
  });

  // --- TEXT INPUT router (expectText) ---

  // Setup channel expects a forwarded post (any message type). We handle it on `message`
  // so that photo/video-only forwards also work.
  bot.on('message', async (ctx, next) => {
    // Some update variants may not have ctx.from (e.g., anonymous/channel-sent messages).
    // In that case we must not touch Redis expectText state.
    if (!ctx.from) return next();
    const exp = await getExpectText(ctx.from.id);
    if (!exp || String(exp.type) !== 'setup_forward') return next();

    // If user sends a command while we ожидали форвард — не блокируем команду.
    const txt = String(ctx.message?.text || '');
    const isCommand = txt.startsWith('/') &&
      Array.isArray(ctx.message?.entities) &&
      ctx.message.entities.some((e) => e.type === 'bot_command' && e.offset === 0);
    if (isCommand) {
      await clearExpectText(ctx.from.id);
      return next();
    }

    await clearExpectText(ctx.from.id);

    const msg = ctx.message || {};
    const fo = msg.forward_origin || msg.forwardOrigin || null;

    let f = msg.forward_from_chat || msg.sender_chat || null;

    // Telegram Bot API (newer forwards): channel source may be present only in forward_origin.
    if ((!f || !f.id) && fo && typeof fo === 'object') {
      const chat = fo.chat || null;
      if (chat && chat.id) f = chat;
    }

    if (!f || !f.id) {
      await ctx.reply(
        `Не вижу форвард из канала.

Важно: нажми именно «Переслать / Forward» (со стрелкой), а не «Скопировать / Copy».
1) Добавь бота админом в канал
2) Перешли сюда любой пост из канала (чтобы было видно источник)

Если канал приватный — это тоже ок, главное именно форвард.`
      );
      await setExpectText(ctx.from.id, exp);
      return;
    }

    if (f.type && String(f.type) !== 'channel') {
      await ctx.reply('Нужно переслать пост именно из <b>канала</b> (не из чата/группы).', { parse_mode: 'HTML' });
      await setExpectText(ctx.from.id, exp);
      return;
    }

    const u = await db.upsertUser(ctx.from.id, ctx.from.username ?? null);

    const title = f.title || 'Channel';
    const channelUsername = f.username || null;

    const ws = await db.createWorkspace({ ownerUserId: u.id, title, channelId: f.id, channelUsername });
    await db.ensureWorkspaceSettings(ws.id);

    db.trackEvent('ws_created', { userId: u.id, wsId: ws.id, meta: { channelId: f.id, channelUsername } });
    await db.auditWorkspace(ws.id, u.id, 'ws.created', { title, channelId: f.id, channelUsername });

    await setActiveWorkspace(ctx.from.id, ws.id);

    const isCurator = await db.hasAnyCuratorRole(u.id);

    await ctx.reply(`✅ Канал подключен: <b>${escapeHtml(channelUsername ? '@' + channelUsername : title)}</b>`, {
      parse_mode: 'HTML',
      reply_markup: wsMenuKb(ws.id, { showCurator: isCurator }),
    });
  });



  // --- Why-not-eligible helper: expects a forwarded message from a participant (optional) ---
  bot.on('message', async (ctx, next) => {
    const exp = await getExpectText(ctx.from.id);
    if (!exp || String(exp.type) !== 'gw_why_forward') return next();

    const txt = String(ctx.message?.text || '');
    const isCommand = txt.startsWith('/') &&
      Array.isArray(ctx.message?.entities) &&
      ctx.message.entities.some((e) => e.type === 'bot_command' && e.offset === 0);
    if (isCommand) {
      await clearExpectText(ctx.from.id);
      return next();
    }

    const targetId = ctx.message?.forward_from?.id;
    if (!targetId) {
      await ctx.reply('Не вижу user_id в форварде (возможно у участника включена Forward privacy). Используй кнопку “Ввести ID” и пришли user_id цифрами.');
      await setExpectText(ctx.from.id, exp);
      return;
    }

    await clearExpectText(ctx.from.id);

    const u = await db.upsertUser(ctx.from.id, ctx.from.username ?? null);
    await sendGwWhyResult(ctx, u.id, Number(exp.gwId), Number(targetId), { forceRecheck: true });
  });



  
  // Support: accept text OR media (photo/screenshot) as one message.
  // Text is handled in message:text router; media is handled here.
  bot.on('message', async (ctx, next) => {
    if (!ctx.from) return next();

    const exp = await getExpectText(ctx.from.id);
    if (!exp || String(exp.type) !== 'support_any') return next();

    // Let text messages be handled by message:text router below
    if (ctx.message?.text) return next();

    // If user sends a command-like caption while we ожидали support — don't block commands
    const cap = String(ctx.message?.caption || '');
    const capIsCommand = cap.startsWith('/') &&
      Array.isArray(ctx.message?.caption_entities) &&
      ctx.message.caption_entities.some((e) => e.type === 'bot_command' && e.offset === 0);
    if (capIsCommand) {
      await clearExpectText(ctx.from.id);
      return next();
    }

    const hasPhoto = Array.isArray(ctx.message?.photo) && ctx.message.photo.length > 0;
    const hasDoc = !!ctx.message?.document;
    const hasVideo = !!ctx.message?.video;

    // We accept photo/document/video as "support media"
    if (!hasPhoto && !hasDoc && !hasVideo) {
      const backCb = expectBackCb(exp);
      await ctx.reply('Можно отправить текст или фото/скрин (лучше с подписью). Стикеры/голос не подойдут 🙏', {
        reply_markup: navKb(backCb),
      });
      // Keep ожидание ввода активным
      try { await setExpectText(ctx.from.id, exp); } catch {}
      return;
    }

    await clearExpectText(ctx.from.id);

    const u = await db.upsertUser(ctx.from.id, ctx.from.username ?? null);

    // Rate-limit: allow up to 2 support messages per 5 minutes per user (text+media)
    const rlKey = k(['rl', 'support_any', String(u.id)]);
    const rl = await rateLimit(rlKey, { limit: 2, windowSec: 5 * 60 });
    if (!rl.allowed) {
      const backCb = expectBackCb(exp);
      await ctx.reply(`⏳ Слишком часто. Подожди ${fmtWait(rl.resetSec || 60)}.`, { reply_markup: navKb(backCb) });
      return;
    }

    const admins = Array.isArray(CFG.SUPER_ADMIN_TG_IDS) ? CFG.SUPER_ADMIN_TG_IDS : [];
    if (!admins.length) {
      const backCb = expectBackCb(exp);
      await ctx.reply('⚠️ Поддержка не настроена. Напиши владельцу бота.', { reply_markup: navKb(backCb) });
      return;
    }

    const mode = await resolveUiMode(ctx.from.id);
    const modeHuman = uiModeHuman(mode);
    const uname = ctx.from?.username ? `@${ctx.from.username}` : '—';
    const fullName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ').trim() || '—';

    // best-effort detect manager state
    let bmEnabled = false;
    let bmBrand = '';
    try {
      const bm = await resolveBmBrandContext(ctx, u, { requirePickWhenMissingActive: false });
      bmEnabled = !!bm.enabled;
      bmBrand = bm.brandLabel ? String(bm.brandLabel) : '';
    } catch {}

    const kind = hasPhoto ? 'photo' : (hasDoc ? 'document' : 'video');
    const caption = String(ctx.message?.caption || '').trim();
    const safeCap = caption.length > 800 ? (caption.slice(0, 800) + '…') : caption;

    const header = `💬 <b>Support</b> (media)

` +
      `От: <b>${escapeHtml(fullName)}</b> (${escapeHtml(uname)})
` +
      `TG ID: <code>${ctx.from.id}</code>
` +
      `User ID: <code>${u.id}</code>
` +
      `Mode: <b>${escapeHtml(modeHuman)}</b>${bmEnabled ? ' · <b>Brand Manager</b>' : ''}${bmBrand ? `
Brand: <b>${escapeHtml(bmBrand)}</b>` : ''}
` +
      `Type: <code>${escapeHtml(kind)}</code>
` +
      `Time: <code>${new Date().toISOString()}</code>
` +
      (safeCap ? `
<b>Caption:</b>
${escapeHtml(safeCap)}
` : '');

    let sent = 0;
    for (const a of admins) {
      const adminId = Number(a || 0);
      if (!adminId || adminId == ctx.from.id) continue;
      try {
        // Send header first
        await ctx.api.sendMessage(adminId, header, { parse_mode: 'HTML', disable_web_page_preview: true });

        // Copy original media message (preserves attachment)
        try {
          await ctx.api.copyMessage(adminId, ctx.chat.id, ctx.message.message_id);
        } catch {
          // Fallback: forwardMessage if copyMessage fails
          try { await ctx.api.forwardMessage(adminId, ctx.chat.id, ctx.message.message_id); } catch {}
        }

        sent += 1;
      } catch {}
    }

    const backCb = expectBackCb(exp);
    if (sent > 0) {
      await ctx.reply('✅ Отправлено в поддержку. Если нужно — нажми «💬 Поддержка» и отправь уточнение (текстом).', {
        reply_markup: navKb(backCb),
      });
    } else {
      await ctx.reply('⚠️ Не удалось отправить в поддержку. Попробуй позже или напиши владельцу.', {
        reply_markup: navKb(backCb),
      });
    }
    return;
  });

// Generic non-text guard for expectText steps
  // If we are waiting for a text input and user sends sticker/photo/voice/etc,
  // respond with a helpful hint + navigation buttons (Back/Menu), instead of a dead-end text.
  bot.on('message', async (ctx, next) => {
    if (!ctx.from) return next();

    const exp = await getExpectText(ctx.from.id);
    if (!exp) return next();
    // Text messages are handled by message:text router below
    if (ctx.message?.text) return next();
    const t = String(exp.type || '');
    // Some expectText steps actually expect media/forwarded messages — do not intercept those.
    if (t === 'setup_forward' || t === 'gw_why_forward') return next();
    if (t.endsWith('_photo') || t.endsWith('_gif') || t.endsWith('_video')) return next();

    const backCb = expectBackCb(exp);
    await ctx.reply('Я жду текст одним сообщением. Пожалуйста, напиши текст (не голос/стикер/фото).', {
      reply_markup: navKb(backCb),
    });
    // Keep ожидание ввода активным (обновим TTL на всякий случай)
    try { await setExpectText(ctx.from.id, exp); } catch {}
  });
  bot.on('message:text', async (ctx, next) => {
    if (!ctx.from) return next();
    const text = String(ctx.message?.text || '');
    const isCommand = text.startsWith('/') &&
      Array.isArray(ctx.message?.entities) &&
      ctx.message.entities.some((e) => e.type === 'bot_command' && e.offset === 0);

    const exp = await getExpectText(ctx.from.id);
if (!exp) {
  if (isCommand) return next(); // allow commands like /start to reach bot.command()
  const flags = await getRoleFlags(null, ctx.from.id);
  await renderMainMenu(ctx, flags, { edit: false });
  return;
}

    // If user sends a command while мы ждали ввод — не блокируем команду.
    if (isCommand) {
      await clearExpectText(ctx.from.id);
      return next();
    }

    const u = await db.upsertUser(ctx.from.id, ctx.from.username ?? null);
    const tgId = Number(ctx.from.id);
    await clearExpectText(ctx.from.id);

// Default navigation keyboard for any "text input" step.
// Prevents "what next?" dead-ends when we ask user to type something.
const backCb = expectBackCb(exp);
const _reply = ctx.reply.bind(ctx);
ctx.reply = (text, extra) => {
  const opts = extra ? { ...extra } : {};
  if (!opts.reply_markup) opts.reply_markup = navKb(backCb);
  return _reply(text, opts);
};



// Support message (send to SUPER_ADMIN_TG_IDS)
    if (exp.type === 'support_any') {
      const txt = String(ctx.message?.text || '').trim();
      if (!txt) {
        await ctx.reply('Напиши текст одним сообщением.');
        try { await setExpectText(ctx.from.id, exp); } catch {}
        return;
      }

      // Rate-limit: 1 support message per 5 minutes per user
      const rlKey = k(['rl', 'support_any', String(u.id)]);
      const rl = await rateLimit(rlKey, { limit: 1, windowSec: 5 * 60 });
      if (!rl.allowed) {
        await ctx.reply(`⏳ Слишком часто. Подожди ${fmtWait(rl.resetSec || 60)}.`);
        return;
      }

      const admins = Array.isArray(CFG.SUPER_ADMIN_TG_IDS) ? CFG.SUPER_ADMIN_TG_IDS : [];
      if (!admins.length) {
        await ctx.reply('⚠️ Поддержка не настроена. Напиши владельцу бота.');
        return;
      }

      const mode = await resolveUiMode(ctx.from.id);
      const modeHuman = uiModeHuman(mode);
      const uname = ctx.from?.username ? `@${ctx.from.username}` : '—';
      const fullName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ').trim() || '—';

      // best-effort detect manager state
      let bmEnabled = false;
      let bmBrand = '';
      try {
        const bm = await resolveBmBrandContext(ctx, u, { requirePickWhenMissingActive: false });
        bmEnabled = !!bm.enabled;
        bmBrand = bm.brandLabel ? String(bm.brandLabel) : '';
      } catch {}

      const safe = txt.length > 3500 ? (txt.slice(0, 3500) + '…') : txt;

      const header = `💬 <b>Support</b>

` +
        `От: <b>${escapeHtml(fullName)}</b> (${escapeHtml(uname)})
` +
        `TG ID: <code>${ctx.from.id}</code>
` +
        `User ID: <code>${u.id}</code>
` +
        `Mode: <b>${escapeHtml(modeHuman)}</b>${bmEnabled ? ' · <b>Brand Manager</b>' : ''}${bmBrand ? `
Brand: <b>${escapeHtml(bmBrand)}</b>` : ''}
` +
        `Time: <code>${new Date().toISOString()}</code>

` +
        `<b>Сообщение:</b>
${escapeHtml(safe)}`;

      let sent = 0;
      for (const a of admins) {
        const adminId = Number(a || 0);
        if (!adminId || adminId == ctx.from.id) continue;
        try {
          await ctx.api.sendMessage(adminId, header, { parse_mode: 'HTML', disable_web_page_preview: true });
          sent += 1;
        } catch {}
      }

      if (sent > 0) {
        await ctx.reply('✅ Отправлено в поддержку. Если нужно — нажми «💬 Поддержка» → «✍️ Написать в поддержку» и отправь уточнение.');
      } else {
        await ctx.reply('⚠️ Не удалось отправить в поддержку. Попробуй позже или напиши владельцу.');
      }
      return;
    }

// Add curator by username
    if (exp.type === 'curator_username') {
      const txt = String(ctx.message.text || '').trim();
      const m = txt.match(/^@?([a-zA-Z0-9_]{5,})$/);
      if (!m) {
        await ctx.reply('Введи @username (пример: @zarinka)');
        return;
      }
      const username = m[1];
      const curator = await db.findUserByUsername(username);
      if (!curator) {
        await ctx.reply(`⚠️ Эта функция требует, чтобы пользователь уже запускал бота.
Попроси его открыть бота и нажать /start, потом повтори добавление.`);
        return;
      }
      await db.addCurator(exp.wsId, curator.id, u.id);
      const ws = await db.getWorkspaceAny(Number(exp.wsId));
      const wsTitle = ws ? wsLabelNice(ws) : `Канал #${exp.wsId}`;
      await renderCuratorManage(ctx, u.id, exp.wsId, { notice: `Куратор @${username} добавлен` });

      // best-effort notify curator in DM
      try {
        const kb = new InlineKeyboard()
          .text('👤 Открыть кабинет куратора', 'a:cur_home')
          .row()
          .text('🧹 Включить режим куратора', `a:cur_mode_set|v:1|ret:cur`)
          .row()
          .text('🗑 Убрать', 'a:nd')
          .row()
          .text('🏠 Главное меню', 'a:menu');

        await ctx.api.sendMessage(
          Number(curator.tg_id),
          `✅ Тебя назначили <b>куратором</b> для: <b>${escapeHtml(wsTitle)}</b>.

Открой кабинет куратора — там будут каналы и конкурсы, где нужна твоя помощь.`,
          { parse_mode: 'HTML', reply_markup: kb }
        );
      } catch {}
      return;
    }

    // Add brand manager by username (Brand Team)
    if (exp.type === 'bm_username') {
      const txt = String(ctx.message.text || '').trim();
      const m = txt.match(/^@?([a-zA-Z0-9_]{5,})$/);
      if (!m) {
        await ctx.reply('Введи @username (пример: @manager)');
        return;
      }
      const username = m[1];

      // Brand Team access guard (owner-only + unlock)
      const bm = await resolveBmBrandContext(ctx, u, { requirePickWhenMissingActive: false });
      if (bm.dbMissing) {
        await ctx.reply('⚠️ Не найдена таблица brand_managers. Примените миграцию 026_brand_managers.sql в Neon.');
        return;
      }
      if (bm.enabled && bm.brandUserId !== u.id) {
        await ctx.reply('⛔️ Недостаточно прав. Добавлять менеджеров может только владелец бренда.');
        return;
      }

      const st = await getBrandTeamGateState(u.id);
      if (!st.ok) {
        const miss = st.missingBasic && st.missingBasic.length ? ` (не хватает: ${st.missingBasic.join(', ')})` : '';
        const profileLine = `• Профиль: ${st.basicDone || 0}/4${miss}`;
        const payLine = `• Покупка: ${st.paidOk ? '✅' : '❌'} (Brand Pass / Brand Plan)`;

        await ctx.reply(
          `👥 <b>Менеджеры бренда</b>

` +
          `Раздел доступен после заполнения профиля бренда и покупки Brand Pass/Plan.

` +
          `${escapeHtml(profileLine)}
${escapeHtml(payLine)}

` +
          `Открой профиль, заполни базовые поля и оформи Brand Pass или Brand Plan — после этого сможешь добавлять менеджеров.`,
          { parse_mode: 'HTML', reply_markup: brandTeamLockedKb() }
        );
        return;
      }

      const manager = await db.findUserByUsername(username);
      if (!manager) {
        await ctx.reply(`⚠️ Эта функция требует, чтобы пользователь уже запускал бота.
Попроси его открыть бота и нажать /start, потом повтори добавление.`);
        return;
      }
      const brandUserId = u.id; // brand owner is the current user
      if (manager.id === brandUserId) {
        await ctx.reply('Это твой аккаунт. Нельзя добавить самого себя менеджером.');
        return;
      }
      await db.addBrandManager(brandUserId, manager.id, u.id);
      await ctx.reply(`✅ Менеджер @${username} добавлен в команду бренда.`);
      // best-effort notify manager
      try {
        const kb = new InlineKeyboard()
          .text('🧑‍💼 Открыть кабинет менеджера', 'a:bm_home')
          .row()
          .text('🗑 Убрать', 'a:nd')
          .row()
          .text('🏠 Главное меню', 'a:menu');
        await ctx.api.sendMessage(
          Number(manager.tg_id),
          `✅ Тебя добавили в <b>команду бренда</b>.

Нажми <b>«🧑‍💼 Открыть кабинет менеджера»</b> — там будут Inbox и поиск креаторов.`,
          { parse_mode: 'HTML', reply_markup: kb }
        );
      } catch {}
      return;
    }

    // Curator note (safe): store last note for the giveaway
    if (exp.type === 'curator_note') {
      const wsId = Number(exp.wsId || 0);
      const gwId = Number(exp.gwId || 0);
      if (!wsId || !gwId) {
        await ctx.reply('⚠️ Не могу сохранить заметку: нет данных конкурса.');
        return;
      }

      let noteText = String(ctx.message.text || '').trim();
      if (!noteText || noteText.length < 2) {
        await ctx.reply('Пришли заметку одним сообщением (минимум 2 символа).');
        await setExpectText(ctx.from.id, exp);
        return;
      }
      if (noteText.length > 400) noteText = noteText.slice(0, 400);

      const g = await db.getGiveawayForCurator(gwId, u.id);
      if (!g || Number(g.workspace_id) !== wsId) {
        await ctx.reply('Нет доступа.');
        return;
      }

      const meta = {
        text: noteText,
        by_tg_id: Number(ctx.from.id),
        by_username: ctx.from.username ?? null,
        by_name: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ').trim(),
        at: Date.now()
      };

      await setCurGwNote(gwId, meta);
      try {
        await db.auditGiveaway(gwId, Number(g.workspace_id), u.id, 'curator.note', {
          by_tg_id: meta.by_tg_id,
          by_username: meta.by_username,
          by_name: meta.by_name,
          text: noteText,
          len: noteText.length
        });
      } catch {}

      const kb = new InlineKeyboard()
        .text('⬅️ Назад к конкурсу', `a:cur_gw_open|ws:${wsId}|i:${gwId}`)
        .row()
        .text('🧹 Кураторы блогера', 'a:cur_home');

      await ctx.reply('✅ Заметка сохранена.', { reply_markup: kb });
      return;
    }




    // Giveaway: why not eligible (owner tool)
    if (exp.type === 'gw_why_userid') {
      const gwId = Number(exp.gwId);
      const m = String(ctx.message.text || '').match(/(\d{5,})/);
      if (!m) {
        await ctx.reply('Пришли user_id цифрами (пример: 611377976).');
        await setExpectText(ctx.from.id, exp);
        return;
      }
      const targetId = Number(m[1]);
      await sendGwWhyResult(ctx, u.id, gwId, targetId, { forceRecheck: true });
      return;
    }



    // Workspace folders (owner/editor)
    if (exp.type === 'folder_create_title') {
      const wsId = Number(exp.wsId);
      const titleRaw = String(ctx.message.text || '').trim();
      const title = titleRaw.slice(0, 40);
      if (!title || title.length < 2) {
        await ctx.reply('Название папки: минимум 2 символа.');
        await setExpectText(ctx.from.id, exp);
        return;
      }

      const access = await getFolderAccess(u.id, wsId);
      if (!access || !access.canEdit) {
        await ctx.reply('Нет доступа.');
        return;
      }

      try {
        const folder = await db.createChannelFolder(wsId, u.id, title);
        await db.auditWorkspace(wsId, u.id, 'folders.created', { folderId: folder.id });

        const kb = new InlineKeyboard()
          .text('📁 Открыть папку', `a:folder_open|ws:${wsId}|f:${folder.id}`)
          .row()
          .text('📁 Все папки', `a:folders_home|ws:${wsId}`);

        await ctx.reply(`✅ Папка создана: <b>${escapeHtml(title)}</b>`, { parse_mode: 'HTML', reply_markup: kb });
        return;
      } catch (e) {
        const msg = String(e?.message || e || '');
        if (msg.includes('uniq_channel_folders_workspace_title')) {
          await ctx.reply('Такая папка уже есть. Дай другое название.');
          await setExpectText(ctx.from.id, exp);
          return;
        }
        await ctx.reply('Не получилось создать папку. Попробуй ещё раз.');
        await setExpectText(ctx.from.id, exp);
        return;
      }
    }

    if (exp.type === 'folder_add_items') {
      const wsId = Number(exp.wsId);
      const folderId = Number(exp.folderId);

      const access = await getFolderAccess(u.id, wsId);
      if (!access || !access.canEdit) {
        await ctx.reply('Нет доступа.');
        return;
      }

      const folder = await db.getChannelFolder(folderId);
      if (!folder || Number(folder.workspace_id) !== Number(wsId)) {
        await ctx.reply('Папка не найдена.');
        return;
      }

      const isPro = await db.isWorkspacePro(wsId);
      const max = isPro ? Number(CFG.WORKSPACE_FOLDER_MAX_ITEMS_PRO) : Number(CFG.WORKSPACE_FOLDER_MAX_ITEMS_FREE);
      const current = Number(folder.items_count || 0);
      const left = Math.max(0, max - current);
      if (left <= 0) {
        await ctx.reply(`Лимит этой папки: <b>${max}</b>. Удалите часть каналов или включите ⭐️ PRO.`, { parse_mode: 'HTML' });
        return;
      }

      let items = parseSponsorsFromText(ctx.message.text).map(x => String(x).toLowerCase());
      if (!items.length) {
        await ctx.reply('Пришли список @каналов или ссылок t.me (через пробел/перенос строки).');
        await setExpectText(ctx.from.id, exp);
        return;
      }

      let truncated = false;

      if (items.length > left) {
        items = items.slice(0, left);
        truncated = true;
      }

      const res = await db.addChannelFolderItems(folderId, items);
      await db.auditWorkspace(wsId, u.id, 'folders.items_added', { folderId, added: res.added });

      const kb = new InlineKeyboard()
        .text('📁 Открыть папку', `a:folder_open|ws:${wsId}|f:${folderId}`)
        .row()
        .text('📁 Все папки', `a:folders_home|ws:${wsId}`);

      const tail = truncated ? `

⚠️ Влезло только <b>${left}</b> (лимит папки: <b>${max}</b>).` : '';
      await ctx.reply(`✅ Добавлено: <b>${res.added}</b>${tail}`, { parse_mode: 'HTML', reply_markup: kb });
      return;
    }

    if (exp.type === 'folder_remove_items') {
      const wsId = Number(exp.wsId);
      const folderId = Number(exp.folderId);

      const access = await getFolderAccess(u.id, wsId);
      if (!access || !access.canEdit) {
        await ctx.reply('Нет доступа.');
        return;
      }

      const folder = await db.getChannelFolder(folderId);
      if (!folder || Number(folder.workspace_id) !== Number(wsId)) {
        await ctx.reply('Папка не найдена.');
        return;
      }

      const items = parseSponsorsFromText(ctx.message.text).map(x => String(x).toLowerCase());
      if (!items.length) {
        await ctx.reply('Пришли список @каналов, которые удалить.');
        await setExpectText(ctx.from.id, exp);
        return;
      }

      const res = await db.removeChannelFolderItems(folderId, items);
      await db.auditWorkspace(wsId, u.id, 'folders.items_removed', { folderId, removed: res.removed });

      const kb = new InlineKeyboard()
        .text('📁 Открыть папку', `a:folder_open|ws:${wsId}|f:${folderId}`)
        .row()
        .text('📁 Все папки', `a:folders_home|ws:${wsId}`);

      await ctx.reply(`✅ Удалено: <b>${res.removed}</b>`, { parse_mode: 'HTML', reply_markup: kb });
      return;
    }

    if (exp.type === 'folder_rename_title') {
      const wsId = Number(exp.wsId);
      const folderId = Number(exp.folderId);

      const access = await getFolderAccess(u.id, wsId);
      if (!access || !access.canEdit) {
        await ctx.reply('Нет доступа.');
        return;
      }

      const titleRaw = String(ctx.message.text || '').trim();
      const title = titleRaw.slice(0, 40);
      if (!title || title.length < 2) {
        await ctx.reply('Название папки: минимум 2 символа.');
        await setExpectText(ctx.from.id, exp);
        return;
      }

      try {
        const folder = await db.getChannelFolder(folderId);
        if (!folder || Number(folder.workspace_id) !== Number(wsId)) {
          await ctx.reply('Папка не найдена.');
          return;
        }

        await db.renameChannelFolder(folderId, title);
        await db.auditWorkspace(wsId, u.id, 'folders.renamed', { folderId });

        const kb = new InlineKeyboard()
          .text('📁 Открыть папку', `a:folder_open|ws:${wsId}|f:${folderId}`)
          .row()
          .text('📁 Все папки', `a:folders_home|ws:${wsId}`);

        await ctx.reply(`✅ Переименовано: <b>${escapeHtml(title)}</b>`, { parse_mode: 'HTML', reply_markup: kb });
        return;
      } catch (e) {
        const msg = String(e?.message || e || '');
        if (msg.includes('uniq_channel_folders_workspace_title')) {
          await ctx.reply('Такая папка уже есть. Дай другое название.');
          await setExpectText(ctx.from.id, exp);
          return;
        }
        await ctx.reply('Не получилось переименовать. Попробуй ещё раз.');
        await setExpectText(ctx.from.id, exp);
        return;
      }
    }

    if (exp.type === 'ws_editor_username') {
      const wsId = Number(exp.wsId);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) {
        await ctx.reply('Нет доступа.');
        return;
      }

      const uname = String(ctx.message.text || '').trim();
      const m = uname.match(/^@?([a-zA-Z0-9_]{5,})$/);
      if (!m) {
        await ctx.reply('Формат: @username');
        await setExpectText(ctx.from.id, exp);
        return;
      }

      const target = await db.findUserByUsername(m[1]);
      if (!target) {
        await ctx.reply('Пользователь не найден в базе. Попроси его открыть бота и нажать /start, затем повтори.');
        await setExpectText(ctx.from.id, exp);
        return;
      }

      await db.addWorkspaceEditor(wsId, target.id, u.id);
      await db.auditWorkspace(wsId, u.id, 'ws.editor_added', { userId: target.id });

      const kb = new InlineKeyboard()
        .text('👥 Editors', `a:ws_editors|ws:${wsId}`)
        .row()
        .text('📁 Папки', `a:folders_home|ws:${wsId}`);

      await ctx.reply(`✅ Добавил редактора: <b>@${escapeHtml(target.tg_username || m[1])}</b>`, { parse_mode: 'HTML', reply_markup: kb });
      return;
    }



    
    // Brand lead from public profile (vitrina) — 2-step (contact -> request)
    if (exp.type === 'wsp_lead_step1') {
      const wsId = Number(exp.wsId || 0);
      const ws = await db.getWorkspaceAny(wsId);
      if (!ws) {
        await ctx.reply('Профиль не найден.');
        return;
      }

      const contact = String(ctx.message.text || '').trim();
      if (!contact || contact.length < 2) {
        await ctx.reply('Шаг 1/2: пришли контакт бренда (IG / @username / ссылка / сайт).\nПример: https://instagram.com/brand или @brand');
        await setExpectText(ctx.from.id, exp);
        return;
      }

      await setExpectText(ctx.from.id, { type: 'wsp_lead_step2', wsId, contact: contact.slice(0, 200) });
      await renderWsLeadCompose(ctx, wsId, 2, { contact: contact.slice(0, 200) });
      return;
    }

    if (exp.type === 'wsp_lead_step2') {
      const wsId = Number(exp.wsId || 0);
      const ws = await db.getWorkspaceAny(wsId);
      if (!ws) {
        await ctx.reply('Профиль не найден.');
        return;
      }

      // Anti-spam: 1 lead per N minutes per (workspace + brand)
      const leadLim = Number(CFG.BRAND_LEAD_RATE_LIMIT || 0);
      const leadWin = Number(CFG.BRAND_LEAD_RATE_WINDOW_SEC || 0);
      if (Number.isFinite(leadLim) && leadLim > 0 && Number.isFinite(leadWin) && leadWin > 0) {
        const rl = await rateLimit(k(['rl', 'brandLead', wsId, tgId]), { limit: leadLim, windowSec: leadWin });
        if (!rl.allowed) {
          const mins = Math.max(1, Math.ceil(leadWin / 60));
          const waitMins = Math.max(1, Math.ceil((rl.resetSec || leadWin) / 60));
          const kb = new InlineKeyboard()
            .text('⬅️ Назад к витрине', `a:wsp_open|ws:${wsId}`)
            .text('📋 Меню', 'a:menu');
          await ctx.reply(
            `⏳ Слишком часто. Можно отправлять <b>${leadLim}</b> заявку каждые <b>${mins}</b> мин в одну витрину.\nПопробуй снова через <b>${waitMins}</b> мин.`,
            { parse_mode: 'HTML', reply_markup: kb }
          );
          return;
        }
      }

      const details = String(ctx.message.text || '').trim();
      if (!details || details.length < 3) {
        await ctx.reply('Шаг 2/2: опиши запрос чуть подробнее (UGC/интеграция, сроки, условия).');
        await setExpectText(ctx.from.id, exp);
        return;
      }

      const brandName = String(exp.brandName || '').trim() || String(exp.contact || '').trim() || ([ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || null);

      const lead = await db.createBrandLead({
        workspaceId: wsId,
        ownerUserId: Number(ws.owner_user_id),
        brandUserId: Number(u.id),
        brandTgId: tgId,
        brandUsername: ctx.from.username || null,
        brandName,
        message: details,
        meta: { contact: String(exp.contact || '').trim() || null, brand_profile: (exp.brandName || exp.brandLink) ? { brand_name: exp.brandName || null, brand_link: exp.brandLink || null, contact: String(exp.contact || '').trim() || null } : null, from: { tg_id: tgId, username: ctx.from.username || null } }
      });

      const owner = await db.getUserById(Number(ws.owner_user_id));
      const targets = new Set();
      if (owner?.tg_id) targets.add(Number(owner.tg_id));
      for (const id of (CFG.SUPER_ADMIN_TG_IDS || [])) targets.add(Number(id));
      targets.delete(Number(tgId));

      const channel = ws.channel_username ? '@' + ws.channel_username : ws.title;
      const link = wsBrandLink(wsId);

      const ig = ws.profile_ig ? String(ws.profile_ig).replace(/^@/, '') : null;
      const igUrl = ig ? `https://instagram.com/${ig}` : null;

      const who = ctx.from.username ? '@' + ctx.from.username : (brandName || 'brand');

      const contactLine = exp.contact ? `Контакт бренда: <b>${escapeHtml(String(exp.contact).slice(0, 200))}</b>\n` : '';

      const notif =
        `🆕 <b>Новая заявка от бренда</b>\n\n` +
        `Кому: <b>${escapeHtml(String(ws.profile_title || channel))}</b>\n` +
        `Канал: <b>${escapeHtml(channel)}</b>\n` +
        (link ? `Витрина: <a href="${escapeHtml(link)}">${escapeHtml(link)}</a>\n` : '') +
        (igUrl ? `IG: <a href="${escapeHtml(String(igUrl))}">${escapeHtml(shortUrl(String(igUrl)))}</a>\n` : '') +
        contactLine +
        `От: <b>${escapeHtml(String(who))}</b> (<code>${tgId}</code>)\n\n` +
        `<b>Запрос:</b>\n${escapeHtml(details)}`;

      const kb = new InlineKeyboard()
        .text('🔎 Открыть', `a:lead_view|id:${lead.id}|ws:${wsId}|s:new|p:0`)
        .text('⚡ Шаблоны', `a:lead_tpls|id:${lead.id}|ws:${wsId}|s:new|p:0`)
        .row()
        .text('✍️ Ответить', `a:lead_reply|id:${lead.id}|ws:${wsId}|s:new|p:0`)
        .row()
        .text('👤 Профиль', `a:ws_profile|ws:${wsId}`);

      let sent = 0;
      let failed = 0;

      for (const toId of targets) {
        try {
          await ctx.api.sendMessage(toId, notif, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
          sent++;
        } catch (e) {
          failed++;
          try { console.error('[LEAD_NOTIFY] failed', { toId, wsId, leadId: lead.id, err: String(e?.message || e) }); } catch {}
        }
      }

      const backKb = new InlineKeyboard()
        .text('⬅️ Назад к витрине', `a:wsp_open|ws:${wsId}`)
        .text('📋 Меню', 'a:menu');

      if (sent > 0) {
        await ctx.reply('✅ Заявка отправлена. Уведомление владельцу доставлено.', { reply_markup: backKb });
      } else if (targets.size === 0) {
        await ctx.reply('✅ Заявка отправлена. (Тест) Ты отправил заявку с аккаунта владельца — уведомление не требуется.', { reply_markup: backKb });
      } else {
        await ctx.reply(
          '⚠️ Заявка отправлена, но уведомление владельцу НЕ доставлено.\n\n' +
          'Проверь: владелец открыл бота /start (чтобы бот мог писать ему) и не блокировал бота.\n' +
          'Если нужно — SUPER_ADMIN тоже получит уведомление (если указан в ENV).',
          { reply_markup: backKb }
        );
      }
      return;
    }

// Reply to brand lead (owner / SUPER_ADMIN)
    if (exp.type === 'lead_reply') {
      const leadId = Number(exp.leadId || 0);
      const lead = await db.getBrandLeadById(leadId);
      if (!lead) {
        await ctx.reply('Заявка не найдена.');
        return;
      }







      const ws = await db.getWorkspaceAny(Number(lead.workspace_id));
      if (!ws) {
        await ctx.reply('Канал не найден.');
        return;
      }

      const isOwner = Number(ws.owner_user_id) === Number(u.id);
      const isAdmin = isSuperAdminTg(tgId);
      if (!isOwner && !isAdmin) {
        await ctx.reply('Нет доступа.');
        return;
      }

      const replyText = String(ctx.message.text || '').trim();
      if (!replyText || replyText.length < 1) {
        await ctx.reply('Напиши ответ текстом.');
        return;
      }

      await safeDeleteIncomingUserMessage(ctx);

      await safeLeadWrite(() => db.markBrandLeadReplied(leadId, replyText, Number(u.id)), { op: 'lead_mark_replied', leadId });
      if (String(lead.status) === 'new') await safeLeadWrite(() => db.updateBrandLeadStatus(leadId, 'in_progress'), { op: 'lead_status', leadId, st: 'in_progress' });

      const fromName = String(ws.profile_title || ws.title || 'Креатор');

      // Gate contacts in replies to prevent free bypass.
      let brandCredits = 0;
      try {
        const uid = Number(lead.brand_user_id || 0);
        if (uid) brandCredits = await db.getBrandCredits(uid);
        else if (lead.brand_tg_id) brandCredits = await db.getBrandCreditsByTgId(Number(lead.brand_tg_id));
      } catch {}

      const lockHint = contactsLockedHintHtml(Number(brandCredits || 0) > 0);

      const out =
        `💬 <b>Ответ по заявке #${leadId}</b>\n\n` +
        `🧑‍🎨 Креатор: <b>${escapeHtml(String(fromName))}</b>\n\n` +
        `${escapeHtml(clipText(replyText, 2800))}\n\n` +
        `${lockHint}`;

      const kbToBrand = brandReplyKb(ws, Number(ws.id), brandCredits, leadId);

      try {
        await ctx.api.sendMessage(Number(lead.brand_tg_id), out, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: kbToBrand,
        });
      } catch {}

      // Persist in-brand thread for the brand-side dialog
      await appendBrandLeadThread(leadId, 'creator', replyText);

      const rPart = exp.ret ? retPartShort(String(exp.ret)) : '';

      const kb = new InlineKeyboard()
        .text('🔎 Открыть заявку', `a:lead_view|id:${leadId}|ws:${Number(ws.id)}|s:${String(exp.backStatus || 'new')}|p:${Number(exp.backPage || 0)}${rPart}`)
        .text('📨 Заявки', `a:ws_leads|ws:${Number(ws.id)}|s:${String(exp.backStatus || 'new')}|p:${Number(exp.backPage || 0)}${rPart}`);

      await clearExpectText(ctx.from.id);

      await ctx.reply('✅ Ответ отправлен бренду.', { reply_markup: kb });
      return;
    }

    



    if (exp.type === 'blead_reply') {
      const leadId = Number(exp.leadId || 0);
      const wsId = Number(exp.wsId || 0);
      const msg = String(ctx.message.text || '').trim();

      if (!leadId) {
        await clearExpectText(ctx.from.id);
        return ctx.reply('⚠️ Не удалось отправить сообщение: не найден leadId.');
      }
      if (msg.length < 2) return ctx.reply('⚠️ Сообщение слишком короткое.');
      if (msg.length > 2000) return ctx.reply('⚠️ Слишком длинно. Укороти до 2000 символов.');

      await safeDeleteIncomingUserMessage(ctx);

      const lead = await db.getBrandLeadById(leadId);
      if (!lead) {
        await clearExpectText(ctx.from.id);
        return ctx.reply('⚠️ Заявка не найдена.');
      }

      const brandOk = Number(lead.brand_user_id || 0) === Number(u.id) || Number(lead.brand_tg_id || 0) === Number(ctx.from.id);
      if (!brandOk) {
        await clearExpectText(ctx.from.id);
        return ctx.reply('⚠️ Нет доступа к этой заявке.');
      }

      await appendBrandLeadThread(leadId, 'brand', msg);

      // Notify owner + curators
      const ws = await db.getWorkspaceAny(Number(lead.workspace_id));
      const fromBrand = String(lead.brand_name || lead.brand_username || 'Бренд').trim() || 'Бренд';
      const out =
        `💬 <b>Сообщение от бренда по заявке #${leadId}</b>

` +
        `🧑‍🎨 Креатор: <b>${escapeHtml(String(ws?.profile_title || ws?.title || ''))}</b>
` +
        `🏷️ Бренд: <b>${escapeHtml(fromBrand)}</b>

` +
        `${escapeHtml(clipText(msg, 2800))}`;

      const leadOpenCb = `a:lead_view|id:${leadId}|w:${Number(lead.workspace_id)}|s:n|p:0|r:wo`;
      const leadReplyCb = `a:lead_reply|id:${leadId}|w:${Number(lead.workspace_id)}|s:n|p:0|r:wo`;
      const kb = new InlineKeyboard().text('👀 Открыть', leadOpenCb).text('✍️ Ответить', leadReplyCb);

      const recipients = []
      try {
        const owner = await db.getUserById(Number(lead.owner_user_id));
        if (owner?.tg_id) recipients.push(Number(owner.tg_id));
      } catch {}
      try {
        const curators = await db.listCurators(Number(lead.workspace_id));
        for (const c of (curators || [])) {
          const tid = Number(c?.tg_id || 0);
          if (tid) recipients.push(tid);
        }
      } catch {}

      const uniq = [...new Set(recipients)].filter((x) => Number.isFinite(x) && x > 0);
      for (const tid of uniq) {
        try {
          await ctx.api.sendMessage(tid, out, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb });
        } catch {}
      }

      await clearExpectText(ctx.from.id);
      await ctx.reply('✅ Отправлено креатору.', { reply_markup: new InlineKeyboard().text('💬 Диалог', `a:blead_view|id:${leadId}|w:${Number(lead.workspace_id)}`) });
      return;
    }

    if (exp.type === 'lead_note') {
      const leadId = Number(exp.leadId || 0);
      const wsId = Number(exp.wsId || 0);
      const noteText = String(ctx.message.text || '').trim();

      const backStatus = String(exp.backStatus || 'new');
      const backPage = Number(exp.backPage || 0);
      const nb = Number(exp.nb || 0);
      const retKey = String(exp.ret || '').trim();
      const rPart = retKey ? retPartShort(retKey) : '';

      const role = String(exp.role || '').trim().toLowerCase() || null;

      if (!leadId || !wsId) {
        await clearExpectText(ctx.from.id);
        return ctx.reply('⚠️ Не удалось сохранить заметку.');
      }

      if (noteText.length < 2) {
        return ctx.reply('⚠️ Заметка слишком короткая.');
      }
      if (noteText.length > 1000) {
        return ctx.reply('⚠️ Слишком длинно. Укороти до 1000 символов.');
      }

      await safeDeleteIncomingUserMessage(ctx);

      const saved = await safeLeadWrite(
        () => db.appendBrandLeadCuratorNote(leadId, u.id, noteText, { role: role || null }),
        { op: 'lead_note', leadId },
      );

      await clearExpectText(ctx.from.id);

      if (!saved) {
        const kb = new InlineKeyboard()
          .text('🔎 Открыть заявку', `a:lead_view|id:${leadId}|w:${wsId}|s:${leadStatusToCb(backStatus)}|p:${backPage}${rPart}`)
          .text('📝 Заметки', `a:lead_notes|id:${leadId}|w:${wsId}|n:${nb}|s:${leadStatusToCb(backStatus)}|p:${backPage}${rPart}`)
          .row()
          .text('📋 Меню', 'a:menu')
          .text('🏠 Home', 'a:home');
        await ctx.reply('⚠️ Не смог сохранить заметку. Попробуй ещё раз.', { reply_markup: kb });
        return;
      }

      const notesCb = `a:lead_notes|id:${leadId}|w:${wsId}|n:0|s:${leadStatusToCb(backStatus)}|p:${backPage}${rPart}`;

      const kb = new InlineKeyboard()
        .text('🔎 Открыть заявку', `a:lead_view|id:${leadId}|w:${wsId}|s:${leadStatusToCb(backStatus)}|p:${backPage}${rPart}`)
        .text('📝 Заметки', notesCb)
        .row()
        .text('📨 Заявки', `a:ws_leads|w:${wsId}|s:${leadStatusToCb(backStatus)}|p:${backPage}${rPart}`)
        .row()
        .text('📋 Меню', 'a:menu')
        .text('🏠 Home', 'a:home');

      return ctx.reply('✅ Заметка сохранена.', { reply_markup: kb });
    }
if (exp.type === 'brand_apply') {
      const brandUserId = Number(exp.brandUserId || 0);
      const backPage = Math.max(0, Number(exp.backPage || 0));
      const msg = String(((ctx.message && ctx.message.text) || (ctx.msg && ctx.msg.text) || '')).trim();

      const wsId = Number(exp.wsId || 0) || (await getActiveWorkspace(ctx.from.id)) || 0;
      if (!brandUserId) {
        await clearExpectText(ctx.from.id);
        return ctx.reply('⚠️ Не найден бренд для заявки. Открой бренд в каталоге и нажми “Оставить заявку” ещё раз.');
      }

      if (msg.length < 10) return ctx.reply('⚠️ Сделай сообщение чуть подробнее (минимум 10 символов).');
      if (msg.length > 2000) return ctx.reply('⚠️ Слишком длинно. Укороти до 2000 символов.');

      await safeDeleteIncomingUserMessage(ctx);

      await setBrandApplyDraft(ctx.from.id, brandUserId, {
        msg,
        wsId: wsId || 0,
        backPage,
        at: new Date().toISOString()
      });

      await clearExpectText(ctx.from.id);

      // Show preview + explicit "Send" button
      await renderBrandApplyPreview(ctx, u, brandUserId, backPage, { edit: false });
      return;
    }

    if (exp.type === 'brand_app_reply') {
      const appId = Number(exp.appId || 0);
      const brandUserId = Number(exp.brandUserId || 0);
      const creatorTgId = Number(exp.creatorTgId || 0);
      const reply = String(((ctx.message && ctx.message.text) || (ctx.msg && ctx.msg.text) || '')).trim();

      if (!appId || !brandUserId || !creatorTgId) {
        await clearExpectText(ctx.from.id);
        return ctx.reply('⚠️ Не удалось отправить ответ: отсутствуют данные заявки.');
      }

      if (reply.length < 2) return ctx.reply('⚠️ Ответ слишком короткий.');
      if (reply.length > 2000) return ctx.reply('⚠️ Слишком длинно. Укороти до 2000 символов.');

      await safeDeleteIncomingUserMessage(ctx);

      const prof = await safeBrandProfiles(() => db.getBrandProfile(brandUserId), async () => null);
      const brandName = String(prof?.brand_name || '').trim() || 'Бренд';

      const cUrl = prof?.contact ? brandContactUrl(prof.contact) : null;
      const link = String(prof?.brand_link || '').trim();
      const linkLine = link ? `\n🔗 Сайт/ссылка: ${escapeHtml(link)}` : '';
      const contactLine = cUrl ? `\n✍️ Контакт: ${escapeHtml(String(prof.contact))}` : '';

      const outText =
        `📩 <b>Ответ бренда</b>

` +
        `Бренд: <b>${escapeHtml(brandName)}</b>` +
        linkLine +
        contactLine +
        `

<b>Сообщение:</b>
${escapeHtml(reply)}`;

      const outKb = notifyReplyKb({
        openCb: `a:brand_app_card|id:${appId}` ,
        replyCb: `a:brand_app_chat|id:${appId}`
      });

      const sendRes = await sendMessageWithFallback(apiFromCtx(ctx), creatorTgId, outText, {
        parse_mode: 'HTML',
        reply_markup: outKb,
        disable_web_page_preview: true
      });

      const delivered = Boolean(sendRes && sendRes.ok);
      const deliveryReason = delivered ? null : describeTgSendError(sendRes.err);
      if (!delivered) {
        try {
          console.warn('[brand_app_reply] sendMessage failed', {
            appId,
            creatorTgId,
            reason: deliveryReason,
            raw: String(sendRes.err?.description || sendRes.err?.message || sendRes.err || '')
          });
        } catch {}
      }

      // Persist reply + append to thread + move to "in progress" if still new
      const app = await safeBrandApplications(() => db.getBrandApplicationById(appId), async () => null);
      await safeBrandAppsWrite(() => db.markBrandApplicationReplied(appId, reply, u.id), { op: 'brand_app_mark_replied', appId });
      await safeBrandAppsWrite(() => db.appendBrandApplicationThreadMessage(appId, {
        from: 'brand',
        text: reply,
        at: new Date().toISOString(),
        by_user_id: Number(u.id),
        by_tg_id: Number(ctx.from?.id || 0),
        by_username: ctx.from?.username || null,
        delivered,
        delivery: { ok: delivered, mode: sendRes?.mode || null, reason: delivered ? null : deliveryReason }
      }), { op: 'brand_app_thread_append', appId });
      if (app && String(app.status) === 'new') {
        await safeBrandAppsWrite(() => db.updateBrandApplicationStatus(appId, 'in_progress'), { op: 'brand_app_status', appId, st: 'in_progress' });
      }

      await clearExpectText(ctx.from.id);

      const backCb = String(exp.backCb || `a:brand_app_view|id:${appId}|s:new|p:0`);
      const kb = new InlineKeyboard()
        .text('⬅️ Назад', backCb)
        .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');

      if (delivered) {
        return ctx.reply('✅ Ответ доставлен креатору.', { reply_markup: kb });
      }

      const backStatus = String(exp.backStatus || 'new');
      const backPage = Math.max(0, Number(exp.backPage || 0));
      const creatorU = exp.creatorUsername ? String(exp.creatorUsername).replace(/^@/, '').trim() : '';
      const failKb = new InlineKeyboard();
      failKb
        .text('🔁 Повторить', `a:brand_app_reply|id:${appId}|s:${backStatus}|p:${backPage}`)
        .row()
        .text('⬅️ Назад', backCb)
        .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');

      const failText =
        `⚠️ <b>Ответ сохранён</b>, но не доставлен креатору.

` +
        `Причина: <b>${escapeHtml(String(deliveryReason || 'ошибка отправки'))}</b>

` +
        `Текст (скопируй):
<pre>${escapeHtml(reply)}</pre>

` +
        `💡 Попроси креатора нажать /start в этом боте и попробуй ещё раз.`;

      return ctx.reply(failText, { parse_mode: 'HTML', reply_markup: failKb, disable_web_page_preview: true });
    }

if (exp.type === 'brand_deals_search') {
  const brandUserId = Number(exp.brandUserId || 0);
  const stage = String(exp.stage || 'negotiation');
  const page = Math.max(0, Number(exp.page || 0));
  const qRaw = String(((ctx.message && ctx.message.text) || (ctx.msg && ctx.msg.text) || '')).trim();

  await safeDeleteIncomingUserMessage(ctx);

  const backCb = String(exp.backCb || `a:brand_deals|ws:0|st:${stage}|p:${page}`);

  const kb = navKb(backCb);

  if (!brandUserId) {
    await clearExpectText(ctx.from.id);
    return ctx.reply('⚠️ Не удалось применить поиск: нет brandUserId.', { reply_markup: kb });
  }

  if (!qRaw) {
    return ctx.reply(
      '⚠️ Введи <code>@username</code> или <code>TG id</code> (цифры).\nПример: <code>@zarinka</code> или <code>123456789</code>\n\nЧтобы сбросить: <code>сброс</code>',
      { parse_mode: 'HTML', reply_markup: kb }
    );
  }

  if (/^(сброс|clear|off|нет)$/i.test(qRaw)) {
    await clearBrandDealsSearch(ctx.from.id, brandUserId);
    await clearExpectText(ctx.from.id);
    return ctx.reply('✅ Поиск сброшен.', { reply_markup: kb });
  }

  let q = qRaw.replace(/\s+/g, ' ').trim().slice(0, 80);

  // Smart hints/validation
  if (q.startsWith('@')) {
    const uname = q.replace(/^@+/, '').trim();
    if (uname.length < 2) {
      return ctx.reply(
        '⚠️ После <code>@</code> нужно минимум 2 символа.\nПример: <code>@zarinka</code>',
        { parse_mode: 'HTML', reply_markup: kb }
      );
    }
    q = '@' + uname;
  } else if (/^\d+$/.test(q)) {
    if (q.length < 6) {
      return ctx.reply(
        '⚠️ Похоже на <code>TG id</code>, но слишком коротко.\nПример: <code>123456789</code>\n\nИли введи <code>@username</code>.',
        { parse_mode: 'HTML', reply_markup: kb }
      );
    }
  }

  await setBrandDealsSearch(ctx.from.id, brandUserId, q);
  await clearExpectText(ctx.from.id);

  return ctx.reply(
    `✅ Поиск установлен: <code>${escapeHtml(q)}</code>\n\n💡 Сброс: <code>сброс</code>`,
    { parse_mode: 'HTML', reply_markup: kb }
  );
}

    if (exp.type === 'brand_app_chat_send') {
      const appId = Number(exp.appId || 0);
      const msg = String(((ctx.message && ctx.message.text) || (ctx.msg && ctx.msg.text) || '')).trim();

      if (!appId) {
        await clearExpectText(ctx.from.id);
        return ctx.reply('⚠️ Не удалось отправить сообщение: нет id заявки.');
      }

      if (msg.length < 2) return ctx.reply('⚠️ Сообщение слишком короткое.');
      if (msg.length > 2000) return ctx.reply('⚠️ Слишком длинно. Укороти до 2000 символов.');

      await safeDeleteIncomingUserMessage(ctx);

      const app = await safeBrandApplications(() => db.getBrandApplicationById(appId), async () => null);
      if (!app) { await clearExpectText(ctx.from.id); return ctx.reply('⚠️ Заявка не найдена.'); }
      if (Number(app.creator_user_id) !== Number(u.id)) { await clearExpectText(ctx.from.id); return ctx.reply('Нет доступа.'); }

      const brandUserId = Number(app.brand_user_id);

      const prof = await safeBrandProfiles(() => db.getBrandProfile(brandUserId), async () => null);
      const brandName = String(prof?.brand_name || '').trim() || 'Бренд';
      const who = ctx.from?.username ? '@' + String(ctx.from.username).replace(/^@/, '') : `id:${ctx.from?.id}`;

      await safeBrandAppsWrite(() => db.appendBrandApplicationThreadMessage(appId, {
        from: 'creator',
        text: msg,
        at: new Date().toISOString(),
        by_user_id: Number(u.id),
        by_tg_id: Number(ctx.from?.id || 0),
        by_username: ctx.from?.username || null
      }), { op: 'brand_app_thread_append', appId });

      if (normLeadStatus(app.status) === 'new') {
        await safeBrandAppsWrite(() => db.updateBrandApplicationStatus(appId, 'in_progress'), { op: 'brand_app_status', appId, st: 'in_progress' });
      }

      // Notify brand owner + managers
      const managers = await safeBrandManagers(() => db.listBrandManagers(brandUserId), async () => []);
      const targetsMap = new Map(); // tgId -> { tgId, role, tg_username }

      const brandOwner = await db.getUserById(brandUserId);
      const ownerTgId = Number(brandOwner?.tg_id || 0);
      if (ownerTgId) {
        targetsMap.set(ownerTgId, { tgId: ownerTgId, role: 'owner', tg_username: brandOwner?.tg_username || null });
      }

      for (const m of managers || []) {
        const t = Number(m?.tg_id || 0);
        if (t && !targetsMap.has(t)) {
          targetsMap.set(t, { tgId: t, role: 'manager', tg_username: m?.tg_username || null });
        }
      }

      const preview = msg.replace(/\s+/g, ' ').slice(0, 280);
      const notif =
        `💬 <b>Новое сообщение по заявке #${appId}</b>\n\n` +
        `Бренд: <b>${escapeHtml(brandName)}</b>\n` +
        `От: <b>${escapeHtml(String(who))}</b>\n\n` +
        `${escapeHtml(preview)}${msg.length > preview.length ? '…' : ''}`;

      const kb = new InlineKeyboard()
        .text('📥 Открыть в Inbox', `a:brand_app_view|id:${appId}|s:in_progress|p:0`)
        .row()
        .text('🗑 Убрать', 'a:nd')
        .row()
        .text('📋 Меню', 'a:menu')
        .text('🏠 Home', 'a:home');

      let delivered = 0;
      const deliveredTo = [];
      const failedTo = [];
      const api = apiFromCtx(ctx);
      for (const rec of targetsMap.values()) {
        try {
          if (!api) throw new Error('BOT API not initialized');
          await api.sendMessage(rec.tgId, notif, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
          delivered++;
          deliveredTo.push(rec);
        } catch (e) {
          failedTo.push({ ...rec, err: e?.description || e?.message || String(e) });
          try { console.warn('[brand_app_chat_send] notify failed', { tgId: rec.tgId, role: rec.role, err: e?.description || e?.message || String(e) }); } catch {}
        }
      }

      try {
        console.info('[brand_app_chat_send] notify summary', {
          brandUserId,
          appId,
          recipients: targetsMap.size,
          delivered,
          deliveredTo: deliveredTo.map(x => ({ tgId: x.tgId, role: x.role, username: x.tg_username || null }))
        });
      } catch {}

      await clearExpectText(ctx.from.id);
      const hasManagers2 = Array.from(targetsMap.values()).some(r => r.role === 'manager');
      const whoNotified2 = hasManagers2 ? 'владелец + менеджеры' : 'владелец';

      const ackText = (targetsMap.size === 0)
        ? '✅ Сообщение добавлено в диалог. 🔕 Уведомление: не отправлено (у бренда не найден tg_id).'
        : (delivered > 0)
          ? `✅ Сообщение добавлено в диалог. 🔔 Уведомление (${whoNotified2}): ${delivered}/${targetsMap.size}`
          : '✅ Сообщение добавлено в диалог. 🔕 Уведомление: не доставлено (ошибка отправки).';

      return ctx.reply(ackText, {
        reply_markup: new InlineKeyboard()
          .text('💬 Написать ещё', `a:brand_app_chat|id:${appId}`)
          .text('✉️ Диалог', `a:brand_app_card|id:${appId}`)
          .row()
          .text('🪟 Открыть бренд', `a:brand_dir_open|u:${brandUserId}|p:0`)
          .row()
          .text('📋 Меню', 'a:menu')
      });
    }

    // Workspace profile edit
    if (exp.type === 'ws_profile_edit') {
      const wsId = Number(exp.wsId);
      const field = String(exp.field || '');
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) { await ctx.reply('Нет доступа к этому каналу.'); return; }

      const raw = String(ctx.message.text || '').trim();
      await safeDeleteIncomingUserMessage(ctx);
      const rawLc = raw.toLowerCase();
      const wantClear = ['-', '—', 'нет', 'no', 'clear'].includes(rawLc);

      const patch = {};

      // title / niche / contact / geo
      if (field === 'title') {
        const v = wantClear ? null : raw.slice(0, 120);
        if (!wantClear && (!v || v.length < 2)) { await ctx.reply('Слишком коротко. Введи ещё раз.'); await setExpectText(ctx.from.id, exp); return; }
        patch.profile_title = v;
      }
      if (field === 'niche') {
        const v = wantClear ? null : raw.slice(0, 120);
        if (!wantClear && (!v || v.length < 2)) { await ctx.reply('Слишком коротко. Введи ещё раз.'); await setExpectText(ctx.from.id, exp); return; }
        patch.profile_niche = v;
      }
      if (field === 'contact') {
        const v = wantClear ? null : raw.slice(0, 160);
        if (!wantClear && (!v || v.length < 2)) { await ctx.reply('Слишком коротко. Введи ещё раз.'); await setExpectText(ctx.from.id, exp); return; }
        patch.profile_contact = v;
      }
      if (field === 'geo') {
        const v = wantClear ? null : raw.slice(0, 120);
        if (!wantClear && (!v || v.length < 2)) { await ctx.reply('Слишком коротко. Введи ещё раз.'); await setExpectText(ctx.from.id, exp); return; }
        patch.profile_geo = v;
      }

      // Instagram
      if (field === 'ig') {
        if (wantClear) {
          patch.profile_ig = null;
        } else {
          const handle = normalizeIgHandle(raw);
          if (!handle) {
            {
            const kb = new InlineKeyboard()
              .text('⬅️ Назад', `a:ws_profile|ws:${wsId}`)
              .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');
            await ctx.reply('⚠️ Пришли @handle или ссылку на профиль вида instagram.com/handle.\n\nЧтобы очистить поле — отправь “-”.', { reply_markup: kb });
          }
            await setExpectText(ctx.from.id, exp);
            return;
          }
          patch.profile_ig = handle;
        }
      }

      // About
      if (field === 'about') {
        const v = wantClear ? null : raw.slice(0, 400);
        if (!wantClear && (!v || v.length < 5)) { await ctx.reply('Слишком коротко (нужно 5+ символов).'); await setExpectText(ctx.from.id, exp); return; }
        patch.profile_about = v;
      }

      // Portfolio URLs (1–3)
      if (field === 'portfolio') {
        if (wantClear) {
          patch.profile_portfolio_urls = [];
        } else {
          const urls = parseUrlsFromText(raw, 3);
          if (!urls.length) {
            {
            const kb = new InlineKeyboard()
              .text('⬅️ Назад', `a:ws_profile|ws:${wsId}`)
              .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');
            await ctx.reply('⚠️ Пришли 1–3 ссылки (https://...). Можно в одном сообщении или по строкам.\n\nЧтобы очистить поле — отправь “-”.', { reply_markup: kb });
          }
            await setExpectText(ctx.from.id, exp);
            return;
          }
          patch.profile_portfolio_urls = urls;
        }
      }

      if (!Object.keys(patch).length) { await ctx.reply('Поле не найдено.'); return; }
      await db.setWorkspaceSetting(wsId, patch);
      await db.auditWorkspace(wsId, u.id, 'ws.profile_updated', { field });

      await clearExpectText(ctx.from.id);
      const editTarget = (exp && exp.chatId && exp.messageId) ? { chatId: exp.chatId, messageId: exp.messageId } : null;
      await renderWsProfile(ctx, u.id, wsId, { editTarget });
      return;
    }

    // Moderation report (offer/thread)
    if (exp.type === 'bx_report') {
      const offerId = exp.offerId ? Number(exp.offerId) : null;
      const threadId = exp.threadId ? Number(exp.threadId) : null;
      const reason = String(ctx.message.text || '').trim().slice(0, 500);
      if (!reason || reason.length < 5) { await ctx.reply('Опиши причину (5+ символов).'); await setExpectText(ctx.from.id, exp); return; }
      let wsId = null;
      if (offerId) {
        const o = CFG.VERIFICATION_ENABLED
    ? await safeUserVerifications(() => db.getBarterOfferPublicWithVerified(offerId), () => db.getBarterOfferPublic(offerId))
    : await db.getBarterOfferPublic(offerId);
        wsId = o ? o.workspace_id : null;
      }
      if (threadId) {
        const t = await db.getBarterThreadForUser(threadId, u.id);
        if (t) wsId = wsId || t.workspace_id;
      }
      const r = await db.createBarterReport({ workspaceId: wsId, reporterUserId: u.id, offerId, threadId, reason });
      await ctx.reply(`✅ Жалоба отправлена (id: ${r.id}). Модератор посмотрит.`);
      return;
    }
    // Admin: add moderator by @username
    if (exp.type === 'admin_add_mod_username') {
      const txt = String(ctx.message.text || '').trim();
      const mm = txt.match(/^@?([a-zA-Z0-9_]{5,})$/);
      if (!mm) {
        await ctx.reply('Введи @username (пример: @user)');
        await setExpectText(ctx.from.id, exp);
        return;
      }
      const username = mm[1];

      // Telegram Bot API cannot reliably resolve a *user* by @username via getChat().
      // Correct flow: the person should have started the bot at least once so we have them in DB.
      const u2 = await db.findUserByUsername(username);
      if (!u2) {
        await ctx.reply(
          `⚠️ Не нашёл пользователя @${username} в базе.

` +
          `Пусть он откроет бота и нажмёт /start (это добавит его в базу), ` +
          `и потом повтори добавление модератора.`
        );
        return;
      }

      await db.addNetworkModerator(u2.id, u.id);
      await ctx.reply(`✅ Модератор добавлен: @${u2.tg_username || username}`);
      return;
    }

    // Smart Matching brief (after payment)
    if (exp.type === 'match_brief') {
      const brief = String(ctx.message.text || '').trim().slice(0, 1000);
      if (!brief || brief.length < 10) {
        await ctx.reply('Слишком коротко. Пришли бриф одним сообщением (10+ символов).');
        await setExpectText(ctx.from.id, exp);
        return;
      }

      const reqId = Number(exp.requestId);
      const wsId = Number(exp.wsId || 0);
      const count = Number(exp.count || 10);

      const req = await db.getMatchingRequest(reqId, u.id);
      if (!req) {
        await ctx.reply('Запрос matching не найден (возможно, устарел). Открой 🎯 Smart Matching и попробуй ещё раз.');
        return;
      }

      await db.setMatchingBrief(reqId, u.id, brief);
      const rows = await db.searchNetworkBarterOffersByBrief(brief, count);
      const offerIds = rows.map((r) => Number(r.id));
      await db.completeMatchingRequest(reqId, u.id, offerIds);

      if (!rows.length) {
        const kb = new InlineKeyboard()
          .text('🎯 Matching', `a:match_home|ws:${wsId}`)
          .text('📰 Лента креаторов', `a:bx_feed|ws:${wsId}|p:0|h:bo`)
          .row()
          .text('⬅️ Назад', `a:bx_open|ws:${wsId}`);
        await ctx.reply(
          '😶 Не нашёл релевантных офферов по брифу. Попробуй упростить: ниша + гео + формат (например: "косметика, Москва, обзор").',
          { reply_markup: kb }
        );
        return;
      }

      const showN = Math.min(rows.length, 15);
      const lines = rows.slice(0, showN).map((o) => {
        const ch = safeCreatorDisplayName({ title: o.ws_title, channel_username: o.channel_username });
        return `#${o.id} · ${bxCategoryLabel(o.category)}\n<b>${escapeHtml(String(o.title || '').slice(0, 70))}</b>\n${escapeHtml(bxTypeLabel(o.offer_type))} · ${escapeHtml(bxCompLabel(o.compensation_type))}\nКанал: ${escapeHtml(String(ch).slice(0, 60))}`;
      });

      const kb = new InlineKeyboard();
      const btnN = Math.min(showN, 12);
      for (const o of rows.slice(0, btnN)) {
        kb.text(`🔎 #${o.id}`, `a:bx_pub|ws:${wsId}|o:${o.id}|p:0|h:bo`).row();
      }
      kb.text('📰 Лента креаторов', `a:bx_feed|ws:${wsId}|p:0|h:bo`)
        .text('🎯 Matching', `a:match_home|ws:${wsId}`)
        .row()
        .text('⬅️ Назад', `a:bx_open|ws:${wsId}`);

      await ctx.reply(
        `🎯 <b>Smart Matching</b>\n\nБриф: <tg-spoiler>${escapeHtml(brief)}</tg-spoiler>\n\nНайдено: <b>${rows.length}</b>\nПоказаны: <b>${showN}</b>\n\n${lines.join('\n\n')}`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
      return;
    }

    // Featured content (after payment)
    if (exp.type === 'feat_content') {
      const raw = String(ctx.message.text || '').trim();
      const lines = raw.split(/\n+/).map(s => s.trim()).filter(Boolean);
      if (lines.length < 2) {
        await ctx.reply('Формат: 1-я строка — заголовок, последняя — контакт (@username / ссылка).');
        await setExpectText(ctx.from.id, exp);
        return;
      }

      const title = String(lines[0]).slice(0, 80);
      const contact = String(lines[lines.length - 1]).slice(0, 160);
      const body = String(lines.slice(1, -1).join('\n')).slice(0, 800);

      const contactOk = /(@[a-zA-Z0-9_]{5,}|t\.me\/|https?:\/\/)/i.test(contact);
      if (!contactOk) {
        await ctx.reply('Не вижу контакта. Последняя строка должна быть @username или ссылкой.');
        await setExpectText(ctx.from.id, exp);
        return;
      }
      if (!title || title.length < 3) {
        await ctx.reply('Слишком короткий заголовок.');
        await setExpectText(ctx.from.id, exp);
        return;
      }

      const wsId = Number(exp.wsId || 0);
      const featuredId = Number(exp.featuredId);
      const f = await db.activateFeaturedPlacementWithContent(featuredId, u.id, title, body, contact);
      if (!f) {
        await ctx.reply('Не смог активировать Featured (возможно, доступ истёк). Открой 🔥 Featured и попробуй снова.');
        return;
      }

      const ends = f.ends_at ? fmtTs(f.ends_at) : '—';
      const kb = new InlineKeyboard()
        .text('🔥 Посмотреть', `a:feat_view|ws:${wsId}|id:${f.id}|p:0`)
        .row()
        .text('📰 Лента креаторов', `a:bx_feed|ws:${wsId}|p:0|h:bo`)
        .text('⬅️ Назад', `a:bx_open|ws:${wsId}`);

      await ctx.reply(`✅ Featured активирован до <b>${escapeHtml(String(ends))}</b>.`, { parse_mode: 'HTML', reply_markup: kb });
      return;
    }
    // Barter offer wizard: text input (save to draft) — actual publish happens from step 6.
    if (exp.type === 'bx_offer_text') {
      const draft = (await getDraft(ctx.from.id)) || {};
      const wsId = Number(exp.wsId || draft.wsId);

      const raw = String(ctx.message.text || '').trim();
      const lines = raw.split(/\n+/);
      const title = (lines[0] || '').trim().slice(0, 80);
      const description = (lines.slice(1).join('\n') || '').trim().slice(0, 2000);

      if (!wsId || !draft.category || !draft.offer_type || !draft.compensation_type) {
        await ctx.reply('Черновик оффера потерян. Начни заново: 🎬 UGC / Офферы → ➕ Создать офер');
        return;
      }
      if (!title || title.length < 3) {
        await ctx.reply('Первой строкой напиши короткий заголовок (3+ символа).');
        await setExpectText(ctx.from.id, exp);
        return;
      }
      if (!description || description.length < 10) {
        await ctx.reply('Добавь детали (со 2-й строки): условия/гео/что хочешь получить.');
        await setExpectText(ctx.from.id, exp);
        return;
      }

      // Contact: prefer @username; fallback to first mention/link.
      const contactFromProfile = ctx.from.username ? '@' + ctx.from.username : null;
      let contact = contactFromProfile || extractFirstContact(raw) || '';
      if (!contact) {
        await ctx.reply('Не вижу контакта. Либо включи @username в Telegram, либо добавь его в текст (например: Контакт: @myname) и отправь ещё раз.');
        await setExpectText(ctx.from.id, exp);
        return;
      }

      // Save into draft (don’t publish automatically)
      draft.wsId = wsId;
      draft.offer_title = title;
      draft.offer_desc = description;
      draft.offer_contact = contact;
      await setDraft(ctx.from.id, draft);

      // Show preview/publish step.
      await renderBxOfferPreviewStep(ctx, wsId);
      return;
    }

    // Barter thread reply
    if (exp.type === 'bx_thread_msg') {
      const threadId = Number(exp.threadId);
      const wsId = Number(exp.wsId);

      const bm = wsId === 0 ? await resolveBmBrandContext(ctx, u) : { enabled: false };
      const effectiveUserId = (wsId === 0 && bm.enabled) ? bm.brandUserId : u.id;

      // Brand-lock: фиксируем, от какого бренда отвечаем (на момент нажатия "Ответить")
      const asUserId = Number(exp.asUserId || effectiveUserId);

      const body = String(ctx.message.text || '').trim().slice(0, 800);
      if (!threadId || !body) {
        await ctx.reply('Пустое сообщение.', { reply_markup: navKb('a:menu') });
        return;
      }

      if (CFG.RATE_LIMIT_ENABLED) {
        try {
          const rl = await rateLimit(
            k(['rl', 'bxmsg', asUserId, threadId]),
            { limit: CFG.BX_MSG_RATE_LIMIT, windowSec: CFG.BX_MSG_RATE_WINDOW_SEC }
          );
          if (!rl.allowed) {
            await ctx.reply(`⏳ Слишком часто. Подожди ${fmtWait(rl.resetSec)} и отправь ещё раз.`, { reply_markup: navKb('a:menu') });
            // we cleared expectation at the start of message router; restore it for retry
            await setExpectText(ctx.from.id, exp);
            return;
          }
        } catch {}
      }

      const built = await buildBxThreadView(asUserId, threadId);
      if (!built) {
        await ctx.reply('Диалог не найден.', { reply_markup: navKb('a:menu') });
        return;
      }
      const { thread } = built;
      if (String(thread.status || '').toUpperCase() !== 'OPEN') {
        await ctx.reply('Диалог закрыт.', { reply_markup: navKb('a:menu') });
        return;
      }

      await db.addBarterMessage(threadId, asUserId, body);

      const auditMeta = { threadId };
      if (Number(ctx.from.id) !== Number(asUserId)) auditMeta.actorTgId = Number(ctx.from.id);
      await db.auditBarterOffer(thread.offer_id, thread.workspace_id, asUserId, 'bx.thread_message', auditMeta);
      db.trackEvent('thread_message_sent', {
        userId: asUserId,
        wsId: Number(thread.workspace_id) || null,
        meta: { threadId, offerId: Number(thread.offer_id), ...(auditMeta.actorTgId ? { actorTgId: auditMeta.actorTgId } : {}) }
      });

      // notify other side (best-effort)
      const otherUserId = Number(thread.buyer_user_id) == Number(asUserId) ? Number(thread.seller_user_id) : Number(thread.buyer_user_id);
      try {
        const otherInfo = await db.getUserTgIdByUserId(otherUserId);
        const otherTgId = otherInfo?.tg_id ? Number(otherInfo.tg_id) : null;
        if (otherTgId) {
          const link = `https://t.me/${CFG.BOT_USERNAME}?start=bxth_${threadId}`;
          const msgText = body.length > 400 ? `${body.slice(0, 397)}...` : body;
          const notifyKb = new InlineKeyboard()
            .text('💬 Открыть диалог', `a:bx_thread|ws:${Number(thread.workspace_id || 0)}|t:${threadId}|p:0|b:inbox|h:${BX_HOME.MENU}`)
            .row()
            .text('🗑 Убрать', 'a:nd')
            .row()
            .text('📋 Меню', 'a:menu')
            .text('🏠 Home', 'a:home');
          await ctx.api.sendMessage(otherTgId, `📨 Новое сообщение по офферу #${thread.offer_id}

${msgText}

Открыть: ${link}`, { disable_web_page_preview: true, reply_markup: notifyKb });
        }
      } catch {}

      // show updated thread in reply
      const again = await buildBxThreadView(asUserId, threadId);

      const back = exp.back ? String(exp.back) : 'inbox';
      const offerId = exp.offerId ? Number(exp.offerId) : null;
      const page = Number(exp.page || 0);
      const h = normBxHome(exp.h, Number(wsId || 0) ? BX_HOME.BX_OPEN : BX_HOME.MENU);

      const kb = new InlineKeyboard()
        .text('💬 Открыть диалог', `a:bx_thread|ws:${wsId}|t:${threadId}|p:${page}|b:${back}${offerId ? `|o:${offerId}` : ''}|h:${h}`)
        .row()
        .text('📥 Inbox', `a:bx_inbox|ws:${wsId}|p:${page}|h:${h}`);
      await ctx.reply(again ? again.text : '✅ Отправлено.', { parse_mode: 'HTML', reply_markup: kb });
      return;
    }

// Proofs: link
    if (exp.type === 'bx_proof_link') {
      const wsId = Number(exp.wsId);
      const threadId = Number(exp.threadId);
      const back = exp.back ? String(exp.back) : 'inbox';
      const offerId = exp.offerId ? Number(exp.offerId) : null;
      const page = Number(exp.page || 0);
      const asUserId = Number(exp.asUserId || u.id);

      const h = normBxHome(exp.h, Number(wsId || 0) ? BX_HOME.BX_OPEN : BX_HOME.MENU);


      const raw = String(ctx.message.text || '').trim();
      // allow bare t.me, https links, or @channel/... patterns
      const ok = raw.length >= 8 && raw.length <= 500 && (/^https?:\/\//i.test(raw) || /t\.me\//i.test(raw) || /^@?[a-zA-Z0-9_]{5,}/.test(raw));
      if (!ok) {
        await ctx.reply('Нужна ссылка на пост (пример: https://t.me/...)');
        await setExpectText(ctx.from.id, { type: 'bx_proof_link', wsId, threadId, back, offerId, page, asUserId, h });
        return;
      }

      try {
        await db.addBarterThreadProofLink(threadId, asUserId, raw);
      } catch (e) {
        if (String(e?.message || '') === 'NO_THREAD_ACCESS') {
          await ctx.reply('Нет доступа к этому диалогу.');
          return;
        }
        throw e;
      }

      const kb = new InlineKeyboard()
        .text('🧾 Proofs', `a:bx_proofs|ws:${wsId}|t:${threadId}|p:${page}${offerId ? `|o:${offerId}` : ''}|b:${back}|h:${h}`)
        .row()
        .text('💬 Диалог', `a:bx_thread|ws:${wsId}|t:${threadId}|p:${page}${offerId ? `|o:${offerId}` : ''}|b:${back}|h:${h}`);
      await ctx.reply('✅ Proof добавлен.', { reply_markup: kb });
      return;
    }

    
    // Brand profile edit (Brand Mode)
    if (exp.type === 'brand_prof_field') {
      const field = String(exp.field || '');
      const raw = String(ctx.message.text || '').trim();

      await safeDeleteIncomingUserMessage(ctx);

      if (!field) {
        await clearExpectText(ctx.from.id);
        await ctx.reply('Ошибка: неизвестное поле профиля.');
        return;
      }

      if (!raw) {
        await ctx.reply('Пустое значение. Пришли текст.');
        return;
      }

      let value = raw;

      // Allow clearing a field with a simple token
      if (/^(—|-|none|null|clear|удалить)$/i.test(value)) value = null;

      // Basic validation
      if (value !== null) {
        const maxLen = field === 'requirements' ? 600 : 220;
        if (value.length > maxLen) value = value.slice(0, maxLen).trim();

        if (field === 'brand_name' && value.length < 2) {
          await ctx.reply('Слишком короткое название. Пришли 2+ символа.');
          return;
        }
        if ((field === 'brand_link' || field === 'contact') && value.length < 3) {
          await ctx.reply('Слишком коротко. Пришли нормальный контакт/ссылку.');
          return;
        }
      }

      const patch = { [field]: value };

      // If user edits niche as free-text, treat it as legacy override and reset picker state.
      if (field === 'niche') {
        const prof0 = await safeBrandProfiles(() => db.getBrandProfile(u.id), async () => null);
        const meta0 = parseBrandMeta(prof0?.meta);
        const nextMeta = { ...meta0 };
        delete nextMeta.niche_key;
        patch.meta = nextMeta;
      }
      const saved = await safeBrandProfiles(
        () => db.upsertBrandProfile(u.id, patch),
        async () => ({ __missing_relation: true })
      );

      if (saved && saved.__missing_relation) {
        await clearExpectText(ctx.from.id);
        await ctx.reply('⚠️ В базе нет таблицы brand_profiles. Применяй миграцию migrations/024_brand_profiles.sql в Neon и повтори.');
        return;
      }

      await clearExpectText(ctx.from.id);

      const wsId = Number(exp.wsId || 0);
      const ret = String(exp.ret || 'brand');
      const backOfferId = exp.backOfferId ? Number(exp.backOfferId) : null;
      const backPage = Number(exp.backPage || 0);

      // Keep UX consistent: return to the screen where the edit started.
      const from = String(exp.from || '');
      const EXT_FIELDS = new Set(['geo', 'collab_types', 'budget', 'goals', 'requirements']);
      if (from === 'more' || EXT_FIELDS.has(field)) {
        await renderBrandProfileMore(ctx, u.id, { wsId, ret, backOfferId, backPage, edit: true, flash: (value === null ? '✅ Очищено' : '✅ Сохранено') });
      } else {
        await renderBrandProfileHome(ctx, u.id, { wsId, ret, backOfferId, backPage, edit: true, flash: (value === null ? '✅ Очищено' : '✅ Сохранено') });
      }
      return;
    }

// Verification request submit
    if (exp.type === 'verify_submit') {
      if (!CFG.VERIFICATION_ENABLED) {
        await ctx.reply('Верификация сейчас отключена.');
        return;
      }
      const kind = String(exp.kind || 'creator');
      const submittedText = String(ctx.message.text || '').trim();
      if (submittedText.length < 20) {
        await ctx.reply('Слишком коротко. Напиши чуть подробнее (минимум 20 символов).');
        await setExpectText(ctx.from.id, { type: 'verify_submit', kind });
        return;
      }
      const trimmed = submittedText.length > 1800 ? submittedText.slice(0, 1800) : submittedText;

      await safeUserVerifications(() => db.upsertVerificationRequest(u.id, { kind, submittedText: trimmed }), async () => null);

      // notify moderators (super admins + network moderators)
      const modIds = new Set((CFG.SUPER_ADMIN_TG_IDS || []).map((n) => Number(n)).filter(Boolean));
      try {
        const mods = await db.listNetworkModerators();
        for (const m of mods) if (m?.tg_id) modIds.add(Number(m.tg_id));
      } catch {}

      const who = ctx.from.username ? '@' + ctx.from.username : ('tg:' + String(ctx.from.id));
      const msg = `✅ <b>Новая заявка на верификацию</b>

Пользователь: <b>${escapeHtml(who)}</b>
Тип: <b>${escapeHtml(kind)}</b>

${escapeHtml(trimmed)}`;
      const kb = new InlineKeyboard()
        .text('👀 View', `a:mod_verif_view|uid:${u.id}|p:0`)
        .row()
        .text('✅ Approve', `a:mod_verif_approve|uid:${u.id}|p:0`)
        .text('❌ Reject', `a:mod_verif_reject|uid:${u.id}|p:0`)
        .row()
        .text('🗑 Убрать', 'a:nd')
        .row()
        .text('📋 Меню', 'a:menu')
        .text('🏠 Home', 'a:home');

      for (const tgId of modIds) {
        try { await ctx.api.sendMessage(tgId, msg, { parse_mode: 'HTML', reply_markup: kb }); } catch {}
      }

      await ctx.reply('✅ Заявка отправлена. Обычно проверка занимает время — ты получишь ответ в этом чате.');
      return;
    }

    // Moderator: reject reason
    if (exp.type === 'mod_verif_reject_reason') {
      if (!CFG.VERIFICATION_ENABLED) return;
      const reason = String(ctx.message.text || '').trim();
      if (reason.length < 3) {
        await ctx.reply('Причина слишком короткая. Напиши 1–2 предложения.');
        await setExpectText(ctx.from.id, exp);
        return;
      }
      const targetUserId = Number(exp.targetUserId);
      await safeUserVerifications(() => db.setVerificationStatus(targetUserId, 'REJECTED', u.id, reason), async () => null);

      try {
        const target = await db.getUserById(targetUserId);
        if (target?.tg_id) {
          await ctx.api.sendMessage(Number(target.tg_id), `❌ Верификация отклонена.

Причина:
${reason}

Ты можешь подать заявку повторно: /start`, {});
        }
      } catch {}

      await ctx.reply('✅ Отправил пользователю причину отказа.');
      // optionally return to view
      try {
        await renderModVerifView(ctx, targetUserId, Number(exp.page || 0));
      } catch {}
      return;
    }

    // Giveaway drafts
    if (exp.type === 'gw_prize_text') {
      const draft = (await getDraft(ctx.from.id)) || {};
      const prize = String(ctx.message.text || '').trim();
      if (!prize || prize.length < 3) {
        await ctx.reply('Слишком коротко. Опиши приз (минимум 3 символа).');
        await setExpectText(ctx.from.id, exp);
        return;
      }
      draft.prize_value_text = prize.slice(0, 200);
      await setDraft(ctx.from.id, draft);
      await ctx.reply('Ок. Сколько призовых мест?', { reply_markup: gwNewStepWinnersKb(exp.wsId) });
      return;
    }

    if (exp.type === 'gw_winners_custom') {
      const n = Number(String(ctx.message.text || '').trim());
      if (!Number.isFinite(n) || n < 1 || n > 50) {
        await ctx.reply('Введи число от 1 до 50');
        return;
      }
      const draft = (await getDraft(ctx.from.id)) || {};
      draft.winners_count = Math.floor(n);
      await setDraft(ctx.from.id, draft);
      const isPro = await db.isWorkspacePro(exp.wsId);
      const max = isPro ? CFG.GIVEAWAY_SPONSORS_MAX_PRO : CFG.GIVEAWAY_SPONSORS_MAX_FREE;
      await ctx.reply(`Ок. Спонсоры (необязательно, до ${max}).

` +
`Если это соло-розыгрыш — нажми «✅ Без спонсоров (соло)».
` +
`Если есть партнёры — нажми «✍️ Ввести списком» и пришли список @каналов или ссылками t.me (через пробел/перенос строки).

` +
`Можно и через папку: нажми «📁 Из папки».`,
{ reply_markup: gwSponsorsOptionalKb(exp.wsId) });
      await setExpectText(ctx.from.id, { type: 'gw_sponsors_text', wsId: exp.wsId });
      return;
    }

    if (exp.type === 'gw_sponsors_text') {
      const sponsors = parseSponsorsFromText(ctx.message.text);
      if (!sponsors.length) {
        await ctx.reply(
          'Спонсоры не распознаны. Пришли список @каналов / t.me-ссылок\nили нажми «✅ Без спонсоров (соло)».',
          { reply_markup: gwSponsorsOptionalKb(exp.wsId) }
        );
        await setExpectText(ctx.from.id, exp);
        return;
      }
      const isPro = await db.isWorkspacePro(exp.wsId);
      const max = isPro ? CFG.GIVEAWAY_SPONSORS_MAX_PRO : CFG.GIVEAWAY_SPONSORS_MAX_FREE;
      if (sponsors.length > max) {
        await ctx.reply(`Максимум ${max} спонсоров. Укороти список.`);
        await setExpectText(ctx.from.id, exp);
        return;
      }
      const draft = (await getDraft(ctx.from.id)) || {};
      draft.sponsors = sponsors;
      await setDraft(ctx.from.id, draft);

      const list = sponsors.map(x => `• ${escapeHtml(String(x))}`).join('\n');
      await ctx.reply(
        `✅ Спонсоры: <b>${sponsors.length}</b>
${list}

Эти каналы появятся в конкурсе как обязательные подписки.
Дальше жми «➡️ Дальше» и выбери дедлайн.

⚠️ Чтобы «Проверить» работало, добавь бота админом в каналы-спонсоры.`,
        { parse_mode: 'HTML', reply_markup: gwSponsorsReviewKb(exp.wsId) }
      );
      return;
    }

    if (exp.type === 'gw_deadline_custom') {
      const dt = parseMoscowDateTime(ctx.message.text);
      if (!dt) {
        await ctx.reply('Формат: DD.MM HH:MM (МСК). Пример: 20.01 18:00');
        await setExpectText(ctx.from.id, exp);
        return;
      }

      const now = Date.now();
      const delta = dt.getTime() - now;
      if (delta < 5 * 60 * 1000) {
        await ctx.reply('Дедлайн должен быть минимум через 5 минут.');
        await setExpectText(ctx.from.id, exp);
        return;
      }
      if (delta > 30 * 24 * 60 * 60 * 1000) {
        await ctx.reply('Слишком далеко. Максимум 30 дней вперёд.');
        await setExpectText(ctx.from.id, exp);
        return;
      }

      const draft = (await getDraft(ctx.from.id)) || {};
      draft.ends_at = dt.toISOString();
      await setDraft(ctx.from.id, draft);
      await renderGwMediaStep(ctx, exp.wsId, { edit: false });
      return;
    }
  });

  // Proofs: screenshot (photo) + Giveaway media (photo)
  bot.on('message:photo', async (ctx, next) => {
    const exp = await getExpectText(ctx.from.id);
    if (!exp) return next();

    // Barter: screenshot proof
    if (String(exp.type) === 'bx_proof_photo') {
      const u = await db.upsertUser(ctx.from.id, ctx.from.username ?? null);
      await clearExpectText(ctx.from.id);

      const wsId = Number(exp.wsId);
      const threadId = Number(exp.threadId);
      const back = exp.back ? String(exp.back) : 'inbox';
      const offerId = exp.offerId ? Number(exp.offerId) : null;
      const page = Number(exp.page || 0);
      const asUserId = Number(exp.asUserId || u.id);

      const h = normBxHome(exp.h, Number(wsId || 0) ? BX_HOME.BX_OPEN : BX_HOME.MENU);


      const photos = ctx.message.photo || [];
      const last = photos.length ? photos[photos.length - 1] : null;
      const fileId = last?.file_id;
      if (!fileId) {
        await ctx.reply('Не вижу фото. Пришли скрин как картинку (не файл).');
        await setExpectText(ctx.from.id, { type: 'bx_proof_photo', wsId, threadId, back, offerId, page, asUserId, h });
        return;
      }

      try {
        await db.addBarterThreadProofScreenshot(threadId, asUserId, fileId);
      } catch (e) {
        if (String(e?.message || '') === 'NO_THREAD_ACCESS') {
          await ctx.reply('Нет доступа к этому диалогу.');
          return;
        }
        throw e;
      }

      const kb = new InlineKeyboard()
        .text('🧾 Proofs', `a:bx_proofs|ws:${wsId}|t:${threadId}|p:${page}${offerId ? `|o:${offerId}` : ''}|b:${back}|h:${h}`)
        .row()
        .text('💬 Диалог', `a:bx_thread|ws:${wsId}|t:${threadId}|p:${page}${offerId ? `|o:${offerId}` : ''}|b:${back}|h:${h}`);
      await ctx.reply('✅ Скрин добавлен.', { reply_markup: kb });
      return;
    }

    // Giveaway: attach photo to draft
    if (String(exp.type) === 'gw_media_photo') {
      const wsId = Number(exp.wsId);
      const photos = ctx.message.photo || [];
      const last = photos.length ? photos[photos.length - 1] : null;
      const fileId = last?.file_id;
      if (!fileId) {
        await ctx.reply('Не вижу фото. Пришли картинку как фото (не файл).');
        return;
      }

      const draft = (await getDraft(ctx.from.id)) || { wsId };
      draft.media_type = 'photo';
      draft.media_file_id = fileId;
      await setDraft(ctx.from.id, draft);
      await clearExpectText(ctx.from.id);

      await ctx.reply('✅ Картинка прикреплена. Продолжаем:', {
        reply_markup: gwMediaKb(wsId, true)
      });
      return;
    }


    // Barter offer: attach photo to offer (media in official channel for PAID)
    if (String(exp.type) === 'bx_media_photo') {
      const wsId = Number(exp.wsId);
      const offerId = Number(exp.offerId);
      const back = exp.back ? String(exp.back) : 'my';
      const page = Math.max(0, Number(exp.page || 0));

      const photos = ctx.message.photo || [];
      const last = photos.length ? photos[photos.length - 1] : null;
      const fileId = last?.file_id;
      if (!fileId) {
        await ctx.reply('Не вижу фото. Пришли картинку как фото (не файл).');
        return;
      }

      const o = await db.getBarterOfferForOwner(ctx.from.id, offerId);
      if (!o) {
        await clearExpectText(ctx.from.id);
        await ctx.reply('Оффер не найден или нет доступа.');
        return;
      }

      await db.updateBarterOffer(offerId, { media_type: 'photo', media_file_id: fileId });
      await clearExpectText(ctx.from.id);

      await ctx.reply('✅ Картинка прикреплена. Продолжаем:', {
        reply_markup: bxMediaKb(wsId, offerId, back, page, true)
      });
      return;
    }

    return next();
  });

  // Giveaway media (GIF/animation)
  bot.on('message:animation', async (ctx, next) => {
    const exp = await getExpectText(ctx.from.id);
    if (!exp) return next();

    const fileId = ctx.message.animation?.file_id;
    if (!fileId) {
      await ctx.reply('Не вижу GIF/анимацию. Пришли GIF одним сообщением.');
      return;
    }

    // Giveaway: GIF
    if (String(exp.type) === 'gw_media_gif') {
      const wsId = Number(exp.wsId);
      const draft = (await getDraft(ctx.from.id)) || { wsId };
      draft.media_type = 'animation';
      draft.media_file_id = fileId;
      await setDraft(ctx.from.id, draft);
      await clearExpectText(ctx.from.id);

      await ctx.reply('✅ GIF прикреплён. Продолжаем:', { reply_markup: gwMediaKb(wsId, true) });
      return;
    }

    // Barter offer: GIF
    if (String(exp.type) === 'bx_media_gif') {
      const wsId = Number(exp.wsId);
      const offerId = Number(exp.offerId);
      const back = exp.back ? String(exp.back) : 'my';
      const page = Math.max(0, Number(exp.page || 0));

      const o = await db.getBarterOfferForOwner(ctx.from.id, offerId);
      if (!o) {
        await clearExpectText(ctx.from.id);
        await ctx.reply('Оффер не найден или нет доступа.');
        return;
      }

      await db.updateBarterOffer(offerId, { media_type: 'animation', media_file_id: fileId });
      await clearExpectText(ctx.from.id);

      await ctx.reply('✅ GIF прикреплён. Продолжаем:', { reply_markup: bxMediaKb(wsId, offerId, back, page, true) });
      return;
    }

    return next();
  });

  bot.on('message:video', async (ctx, next) => {
    const exp = await getExpectText(ctx.from.id);
    if (!exp) return next();

    // Giveaway: attach video to draft
    if (String(exp.type) === 'gw_media_video') {
      const wsId = Number(exp.wsId);
      const fileId = ctx.message.video?.file_id;
      if (!fileId) {
        await ctx.reply('Не вижу видео. Пришли видео одним сообщением.');
        return;
      }

      const draft = (await getDraft(ctx.from.id)) || { wsId };
      draft.media_type = 'video';
      draft.media_file_id = fileId;
      await setDraft(ctx.from.id, draft);
      await clearExpectText(ctx.from.id);

      await ctx.reply('✅ Видео прикреплено. Продолжаем:', { reply_markup: gwMediaKb(wsId, true) });
      return;
    }

    // Barter offer: attach video to offer (media in official channel for PAID)
    if (String(exp.type) === 'bx_media_video') {
      const wsId = Number(exp.wsId);
      const offerId = Number(exp.offerId);
      const back = exp.back ? String(exp.back) : 'my';
      const page = Math.max(0, Number(exp.page || 0));

      const fileId = ctx.message.video?.file_id;
      if (!fileId) {
        await ctx.reply('Не вижу видео. Пришли видео одним сообщением.');
        return;
      }

      const o = await db.getBarterOfferForOwner(ctx.from.id, offerId);
      if (!o) {
        await clearExpectText(ctx.from.id);
        await ctx.reply('Оффер не найден или нет доступа.');
        return;
      }

      await db.updateBarterOffer(offerId, { media_type: 'video', media_file_id: fileId });
      await clearExpectText(ctx.from.id);

      await ctx.reply('✅ Видео прикреплено. Продолжаем:', {
        reply_markup: bxMediaKb(wsId, offerId, back, page, true)
      });
      return;
    }

    return next();
  });


  bot.on('message:document', async (ctx, next) => {
    const exp = await getExpectText(ctx.from.id);
    if (!exp) return next();

    const doc = ctx.message.document;
    const mime = doc?.mime_type || '';

    // Giveaway: GIF as document
    if (String(exp.type) === 'gw_media_gif') {
      const wsId = Number(exp.wsId);

      if (!doc?.file_id || (mime && mime !== 'image/gif')) {
        await ctx.reply('Похоже, это не GIF. Пришли GIF как “анимацию” (или файл .gif).');
        return;
      }

      const draft = (await getDraft(ctx.from.id)) || { wsId };
      draft.media_type = 'animation';
      draft.media_file_id = doc.file_id;
      await setDraft(ctx.from.id, draft);
      await clearExpectText(ctx.from.id);

      await ctx.reply('✅ GIF прикреплён. Продолжаем:', { reply_markup: gwMediaKb(wsId, true) });
      return;
    }

    // Giveaway: video can come as document
    if (String(exp.type) === 'gw_media_video') {
      const wsId = Number(exp.wsId);
      if (!doc?.file_id || (mime && !String(mime).startsWith('video/'))) {
        await ctx.reply('Похоже, это не видео. Пришли mp4 как “видео” или как файл.');
        return;
      }

      const draft = (await getDraft(ctx.from.id)) || { wsId };
      draft.media_type = 'video';
      draft.media_file_id = doc.file_id;
      await setDraft(ctx.from.id, draft);
      await clearExpectText(ctx.from.id);

      await ctx.reply('✅ Видео прикреплено. Продолжаем:', { reply_markup: gwMediaKb(wsId, true) });
      return;
    }

    // Barter offer: GIF as document
    if (String(exp.type) === 'bx_media_gif') {
      const wsId = Number(exp.wsId);
      const offerId = Number(exp.offerId);
      const back = exp.back ? String(exp.back) : 'my';

      if (!doc?.file_id || (mime && mime !== 'image/gif')) {
        await ctx.reply('Похоже, это не GIF. Пришли GIF как “анимацию” (или файл .gif).');
        return;
      }

      const o = await db.getBarterOfferForOwner(ctx.from.id, offerId);
      if (!o) {
        await clearExpectText(ctx.from.id);
        await ctx.reply('Оффер не найден или нет доступа.');
        return;
      }

      await db.updateBarterOffer(offerId, { media_type: 'animation', media_file_id: doc.file_id });
      await clearExpectText(ctx.from.id);

      await ctx.reply('✅ GIF прикреплён. Продолжаем:', { reply_markup: bxMediaKb(wsId, offerId, back, true) });
      return;
    }

    // Barter offer: video can come as document
    if (String(exp.type) === 'bx_media_video') {
      const wsId = Number(exp.wsId);
      const offerId = Number(exp.offerId);
      const back = exp.back ? String(exp.back) : 'my';

      if (!doc?.file_id || (mime && !String(mime).startsWith('video/'))) {
        await ctx.reply('Похоже, это не видео. Пришли mp4 как “видео” или как файл.');
        return;
      }

      const o = await db.getBarterOfferForOwner(ctx.from.id, offerId);
      if (!o) {
        await clearExpectText(ctx.from.id);
        await ctx.reply('Оффер не найден или нет доступа.');
        return;
      }

      await db.updateBarterOffer(offerId, { media_type: 'video', media_file_id: doc.file_id });
      await clearExpectText(ctx.from.id);

      await ctx.reply('✅ Видео прикреплено. Продолжаем:', { reply_markup: bxMediaKb(wsId, offerId, back, true) });
      return;
    }

    return next();
  });

  // --- Commands ---
  bot.command('start', async (ctx) => {
    let preMsg = null;
    try {
      const payload = parseStartPayload(ctx.message?.text || '');

      // Early feedback for giveaway deep-links (Jobs-style)
      if (payload?.type === 'gw') preMsg = await ctx.reply('⏳ Открываю конкурс…');
      else if (payload?.type === 'gwj') preMsg = await ctx.reply('⏳ Записываю участие…');
      else if (payload?.type === 'gwc') preMsg = await ctx.reply('⏳ Открываю конкурс…');

      const u = await db.upsertUser(ctx.from.id, ctx.from.username ?? null);
      db.trackEvent('start', { userId: u.id, meta: { payloadType: payload?.type || null, hasPayload: !!payload } });
    if (payload?.type === 'gwj') {
      const loading = preMsg || await ctx.reply('⏳ Записываю участие…');
      const g = await db.getGiveawayInfoForUser(payload.id);
      if (!g) return ctx.api.editMessageText(ctx.chat.id, loading.message_id, 'Конкурс не найден.');
      await db.upsertGiveawayEntry(payload.id, u.id);
      await db.auditGiveaway(payload.id, g.workspace_id, u.id, 'gw.joined', { from: 'start_link' });
      const sponsors = await db.listGiveawaySponsors(payload.id);
      const entry = await db.getEntryStatus(payload.id, u.id);
      const text = renderParticipantScreen(g, entry, { hint: true, sponsors });
      const st = gwEffectiveStatusValue(g);
      const ended = ['ENDED','WINNERS_DRAWN','RESULTS_PUBLISHED','CANCELLED'].includes(st);
      try {
        return await ctx.api.editMessageText(ctx.chat.id, loading.message_id, text, { parse_mode: 'HTML', reply_markup: participantKb(payload.id, entry, { pub: true, ended }) });
      } catch {
        return ctx.reply(text, { parse_mode: 'HTML', reply_markup: participantKb(payload.id, entry, { pub: true, ended }) });
      }
    }
    if (payload?.type === 'gwc') {
      // Variant A: open the giveaway screen (no auto-check, no auto-join)
      const loading = preMsg || await ctx.reply('⏳ Открываю конкурс…');
      const g = await db.getGiveawayInfoForUser(payload.id);
      if (!g) return ctx.api.editMessageText(ctx.chat.id, loading.message_id, 'Конкурс не найден.');
      const sponsors = await db.listGiveawaySponsors(payload.id);
      const entry = await db.getEntryStatus(payload.id, u.id);
      const text = renderParticipantScreen(g, entry, { hint: true, sponsors });
      const st = gwEffectiveStatusValue(g);
      const ended = ['ENDED','WINNERS_DRAWN','RESULTS_PUBLISHED','CANCELLED'].includes(st);
      try {
        return await ctx.api.editMessageText(ctx.chat.id, loading.message_id, text, { parse_mode: 'HTML', reply_markup: participantKb(payload.id, entry, { pub: true, ended }) });
      } catch {
        return ctx.reply(text, { parse_mode: 'HTML', reply_markup: participantKb(payload.id, entry, { pub: true, ended }) });
      }
    }
    if (payload?.type === 'gw') {
      const loading = preMsg || await ctx.reply('⏳ Открываю конкурс…');
      const g = await db.getGiveawayInfoForUser(payload.id);
      if (!g) return ctx.api.editMessageText(ctx.chat.id, loading.message_id, 'Конкурс не найден.');
      const sponsors = await db.listGiveawaySponsors(payload.id);
      const entry = await db.getEntryStatus(payload.id, u.id);
      const text = renderParticipantScreen(g, entry, { hint: true, sponsors });
      const st = gwEffectiveStatusValue(g);
      const ended = ['ENDED','WINNERS_DRAWN','RESULTS_PUBLISHED','CANCELLED'].includes(st);
      try {
        return await ctx.api.editMessageText(ctx.chat.id, loading.message_id, text, { parse_mode: 'HTML', reply_markup: participantKb(payload.id, entry, { pub: true, ended }) });
      } catch {
        return ctx.reply(text, { parse_mode: 'HTML', reply_markup: participantKb(payload.id, entry, { pub: true, ended }) });
      }
    }
    if (payload?.type === 'gwo') {
      const g = await db.getGiveawayForOwner(payload.id, u.id);
      if (!g) return ctx.reply('Нет доступа к этому конкурсу.');
      const sponsors = await db.listGiveawaySponsors(payload.id);
      const sponsorLines = sponsors.map(s => `• ${escapeHtml(s.sponsor_text)}`).join('\n') || '—';
      const text = `🎁 <b>Конкурс #${g.id}</b>\n\nСтатус: <b>${escapeHtml(gwStatusLabel(gwEffectiveStatusValue(g)))}</b>
Приз: <b>${escapeHtml(g.prize_value_text || '—')}</b>\nМест: <b>${g.winners_count}</b>\n${gwEndsLine(g)}\n\nСпонсоры:\n${sponsorLines}`;
      return ctx.reply(text, { parse_mode: 'HTML', reply_markup: gwOpenKb(g, { isAdmin: isSuperAdminTg(ctx.from?.id) }) });
    }
    if (payload?.type === 'cur') {
      // curator invite flow
      const key = k(['cur_invite', payload.wsId, payload.token]);
      // single-use: consume value atomically when possible
      const val = await consumeOnce(key);
      if (!val) return ctx.reply('Ссылка устарела, недействительна или уже была использована.');
      const ownerUserId = Number(val.ownerUserId || val.owner_user_id || val.owner || 0);
      await db.addCurator(payload.wsId, u.id, ownerUserId || u.id);

      const ws = await db.getWorkspaceAny(Number(payload.wsId));
      const wsTitle = ws ? wsLabelNice(ws) : `Канал #${payload.wsId}`;
      const already = await getCuratorMode(ctx.from.id);
      const kb = new InlineKeyboard()
        .text('👤 Открыть кабинет куратора', 'a:cur_home')
        .row()
        .text(already ? '🧹 Режим куратора: ✅ ВКЛ' : '🧹 Включить режим куратора', `a:cur_mode_set|v:1|ret:cur`)
        .row()
        .text('🏠 Главное меню', 'a:menu');

      await ctx.reply(
        `✅ Ты назначен куратором для: <b>${escapeHtml(wsTitle)}</b>.

Что дальше:
1) Нажми <b>«👤 Открыть кабинет куратора»</b>
2) Выбери канал в списке:
   ✅ — доступ включен, можно смотреть конкурсы
   ❌ — владелец выключил кураторов (попроси включить в настройках канала)

💡 Для простоты включи <b>«🧹 Режим куратора»</b> — он прячет лишнее меню.`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
      return;
    }



    if (payload?.type === 'bminv') {
      // brand manager invite flow
      const key = k(['bm_invite', payload.token]);
      const val = await consumeOnce(key);
      if (!val) return ctx.reply('Ссылка устарела, недействительна или уже была использована.');

      const brandUserId = Number(val.brandUserId || val.brand_user_id || val.brand || 0);
      const addedByUserId = Number(val.addedByUserId || val.added_by_user_id || brandUserId || 0);

      if (!brandUserId) return ctx.reply('Ссылка недействительна.');

      await db.addBrandManager(brandUserId, u.id, addedByUserId || u.id);

      let brandLabel = null;
      await safeDeleteIncomingUserMessage(ctx);

      const prof = await safeBrandProfiles(() => db.getBrandProfile(brandUserId), async () => null);
      if (prof && !prof.__missing_relation && prof.brand_name) brandLabel = prof.brand_name;

      const owner = await db.getUserTgIdByUserId(brandUserId);
      if (!brandLabel) brandLabel = owner?.tg_username ? `@${owner.tg_username}` : `Бренд #${brandUserId}`;

      // включаем режим Brand Manager + ставим текущий бренд + переключаем UI в Brand
      await setBrandManagerMode(ctx.from.id, true);
      await setBmActiveBrand(ctx.from.id, brandUserId);
      await setUiMode(ctx.from.id, UI_MODES.BRAND);

      const kb = new InlineKeyboard()
        .text('🧑‍💼 Кабинет менеджера', 'a:bm_home')
        .row()
        .text('📥 Inbox', 'a:bx_inbox|ws:0|p:0|h:mm')
        .text('🔎 Поиск креаторов', 'a:pm_home|ws:0')
        .row()
        .text('📋 Меню', 'a:menu');

      await ctx.reply(
        `✅ Ты добавлен в <b>команду бренда</b>: <b>${escapeHtml(brandLabel)}</b>

<b>Ты сейчас в режиме:</b> <b>Brand Manager</b>

Доступ:
• 📩 Inbox
• 🔎 Поиск креаторов

Ограничения:
• нельзя менять профиль бренда
• нельзя управлять оплатами/подпиской
• нельзя управлять командой`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
      return;
    }

    if (payload?.type === 'fed') {
      // workspace folder editor invite flow
      const key = k(['ws_editor_invite', payload.wsId, payload.token]);
      const val = await redis.get(key);
      if (!val) return ctx.reply('Ссылка устарела или недействительна.');

      const ownerUserId = Number(val.ownerUserId || val.owner_user_id || val.owner || 0);
      await db.addWorkspaceEditor(payload.wsId, u.id, ownerUserId || u.id);
      await redis.del(key);

      const kb = new InlineKeyboard()
        .text('📁 Открыть папки Workspace', `a:folders_home|ws:${payload.wsId}`)
        .row()
        .text('🏠 Главное меню', 'a:menu');

      await ctx.reply(
        `✅ Готово! Ты добавлен как editor папок этого Workspace.

Можешь создавать папки, добавлять/удалять каналы и использовать их в конкурсах/офферах.`,
        { reply_markup: kb }
      );
      return;
    }

    
    if (payload?.type === 'wsp') {
      const wsId = Number(payload.wsId || 0);
      if (!wsId) return ctx.reply('Профиль не найден.');
      await renderWsPublicProfile(ctx, wsId);
      return;
    }

if (payload?.type === 'bxo') {
      const offer = await db.getBarterOfferPublic(payload.id);
      if (!offer) return ctx.reply('Оффер не найден.');
      const wsId = Number(offer.workspace_id);
      return renderBxPublicView(ctx, u.id, wsId, payload.id, 0);
    }

    if (payload?.type === 'bxth') {
      const built = await buildBxThreadView(u.id, payload.id);
      if (!built) return ctx.reply('Диалог не найден.');
      const { thread, text } = built;
      const wsId = Number(thread.workspace_id);
      const kb = bxThreadKb(wsId, thread.id, { back: 'inbox', page: 0, offerId: thread.offer_id });
      return ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
    }

    const flags = await getRoleFlags(u, ctx.from.id);

    // HOME HUB (Commit87): unified start screen for role switching.
    await renderHomeHub(ctx, u, flags, { edit: false });
    await maybeSendBanner(ctx, 'menu', CFG.MENU_BANNER_FILE_ID);

    } catch (e) {
      console.error('[START] error', {
        chat_id: ctx?.chat?.id ?? null,
        from_id: ctx?.from?.id ?? null,
        message: String(e?.message || e?.error?.message || e || ''),
        name: String(e?.name || e?.error?.name || 'Error'),
      });
      try {
        const msg = '⚠️ Сейчас есть техническая ошибка. Попробуй ещё раз через минуту.';
        if (preMsg?.message_id) {
          await ctx.api.editMessageText(ctx.chat.id, preMsg.message_id, msg);
        } else {
          await ctx.reply(msg);
        }
      } catch {}
    }


  });


  bot.command('help', async (ctx) => {
    try {
      await clearExpectText(ctx.from.id);
    } catch {}

    const text = `❓ Collabka — UGC/Collab CRM в Telegram

Для Creator’ов
• 🚀 Подключи канал (бот админ) и перешли любой пост
• 🪟 Заполни витрину: IG, портфолио, ниши/форматы, гео, контакт
• 🔗 Поставь ссылку витрины в Instagram (bio / stories)
• 📨 Заявки брендов → Inbox, статусы, история

Для брендов
• 🔎 Поиск креаторов → фильтры → кампании (сохранённые поиски)
• 📩 Запрос можно отправить прямо из списка или из витрины
• Всё дальше в TG: интро, дедлайны, материалы

UGC vs Интеграция
🎬 UGC — контент без аудитории (важно качество/вкус)
📣 Интеграция — публикация у креатора (важны охваты)

Розыгрыши
• 🎟 «Участвовать» → 🔄 «Проверить»
• Если подписался только что — подожди 10 сек и проверь снова
• ❔ в проверке = бот не админ в одном из каналов или канал приватный

Команды
/start — главное меню
/help — помощь и быстрый старт
/paysupport — помощь по оплате и Stars`;

    const kb = new InlineKeyboard()
      .text('🧭 Быстрый старт', 'a:guide')
      .text('📋 Меню', 'a:menu')
      .row()
      .text('🏷 Для брендов', 'a:bx_open|ws:0')
      .text('🎬 UGC / Офферы', 'a:bx_home')
      .row()
      .text('🎁 Розыгрыши', 'a:gw_list');

    await ctx.reply(text, { reply_markup: kb });
  });


  // --- QA / Debug (admin-only) ---
  // Hidden command: /qa
  // Prints current filter keys + step-by-step match counts for Brand Directory.
  bot.command('qa', async (ctx) => {
    if (!isSuperAdminTg(ctx.from?.id)) return;

    try {
      await clearExpectText(ctx.from.id);
    } catch {}

    const u = await db.upsertUser(ctx.from.id, ctx.from.username ?? null);

    const uiMode = await resolveUiMode(ctx.from.id);
    const activeWs = await getActiveWorkspace(ctx.from.id);

    let offersMetaOk = null;
    try {
      offersMetaOk = await db.hasBarterOffersMetaColumn();
    } catch {
      offersMetaOk = null;
    }

    // Raw BD filter payload (Redis JSON)
    let bdRaw = null;
    let bdRawObj = null;
    try {
      bdRaw = await redis.get(`bd_filter:${ctx.from.id}`);
      if (bdRaw) {
        try {
          bdRawObj = JSON.parse(String(bdRaw));
        } catch {}
      }
    } catch {}

    const f = await getBrandDirFilter(ctx.from.id);

    const calc = await safeBrandProfiles(
      async () => {
        const steps = [];
        const base = await db.countBrandsDirectoryFiltered({});
        steps.push({ title: 'База (4/4)', count: base });

        let cur = {};
        const push = async (title, patch) => {
          cur = { ...cur, ...patch };
          const c = await db.countBrandsDirectoryFiltered(cur);
          steps.push({ title, count: c });
        };

        if (f.category) await push(`+Категория: ${f.category}`, { category: f.category });
        if (f.offerType) await push(`+Формат: ${f.offerType}`, { offerType: f.offerType });
        if (f.compensationType) await push(`+Оплата: ${f.compensationType}`, { compensationType: f.compensationType });
        if (f.budgetBucket) await push(`+Бюджет: ${f.budgetBucket}`, { budgetBucket: f.budgetBucket });
        if (f.goalsTags && f.goalsTags.length) await push(`+Цели (теги): ${f.goalsTags.join(',')}`, { goalsTags: f.goalsTags });
        if (f.reqTags && f.reqTags.length) await push(`+Треб. (теги): ${f.reqTags.join(',')}`, { reqTags: f.reqTags });

        const finalCount = steps[steps.length - 1]?.count ?? base;

        let firstZero = null;
        for (let i = 1; i < steps.length; i++) {
          if (steps[i].count === 0 && steps[i - 1].count > 0) {
            firstZero = steps[i].title;
            break;
          }
        }

        return { steps, finalCount, firstZero };
      },
      async () => ({ __missing_relation: true })
    );

    if (calc && calc.__missing_relation) {
      await ctx.reply(
        `⚠️ QA недоступен: в базе нет таблицы brand_profiles.
Примени migrations/024_brand_profiles.sql (Neon) и повтори.`,
        { reply_markup: navKb('a:menu') }
      );
      return;
    }

    const { steps, finalCount, firstZero } = calc;

    const uname = ctx.from.username ? '@' + escapeHtml(ctx.from.username) : '—';

    const lines = [];
    lines.push('🧪 <b>QA — Brand Directory</b>');
    lines.push('');
    lines.push(`TG: <code>${ctx.from.id}</code> · user_id: <code>${u.id}</code> · ${uname}`);
    lines.push(`UI mode: <b>${escapeHtml(uiModeHuman(uiMode))}</b> · active_ws: <code>${activeWs || 0}</code>`);
    lines.push(`barter_offers.meta: <b>${offersMetaOk === null ? '—' : (offersMetaOk ? 'OK' : 'MISSING')}</b>`);
    if (offersMetaOk === false) {
      lines.push(`⚠️ Примени migrations/028_barter_offers_meta.sql — иначе теги офферов и tag-фильтры работать не будут.`);
    }
    lines.push('');

    lines.push('<b>BD filter (normalized)</b>');
    lines.push(`• category: <code>${escapeHtml(String(f.category || ''))}</code>`);
    lines.push(`• offerType: <code>${escapeHtml(String(f.offerType || ''))}</code>`);
    lines.push(`• compensationType: <code>${escapeHtml(String(f.compensationType || ''))}</code>`);
    lines.push(`• budgetBucket: <code>${escapeHtml(String(f.budgetBucket || ''))}</code>`);
    lines.push(`• goalsTags: <code>${escapeHtml((f.goalsTags || []).join(',') || '')}</code>`);
    lines.push(`• reqTags: <code>${escapeHtml((f.reqTags || []).join(',') || '')}</code>`);

    lines.push('');
    lines.push('<b>Counts</b>');
    for (const s of steps) lines.push(`• ${escapeHtml(s.title)} → <b>${s.count}</b>`);
    lines.push('');
    lines.push(`✅ Итоговое совпадение: <b>${finalCount}</b>`);

    if (finalCount === 0 && firstZero) {
      lines.push(`⚠️ Первое “обнуление” на шаге: <b>${escapeHtml(firstZero)}</b>`);
      lines.push('💡 Обычно это значит: у брендов не заполнены соответствующие поля/теги, либо фильтр слишком жёсткий.');
    }

    // Show BX filters for active workspace (if any)
    try {
      if (activeWs) {
        const bx = await getBxFilterScoped(ctx.from.id, u.id, activeWs);
        lines.push('');
        lines.push('<b>BX filters</b> (active workspace)');
        lines.push(`• ws: <code>${activeWs}</code>`);
        lines.push(`• category: <code>${escapeHtml(String(bx.category || ''))}</code>`);
        lines.push(`• offerType: <code>${escapeHtml(String(bx.offerType || ''))}</code>`);
        lines.push(`• compensationType: <code>${escapeHtml(String(bx.compensationType || ''))}</code>`);
        lines.push(`• goalsTags: <code>${escapeHtml((bx.goalsTags || []).join(',') || '')}</code>`);
        lines.push(`• reqTags: <code>${escapeHtml((bx.reqTags || []).join(',') || '')}</code>`);

        // counts + sample ids for current BX filter (debug "0 results" cases)
        try {
          const bxCount = await db.countNetworkBarterOffers({
            category: bx.category,
            offerType: bx.offerType,
            compensationType: bx.compensationType,
            goalsTags: bx.goalsTags,
            reqTags: bx.reqTags,
          });
          let sampleIds = [];
          try {
            const sampleRows = await db.listNetworkBarterOffers({
              category: bx.category,
              offerType: bx.offerType,
              compensationType: bx.compensationType,
              goalsTags: bx.goalsTags,
              reqTags: bx.reqTags,
              limit: 5,
              offset: 0,
            });
            sampleIds = (sampleRows || []).map((x) => x.id).filter(Boolean);
          } catch {}
          lines.push(`• match_count: <b>${bxCount}</b>`);
          if (sampleIds.length) lines.push(`• sample_ids: <code>${escapeHtml(sampleIds.join(','))}</code>`);
        } catch {}
      }
    } catch {}

// Raw Redis (compact)
 (compact)
    if (bdRaw) {
      lines.push('');
      lines.push('<b>BD filter (raw redis)</b>');
      lines.push(`<code>${escapeHtml(clipText(String(bdRaw), 700))}</code>`);
    }

    // Small mismatch hints
    if (bdRawObj && typeof bdRawObj === 'object') {
      const notes = [];
      if (String(bdRawObj.compensationType || '') === 'rub') notes.push('compensationType=rub → paid');
      if (bdRawObj.cat || bdRawObj.type || bdRawObj.comp) notes.push('старые ключи cat/type/comp (нормализуются)');
      if (String(bdRawObj.offerType || '') === 'undefined' || String(bdRawObj.compensationType || '') === 'undefined') notes.push('есть "undefined" в фильтре (будет очищено при следующем set)');

      if (notes.length) {
        lines.push('');
        lines.push('🧩 <b>Наблюдения</b>');
        for (const n of notes) lines.push(`• ${escapeHtml(n)}`);
      }
    }

    lines.push('');
    lines.push('Команда: /qa (только для админа)');

    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  bot.command('whoami', async (ctx) => {
    const me = await ctx.api.getMe();
    await ctx.reply(`BOT_ID=${me.id}\nBOT_USERNAME=@${me.username}`);
  });

  bot.command('paysupport', async (ctx) => {
    // Telegram expects bots that accept payments to provide a support contact via /paysupport.
    const contactRaw = (CFG.PAY_SUPPORT_TEXT && String(CFG.PAY_SUPPORT_TEXT).trim())
      ? String(CFG.PAY_SUPPORT_TEXT).trim()
      : '@collabka_support';

    const contactHtml = String(contactRaw)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const msg = [
      '💬 <b>Поддержка по оплате / Stars</b>',
      `Если что-то пошло не так — напиши в поддержку: <b>${contactHtml}</b>`,
      '',
      '<b>Что указать:</b>',
      '1) Что покупал (PRO / Brand Pass / Plan / Featured / Matching)',
      '2) Примерное время оплаты',
      '3) Скрин чека (если есть)',
      '4) Твой @username и что случилось'
    ].join('\n');

    await ctx.reply(msg, { parse_mode: 'HTML', disable_web_page_preview: true });
  });



  // --- Payments (Telegram Stars) ---
  bot.on('pre_checkout_query', async (ctx) => {
    try {
      await ctx.answerPreCheckoutQuery(true);
    } catch (_) {
      // ignore
    }
  });

bot.on('message:successful_payment', async (ctx) => {
  const sp = ctx.message.successful_payment;
  const invoicePayload = sp?.invoice_payload || '';
  if (!invoicePayload) return;

  // ensure user exists
  const u = await db.upsertUser(ctx.from.id, ctx.from.username ?? null);

  const kind =
    invoicePayload.startsWith('pro_') ? 'pro' :
    invoicePayload.startsWith('brand_') ? 'brand_pass' :
    invoicePayload.startsWith('bplan_') ? 'brand_plan' :
    invoicePayload.startsWith('match_') ? 'matching' :
    invoicePayload.startsWith('feat_') ? 'featured' :
    invoicePayload.startsWith('offpub_') ? 'official_publish' :
    'unknown';

  db.trackEvent('payment_success', { userId: u.id, meta: { kind, payload: invoicePayload, amount: sp.total_amount, currency: sp.currency || 'XTR' } });

  // 1) Old ledger: protects from Telegram retries/duplicates
  const starsLedger = await db.recordStarsPayment({
    userId: u.id,
    kind,
    invoicePayload,
    currency: sp.currency,
    totalAmount: sp.total_amount,
    telegramPaymentChargeId: sp.telegram_payment_charge_id,
    providerPaymentChargeId: sp.provider_payment_charge_id,
    raw: sp
  });
  if (starsLedger && starsLedger.inserted === false) {
    await ctx.reply('✅ Платеж уже обработан.');
    return;
  }

  // 2) New payments ledger (admin apply + statuses)
  const pay = await db.insertPayment({
    userId: u.id,
    kind,
    invoicePayload,
    currency: sp.currency,
    totalAmount: sp.total_amount,
    telegramPaymentChargeId: sp.telegram_payment_charge_id,
    providerPaymentChargeId: sp.provider_payment_charge_id,
    raw: sp,
    status: 'RECEIVED'
  });
  if (pay && pay.inserted === false) {
    await ctx.reply('✅ Платеж уже обработан.');
    return;
  }
  const paymentId = pay?.id || null;

  const markStatus = async (status, note) => {
    if (!paymentId) return null;
    try {
      return await db.setPaymentStatus(paymentId, status, note);
    } catch {
      return null;
    }
  };
  const markApplied = async (note) => {
    if (!paymentId) return null;
    try {
      return await db.markPaymentApplied(paymentId, u.id, note);
    } catch {
      return null;
    }
  };

  // We keep Smart Matching / Featured in UI, but post-payment they are always ORPHANED
  // (so the team can decide later; avoids accidental auto-fulfillment).
  if (invoicePayload.startsWith('match_') || invoicePayload.startsWith('feat_') || invoicePayload.startsWith('offpub_')) {
    await markStatus('ORPHANED', 'postpay_orphaned');
    db.trackEvent('payment_orphaned', { userId: u.id, meta: { kind, payload: invoicePayload, reason: 'postpay_orphaned' } });
    if (invoicePayload.startsWith('offpub_')) {
      let offerId = 0;
      let days = 0;
      let offer = null;
      try {
        const parts = String(invoicePayload).split('_');
        offerId = Number(parts[2]);
        days = Number(parts[3] || CFG.OFFICIAL_MANUAL_DEFAULT_DAYS);
        const channelChatId = Number(CFG.OFFICIAL_CHANNEL_ID || 0);

        if (offerId && channelChatId) {
          await db.upsertOfficialPostDraft({
            offerId,
            channelChatId,
            placementType: 'PAID',
            paymentId,
            slotDays: days
          });
        }
        offer = offerId ? await db.getBarterOfferPublic(offerId) : null;
      } catch (_) { /* ignore */ }

      // Notify super admins with direct actions (queue + publish + card).
      try {
        const wsId = offer?.workspace_id ? Number(offer.workspace_id) : 0;
        const fromTag = ctx.from?.username ? `@${ctx.from.username}` : `tg:${ctx.from?.id}`;
        await notifyOfficialQueueAdmins(ctx.api, {
          kind: 'paid',
          offerId,
          wsId,
          offerTitle: offer?.title || '',
          wsTitle: offer?.ws_title || '',
          channelUsername: offer?.channel_username || '',
          days,
          paymentId,
          fromTag
        });
      } catch (_) { /* ignore */ }

      // User confirmation + quick access to status screen.
      try {
        const wsId = offer?.workspace_id ? Number(offer.workspace_id) : 0;
        const kb = new InlineKeyboard();
        if (wsId && offerId) kb.text('📣 Статус офиц.канала', `a:off_manage|ws:${wsId}|o:${offerId}|p:0|back:my`).row();
        kb.text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');

        await ctx.reply('✅ Оплата получена! Оффер поставлен в очередь на публикацию в официальном канале. Модератор опубликует его вручную.', {
          reply_markup: kb
        });
      } catch {
        await ctx.reply('✅ Оплата получена! Оффер поставлен в очередь на публикацию в официальном канале. Модератор опубликует его вручную.');
      }
    } else {
      await ctx.reply('✅ Платеж получен. Сейчас эта услуга обрабатывается вручную — я свяжусь с тобой в ближайшее время.');
      // Notify super admins so the service request is not lost.
      try {
        const admins = Array.isArray(CFG.SUPER_ADMIN_TG_IDS) ? CFG.SUPER_ADMIN_TG_IDS : [];
        if (admins.length) {
          const userTag = ctx.from?.username ? `@${ctx.from.username}` : `tg:${ctx.from?.id}`;
          const amount = sp.total_amount;
          const currency = sp.currency || 'XTR';
          const msg = [
            '🧾 ORPHANED service payment',
            `Kind: ${kind}`,
            `Payload: ${invoicePayload}`,
            `From: ${userTag} (userId=${u.id})`,
            `Amount: ${amount} ${currency}`,
            `TG charge: ${sp.telegram_payment_charge_id || '-'}`,
            `PaymentId: ${paymentId || '-'}`,
            '',
            'Next: open Admin → Payments → filter ORPHANED and process it.'
          ].join('\n');
          for (const a of admins) {
            await ctx.api.sendMessage(a, msg);
          }
        }
      } catch (_) { /* ignore */ }
    }

    return;
  }

  const { autoApply } = await getPaymentsRuntimeFlags();
  if (!autoApply) {
    await markStatus('ORPHANED', 'auto_apply_paused');
    db.trackEvent('payment_orphaned', { userId: u.id, meta: { kind, payload: invoicePayload, reason: 'auto_apply_paused' } });
    await ctx.reply('✅ Платеж получен. Автовыдача сейчас на паузе — я применю вручную.');
    return;
  }

  // PRO activation
  if (invoicePayload.startsWith('pro_')) {
    try {
      const parts = invoicePayload.split('_');
      const wsId = Number(parts[1]);

      // New format: pro_<wsId>_<userId>_<token>
      // Old format (backwards compatible): pro_<wsId>_<token>
      let payUserId = 0;
      let token = '';
      if (parts.length >= 4 && /^\d+$/.test(String(parts[2] || ''))) {
        payUserId = Number(parts[2]);
        token = parts.slice(3).join('_');
      } else {
        token = parts.slice(2).join('_');
      }

      const data = await redis.get(k(['pay_pro', token]));
      const tgOk = !data?.tgId || Number(data.tgId) === Number(ctx.from.id);
      const userOk = !payUserId || Number(data?.ownerUserId) === payUserId;

      if (!data || Number(data.wsId) != wsId || !tgOk || !userOk) {
        await markStatus('ORPHANED', 'missing_session');
        await ctx.reply('✅ Платеж получен. Но сессия оплаты не найдена (возможно, истекла). Напиши /start и открой ⭐️ PRO, я помогу вручную.');
        return;
      }

      await db.activateWorkspacePro(wsId, CFG.PRO_DURATION_DAYS);
      await db.auditWorkspace(wsId, data.ownerUserId, 'pro.activated', {
        currency: sp.currency,
        total_amount: sp.total_amount,
        telegram_payment_charge_id: sp.telegram_payment_charge_id
      });
      await redis.del(k(['pay_pro', token]));
      await markApplied('auto_apply_pro');
      await ctx.reply('⭐️ PRO активирован! Открой настройки канала → ⭐️ PRO, чтобы управлять пином и лимитами.');
      return;
    } catch (e) {
      await markStatus('ERROR', `auto_apply_error: ${String(e?.message || e).slice(0, 120)}`);
      await ctx.reply('✅ Платеж получен. Возникла ошибка авто-выдачи — я применю вручную.');
      return;
    }
  }

  // Brand Pass credits
  if (invoicePayload.startsWith('brand_')) {
    try {
      const parts = invoicePayload.split('_');
      const payUserId = Number(parts[1]);
      const token = parts.slice(3).join('_');

      const data = await redis.get(k(['pay_brand', token]));
      if (!data || Number(data.userId) !== payUserId || Number(data.tgId) !== Number(ctx.from.id)) {
        await markStatus('ORPHANED', 'missing_session');
        await ctx.reply('✅ Платеж получен. Но сессия оплаты не найдена (возможно, истекла). Напиши /start — я помогу.');
        return;
      }

      const creditsToAdd = Number(data.credits || 0);
      const newBalance = await db.addBrandCredits(payUserId, creditsToAdd);
      const introCost = Math.max(1, Number(CFG.INTRO_COST_PER_INTRO || 1));
      await redis.del(k(['pay_brand', token]));

      const kb = new InlineKeyboard();
      if (data.offerId) {
        kb.text('↩️ Вернуться к офферу', `a:bx_pub|ws:${data.wsId}|o:${data.offerId}|p:${Number(data.page || 0)}|h:bo`)
          .row();
      }
      kb.text('🎫 Brand Pass', `a:brand_pass|ws:${data.wsId}`)
        .text('📥 Inbox', `a:bx_inbox|ws:${data.wsId}|p:0|h:bo`);

      await markApplied('auto_apply_brand_pass');
      await ctx.reply(
        `✅ Brand Pass активирован!

Начислено: +${creditsToAdd}
🎫 Brand Pass (кредиты): ${fmtCredits(newBalance)}

Как тратить кредиты:
• 💬 Интро = новый диалог: ${introCost} кредит(ов)
• 🔓 Контакты на витрине: ${CONTACT_UNLOCK_COST <= 0 ? 'бесплатно' : (CONTACT_UNLOCK_COST + ' кредит(ов)')} → ${CONTACT_UNLOCK_TTL_DAYS} дней
• Переписка внутри диалога — бесплатно

Дальше: открой 📥 Inbox и нажми «💬 Диалог».`,
        { reply_markup: kb }
      );
      return;
    } catch (e) {
      await markStatus('ERROR', `auto_apply_error: ${String(e?.message || e).slice(0, 120)}`);
      await ctx.reply('✅ Платеж получен. Возникла ошибка авто-выдачи — я применю вручную.');
      return;
    }
  }

  // Brand Plan tools subscription
  if (invoicePayload.startsWith('bplan_')) {
    try {
      const parts = invoicePayload.split('_');
      const payUserId = Number(parts[1]);
      const plan = String(parts[2] || 'basic').toLowerCase();
      const token = parts.slice(3).join('_');

      const data = await redis.get(k(['pay_bplan', token]));
      if (!data || Number(data.userId) !== payUserId || Number(data.tgId) !== Number(ctx.from.id)) {
        await markStatus('ORPHANED', 'missing_session');
        await ctx.reply('✅ Платеж получен. Но сессия оплаты не найдена (возможно, истекла). Напиши /start — я помогу.');
        return;
      }

      await db.activateBrandPlan(payUserId, plan, CFG.BRAND_PLAN_DURATION_DAYS);
      await redis.del(k(['pay_bplan', token]));

      const wsId = Number(data.wsId || 0);
      const kb = new InlineKeyboard()
        .text('⭐️ Brand Plan', `a:brand_plan|ws:${wsId}`)
        .text('📥 Inbox', `a:bx_inbox|ws:${wsId}|p:0|h:bo`)
        .row()
        .text('⬅️ Назад', `a:bx_open|ws:${wsId}`);

      await markApplied('auto_apply_brand_plan');
      await ctx.reply('✅ Brand Plan активирован! CRM-стадии в Inbox доступны (для бренда).', { reply_markup: kb });
      return;
    } catch (e) {
      await markStatus('ERROR', `auto_apply_error: ${String(e?.message || e).slice(0, 120)}`);
      await ctx.reply('✅ Платеж получен. Возникла ошибка авто-выдачи — я применю вручную.');
      return;
    }
  }

  await markStatus('ORPHANED', 'unknown_payload');
  await ctx.reply('✅ Платеж получен. Я проверю и применю вручную.');
});
// --- Callback router ---
  bot.on('callback_query:data', async (ctx) => {
      // Make callback UX resilient: ack immediately, and keep a stable UI target for edits.
    const _acq = ctx.answerCallbackQuery?.bind(ctx);
    if (_acq) ctx.answerCallbackQuery = (opts) => _acq(opts).catch(() => {});

    // Stable UI target: if edit is impossible and we fall back to reply,
    // subsequent edits must target the new message (no orphan "⏳").
    try {
      const cbMsg = ctx?.callbackQuery?.message;
      ctx.state = ctx.state || {};
      ctx.state.ui = ctx.state.ui || {};
      ctx.state.ui.chatId = cbMsg?.chat?.id ?? ctx?.chat?.id ?? null;
      ctx.state.ui.messageId = cbMsg?.message_id ?? null;
    } catch {}

    const _errStr = (e) => String(e?.description || e?.message || e || '');
    const _isNotModified = (m) => m.includes('message is not modified') || m.includes('MESSAGE_NOT_MODIFIED');
    const _isEditImpossible = (m) =>
      m.includes('message to edit not found') ||
      m.includes("message can't be edited") ||
      m.includes('MESSAGE_ID_INVALID') ||
      m.includes('message is too old') ||
      m.includes('CHAT_WRITE_FORBIDDEN');


    const _origEditText = ctx.editMessageText?.bind(ctx);
    ctx.editMessageText = async (text, extra) => {
      const ui = ctx?.state?.ui || {};
      const chatId = ui.chatId;
      const messageId = ui.messageId;

      try {
        if (chatId && messageId && ctx?.api?.editMessageText) {
          return await ctx.api.editMessageText(chatId, messageId, text, extra);
        }
        if (_origEditText) return await _origEditText(text, extra);
        throw new Error('editMessageText unavailable');
      } catch (e) {
        const m = _errStr(e);
        if (_isNotModified(m)) return;
        if (_isEditImpossible(m)) {
          const sent = await ctx.reply(text, extra).catch(() => null);
          if (sent?.message_id && sent?.chat?.id) {
            try { ctx.state.ui.chatId = sent.chat.id; ctx.state.ui.messageId = sent.message_id; } catch {}
          }
          return sent;
        }
        throw e;
      }
    };

    if (typeof ctx.editMessageReplyMarkup === 'function') {
      const _origEditMarkup = ctx.editMessageReplyMarkup.bind(ctx);
      ctx.editMessageReplyMarkup = async (markup) => {
        const ui = ctx?.state?.ui || {};
        const chatId = ui.chatId;
        const messageId = ui.messageId;
        try {
          if (chatId && messageId && ctx?.api?.editMessageReplyMarkup) {
            return await ctx.api.editMessageReplyMarkup(chatId, messageId, { reply_markup: markup });
          }
          return await _origEditMarkup(markup);
        } catch (e) {
          const m = _errStr(e);
          if (_isNotModified(m)) return;
          return;
        }
      };
    }

// Stop Telegram "loading" spinner ASAP
    await ctx.answerCallbackQuery();

  const p = parseCb(ctx.callbackQuery.data);
    // MENU ALIASES (no-break): support legacy action names from older messages
    const _aliasA = {
      'a:brand_managers': 'a:brand_team',
      'a:brand_team_home': 'a:brand_team',
      'a:team': 'a:brand_team',
      'a:curators': 'a:cur_home',
      'a:curators_home': 'a:cur_home',
      'a:curator_home': 'a:cur_home',
      'a:home_hub': 'a:home',
    };
    if (_aliasA[p.a]) p.a = _aliasA[p.a];

    const u = await db.upsertUser(ctx.from.id, ctx.from.username ?? null);
    // Cancel any pending text input step when user clicks an inline button
    try { await clearExpectText(ctx.from.id); } catch {}


    const legacy = async () => {

// NOTIFY: dismiss system notification (double-tap confirm)
if (p.a === 'a:nd') {
  try { await ctx.answerCallbackQuery(); } catch {}

  const m = ctx.callbackQuery?.message;
  if (!m) return;
  const chatId = Number(m.chat?.id || 0);
  const msgId = Number(m.message_id || 0);
  const uid = Number(ctx.from?.id || 0);
  if (!chatId || !msgId || !uid) return;

  const key = k(['notify_dismiss', chatId, msgId, uid]);
  let armed = false;
  try {
    const v = await redis.get(key);
    if (v) armed = true;
  } catch {}

  if (!armed) {
    try {
      // arm for 25 seconds
      await redis.set(key, '1', { ex: 25 });
    } catch {}
    try {
      await ctx.answerCallbackQuery({ text: 'Нажми ещё раз, чтобы убрать уведомление.' });
    } catch {}
    return;
  }

  try { await redis.del(key); } catch {}

  try {
    await ctx.api.deleteMessage(chatId, msgId);
    try { await ctx.answerCallbackQuery({ text: '✅ Убрано' }); } catch {}
    return;
  } catch (e) {
    // If deletion not allowed, at least remove buttons
    try {
      await ctx.api.editMessageReplyMarkup(chatId, msgId, { reply_markup: undefined });
      try { await ctx.answerCallbackQuery({ text: 'Кнопки убрал — сообщение удали вручную.' }); } catch {}
      return;
    } catch {}
  }

  try { await ctx.answerCallbackQuery({ text: 'Не смог удалить. Удали вручную.' }); } catch {}
  return;
}

if (p.a === 'a:ui_mode_set') {
  await ctx.answerCallbackQuery();
  const mode = normalizeUiMode(p.m);
  await setUiMode(ctx.from.id, mode);

  const flags = await getRoleFlags(u, ctx.from.id);
  const curMode = !!flags.isCurator && (await getCuratorMode(ctx.from.id));
  if (curMode) {
    await safeEditOrReply(ctx, 
      `🧹 <b>Режим куратора</b> включен.\n\nДля простоты я скрываю лишнее меню.\n\nТы сейчас в режиме: <b>Curator</b>`,
      { parse_mode: 'HTML', reply_markup: curatorModeMenuKb(flags) }
    );
    return;
  }

  await renderMainMenu(ctx, flags, { edit: true });
  return;
}

if (p.a === 'a:guide') {
  const flags = await getRoleFlags(u, ctx.from.id);
  const mode = await resolveUiMode(ctx.from.id);
  const bmMode = await getBrandManagerMode(ctx.from.id);
  const isBrandish = normalizeUiMode(mode) === UI_MODES.BRAND || bmMode;

  let text = `🧭 <b>Быстрый старт</b>

<b>Карта</b>
`;

  if (isBrandish) {
    text +=
      `• 🎬 Офферы → 🎬 Офферы (лента) / 🔎 Поиск
` +
      `• 📥 Inbox — диалоги и заявки
` +
      `• 🎛 Фильтры — кнопка «🎛 Фильтры» ниже

`;
  } else {
    text +=
      `• 🎬 Офферы → 📣 Мои каналы → выбери канал → 🎬 UGC / Офферы
` +
      `• 📥 Inbox → 📣 Мои каналы → выбери канал → 📥 Inbox
` +
      `• 📨 Заявки → 📣 Мои каналы → выбери канал → 📨 Заявки брендов
` +
      `• 🏷 Каталог → кнопка «🏷 Каталог брендов» ниже

`;
  }

  if (isBrandish) {
    text +=
      `🏷 <b>Режим Бренд</b>\n` +
      `• Офферы: смотри ленту креаторов / поиск\n` +
      `• Диалоги и заявки: всё в Inbox\n\n`;
  } else {
    text +=
      `✨ <b>Режим Creator / канал</b>\n` +
      `• Подключи канал → заполни витрину → публикуй офферы\n\n`;
  }

  text += `Навигация: ⬅️ Назад / 📋 Меню / 🏠 Home`;

  const kb = new InlineKeyboard();

  // Map shortcuts (same as HOME HUB, mode-aware)
  if (isBrandish) {
    kb
      .text('📥 Inbox', 'a:go_dialogs')
      .text('🎛 Фильтры', 'a:bx_filters|ws:0|p:0|h:mm|r:mm')
      .row();
  } else {
    kb.text('📣 Мои каналы', 'a:ws_list').text('🏷 Каталог брендов', 'a:brands_home').row();
  }

  if (isBrandish) {
    kb.text('🎬 Офферы (лента)', 'a:bx_feed|ws:0|p:0|h:mm')
      .text('🔎 Поиск', 'a:pm_home|ws:0')
      .row();
  } else {
    kb.text('🎬 Офферы', 'a:bx_home')
      .text('🚀 Подключить канал', 'a:setup')
      .row();
  }

  if (!isBrandish) {
    kb.text('📥 Inbox', 'a:go_dialogs').text('📨 Заявки', 'a:go_requests').row();
  }

  if (!isBrandish) {
    kb.text('🏷 Я бренд', 'a:ui_mode_set|m:brand|ret:menu').row();
  }

  kb.row().text('💬 Поддержка', 'a:support').text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb });
  await maybeSendBanner(ctx, 'guide', CFG.GUIDE_BANNER_FILE_ID);
  return;
}

if (p.a === 'a:go_dialogs') {
  await ctx.answerCallbackQuery();
  const mode = await resolveUiMode(ctx.from.id);
  const bmMode = await getBrandManagerMode(ctx.from.id);
  const isBrandish = normalizeUiMode(mode) === UI_MODES.BRAND || bmMode;

  if (isBrandish) {
    const wsId = 0;
    const page = 0;
    const h = BX_HOME.MENU;

    const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_inbox', page, { h });
    if (!bmRes) return;

    await renderBxInbox(ctx, bmRes.userId, wsId, page, { bm: bmRes.bm, h });
    return;
  }

  const ws = await ensureWorkspaceForOwner(ctx, u.id);
  if (!ws) return;

  await renderBxInbox(ctx, u.id, ws.id, 0, { h: BX_HOME.BX_OPEN });
  return;
}

if (p.a === 'a:go_requests') {
  await ctx.answerCallbackQuery();
  const mode = await resolveUiMode(ctx.from.id);
  const bmMode = await getBrandManagerMode(ctx.from.id);
  const isBrandish = normalizeUiMode(mode) === UI_MODES.BRAND || bmMode;

  // For Brand: requests/responses live in Inbox.
  if (isBrandish) {
    const wsId = 0;
    const page = 0;
    const h = BX_HOME.MENU;

    const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_inbox', page, { h });
    if (!bmRes) return;

    await renderBxInbox(ctx, bmRes.userId, wsId, page, { bm: bmRes.bm, h });
    return;
  }

  const ws = await ensureWorkspaceForOwner(ctx, u.id);
  if (!ws) return;

  await renderWsLeadsList(ctx, u.id, ws.id, 'new', 0, 'ws_open');
  return;
}

if (p.a === 'a:support') {
  const text = `💬 <b>Поддержка</b>

` +
    `Если что-то не работает или есть вопрос — напиши одним сообщением.
` +
    `Я отправлю это в поддержку и вернусь с ответом здесь.

` +
    `Что помогает быстрее решить:
` +
    `• в каком режиме ты был (Creator / Brand / Manager)
` +
    `• что нажимал (кнопки)
` +
    `• текст ошибки из логов/скрин (опиши)

` +
    `⚠️ Спам/реклама — бан.`;

  const kb = new InlineKeyboard()
    .text('✍️ Написать в поддержку', 'a:support_write')
    .row()
    .text('🧭 Быстрый старт', 'a:guide')
    .text('📋 Меню', 'a:menu');

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
  return;
}

if (p.a === 'a:support_write') {
  await ctx.answerCallbackQuery();
  await setExpectText(ctx.from.id, { type: 'support_any', backCb: 'a:support' });

  const text = `✍️ <b>Пришли одним сообщением</b> текст или фото/скрин (можно с подписью).

Пример: «В режиме Brand нажимаю X → ошибка Y».

Я отправлю это в поддержку.`;

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: navKb('a:support') });
  return;
}


// Brand Directory (Creator)
if (p.a === 'a:brands_home') {
      try { await ctx.answerCallbackQuery(); } catch {}
  const page = Math.max(0, Number(p.p || 0));
  await safeEditOrReply(ctx, '⏳ Открываю каталог брендов…', { reply_markup: navKb('a:menu') });
  try {
    await withTimeout(renderBrandsDirectory(ctx, ctx.from.id, { page, edit: true, legacyUserId: u.id }), 12000, 'brands.home');
  } catch (e) {
    const cid = ctx.state?.cid || null;
    const label = (e && (e.label || e.stepId)) ? String(e.label || e.stepId) : String((e && e.message) ? e.message : 'unknown');
    try { console.warn('[brands_home] timeout/error', { cid, page, label, err: errInfo(e) }); } catch {}
    await safeEditOrReply(ctx, `⚠️ Каталог брендов отвечает слишком долго.

step: ${label}

cid: ${cid || '—'}`, { reply_markup: navKb(`a:brands_home|p:${page}`) });
  }
  return;
}


    if (p.a === 'a:brands_filters') {
      try { await ctx.answerCallbackQuery(); } catch {}
      await renderBrandDirFilters(ctx, ctx.from.id, { page: num(p.p || 0, 0), legacyUserId: u.id });
      return;
    }

    if (p.a === 'a:bd_fpick') {
      try { await ctx.answerCallbackQuery(); } catch {}
      await renderBrandDirFilterPick(ctx, ctx.from.id, {
        legacyUserId: u.id,
        key: String(p.k || ''),
        page: num(p.p || 0, 0),
      });
      return;
    }

    if (p.a === 'a:bd_fset') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const base = await getBrandDirFilter(ctx.from.id, u.id);
      const key = String(p.k || '');
      const val = String(p.v || 'all');
      const page = num(p.p || 0, 0);

      const next = { ...base };
      if (key === 'cat') next.category = val === 'all' ? null : val;
      if (key === 'type') next.offerType = val === 'all' ? null : val;
      if (key === 'comp') {
        const v = val === 'all' ? null : val;
        // Canonical is 'paid' for money in Brand Directory filters
        next.compensationType = v === 'rub' ? 'paid' : v;
      }
      if (key === 'bud') next.budgetBucket = val === 'all' ? null : val;

      await setBrandDirFilter(ctx.from.id, next, u.id);

      const stay = String(p.s || '') === '1';
      if (stay) {
        await renderBrandDirFilterPick(ctx, ctx.from.id, {
          legacyUserId: u.id,
          key,
          page,
        });
      } else {
        await renderBrandDirFilters(ctx, ctx.from.id, { page, legacyUserId: u.id });
      }
      return;
    }

    if (p.a === 'a:bd_mpick') {
      try { await ctx.answerCallbackQuery(); } catch {}
      await renderBrandDirMultiPick(ctx, ctx.from.id, {
        legacyUserId: u.id,
        key: String(p.k || ''),
        page: num(p.p || 0, 0),
      });
      return;
    }

    if (p.a === 'a:bd_mt') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const base = await getBrandDirFilter(ctx.from.id, u.id);
      const key = String(p.k || '');
      const tag = String(p.v || '');
      const page = num(p.p || 0, 0);

      if (key === 'goals' && BRAND_GOALS_KEYS.has(tag)) {
        const cur = Array.isArray(base.goalsTags) ? base.goalsTags : [];
        base.goalsTags = cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag];
      }
      if (key === 'req' && BRAND_REQ_KEYS.has(tag)) {
        const cur = Array.isArray(base.reqTags) ? base.reqTags : [];
        base.reqTags = cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag];
      }

      await setBrandDirFilter(ctx.from.id, base, u.id);
      await renderBrandDirMultiPick(ctx, ctx.from.id, { legacyUserId: u.id, key, page });
      return;
    }

    if (p.a === 'a:bd_mclear') {
      await ctx.answerCallbackQuery();
      const base = await getBrandDirFilter(ctx.from.id, u.id);
      const key = String(p.k || '');
      const page = num(p.p || 0, 0);

      if (key === 'goals') base.goalsTags = [];
      if (key === 'req') base.reqTags = [];

      await setBrandDirFilter(ctx.from.id, base, u.id);
      await renderBrandDirMultiPick(ctx, ctx.from.id, { legacyUserId: u.id, key, page });
      return;
    }

    if (p.a === 'a:bd_mdone') {
      try { await ctx.answerCallbackQuery(); } catch {}
      await renderBrandDirFilters(ctx, ctx.from.id, { page: num(p.p || 0, 0), legacyUserId: u.id });
      return;
    }

    if (p.a === 'a:bd_freset') {
      try { await ctx.answerCallbackQuery(); } catch {}
      await setBrandDirFilter(ctx.from.id, {
        category: null,
        offerType: null,
        compensationType: null,
        budgetBucket: null,
        goalsTags: [],
        reqTags: [],
      }, u.id);
      await renderBrandDirFilters(ctx, ctx.from.id, { page: num(p.p || 0, 0), legacyUserId: u.id });
      return;
    }

if (p.a === 'a:brand_dir_open') {
      try { await ctx.answerCallbackQuery(); } catch {}
  const brandUserId = Number(p.u || 0);
  const backPage = Math.max(0, Number(p.p || 0));
  await renderBrandDirectoryCard(ctx, ctx.from.id, { brandUserId, backPage, edit: true, legacyUserId: u.id });
  return;
}



    if (p.a === 'a:brand_apply') {
	      const brandUserId = Number(p.u || 0);
	      const backPage = Math.max(0, Number(p.p || 0));

	      // UX: users often type immediately after pressing "📝 Оставить заявку".
	      // If there is no draft yet, start input mode right away (short-lived expectText via renderBrandApply).
	      let hasDraft = false;
	      try {
	        const d = await getBrandApplyDraft(ctx.from.id, brandUserId);
	        hasDraft = !!(d && typeof d === 'object' && String(d.msg || '').trim());
	      } catch {}

	      try {
	        if (!hasDraft) {
	          await ctx.answerCallbackQuery({ text: '✍️ Напиши сообщение внизу и отправь одним сообщением. Потом покажу предпросмотр.' });
	        } else {
	          await ctx.answerCallbackQuery();
	        }
	      } catch {}

	      await renderBrandApply(ctx, u, brandUserId, backPage, { edit: true, startWrite: !hasDraft });
	      return;
    }

    if (p.a === 'a:brand_apply_write') {
      try { await ctx.answerCallbackQuery({ text: '✍️ Напиши сообщение внизу и отправь одним сообщением. Потом покажу предпросмотр.' }); } catch {}
      const brandUserId = Number(p.u || 0);
      const backPage = Math.max(0, Number(p.p || 0));
      await renderBrandApply(ctx, u, brandUserId, backPage, { edit: true, startWrite: true });
      return;
    }

    if (p.a === 'a:brand_apply_preview') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const brandUserId = Number(p.u || 0);
      const backPage = Math.max(0, Number(p.p || 0));
      await renderBrandApplyPreview(ctx, u, brandUserId, backPage, { edit: true });
      return;
    }

    if (p.a === 'a:brand_apply_clear') {
      try { await ctx.answerCallbackQuery({ text: '🗑 Черновик очищен.' }); } catch {}
      const brandUserId = Number(p.u || 0);
      const backPage = Math.max(0, Number(p.p || 0));
      await clearBrandApplyDraft(ctx.from.id, brandUserId);
      await renderBrandApply(ctx, u, brandUserId, backPage, { edit: true, startWrite: false });
      return;
    }

    if (p.a === 'a:brand_apply_send') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const brandUserId = Number(p.u || 0);
      const backPage = Math.max(0, Number(p.p || 0));
      try {
        await sendBrandApplyDraft(ctx, u, brandUserId, backPage, { edit: true });
      } catch (e) {
        try {
          console.warn('[brand_apply_send] unhandled', { cid: ctx.state?.cid || null, brandUserId, err: errInfo(e) });
        } catch {}
        const kb = new InlineKeyboard()
          .text('👀 Предпросмотр', `a:brand_apply_preview|u:${brandUserId}|p:${backPage}`)
          .row()
          .text('✍️ Изменить', `a:brand_apply_write|u:${brandUserId}|p:${backPage}`)
          .text('🗑 Сбросить', `a:brand_apply_clear|u:${brandUserId}|p:${backPage}`)
          .row()
          .text('⬅️ Назад', `a:brand_apply|u:${brandUserId}|p:${backPage}`)
          .text('📋 Меню', 'a:menu')
          .text('🏠 Home', 'a:home');
        await safeEditOrReply(ctx, '⚠️ Не удалось отправить заявку. Попробуй ещё раз.', { reply_markup: kb }, true);
      }
      return;
    }





    // MENU
        // BRAND MANAGER MODE (Brand Team)

    if (p.a === 'a:bm_home') {
      await ctx.answerCallbackQuery();

      // Enter manager cabinet (turn ON manager-mode + set Brand UI)
      await setBrandManagerMode(ctx.from.id, true);
      await setUiMode(ctx.from.id, UI_MODES.BRAND);

      const bm = await resolveBmBrandContext(ctx, u, { requirePickWhenMissingActive: true });

      if (bm.dbMissing) {
        const text = `⚠️ <b>Нужна миграция 026_brand_managers</b>

В Neon должна быть таблица <code>brand_managers</code>.`;
        await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: navKb('a:menu') });
        return;
      }

      if (bm.revoked) {
        await disableBrandManagerState(ctx.from.id);
        const text = `⛔ <b>Доступ менеджера отозван</b>

Если это ошибка — попроси владельца бренда добавить тебя в «👔 Менеджеры бренда».`;
        await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: navKb('a:menu') });
        return;
      }

      if (bm.enabled && bm.needsPick) {
        // Multiple brands and no active brand yet — go to picker
        await renderBmPickBrand(ctx, u, { ret: 'bx_inbox', wsId: 0, page: 0, edit: true });
        return;
      }

      // One brand (or already chosen) — go straight to Inbox
      await renderBxInbox(ctx, bm.brandUserId, 0, 0, { bm });
      return;
    }

    if (p.a === 'a:bm_help') {
      await ctx.answerCallbackQuery();
      const text = `🧑‍💼 <b>Brand Manager</b>

Это роль для команды бренда.

✅ Можно:
• 📩 Inbox (переписка по заявкам/сделкам)
• 🔎 Поиск креаторов (подбор)

⛔️ Нельзя:
• менять профиль бренда
• управлять оплатами / подпиской
• управлять командой бренда

Если у тебя несколько брендов — используй «🔁 Сменить бренд» в меню.`;

      await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: navKb('a:menu') });
      return;
    }

    if (p.a === 'a:bm_mode_set') {
      await ctx.answerCallbackQuery();
      const v = Number(p.v || 0);
      await setBrandManagerMode(ctx.from.id, v === 1);
      const ret = String(p.ret || 'menu');
      const flags = await getRoleFlags(u, ctx.from.id);
      if (ret === 'menu') {
        await renderMainMenu(ctx, flags, { edit: true, user: u });
      } else {
        await safeEditOrReply(ctx, 'Готово.', { parse_mode: 'HTML', reply_markup: navKb('a:menu') });
      }
      return;
    }

    if (p.a === 'a:bm_pick_brand') {
      await ctx.answerCallbackQuery();

      const ret = String(p.ret || 'menu');
      const wsId = Number(p.w || p.ws || 0);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);

      const r = normBxRet(p.r, wsId ? BX_HOME.BX_OPEN : h);

      await renderBmPickBrand(ctx, u, { ret, wsId, page, edit: true, h, r });
      return;
    }

    if (p.a === 'a:bm_set_brand') {
      await ctx.answerCallbackQuery();
      const brandUserId = Number(p.bu || 0);
      if (!brandUserId) return;

      const ret = String(p.ret || 'menu');
      const wsId = Number(p.w || p.ws || 0);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const r = normBxRet(p.r, wsId ? BX_HOME.BX_OPEN : h);

      // Validate that manager is still assigned to this brand
      let brands = [];
      try {
        brands = await db.listBrandsForManager(u.id);
      } catch (e) {
        if (isMissingRelationError(e, 'brand_managers')) {
          const text = `⚠️ <b>Нужна миграция 026_brand_managers</b>

В Neon должна быть таблица <code>brand_managers</code>.`;
          await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: navKb('a:menu') });
          return;
        }
        brands = [];
      }

      if (!brands.length) {
        await disableBrandManagerState(ctx.from.id);
        const text = `⛔ <b>Доступ менеджера отозван</b>

Попроси владельца бренда добавить тебя в «👔 Менеджеры бренда».`;
        await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: navKb('a:menu') });
        return;
      }

      const ok = brands.some((b) => Number(b.user_id) === brandUserId);
      if (!ok) {
        await ctx.answerCallbackQuery({ text: 'Нет доступа к этому бренду.' });
        await renderBmPickBrand(ctx, u, { ret, wsId, page, edit: true, h, r });
        return;
      }

      await setBrandManagerMode(ctx.from.id, true);
      await setUiMode(ctx.from.id, UI_MODES.BRAND);
      await setBmActiveBrand(ctx.from.id, brandUserId);

      // Route after pick
      if (ret === 'bx_inbox') {
        const bm = await resolveBmBrandContext(ctx, u);
        await renderBxInbox(ctx, brandUserId, wsId, page, { bm, h });
        return;
      }
      if (ret === 'bx_feed') {
        await renderBxFeed(ctx, brandUserId, wsId, page, { h });
        return;
      }
      if (ret === 'bx_filters') {
        await renderBxFilters(ctx, brandUserId, wsId, page, { h, r });
        return;
      }
      if (ret === 'bx_open') {
        await renderBxOpen(ctx, brandUserId, wsId);
        return;
      }
      if (ret === 'pm_home') {
        await renderProfileMatchingHome(ctx, brandUserId, wsId);
        return;
      }
      if (ret === 'brand_apps') {
        await renderBrandAppsList(ctx, u.id, brandUserId, 'new', 0);
        return;
      }
	      if (ret === 'brand_deals') {
	        await renderBrandDealsList(ctx, u.id, brandUserId, 'negotiation', 0);
	        return;
	      }

      const flags = await getRoleFlags(u, ctx.from.id);
      await renderMainMenu(ctx, flags, { edit: true, user: u });
      return;
    }

if (p.a === 'a:menu') {
      await ctx.answerCallbackQuery();
      const flags = await getRoleFlags(u, ctx.from.id);
      await renderRoleHub(ctx, u, flags);
      return;
    }



    // HOME HUB (Commit87)
    if (p.a === 'a:home') {
      await ctx.answerCallbackQuery();
      const flags2 = await getRoleFlags(u, ctx.from.id);
      await renderHomeHub(ctx, u, flags2, { edit: true });
      return;
    }

    if (p.a === 'a:home_hint_ack') {
      try { await ctx.answerCallbackQuery(); } catch {}
      try { await markHomeHubHintSeen(ctx.from.id); } catch {}
      const flags2 = await getRoleFlags(u, ctx.from.id);
      await renderHomeHub(ctx, u, flags2, { edit: true, noHint: true });
      return;
    }

    if (p.a === 'a:home_mode') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const m = String(p.m || '');

      // Determine whether user can manage any brands
      let managerBrands = [];
      try {
        managerBrands = await db.listBrandsForManager(u.id);
      } catch {}
      const canManager = Array.isArray(managerBrands) && managerBrands.length > 0;

      // Mode switch is a strong intent: keep the UI consistent
      // Curator overlay should not leak into Brand/Manager modes, and vice versa.
      if (m === 'creator') {
        await setUiMode(ctx.from.id, UI_MODES.CREATOR);
        await disableBrandManagerState(ctx.from.id);
        try { await setCuratorMode(ctx.from.id, false); } catch {}
        const flags2 = await getRoleFlags(u, ctx.from.id);
        await renderRoleHub(ctx, u, flags2);
        return;
      }

      if (m === 'brand') {
        await setUiMode(ctx.from.id, UI_MODES.BRAND);
        await disableBrandManagerState(ctx.from.id);
        try { await setCuratorMode(ctx.from.id, false); } catch {}
        const flags2 = await getRoleFlags(u, ctx.from.id);
        await renderRoleHub(ctx, u, flags2);
        return;
      }

      if (m === 'brand_manager') {
        if (!canManager) {
          await safeEditOrReply(ctx, '⛔ Тебя ещё не добавили в «Менеджеры бренда».', { reply_markup: navKb('a:home') });
          return;
        }
        await setUiMode(ctx.from.id, UI_MODES.BRAND);
        await setBrandManagerMode(ctx.from.id, true);
        try { await setCuratorMode(ctx.from.id, false); } catch {}
        // If there is exactly one brand, set it as active to reduce clicks
        try {
          const active = await getBmActiveBrand(ctx.from.id);
          if (!active && managerBrands.length === 1) {
            await setBmActiveBrand(ctx.from.id, Number(managerBrands[0].brand_user_id || managerBrands[0].brandUserId || 0));
          }
        } catch {}
        const flags2 = await getRoleFlags(u, ctx.from.id);
        await renderRoleHub(ctx, u, flags2);
        return;
      }

      if (m === 'curator') {
        const flags2 = await getRoleFlags(u, ctx.from.id);
        if (!flags2.isCurator) {
          await safeEditOrReply(ctx, '⛔ Доступ к «Кураторы блогера» не найден.', { reply_markup: navKb('a:home') });
          return;
        }
        // Curator is a creator-side overlay: persist it explicitly
        await setUiMode(ctx.from.id, UI_MODES.CREATOR);
        await disableBrandManagerState(ctx.from.id);
        try { await setCuratorMode(ctx.from.id, true); } catch {}
        await renderRoleHub(ctx, u, flags2);
        return;
      }

      // Unknown mode — just refresh the hub
      const flags2 = await getRoleFlags(u, ctx.from.id);
      await renderHomeHub(ctx, u, flags2, { edit: true });
      return;
    }

    if (p.a === 'a:main_menu') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const flags = await getRoleFlags(u, ctx.from.id);
      await renderRoleHub(ctx, u, flags);
      return;
    }

    // Toggle Curator UI mode (stored in Redis).
    if (p.a === 'a:cur_mode_set') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const enabled = String(p.v || '0') === '1';
      await setCuratorMode(ctx.from.id, enabled);

      // Curator mode is a creator-side overlay. When enabling it, force creator UI and disable brand-manager state to avoid mixed menus.
      if (enabled) {
        try { await setUiMode(ctx.from.id, UI_MODES.CREATOR); } catch {}
        try { await disableBrandManagerState(ctx.from.id); } catch {}
      }

      const ret = String(p.ret || 'menu');
      const flags = await getRoleFlags(u, ctx.from.id);

      // When turning Curator Mode OFF from curator UI — go to Creator main menu (не в старый ws-hub).
      if (!enabled && ret === 'menu') {
        await renderMainMenu(ctx, flags, { edit: true, user: u });
        return;
      }

      // If user wants to stay in curator cabinet — render it. Otherwise go to role hub.
      if (ret === 'cur') {
        if (!flags.isCurator && !flags.isAdmin) {
          await renderRoleHub(ctx, u, flags);
          return;
        }
        await renderCuratorHome(ctx, u.id);
        return;
      }

      await renderRoleHub(ctx, u, flags);
      return;
    }


    // CURATOR (safe cabinet)
    if (p.a === 'a:cur_home') {
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      const flags = await getRoleFlags(u, ctx.from.id);
      if (!flags.isCurator && !flags.isAdmin) {
        await ctx.answerCallbackQuery({ text: 'Нет доступа.' });
        return;
      }
      await renderCuratorHome(ctx, u.id);
      return;
    }

    if (p.a === 'a:cur_ws_off') {
      // Backward-compat: old buttons for disabled workspaces
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      if (!wsId) return;
      await renderCuratorWorkspace(ctx, u.id, wsId);
      return;
    }


    if (p.a === 'a:cur_ws') {
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      const flags = await getRoleFlags(u, ctx.from.id);
      if (!flags.isCurator && !flags.isAdmin) {
        await ctx.answerCallbackQuery({ text: 'Нет доступа.' });
        return;
      }
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      if (!wsId) return;
      await renderCuratorWorkspace(ctx, u.id, wsId);
      return;
    }

    if (p.a === 'a:cur_leave_q') {
      await ctx.answerCallbackQuery();
      const flags = await getRoleFlags(u, ctx.from.id);
      if (!flags.isCurator && !flags.isAdmin) {
        await ctx.answerCallbackQuery({ text: 'Нет доступа.' });
        return;
      }
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      if (!wsId) return;

      // ensure user is actually curator for this workspace
      const items = await db.listCuratorWorkspaces(u.id);
      const ok = items.some(w => Number(w.id) === wsId);
      if (!ok && !flags.isAdmin) {
        await ctx.answerCallbackQuery({ text: 'Нет доступа.' });
        return;
      }

      const ws = await db.getWorkspaceAny(wsId);
      const wsTitle = ws ? wsLabelNice(ws) : `Канал #${wsId}`;
      const kb = new InlineKeyboard()
        .text('✅ Выйти', `a:cur_leave_do|ws:${wsId}`)
        .text('❌ Отмена', `a:cur_ws|ws:${wsId}`);
      await safeEditOrReply(ctx, `❌ <b>Выйти из канала</b>

Ты больше не будешь куратором: <b>${escapeHtml(wsTitle)}</b>

Продолжить?`, {
        parse_mode: 'HTML',
        reply_markup: kb
      });
      return;
    }

    if (p.a === 'a:cur_leave_do') {
      await ctx.answerCallbackQuery();
      const flags = await getRoleFlags(u, ctx.from.id);
      if (!flags.isCurator && !flags.isAdmin) {
        await ctx.answerCallbackQuery({ text: 'Нет доступа.' });
        return;
      }
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      if (!wsId) return;

      const items = await db.listCuratorWorkspaces(u.id);
      const ok = items.some(w => Number(w.id) === wsId);
      if (!ok && !flags.isAdmin) {
        await ctx.answerCallbackQuery({ text: 'Нет доступа.' });
        return;
      }

      await db.removeCurator(wsId, u.id);
      await db.auditWorkspace(wsId, u.id, 'ws.curator_left', { curatorUserId: u.id });
      await ctx.answerCallbackQuery({ text: 'Готово' });

      await renderCuratorHome(ctx, u.id);
      return;
    }

    if (p.a === 'a:cur_gw_open') {
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      const flags = await getRoleFlags(u, ctx.from.id);
      if (!flags.isCurator && !flags.isAdmin) {
        await ctx.answerCallbackQuery({ text: 'Нет доступа.' });
        return;
      }
      await renderCuratorGiveawayOpen(ctx, u.id, Number(p.ws || 0), Number(p.i || 0));
      return;
    }

    if (p.a === 'a:cur_gw_stats') {
      await ctx.answerCallbackQuery();
      const flags = await getRoleFlags(u, ctx.from.id);
      if (!flags.isCurator && !flags.isAdmin) {
        await ctx.answerCallbackQuery({ text: 'Нет доступа.' });
        return;
      }
      await renderCuratorGiveawayStats(ctx, u.id, Number(p.ws || 0), Number(p.i || 0));
      return;
    }

    if (p.a === 'a:cur_gw_log') {
      await ctx.answerCallbackQuery();
      const flags = await getRoleFlags(u, ctx.from.id);
      if (!flags.isCurator && !flags.isAdmin) {
        await ctx.answerCallbackQuery({ text: 'Нет доступа.' });
        return;
      }
      await renderCuratorGiveawayLog(ctx, u.id, Number(p.ws || 0), Number(p.i || 0));
      return;
    }

    if (p.a === 'a:cur_gw_remind_q') {
      await ctx.answerCallbackQuery();
      const flags = await getRoleFlags(u, ctx.from.id);
      if (!flags.isCurator && !flags.isAdmin) {
        await ctx.answerCallbackQuery({ text: 'Нет доступа.' });
        return;
      }
      await renderCuratorGiveawayRemindQ(ctx, u.id, Number(p.ws || 0), Number(p.i || 0));
      return;
    }

    if (p.a === 'a:cur_gw_remind_send') {
      await ctx.answerCallbackQuery();
      const flags = await getRoleFlags(u, ctx.from.id);
      if (!flags.isCurator && !flags.isAdmin) {
        await ctx.answerCallbackQuery({ text: 'Нет доступа.' });
        return;
      }
      await renderCuratorGiveawayRemindSend(ctx, u.id, Number(p.ws || 0), Number(p.i || 0));
      return;
    }

    if (p.a === 'a:cur_gw_owner_q') {
      await ctx.answerCallbackQuery();
      const flags = await getRoleFlags(u, ctx.from.id);
      if (!flags.isCurator && !flags.isAdmin) {
        await ctx.answerCallbackQuery({ text: 'Нет доступа.' });
        return;
      }
      await renderCuratorGiveawayOwnerNotifyQ(ctx, u.id, Number(p.ws || 0), Number(p.i || 0));
      return;
    }

    if (p.a === 'a:cur_gw_owner_send') {
      await ctx.answerCallbackQuery();
      const flags = await getRoleFlags(u, ctx.from.id);
      if (!flags.isCurator && !flags.isAdmin) {
        await ctx.answerCallbackQuery({ text: 'Нет доступа.' });
        return;
      }
      await renderCuratorGiveawayOwnerNotifySend(ctx, u.id, Number(p.ws || 0), Number(p.i || 0));
      return;
    }


    // CURATOR: safe "checked" mark + note (teamwork helpers)
    if (p.a === 'a:cur_gw_check_q') {
      await ctx.answerCallbackQuery();
      const flags = await getRoleFlags(u, ctx.from.id);
      if (!flags.isCurator && !flags.isAdmin) {
        await ctx.answerCallbackQuery({ text: 'Нет доступа.' });
        return;
      }
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const gwId = Number(p.i || 0);
      if (!wsId || !gwId) return;

      const kb = new InlineKeyboard()
        .text('✅ Подтвердить', `a:cur_gw_check_do|ws:${wsId}|i:${gwId}`)
        .text('❌ Отмена', `a:cur_gw_open|ws:${wsId}|i:${gwId}`);

      await safeEditOrReply(ctx, `✅ <b>Отметить как проверено?</b>

Это внутренняя отметка для владельца и других кураторов.
Ничего не меняет в конкурсе — только фиксирует “я проверил”.

Продолжить?`, { parse_mode: 'HTML', reply_markup: kb });
      return;
    }

    if (p.a === 'a:cur_gw_check_do') {
      await ctx.answerCallbackQuery();
      const flags = await getRoleFlags(u, ctx.from.id);
      if (!flags.isCurator && !flags.isAdmin) {
        await ctx.answerCallbackQuery({ text: 'Нет доступа.' });
        return;
      }
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const gwId = Number(p.i || 0);
      if (!wsId || !gwId) return;

      const g = await db.getGiveawayForCurator(gwId, u.id);
      if (!g || Number(g.workspace_id) !== wsId) {
        await ctx.answerCallbackQuery({ text: 'Нет доступа.' });
        return;
      }

      const meta = {
        by_tg_id: Number(ctx.from.id),
        by_username: ctx.from.username ?? null,
        by_name: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ').trim(),
        at: Date.now()
      };
      await setCurGwChecked(gwId, meta);
      try { await db.auditGiveaway(gwId, Number(g.workspace_id), u.id, 'curator.checked', { by_tg_id: meta.by_tg_id, by_username: meta.by_username }); } catch {}
      await ctx.answerCallbackQuery({ text: '✅ Отмечено' });

      await renderCuratorGiveawayOpen(ctx, u.id, wsId, gwId);
      return;
    }

    if (p.a === 'a:cur_gw_note_q') {
      await ctx.answerCallbackQuery();
      const flags = await getRoleFlags(u, ctx.from.id);
      if (!flags.isCurator && !flags.isAdmin) {
        await ctx.answerCallbackQuery({ text: 'Нет доступа.' });
        return;
      }
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const gwId = Number(p.i || 0);
      if (!wsId || !gwId) return;

      const g = await db.getGiveawayForCurator(gwId, u.id);
      if (!g || Number(g.workspace_id) !== wsId) {
        await ctx.answerCallbackQuery({ text: 'Нет доступа.' });
        return;
      }

      await setExpectText(ctx.from.id, { type: 'curator_note', wsId, gwId });

      const kb = new InlineKeyboard()
        .text('❌ Отмена', `a:cur_note_cancel|ws:${wsId}|i:${gwId}`)
        .row()
        .text('⬅️ Назад', `a:cur_gw_open|ws:${wsId}|i:${gwId}`);

      await safeEditOrReply(ctx, `📝 <b>Заметки к конкурсу #${gwId}</b>

Это внутренние пометки для владельца и кураторов — участникам не показывается.
Примеры: «согласовали приз», «ждём фото», «уточнить условия», «риск/сомнительно».

Пришли заметку одним сообщением (до 400 символов).
Она будет видна владельцу и другим кураторам.

Чтобы отменить — нажми “❌ Отмена”.`, { parse_mode: 'HTML', reply_markup: kb });
      return;
    }

    if (p.a === 'a:cur_note_cancel') {
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const gwId = Number(p.i || 0);
      if (!wsId || !gwId) return;
      await renderCuratorGiveawayOpen(ctx, u.id, wsId, gwId);
      return;
    }

if (p.a === 'a:wsp_preview') {
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      if (!wsId) return ctx.answerCallbackQuery({ text: 'Workspace не найден.' });

      try { await ctx.answerCallbackQuery({ text: 'Открываю витрину…' }); } catch {}

      await renderWsPublicProfile(ctx, wsId, { backCb: `a:ws_profile|ws:${wsId}` });
      return;
    }

    // Public profile (vitrina)
    if (p.a === 'a:wsp_open') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      if (!wsId) return;

      await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);

      const mode = String(p.m || '').trim().toLowerCase();
      const ro = mode === 'ro' || String(p.ro || '').trim() === '1';

      const leadId = Number(p.l || 0);
      const ret = String(p.r || '').trim().toLowerCase();
      const fromLead = ret === 'bl' && !!leadId;

      const opts = {};
      if (ro || fromLead) opts.hideApply = true;
      if (fromLead) {
        opts.backCb = `a:blead_view|id:${leadId}|w:${wsId}`;
        opts.contactCbExtra = `|r:bl|l:${leadId}`;
        opts.dialogCb = `a:blead_view|id:${leadId}|w:${wsId}`;
      }

      await renderWsPublicProfile(ctx, wsId, opts);
      return;
    }

    // Public vitrina: contact unlock (Brand Pass credits) to prevent bypassing the bot.
    if (p.a === 'a:wsp_contact_req') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      if (!wsId) return;

      const ret = String(p.r || '').trim().toLowerCase();
      const leadId = Number(p.l || 0);
      const fromLead = ret === 'bl' && !!leadId;
      const ctxExtra = fromLead ? `|r:bl|l:${leadId}` : '';
      const backCb = fromLead ? `a:blead_view|id:${leadId}|w:${wsId}` : `a:wsp_open|ws:${wsId}`;

      // already unlocked?
      try {
        const key = k(['wsp_contact', wsId, u.id]);
        if (await redis.get(key)) {
          try { await ctx.answerCallbackQuery({ text: 'Уже открыто ✅' }); } catch {}
          await renderWsPublicProfile(ctx, wsId, { revealContacts: true, hideApply: fromLead, backCb: backCb, contactCbExtra: ctxExtra, dialogCb: fromLead ? `a:blead_view|id:${leadId}|w:${wsId}` : '' });
          return;
        }
      } catch {}

      const bal = await db.getBrandCredits(u.id);
      const kb = new InlineKeyboard();
      const balNum = Number(bal || 0);
      if (CONTACT_UNLOCK_COST <= 0 || balNum >= CONTACT_UNLOCK_COST) {
        kb.text(contactUnlockActionLabel(), `a:wsp_contact_unlock|ws:${wsId}${ctxExtra}`).row();
      }
      kb
        .text('🎫 Купить Brand Pass', 'a:brand_pass|ws:0')
        .row()
        .text(fromLead ? '💬 Диалог' : '⬅️ Назад', backCb);

      const canUnlock = (CONTACT_UNLOCK_COST <= 0) || (balNum >= CONTACT_UNLOCK_COST);
      const introCost = Math.max(1, Number(CFG.INTRO_COST_PER_INTRO || 1));

      const tail = canUnlock
        ? `Нажми «${contactUnlockActionLabel()}» или купи Brand Pass.`
        : `Недостаточно кредитов для ${contactUnlockBtnLabel()}: нужно <b>${CONTACT_UNLOCK_COST}</b>, у тебя <b>${balNum}</b>. Купи Brand Pass и повтори.`;

      const text =
        `🔒 <b>Контакты скрыты</b>

<b>Brand Pass</b> = кредиты (Stars).

Кредиты тратятся на:
• 💬 Интро = новый диалог: <b>${introCost}</b> ${ruPlural(introCost, 'кредит', 'кредита', 'кредитов')}
• ${CONTACT_UNLOCK_COST <= 0 ? '🔓 Контакты на витрине: <b>бесплатно</b>' : `🔓 Контакты на витрине: <b>${CONTACT_UNLOCK_COST}</b> ${ruPlural(CONTACT_UNLOCK_COST, 'кредит', 'кредита', 'кредитов')}`} → доступ на <b>${CONTACT_UNLOCK_TTL_DAYS}</b> ${ruPlural(CONTACT_UNLOCK_TTL_DAYS, 'день', 'дня', 'дней')}

Переписка внутри открытого диалога — бесплатна.

${brandPassBalanceLineHtml(balNum)}

${tail}`;

      await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
      return;
    }

    if (p.a === 'a:wsp_contact_unlock') {
      const wsId = Number(p.w || p.ws || 0);
      if (!wsId) {
        try { await ctx.answerCallbackQuery({ text: 'Workspace не найден.', show_alert: true }); } catch {}
        return;
      }

      const ret = String(p.r || '').trim().toLowerCase();
      const leadId = Number(p.l || 0);
      const fromLead = ret === 'bl' && !!leadId;
      const ctxExtra = fromLead ? `|r:bl|l:${leadId}` : '';
      const backCb = fromLead ? `a:blead_view|id:${leadId}|w:${wsId}` : `a:wsp_open|ws:${wsId}`;
      const roOpts = fromLead ? { hideApply: true, backCb, contactCbExtra: ctxExtra, dialogCb: backCb } : {};

      // owner/curator should never pay
      try {
        const ws = await db.getWorkspaceAny(wsId);
        if (ws && Number(ws.owner_user_id) === Number(u.id)) {
          try { await ctx.answerCallbackQuery({ text: 'Это твоя витрина ✅' }); } catch {}
          await renderWsPublicProfile(ctx, wsId, { revealContacts: true, ...roOpts });
          return;
        }
      } catch {}

      // idempotency (cached in Redis)
      try {
        const key = k(['wsp_contact', wsId, u.id]);
        if (await redis.get(key)) {
          try { await ctx.answerCallbackQuery({ text: 'Уже открыто ✅' }); } catch {}
          await renderWsPublicProfile(ctx, wsId, { revealContacts: true, ...roOpts });
          return;
        }
      } catch {}

      const left = await db.spendBrandCredits(u.id, CONTACT_UNLOCK_COST);
      if (left === null) {
        try { await ctx.answerCallbackQuery({ text: 'Нужен Brand Pass (кредиты Stars).', show_alert: true }); } catch {}
        await renderBrandPass(ctx, u.id, 0);
        return;
      }

      try {
        const key = k(['wsp_contact', wsId, u.id]);
        await redis.set(key, 1, { ex: CONTACT_UNLOCK_TTL_SEC });
      } catch {}

      try { await ctx.answerCallbackQuery({ text: `✅ Контакты открыты на ${CONTACT_UNLOCK_TTL_DAYS} ${ruPlural(CONTACT_UNLOCK_TTL_DAYS,'день','дня','дней')}. Баланс: ${left}`, show_alert: true }); } catch {}
      await renderWsPublicProfile(ctx, wsId, { revealContacts: true, ...roOpts });
      return;
    }

    
// Alias for legacy payloads: "send request to creator" from old vitrina buttons
if (p.a === 'a:send_request_to_creator') {
  const wsId = Number(p.ws || p.w || p.wsId || 0);
  if (!wsId) {
    try { await ctx.answerCallbackQuery({ text: 'Кнопка устарела. Открой витрину заново.', show_alert: true }); } catch {}
    return;
  }
  // fall-through: reuse a:wsp_lead_new logic
  try { p.a = 'a:wsp_lead_new'; p.ws = wsId; } catch {}
}

if (p.a === 'a:wsp_lead_new') {
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      if (!wsId) return;

      // Prevent self-apply and curator-mode confusion (old buttons may still exist)
      const ws = await db.getWorkspaceAny(wsId);
      if (!ws) {
        await ctx.answerCallbackQuery({ text: 'Профиль не найден.', show_alert: true });
        return;
      }

      const isOwner = Number(u.id) === Number(ws.owner_user_id);

      let curMode = false;
      try {
        const flags = await getRoleFlags(u, ctx.from.id);
        curMode = !!(flags?.isCurator || flags?.isAdmin) && (await getCuratorMode(ctx.from.id));
      } catch {
        curMode = false;
      }

      if (isOwner) {
        await ctx.answerCallbackQuery({
          text: 'Это твоя витрина. Заявку оставляют бренды — поделись ссылкой.',
          show_alert: true
        });
        await renderWsPublicProfile(ctx, wsId, { backCb: `a:ws_profile|ws:${wsId}` });
        return;
      }

      if (curMode) {
        await ctx.answerCallbackQuery({
          text: 'Ты в режиме куратора. Чтобы оставить заявку как бренд — выйди в обычный режим и переключись в Brand.',
          show_alert: true
        });
        await renderWsPublicProfile(ctx, wsId);
        return;
      }

      // Gate by Brand Profile (basic 3 fields) and skip Step 1 when complete
      if (CFG.BRAND_PROFILE_REQUIRED) {
        const prof = await safeBrandProfiles(() => db.getBrandProfile(u.id), async () => null);
        if (!isBrandBasicComplete(prof)) {
          await ctx.answerCallbackQuery({ text: 'Заполни профиль бренда (4 поля: Название, Ниша, Контакт, Ссылка), чтобы оставить заявку.', show_alert: true });
          await renderBrandProfileHome(ctx, u.id, { wsId, ret: 'lead', edit: true });
          return;
        }

        const contact = String(prof.contact || '').trim().slice(0, 200);
        await ctx.answerCallbackQuery();
        await setExpectText(ctx.from.id, {
          type: 'wsp_lead_step2',
          wsId,
          contact,
          brandName: String(prof.brand_name || '').trim() || null,
          brandLink: String(prof.brand_link || '').trim() || null,
        });
        await renderWsLeadCompose(ctx, wsId, 2, { contact });
        return;
      }

      await ctx.answerCallbackQuery();
      await setExpectText(ctx.from.id, { type: 'wsp_lead_step1', wsId });
      await renderWsLeadCompose(ctx, wsId, 1);
      return;
    }


    // Brand lead dialog (for brands replying back to a creator lead)
    if (p.a === 'a:blead_view') {
      await ctx.answerCallbackQuery();
      const leadId = Number(p.id || 0);
      const wsId = Number(p.w || p.ws || 0);
      try {
        const exp = await getExpectText(ctx.from.id);
        if (exp && exp.type === 'blead_reply') await clearExpectText(ctx.from.id);
      } catch {}
      await renderBrandLeadDialog(ctx, u.id, leadId, wsId);
      return;
    }

    if (p.a === 'a:blead_reply') {
      await ctx.answerCallbackQuery();
      const leadId = Number(p.id || 0);
      const wsId = Number(p.w || p.ws || 0);
      if (!leadId) return;

      await setExpectText(ctx.from.id, { type: 'blead_reply', leadId, wsId });

      const kb = new InlineKeyboard()
        .text('❌ Отмена', `a:blead_cancel|id:${leadId}|w:${wsId || 0}`)
        .row()
        .text('📋 Меню', 'a:menu')
        .text('🏠 Home', 'a:home');

      await safeEditOrReply(
        ctx,
        '✍️ Напиши сообщение креатору. Оно уйдёт в диалог по этой заявке.',
        { parse_mode: 'HTML', reply_markup: kb },
      );
      return;
    }

    if (p.a === 'a:blead_cancel') {
      await ctx.answerCallbackQuery();
      const leadId = Number(p.id || 0);
      const wsId = Number(p.w || p.ws || 0);
      try { await clearExpectText(ctx.from.id); } catch {}
      await renderBrandLeadDialog(ctx, u.id, leadId, wsId);
      return;
    }
    // Leads inbox (owner + SUPER_ADMIN)
    
	if (p.a === 'a:brand_apps') {
	  await ctx.answerCallbackQuery();
	  const status = String(p.s || 'new');
	  const page = Math.max(0, Number(p.p || 0));

	  const bmRes = await bmResolveAssert(ctx, u, 0, 'brand_apps', page);
	  if (!bmRes) return;

	  await renderBrandAppsList(ctx, u.id, bmRes.userId, status, page);
	  return;
	}

	if (p.a === 'a:brand_deals') {
	  await ctx.answerCallbackQuery();
	  const stage = String(p.st || 'negotiation');
	  const page = Math.max(0, Number(p.p || 0));

	  const bmRes = await bmResolveAssert(ctx, u, 0, 'brand_deals', page);
	  if (!bmRes) return;

	  await renderBrandDealsList(ctx, u.id, bmRes.userId, stage, page);
	  return;
	}

	if (p.a === 'a:brand_deals_search') {
  await ctx.answerCallbackQuery();
  const stage = String(p.st || 'negotiation');
  const page = Math.max(0, Number(p.p || 0));
  const bmRes = await bmResolveAssert(ctx, u, 0, 'brand_deals', page);
  if (!bmRes) return;
  const backCb = `a:brand_deals|ws:0|st:${stage}|p:${page}`;
  await setExpectText(ctx.from.id, { type: 'brand_deals_search', brandUserId: bmRes.userId, stage, page, backCb });
  const kb = navKb(backCb);
  const t = '🔎 <b>Поиск по сделкам</b>\n\nВарианты:\n• <code>@username</code> — пример: <code>@zarinka</code>\n• <code>TG id</code> (цифры) — пример: <code>123456789</code>\n\nПодсказки:\n• если начинаешь с <code>@</code>, добавь минимум 2 символа после @\n• если вводишь цифры — обычно 6–12 цифр\n\nЧтобы сбросить: <code>сброс</code>';
  try { await safeEditOrReply(ctx, t, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true }); }
  catch { await ctx.reply(t, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true }); }
  return;
}

if (p.a === 'a:brand_deals_search_clear') {
  await ctx.answerCallbackQuery();
  const stage = String(p.st || 'negotiation');
  const page = Math.max(0, Number(p.p || 0));
  const bmRes = await bmResolveAssert(ctx, u, 0, 'brand_deals', page);
  if (!bmRes) return;
  await clearBrandDealsSearch(ctx.from.id, bmRes.userId);
  await renderBrandDealsList(ctx, u.id, bmRes.userId, stage, page);
  return;
}

if (p.a === 'a:brand_deals_filters_clear') {
  await ctx.answerCallbackQuery();
  const stage = String(p.st || 'negotiation');
  const bmRes = await bmResolveAssert(ctx, u, 0, 'brand_deals', 0);
  if (!bmRes) return;

  // Clear both filters (search + mineOnly)
  await clearBrandDealsSearch(ctx.from.id, bmRes.userId);
  await clearBrandDealsMineOnly(ctx.from.id, bmRes.userId);

  await renderBrandDealsList(ctx, u.id, bmRes.userId, stage, 0);
  return;
}



if (p.a === 'a:brand_deals_mine_toggle') {
  await ctx.answerCallbackQuery();
  const stage = String(p.st || 'negotiation');
  const page = Math.max(0, Number(p.p || 0));

  const bmRes = await bmResolveAssert(ctx, u, 0, 'brand_deals', page);
  if (!bmRes) return;

  const access = await assertBrandAppsAccess(ctx, u.id, bmRes.userId);
  if (!access.ok) return;

  if (!access.isManager) {
    try { await ctx.answerCallbackQuery({ text: 'Доступно только менеджеру.' }); } catch {}
    return;
  }

  const cur = await getBrandDealsMineOnly(ctx.from.id, bmRes.userId);
  if (cur) await clearBrandDealsMineOnly(ctx.from.id, bmRes.userId);
  else await setBrandDealsMineOnly(ctx.from.id, bmRes.userId, true);

  await renderBrandDealsList(ctx, u.id, bmRes.userId, stage, page);
  return;
}

if (p.a === 'a:brand_deal_view') {
	  await ctx.answerCallbackQuery();
	  const appId = Number(p.id || 0);
	  const back = { stage: String(p.st || 'negotiation'), page: Math.max(0, Number(p.p || 0)) };
	  await renderBrandDealView(ctx, u.id, appId, back);
	  return;
	}

	if (p.a === 'a:brand_deal_set') {
	  await ctx.answerCallbackQuery();
	  const appId = Number(p.id || 0);
	  const stage = normDealStage(String(p.st || 'negotiation'));
	  const back = { stage: String(p.b || 'negotiation'), page: Math.max(0, Number(p.p || 0)) };
	  if (!appId) return;

	  await safeBrandApplications(() => db.setBrandApplicationDealStage(appId, stage, u.id), async () => null);
	  await renderBrandDealView(ctx, u.id, appId, back);
	  return;
	}
if (p.a === 'a:brand_deal_reply') {
  await ctx.answerCallbackQuery();
  const appId = Number(p.id || 0);
  const back = { stage: String(p.b || p.st || 'negotiation'), page: Math.max(0, Number(p.p || 0)) };
  if (!appId) return;
  await startBrandDealReply(ctx, u.id, appId, back);
  return;
}

if (p.a === 'a:brand_deal_tpls') {
  try { await ctx.answerCallbackQuery(); } catch {}
  const appId = Number(p.id || 0);
  const back = { stage: String(p.b || p.st || 'negotiation'), page: Math.max(0, Number(p.p || 0)) };
  if (!appId) return;
  await renderBrandDealTemplates(ctx, u.id, appId, back);
  return;
}

if (p.a === 'a:brand_deal_tpl') {
  try { await ctx.answerCallbackQuery(); } catch {}
  const appId = Number(p.id || 0);
  const key = String(p.k || 'discuss');
  const back = { stage: String(p.b || 'negotiation'), page: Math.max(0, Number(p.p || 0)) };
  if (!appId) return;
  await sendBrandDealTemplateReply(ctx, u.id, appId, key, back);
  return;
}


if (p.a === 'a:brand_app_view') {
  try { await ctx.answerCallbackQuery(); } catch {}
  const appId = Number(p.id || 0);
  const back = { status: String(p.s || 'new'), page: Math.max(0, Number(p.p || 0)) };
  await renderBrandAppView(ctx, u.id, appId, back);
  return;
}

if (p.a === 'a:brand_app_set') {
  try { await ctx.answerCallbackQuery(); } catch {}
  const appId = Number(p.id || 0);
  if (!appId) return;
  const st = normLeadStatus(String(p.st || 'new'));
  const back = { status: String(p.s || 'new'), page: Math.max(0, Number(p.p || 0)) };

  // Update in DB if available
  const updated = await safeBrandAppsWrite(() => db.updateBrandApplicationStatus(appId, st), { op: 'brand_app_status', appId, st });
  if (!updated) {
    const text = '⚠️ Не удалось обновить статус заявки. Попробуй ещё раз.';
    const kb = new InlineKeyboard()
      .text('⬅️ Назад', 'a:brand_app_view|id:' + appId + '|s:' + back.status + '|p:' + back.page)
      .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');
    try { await safeEditOrReply(ctx, text, { reply_markup: kb }); } catch { await ctx.reply(text, { reply_markup: kb }); }
    return;
  }

  // Toast with meaning (anti-confusion)
  try {
    const t = (LEAD_STATUSES[st]?.title || LEAD_STATUSES[st]?.label || st);
    await ctx.answerCallbackQuery({ text: `✅ Перемещено: ${t}` });
  } catch {}

  try {
    await renderBrandAppView(ctx, u.id, appId, back);
  } catch (e) {
    try { console.warn('[brand_app_set] unhandled', { appId, st, back, cid: ctx.state?.cid || null, err: errInfo(e) }); } catch {}
    const text = '✅ Статус обновлён. (Экран не удалось перерисовать — попробуй открыть заявку заново.)';
    const kb = new InlineKeyboard()
      .text('⬅️ Назад', 'a:brand_apps|ws:0|s:' + back.status + '|p:' + back.page)
      .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');
    try { await safeEditOrReply(ctx, text, { reply_markup: kb }); } catch { await ctx.reply(text, { reply_markup: kb }); }
  }
  return;
}

if (p.a === 'a:brand_app_reply') {
  try { await ctx.answerCallbackQuery(); } catch {}
  const appId = Number(p.id || 0);
  const back = { status: String(p.s || 'new'), page: Math.max(0, Number(p.p || 0)) };
  await startBrandAppReply(ctx, u.id, appId, back);
  return;
}

if (p.a === 'a:brand_app_tpls') {
  // Never fail the whole callback due to Telegram callback ack issues
  // (query too old / already answered / etc.).
  try { await ctx.answerCallbackQuery(); } catch {}
  const appId = Number(p.id || 0);
  if (!appId) return;
  const back = { status: String(p.s || 'new'), page: Math.max(0, Number(p.p || 0)) };
  try {
    await renderBrandAppTemplates(ctx, u.id, appId, back);
  } catch (e) {
    try { console.warn('[brand_app_tpls] unhandled', { appId, back, cid: ctx.state?.cid || null, err: errInfo(e) }); } catch {}
    const text = '⚠️ Не удалось открыть шаблоны. Попробуй ещё раз или открой заявку заново.';
    const kb = new InlineKeyboard()
      .text('⬅️ Назад', 'a:brand_app_view|id:' + appId + '|s:' + back.status + '|p:' + back.page)
      .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');
    try { await safeEditOrReply(ctx, text, { reply_markup: kb }); } catch { await ctx.reply(text, { reply_markup: kb }); }
  }
  return;
}

if (p.a === 'a:brand_app_tpl') {
  // Never fail the whole callback due to Telegram callback ack issues
  try { await ctx.answerCallbackQuery(); } catch {}
  const appId = Number(p.id || 0);
  if (!appId) return;
  const key = String(p.k || 'discuss');
  const back = { status: String(p.s || 'new'), page: Math.max(0, Number(p.p || 0)) };
  try {
    await renderBrandAppTemplatePreview(ctx, u.id, appId, key, back);
  } catch (e) {
    try { console.warn('[brand_app_tpl_preview] unhandled', { appId, key, back, cid: ctx.state?.cid || null, err: errInfo(e) }); } catch {}
    const text = '⚠️ Не удалось открыть предпросмотр. Попробуй ещё раз или нажми «✍️ Ответить».';
    const kb = new InlineKeyboard()
      .text('✍️ Ответить', 'a:brand_app_reply|id:' + appId + '|s:' + back.status + '|p:' + back.page)
      .row()
      .text('⬅️ Назад', 'a:brand_app_view|id:' + appId + '|s:' + back.status + '|p:' + back.page)
      .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');
    try { await safeEditOrReply(ctx, text, { reply_markup: kb }); } catch { await ctx.reply(text, { reply_markup: kb }); }
  }
  return;
}

if (p.a === 'a:brand_app_tpl_send') {
  try { await ctx.answerCallbackQuery(); } catch {}
  const appId = Number(p.id || 0);
  if (!appId) return;
  const key = String(p.k || 'discuss');
  const back = { status: String(p.s || 'new'), page: Math.max(0, Number(p.p || 0)) };
  try {
    await sendBrandAppTemplateReply(ctx, u.id, appId, key, back);
  } catch (e) {
    try { console.warn('[brand_app_tpl_send] unhandled', { appId, key, back, cid: ctx.state?.cid || null, err: errInfo(e) }); } catch {}
    const text = '⚠️ Не удалось отправить шаблон. Попробуй ещё раз или нажми «✍️ Ответить» и отправь вручную.';
    const kb = new InlineKeyboard()
      .text('✍️ Ответить', 'a:brand_app_reply|id:' + appId + '|s:' + back.status + '|p:' + back.page)
      .row()
      .text('⬅️ Назад', 'a:brand_app_view|id:' + appId + '|s:' + back.status + '|p:' + back.page)
      .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');
    try { await safeEditOrReply(ctx, text, { reply_markup: kb }); } catch { await ctx.reply(text, { reply_markup: kb }); }
  }
  return;
}

if (p.a === 'a:brand_app_accept') {
  try { await ctx.answerCallbackQuery(); } catch {}
  const appId = Number(p.id || 0);
  if (!appId) return;
  const back = { status: String(p.s || 'new'), page: Math.max(0, Number(p.p || 0)) };
  try {
    await acceptBrandApplication(ctx, u.id, appId, back);
  } catch (e) {
    try { console.warn('[brand_app_accept] unhandled', { appId, back, cid: ctx.state?.cid || null, err: errInfo(e) }); } catch {}
    const text = '⚠️ Не удалось выполнить действие. Попробуй ещё раз или открой заявку заново.';
    const kb = new InlineKeyboard()
      .text('⬅️ Назад', 'a:brand_app_view|id:' + appId + '|s:' + back.status + '|p:' + back.page)
      .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');
    try { await safeEditOrReply(ctx, text, { reply_markup: kb }); } catch { await ctx.reply(text, { reply_markup: kb }); }
  }
  return;
}

if (p.a === 'a:brand_app_chat') {
  try { await ctx.answerCallbackQuery(); } catch {}
  const appId = Number(p.id || 0);
  if (!appId) return;
  await startBrandAppChatForCreator(ctx, u.id, appId);
  return;
}

if (p.a === 'a:brand_app_card') {
  try { await ctx.answerCallbackQuery(); } catch {}
  const appId = Number(p.id || 0);
  if (!appId) return;
  await renderBrandAppCardForCreator(ctx, u.id, appId);
  return;
}

if (p.a === 'a:ws_leads') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      if (!wsId) return;
      const st = leadStatusFromCb(String(p.s || 'new'));
      const retKey = String(p.ret || retFromCb(p.r) || '').trim();
      await renderWsLeadsList(ctx, u.id, wsId, st, Number(p.p || 0), retKey || null);
      return;
    }

    if (p.a === 'a:lead_view') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const leadId = Number(p.id || 0);
      if (!leadId) {
        await safeEditOrReply(ctx, '⚠️ Кнопка устарела. Открой 📨 Заявки брендов и выбери заявку ещё раз.', { reply_markup: navKb('a:menu') });
        return;
      }
      const wsId = Number(p.w || p.ws || 0);
      const st = leadStatusFromCb(String(p.s || 'new'));
      const page = Number(p.p || 0);
      const retKey = String(p.ret || retFromCb(p.r) || '').trim();
      const rPart = retKey ? retPartShort(retKey) : '';
      const backCb = wsId ? `a:ws_leads|w:${wsId}|s:${leadStatusToCb(st)}|p:${page}${rPart}` : 'a:menu';
      await safeEditOrReply(ctx, '⏳ Открываю карточку…', { reply_markup: navKb(backCb) });
      try {
        await withTimeout(renderLeadView(ctx, u.id, leadId, { wsId: wsId || null, status: st, page, ret: retKey }), 15000, 'lead.view');
      } catch (e) {
        const cid = ctx.state?.cid || null;
        const label = (e && (e.label || e.stepId)) ? String(e.label || e.stepId) : String((e && e.message) ? e.message : 'unknown');
        try { console.warn('[lead_view] timeout/error', { cid, leadId, wsId, label, err: errInfo(e) }); } catch {}
        await safeEditOrReply(ctx, `⚠️ Карточка заявки загружается слишком долго.

step: ${label}

cid: ${cid || '—'}`, { reply_markup: navKb(backCb) });
      }
      return;
    }

    
    if (p.a === 'a:lead_tpls') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const leadId = Number(p.id || 0);
      if (!leadId) {
        await safeEditOrReply(ctx, '⚠️ Кнопка устарела. Открой 📨 Заявки брендов и выбери заявку ещё раз.', { reply_markup: navKb('a:menu') });
        return;
      }
      const wsId = Number(p.w || p.ws || 0);
      const st = leadStatusFromCb(String(p.s || 'new'));
      const retKey = String(p.ret || retFromCb(p.r) || '').trim();
      await renderLeadTemplates(ctx, u.id, leadId, { wsId: wsId || null, status: st, page: Number(p.p || 0), ret: retKey });
      return;
    }

    if (p.a === 'a:lead_tpl') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const leadId = Number(p.id || 0);
      if (!leadId) {
        await safeEditOrReply(ctx, '⚠️ Кнопка устарела. Открой 📨 Заявки брендов и выбери заявку ещё раз.', { reply_markup: navKb('a:menu') });
        return;
      }
      const key = String(p.k || 'discuss');
      const wsId = Number(p.w || p.ws || 0);
      const st = leadStatusFromCb(String(p.s || 'new'));
      const page = Number(p.p || 0);
      const retKey = String(p.ret || retFromCb(p.r) || '').trim();
      try {
        await renderLeadTemplatePreview(ctx, u.id, leadId, key, { wsId: wsId || null, status: st, page, ret: retKey });
      } catch (e) {
        try { console.warn('[lead_tpl_preview] unhandled', { leadId, key, cid: ctx.state?.cid || null, err: errInfo(e) }); } catch {}
        const text = '⚠️ Не удалось открыть предпросмотр. Попробуй ещё раз или используй «✍️ Ответить». ';
        const rPart = retKey ? retPartShort(retKey) : '';
        const kb = new InlineKeyboard()
          .text('⬅️ Назад', `a:lead_view|id:${leadId}|w:${wsId || 0}|s:${leadStatusToCb(st)}|p:${page}${rPart}`)
          .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');
        try { await safeEditOrReply(ctx, text, { reply_markup: kb }); } catch { await ctx.reply(text, { reply_markup: kb }); }
      }
      return;
    }

    if (p.a === 'a:lead_tpl_send') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const leadId = Number(p.id || 0);
      if (!leadId) {
        await safeEditOrReply(ctx, '⚠️ Кнопка устарела. Открой 📨 Заявки брендов и выбери заявку ещё раз.', { reply_markup: navKb('a:menu') });
        return;
      }
      const key = String(p.k || 'discuss');
      const wsId = Number(p.w || p.ws || 0);
      const st = leadStatusFromCb(String(p.s || 'new'));
      const page = Number(p.p || 0);
      const retKey = String(p.ret || retFromCb(p.r) || '').trim();
      try {
        await sendLeadTemplateReply(ctx, u.id, leadId, key, { wsId: wsId || null, status: st, page, ret: retKey });
      } catch (e) {
        try { console.warn('[lead_tpl_send] unhandled', { leadId, key, cid: ctx.state?.cid || null, err: errInfo(e) }); } catch {}
        const text = '⚠️ Не удалось отправить шаблон. Попробуй ещё раз или используй «✍️ Ответить». ';
        const rPart = retKey ? retPartShort(retKey) : '';
        const kb = new InlineKeyboard()
          .text('⬅️ Назад', `a:lead_view|id:${leadId}|w:${wsId || 0}|s:${leadStatusToCb(st)}|p:${page}${rPart}`)
          .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');
        try { await safeEditOrReply(ctx, text, { reply_markup: kb }); } catch { await ctx.reply(text, { reply_markup: kb }); }
      }
      return;
    }

if (p.a === 'a:lead_set') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const leadId = Number(p.id || 0);
      if (!leadId) {
        await safeEditOrReply(ctx, '⚠️ Кнопка устарела. Открой 📨 Заявки брендов и выбери заявку ещё раз.', { reply_markup: navKb('a:menu') });
        return;
      }
      const lead = await db.getBrandLeadById(leadId);
      if (!lead) {
        await safeEditOrReply(ctx, '⚠️ Заявка не найдена. Открой 📨 Заявки брендов и выбери заявку ещё раз.', { reply_markup: navKb('a:menu') });
        return;
      }
      const wsId = Number(lead.workspace_id);
      const ws = await db.getWorkspaceAny(wsId);
      if (!ws) {
        await safeEditOrReply(ctx, '⚠️ Канал не найден. Открой 📋 Меню и выбери канал заново.', { reply_markup: navKb('a:menu') });
        return;
      }
      const isOwner = Number(ws.owner_user_id) === Number(u.id);
      const isAdmin = isSuperAdminTg(ctx.from?.id);
      let isCurator = false;
      if (!isOwner && !isAdmin) {
        try { isCurator = await db.isCuratorForWorkspace(wsId, u.id); } catch {}
      }
      if (!isOwner && !isAdmin && !isCurator) {
        await safeEditOrReply(ctx, '⚠️ Нет доступа к изменению статуса этой заявки.', { reply_markup: navKb('a:menu') });
        return;
      }

      const st = leadStatusFromCb(String(p.st || 'new'));
      const backWsId = Number(p.w || p.ws || 0);
      const backStatus = leadStatusFromCb(String(p.s || 'new'));
      const backPage = Number(p.p || 0);
      const retKey = String(p.ret || retFromCb(p.r) || '').trim();
      const updated = await safeLeadWrite(() => db.updateBrandLeadStatus(leadId, st), { op: 'lead_status', leadId, st });
      if (!updated) {
        const text = '⚠️ Не удалось обновить статус заявки. Попробуй ещё раз.';
        const rPart = retKey ? retPartShort(retKey) : '';
        const kb = new InlineKeyboard()
          .text('⬅️ Назад', `a:lead_view|id:${leadId}|w:${backWsId || wsId || 0}|s:${leadStatusToCb(backStatus)}|p:${backPage}${rPart}`)
          .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');
        try { await safeEditOrReply(ctx, text, { reply_markup: kb }); } catch { await ctx.reply(text, { reply_markup: kb }); }
        return;
      }
      try {
        await renderLeadView(ctx, u.id, leadId, { wsId: wsId || null, status: backStatus || st, page: backPage, ret: retKey });
      } catch (e) {
        try { console.warn('[lead_set] unhandled', { leadId, st, cid: ctx.state?.cid || null, err: errInfo(e) }); } catch {}
        const text = '✅ Статус обновлён. (Экран не удалось перерисовать — открой заявку заново.)';
        const rPart = retKey ? retPartShort(retKey) : '';
        const kb = new InlineKeyboard()
          .text('⬅️ Назад', `a:ws_leads|w:${backWsId || wsId || 0}|s:${leadStatusToCb(backStatus || st)}|p:${backPage}${rPart}`)
          .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');
        try { await safeEditOrReply(ctx, text, { reply_markup: kb }); } catch { await ctx.reply(text, { reply_markup: kb }); }
      }
      return;
    }

    if (p.a === 'a:lead_notes') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const leadId = Number(p.id || 0);
      if (!leadId) return;

      const wsId = Number(p.w || p.ws || 0);
      const backStatus = leadStatusFromCb(String(p.s || 'new'));
      const backPage = Number(p.p || 0);
      const retKey = String(p.ret || retFromCb(p.r) || '').trim() || null;
      const notesPage = Math.max(0, Number(p.n || 0));

      await renderLeadNotesViewer(ctx, u.id, leadId, { wsId: wsId || null, status: backStatus, page: backPage, ret: retKey }, notesPage);
      return;
    }





    if (p.a === 'a:lead_note_cancel') {
      try { await ctx.answerCallbackQuery(); } catch {}
      try { if (ctx.from?.id) await clearExpectText(ctx.from.id); } catch {}
      const leadId = Number(p.id || 0);
      if (!leadId) return;

      const wsId = Number(p.w || p.ws || 0);
      const backStatus = leadStatusFromCb(String(p.s || 'new'));
      const backPage = Number(p.p || 0);
      const retKey = String(p.ret || retFromCb(p.r) || '').trim() || null;
      const notesPage = (p.nb !== undefined && p.nb !== null) ? Math.max(0, Number(p.nb || 0)) : null;

      if (notesPage !== null) {
        await renderLeadNotesViewer(ctx, u.id, leadId, { wsId: wsId || null, status: backStatus, page: backPage, ret: retKey }, notesPage);
        return;
      }

      await renderLeadView(ctx, u.id, leadId, { wsId: wsId || null, status: backStatus, page: backPage, ret: retKey });
      return;
    }


    if (p.a === 'a:lead_note') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const tgId = ctx.from?.id;
      if (!tgId) return;

      const leadId = Number(p.id || 0);
      if (!leadId) return;

      const lead = await db.getBrandLeadById(leadId);
      if (!lead) {
        await safeEditOrReply(ctx, '⚠️ Заявка не найдена. Открой 📨 Заявки брендов и выбери заявку ещё раз.', { reply_markup: navKb('a:menu') });
        return;
      }

      const wsId = Number(lead.workspace_id);
      const ws = await db.getWorkspaceAny(wsId);
      if (!ws) {
        await safeEditOrReply(ctx, '⚠️ Канал не найден. Открой 📋 Меню и выбери канал заново.', { reply_markup: navKb('a:menu') });
        return;
      }

      const isOwner = Number(ws.owner_user_id) === Number(u.id);
      const isAdmin = isSuperAdminTg(ctx.from?.id);
      let isCurator = false;
      if (!isOwner && !isAdmin) {
        try { isCurator = await db.isCuratorForWorkspace(wsId, u.id); } catch {}
      }
      if (!isOwner && !isAdmin && !isCurator) {
        await safeEditOrReply(ctx, '⚠️ Нет доступа к заметкам этой заявки.', { reply_markup: navKb('a:menu') });
        return;
      }

      const actorRole = isOwner ? 'owner' : (isAdmin ? 'admin' : 'curator');

      const backStatus = leadStatusFromCb(String(p.s || 'new'));
      const backPage = Number(p.p || 0);
      const retKey = String(p.ret || retFromCb(p.r) || '').trim() || null;
      const notesPage = (p.nb !== undefined && p.nb !== null) ? Math.max(0, Number(p.nb || 0)) : null;
      const rPart = retKey ? retPartShort(retKey) : '';
      const nbPart = (notesPage !== null) ? `|nb:${notesPage}` : '';

      const backCb = (notesPage !== null)
        ? `a:lead_notes|id:${leadId}|w:${wsId}|n:${notesPage}|s:${leadStatusToCb(backStatus)}|p:${backPage}${rPart}`
        : `a:lead_view|id:${leadId}|w:${wsId}|s:${leadStatusToCb(backStatus)}|p:${backPage}${rPart}`;

      const kb = new InlineKeyboard()
        .text(LEAD_NOTE_TEMPLATES.wb.label, `a:lead_note_tpl|id:${leadId}|w:${wsId}|k:wb|s:${leadStatusToCb(backStatus)}|p:${backPage}${nbPart}${rPart}`)
        .text(LEAD_NOTE_TEMPLATES.bd.label, `a:lead_note_tpl|id:${leadId}|w:${wsId}|k:bd|s:${leadStatusToCb(backStatus)}|p:${backPage}${nbPart}${rPart}`)
        .row()
        .text(LEAD_NOTE_TEMPLATES.fm.label, `a:lead_note_tpl|id:${leadId}|w:${wsId}|k:fm|s:${leadStatusToCb(backStatus)}|p:${backPage}${nbPart}${rPart}`)
        .text(LEAD_NOTE_TEMPLATES.fu.label, `a:lead_note_tpl|id:${leadId}|w:${wsId}|k:fu|s:${leadStatusToCb(backStatus)}|p:${backPage}${nbPart}${rPart}`)
        .row()
        .text(LEAD_NOTE_TEMPLATES.ur.label, `a:lead_note_tpl|id:${leadId}|w:${wsId}|k:ur|s:${leadStatusToCb(backStatus)}|p:${backPage}${nbPart}${rPart}`)
        .text(LEAD_NOTE_TEMPLATES.sp.label, `a:lead_note_tpl|id:${leadId}|w:${wsId}|k:sp|s:${leadStatusToCb(backStatus)}|p:${backPage}${nbPart}${rPart}`)
        .row()
        .text('✍️ Ввести вручную', `a:lead_note_text|id:${leadId}|w:${wsId}|s:${leadStatusToCb(backStatus)}|p:${backPage}${nbPart}${rPart}`)
        .row()
        .text('⬅️ Назад', backCb)
        .text('📋 Меню', 'a:menu')
        .text('🏠 Home', 'a:home');

      const prompt = `📝 <b>Новая заметка</b> • заявка #${leadId}
` +
        `Роль: <b>${escapeHtml(actorRole)}</b>

` +
        `Выбери быстрый шаблон или введи текст вручную.
` +
        `Теги можно добавлять прямо в тексте: <code>#brief</code> <code>#price</code> <code>#urgent</code>.`;

      await safeEditOrReply(ctx, prompt, { parse_mode: 'HTML', reply_markup: kb });
      return;
    }

    if (p.a === 'a:lead_note_text') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const tgId = ctx.from?.id;
      if (!tgId) return;
      const leadId = Number(p.id || 0);
      if (!leadId) return;

      const lead = await db.getBrandLeadById(leadId);
      if (!lead) {
        await safeEditOrReply(ctx, '⚠️ Заявка не найдена. Открой 📨 Заявки брендов и выбери заявку ещё раз.', { reply_markup: navKb('a:menu') });
        return;
      }

      const wsId = Number(lead.workspace_id);
      const ws = await db.getWorkspaceAny(wsId);
      if (!ws) {
        await safeEditOrReply(ctx, '⚠️ Канал не найден. Открой 📋 Меню и выбери канал заново.', { reply_markup: navKb('a:menu') });
        return;
      }

      const isOwner = Number(ws.owner_user_id) === Number(u.id);
      const isAdmin = isSuperAdminTg(ctx.from?.id);
      let isCurator = false;
      if (!isOwner && !isAdmin) {
        try { isCurator = await db.isCuratorForWorkspace(wsId, u.id); } catch {}
      }
      if (!isOwner && !isAdmin && !isCurator) {
        await safeEditOrReply(ctx, '⚠️ Нет доступа к заметкам этой заявки.', { reply_markup: navKb('a:menu') });
        return;
      }

      const actorRole = isOwner ? 'owner' : (isAdmin ? 'admin' : 'curator');

      const backStatus = leadStatusFromCb(String(p.s || 'new'));
      const backPage = Number(p.p || 0);
      const retKey = String(p.ret || retFromCb(p.r) || '').trim() || null;
      const notesPage = (p.nb !== undefined && p.nb !== null) ? Math.max(0, Number(p.nb || 0)) : null;
      const rPart = retKey ? retPartShort(retKey) : '';

      await setExpectText(tgId, {
        type: 'lead_note',
        leadId,
        wsId,
        backStatus,
        backPage,
        ret: retKey,
        nb: notesPage,
        role: actorRole,
        backCb: `a:lead_view|id:${leadId}|w:${wsId}|s:${leadStatusToCb(backStatus)}|p:${backPage}${rPart}`,
      });

      const nbPart = (notesPage !== null) ? `|nb:${notesPage}` : '';
      const kb = new InlineKeyboard()
        .text('⬅️ Назад', `a:lead_note_cancel|id:${leadId}|w:${wsId}|s:${leadStatusToCb(backStatus)}|p:${backPage}${nbPart}${rPart}`)
        .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');

      const prompt = `📝 <b>Заметка</b> к заявке #${leadId}

Пришли одним сообщением (до 800 символов).

Теги: добавь в тексте, например <code>#brief</code> <code>#price</code> <code>#urgent</code>.
Заметка видна только внутри команды.`;
      await safeEditOrReply(ctx, prompt, { parse_mode: 'HTML', reply_markup: kb });
      return;
    }

    if (p.a === 'a:lead_note_tpl') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const leadId = Number(p.id || 0);
      if (!leadId) return;

      const lead = await db.getBrandLeadById(leadId);
      if (!lead) {
        await safeEditOrReply(ctx, '⚠️ Заявка не найдена. Открой 📨 Заявки брендов и выбери заявку ещё раз.', { reply_markup: navKb('a:menu') });
        return;
      }

      const wsId = Number(lead.workspace_id);
      const ws = await db.getWorkspaceAny(wsId);
      if (!ws) {
        await safeEditOrReply(ctx, '⚠️ Канал не найден. Открой 📋 Меню и выбери канал заново.', { reply_markup: navKb('a:menu') });
        return;
      }

      const isOwner = Number(ws.owner_user_id) === Number(u.id);
      const isAdmin = isSuperAdminTg(ctx.from?.id);
      let isCurator = false;
      if (!isOwner && !isAdmin) {
        try { isCurator = await db.isCuratorForWorkspace(wsId, u.id); } catch {}
      }
      if (!isOwner && !isAdmin && !isCurator) {
        await safeEditOrReply(ctx, '⚠️ Нет доступа к заметкам этой заявки.', { reply_markup: navKb('a:menu') });
        return;
      }

      const actorRole = isOwner ? 'owner' : (isAdmin ? 'admin' : 'curator');

      const tplKey = normLeadNoteTplKey(p.k);
      const tpl = LEAD_NOTE_TEMPLATES[tplKey] || LEAD_NOTE_TEMPLATES.wb;

      const saved = await safeLeadWrite(
        () => db.appendBrandLeadCuratorNote(leadId, u.id, tpl.text, { role: actorRole }),
        { op: 'lead_note_tpl', leadId },
      );
      if (!saved) {
        const backStatus = leadStatusFromCb(String(p.s || 'new'));
        const backPage = Number(p.p || 0);
        const retKey = String(p.ret || retFromCb(p.r) || '').trim() || null;
        const notesPage = (p.nb !== undefined && p.nb !== null) ? Math.max(0, Number(p.nb || 0)) : null;
        const rPart = retKey ? retPartShort(retKey) : '';
        const nbPart = (notesPage !== null) ? `|nb:${notesPage}` : '';
        const backCb = (notesPage !== null)
          ? `a:lead_notes|id:${leadId}|w:${wsId}|n:${notesPage}|s:${leadStatusToCb(backStatus)}|p:${backPage}${rPart}`
          : `a:lead_view|id:${leadId}|w:${wsId}|s:${leadStatusToCb(backStatus)}|p:${backPage}${rPart}`;
        const kb = new InlineKeyboard()
          .text('⬅️ Назад', backCb)
          .text('📋 Меню', 'a:menu')
          .text('🏠 Home', 'a:home');
        await safeEditOrReply(ctx, '⚠️ Не смог сохранить заметку. Попробуй ещё раз.', { reply_markup: kb });
        return;
      }

      const backStatus = leadStatusFromCb(String(p.s || 'new'));
      const backPage = Number(p.p || 0);
      const retKey = String(p.ret || retFromCb(p.r) || '').trim() || null;
      const notesPage = (p.nb !== undefined && p.nb !== null) ? Math.max(0, Number(p.nb || 0)) : null;

      if (notesPage !== null) {
        await renderLeadNotesViewer(ctx, u.id, leadId, { wsId: wsId || null, status: backStatus, page: backPage, ret: retKey }, 0);
        return;
      }

      await renderLeadView(ctx, u.id, leadId, { wsId: wsId || null, status: backStatus, page: backPage, ret: retKey });
      return;
    }


    if (p.a === 'a:lead_reply') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const leadId = Number(p.id || 0);
      if (!leadId) return;

      const lead = await db.getBrandLeadById(leadId);
      if (!lead) return safeEditOrReply(ctx, 'Заявка не найдена.');

      const ws = await db.getWorkspaceAny(Number(lead.workspace_id));
      if (!ws) return safeEditOrReply(ctx, 'Канал не найден.');

      const isOwner = Number(ws.owner_user_id) === Number(u.id);
      const isAdmin = isSuperAdminTg(ctx.from.id);
      if (!isOwner && !isAdmin) { await safeEditOrReply(ctx, '⚠️ Нет доступа к этой заявке. Открой 📋 Меню → выбери канал заново.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') }); return; }

      const backStatus = leadStatusFromCb(String(p.s || 'new'));
      const retKey = String(p.ret || retFromCb(p.r) || '').trim();
      await setExpectText(ctx.from.id, { type: 'lead_reply', leadId, wsId: Number(ws.id), backStatus, backPage: Number(p.p || 0), ret: retKey });

      const rPart = retKey ? retPartShort(retKey) : '';
      const kb = new InlineKeyboard()
        .text('⬅️ Назад', `a:lead_view|id:${leadId}|w:${Number(ws.id)}|s:${leadStatusToCb(backStatus)}|p:${Number(p.p || 0)}${rPart}`);

      await safeEditOrReply(ctx, 
        `✍️ <b>Ответ на заявку #${leadId}</b>

Напиши ответ одним сообщением.`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
      return;
    }

// ONBOARDING V2 (feature-flag)
    if (p.a === 'a:onb_creator') {
      await ctx.answerCallbackQuery();
      await setUiMode(ctx.from.id, UI_MODES.CREATOR);
      const text =
        '✨ <b>Creator / Канал</b>\n\n' +
        'Это UGC/Collab CRM: IG → лиды, TG → сделки.\n\n' +
        '1) 🚀 Подключи канал (workspace)\n' +
        '2) 🪟 Заполни витрину (IG, портфолио, форматы)\n' +
        '3) 🔗 Поставь ссылку витрины в Instagram\n' +
        '4) 📨 Принимай запросы брендов и веди статусы\n\n' +
        'Давай начнём:';
      const kb = new InlineKeyboard()
        .text('🚀 Подключить канал', 'a:setup')
        .row()
        .text('📣 Мои каналы', 'a:ws_list')
        .row()
        .text('🎬 UGC / Офферы', 'a:bx_home')
        .row()
        .text('📋 Меню', 'a:menu');
      await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
      return;
    }

    if (p.a === 'a:onb_brand') {
      await ctx.answerCallbackQuery();
      await setUiMode(ctx.from.id, UI_MODES.BRAND);
      const text =
        '🏷 <b>Brand / Бренд</b>\n\n' +
        'Нашли креатора в Instagram → открываете витрину → закрываете сделку в Telegram.\n\n' +
        '• 📰 Смотри ленту креаторов\n' +
        '• 📨 Пиши в Inbox через <b>Brand Pass</b> (анти-спам)\n' +
        '• 🧾 Держи историю и статусы\n\n' +
        'Открыть режим бренда:';
      const kb = new InlineKeyboard()
        .text('🏷 Для брендов', 'a:bx_open|ws:0')
        .row()
        .text('🎫 Brand Pass', 'a:brand_pass|ws:0')
        .row()
        .text('📋 Меню', 'a:menu');
      await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
      return;
    }

    // VERIFICATION (feature-flag)
    if (p.a === 'a:verify_home') {
      await ctx.answerCallbackQuery();
      if (!CFG.VERIFICATION_ENABLED) {
        await safeEditOrReply(ctx, '✅ Верификация сейчас отключена.', { reply_markup: mainMenuKb(await getRoleFlags(u, ctx.from.id)) });
        return;
      }
      await renderVerifyHome(ctx, u);
      return;
    }
    if (p.a === 'a:verify_info') {
      await ctx.answerCallbackQuery();
      await renderVerifyInfo(ctx);
      return;
    }
    if (p.a === 'a:verify_kind') {
      await ctx.answerCallbackQuery();
      if (!CFG.VERIFICATION_ENABLED) return ctx.answerCallbackQuery({ text: 'Верификация отключена.' });
      const kind = String(p.k || 'creator');


      if (kind === 'brand' && CFG.BRAND_VERIFY_REQUIRES_EXTENDED) {
        const prof = await safeBrandProfiles(() => db.getBrandProfile(u.id), async () => null);
        if (!isBrandExtendedComplete(prof)) {
          await safeEditOrReply(ctx, 
            `🏷 <b>Верификация Brand</b>

Чтобы подать заявку как бренд, заполни расширенный профиль:
• ниша
• гео
• форматы сотрудничества

<i>Зачем:</i> модерации нужны факты, а креаторам — понятность.`,
            {
              parse_mode: 'HTML',
              reply_markup: new InlineKeyboard()
                .text('🏷 Профиль бренда', 'a:brand_profile|ws:0|ret:verify')
                .row()
                .text('⬅️ Назад', 'a:verify_home')
            }
          );
          return;
        }
      }

      await setExpectText(ctx.from.id, { type: 'verify_submit', kind });
      await safeEditOrReply(ctx, 
        `✅ <b>Заявка на верификацию</b>

Отправь одним сообщением:
1) ссылку на твой канал/профиль
2) 2–3 цифры/факта (охваты/подписчики/ниша)
3) контакты для связи
4) коротко: что предлагаешь / что ищешь

<i>Важно:</i> только текст (1 сообщение).`,
        { parse_mode: 'HTML', reply_markup: navKb('a:verify_home') }
      );
      return;
    }

    // SETUP
    if (p.a === 'a:setup') {
      await ctx.answerCallbackQuery();
      db.trackEvent('setup_open', { userId: u.id });
      await renderSetupInstructions(ctx);
      await setExpectText(ctx.from.id, { type: 'setup_forward' });
      return;
    }

    // WORKSPACES
    if (p.a === 'a:ws_list') {
      await ctx.answerCallbackQuery();
      await renderWsList(ctx, u.id);
      return;
    }
    
    if (p.a === 'a:pro_home') {
      await ctx.answerCallbackQuery();
      const ws = await ensureWorkspaceForOwner(ctx, u.id);
      if (!ws) return;
      await renderWsPro(ctx, u.id, Number(ws.id));
      return;
    }

if (p.a === 'a:ws_open') {
      await ctx.answerCallbackQuery();
      await renderWsOpen(ctx, u.id, Number(p.ws));
      return;
    }
    if (p.a === 'a:ws_settings') {
      await ctx.answerCallbackQuery();
      await renderWsSettings(ctx, u.id, Number(p.ws));
      return;
    }
    if (p.a === 'a:ws_history') {
      await ctx.answerCallbackQuery();
      await renderWsHistory(ctx, u.id, Number(p.ws));
      return;
    }

    if (p.a === 'a:ws_profile') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const wsId = Number(p.w || p.ws || 0);
      if (!wsId) {
        await safeEditOrReply(ctx, '⚠️ Канал не выбран. Открой 📋 Меню → выбери канал и повтори шаг.', { parse_mode: 'HTML', reply_markup: navKb('a:ws_list') });
        return;
      }
      await renderWsProfile(ctx, u.id, wsId);
      return;
    }

    
    if (p.a === 'a:ws_share') {
      try { await ctx.answerCallbackQuery(); } catch {}
      const wsId = Number(p.w || p.ws || 0);
      if (!wsId) { await safeEditOrReply(ctx, '⚠️ Кнопка устарела. Открой 📋 Меню → выбери канал заново.', { reply_markup: navKb('a:ws_list') }); return; }
      await renderWsShareMenu(ctx, u.id, wsId, String(p.ret || '') || null);
      return;
    }



    if (p.a === 'a:ws_share_send') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      if (!wsId) return;
      const v = String(p.v || 'short') === 'long' ? 'long' : 'short';
      await sendWsShareTextMessage(ctx, u.id, wsId, v);
      return;
    }


if (p.a === 'a:ws_ig_templates') {
  await ctx.answerCallbackQuery();
  const wsId = Number(p.w || p.ws || 0);
  if (!wsId) return;
  await renderWsIgTemplatesMenu(ctx, u.id, wsId);
  return;
}

if (p.a === 'a:ws_ig_templates_send') {
  await ctx.answerCallbackQuery();
  const wsId = Number(p.w || p.ws || 0);
  if (!wsId) return;
  const t = String(p.t || 'story');
  await sendWsIgTemplateMessage(ctx, u.id, wsId, t);
  return;
}


if (p.a === 'a:ws_ig_dm') {
  await ctx.answerCallbackQuery();
  const wsId = Number(p.w || p.ws || 0);
  if (!wsId) return;
  const tone = String(p.tone || 'soft');
  const i = Number(p.i || 0);
  await renderWsIgDmTemplate(ctx, u.id, wsId, tone, i);
  return;
}


if (p.a === 'a:ws_prof_mode') {
      await ctx.answerCallbackQuery();
      await renderWsProfileMode(ctx, u.id, Number(p.ws));
      return;
    }
    if (p.a === 'a:ws_prof_mode_set') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const mode = String(p.m || 'both');
      const allowed = ['channel', 'ugc', 'both'];
      if (!allowed.includes(mode)) return ctx.answerCallbackQuery({ text: 'Неверный режим.' });
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await db.setWorkspaceSetting(wsId, { profile_mode: mode });
      await db.auditWorkspace(wsId, u.id, 'ws.profile_mode_updated', { mode });
      await renderWsProfileMode(ctx, u.id, wsId);
      return;
    }

    if (p.a === 'a:ws_prof_verticals') {
      await ctx.answerCallbackQuery();
      await renderWsProfileVerticals(ctx, u.id, Number(p.ws));
      return;
    }
    if (p.a === 'a:ws_prof_vert_t') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const key = String(p.v || '');
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      const cur = Array.isArray(ws.profile_verticals) ? ws.profile_verticals.map(String) : [];
      const has = cur.includes(key);
      let next = cur.filter(x => x !== key);
      if (!has) {
        if (cur.length >= 3) {
          await ctx.answerCallbackQuery({ text: 'Максимум 3 ниши.', show_alert: true });
          return renderWsProfileVerticals(ctx, u.id, wsId);
        }
        next = [...cur, key];
      }
      await db.setWorkspaceSetting(wsId, { profile_verticals: next });
      await db.auditWorkspace(wsId, u.id, 'ws.profile_verticals_updated', { count: next.length });
      await renderWsProfileVerticals(ctx, u.id, wsId);
      return;
    }
    if (p.a === 'a:ws_prof_vert_clear') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await db.setWorkspaceSetting(wsId, { profile_verticals: [] });
      await db.auditWorkspace(wsId, u.id, 'ws.profile_verticals_cleared', {});
      await renderWsProfileVerticals(ctx, u.id, wsId);
      return;
    }

    if (p.a === 'a:ws_prof_formats') {
      await ctx.answerCallbackQuery();
      await renderWsProfileFormats(ctx, u.id, Number(p.ws));
      return;
    }
    if (p.a === 'a:ws_prof_fmt_t') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const key = String(p.f || '');
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      const cur = Array.isArray(ws.profile_formats) ? ws.profile_formats.map(String) : [];
      const has = cur.includes(key);
      let next = cur.filter(x => x !== key);
      if (!has) {
        if (cur.length >= 5) {
          await ctx.answerCallbackQuery({ text: 'Максимум 5 форматов.', show_alert: true });
          return renderWsProfileFormats(ctx, u.id, wsId);
        }
        next = [...cur, key];
      }
      await db.setWorkspaceSetting(wsId, { profile_formats: next });
      await db.auditWorkspace(wsId, u.id, 'ws.profile_formats_updated', { count: next.length });
      await renderWsProfileFormats(ctx, u.id, wsId);
      return;
    }
    if (p.a === 'a:ws_prof_fmt_clear') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await db.setWorkspaceSetting(wsId, { profile_formats: [] });
      await db.auditWorkspace(wsId, u.id, 'ws.profile_formats_cleared', {});
      await renderWsProfileFormats(ctx, u.id, wsId);
      return;
    }

    if (p.a === 'a:ws_prof_edit') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const field = String(p.f || 'title');
      const prompts = {
        title: '✍️ Введи название витрины (как тебя видит бренд).',
        niche: '✍️ Введи нишу (устар.) — лучше выбрать “🏷 Ниши”.',
        ig: '✍️ Пришли Instagram: @handle или ссылку на профиль (instagram.com/handle).\n\nЧтобы очистить поле — отправь “-”.',
        about: '✍️ Короткое описание (1–2 предложения).\n\nПример: “Тестирую косметику и делаю распаковки. Люблю честные обзоры.”',
        portfolio: '✍️ Пришли 1–3 ссылки на портфолио (каждая с новой строки или в одном сообщении).\n\nЧтобы очистить поле — отправь “-”.',
        contact: '✍️ Введи контакт (например: @username / ссылка / почта).',
        geo: '✍️ Введи город/гео.'
      };
      await safeEditOrReply(ctx, prompts[field] || prompts.title, {
        reply_markup: new InlineKeyboard().text('⬅️ Отмена', `a:ws_profile|ws:${wsId}`).text('📋 Меню', 'a:menu')
      });
      await setExpectText(ctx.from.id, { type: 'ws_profile_edit', wsId, field, chatId: ctx.chat?.id, messageId: ctx.callbackQuery?.message?.message_id });
      return;
    }


    // Creator profile: reset vitrina (wipe public fields only, keep dialogs/payments intact)
    if (p.a === 'a:ws_prof_reset') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      const text =
        `🧹 <b>Сбросить витрину?</b>

Это очистит публичные поля витрины:
• Название
• Ниши и форматы
• Гео и описание
• Instagram и ссылки портфолио
• Контакт

<b>Не трогаем</b>: диалоги/заявки, оплаты, PRO и подключение канала.

После сброса профиль станет “как новый” — можно заполнить заново.`;

      const kb = new InlineKeyboard()
        .text('🧹 Да, сбросить', `a:ws_prof_reset_ok|ws:${wsId}`)
        .row()
        .text('⬅️ Отмена', `a:ws_profile|ws:${wsId}`)
        .text('📋 Меню', 'a:menu')
        .text('🏠 Home', 'a:home');

      await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
      return;
    }

    if (p.a === 'a:ws_prof_reset_ok') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      await db.setWorkspaceSetting(wsId, {
        profile_title: null,
        profile_niche: null,
        profile_ig: null,
        profile_verticals: [],
        profile_formats: [],
        profile_geo: null,
        profile_contact: null,
        profile_portfolio_urls: [],
        profile_about: null,
        profile_mode: 'both',
      });

      try { await db.auditWorkspace(wsId, u.id, 'ws.profile_reset', { scope: 'public_fields' }); } catch { }

      try { await ctx.answerCallbackQuery({ text: '✅ Витрина сброшена', show_alert: true }); } catch { }
      await renderWsProfile(ctx, u.id, wsId);
      return;
    }

    if (p.a === 'a:ws_pro') {
      await ctx.answerCallbackQuery();
      await renderWsPro(ctx, u.id, Number(p.ws));
      return;
    }
    if (p.a === 'a:ws_pro_buy') {
      const { accept } = await getPaymentsRuntimeFlags();
      if (!accept) {
        return ctx.answerCallbackQuery({ text: '💤 Платежи на паузе. Попробуй позже.', show_alert: true });
      }
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      const token = randomToken(10);
      await redis.set(k(['pay_pro', token]), { wsId, ownerUserId: u.id, tgId: ctx.from.id }, { ex: 15 * 60 });
      const payload = `pro_${wsId}_${u.id}_${token}`;
      await sendStarsInvoice(ctx, {
        title: 'MicroGiveaways PRO',
        description: 'PRO на 30 дней: чаще bump, больше офферов, пин в ленте, расширенная аналитика.',
        payload,
        amount: CFG.PRO_STARS_PRICE,
        backCb: `a:ws_pro|ws:${wsId}`,
      });
      return;
    }

    // Brand Pass (Stars) - buy credits to open new threads as a brand
    if (p.a === 'a:brand_buy') {
      const { accept } = await getPaymentsRuntimeFlags();
      if (!accept) {
        return ctx.answerCallbackQuery({ text: '💤 Платежи на паузе. Попробуй позже.', show_alert: true });
      }
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const offerId = (p.o !== undefined && p.o !== null && p.o !== '') ? Number(p.o) : null;
      const packId = String(p.pack || 'S');
      const page = Number(p.p || 0); // legacy: used as picker page in old messages
      const pack = getBrandPack(packId);
      if (!pack) return ctx.answerCallbackQuery({ text: 'Пакет не найден.' });

      const token = randomToken(10);
      await redis.set(
        k(['pay_brand', token]),
        { tgId: ctx.from.id, userId: u.id, packId: pack.id, credits: pack.credits, wsId, offerId, page },
        { ex: 15 * 60 }
      );

      const payload = `brand_${u.id}_${pack.id}_${token}`;
      const back = offerId ? `a:bx_pub|ws:${wsId}|o:${offerId}|p:${page}|h:${h}` : `a:brand_pass|ws:${wsId}`;
      await sendStarsInvoice(ctx, {
        title: `Brand Pass · ${pack.credits} кредитов`,
        description: 'Кредиты нужны только для открытия НОВОГО диалога. Переписка внутри диалога — бесплатна.',
        payload,
        amount: pack.stars,
        backCb: back,
      });
      return;
    }

    // Brand Mode tools


    // Brand Team (Brand Managers)

    if (p.a === 'a:brand_team') {
      await ctx.answerCallbackQuery();

      const gate = await ensureBrandTeamUnlocked(ctx, u);
      if (!gate) return;


      const managers = await db.listBrandManagers(u.id);
      const count = managers.length;

      const text = `👔 <b>Менеджеры бренда</b>

Добавь менеджеров — они смогут быстрее отвечать на заявки и закрывать сделки.
У менеджера нет доступа к оплатам, профилю бренда и управлению командой.

Сейчас менеджеров: <b>${count}</b>`;

      await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: brandTeamKb() });
      return;
    }

    if (p.a === 'a:bm_invite') {
      await ctx.answerCallbackQuery();
      const gate = await ensureBrandTeamUnlocked(ctx, u);
      if (!gate) return;
      const token = randomToken(10);
      await redis.set(
        k(['bm_invite', token]),
        { brandUserId: u.id, addedByUserId: u.id },
        { ex: 24 * 3600 }
      );

      const link = `https://t.me/${CFG.BOT_USERNAME}?start=bminv_${token}`;
      const text = `🔗 <b>Приглашение менеджера</b>

Ссылка одноразовая, действует <b>24 часа</b>.
Отправь её человеку, которого хочешь добавить в команду:

${link}`;

      await safeEditOrReply(ctx, text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: navKb('a:brand_team|ws:0'),
      });
      return;
    }

    if (p.a === 'a:bm_add_username') {
      await ctx.answerCallbackQuery();
      const gate = await ensureBrandTeamUnlocked(ctx, u);
      if (!gate) return;
      await setExpectText(ctx.from.id, { type: 'bm_username' });
      await safeEditOrReply(ctx, 'Введи @username менеджера одним сообщением (пример: @manager).', {
        reply_markup: navKb('a:brand_team|ws:0'),
      });
      return;
    }

    if (p.a === 'a:bm_list') {
      await ctx.answerCallbackQuery();
      const gate = await ensureBrandTeamUnlocked(ctx, u);
      if (!gate) return;
      const managers = await db.listBrandManagers(u.id);
      if (!managers.length) {
        await safeEditOrReply(ctx, 'Пока менеджеров нет. Добавь менеджера через приглашение или по @username.', {
          reply_markup: navKb('a:brand_team|ws:0'),
        });
        return;
      }

      const lines = managers.map((m) => {
        const label = m.tg_username ? `@${m.tg_username}` : `id:${m.tg_id}`;
        return `• ${escapeHtml(label)}`;
      }).join('\n');

      await safeEditOrReply(ctx, `👥 <b>Менеджеры бренда</b>\n\n${lines}\n\nНажми на кнопку, чтобы удалить менеджера.`, {
        parse_mode: 'HTML',
        reply_markup: brandManagersListKb(managers),
      });
      return;
    }

    if (p.a === 'a:bm_rm_q') {
      await ctx.answerCallbackQuery();
      const gate = await ensureBrandTeamUnlocked(ctx, u);
      if (!gate) return;
      const managerUserId = Number(p.u || 0);
      if (!managerUserId) return;

      const info = await db.getUserTgIdByUserId(managerUserId);
      const label = info?.tg_username ? `@${info.tg_username}` : (info?.tg_id ? `id:${info.tg_id}` : `user #${managerUserId}`);

      await safeEditOrReply(ctx, `Удалить менеджера <b>${escapeHtml(label)}</b> из команды бренда?`, {
        parse_mode: 'HTML',
        reply_markup: brandManagerRemoveConfirmKb(managerUserId),
      });
      return;
    }

    if (p.a === 'a:bm_rm_ok') {
      await ctx.answerCallbackQuery();
      const gate = await ensureBrandTeamUnlocked(ctx, u);
      if (!gate) return;
      const managerUserId = Number(p.u || 0);
      if (!managerUserId) return;
      await db.removeBrandManager(u.id, managerUserId);

      // Best-effort notification to removed manager
      let notifyOk = false;
      try {
        const mi = await db.getUserTgIdByUserId(managerUserId);
        const managerTgId = Number(mi?.tg_id || 0);
        if (managerTgId) {
          // clean up manager state if this brand was active
          try {
            const active = await getBmActiveBrand(managerTgId);
            if (active === u.id) await clearBmActiveBrand(managerTgId);
          } catch { }

          // if no more brands left -> disable manager mode
          try {
            const still = await db.listBrandsForManager(managerUserId);
            if (!still || !still.length) await disableBrandManagerState(managerTgId);
          } catch { }

          const prof = await safeBrandProfiles(() => db.getBrandProfile(u.id), async () => null);
          const brandLabel = prof?.brand_name ? String(prof.brand_name).trim()
            : (prof?.tg_username ? `@${String(prof.tg_username).trim()}` : `Бренд #${u.id}`);

          const msg = `⛔️ <b>Доступ отозван</b>\n\nТебя удалили из команды бренда <b>${escapeHtml(brandLabel)}</b>.\n\nЕсли у тебя есть другие бренды — открой кабинет менеджера и выбери бренд.`;
          const kb = new InlineKeyboard()
            .text('🧑‍💼 Кабинет менеджера', 'a:bm_home')
            .row()
            .text('🗑 Убрать', 'a:nd')
            .row()
            .text('📋 Меню', 'a:menu')
            .text('🏠 Home', 'a:home');
          await ctx.api.sendMessage(managerTgId, msg, { parse_mode: 'HTML', reply_markup: kb });
          notifyOk = true;
        }
      } catch { }

      // refresh list
      const managers = await db.listBrandManagers(u.id);
      if (!managers.length) {
        await safeEditOrReply(ctx, '✅ Менеджер удалён. Сейчас менеджеров нет.', {
          reply_markup: navKb('a:brand_team|ws:0'),
        });
        return;
      }
      const lines = managers.map((m) => {
        const label = m.tg_username ? `@${m.tg_username}` : `id:${m.tg_id}`;
        return `• ${escapeHtml(label)}`;
      }).join('\n');

      const note = notifyOk ? '\n\n📩 Менеджеру отправлено уведомление.' : '';
      await safeEditOrReply(ctx, `✅ Менеджер удалён.${note}\n\n👥 <b>Менеджеры бренда</b>\n\n${lines}`, {
        parse_mode: 'HTML',
        reply_markup: brandManagersListKb(managers),
      });
      return;
    }

    if (p.a === 'a:brand_profile') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand'); // brand | offer | lead | verify
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;

      const bm = wsId === 0 ? await resolveBmBrandContext(ctx, u) : { enabled: false };
      if (wsId === 0 && bm.enabled && bm.brandUserId !== u.id) {
        await safeEditOrReply(ctx, 
          '⛔️ Недостаточно прав. Этот раздел доступен только владельцу бренда.',
          { parse_mode: 'HTML', reply_markup: navKb('a:menu') }
        );
        return;
      }

      // Home view (non-edit). Edit view is `a:brand_profile_edit`.
      await renderBrandProfileHome(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: false });
      return;
    }

    // Brand profile edit (base 4/4 fields)
    if (p.a === 'a:brand_profile_edit') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;

      const bm = wsId === 0 ? await resolveBmBrandContext(ctx, u) : { enabled: false };
      if (wsId === 0 && bm.enabled && bm.brandUserId !== u.id) {
        await safeEditOrReply(ctx, 
          '⛔️ Недостаточно прав. Этот раздел доступен только владельцу бренда.',
          { parse_mode: 'HTML', reply_markup: navKb('a:menu') }
        );
        return;
      }

      await renderBrandProfileHome(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

    // Brand profile niche picker (single select, checkmark UX)
    if (p.a === 'a:brand_niche_pick') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      const from = String(p.from || 'home');

      const bm = wsId === 0 ? await resolveBmBrandContext(ctx, u) : { enabled: false };
      if (wsId === 0 && bm.enabled && bm.brandUserId !== u.id) {
        await safeEditOrReply(ctx,
          '⛔️ Недостаточно прав. Этот раздел доступен только владельцу бренда.',
          { parse_mode: 'HTML', reply_markup: navKb('a:menu') }
        );
        return;
      }

      await renderBrandNichePicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, from });
      return;
    }

    if (p.a === 'a:brand_niche_set') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      const from = String(p.from || 'home');
      const k = String(p.k || '').trim();
      const found = BX_CATEGORIES.find((x) => x.key === k);

      if (!found) {
        await renderBrandNichePicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, from });
        return;
      }

      const prof = await safeBrandProfiles(() => db.getBrandProfile(u.id), async () => null);
      const meta = parseBrandMeta(prof?.meta);
      const nextMeta = { ...meta, niche_key: found.key };

      await safeBrandProfiles(
        () => db.upsertBrandProfile(u.id, { niche: found.label, meta: nextMeta }),
        async () => null
      );

      await renderBrandNichePicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, from });
      return;
    }

    if (p.a === 'a:brand_niche_clear') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      const from = String(p.from || 'home');

      const prof = await safeBrandProfiles(() => db.getBrandProfile(u.id), async () => null);
      const p0 = prof || {};
      const meta0 = parseBrandMeta(p0.meta);
      const curText = String(p0.niche || '').trim();
      const isCategoryLabel = BX_CATEGORIES.some((x) => String(x.label || '').trim() === curText);
      const nextMeta = { ...meta0 };
      delete nextMeta.niche_key;

      const patch = { meta: nextMeta };
      if (isCategoryLabel) patch.niche = null;

      await safeBrandProfiles(() => db.upsertBrandProfile(u.id, patch), async () => null);
      await renderBrandNichePicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, from });
      return;
    }

    // Alias: old callback id from keyboards
    if (p.a === 'a:brand_profile_more') {
      p.a = 'a:brand_prof_more';
    }

    if (p.a === 'a:brand_continue') {
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      if (String(p.ret || '') !== 'lead' || !wsId) {
        await ctx.answerCallbackQuery();
        await renderBrandProfileHome(ctx, u.id, { wsId, ret: String(p.ret || 'brand'), backOfferId: p.bo ? Number(p.bo) : null, backPage: p.bp ? Number(p.bp) : 0, edit: true });
        return;
      }

      const prof = await safeBrandProfiles(() => db.getBrandProfile(u.id), async () => null);
      if (!isBrandBasicComplete(prof)) {
        await ctx.answerCallbackQuery({ text: 'Заполни 4 поля профиля (Название, Ниши, Контакт, Ссылка).', show_alert: true });
        await renderBrandProfileHome(ctx, u.id, { wsId, ret: 'lead', edit: true });
        return;
      }

      const contact = String(prof.contact || '').trim().slice(0, 200);
      await ctx.answerCallbackQuery();
      await setExpectText(ctx.from.id, { type: 'wsp_lead_step2', wsId, contact, brandName: String(prof.brand_name || '').trim() || null, brandLink: String(prof.brand_link || '').trim() || null });
      await renderWsLeadCompose(ctx, wsId, 2, { contact });
      return;
    }


    if (p.a === 'a:brand_prof_more') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      await renderBrandProfileMore(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

    if (p.a === 'a:brand_prof_set') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      const field = String(p.f || '');
      const map = {
        bn: 'brand_name',
        bl: 'brand_link',
        ct: 'contact',
        ni: 'niche',
        ge: 'geo',
        ty: 'collab_types',
        bu: 'budget',
        go: 'goals',
        rq: 'requirements'
      };
      const realField = map[field] || null;
      if (!realField) return;

      // Structured multi-select for collaboration types (no free-text input)
      if (realField === 'collab_types') {
        await renderBrandCollabTypesPicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
        return;
      }

      await setExpectText(ctx.from.id, { type: 'brand_prof_field', field: realField, wsId, ret, backOfferId: bo, backPage: bp, from: String(p.from || 'home') });
      const promptTxt =
        realField === 'niche'
          ? `${brandFieldPrompt(realField)}\n\n<i>Подсказка: для удобной категории используй кнопку “🏷 Ниши” в редактировании профиля.</i>`
          : brandFieldPrompt(realField);
      await safeEditOrReply(ctx, promptTxt, {
        parse_mode: 'HTML',
        reply_markup: brandFieldPromptKb({ wsId, ret, backOfferId: bo, backPage: bp, from: String(p.from || "") })
      });
      return;
    }

    // Brand profile: structured collab types multi-select
    if (p.a === 'a:brand_ty_t') {
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      const key = String(p.k || '');
      if (!BRAND_COLLAB_KEYS.has(key)) {
        await ctx.answerCallbackQuery();
        return;
      }

      await ctx.answerCallbackQuery();

      const prof = await safeBrandProfiles(
        () => db.getBrandProfile(u.id),
        async () => ({ __missing_relation: true })
      );
      if (prof && prof.__missing_relation) {
        await safeEditOrReply(ctx, '⚠️ В базе нет таблицы brand_profiles. Применяй миграцию migrations/024_brand_profiles.sql в Neon и повтори.', {
          reply_markup: navKb('a:menu')
        });
        return;
      }

      const current = parseBrandCollabTypes(String(prof?.collab_types || '').trim());
      const set = new Set(current);
      if (set.has(key)) set.delete(key); else set.add(key);
      const next = Array.from(set);
      const csv = brandCollabTypesToCsv(next);

      const saved = await safeBrandProfiles(
        () => db.upsertBrandProfile(u.id, { collab_types: csv }),
        async () => ({ __missing_relation: true })
      );
      if (saved && saved.__missing_relation) {
        await safeEditOrReply(ctx, '⚠️ В базе нет таблицы brand_profiles. Применяй миграцию migrations/024_brand_profiles.sql в Neon и повтори.', {
          reply_markup: navKb('a:menu')
        });
        return;
      }

      await renderBrandCollabTypesPicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

    if (p.a === 'a:brand_ty_clear') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;

      const saved = await safeBrandProfiles(
        () => db.upsertBrandProfile(u.id, { collab_types: null }),
        async () => ({ __missing_relation: true })
      );
      if (saved && saved.__missing_relation) {
        await safeEditOrReply(ctx, '⚠️ В базе нет таблицы brand_profiles. Применяй миграцию migrations/024_brand_profiles.sql в Neon и повтори.', {
          reply_markup: navKb('a:menu')
        });
        return;
      }

      await renderBrandCollabTypesPicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

    if (p.a === 'a:brand_ty_done') {
      await ctx.answerCallbackQuery({ text: '✅ Сохранено' });
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      await renderBrandProfileMore(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }


    // Brand profile: advanced structured meta (budget bucket / goals tags / requirements tags)
    if (p.a === 'a:brand_bb_pick') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      await renderBrandBudgetBucketPicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

    if (p.a === 'a:brand_bb_set') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      const key = String(p.k || '');
      if (!BRAND_BUDGET_KEYS.has(key)) {
        await renderBrandBudgetBucketPicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
        return;
      }
      await updateBrandMeta(u.id, { budget_bucket: key });
      await renderBrandBudgetBucketPicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

    if (p.a === 'a:brand_bb_clear') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      await updateBrandMeta(u.id, { budget_bucket: null });
      await renderBrandBudgetBucketPicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

    if (p.a === 'a:brand_bb_done') {
      await ctx.answerCallbackQuery({ text: '✅ Сохранено' });
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      await renderBrandProfileMore(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

    if (p.a === 'a:brand_gt_pick') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      await renderBrandGoalsTagsPicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

    if (p.a === 'a:brand_gt_t') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      const key = String(p.k || '');
      if (!BRAND_GOALS_KEYS.has(key)) {
        await renderBrandGoalsTagsPicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
        return;
      }
      const prof = await safeBrandProfiles(() => db.getBrandProfile(u.id), async () => null);
      const meta = parseBrandMeta(prof?.meta);
      const cur = Array.isArray(meta.goals_tags) ? meta.goals_tags.map(String).filter((k) => BRAND_GOALS_KEYS.has(k)) : [];
      const set = cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key];
      await updateBrandMeta(u.id, { goals_tags: set });
      await renderBrandGoalsTagsPicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

    if (p.a === 'a:brand_gt_clear') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      await updateBrandMeta(u.id, { goals_tags: [] });
      await renderBrandGoalsTagsPicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

    if (p.a === 'a:brand_gt_done') {
      await ctx.answerCallbackQuery({ text: '✅ Сохранено' });
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      await renderBrandProfileMore(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

    if (p.a === 'a:brand_rt_pick') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      await renderBrandReqTagsPicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

    if (p.a === 'a:brand_rt_t') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      const key = String(p.k || '');
      if (!BRAND_REQ_KEYS.has(key)) {
        await renderBrandReqTagsPicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
        return;
      }
      const prof = await safeBrandProfiles(() => db.getBrandProfile(u.id), async () => null);
      const meta = parseBrandMeta(prof?.meta);
      const cur = Array.isArray(meta.req_tags) ? meta.req_tags.map(String).filter((k) => BRAND_REQ_KEYS.has(k)) : [];
      const set = cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key];
      await updateBrandMeta(u.id, { req_tags: set });
      await renderBrandReqTagsPicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

    if (p.a === 'a:brand_rt_clear') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      await updateBrandMeta(u.id, { req_tags: [] });
      await renderBrandReqTagsPicker(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }

    if (p.a === 'a:brand_rt_done') {
      await ctx.answerCallbackQuery({ text: '✅ Сохранено' });
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      await renderBrandProfileMore(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }


    if (p.a === 'a:brand_prof_reset') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;
      const suf = brandCbSuffix({ wsId, ret, backOfferId: bo, backPage: bp });

      const kb = new InlineKeyboard()
        .text('✅ Да, сбросить', `a:brand_prof_reset_ok${suf}`)
        .row()
        .text('⬅️ Отмена', `a:brand_profile${suf}`);

      const txt = `🧹 <b>Сбросить профиль бренда?</b>

Это удалит базовые и расширенные поля профиля. Действие необратимо.`;
      await safeEditOrReply(ctx, txt, { parse_mode: 'HTML', reply_markup: kb });
      return;
    }

    if (p.a === 'a:brand_prof_reset_ok') {
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const ret = String(p.ret || 'brand');
      const bo = p.bo ? Number(p.bo) : null;
      const bp = p.bp ? Number(p.bp) : 0;

      const res = await safeBrandProfiles(
        () => db.deleteBrandProfile(u.id),
        async () => ({ __missing_relation: true })
      );

      if (res && res.__missing_relation) {
        await ctx.answerCallbackQuery({ text: '⚠️ Не найдена таблица brand_profiles. Нужна миграция 024_brand_profiles.sql.', show_alert: true });
        await renderBrandProfileHome(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
        return;
      }

      await ctx.answerCallbackQuery({ text: '✅ Профиль сброшен.' });
      await renderBrandProfileHome(ctx, u.id, { wsId, ret, backOfferId: bo, backPage: bp, edit: true });
      return;
    }


    if (p.a === 'a:brand_pass') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);

      const bm = wsId === 0 ? await resolveBmBrandContext(ctx, u) : { enabled: false };
      if (wsId === 0 && bm.enabled && bm.brandUserId !== u.id) {
        await safeEditOrReply(ctx, 
          '⛔️ Недостаточно прав. Этот раздел доступен только владельцу бренда.',
          { parse_mode: 'HTML', reply_markup: navKb('a:menu') }
        );
        return;
      }

      await renderBrandPass(ctx, u.id, wsId);
      return;
    }

    if (p.a === 'a:brand_plan') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);

      const bm = wsId === 0 ? await resolveBmBrandContext(ctx, u) : { enabled: false };
      if (wsId === 0 && bm.enabled && bm.brandUserId !== u.id) {
        await safeEditOrReply(ctx, 
          '⛔️ Недостаточно прав. Этот раздел доступен только владельцу бренда.',
          { parse_mode: 'HTML', reply_markup: navKb('a:menu') }
        );
        return;
      }

      await renderBrandPlan(ctx, u.id, wsId);
      return;
    }

    if (p.a === 'a:brand_plan_buy') {
      const { accept } = await getPaymentsRuntimeFlags();
      if (!accept) {
        return ctx.answerCallbackQuery({ text: '💤 Платежи на паузе. Попробуй позже.', show_alert: true });
      }
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const plan = String(p.plan || 'basic').toLowerCase();
      if (plan !== 'basic' && plan !== 'max') {
        return ctx.answerCallbackQuery({ text: 'План не найден.' });
      }
      const stars = plan === 'max' ? Number(CFG.BRAND_PLAN_MAX_PRICE) : Number(CFG.BRAND_PLAN_BASIC_PRICE);
      const token = randomToken(10);
      await redis.set(
        k(['pay_bplan', token]),
        { tgId: ctx.from.id, userId: u.id, wsId, plan, stars },
        { ex: 15 * 60 }
      );
      const payload = `bplan_${u.id}_${plan}_${token}`;
      const label = plan === 'max' ? 'Max' : 'Basic';
      await sendStarsInvoice(ctx, {
        title: `Brand Plan · ${label} · ${CFG.BRAND_PLAN_DURATION_DAYS} дней`,
        description: 'Подписка на инструменты бренда: CRM стадии, расширенная воронка, удобный менеджмент диалогов.',
        payload,
        amount: stars,
        backCb: `a:brand_plan|ws:${wsId}`,
      });
      return;
    }

    
    // Profile Matching (pm_*)
    if (p.a === 'a:pm_home') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);

      const bm = wsId === 0 ? await resolveBmBrandContext(ctx, u) : { enabled: false };
      const effectiveUserId = (wsId === 0 && bm.enabled) ? bm.brandUserId : u.id;

      await renderProfileMatchingHome(ctx, effectiveUserId, wsId);
      return;
    }

    if (p.a === 'a:pm_reset') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      await pmResetState(ctx.from.id, wsId);
      await renderProfileMatchingHome(ctx, u.id, wsId);
      return;
    }

    if (p.a === 'a:pm_pick') {
      await ctx.answerCallbackQuery();
      await renderProfileMatchingPick(ctx, u.id, Number(p.ws || 0), String(p.t || 'v'));
      return;
    }

    if (p.a === 'a:pm_tog') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const type = String(p.t || 'v');
      const key = String(p.k || '');

      const st = await pmGetState(ctx.from.id, wsId);
      const sel = type === 'v' ? st.v : st.f;
      const max = type === 'v' ? PM_LIMITS.verticals : PM_LIMITS.formats;

      const has = sel.includes(key);
      let next = has ? sel.filter(x => x !== key) : [...sel, key];

      if (!has && next.length > max) {
        await ctx.answerCallbackQuery({ text: `Лимит: максимум ${max}`, show_alert: true });
        await renderProfileMatchingPick(ctx, u.id, wsId, type);
        return;
      }

      next = Array.from(new Set(next));
      if (type === 'v') st.v = next;
      else st.f = next;

      await pmSetState(ctx.from.id, wsId, st);
      await renderProfileMatchingPick(ctx, u.id, wsId, type);
      return;
    }

    if (p.a === 'a:pm_run') {
      await ctx.answerCallbackQuery();
      await renderProfileMatchingResults(ctx, u.id, Number(p.ws || 0), Number(p.p || 0));
      return;
    }

    if (p.a === 'a:pm_view') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const target = Number(p.id || 0);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages
      if (!target) return;
      await renderWsPublicProfile(ctx, target, { backCb: `a:pm_run|ws:${wsId}|p:${page}` });
      return;
    }


if (p.a === 'a:match_home') {
      await ctx.answerCallbackQuery();
      await renderMatchingHome(ctx, Number(p.ws || 0));
      return;
    }

    if (p.a === 'a:match_buy') {
      const { accept } = await getPaymentsRuntimeFlags();
      if (!accept) {
        return ctx.answerCallbackQuery({ text: '💤 Платежи на паузе. Попробуй позже.', show_alert: true });
      }
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const tierId = String(p.tier || 'S').toUpperCase();
      const tier = MATCH_TIERS.find(t => t.id === tierId);
      if (!tier) return ctx.answerCallbackQuery({ text: 'Тариф не найден.' });

      const token = randomToken(10);
      await redis.set(
        k(['pay_match', token]),
        { tgId: ctx.from.id, userId: u.id, wsId, tierId: tier.id, stars: tier.stars, count: tier.count },
        { ex: 15 * 60 }
      );
      const payload = `match_${u.id}_${tier.id}_${token}`;
      await sendStarsInvoice(ctx, {
        title: `Smart Matching · ${tier.title}`,
        description: 'Подбор подходящих микро-каналов под твой бриф. После оплаты отправь бриф одним сообщением.',
        payload,
        amount: tier.stars,
        backCb: `a:match_home|ws:${wsId}`,
      });
      return;
    }

    if (p.a === 'a:feat_home') {
      await ctx.answerCallbackQuery();
      await renderFeaturedHome(ctx, u.id, Number(p.ws || 0));
      return;
    }

    if (p.a === 'a:feat_buy') {
      const { accept } = await getPaymentsRuntimeFlags();
      if (!accept) {
        return ctx.answerCallbackQuery({ text: '💤 Платежи на паузе. Попробуй позже.', show_alert: true });
      }
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const durId = String(p.dur || '1d');
      const d = FEATURED_DURATIONS.find(x => x.id === durId);
      if (!d) return ctx.answerCallbackQuery({ text: 'Тариф не найден.' });

      const token = randomToken(10);
      await redis.set(
        k(['pay_feat', token]),
        { tgId: ctx.from.id, userId: u.id, wsId, days: d.days, durId: d.id, stars: d.stars },
        { ex: 15 * 60 }
      );
      const payload = `feat_${u.id}_${d.days}_${token}`;
      await sendStarsInvoice(ctx, {
        title: `Featured · ${d.title}`,
        description: 'Твой блок появится сверху в ленте у всех (бренд + блогеры). После оплаты отправь контент.',
        payload,
        amount: d.stars,
        backCb: `a:feat_home|ws:${wsId}`,
      });
      return;
    }

    if (p.a === 'a:feat_view') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      await renderFeaturedView(ctx, u.id, wsId, Number(p.id), Number(p.p || 0), h);
      return;
    }

    if (p.a === 'a:feat_stop') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const id = Number(p.id);
      const ok = await db.stopFeaturedPlacement(id, u.id);
      if (!ok) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery({ text: 'Остановлено.' });
      await renderBxFeed(ctx, u.id, wsId, Number(p.p || 0), { h });
      return;
    }
    if (p.a === 'a:ws_pro_pin') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      const isPro = await db.isWorkspacePro(wsId);
      if (!isPro) return ctx.answerCallbackQuery({ text: 'Доступно только в PRO.' });
      const offers = await db.listMyBarterOffers(wsId);
      const kb = new InlineKeyboard();
      for (const o of offers.filter(x => x.status !== 'DELETED')) {
        kb.text(`#${o.id} ${String(o.title || '').slice(0, 30)}`, `a:ws_pro_pin_set|ws:${wsId}|o:${o.id}`).row();
      }
      kb.text('❌ Снять пин', `a:ws_pro_pin_clear|ws:${wsId}`).row();
      kb.text('⬅️ Назад', `a:ws_pro|ws:${wsId}`);
      await safeEditOrReply(ctx, '📌 Выбери оффер для пина в ленте (PRO):', { reply_markup: kb });
      return;
    }
    if (p.a === 'a:ws_pro_pin_set') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      const isPro = await db.isWorkspacePro(wsId);
      if (!isPro) return ctx.answerCallbackQuery({ text: 'Доступно только в PRO.' });
      await db.setWorkspacePinnedOffer(wsId, offerId);
      await db.auditWorkspace(wsId, u.id, 'ws.pro_pinned_offer', { offerId });
      await renderWsPro(ctx, u.id, wsId);
      return;
    }
    if (p.a === 'a:ws_pro_pin_clear') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await db.setWorkspacePinnedOffer(wsId, null);
      await db.auditWorkspace(wsId, u.id, 'ws.pro_pinned_offer', { offerId: null });
      await renderWsPro(ctx, u.id, wsId);
      return;
    }

    // Admin / Moderation
    if (p.a === 'a:admin') {
      // Backward-compat alias
      p.a = 'a:admin_home';
    }

    if (p.a === 'a:admin_home') {
      await ctx.answerCallbackQuery();
      const isAdmin = isSuperAdminTg(ctx.from.id);
      if (!isAdmin) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      await renderAdminHome(ctx);
      return;
    }

    if (p.a === 'a:admin_metrics') {
      await ctx.answerCallbackQuery();
      const isAdmin = isSuperAdminTg(ctx.from.id);
      if (!isAdmin) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      const days = Math.max(1, Math.min(90, Number(p.d) || 14));
      await renderAdminMetrics(ctx, days);
      return;
    }
    if (p.a === 'a:admin_mod_list') {
      await ctx.answerCallbackQuery();
      const isAdmin = isSuperAdminTg(ctx.from.id);
      if (!isAdmin) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await renderAdminModerators(ctx);
      return;
    }

    if (p.a === 'a:admin_mod_add') {
      const isAdmin = isSuperAdminTg(ctx.from.id);
      if (!isAdmin) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, '➕ Введи @username модератора (он должен иметь username).', { reply_markup: new InlineKeyboard().text('⬅️ Отмена', 'a:admin_home') });
      await setExpectText(ctx.from.id, { type: 'admin_add_mod_username' });
      return;
    }
    if (p.a === 'a:admin_mod_rm') {
      const isAdmin = isSuperAdminTg(ctx.from.id);
      if (!isAdmin) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery({ text: 'Удалено.' });
      await db.removeNetworkModerator(Number(p.uid));
      await renderAdminModerators(ctx);
      return;
    }

    // Admin: Payments toggles / ledger
    if (p.a === 'a:admin_pay_accept_toggle') {
      const isAdmin = isSuperAdminTg(ctx.from.id);
      if (!isAdmin) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery();
      const cur = await getSysBool(SYS_KEYS.pay_accept, CFG.PAYMENTS_ACCEPT_DEFAULT);
      await setSysBool(SYS_KEYS.pay_accept, !cur);
      await renderAdminHome(ctx);
      return;
    }
    if (p.a === 'a:admin_pay_auto_toggle') {
      const isAdmin = isSuperAdminTg(ctx.from.id);
      if (!isAdmin) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery();
      const cur = await getSysBool(SYS_KEYS.pay_auto_apply, CFG.PAYMENTS_AUTO_APPLY_DEFAULT);
      await setSysBool(SYS_KEYS.pay_auto_apply, !cur);
      await renderAdminHome(ctx);
      return;
    }
    if (p.a === 'a:admin_payments') {
      const isAdmin = isSuperAdminTg(ctx.from.id);
      if (!isAdmin) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery();
      await renderAdminPayments(ctx, String(p.st || 'ORPHANED'), Number(p.p || 0));
      return;
    }
    if (p.a === 'a:admin_pay_view') {
      const isAdmin = isSuperAdminTg(ctx.from.id);
      if (!isAdmin) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery();
      await renderAdminPaymentView(ctx, Number(p.id), String(p.st || 'ORPHANED'), Number(p.p || 0));
      return;
    }
    if (p.a === 'a:admin_pay_apply') {
      const isAdmin = isSuperAdminTg(ctx.from.id);
      if (!isAdmin) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery();
      await adminApplyPayment(ctx, u, Number(p.id), String(p.st || 'ORPHANED'), Number(p.p || 0));
      return;
    }

    if (p.a === 'a:mod_home') {
      await ctx.answerCallbackQuery();
      const isMod = await isModerator(u, ctx.from.id);
      if (!isMod) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await renderModHome(ctx);
      return;
    }
    if (p.a === 'a:mod_reports') {
      await ctx.answerCallbackQuery();
      const isMod = await isModerator(u, ctx.from.id);
      if (!isMod) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await renderModReports(ctx, Number(p.p || 0));
      return;
    }
    if (p.a === 'a:mod_report') {
      await ctx.answerCallbackQuery();
      const isMod = await isModerator(u, ctx.from.id);
      if (!isMod) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await renderModReportView(ctx, Number(p.r));
      return;
    }
    if (p.a === 'a:mod_r_freeze') {
      await ctx.answerCallbackQuery();
      const isMod = await isModerator(u, ctx.from.id);
      if (!isMod) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      const rid = Number(p.r);
      const rep = await db.getBarterReport(rid);
      if (rep && rep.offer_id) {
        await db.moderatorFreezeBarterOffer(rep.offer_id);
        await db.auditBarterOffer(rep.offer_id, u.id, 'offer.frozen', { reportId: rid });
      }
      await renderModReportView(ctx, rid);
      return;
    }
    if (p.a === 'a:mod_r_close') {
      await ctx.answerCallbackQuery();
      const isMod = await isModerator(u, ctx.from.id);
      if (!isMod) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      const rid = Number(p.r);
      const rep = await db.getBarterReport(rid);
      if (rep && rep.thread_id) {
        await db.moderatorCloseBarterThread(rep.thread_id);
        await db.auditBarterThread(rep.thread_id, u.id, 'thread.closed_by_mod', { reportId: rid });
      }
      await renderModReportView(ctx, rid);
      return;
    }
    if (p.a === 'a:mod_r_resolve') {
      await ctx.answerCallbackQuery();
      const isMod = await isModerator(u, ctx.from.id);
      if (!isMod) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      const rid = Number(p.r);
      await db.resolveBarterReport(rid, u.id);
      await renderModReportView(ctx, rid);
      return;
    }

    if (p.a === 'a:mod_verifs') {
      await ctx.answerCallbackQuery();
      const isMod = await isModerator(u, ctx.from.id);
      if (!isMod) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      if (!CFG.VERIFICATION_ENABLED) return ctx.answerCallbackQuery({ text: 'Функция отключена.' });
      await renderModVerifs(ctx, Number(p.p || 0));
      return;
    }
    if (p.a === 'a:mod_verif_view') {
      await ctx.answerCallbackQuery();
      const isMod = await isModerator(u, ctx.from.id);
      if (!isMod) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      if (!CFG.VERIFICATION_ENABLED) return ctx.answerCallbackQuery({ text: 'Функция отключена.' });
      await renderModVerifView(ctx, Number(p.uid), Number(p.p || 0));
      return;
    }
    if (p.a === 'a:mod_verif_approve') {
      await ctx.answerCallbackQuery({ text: '✅ Approved' });
      const isMod = await isModerator(u, ctx.from.id);
      if (!isMod) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      if (!CFG.VERIFICATION_ENABLED) return ctx.answerCallbackQuery({ text: 'Функция отключена.' });
      const targetUserId = Number(p.uid);
      await safeUserVerifications(() => db.setVerificationStatus(targetUserId, 'APPROVED', u.id, null), async () => null);
      try {
        await ctx.api.sendMessage(Number((await db.getUserById(targetUserId))?.tg_id), '✅ Ты верифицирован(а)! Теперь рядом с твоими офферами будет значок ✅.', { parse_mode: 'HTML' });
      } catch {}
      await renderModVerifView(ctx, targetUserId, Number(p.p || 0));
      return;
    }
    if (p.a === 'a:mod_verif_reject') {
      await ctx.answerCallbackQuery();
      const isMod = await isModerator(u, ctx.from.id);
      if (!isMod) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      if (!CFG.VERIFICATION_ENABLED) return ctx.answerCallbackQuery({ text: 'Функция отключена.' });
      const targetUserId = Number(p.uid);
      await setExpectText(ctx.from.id, { type: 'mod_verif_reject_reason', targetUserId, page: Number(p.p || 0) });
      await safeEditOrReply(ctx, '❌ Напиши причиной отказа одним сообщением (текст), и я отправлю пользователю.', { reply_markup: new InlineKeyboard().text('⬅️ Отмена', `a:mod_verif_view|uid:${targetUserId}|p:${Number(p.p || 0)}`) });
      return;
    }


    // Barters
    if (p.a === 'a:bx_home') {
      await ctx.answerCallbackQuery();
      const ws = await ensureWorkspaceForOwner(ctx, u.id);
      if (!ws) return;
      await renderBxOpen(ctx, u.id, ws.id);
      return;
    }

    if (p.a === 'a:bx_open') {
      const wsId = Number(p.ws);
      await ctx.answerCallbackQuery();
      if (wsId === 0) await setUiMode(ctx.from.id, UI_MODES.BRAND);
      if (wsId === 0) await maybeSendBanner(ctx, 'brand', CFG.BRAND_BANNER_FILE_ID);

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_open', 0);
      if (!bmRes) return;

      await renderBxOpen(ctx, bmRes.userId, wsId);
      return;
    }

    if (p.a === 'a:bx_enable_net') {
      const wsId = Number(p.ws);
      await renderNetConfirm(ctx, u.id, wsId, 'bx');
      return;
    }

    if (p.a === 'a:bx_smart') {
      await ctx.answerCallbackQuery();

      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const mode = await resolveUiMode(ctx.from.id);
      if (mode !== UI_MODES.BRAND) {
        await renderBxBrandOnlyNotice(ctx);
        return;
      }

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_smart', 0);
      if (!bmRes) return;

      const prof = await safeBrandProfiles(() => db.getBrandProfile(bmRes.userId), async () => null);
      const info = deriveBxSmartPrefillFromBrandProfile(prof);

      const next = await setBxFilterScoped(ctx.from.id, bmRes.userId, wsId, {
        category: null,
        offerType: info.offerType,
        compensationType: info.compensationType,
      });

      const totalAll = await db.countNetworkBarterOffers({ category: null, offerType: null, compensationType: null });
      const totalFiltered = await db.countNetworkBarterOffers({
        category: null,
        offerType: next.offerType,
        compensationType: next.compensationType,
      });

      await safeEditOrReply(ctx, 
        bxSmartPrefillText(next, info, totalAll, totalFiltered),
        { parse_mode: 'HTML', reply_markup: bxSmartKb(wsId, { h }) }
      );
      return;
    }

    if (p.a === 'a:bx_smart_reset') {
      await ctx.answerCallbackQuery();

      const wsId = Number(p.w || p.ws || 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const mode = await resolveUiMode(ctx.from.id);
      if (mode !== UI_MODES.BRAND) {
        await renderBxBrandOnlyNotice(ctx);
        return;
      }

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_feed', 0);
      if (!bmRes) return;

	      await setBxFilterScoped(ctx.from.id, bmRes.userId, wsId, { category: null, offerType: null, compensationType: null, goalsTags: [], reqTags: [] });
      await renderBxFeed(ctx, bmRes.userId, wsId, 0, { h });
      return;
    }

    if (p.a === 'a:bx_feed') {
      await ctx.answerCallbackQuery();

      const mode = await resolveUiMode(ctx.from.id);
      if (mode !== UI_MODES.BRAND) {
        await renderBxBrandOnlyNotice(ctx);
        return;
      }
      const wsId = Number(p.ws);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_feed', page);
      if (!bmRes) return;

      await renderBxFeed(ctx, bmRes.userId, wsId, page, { h });
      return;
    }

    if (p.a === 'a:bx_filters') {
      await ctx.answerCallbackQuery();

      const mode = await resolveUiMode(ctx.from.id);
      if (mode !== UI_MODES.BRAND) {
        await renderBxBrandOnlyNotice(ctx);
        return;
      }
      const wsId = Number(p.ws);

      // Return-to page (feed page). Support rp (new) and p (legacy).
      const retPage = Number(p.rp ?? p.p ?? 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const r = normBxRet(p.r, wsId ? BX_HOME.BX_OPEN : h);

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_filters', retPage, { h, r });
      if (!bmRes) return;

      await renderBxFilters(ctx, bmRes.userId, wsId, retPage, { h, r });
      return;
    }

	    if (p.a === 'a:bx_mpick') {
	      await ctx.answerCallbackQuery();

	      const mode = await resolveUiMode(ctx.from.id);
	      if (mode !== UI_MODES.BRAND) {
	        await renderBxBrandOnlyNotice(ctx);
	        return;
	      }
	      const wsId = Number(p.ws);
	      const page = Number(p.p || 0); // legacy: used as picker page in old messages
	      const key = normBxTagFilterKey(p.k);
      if (!key) {
        const kb = navKb('a:menu');
        await safeEditOrReply(ctx, '⚠️ <b>Эта кнопка устарела</b>\n\nОткрой «📋 Меню» → 📰 Лента креаторов → 🎛 Фильтры.', { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
        return;
      }

	      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const r = normBxRet(p.r, wsId ? BX_HOME.BX_OPEN : h);

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_filters', page, { h, r });
	      if (!bmRes) return;

	      await renderBxFilterMultiPick(ctx, bmRes.userId, wsId, key, page, { h, r });
	      return;
	    }

	    if (p.a === 'a:bx_mt') {
	      await ctx.answerCallbackQuery();

	      const mode = await resolveUiMode(ctx.from.id);
	      if (mode !== UI_MODES.BRAND) {
	        await renderBxBrandOnlyNotice(ctx);
	        return;
	      }
	      const wsId = Number(p.ws);
	      const page = Number(p.p || 0); // legacy: used as picker page in old messages
	      const key = normBxTagFilterKey(p.k);
      const v = String(p.v || '');
      if (!key) {
        const kb = navKb('a:menu');
        await safeEditOrReply(ctx, '⚠️ <b>Эта кнопка устарела</b>\n\nОткрой «📋 Меню» → 📰 Лента креаторов → 🎛 Фильтры.', { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
        return;
      }

	      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const r = normBxRet(p.r, wsId ? BX_HOME.BX_OPEN : h);

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_filters', page, { h, r });
	      if (!bmRes) return;

	      const cur = await getBxFilterScoped(ctx.from.id, bmRes.userId, wsId);
	      const field = key === 'goals' ? 'goalsTags' : 'reqTags';
	      const allowed = key === 'goals' ? BRAND_GOALS_KEYS : BRAND_REQ_KEYS;
	      if (!allowed.has(v)) {
	        await renderBxFilterMultiPick(ctx, bmRes.userId, wsId, key, page, { h, r });
	        return;
	      }

	      const set = new Set(Array.isArray(cur[field]) ? cur[field] : []);
	      if (set.has(v)) set.delete(v);
	      else set.add(v);

	      await setBxFilterScoped(ctx.from.id, bmRes.userId, wsId, { [field]: Array.from(set) });
	      await renderBxFilterMultiPick(ctx, bmRes.userId, wsId, key, page, { h, r });
	      return;
	    }

	    if (p.a === 'a:bx_mclear') {
	      await ctx.answerCallbackQuery();

	      const mode = await resolveUiMode(ctx.from.id);
	      if (mode !== UI_MODES.BRAND) {
	        await renderBxBrandOnlyNotice(ctx);
	        return;
	      }
	      const wsId = Number(p.ws);
	      const page = Number(p.p || 0); // legacy: used as picker page in old messages
	      const key = normBxTagFilterKey(p.k);
      if (!key) {
        const kb = navKb('a:menu');
        await safeEditOrReply(ctx, '⚠️ <b>Эта кнопка устарела</b>\n\nОткрой «📋 Меню» → 📰 Лента креаторов → 🎛 Фильтры.', { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
        return;
      }

	      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const r = normBxRet(p.r, wsId ? BX_HOME.BX_OPEN : h);

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_filters', page, { h, r });
	      if (!bmRes) return;

	      const field = key === 'goals' ? 'goalsTags' : 'reqTags';
	      await setBxFilterScoped(ctx.from.id, bmRes.userId, wsId, { [field]: [] });
	      await renderBxFilterMultiPick(ctx, bmRes.userId, wsId, key, page, { h, r });
	      return;
	    }

	    if (p.a === 'a:bx_mdone') {
	      await ctx.answerCallbackQuery();

	      const mode = await resolveUiMode(ctx.from.id);
	      if (mode !== UI_MODES.BRAND) {
	        await renderBxBrandOnlyNotice(ctx);
	        return;
	      }
	      const wsId = Number(p.ws);
	      const page = Number(p.p || 0); // legacy: used as picker page in old messages

	      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const r = normBxRet(p.r, wsId ? BX_HOME.BX_OPEN : h);

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_filters', page, { h, r });
	      if (!bmRes) return;

	      await renderBxFilters(ctx, bmRes.userId, wsId, page, { h, r });
	      return;
	    }

	    if (p.a === 'a:bx_fpick') {
	      await ctx.answerCallbackQuery();

	      const mode = await resolveUiMode(ctx.from.id);
	      if (mode !== UI_MODES.BRAND) {
	        await renderBxBrandOnlyNotice(ctx);
	        return;
	      }
	      const wsId = Number(p.ws);
	      const page = Number(p.p || 0); // legacy: used as picker page in old messages
	      const key = String(p.k || '');

	      const retPage = Number(p.rp ?? p.p ?? 0);
	      const pickPage = Number(p.pg ?? p.p ?? 0);

	      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const r = normBxRet(p.r, wsId ? BX_HOME.BX_OPEN : h);

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_filters', retPage, { h, r });
	      if (!bmRes) return;

	      // Open picker (do NOT change the filter here)
	      await renderBxFilterPick(ctx, bmRes.userId, wsId, key, retPage, pickPage, { h, r });
	      return;
	    }

    if (p.a === 'a:bx_fset') {
      await ctx.answerCallbackQuery();

      const mode = await resolveUiMode(ctx.from.id);
      if (mode !== UI_MODES.BRAND) {
        await renderBxBrandOnlyNotice(ctx);
        return;
      }
      const wsId = Number(p.ws);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages
      const keyRaw = String(p.k || '');
      const vRaw = p.v ? String(p.v) : null;

      const retPage = Number(p.rp ?? p.p ?? 0);
      const pickPage = Number(p.pg ?? p.p ?? 0);

      // UI uses short keys (cat/type/comp). Storage uses canonical keys.
      const key = keyRaw === 'cat'
        ? 'category'
        : (keyRaw === 'type' ? 'offerType' : (keyRaw === 'comp' ? 'compensationType' : keyRaw));
      const v = vRaw === 'all' ? null : vRaw;

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const r = normBxRet(p.r, wsId ? BX_HOME.BX_OPEN : h);

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_filters', retPage, { h, r });
      if (!bmRes) return;

      await setBxFilterScoped(ctx.from.id, bmRes.userId, wsId, { [key]: v });

      // UX: single-pick stays in picker; user exits via ✅ Готово / ⬅️ Назад / 📋 Меню
      const pickKey = keyRaw === 'category' ? 'cat' : (keyRaw === 'offerType' ? 'type' : (keyRaw === 'compensationType' ? 'comp' : keyRaw));
      await renderBxFilterPick(ctx, bmRes.userId, wsId, pickKey, retPage, pickPage, { h, r });
      return;
    }
    if (p.a === 'a:bx_freset') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);

      // Legacy: older messages used p as the only page param (we treat it as return-to page).
      const retPage = Number(p.rp ?? p.p ?? 0);

      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const r = normBxRet(p.r, wsId ? BX_HOME.BX_OPEN : h);

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_filters', retPage, { h, r });
      if (!bmRes) return;

      await setBxFilterScoped(ctx.from.id, bmRes.userId, wsId, { category: null, offerType: null, compensationType: null, goalsTags: [], reqTags: [] });
      await renderBxFilters(ctx, bmRes.userId, wsId, retPage, { h, r });
      return;
    }


    if (p.a === 'a:bx_pub') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      const offerId = Number(p.o);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      await renderBxPublicView(ctx, u.id, wsId, offerId, page, { h });
      return;
    }

    // Back-link helper: return to offer view (used by Brand Profile flow)
    if (p.a === 'a:offer_open') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      const offerId = Number(p.id || 0);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages
      if (!offerId) {
        await ctx.answerCallbackQuery({ text: 'Оффер не найден.', show_alert: true });
        return;
      }
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      await renderBxPublicView(ctx, u.id, wsId, offerId, page, { h });
      return;
    }



    if (p.a === 'a:off_manage') {
      await ctx.answerCallbackQuery();
      await renderOfficialManageView(ctx, u.id, Number(p.ws), Number(p.o), Number(p.p || 0), p.back || '');
      return;
    }

    if (p.a === 'a:off_req_home') {
      await ctx.answerCallbackQuery();
      await renderOfficialRequestHome(ctx, u.id, Number(p.ws), Number(p.o), Number(p.p || 0), p.back || '');
      return;
    }

    if (p.a === 'a:off_req') {
      await ctx.answerCallbackQuery();
      if (!CFG.OFFICIAL_PUBLISH_ENABLED) {
        await ctx.answerCallbackQuery({ text: 'Фича отключена.', show_alert: true });
        return;
      }
      const mode = String(CFG.OFFICIAL_PUBLISH_MODE || 'manual').toLowerCase();
      if (!(mode === 'manual' || mode === 'mixed')) {
        await ctx.answerCallbackQuery({ text: 'Очередь доступна только в manual/mixed.', show_alert: true });
        return;
      }

      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const days = Math.max(1, Math.min(365, Number(p.days || 0) || Number(CFG.OFFICIAL_MANUAL_DEFAULT_DAYS || 3)));

      const offer = await db.getBarterOfferPublic(offerId);
      if (!offer) {
        await ctx.answerCallbackQuery({ text: 'Оффер не найден.', show_alert: true });
        return;
      }

      const isOwner = Number(offer.owner_user_id) === Number(u.id);
      const isMod = await isModerator(u, ctx.from.id);
      if (!isOwner && !isMod) {
        await ctx.answerCallbackQuery({ text: 'Нет доступа.', show_alert: true });
        return;
      }

      const channelId = Number(CFG.OFFICIAL_CHANNEL_ID || 0);
      if (!channelId) {
        await ctx.answerCallbackQuery({ text: 'OFFICIAL_CHANNEL_ID не задан.', show_alert: true });
        return;
      }

      try {
        await safeOfficialPosts(
          () => db.upsertOfficialPostDraft({
            offerId,
            channelChatId: channelId,
            placementType: 'MANUAL',
            slotDays: days
          }),
          async () => null
        );

        // Notify super admins (deduped) so queue doesn't get lost.
        try {
          const fromTag = ctx.from?.username ? `@${ctx.from.username}` : `tg:${ctx.from?.id}`;
          await notifyOfficialQueueAdmins(ctx.api, {
            kind: 'manual',
            offerId,
            wsId,
            offerTitle: offer?.title || '',
            wsTitle: offer?.ws_title || '',
            channelUsername: offer?.channel_username || '',
            days,
            fromTag
          });
        } catch (_) { /* ignore */ }
      } catch (e) {
        await ctx.answerCallbackQuery({ text: `Ошибка: ${String(e?.message || e)}`.slice(0, 190), show_alert: true });
        return;
      }

      await ctx.answerCallbackQuery({ text: '✅ Заявка добавлена в очередь.', show_alert: false });
      await renderOfficialManageView(ctx, u.id, wsId, offerId, Number(p.p || 0), p.back || '');
      return;
    }

    if (p.a === 'a:off_req_cancel') {
      await ctx.answerCallbackQuery();
      if (!CFG.OFFICIAL_PUBLISH_ENABLED) {
        await ctx.answerCallbackQuery({ text: 'Фича отключена.', show_alert: true });
        return;
      }
      const wsId = Number(p.ws);
      const offerId = Number(p.o);

      const offer = await db.getBarterOfferPublic(offerId);
      if (!offer) {
        await ctx.answerCallbackQuery({ text: 'Оффер не найден.', show_alert: true });
        return;
      }

      const isOwner = Number(offer.owner_user_id) === Number(u.id);
      const isMod = await isModerator(u, ctx.from.id);
      if (!isOwner && !isMod) {
        await ctx.answerCallbackQuery({ text: 'Нет доступа.', show_alert: true });
        return;
      }

      try {
        await safeOfficialPosts(() => db.setOfficialPostStatus(offerId, 'REMOVED'), async () => null);
      } catch (e) {
        await ctx.answerCallbackQuery({ text: `Ошибка: ${String(e?.message || e)}`.slice(0, 190), show_alert: true });
        return;
      }

      await ctx.answerCallbackQuery({ text: '🗑 Заявка отменена.', show_alert: false });
      await renderOfficialManageView(ctx, u.id, wsId, offerId, Number(p.p || 0), p.back || '');
      return;
    }

    if (p.a === 'a:off_buy_home') {
      await ctx.answerCallbackQuery();
      await renderOfficialBuyHome(ctx, u.id, Number(p.ws), Number(p.o), Number(p.p || 0), p.back || '');
      return;
    }

    if (p.a === 'a:off_buy') {
      await ctx.answerCallbackQuery();
      if (!CFG.OFFICIAL_PUBLISH_ENABLED) {
        await ctx.answerCallbackQuery({ text: 'Фича отключена.', show_alert: true });
        return;
      }
      if (!['paid', 'mixed'].includes(CFG.OFFICIAL_PUBLISH_MODE)) {
        await ctx.answerCallbackQuery({ text: 'Покупка размещения выключена.', show_alert: true });
        return;
      }

      const pay = await getPaymentMode();
      if (!pay.accept) {
        await ctx.answerCallbackQuery({ text: 'Платежи временно отключены.', show_alert: true });
        return;
      }

      const offerId = Number(p.o);
      const wsId = Number(p.ws);
      const back = String(p.back || '').trim();
      const durId = String(p.dur || '').trim();
      const d = OFFICIAL_DURATIONS.find((x) => x.id === durId);
      if (!d) {
        await ctx.answerCallbackQuery({ text: 'Неверная длительность.', show_alert: true });
        return;
      }

      const offer = await db.getBarterOfferPublic(offerId);
      if (!offer) {
        await ctx.answerCallbackQuery({ text: 'Оффер не найден.', show_alert: true });
        return;
      }
      if (Number(offer.owner_user_id) !== Number(u.id)) {
        await ctx.answerCallbackQuery({ text: 'Покупать может только владелец Workspace.', show_alert: true });
        return;
      }

      const token = randomToken(16);
            await redis.set(
        k(['pay', 'offpub', token]),
        JSON.stringify({
          tgId: ctx.from.id,
          userId: u.id,
          offerId,
          days: d.days,
          stars: d.price,
          createdAt: Date.now()
        }),
        { ex: 60 * 60 }
      );

      const title = 'Размещение в официальном канале';
      const description = `${d.label} • оффер #${offerId}`;
      const okInv = await sendStarsInvoice(ctx, {
        title,
        description,
        payload: `offpub_${u.id}_${offerId}_${d.days}_${token}`,
        amount: d.price,
        backCb: `a:off_manage|ws:${wsId}|o:${offerId}|back:${back}`,
      });
      if (!okInv) return;

      await safeEditOrReply(ctx, 
        `💳 Счёт выставлен на **${d.price}⭐️**.

Оплати Stars — и оффер попадёт в очередь на публикацию в офиц.канале.\n\nПосле оплаты модератор нажмёт Apply и поставит пост в канал.`,
        {
          parse_mode: 'Markdown',
          reply_markup: new InlineKeyboard()
            .text('⬅️ Назад', `a:off_buy_home|ws:${wsId}|o:${offerId}|p:${Number(p.p || 0)}|back:${back}`)
            .row()
            .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home')
        }
      );
      return;
    }

    if (p.a === 'a:off_pub') {
      await ctx.answerCallbackQuery();
      if (!CFG.OFFICIAL_PUBLISH_ENABLED) {
        await ctx.answerCallbackQuery({ text: 'Фича отключена.', show_alert: true });
        return;
      }

      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const can = await isModerator(u, ctx.from.id);
      if (!can) {
        await ctx.answerCallbackQuery({ text: 'Нет прав.', show_alert: true });
        return;
      }

      const mode = String(CFG.OFFICIAL_PUBLISH_MODE || 'manual').toLowerCase();
      let placementType = 'MANUAL';
      let days = Number(CFG.OFFICIAL_MANUAL_DEFAULT_DAYS || 3);
      let paymentId = null;

      // Commit F: in paid mode allow publish ONLY for paid PENDING record (with payment_id)
      const post = await safeOfficialPosts(() => db.getOfficialPostByOfferId(offerId), async () => null);
      const postStatus = String(post?.status || '').toUpperCase();
      const isPaidPending = postStatus === 'PENDING' && !!post?.payment_id;

      if (mode === 'paid') {
        if (!isPaidPending) {
          await ctx.answerCallbackQuery({ text: 'Нет оплаченной заявки в очереди (PENDING).', show_alert: true });
          await renderOfficialManageView(ctx, u.id, wsId, offerId, Number(p.p || 0), p.back || '');
          return;
        }
        placementType = 'PAID';
        days = Math.max(1, Number(post?.slot_days || days));
        paymentId = Number(post.payment_id);
      } else if (mode === 'manual' || mode === 'mixed') {
        // In mixed mode we prefer paid placement if it exists
        if (isPaidPending) {
          placementType = 'PAID';
          days = Math.max(1, Number(post?.slot_days || days));
          paymentId = Number(post.payment_id);
        }
      } else {
        await ctx.answerCallbackQuery({ text: 'Публикация отключена этим режимом.', show_alert: true });
        return;
      }

      try {
        await publishOfferToOfficialChannel(ctx.api, offerId, {
          placementType,
          days,
          paymentId,
          publishedByUserId: u.id,
          keepExpiry: false,
        });
      } catch (e) {
        try {
          await db.setOfficialPostStatus(offerId, 'ERROR', { lastError: String(e?.message || e) });
        } catch (_) {}
        await ctx.answerCallbackQuery({ text: `Ошибка: ${String(e?.message || e)}`.slice(0, 190), show_alert: true });
      }
      await renderOfficialManageView(ctx, u.id, wsId, offerId, Number(p.p || 0), p.back || '');
      return;
    }

    if (p.a === 'a:off_upd') {
      await ctx.answerCallbackQuery();
      if (!CFG.OFFICIAL_PUBLISH_ENABLED) {
        await ctx.answerCallbackQuery({ text: 'Фича отключена.', show_alert: true });
        return;
      }
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const can = await isModerator(u, ctx.from.id);
      if (!can) {
        await ctx.answerCallbackQuery({ text: 'Нет прав.', show_alert: true });
        return;
      }
      try {
        await publishOfferToOfficialChannel(ctx.api, offerId, {
          placementType: 'UPDATE',
          keepExpiry: true,
          publishedByUserId: u.id
        });
      } catch (e) {
        try { await db.setOfficialPostStatus(offerId, 'ERROR', { lastError: String(e?.message || e) }); } catch (_) {}
        await ctx.answerCallbackQuery({ text: `Ошибка: ${String(e?.message || e)}`.slice(0, 190), show_alert: true });
      }
      await renderOfficialManageView(ctx, u.id, wsId, offerId, Number(p.p || 0), p.back || '');
      return;
    }

    if (p.a === 'a:off_rm') {
      await ctx.answerCallbackQuery();
      if (!CFG.OFFICIAL_PUBLISH_ENABLED) {
        await ctx.answerCallbackQuery({ text: 'Фича отключена.', show_alert: true });
        return;
      }
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const can = await isModerator(u, ctx.from.id);
      if (!can) {
        await ctx.answerCallbackQuery({ text: 'Нет прав.', show_alert: true });
        return;
      }
      try {
        await removeOfficialOfferPost(ctx.api, offerId, 'REMOVED');
      } catch (e) {
        try { await db.setOfficialPostStatus(offerId, 'ERROR', { lastError: String(e?.message || e) }); } catch (_) {}
        await ctx.answerCallbackQuery({ text: `Ошибка: ${String(e?.message || e)}`.slice(0, 190), show_alert: true });
      }
      await renderOfficialManageView(ctx, u.id, wsId, offerId, Number(p.p || 0), p.back || '');
      return;
    }

    if (p.a === 'a:off_queue') {
      await ctx.answerCallbackQuery();
      if (!CFG.OFFICIAL_PUBLISH_ENABLED) {
        await safeEditOrReply(ctx, 'Фича отключена.');
        return;
      }
      const can = await isModerator(u, ctx.from.id);
      if (!can) {
        await ctx.answerCallbackQuery({ text: 'Нет прав.', show_alert: true });
        return;
      }
      await renderOfficialQueue(ctx, u.id, Number(p.p || 0));
      return;
    }
    if (p.a === 'a:bx_report_offer') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      await safeEditOrReply(ctx, '🚩 Опиши проблему одним сообщением (почему жалоба).', {
        reply_markup: new InlineKeyboard().text('⬅️ Отмена', `a:bx_pub|ws:${wsId}|o:${offerId}|p:${page}|h:${h}`)
      });
      await setExpectText(ctx.from.id, { type: 'bx_report', kind: 'offer', wsId, offerId, page, h });
      return;
    }

    if (p.a === 'a:bx_report_thread') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const threadId = Number(p.t);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      await safeEditOrReply(ctx, '🚩 Опиши проблему одним сообщением (почему жалоба).', {
        reply_markup: new InlineKeyboard().text('⬅️ Отмена', `a:bx_thread|ws:${wsId}|t:${threadId}|p:${page}|h:${h}`)
      });
      await setExpectText(ctx.from.id, { type: 'bx_report', kind: 'thread', wsId, threadId, page, h });
      return;
    }
    if (p.a === 'a:bx_msg') {
      const wsId = Number(p.w || p.ws || 0);
      const offerId = Number(p.o || 0);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages

      // Home/return context (used by thread header/back)
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const r = normBxRet(p.r, wsId ? BX_HOME.BX_OPEN : h);

      // Brand Manager in Brand Mode (ws:0): act as selected brand (brandUserId)
      let actorUserId = u.id;
      let bm = { enabled: false };
      if (wsId === 0) {
        const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_msg', page, { h, r });
        if (!bmRes) return;
        actorUserId = bmRes.userId;
        bm = bmRes.bm || { enabled: false };
      }

      // Brand profile gate (Brand Mode): require 4-step basic profile before messaging creators
      if (wsId === 0 && CFG.BRAND_PROFILE_REQUIRED) {
        const prof = await safeBrandProfiles(() => db.getBrandProfile(actorUserId), async () => null);
        if (!isBrandBasicComplete(prof)) {
          if (bm.enabled) {
            try {
              await ctx.answerCallbackQuery({
                text: '⚠️ Профиль бренда не заполнен. Попроси владельца бренда заполнить 4 базовых поля (Название, Ниша, Контакт, Ссылка).',
                show_alert: true
              });
            } catch {}
            await renderBxPublicView(ctx, actorUserId, wsId, offerId, page, { h });
            return;
          }

          try {
            await ctx.answerCallbackQuery({
              text: '⚠️ Заполни профиль бренда (4 шага), чтобы писать креаторам.',
              show_alert: true
            });
          } catch {}
          await renderBrandProfileHome(ctx, actorUserId, { wsId, ret: 'offer', backOfferId: offerId, backPage: page, edit: true });
          return;
        }
      }

      if (CFG.RATE_LIMIT_ENABLED) {
        try {
          const rl = await rateLimit(
            k(['rl', 'intro', actorUserId]),
            { limit: CFG.INTRO_RATE_LIMIT, windowSec: CFG.INTRO_RATE_WINDOW_SEC }
          );
          if (!rl.allowed) {
            try {
              await ctx.answerCallbackQuery({
                text: `⏳ Слишком часто. Подожди ${fmtWait(rl.resetSec)} и попробуй снова.`,
                show_alert: true
              });
            } catch {}
            return;
          }
        } catch {}
      }

      try { await ctx.answerCallbackQuery(); } catch {}
      db.trackEvent('intro_attempt', {
        userId: actorUserId,
        wsId: wsId || null,
        meta: {
          offerId,
          brandMode: wsId === 0,
          ...(bm.enabled ? { actingManagerTgId: Number(u.tg_id || 0) || Number(ctx.from?.id || 0) } : {})
        }
      });

      // Pricing / limits (configurable)
      const cost = Math.max(1, Number(CFG.INTRO_COST_PER_INTRO || 1));
      const trialCredits = Math.max(0, Number(CFG.INTRO_TRIAL_CREDITS || 0));

      let isVerified = false;
      if (CFG.VERIFICATION_ENABLED) {
        const v = await safeUserVerifications(() => db.getUserVerification(actorUserId), async () => null);
        isVerified = String(v?.status || '').toUpperCase() === 'APPROVED';
      }
      const dailyLimit = Math.max(0, Number(isVerified ? CFG.INTRO_DAILY_LIMIT : CFG.INTRO_DAILY_LIMIT_UNVERIFIED));

      const res = await db.getOrCreateBarterThreadWithCredits(
        offerId,
        actorUserId,
        {
          ...(wsId === 0 ? { forceBrand: true } : {}),
          cost,
          trialCredits,
          dailyLimit: dailyLimit > 0 ? dailyLimit : null,
          retryEnabled: CFG.INTRO_RETRY_ENABLED
        }
      );

      if (!res) {
        return ctx.answerCallbackQuery({ text: 'Не получилось открыть диалог. Возможно оффер закрыт.' });
      }

      if (res.limitReached) {
        const lim = Number(res.dailyLimit || dailyLimit || 0);
        const used = Number(res.dailyUsed || 0);
        db.trackEvent('intro_blocked_daily_limit', { userId: actorUserId, wsId: wsId || null, meta: { offerId, lim, used } });
        try { await ctx.answerCallbackQuery({ text: `Лимит интро (новых диалогов) на сегодня: ${lim} (использовано: ${used}). Попробуй завтра.`, show_alert: true }); } catch {}
        return;
      }

      if (res.needPaywall) {
        db.trackEvent('paywall_shown', { userId: actorUserId, wsId: wsId || null, meta: { offerId, cost, balance: Number(res.balance ?? 0), usedToday: Number(res.dailyUsed ?? 0), dailyLimit: Number(res.dailyLimit ?? dailyLimit ?? 0) } });
        await renderBrandPaywall(ctx, actorUserId, wsId, offerId, page);
        return;
      }

      if (!res.ok || !res.thread) {
        return ctx.answerCallbackQuery({ text: 'Не получилось открыть диалог. Возможно оффер закрыт.' });
      }

      db.trackEvent('thread_opened', { userId: actorUserId, wsId: wsId || null, meta: { offerId, threadId: res.thread.id, charged: !!res.charged, chargedAmount: Number(res.chargedAmount || cost || 1) } });

      if (res.charged) {
        const left = Number(res.balance ?? 0);
        const amt = Number(res.chargedAmount || cost || 1);
        const bonus = res.trialGranted ? '🎁 Бонус активирован. ' : '';
        try { await ctx.answerCallbackQuery({ text: `${bonus}✅ Диалог открыт. -${amt} кредит(ов). Осталось: ${left}`, show_alert: true }); } catch {}
      }
      else if (res.retryUsed) {
        try { await ctx.answerCallbackQuery({ text: `🎟 Диалог открыт. Использован Retry credit.`, show_alert: true }); } catch {}
      }

      await renderBxThread(ctx, actorUserId, wsId, res.thread.id, { back: 'offer', offerId, page, h });
      return;
    }

    if (p.a === 'a:bx_inbox') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_inbox', page, { h });
      if (!bmRes) return;

      await renderBxInbox(ctx, bmRes.userId, wsId, page, { bm: bmRes.bm, h });
      return;
    }

    if (p.a === 'a:bx_thread') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const threadId = Number(p.t);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const back = p.b ? String(p.b) : 'inbox';
      const offerId = p.o ? Number(p.o) : null;

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_inbox', page, { h });
      if (!bmRes) return;

      await renderBxThread(ctx, bmRes.userId, wsId, threadId, { back, offerId, page, h });
      return;
    }


if (p.a === 'a:bx_retry_help') {
  const afterH = Number(CFG.INTRO_RETRY_AFTER_HOURS || 24);
  const expD = Number(CFG.INTRO_RETRY_EXPIRES_DAYS || 7);
  await ctx.answerCallbackQuery({
    show_alert: true,
    text: `Retry credit: если бренд написал, а ответа нет ${afterH}h → бот выдаёт 1 retry credit (действует ${expD}d). Следующий интро-диалог может открыться без списания Brand Pass.`
  });
  return;
}

    if (p.a === 'a:bx_proofs') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const threadId = Number(p.t);
      const back = p.b ? String(p.b) : 'inbox';
      const offerId = p.o ? Number(p.o) : null;
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_inbox', page, { h });
      if (!bmRes) return;

      await renderBxProofs(ctx, bmRes.userId, wsId, threadId, { back, offerId, page, h });
      return;
    }

    if (p.a === 'a:bx_proof_link') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const threadId = Number(p.t);
      const back = p.b ? String(p.b) : 'inbox';
      const offerId = p.o ? Number(p.o) : null;
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_inbox', page, { h });
      if (!bmRes) return;

      await safeEditOrReply(ctx, '🔗 Пришли ссылку на пост (пример: https://t.me/... )', {
        reply_markup: new InlineKeyboard().text('⬅️ Отмена', `a:bx_proofs|ws:${wsId}|t:${threadId}|p:${page}${offerId ? `|o:${offerId}` : ''}|b:${back}|h:${h}`)
      });
      await setExpectText(ctx.from.id, { type: 'bx_proof_link', wsId, threadId, back, offerId, page, h, asUserId: bmRes.userId });
      return;
    }

    if (p.a === 'a:bx_proof_photo') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const threadId = Number(p.t);
      const back = p.b ? String(p.b) : 'inbox';
      const offerId = p.o ? Number(p.o) : null;
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_inbox', page, { h });
      if (!bmRes) return;

      await safeEditOrReply(ctx, '🖼️ Пришли скриншот (как фото)', {
        reply_markup: new InlineKeyboard().text('⬅️ Отмена', `a:bx_proofs|ws:${wsId}|t:${threadId}|p:${page}${offerId ? `|o:${offerId}` : ''}|b:${back}|h:${h}`)
      });
      await setExpectText(ctx.from.id, { type: 'bx_proof_photo', wsId, threadId, back, offerId, page, h, asUserId: bmRes.userId });
      return;
    }

    if (p.a === 'a:bx_stage') {
      const wsId = Number(p.ws);
      const threadId = Number(p.t);
      const stage = String(p.s || '');
      const back = p.b ? String(p.b) : 'inbox';
      const offerId = p.o ? Number(p.o) : null;
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_inbox', page, { h });
      if (!bmRes) return;

      const stageOk = CRM_STAGES.some((s) => s.id === stage);
      const hasPlan = wsId === 0 ? await db.isBrandPlanActive(bmRes.userId) : true;
      if (!hasPlan) {
        await ctx.answerCallbackQuery({ text: '⛔ Нужен активный Brand Plan для стадий.' });
        return;
      }
      if (!stageOk) {
        await ctx.answerCallbackQuery({ text: 'Invalid stage' });
        return;
      }

      const updated = await db.setBarterThreadBuyerStage(threadId, bmRes.userId, stage);
      if (!updated) {
        await ctx.answerCallbackQuery({ text: 'Не удалось обновить стадию.' });
        return;
      }
      await ctx.answerCallbackQuery({ text: '✅ Обновлено' });
      await renderBxThread(ctx, bmRes.userId, wsId, threadId, { back, offerId, page, h });
      return;
    }

    if (p.a === 'a:bx_thread_triage') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const threadId = Number(p.t);
      const triage = String(p.s || 'open').toLowerCase();
      const back = p.b ? String(p.b) : 'inbox';
      const offerId = p.o ? Number(p.o) : null;
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const page = Number(p.p || 0);

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_inbox', page, { h });
      if (!bmRes) return;

      const okVal = ['open', 'in_progress', 'spam'].includes(triage);
      if (!okVal) {
        await ctx.answerCallbackQuery({ text: 'Invalid status' });
        return;
      }

      const updated = await db.setBarterThreadTriageStatus(threadId, bmRes.userId, triage);
      if (!updated) {
        // Likely: migration not applied yet (undefined_column)
        await ctx.answerCallbackQuery({ text: 'Не удалось обновить. Проверь миграцию.' });
      } else {
        await ctx.answerCallbackQuery({ text: '✅ Обновлено' });
      }
      await renderBxThread(ctx, bmRes.userId, wsId, threadId, { back, offerId, page, h });
      return;
    }

    if (p.a === 'a:bx_thread_reply') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.w || p.ws || 0);
      const threadId = Number(p.t);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const back = p.b ? String(p.b) : 'inbox';
      const offerId = p.o ? Number(p.o) : null;

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_inbox', page, { h });
      if (!bmRes) return;

      await safeEditOrReply(ctx, '✍️ Напиши сообщение покупателю:', {
        reply_markup: new InlineKeyboard().text('⬅️ Отмена', `a:bx_thread|ws:${wsId}|t:${threadId}|p:${page}${offerId ? `|o:${offerId}` : ''}|b:${back}|h:${h}`)
      });
      await setExpectText(ctx.from.id, { type: 'bx_thread_msg', wsId, threadId, back, offerId, page, h, asUserId: bmRes.userId });
      return;
    }

    if (p.a === 'a:bx_thread_close_q') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const threadId = Number(p.t);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);
      const back = p.b ? String(p.b) : 'inbox';
      const offerId = p.o ? Number(p.o) : null;
      const cbTail = `|p:${page}|b:${back}${offerId ? `|o:${offerId}` : ''}|h:${h}`;

      const kb = new InlineKeyboard()
        .text('✅ Закрыть', `a:bx_thread_close_do|ws:${wsId}|t:${threadId}${cbTail}`)
        .text('❌ Отмена', `a:bx_thread|ws:${wsId}|t:${threadId}${cbTail}`);
      await safeEditOrReply(ctx, 'Закрыть диалог? После закрытия писать нельзя.', { reply_markup: kb });
      return;
    }

    if (p.a === 'a:bx_thread_close_do') {
      await ctx.answerCallbackQuery();
      const wsId = Number(p.ws);
      const threadId = Number(p.t);
      const page = Number(p.p || 0); // legacy: used as picker page in old messages
      const h = await resolveBxHomeFromUi(ctx, wsId, p.h, wsId ? BX_HOME.BX_OPEN : BX_HOME.MENU);

      const bmRes = await bmResolveAssert(ctx, u, wsId, 'bx_inbox', page, { h });
      if (!bmRes) return;

      const ok = await db.closeBarterThread(threadId, bmRes.userId);
      if (!ok) {
        await ctx.answerCallbackQuery({ text: 'Не удалось закрыть тред.' });
        return;
      }
      await ctx.answerCallbackQuery({ text: '✅ Тред закрыт' });
      await renderBxInbox(ctx, bmRes.userId, wsId, page, { bm: bmRes.bm, h });
      return;
    }



    if (p.a === 'a:bx_pin_set') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      const isPro = await db.isWorkspacePro(wsId);
      if (!isPro) return ctx.answerCallbackQuery({ text: 'Доступно в PRO.' });
      await db.setWorkspacePinnedOffer(wsId, offerId);
      await db.auditWorkspace(wsId, u.id, 'ws.pro.pin_offer', { offerId });
      await ctx.answerCallbackQuery({ text: 'Закреплено.' });
      await renderBxView(ctx, u.id, wsId, offerId);
      return;
    }

    if (p.a === 'a:bx_pin_clear') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      const isPro = await db.isWorkspacePro(wsId);
      if (!isPro) return ctx.answerCallbackQuery({ text: 'Доступно в PRO.' });
      await db.setWorkspacePinnedOffer(wsId, null);
      await db.auditWorkspace(wsId, u.id, 'ws.pro.unpin_offer', { offerId });
      await ctx.answerCallbackQuery({ text: 'Пин снят.' });
      await renderBxView(ctx, u.id, wsId, offerId);
      return;
    }
    if (p.a === 'a:bx_bump') {
      const wsId = Number(p.w || p.ws || 0);
      const offerId = Number(p.o || p.id || 0);

      if (!wsId || !offerId) {
        await safeEditOrReply(
          ctx,
          '⚠️ Кнопка устарела. Открой «📦 Мои офферы» и попробуй ещё раз.',
          { reply_markup: navKb('a:bx_my') }
        );
        return;
      }

      // owner gate: bump allowed только владельцу канала (ws)
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) {
        await safeEditOrReply(ctx, '⚠️ Нет доступа. Поднимать оффер может только владелец канала.', { reply_markup: navKb(`a:bx_my|ws:${wsId}|p:0`) });
        return;
      }

      // Some legacy records may not match creatorUserId; allow bump if offer принадлежит этому ws.
      let o = await db.getBarterOfferForOwner(u.id, offerId);
      if (!o) {
        try { o = await db.getBarterOfferPublic(offerId); } catch {}
      }
      const oWs = Number(o?.workspace_id || o?.workspaceId || 0);
      if (!o || oWs !== wsId) {
        await safeEditOrReply(ctx, '⚠️ Оффер не найден или нет доступа.', { reply_markup: navKb(`a:bx_my|ws:${wsId}|p:0`) });
        return;
      }

      let isPro = false;
      try { isPro = await db.isWorkspacePro(wsId); } catch {}

      const cooldownHours = isPro ? CFG.BARTER_BUMP_COOLDOWN_HOURS_PRO : CFG.BARTER_BUMP_COOLDOWN_HOURS_FREE;
      const cooldownMs = cooldownHours * 3600 * 1000;
      const last = o.bump_at ? new Date(o.bump_at).getTime() : 0;
      const now = Date.now();

      if (last && (now - last) < cooldownMs) {
        const left = cooldownMs - (now - last);
        const h = Math.floor(left / 3600000);
        const mm = Math.floor((left % 3600000) / 60000);
        await safeEditOrReply(
          ctx,
          `⏳ Поднимать можно раз в <b>${cooldownHours}ч</b>.
Осталось: <b>${h}ч ${mm}м</b>.`,
          { parse_mode: 'HTML', reply_markup: navKb(`a:bx_view|ws:${wsId}|o:${offerId}|back:my|p:0`) }
        );
        return;
      }

      // give immediate visible feedback (anti-silent)
      await safeEditOrReply(ctx, '⬆️ Поднимаю оффер…', { reply_markup: navKb(`a:bx_view|ws:${wsId}|o:${offerId}|back:my|p:0`) });

      try {
        await db.bumpBarterOffer(offerId);
      } catch (e) {
        try { console.warn('[bx_bump] bump failed', { err: errInfo(e), wsId, offerId, uid: u.id }); } catch {}
        await safeEditOrReply(ctx, '⚠️ Не удалось поднять оффер. Попробуй ещё раз через «📦 Мои офферы».', { reply_markup: navKb(`a:bx_my|ws:${wsId}|p:0`) });
        return;
      }

      try {
        await db.auditBarterOffer(offerId, wsId, u.id, 'bx.offer_bumped', { cooldownHours, isPro });
      } catch (e) {
        try { console.warn('[bx_bump] audit failed', { err: errInfo(e), wsId, offerId, uid: u.id }); } catch {}
      }

      // Show результат так, чтобы было ВИДНО (перекидываем в список, где оффер уедет наверх)
      await renderBxMy(ctx, u.id, wsId, 0);
      return;
    }



    if (p.a === 'a:bx_my') {
      await ctx.answerCallbackQuery();
      await renderBxMy(ctx, u.id, Number(p.ws), Number(p.p || 0));
      return;
    }

    if (p.a === 'a:bx_my_arch') {
      await ctx.answerCallbackQuery();
      await renderBxMyArchive(ctx, u.id, Number(p.ws), Number(p.p || 0));
      return;
    }

    if (p.a === 'a:bx_new') {
      const wsId = Number(p.ws);
      db.trackEvent('bx_offer_new_open', { userId: u.id, wsId, meta: {} });
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      if (!ws.network_enabled) {
        await ctx.answerCallbackQuery();
        await renderBxOpen(ctx, u.id, wsId);
        return;
      }
      // PRO gating: active offers limit
      const isPro = await db.isWorkspacePro(wsId);
      const maxOffers = isPro ? CFG.BARTER_MAX_ACTIVE_OFFERS_PRO : CFG.BARTER_MAX_ACTIVE_OFFERS_FREE;
      const cntOffers = await db.countActiveBarterOffers(wsId);
      if (cntOffers >= maxOffers) {
        await safeEditOrReply(ctx, `⚠️ Достигнут лимит активных офферов: <b>${cntOffers}/${maxOffers}</b>.

Хочешь больше — включи ⭐️ PRO.`, {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard().text('⭐️ PRO', `a:ws_pro|ws:${wsId}`).row().text('⬅️ Назад', `a:bx_open|ws:${wsId}`)
        });
        return;
      }

      await ctx.answerCallbackQuery();
      await clearDraft(ctx.from.id);
      await safeEditOrReply(ctx, '➕ <b>Новый оффер</b>\n\nШаг 1/6: выбери тип:\n\n🎬 <b>UGC</b> — контент без аудитории (главное: вкус и качество)\n📣 <b>Интеграция</b> — публикация в TG/IG (нужна аудитория)', {
        parse_mode: 'HTML',
        reply_markup: bxKindKb(wsId)
      });
      await setDraft(ctx.from.id, { wsId });
      return;
    }

    
    if (p.a === 'a:bx_preset_home') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, 
        '🧩 <b>Шаблоны оффера</b>\n\nВыбери вариант — мы подготовим категорию/формат/оплату и перейдём к тегам (опционально), затем к тексту оффера.',
        { parse_mode: 'HTML', reply_markup: bxPresetKb(wsId) }
      );
      return;
    }

    
    if (p.a === 'a:bx_preset_apply') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      const presetId = String(p.id || '');
      const preset = BX_PRESETS.find((x) => x.id === presetId);
      if (!preset) return ctx.answerCallbackQuery({ text: 'Шаблон не найден.' });

      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);

      // Apply preset into draft and jump to Tags step (optional)
      const draft = (await getDraft(ctx.from.id)) || {};
      draft.wsId = wsId;
      draft.category = preset.category;
      draft.offer_type = preset.offer_type;
      draft.compensation_type = preset.compensation_type;
      draft.preset_id = presetId;
      if (!draft.offer_meta) draft.offer_meta = {};
      await setDraft(ctx.from.id, draft);

      await renderBxOfferTagsStep(ctx, wsId, { showParams: true, fromPreset: preset });
      return;
    }

    if (p.a === 'a:bx_params') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      await safeEditOrReply(ctx, 'Шаг 1/4: выбери категорию:', {
        parse_mode: 'HTML',
        reply_markup: bxCategoryKb(wsId)
      });
      return;
    }


    if (p.a === 'a:bx_kind') {
      const wsId = Number(p.ws);
      await ctx.answerCallbackQuery();
      const draft = (await getDraft(ctx.from.id)) || {};
      draft.wsId = wsId;
      draft.kind = String(p.k || 'ugc');
      await setDraft(ctx.from.id, draft);
      await safeEditOrReply(ctx, 'Шаг 2/6: выбери категорию:', {
        parse_mode: 'HTML',
        reply_markup: bxCategoryKb(wsId)
      });
      return;
    }

if (p.a === 'a:bx_cat') {
      const wsId = Number(p.ws);
      await ctx.answerCallbackQuery();
      const draft = (await getDraft(ctx.from.id)) || {};
      draft.wsId = wsId;
      draft.category = p.c;
      await setDraft(ctx.from.id, draft);
      await safeEditOrReply(ctx, 'Шаг 3/6: выбери формат сотрудничества:', {
        parse_mode: 'HTML',
        reply_markup: bxTypeKb(wsId)
      });
      return;
    }

    if (p.a === 'a:bx_type') {
      const wsId = Number(p.ws);
      await ctx.answerCallbackQuery();
      const draft = (await getDraft(ctx.from.id)) || {};
      draft.wsId = wsId;
      draft.offer_type = p.t;
      await setDraft(ctx.from.id, draft);
      await safeEditOrReply(ctx, 'Шаг 4/6: выбери тип оплаты:', {
        parse_mode: 'HTML',
        reply_markup: bxCompKb(wsId)
      });
      return;
    }

    
    if (p.a === 'a:bx_comp') {
      const wsId = Number(p.ws);
      await ctx.answerCallbackQuery();

      const draft = (await getDraft(ctx.from.id)) || {};
      draft.wsId = wsId;
      draft.compensation_type = p.p;
      if (!draft.offer_meta) draft.offer_meta = {};
      await setDraft(ctx.from.id, draft);

      await clearExpectText(ctx.from.id);
      await renderBxOfferDraftStep(ctx, wsId);
      return;
    }

    // Wizard: step 5 (text + optional tags)
    if (p.a === 'a:bx_w5') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      await renderBxOfferDraftStep(ctx, wsId);
      return;
    }

    // Wizard: step 6 (preview/publish)
    if (p.a === 'a:bx_w6') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);

      const draft = (await getDraft(ctx.from.id)) || {};
      const hasText = Boolean(String(draft.offer_title || '').trim() && String(draft.offer_desc || '').trim());
      if (!hasText) {
        try { await ctx.answerCallbackQuery({ text: 'Сначала введи текст оффера.', show_alert: true }); } catch {}
        await renderBxOfferDraftStep(ctx, wsId);
        return;
      }
      await renderBxOfferPreviewStep(ctx, wsId);
      return;
    }

    // Wizard: enter/edit offer text (expects a single text message)
    if (p.a === 'a:bx_wtext') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      await renderBxOfferTextInputStep(ctx, wsId, { backCb: `a:bx_w5|ws:${wsId}` });
      return;
    }

    // Wizard tags (optional)
    if (p.a === 'a:bx_wtags') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      await renderBxOfferWizTagsHome(ctx, wsId);
      return;
    }

    if (p.a === 'a:bx_wtagpick') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      const key = String(p.k || '');
      if (key !== 'goals' && key !== 'req') return ctx.answerCallbackQuery({ text: 'Неверный ключ.' });
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      await renderBxOfferWizTagsPicker(ctx, wsId, key);
      return;
    }

    if (p.a === 'a:bx_wtagt') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      const key = String(p.k || '');
      const val = String(p.v || '');
      if (key !== 'goals' && key !== 'req') return ctx.answerCallbackQuery({ text: 'Неверный ключ.' });

      const allow = key === 'goals' ? BRAND_GOALS_KEYS : BRAND_REQ_KEYS;
      if (!allow.has(val)) return ctx.answerCallbackQuery({ text: 'Неверный тег.' });

      await ctx.answerCallbackQuery();

      const draft = (await getDraft(ctx.from.id)) || {};
      draft.wsId = wsId;
      const meta = parseOfferMeta(draft.offer_meta || {});
      const cur = key === 'goals' ? meta.goals_tags : meta.req_tags;
      const set = new Set(cur);
      if (set.has(val)) set.delete(val); else set.add(val);
      if (key === 'goals') meta.goals_tags = Array.from(set);
      else meta.req_tags = Array.from(set);
      draft.offer_meta = meta;
      await setDraft(ctx.from.id, draft);

      await renderBxOfferWizTagsPicker(ctx, wsId, key);
      return;
    }

    if (p.a === 'a:bx_wtagclr') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      const key = String(p.k || '');
      if (key !== 'goals' && key !== 'req') return ctx.answerCallbackQuery({ text: 'Неверный ключ.' });
      await ctx.answerCallbackQuery();

      const draft = (await getDraft(ctx.from.id)) || {};
      draft.wsId = wsId;
      const meta = parseOfferMeta(draft.offer_meta || {});
      if (key === 'goals') meta.goals_tags = [];
      else meta.req_tags = [];
      draft.offer_meta = meta;
      await setDraft(ctx.from.id, draft);

      await renderBxOfferWizTagsPicker(ctx, wsId, key);
      return;
    }

    if (p.a === 'a:bx_wtagdone') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      await renderBxOfferWizTagsHome(ctx, wsId);
      return;
    }

    if (p.a === 'a:bx_comp_pick') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      await safeEditOrReply(ctx, 'Шаг 4/6: выбери тип оплаты:', {
        parse_mode: 'HTML',
        reply_markup: bxCompKb(wsId)
      });
      return;
    }

    if (p.a === 'a:bx_ottags') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      await renderBxOfferTagsStep(ctx, wsId);
      return;
    }

    if (p.a === 'a:bx_otpick') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      const key = String(p.k || '');
      if (key !== 'goals' && key !== 'req') return ctx.answerCallbackQuery({ text: 'Неверный ключ.' });

      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      await renderBxOfferTagsPicker(ctx, wsId, key);
      return;
    }

    if (p.a === 'a:bx_ott') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      const key = String(p.k || '');
      const val = String(p.v || '');
      if (key !== 'goals' && key !== 'req') return ctx.answerCallbackQuery({ text: 'Неверный ключ.' });

      const allow = key === 'goals' ? BRAND_GOALS_KEYS : BRAND_REQ_KEYS;
      if (!allow.has(val)) return ctx.answerCallbackQuery({ text: 'Неверный тег.' });

      await ctx.answerCallbackQuery();

      const draft = (await getDraft(ctx.from.id)) || {};
      draft.wsId = wsId;
      const meta = parseOfferMeta(draft.offer_meta || {});
      const cur = key === 'goals' ? meta.goals_tags : meta.req_tags;
      const set = new Set(cur);
      if (set.has(val)) set.delete(val); else set.add(val);

      if (key === 'goals') meta.goals_tags = Array.from(set);
      else meta.req_tags = Array.from(set);

      draft.offer_meta = meta;
      await setDraft(ctx.from.id, draft);

      await renderBxOfferTagsPicker(ctx, wsId, key);
      return;
    }

    if (p.a === 'a:bx_otclr') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      const key = String(p.k || '');
      if (key !== 'goals' && key !== 'req') return ctx.answerCallbackQuery({ text: 'Неверный ключ.' });

      await ctx.answerCallbackQuery();

      const draft = (await getDraft(ctx.from.id)) || {};
      draft.wsId = wsId;
      const meta = parseOfferMeta(draft.offer_meta || {});
      if (key === 'goals') meta.goals_tags = [];
      else meta.req_tags = [];
      draft.offer_meta = meta;
      await setDraft(ctx.from.id, draft);

      await renderBxOfferTagsPicker(ctx, wsId, key);
      return;
    }

    if (p.a === 'a:bx_otdone') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      await renderBxOfferTagsStep(ctx, wsId);
      return;
    }

    if (p.a === 'a:bx_otnext') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      await renderBxOfferTextInputStep(ctx, wsId, { backCb: `a:bx_ottags|ws:${wsId}` });
      return;
    }


if (p.a === 'a:bx_publish_hint') {
  const wsId = Number(p.ws);
  const ws = await db.getWorkspace(u.id, wsId);
  if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

  try { await ctx.answerCallbackQuery({ text: 'Сначала введи текст оффера (✍️), затем нажми ✅ Опубликовать.', show_alert: true }); } catch {}

  await clearExpectText(ctx.from.id);
  await renderBxOfferDraftStep(ctx, wsId);
  return;
}

    if (p.a === 'a:bx_otskip') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      await ctx.answerCallbackQuery();

      const draft = (await getDraft(ctx.from.id)) || {};
      draft.wsId = wsId;
      draft.offer_meta = {};
      await setDraft(ctx.from.id, draft);

      await clearExpectText(ctx.from.id);
      await renderBxOfferTextInputStep(ctx, wsId, { backCb: `a:bx_ottags|ws:${wsId}` });
      return;
    }

    // Publish offer from the current draft (used by the wizard preview step)
    if (p.a === 'a:bx_publish') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);

      const draft = (await getDraft(ctx.from.id)) || {};
      draft.wsId = wsId;

      const kind = String(draft.kind || 'ugc');
      const category = String(draft.category || '').trim();
      const offerType = String(draft.offer_type || '').trim();
      const comp = String(draft.compensation_type || '').trim();
      const title = String(draft.offer_title || '').trim();
      const description = String(draft.offer_desc || '').trim();
      let contact = String(draft.offer_contact || '').trim();

      if (!category || !offerType || !comp) {
        try { await ctx.answerCallbackQuery({ text: 'Черновик неполный — вернись назад и заверши шаги.', show_alert: true }); } catch {}
        await renderBxOfferDraftStep(ctx, wsId);
        return;
      }

      if (!title || title.length < 3 || !description || description.length < 10) {
        try { await ctx.answerCallbackQuery({ text: 'Нужно заполнить текст оффера (заголовок + детали).', show_alert: true }); } catch {}
        await renderBxOfferDraftStep(ctx, wsId);
        return;
      }

      if (!contact) {
        contact = extractFirstContact(`${title}\n${description}`) || '';
      }
      if (!contact) {
        try { await ctx.answerCallbackQuery({ text: 'Контакт обязателен (добавь @username).', show_alert: true }); } catch {}
        await renderBxOfferDraftStep(ctx, wsId);
        return;
      }

      const prefix = kind === 'integration' ? '📣 ' : '🎬 ';
      const realTitle = title.startsWith(prefix) ? title : `${prefix}${title}`;
      const fullDescription = /\bКонтакт\b/i.test(description) ? description : `${description}\n\nКонтакт: ${contact}`;

      // Structured meta tags (optional)
      const parsedOfferMeta = parseOfferMeta(draft.offer_meta || {});
      const offerMeta = {};
      if (Array.isArray(parsedOfferMeta.goals_tags) && parsedOfferMeta.goals_tags.length) offerMeta.goals_tags = parsedOfferMeta.goals_tags;
      if (Array.isArray(parsedOfferMeta.req_tags) && parsedOfferMeta.req_tags.length) offerMeta.req_tags = parsedOfferMeta.req_tags;

      try {
        const offer = await db.createBarterOffer({
          workspaceId: wsId,
          creatorUserId: u.id,
          category,
          offerType,
          compensationType: comp,
          meta: offerMeta,
          title: realTitle,
          description: fullDescription,
          contact,
        });

        try {
          await db.auditBarterOffer(offer.id, wsId, u.id, 'bx.offer_created', {
            category,
            offerType,
            compensationType: comp,
            kind: draft.kind || null,
          });
        } catch {}
        try { db.trackEvent('bx_offer_published', { userId: u.id, wsId, meta: { offerId: offer.id, category, offerType, compensationType: comp } }); } catch {}

        await clearDraft(ctx.from.id);

        const link = offerDeepLink(offer.id);
        const kb = new InlineKeyboard();
        kb.text('⬆️ Поднять', `a:bx_bump|ws:${wsId}|o:${offer.id}|p:0|back:my`).row();
        kb.text('🔎 Открыть', `a:bx_view|ws:${wsId}|o:${offer.id}|back:my|p:0`)
          .text('📦 Мои офферы', `a:bx_my|ws:${wsId}|p:0`).row();
        if (link) kb.url('🔗 Поделиться', link).row();
        kbNavRow(kb, `a:bx_my|ws:${wsId}|p:0`);

        await safeEditOrReply(ctx,
          `✅ <b>Оффер опубликован</b>\n\n<b>${escapeHtml(realTitle)}</b>\n\n${escapeHtml(truncateText(fullDescription, 550))}`,
          { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true },
          true
        );
        return;
      } catch (err) {
        console.error('[bx_publish] error', { wsId, err: { name: err?.name, message: err?.message } });
        try { await ctx.answerCallbackQuery({ text: 'Ошибка публикации. Попробуй ещё раз.', show_alert: true }); } catch {}
        await renderBxOfferPreviewStep(ctx, wsId);
        return;
      }
    }

    if (p.a === 'a:bx_view') {
      await ctx.answerCallbackQuery();
      await renderBxView(ctx, u.id, Number(p.ws), Number(p.o), p.back || 'feed', Number(p.p || 0));
      return;
    }


    if (p.a === 'a:bx_media_step') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const back = p.back || 'my';
      const page = Math.max(0, Number(p.p || 0));
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      await renderBxMediaStep(ctx, u.id, wsId, offerId, back, { edit: true, page });
      return;
    }

    if (p.a === 'a:bx_media_clear') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const back = p.back || 'my';
      const page = Math.max(0, Number(p.p || 0));
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);

      const o = await db.getBarterOfferForOwner(u.id, offerId);
      if (!o) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      await db.updateBarterOffer(offerId, { media_type: null, media_file_id: null });
      await ctx.answerCallbackQuery({ text: 'Убрано' });
      await renderBxMediaStep(ctx, u.id, wsId, offerId, back, { edit: true, page });
      return;
    }

    if (p.a === 'a:bx_media_photo') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const back = p.back || 'my';
      const page = Math.max(0, Number(p.p || 0));
      await ctx.answerCallbackQuery();
      await setExpectText(ctx.from.id, { type: 'bx_media_photo', wsId, offerId, back, page });

      const kb = navKb(`a:bx_media_step|ws:${wsId}|o:${offerId}|back:${back}|p:${page}`);
      await safeEditOrReply(ctx, '🖼 Пришли <b>картинку</b> одним сообщением.', { parse_mode: 'HTML', reply_markup: kb });
      return;
    }

    if (p.a === 'a:bx_media_gif') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const back = p.back || 'my';
      const page = Math.max(0, Number(p.p || 0));
      await ctx.answerCallbackQuery();
      await setExpectText(ctx.from.id, { type: 'bx_media_gif', wsId, offerId, back, page });

      const kb = navKb(`a:bx_media_step|ws:${wsId}|o:${offerId}|back:${back}|p:${page}`);
      await safeEditOrReply(ctx, '🎞 Пришли <b>GIF</b> (анимацию) одним сообщением.\n\n(Можно отправить как анимацию или как файл .gif)', { parse_mode: 'HTML', reply_markup: kb });
      return;
    }

    if (p.a === 'a:bx_media_video') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const back = p.back || 'my';
      const page = Math.max(0, Number(p.p || 0));
      await ctx.answerCallbackQuery();
      await setExpectText(ctx.from.id, { type: 'bx_media_video', wsId, offerId, back, page });

      const kb = navKb(`a:bx_media_step|ws:${wsId}|o:${offerId}|back:${back}|p:${page}`);
      await safeEditOrReply(ctx, '🎥 Пришли <b>видео</b> одним сообщением.\n\n(Поддержка: mp4. Можно отправить как видео или как файл.)', { parse_mode: 'HTML', reply_markup: kb });
      return;
    }

    if (p.a === 'a:bx_media_preview') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const back = p.back || 'my';
      const page = Math.max(0, Number(p.p || 0));
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      await sendBxPreview(ctx, u.id, wsId, offerId, back, page);
      return;
    }

    if (p.a === 'a:bx_pause') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const o = await db.getBarterOfferForOwner(u.id, offerId);
      if (!o) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await db.updateBarterOfferStatus(offerId, 'PAUSED');
      await db.auditBarterOffer(offerId, wsId, u.id, 'bx.offer_paused', {});
      await ctx.answerCallbackQuery();
      await renderBxView(ctx, u.id, wsId, offerId, 'my');
      return;
    }

    if (p.a === 'a:bx_resume') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const o = await db.getBarterOfferForOwner(u.id, offerId);
      if (!o) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await db.updateBarterOfferStatus(offerId, 'ACTIVE');
      await db.auditBarterOffer(offerId, wsId, u.id, 'bx.offer_resumed', {});
      await ctx.answerCallbackQuery();
      await renderBxView(ctx, u.id, wsId, offerId, 'my');
      return;
    }

    // One-tap archive from list (soft delete). Hides immediately from "Мои офферы".
    if (p.a === 'a:bx_archive') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const page = Math.max(0, Number(p.p || 0));
      const o = await db.getBarterOfferForOwner(u.id, offerId);
      if (!o) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await db.updateBarterOfferStatus(offerId, 'CLOSED');
      await db.auditBarterOffer(offerId, wsId, u.id, 'bx.offer_archived', {});
      await ctx.answerCallbackQuery({ text: 'Архивировано.' });
      await renderBxMy(ctx, u.id, wsId, page);
      return;
    }

    if (p.a === 'a:bx_restore') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const page = Math.max(0, Number(p.p || 0));

      const restored = await db.restoreBarterOfferForOwner(offerId, u.id);
      if (!restored) {
        await ctx.answerCallbackQuery({ text: 'Не найдено / нет доступа.' });
        await renderBxMyArchive(ctx, u.id, wsId, page);
        return;
      }
      await db.auditBarterOffer(offerId, wsId, u.id, 'bx.offer_restored', {});
      await ctx.answerCallbackQuery({ text: 'Восстановлено.' });
      await renderBxMy(ctx, u.id, wsId, 0);
      return;
    }

    if (p.a === 'a:bx_del_q') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const page = Math.max(0, Number(p.p || 0));
      const o = await db.getBarterOfferForOwner(u.id, offerId);
      if (!o) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      const kb = new InlineKeyboard()
        .text('✅ Архивировать', `a:bx_del_do|ws:${wsId}|o:${offerId}|p:${page}`)
        .text('❌ Отмена', `a:bx_view|ws:${wsId}|o:${offerId}|back:my|p:${page}`);
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, `Архивировать оффер <b>#${offerId}</b>?

Он исчезнет из списка, но останется в базе для истории.`, { parse_mode: 'HTML', reply_markup: kb });
      return;
    }

    if (p.a === 'a:bx_del_do') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const page = Math.max(0, Number(p.p || 0));
      const o = await db.getBarterOfferForOwner(u.id, offerId);
      if (!o) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await db.updateBarterOfferStatus(offerId, 'CLOSED');
      await db.auditBarterOffer(offerId, wsId, u.id, 'bx.offer_archived', {});
      await ctx.answerCallbackQuery({ text: 'Архивировано.' });
      await renderBxMy(ctx, u.id, wsId, page);
      return;
    }

    if (p.a === 'a:net_q') {
      const wsId = Number(p.ws);
      const ret = String(p.ret || 'ws');
      await renderNetConfirm(ctx, u.id, wsId, ret);
      return;
    }

    if (p.a === 'a:net_set') {
      const wsId = Number(p.ws);
      const enabled = String(p.v) === '1';
      const ret = String(p.ret || 'ws') === 'bx' ? 'bx' : 'ws';
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      await db.setWorkspaceSetting(wsId, { network_enabled: enabled });
      await db.auditWorkspace(wsId, u.id, 'ws.network_toggled', { enabled, source: ret });
      await ctx.answerCallbackQuery({ text: enabled ? '✅ Сеть включена' : '❌ Сеть выключена' });
      if (ret === 'bx') {
        await renderBxOpen(ctx, u.id, wsId);
      } else {
        await renderWsSettings(ctx, u.id, wsId);
      }
      return;
    }

    // Backward compat: old toggle callback (messages already sent)
    if (p.a === 'a:ws_toggle_net') {
      const wsId = Number(p.ws);
      await renderNetConfirm(ctx, u.id, wsId, 'ws');
      return;
    }

    if (p.a === 'a:ws_toggle_cur') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await db.setWorkspaceSetting(wsId, { curator_enabled: !ws.curator_enabled });
      await db.auditWorkspace(wsId, u.id, 'ws.curator_toggled', { enabled: !ws.curator_enabled });
      const ret = String(p.ret || 'ws');
      if (ret === 'cur_manage') {
        await renderCuratorManage(ctx, u.id, wsId);
      } else {
        await renderWsSettings(ctx, u.id, wsId);
      }
      return;
    }

	// Curators
	if (p.a === 'a:cur_manage') {
	  const wsId = Number(p.ws);
	  await ctx.answerCallbackQuery();
	  await renderCuratorManage(ctx, u.id, wsId);
	  return;
	}

    if (p.a === 'a:cur_invite') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      const token = randomToken(8);
      const key = k(['cur_invite', wsId, token]);
      await redis.set(key, { ownerUserId: u.id }, { ex: 10 * 60 });

      const link = `https://t.me/${CFG.BOT_USERNAME}?start=cur_${wsId}_${token}`;
      const text = `👤 <b>Приглашение куратора</b>\n\nСсылка (одноразовая • 10 минут):\n${escapeHtml(link)}\n\nНажми “Поделиться” и отправь приглашение нужному человеку.`;

      const shareText = `Приглашение куратора (одноразовая, 10 минут).\nОткрой ссылку: ${link}`;
      const shareUrl = `https://t.me/share/url?url=&text=${encodeURIComponent(shareText)}`;
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: new InlineKeyboard()
          .url('📤 Поделиться', shareUrl)
          .row()
          .text('⬅️ Назад', `a:cur_manage|ws:${wsId}`)
      });
      return;
    }

    if (p.a === 'a:cur_add_username') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, '➕ Введи @username куратора (он должен уже запускать бота /start).', {
        reply_markup: new InlineKeyboard()
          .text('⬅️ Назад', `a:cur_manage|ws:${wsId}`)
          .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home')
      });
      await setExpectText(ctx.from.id, { type: 'curator_username', wsId });
      return;
    }

    if (p.a === 'a:cur_list') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      const curators = await db.listCurators(wsId);
      const lines = curators.map(c => `• ${c.tg_username ? '@' + escapeHtml(c.tg_username) : 'id:' + c.tg_id}`);
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, `👥 <b>Кураторы канала</b>

Нажми на 🗑 рядом с именем, чтобы удалить.

${lines.length ? lines.join('\n') : 'Пока нет.'}`, {
        parse_mode: 'HTML',
        reply_markup: curListKb(wsId, curators)
      });
      return;
    }

    if (p.a === 'a:cur_rm_q') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      const curatorUserId = Number(p.u);
      const info = await db.getUserTgIdByUserId(curatorUserId);
      const label = info?.tg_username ? '@' + info.tg_username : 'id:' + (info?.tg_id || curatorUserId);
      const kb = new InlineKeyboard()
        .text('✅ Удалить', `a:cur_rm_do|ws:${wsId}|u:${curatorUserId}`)
        .text('❌ Отмена', `a:cur_list|ws:${wsId}`);
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, `Удалить куратора <b>${escapeHtml(label)}</b>?`, { parse_mode: 'HTML', reply_markup: kb });
      return;
    }

    if (p.a === 'a:cur_rm_do') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      const curatorUserId = Number(p.u);
      await db.removeCurator(wsId, curatorUserId);
      await db.auditWorkspace(wsId, u.id, 'ws.curator_removed', { curatorUserId });

      // best-effort notify curator in DM
      try {
        const info = await db.getUserTgIdByUserId(curatorUserId);
        if (info?.tg_id) {
          const wsTitle = wsLabelNice(ws);
          const kb = new InlineKeyboard()
            .text('🏠 Главное меню', 'a:menu')
            .row()
            .text('💬 Support', 'a:support');
          await ctx.api.sendMessage(
            Number(info.tg_id),
            `❌ Твоя роль <b>куратора</b> для: <b>${escapeHtml(wsTitle)}</b> была удалена владельцем.`,
            { parse_mode: 'HTML', reply_markup: kb }
          );
        }
      } catch {}

      await ctx.answerCallbackQuery({ text: 'Удалено' });
      // refresh list
      const curators = await db.listCurators(wsId);
      const lines = curators.map(c => `• ${c.tg_username ? '@' + escapeHtml(c.tg_username) : 'id:' + c.tg_id}`);
      await safeEditOrReply(ctx, `👥 <b>Кураторы канала</b>

Нажми на 🗑 рядом с именем, чтобы удалить.

${lines.length ? lines.join('\n') : 'Пока нет.'}`, {
        parse_mode: 'HTML',
        reply_markup: curListKb(wsId, curators)
      });
      return;
    }



    // FOLDERS (workspace shared @channel lists)
    if (p.a === 'a:folders_my') {
      await ctx.answerCallbackQuery();
      await renderFoldersMy(ctx, u.id);
      return;
    }

    if (p.a === 'a:folders_home') {
      await ctx.answerCallbackQuery();
      await renderFoldersHome(ctx, u.id, Number(p.ws));
      return;
    }

    if (p.a === 'a:folder_open') {
      await ctx.answerCallbackQuery();
      await renderFolderView(ctx, u.id, Number(p.ws), Number(p.f));
      return;
    }

    if (p.a === 'a:folder_new') {
      const wsId = Number(p.ws);
      const access = await getFolderAccess(u.id, wsId);
      if (!access || !access.canEdit) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, '➕ <b>Новая папка</b>\n\nВведи название папки:', {
        parse_mode: 'HTML',
        reply_markup: navKb(`a:folders_home|ws:${wsId}`)
      });
      await setExpectText(ctx.from.id, { type: 'folder_create_title', wsId });
      return;
    }

    if (p.a === 'a:folder_add') {
      const wsId = Number(p.ws);
      const folderId = Number(p.f);
      const access = await getFolderAccess(u.id, wsId);
      if (!access || !access.canEdit) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      const isPro = await db.isWorkspacePro(wsId);
      const max = isPro ? CFG.WORKSPACE_FOLDER_MAX_ITEMS_PRO : CFG.WORKSPACE_FOLDER_MAX_ITEMS_FREE;
      const folder = await db.getChannelFolder(folderId);
      const cnt = Number(folder?.items_count || 0);
      const left = Math.max(0, max - cnt);

      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, `➕ Добавь @каналы (или ссылки t.me) списком — каждый с новой строки.\n\nСвободно мест: <b>${left}</b> из <b>${max}</b>.`, {
        parse_mode: 'HTML',
        reply_markup: navKb(`a:folder_open|ws:${wsId}|f:${folderId}`)
      });
      await setExpectText(ctx.from.id, { type: 'folder_add_items', wsId, folderId });
      return;
    }

    if (p.a === 'a:folder_remove') {
      const wsId = Number(p.ws);
      const folderId = Number(p.f);
      const access = await getFolderAccess(u.id, wsId);
      if (!access || !access.canEdit) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, '➖ Укажи @каналы (или ссылки t.me) списком — удалю их из папки:', {
        reply_markup: navKb(`a:folder_open|ws:${wsId}|f:${folderId}`)
      });
      await setExpectText(ctx.from.id, { type: 'folder_remove_items', wsId, folderId });
      return;
    }

    if (p.a === 'a:folder_rename') {
      const wsId = Number(p.ws);
      const folderId = Number(p.f);
      const access = await getFolderAccess(u.id, wsId);
      if (!access || !access.canEdit) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, '✏️ Введи новое название папки:', {
        reply_markup: navKb(`a:folder_open|ws:${wsId}|f:${folderId}`)
      });
      await setExpectText(ctx.from.id, { type: 'folder_rename_title', wsId, folderId });
      return;
    }

    if (p.a === 'a:folder_clear_q') {
      const wsId = Number(p.ws);
      const folderId = Number(p.f);
      const access = await getFolderAccess(u.id, wsId);
      if (!access || !access.canEdit) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      const kb = new InlineKeyboard()
        .text('✅ Очистить', `a:folder_clear_do|ws:${wsId}|f:${folderId}`)
        .text('❌ Отмена', `a:folder_open|ws:${wsId}|f:${folderId}`);
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, 'Очистить папку (удалить все каналы)?', { reply_markup: kb });
      return;
    }

    if (p.a === 'a:folder_clear_do') {
      const wsId = Number(p.ws);
      const folderId = Number(p.f);
      const access = await getFolderAccess(u.id, wsId);
      if (!access || !access.canEdit) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await db.clearChannelFolder(folderId);
      await db.auditWorkspace(wsId, u.id, 'folders.cleared', { folderId });
      await ctx.answerCallbackQuery({ text: 'Очищено.' });
      await renderFolderView(ctx, u.id, wsId, folderId);
      return;
    }

    if (p.a === 'a:folder_delete_q') {
      const wsId = Number(p.ws);
      const folderId = Number(p.f);
      const access = await getFolderAccess(u.id, wsId);
      if (!access || !access.isOwner) return ctx.answerCallbackQuery({ text: 'Только owner.' });
      const kb = new InlineKeyboard()
        .text('🗑 Удалить', `a:folder_delete_do|ws:${wsId}|f:${folderId}`)
        .text('❌ Отмена', `a:folder_open|ws:${wsId}|f:${folderId}`);
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, 'Удалить папку полностью?', { reply_markup: kb });
      return;
    }

    if (p.a === 'a:folder_delete_do') {
      const wsId = Number(p.ws);
      const folderId = Number(p.f);
      const access = await getFolderAccess(u.id, wsId);
      if (!access || !access.isOwner) return ctx.answerCallbackQuery({ text: 'Только owner.' });
      await db.deleteChannelFolder(folderId);
      await db.auditWorkspace(wsId, u.id, 'folders.deleted', { folderId });
      await ctx.answerCallbackQuery({ text: 'Удалено.' });
      await renderFoldersHome(ctx, u.id, wsId);
      return;
    }

    if (p.a === 'a:folder_export') {
      const wsId = Number(p.ws);
      const folderId = Number(p.f);
      const access = await getFolderAccess(u.id, wsId);
      if (!access) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      const folder = await db.getChannelFolder(folderId);
      if (!folder || Number(folder.workspace_id) !== Number(wsId)) return ctx.answerCallbackQuery({ text: 'Папка не найдена.' });
      const items = await db.listChannelFolderItems(folderId);
      const lines = items.map(i => i.channel_username);
      const head = `📁 ${folder.title}\n`;
      const payload = head + (lines.length ? lines.join('\n') : '(пусто)');
      await ctx.answerCallbackQuery({ text: 'Отправил списком.' });

      // chunk to avoid Telegram limit
      const maxLen = 3500;
      let buf = '';
      for (const line of payload.split('\n')) {
        if ((buf + line + '\n').length > maxLen) {
          await ctx.reply(buf);
          buf = '';
        }
        buf += line + '\n';
      }
      if (buf.trim()) await ctx.reply(buf.trim());
      return;
    }

    // Workspace editors (folder-only)
    if (p.a === 'a:ws_editors') {
      await ctx.answerCallbackQuery();
      await renderWsEditors(ctx, u.id, Number(p.ws));
      return;
    }

    if (p.a === 'a:ws_editor_invite') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      const token = randomToken(8);
      const key = k(['ws_editor_invite', wsId, token]);
      await redis.set(key, { ownerUserId: u.id }, { ex: Number(CFG.WORKSPACE_EDITOR_INVITE_TTL_MIN || 10) * 60 });

      const link = `https://t.me/${CFG.BOT_USERNAME}?start=fed_${wsId}_${token}`;
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, `👥 <b>Invite editor</b>\n\nСсылка на ${CFG.WORKSPACE_EDITOR_INVITE_TTL_MIN || 10} минут:\n${escapeHtml(link)}\n\nРедактор сможет управлять папками этого Workspace.`, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: navKb(`a:ws_editors|ws:${wsId}`)
      });
      return;
    }

    if (p.a === 'a:ws_editor_add_username') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, '➕ Введи @username редактора (он должен уже запускать бота /start).', {
        reply_markup: navKb(`a:ws_editors|ws:${wsId}`)
      });
      await setExpectText(ctx.from.id, { type: 'ws_editor_username', wsId });
      return;
    }

    if (p.a === 'a:ws_editor_rm_q') {
      const wsId = Number(p.ws);
      const targetUserId = Number(p.u);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      const kb = new InlineKeyboard()
        .text('✅ Удалить', `a:ws_editor_rm_do|ws:${wsId}|u:${targetUserId}`)
        .text('❌ Отмена', `a:ws_editors|ws:${wsId}`);
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, 'Удалить редактора?', { reply_markup: kb });
      return;
    }

    if (p.a === 'a:ws_editor_rm_do') {
      const wsId = Number(p.ws);
      const targetUserId = Number(p.u);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await db.removeWorkspaceEditor(wsId, targetUserId);
      await db.auditWorkspace(wsId, u.id, 'ws.editor_removed', { userId: targetUserId });
      await ctx.answerCallbackQuery({ text: 'Удалено.' });
      await renderWsEditors(ctx, u.id, wsId);
      return;
    }

    // Barter: attach partner folder to offer
    if (p.a === 'a:bx_partner_folder_pick') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const o = await db.getBarterOfferForOwner(u.id, offerId);
      if (!o) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      const folders = await db.listChannelFolders(wsId);
      const kb = new InlineKeyboard();
      for (const f of folders.slice(0, 20)) {
        kb.text(`📁 ${String(f.title).slice(0, 32)} (${Number(f.items_count || 0)})`, `a:bx_partner_folder_set|ws:${wsId}|o:${offerId}|f:${f.id}`).row();
      }
      kb.text('⏭ Без папки', `a:bx_partner_folder_clear|ws:${wsId}|o:${offerId}`).row();
      kb.text('⬅️ Назад', `a:bx_view|ws:${wsId}|o:${offerId}|back:my`);

      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, '📁 Выбери папку совместных каналов (она будет показываться в оффере):', { reply_markup: kb });
      return;
    }

    if (p.a === 'a:bx_partner_folder_set') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const folderId = Number(p.f);
      const o = await db.getBarterOfferForOwner(u.id, offerId);
      if (!o) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      const folder = await db.getChannelFolder(folderId);
      if (!folder || Number(folder.workspace_id) !== Number(wsId)) return ctx.answerCallbackQuery({ text: 'Папка не найдена.' });

      await db.updateBarterOffer(offerId, { partner_folder_id: folderId });
      await db.auditBarterOffer(offerId, wsId, u.id, 'bx.partner_folder_set', { folderId });
      await ctx.answerCallbackQuery({ text: 'Готово.' });
      await renderBxView(ctx, u.id, wsId, offerId, 'my');
      return;
    }

    if (p.a === 'a:bx_partner_folder_clear') {
      const wsId = Number(p.ws);
      const offerId = Number(p.o);
      const o = await db.getBarterOfferForOwner(u.id, offerId);
      if (!o) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      await db.updateBarterOffer(offerId, { partner_folder_id: null });
      await db.auditBarterOffer(offerId, wsId, u.id, 'bx.partner_folder_cleared', {});
      await ctx.answerCallbackQuery({ text: 'Ок.' });
      await renderBxView(ctx, u.id, wsId, offerId, 'my');
      return;
    }

    
    // Giveaways: sponsors skip (solo mode)
    if (p.a === 'a:gw_sponsors_skip') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      const draft = (await getDraft(ctx.from.id)) || {};
      draft.wsId = wsId;
      draft.sponsors = [];
      await setDraft(ctx.from.id, draft);
      await clearExpectText(ctx.from.id);

      await ctx.answerCallbackQuery({ text: 'Соло: без спонсоров ✅' });
      await safeEditOrReply(ctx, 'Ок. Выбери дедлайн:', { reply_markup: gwNewStepDeadlineKb(wsId) });
      return;
    }

    // Giveaways: sponsors enter list (explicit)
    if (p.a === 'a:gw_sponsors_enter') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      await clearExpectText(ctx.from.id);
      await setExpectText(ctx.from.id, { type: 'gw_sponsors_text', wsId });

      await ctx.answerCallbackQuery();
      const isPro = await db.isWorkspacePro(wsId);
      const max = isPro ? CFG.GIVEAWAY_SPONSORS_MAX_PRO : CFG.GIVEAWAY_SPONSORS_MAX_FREE;

      await safeEditOrReply(ctx, 
        `✍️ Пришли список спонсоров (до ${max}) — @каналы или ссылки t.me (через пробел/перенос строки).

` +
        `Если это соло — нажми «✅ Без спонсоров (соло)».`,
        { reply_markup: gwSponsorsOptionalKb(wsId) }
      );
      return;
    }


    // Giveaways: sponsors review (edit/clear/next)
    if (p.a === 'a:gw_sponsors_edit') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      await clearExpectText(ctx.from.id);
      await setExpectText(ctx.from.id, { type: 'gw_sponsors_text', wsId });

      const isPro = await db.isWorkspacePro(wsId);
      const max = isPro ? CFG.GIVEAWAY_SPONSORS_MAX_PRO : CFG.GIVEAWAY_SPONSORS_MAX_FREE;

      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, 
        `✍️ Пришли список спонсоров (до ${max}) — @каналы или ссылки t.me (через пробел/перенос строки).\n\nЕсли это соло — нажми «✅ Без спонсоров (соло)».`,
        { reply_markup: gwSponsorsOptionalKb(wsId) }
      );
      return;
    }

    if (p.a === 'a:gw_sponsors_clear') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      const draft = (await getDraft(ctx.from.id)) || {};
      draft.wsId = wsId;
      draft.sponsors = [];
      await setDraft(ctx.from.id, draft);
      await clearExpectText(ctx.from.id);

      await ctx.answerCallbackQuery({ text: 'Соло: без спонсоров ✅' });
      await safeEditOrReply(ctx, 'Ок. Выбери дедлайн:', { reply_markup: gwNewStepDeadlineKb(wsId) });
      return;
    }

    if (p.a === 'a:gw_sponsors_next') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      const draft = (await getDraft(ctx.from.id)) || {};
      draft.wsId = wsId;
      if (!Array.isArray(draft.sponsors)) draft.sponsors = [];
      await setDraft(ctx.from.id, draft);
      await clearExpectText(ctx.from.id);

      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, 'Ок. Выбери дедлайн:', { reply_markup: gwNewStepDeadlineKb(wsId) });
      return;
    }






    // Giveaways: sponsors help (Jobs-style micro guide)
    if (p.a === 'a:gw_sponsors_help') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      const b = String(p.b || '').toLowerCase();
      let backCb = `a:gw_step_sponsors|ws:${wsId}`;
      if (b === 'folder') backCb = `a:gw_sponsors_from_folder|ws:${wsId}`;
      if (b === 'step') backCb = `a:gw_step_sponsors|ws:${wsId}`;

      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, 
        `🧭 Каналы-спонсоры (подписки)

Это список каналов, на которые участник должен подписаться.
Дальше участник жмёт «🔄 Проверить», и бот проверяет подписки на каждый канал.

Как подготовить (по-уму):
1) Добавь бота админом в каналы-спонсоры (иначе Telegram не даст проверить).
2) В «Мои каналы» создай папку и добавь туда нужные каналы.

Дальше: выбери папку → «➡️ Дальше» → дедлайн → превью → публикация.`,
        { reply_markup: new InlineKeyboard().text('⬅️ Назад', backCb) }
      );
      return;
    }
// Giveaways: load sponsors from folder
    if (p.a === 'a:gw_sponsors_from_folder') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      const folders = await db.listChannelFolders(wsId);
      const kb = new InlineKeyboard();
      for (const f of folders.slice(0, 20)) {
        kb.text(`📁 ${String(f.title).slice(0, 32)} (${Number(f.items_count || 0)})`, `a:gw_sponsors_use_folder|ws:${wsId}|f:${f.id}`).row();
      }
      kb.text('🧭 Как это работает', `a:gw_sponsors_help|ws:${wsId}|b:folder`).row();
      kb.text('⬅️ Назад', `a:gw_step_sponsors|ws:${wsId}`);

      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, `📁 Спонсоры из папки

Выбери папку — каналы из неё станут спонсорами (подписки) для конкурса.
Если папок нет — создай папку в «Мои каналы» → «Папки».`, { reply_markup: kb });
      return;
    }

    if (p.a === 'a:gw_sponsors_use_folder') {
      const wsId = Number(p.ws);
      const folderId = Number(p.f);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      const folder = await db.getChannelFolder(folderId);
      if (!folder || Number(folder.workspace_id) !== Number(wsId)) return ctx.answerCallbackQuery({ text: 'Папка не найдена.' });

      const items = await db.listChannelFolderItems(folderId);
      const isPro = await db.isWorkspacePro(wsId);
      const max = isPro ? CFG.GIVEAWAY_SPONSORS_MAX_PRO : CFG.GIVEAWAY_SPONSORS_MAX_FREE;
      if (items.length > max) {
        await ctx.answerCallbackQuery();
        await safeEditOrReply(ctx, `⚠️ В этой папке <b>${items.length}</b> каналов, а лимит спонсоров — <b>${max}</b>.\n\nУменьши папку или включи ⭐️ PRO.`, {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard().text('⭐️ PRO', `a:ws_pro|ws:${wsId}`).row().text('⬅️ Назад', `a:gw_sponsors_from_folder|ws:${wsId}`)
        });
        return;
      }

      const sponsors = items.map(i => i.channel_username);
      const draft = (await getDraft(ctx.from.id)) || {};
      draft.wsId = wsId;
      draft.sponsors = sponsors;
      await setDraft(ctx.from.id, draft);

      const list = sponsors.map(x => `• ${escapeHtml(String(x))}`).join('\n');
      await ctx.answerCallbackQuery({ text: 'Готово.' });
      await safeEditOrReply(ctx, 
        `✅ Спонсоры: <b>${sponsors.length}</b>
${list}

Эти каналы появятся в конкурсе как обязательные подписки.
Дальше жми «➡️ Дальше» и выбери дедлайн.

⚠️ Чтобы «Проверить» работало, добавь бота админом в каналы-спонсоры.`,
        { parse_mode: 'HTML', reply_markup: gwSponsorsReviewKb(wsId) }
      );
      return;
    }

    // GIVEAWAYS list
    if (p.a === 'a:gw_list') {
      await ctx.answerCallbackQuery();
      await maybeSendBanner(ctx, 'giveaway', CFG.GIVEAWAY_BANNER_FILE_ID);
      await renderGwList(ctx, u.id, null);
      return;
    }
    if (p.a === 'a:gw_new_pick') {
      await ctx.answerCallbackQuery();
      await renderGwNewWorkspacePicker(ctx, u.id, 'a:gw_list');
      return;
    }
    if (p.a === 'a:gw_list_ws') {
      await ctx.answerCallbackQuery();
      await maybeSendBanner(ctx, 'giveaway', CFG.GIVEAWAY_BANNER_FILE_ID);
      await renderGwList(ctx, u.id, Number(p.ws));
      return;
    }
    if (p.a === 'a:gw_open') {
      await ctx.answerCallbackQuery();
      await renderGwOpen(ctx, u.id, Number(p.i));
      return;
    }
    if (p.a === 'a:gw_stats') {
      await ctx.answerCallbackQuery();
      await renderGwStats(ctx, u.id, Number(p.i));
      return;
    }
    if (p.a === 'a:gw_log') {
      await ctx.answerCallbackQuery();
      const gwId = Number(p.i);
      const isPub = String(p.pub || '') === '1';
      await renderGwLog(ctx, isPub ? null : u.id, gwId);
      return;
    }

    if (p.a === 'a:gw_del_q') {
      const gwId = Number(p.i);
      const g = await db.getGiveawayForOwner(gwId, u.id);
      if (!g) {
        await ctx.answerCallbackQuery({ text: 'Нет доступа.' });
        return;
      }
      await ctx.answerCallbackQuery();
      const kb = new InlineKeyboard()
        .text('✅ Да, удалить', `a:gw_del_do|i:${gwId}|ws:${g.workspace_id}`)
        .row()
        .text('⬅️ Назад', `a:gw_open|i:${gwId}`)
        .row()
        .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');

      await safeEditOrReply(ctx, 
        `🗑 <b>Удалить конкурс #${gwId}?</b>

Это действие необратимо (удалятся спонсоры/участники/победители).
Если нужно просто остановить — используй «🏁 Завершить сейчас».`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
      return;
    }
    if (p.a === 'a:gw_del_do') {
      const gwId = Number(p.i);
      // Owner-gated hard delete
      const deleted = await db.deleteGiveawayForOwner(gwId, u.id);
      if (!deleted) {
        await ctx.answerCallbackQuery({ text: 'Не найдено / нет доступа.' });
        await renderGwList(ctx, u.id, null);
        return;
      }
      try {
        await db.auditWorkspace(deleted.workspace_id, u.id, 'gw.deleted', { giveaway_id: gwId });
      } catch {}

      await ctx.answerCallbackQuery({ text: 'Удалено.' });
      await renderGwList(ctx, u.id, null);
      return;
    }

    if (p.a === 'a:gw_publish_results') {
      const gwId = Number(p.i);
      const g = await db.getGiveawayForOwner(gwId, u.id);
      if (!g) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      if (g.results_message_id && Number(g.results_message_id) !== -1) {
        await ctx.answerCallbackQuery({ text: 'Итоги уже опубликованы.' });
        await renderGwOpen(ctx, u.id, gwId);
        return;
      }
      if (Number(g.results_message_id) === -1) {
        await ctx.answerCallbackQuery({ text: 'Итоги уже публикуются…' });
        return;
      }
      if (String(g.status || '').toUpperCase() !== 'WINNERS_DRAWN') {
        await ctx.answerCallbackQuery({ text: 'Сначала выбери победителей.' });
        await renderGwOpen(ctx, u.id, gwId);
        return;
      }
      if (!g.published_chat_id) {
        await ctx.answerCallbackQuery({ text: 'Не вижу куда публиковать.' });
        await renderGwOpen(ctx, u.id, gwId);
        return;
      }

      // Idempotency: lock per giveaway
      const lockKey = k(['lock', 'gw_publish', gwId]);
      const locked = await redis.set(lockKey, { by: u.id }, { nx: true, ex: 30 });
      if (!locked) {
        await ctx.answerCallbackQuery({ text: 'Секунду… уже публикуется.' });
        return;
      }

      try {
        // Strong idempotency: reserve in DB (results_message_id=-1)
        const reserved = await db.reserveGiveawayPublish(gwId, u.id);
        if (!reserved) {
          await ctx.answerCallbackQuery({ text: 'Уже публикуется / опубликовано.' });
          await renderGwOpen(ctx, u.id, gwId);
          return;
        }

        const winners = await db.exportGiveawayWinnersForPublish(gwId, u.id);
        if (!winners || !winners.length) {
          await db.releaseGiveawayPublish(gwId, u.id);
          await ctx.answerCallbackQuery({ text: 'Нет победителей.' });
          return;
        }
        const wf = formatGwWinners(winners);
        const winnersHeader = wf.mode === 'one'
          ? `🏆 Победители: ${wf.text}`
          : `🏆 Победители:\n\n${wf.text}`;

        const prize = (g.prize_value_text || '').trim() || '—';
        const ends = g.ends_at ? fmtTs(g.ends_at) : '—';
        const sponsorsRows = await db.listGiveawaySponsors(gwId);
        const sponsorsArr = (sponsorsRows || []).map(x => x.sponsor_text).filter(Boolean);
        const sponsorsCount = normalizeSponsorsList(sponsorsArr).map(fmtSponsorHandle).filter(Boolean).length;
        const sponsorsLine = sponsorsCount
          ? `
👥 Условие: ${sponsorsCountText(sponsorsArr)}
${sponsorsBulletText(sponsorsArr, 5)}`
          : '';

        const baseText =
`🎀 <b>РОЗЫГРЫШ</b>

🎁 Приз: <b>${escapeHtml(prize)}</b>
🏆 Мест: <b>${Number(g.winners_count || winners.length || 1)}</b>
⏳ Итоги: <b>${escapeHtml(String(ends))}</b>${sponsorsLine}`;

        const resultsBlock =
`🏁 <b>Итоги</b>
${winnersHeader}`;

        const fullText = `${baseText}

${resultsBlock}`;

        const url = `https://t.me/${CFG.BOT_USERNAME}?start=gw_${g.id}`;
        const ikb = new InlineKeyboard()
          .url('🤖 Открыть бота', url)
          .url('🧾 Лог', url);

        const chatId = Number(g.published_chat_id);
        const origMsgId = g.published_message_id ? Number(g.published_message_id) : null;

        let publishedId = null;
        let via = null;

        // Jobs-style: try to EDIT the original channel post (0 spam).
        // If edit is impossible (media/caption limit/permissions), fallback to a REPLY strictly to the original post.
        if (origMsgId) {
          try {
            if (fullText.length <= 4096) {
              await ctx.api.editMessageText(chatId, origMsgId, fullText, { parse_mode: 'HTML', reply_markup: ikb });
              publishedId = origMsgId;
              via = 'edit_text';
            }
          } catch (_) {}

          if (!publishedId) {
            try {
              if (fullText.length <= 1024) {
                await ctx.api.editMessageCaption(chatId, origMsgId, { caption: fullText, parse_mode: 'HTML', reply_markup: ikb });
                publishedId = origMsgId;
                via = 'edit_caption';
              }
            } catch (_) {}
          }
        }

        if (!publishedId) {
          const body =
`🏁 <b>Итоги конкурса #${g.id}</b>

${winnersHeader}`;

          const replyParams = origMsgId
            ? { reply_parameters: { message_id: origMsgId, allow_sending_without_reply: true } }
            : {};

          const sent = await ctx.api.sendMessage(chatId, body, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: ikb,
            ...replyParams
          });

          publishedId = sent.message_id;
          via = origMsgId ? 'reply' : 'message';
        }

        await db.finalizeGiveawayPublish(gwId, u.id, publishedId);
        await db.auditGiveaway(gwId, g.workspace_id, u.id, 'gw.results_published', { message_id: publishedId, via });


        await ctx.answerCallbackQuery({ text: 'Опубликовано.' });
        await renderGwOpen(ctx, u.id, gwId);
      } catch (e) {
        try { await db.releaseGiveawayPublish(gwId, u.id); } catch {}
        await ctx.answerCallbackQuery({ text: 'Ошибка публикации.' });
      } finally {
        // best-effort unlock
        try { await redis.del(lockKey); } catch {}
      }
      return;
    }


    if (p.a === 'a:gw_results_refresh') {
      const gwId = Number(p.i);
      const g = await db.getGiveawayForOwner(gwId, u.id);
      if (!g) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      const msgId = Number(g.results_message_id || 0);
      if (!msgId || msgId <= 0) {
        await ctx.answerCallbackQuery({ text: 'Пока нечего обновлять.' });
        await renderGwOpen(ctx, u.id, gwId);
        return;
      }
      if (!g.published_chat_id) {
        await ctx.answerCallbackQuery({ text: 'Не вижу канал для обновления.' });
        await renderGwOpen(ctx, u.id, gwId);
        return;
      }

      try {
        const winners = await db.exportGiveawayWinnersForPublish(gwId, u.id);
        if (!winners || !winners.length) {
          await ctx.answerCallbackQuery({ text: 'Победителей пока нет.' });
          return;
        }
        const wf = formatGwWinners(winners);
        const winnersHeader = wf.mode === 'one'
          ? `🏆 Победители: ${wf.text}`
          : `🏆 Победители:\n\n${wf.text}`;

        const prize = (g.prize_value_text || '').trim() || '—';
        const ends = g.ends_at ? fmtTs(g.ends_at) : '—';
        const sponsorsRows = await db.listGiveawaySponsors(gwId);
        const sponsorsArr = (sponsorsRows || []).map(x => x.sponsor_text).filter(Boolean);
        const sponsorsCount = normalizeSponsorsList(sponsorsArr).map(fmtSponsorHandle).filter(Boolean).length;
        const sponsorsLine = sponsorsCount
          ? `\n\n👥 Условие: ${sponsorsCountText(sponsorsArr)}\n${sponsorsBulletText(sponsorsArr, 5)}`
          : '';

        const baseText =
`🎀 <b>РОЗЫГРЫШ</b>

🎁 Приз: <b>${escapeHtml(prize)}</b>
🏆 Мест: <b>${Number(g.winners_count || winners.length || 1)}</b>
⏳ Итоги: <b>${escapeHtml(String(ends))}</b>${sponsorsLine}`;

        const resultsBlock =
`🏁 <b>Итоги</b>
${winnersHeader}`;

        const fullText = `${baseText}

${resultsBlock}`;

        // Reply-mode must be максимально коротко: только победители.
        const replyText =
`🏁 <b>Итоги конкурса #${g.id}</b>

${winnersHeader}`;

        const url = `https://t.me/${CFG.BOT_USERNAME}?start=gw_${g.id}`;
        const ikb = new InlineKeyboard().url('🤖 Открыть бота', url).url('🧾 Лог', url);

        const chatId = Number(g.published_chat_id);
        const origMsgId = g.published_message_id ? Number(g.published_message_id) : null;

        // No spam: only EDIT existing message (original or reply).
        if (origMsgId && msgId === origMsgId) {
          let ok = false;
          try {
            if (fullText.length <= 4096) {
              await ctx.api.editMessageText(chatId, origMsgId, fullText, { parse_mode: 'HTML', reply_markup: ikb });
              ok = true;
            }
          } catch (_) {}
          if (!ok) {
            try {
              if (fullText.length <= 1024) {
                await ctx.api.editMessageCaption(chatId, origMsgId, { caption: fullText, parse_mode: 'HTML', reply_markup: ikb });
                ok = true;
              }
            } catch (_) {}
          }
          if (!ok) {
            await ctx.answerCallbackQuery({ text: 'Не удалось обновить (нет прав/слишком старое сообщение).' });
            return;
          }
        } else {
          try {
            await ctx.api.editMessageText(chatId, msgId, replyText, { parse_mode: 'HTML', reply_markup: ikb, disable_web_page_preview: true });
          } catch (e) {
            await ctx.answerCallbackQuery({ text: 'Не удалось обновить (нет прав/слишком старое сообщение).' });
            return;
          }
        }

        await ctx.answerCallbackQuery({ text: 'Обновлено.' });
        await renderGwOpen(ctx, u.id, gwId);
      } catch (e) {
        await ctx.answerCallbackQuery({ text: 'Ошибка обновления.' });
      }
      return;
    }

    // Public open (participants)
    if (p.a === 'a:gw_open_public') {
      await ctx.answerCallbackQuery();
      await renderGwOpenPublic(ctx, Number(p.i), u.id);
      return;
    }

    // Export
    if (p.a === 'a:gw_export') {
      const gwId = Number(p.i);
      const t = p.t;
      await ctx.answerCallbackQuery();
      if (t === 'winners') {
        const winners = await db.exportGiveawayWinnersForPublish(gwId, u.id);
        if (!winners || !winners.length) return ctx.reply('Победителей пока нет.');
        const lines = winners.map(w => {
          const name = w.username ? '@' + String(w.username) : `id:${Number(w.tg_id)}`;
          return `${Number(w.place)}. ${name}`;
        });
        return ctx.reply(lines.join('\n'));
      }
      if (t === 'eligible') {
        const list = await db.exportGiveawayParticipantsUsernames(gwId, u.id, true);
        return ctx.reply(list.length ? list.map(x => '@' + x).join('\n') : 'Пока нет eligible.');
      }
      const list = await db.exportGiveawayParticipantsUsernames(gwId, u.id, null);
      return ctx.reply(list.length ? list.map(x => '@' + x).join('\n') : 'Пока нет участников.');
    }

    // 🧩 Access
    if (p.a === 'a:gw_access') {
      await renderGwAccess({ ctx, gwId: Number(p.i), ownerUserId: u.id, redis, db, forceRecheck: false });
      return;
    }
    if (p.a === 'a:gw_access_recheck') {
      await renderGwAccess({ ctx, gwId: Number(p.i), ownerUserId: u.id, redis, db, forceRecheck: true });
      return;
    }

    // ✅ Preflight readiness (owner)
    if (p.a === 'a:gw_preflight') {
      await ctx.answerCallbackQuery();
      await renderGwPreflight(ctx, u.id, Number(p.i), { forceRecheck: String(p.r || '') === '1' });
      return;
    }

    // ℹ️ Why not eligible (owner)
    if (p.a === 'a:gw_why') {
      await ctx.answerCallbackQuery();
      await renderGwWhyMenu(ctx, u.id, Number(p.i));
      return;
    }
    if (p.a === 'a:gw_why_enter') {
      const gwId = Number(p.i);
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, 
        'ℹ️ <b>Почему не прошёл</b>\n\nПришли <b>user_id</b> участника (цифрами).\n\nПодсказка: участник может узнать свой id командой /whoami.',
        { parse_mode: 'HTML', reply_markup: navKb(`a:gw_stats|i:${gwId}`) }
      );
      await setExpectText(ctx.from.id, { type: 'gw_why_userid', gwId });
      return;
    }
    if (p.a === 'a:gw_why_forward') {
      const gwId = Number(p.i);
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, 
        'ℹ️ <b>Почему не прошёл</b>\n\nПерешли сюда сообщение участника (forward).\n\nВажно: если у участника включена “Forward privacy”, бот не увидит user_id — тогда используй “Ввести ID”.',
        { parse_mode: 'HTML', reply_markup: navKb(`a:gw_why|i:${gwId}`) }
      );
      await setExpectText(ctx.from.id, { type: 'gw_why_forward', gwId });
      return;
    }
    if (p.a === 'a:gw_why_recheck') {
      await ctx.answerCallbackQuery();
      await renderGwWhyResult(ctx, u.id, Number(p.i), Number(p.tu), { forceRecheck: true });
      return;
    }


    // Create giveaway
    if (p.a === 'a:gw_new') {
      const wsId = Number(p.ws);
      db.trackEvent('gw_new_open', { userId: u.id, wsId, meta: {} });
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await clearDraft(ctx.from.id);
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, '🎁 <b>Новый конкурс</b>\n\nКонкурс — инструмент PR и роста аудитории.\nИспользуй его, чтобы собрать участников, вовлечённость и заявки брендов.\n\n<b>Шаг 1/6:</b> выбери тип приза:', { parse_mode: 'HTML', reply_markup: gwNewStepPrizeKb(wsId) });
      return;
    }

    
    if (p.a === 'a:gw_preset_home') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, 
        '🧩 <b>Пресеты конкурса</b>\n\nВыбери вариант — мы подготовим тип приза и текст. Потом выберешь количество мест, спонсоров и дедлайн.',
        { parse_mode: 'HTML', reply_markup: gwPresetKb(wsId) }
      );
      return;
    }

    if (p.a === 'a:gw_preset_apply') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      const presetId = String(p.id || '');
      const preset = GW_PRESETS.find((x) => x.id === presetId);
      if (!preset) return ctx.answerCallbackQuery({ text: 'Пресет не найден.' });
      await ctx.answerCallbackQuery();
      await clearDraft(ctx.from.id);
      await setDraft(ctx.from.id, { wsId, prize_type: preset.prize_type, prize_value_text: preset.prize_value_text });
      await safeEditOrReply(ctx, 
        `✅ Пресет применён.\n\n<b>Приз:</b> <code>${escapeHtml(preset.prize_value_text)}</code>\n\nТеперь выбери количество призовых мест:`,
        { parse_mode: 'HTML', reply_markup: gwNewStepWinnersKb(wsId) }
      );
      return;
    }

if (p.a === 'a:gw_prize') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      const type = p.t;
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, gwPrizePrompt(type), {
        parse_mode: 'HTML',
        reply_markup: navKb(`a:gw_new|ws:${wsId}`)
      });
      await setDraft(ctx.from.id, { wsId, prize_type: type });
      await setExpectText(ctx.from.id, { type: 'gw_prize_text', wsId });
      return;
    }

    if (p.a === 'a:gw_winners') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      const n = Number(p.n);
      const draft = (await getDraft(ctx.from.id)) || { wsId };
      draft.winners_count = n;
      await setDraft(ctx.from.id, draft);
      await ctx.answerCallbackQuery();
      const isPro = await db.isWorkspacePro(wsId);
      const max = isPro ? CFG.GIVEAWAY_SPONSORS_MAX_PRO : CFG.GIVEAWAY_SPONSORS_MAX_FREE;
      const kb = new InlineKeyboard()
        .text('✅ Без спонсоров (соло)', `a:gw_sponsors_skip|ws:${wsId}`)
        .row()
        .text('✍️ Ввести списком', `a:gw_sponsors_enter|ws:${wsId}`)
        .row()
        .text('📁 Из папки', `a:gw_sponsors_from_folder|ws:${wsId}`)
        .row()
        .text('🧭 Что такое спонсоры?', `a:gw_sponsors_help|ws:${wsId}`)
        .row()
        .text('⬅️ Назад', `a:gw_new|ws:${wsId}`);
      await safeEditOrReply(ctx, 
        `Спонсоры (необязательно, до ${max}).\n\n` +
        `Если это соло — нажми «✅ Без спонсоров (соло)».\n` +
        `Если есть партнёры — нажми «✍️ Ввести списком» и пришли список @каналов или t.me ссылками (можно просто прислать).`,
        { reply_markup: kb }
      );
      await setExpectText(ctx.from.id, { type: 'gw_sponsors_text', wsId });
      return;
    }

    if (p.a === 'a:gw_winners_custom') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, 'Введи число призовых мест (1..50):', {
        reply_markup: navKb(`a:gw_new|ws:${wsId}`)
      });
      await setExpectText(ctx.from.id, { type: 'gw_winners_custom', wsId });
      return;
    }

    if (p.a === 'a:gw_step_sponsors') {
      const wsId = Number(p.ws);
      await ctx.answerCallbackQuery();
      const isPro = await db.isWorkspacePro(wsId);
      const max = isPro ? CFG.GIVEAWAY_SPONSORS_MAX_PRO : CFG.GIVEAWAY_SPONSORS_MAX_FREE;
      const kb = new InlineKeyboard()
        .text('✅ Без спонсоров (соло)', `a:gw_sponsors_skip|ws:${wsId}`)
        .row()
        .text('✍️ Ввести списком', `a:gw_sponsors_enter|ws:${wsId}`)
        .row()
        .text('📁 Из папки', `a:gw_sponsors_from_folder|ws:${wsId}`)
        .row()
        .text('🧭 Что такое спонсоры?', `a:gw_sponsors_help|ws:${wsId}`)
        .row()
        .text('⬅️ Назад', `a:gw_new|ws:${wsId}`);
      await safeEditOrReply(ctx, 
        `Спонсоры (необязательно, до ${max}).\n\n` +
        `Если соло — нажми «✅ Без спонсоров (соло)».\n` +
        `Если есть партнёры — нажми «✍️ Ввести списком» и пришли список @каналов или t.me ссылками (можно просто прислать).`,
        { reply_markup: kb }
      );
      await setExpectText(ctx.from.id, { type: 'gw_sponsors_text', wsId });
      return;
    }

    if (p.a === 'a:gw_step_deadline') {
      const wsId = Number(p.ws);
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, 'Выбери дедлайн:', { reply_markup: gwNewStepDeadlineKb(wsId) });
      return;
    }

    if (p.a === 'a:gw_deadline') {
      const wsId = Number(p.ws);
      const mins = Number(p.m);

      if (!Number.isFinite(mins) || mins < 5 || mins > 30 * 24 * 60) {
        await ctx.answerCallbackQuery({ text: 'Некорректный дедлайн.' });
        return;
      }

      const draft = (await getDraft(ctx.from.id)) || { wsId };
      draft.ends_at = addMinutes(new Date(), mins).toISOString();
      await setDraft(ctx.from.id, draft);
      await ctx.answerCallbackQuery();
      await renderGwMediaStep(ctx, wsId, { edit: true });
      return;
    }

    if (p.a === 'a:gw_deadline_custom') {
      const wsId = Number(p.ws);
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, 'Введи дедлайн в формате DD.MM HH:MM (МСК). Пример: 20.01 18:00', {
        reply_markup: navKb(`a:gw_step_deadline|ws:${wsId}`)
      });
      await setExpectText(ctx.from.id, { type: 'gw_deadline_custom', wsId });
      return;
    }


    if (p.a === 'a:gw_media_step') {
      const wsId = Number(p.ws);
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      await renderGwMediaStep(ctx, wsId, { edit: true });
      return;
    }

    if (p.a === 'a:gw_media_skip') {
      const wsId = Number(p.ws);
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      await renderGwConfirm(ctx, wsId, { edit: true });
      return;
    }

    if (p.a === 'a:gw_media_clear') {
      const wsId = Number(p.ws);
      await clearExpectText(ctx.from.id);
      const draft = (await getDraft(ctx.from.id)) || { wsId };
      delete draft.media_type;
      delete draft.media_file_id;
      await setDraft(ctx.from.id, draft);
      await ctx.answerCallbackQuery({ text: 'Убрано' });
      await renderGwMediaStep(ctx, wsId, { edit: true });
      return;
    }

    if (p.a === 'a:gw_media_photo') {
      const wsId = Number(p.ws);
      await ctx.answerCallbackQuery();
      await setExpectText(ctx.from.id, { type: 'gw_media_photo', wsId });
      const kb = navKb(`a:gw_media_step|ws:${wsId}`);
      await safeEditOrReply(ctx, '🖼 Пришли <b>картинку</b> одним сообщением.\n\n(Можно пропустить этот шаг)', {
        parse_mode: 'HTML',
        reply_markup: kb
      });
      return;
    }

    if (p.a === 'a:gw_media_gif') {
      const wsId = Number(p.ws);
      await ctx.answerCallbackQuery();
      await setExpectText(ctx.from.id, { type: 'gw_media_gif', wsId });
      const kb = navKb(`a:gw_media_step|ws:${wsId}`);
      await safeEditOrReply(ctx, '🎞 Пришли <b>GIF</b> (анимацию) одним сообщением.\n\n(Можно пропустить этот шаг)', {
        parse_mode: 'HTML',
        reply_markup: kb
      });
      return;
    }
    if (p.a === 'a:gw_media_video') {
      const wsId = Number(p.ws);
      await ctx.answerCallbackQuery();
      await setExpectText(ctx.from.id, { type: 'gw_media_video', wsId });
      const kb = navKb(`a:gw_media_step|ws:${wsId}`);
      await safeEditOrReply(ctx, `🎥 Пришли <b>видео</b> одним сообщением.\n\n(Поддержка: mp4. Можно отправить как видео или как файл.)`, {
        parse_mode: 'HTML',
        reply_markup: kb
      });
      return;
    }

    if (p.a === 'a:gw_preview') {
      const wsId = Number(p.ws);
      await ctx.answerCallbackQuery();
      const draft = (await getDraft(ctx.from.id)) || { wsId };

      const prize = (draft.prize_value_text || '').trim() || '—';
      const winners = Number(draft.winners_count || 0) || 1;
      const ends = draft.ends_at ? fmtTs(draft.ends_at) : '—';
      const sponsorsCount = normalizeSponsorsList(draft.sponsors).map(fmtSponsorHandle).filter(Boolean).length;
      const sponsorsLine = sponsorsCount
        ? `👥 Условие: ${sponsorsCountText(draft.sponsors)}
${sponsorsBulletText(draft.sponsors, 5)}
Проверка подписки — в боте (кнопка «🔄 Проверить»).`
        : `👥 Спонсоры: <b>нет</b> (соло).`;

      const text =
`🎀 <b>РОЗЫГРЫШ</b>

🎁 Приз: <b>${escapeHtml(prize)}</b>
🏆 Мест: <b>${winners}</b>
⏳ Итоги: <b>${escapeHtml(String(ends))}</b>

${sponsorsLine}

🤖 Открой бота → 🎟 Участвовать → 🔄 Проверить.

<i>Это превью. Для публикации нажми “📣 Опубликовать” ниже.</i>`;

      // Add action buttons прямо в превью, чтобы не было ощущения “надо переслать”.
      // IMPORTANT: callback приходит из превью-сообщения (медиа), поэтому “назад” делаем как «показать черновик ещё раз».
      const previewKb = new InlineKeyboard()
        .text('📣 Опубликовать', `a:gw_publish|ws:${wsId}`)
        .row()
        .text('⬅️ Назад к черновику', `a:gw_confirm_push|ws:${wsId}`);

      try {
        if (draft.media_file_id && String(draft.media_type) === 'photo') {
          await ctx.replyWithPhoto(draft.media_file_id, { caption: text, parse_mode: 'HTML', reply_markup: previewKb });
        } else if (draft.media_file_id && String(draft.media_type) === 'animation') {
          await ctx.replyWithAnimation(draft.media_file_id, { caption: text, parse_mode: 'HTML', reply_markup: previewKb });
        } else if (draft.media_file_id && String(draft.media_type) === 'video') {
          await ctx.replyWithVideo(draft.media_file_id, { caption: text, parse_mode: 'HTML', reply_markup: previewKb });
        } else {
          await ctx.reply(text, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: previewKb });
        }
      } catch (_) {
        await ctx.reply('Не удалось отправить превью. Попробуй ещё раз или убери медиа.');
      }

      // Keep user in confirm screen
      await renderGwConfirm(ctx, wsId, { edit: true });
      return;
    }

    // “Назад” из превью конкурса: присылаем черновик ещё раз (не пытаемся редактировать медиа-сообщение).
    if (p.a === 'a:gw_confirm_push') {
      const wsId = Number(p.ws);
      await ctx.answerCallbackQuery();
      await clearExpectText(ctx.from.id);
      await renderGwConfirm(ctx, wsId, { edit: false });
      return;
    }



    if (p.a === 'a:gw_publish') {
      const wsId = Number(p.ws);
      const ws = await db.getWorkspace(u.id, wsId);
      if (!ws) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      const draft = (await getDraft(ctx.from.id)) || {};
      if (!draft.prize_value_text || !draft.winners_count || !draft.sponsors || !draft.ends_at) {
        await ctx.answerCallbackQuery({ text: 'Черновик не полный.' });
        return;
      }

      db.trackEvent('gw_publish_attempt', { userId: u.id, wsId, meta: { winners: Number(draft.winners_count || 0) } });

      // create in DB
      const created = await db.createGiveaway({
        workspaceId: wsId,
        prizeValueText: draft.prize_value_text,
        winnersCount: Number(draft.winners_count),
        endsAt: draft.ends_at,
        autoDraw: false,
        autoPublish: false
      });
      await db.replaceGiveawaySponsors(created.id, draft.sponsors);

      // publish post
      const botUsername = CFG.BOT_USERNAME;
      const deepLinkOpen = `https://t.me/${botUsername}?start=gw_${created.id}`;

      const sponsorsCount = normalizeSponsorsList(draft.sponsors).map(fmtSponsorHandle).filter(Boolean).length;
      const sponsorsLine = sponsorsCount
        ? `
👥 Условие: ${sponsorsCountText(draft.sponsors)}
${sponsorsBulletText(draft.sponsors, 5)}`
        : '';
      const actionHint = sponsorsCount
        ? '🤖 Открой бота → подпишись → 🔄 Проверить.'
        : '🤖 Открой бота → 🎟 Участвовать → 🔄 Проверить.';

      const text =
`🎀 <b>РОЗЫГРЫШ</b>

🎁 Приз: <b>${escapeHtml(draft.prize_value_text)}</b>
🏆 Мест: <b>${Number(draft.winners_count)}</b>
⏳ Итоги: <b>${escapeHtml(fmtTs(draft.ends_at))}</b>${sponsorsLine}

${actionHint}`;

      const kb = {
        inline_keyboard: [
          [{ text: '🤖 Открыть бота', url: deepLinkOpen }]
        ]
      };

      try {
        let sent;
        if (draft.media_file_id && String(draft.media_type) === 'photo') {
          sent = await ctx.api.sendPhoto(ws.channel_id, draft.media_file_id, {
            caption: text,
            parse_mode: 'HTML',
            reply_markup: kb
          });
        } else if (draft.media_file_id && String(draft.media_type) === 'animation') {
          sent = await ctx.api.sendAnimation(ws.channel_id, draft.media_file_id, {
            caption: text,
            parse_mode: 'HTML',
            reply_markup: kb
          });
        } else if (draft.media_file_id && String(draft.media_type) === 'video') {
          sent = await ctx.api.sendVideo(ws.channel_id, draft.media_file_id, {
            caption: text,
            parse_mode: 'HTML',
            reply_markup: kb
          });
        } else {
          sent = await ctx.api.sendMessage(ws.channel_id, text, {
            parse_mode: 'HTML',
            reply_markup: kb,
            disable_web_page_preview: true
          });
          delivered++;
        }

        await db.updateGiveaway(created.id, {
          status: 'ACTIVE',
          published_chat_id: ws.channel_id,
          published_message_id: sent.message_id
        });
        await db.auditGiveaway(created.id, wsId, u.id, 'gw.published', { chat_id: ws.channel_id, message_id: sent.message_id });
        db.trackEvent('gw_published', { userId: u.id, wsId, meta: { giveawayId: created.id, chatId: ws.channel_id, messageId: sent.message_id } });

        await clearDraft(ctx.from.id);
        await ctx.answerCallbackQuery({ text: 'Опубликовано ✅' });
        await renderGwOpen(ctx, u.id, created.id);
      } catch (e) {
        await ctx.answerCallbackQuery({ text: 'Не удалось опубликовать.' });
        await safeEditOrReply(ctx, 
          `⚠️ Не удалось отправить пост в канал.\n\nПроверь: бот админ в канале, есть право писать.\n\nОшибка: ${escapeHtml(String(e?.message || e))}`,
          { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('⬅️ Назад', `a:ws_open|ws:${wsId}`) }
        );
      }
      return;
    }

    // Join / Check
    if (p.a === 'a:gw_join') {
      const gwId = Number(p.i);
      const pub = String(p.pub || '') === '1';
      const g = await db.getGiveawayInfoForUser(gwId);
      if (!g) return ctx.answerCallbackQuery({ text: 'Конкурс не найден.' });

      const st = gwEffectiveStatusValue(g);
      const ended = ['ENDED','WINNERS_DRAWN','RESULTS_PUBLISHED','CANCELLED'].includes(st);
      if (ended) {
        const sponsors = await db.listGiveawaySponsors(gwId);
        const entry = await db.getEntryStatus(gwId, u.id);
        await ctx.answerCallbackQuery({ text: 'Конкурс уже завершён.' });
        const screen = renderParticipantScreen(g, entry, { hint: true, sponsors });
        const kb = participantKb(gwId, entry, { pub, ended: true });
        try {
          await safeEditOrReply(ctx, screen, { parse_mode: 'HTML', reply_markup: kb });
        } catch {
          await ctx.reply(screen, { parse_mode: 'HTML', reply_markup: kb });
        }
        return;
      }

      // Ensure entry exists
      await db.upsertGiveawayEntry(gwId, u.id);
      await db.auditGiveaway(gwId, g.workspace_id, u.id, 'gw.joined', { from: 'button' });

      const sponsors = await db.listGiveawaySponsors(gwId);
      const entryNow = await db.getEntryStatus(gwId, u.id);

      await ctx.answerCallbackQuery({ text: '🎟 Участие записано' });

      const screen = renderParticipantScreen(g, entryNow, { hint: true, sponsors });
      const kb = participantKb(gwId, entryNow, { pub });

      try {
        await safeEditOrReply(ctx, screen, { parse_mode: 'HTML', reply_markup: kb });
      } catch {
        await ctx.reply(screen, { parse_mode: 'HTML', reply_markup: kb });
      }
      return;
    }

    if (p.a === 'a:gw_check') {
      const gwId = Number(p.i);
      const isPub = String(p.pub || '') === '1';
      const g = await db.getGiveawayInfoForUser(gwId);
      if (!g) return ctx.answerCallbackQuery({ text: 'Конкурс не найден.' });

      const st = gwEffectiveStatusValue(g);
      const ended = ['ENDED','WINNERS_DRAWN','RESULTS_PUBLISHED','CANCELLED'].includes(st);
      if (ended) {
        const sponsors = await db.listGiveawaySponsors(gwId);
        const entry = await db.getEntryStatus(gwId, u.id);
        await ctx.answerCallbackQuery({ text: 'Конкурс уже завершён.' });
        const screen = renderParticipantScreen(g, entry, { hint: true, sponsors });
        const kb = participantKb(gwId, entry, { pub: isPub, ended: true });
        try {
          await safeEditOrReply(ctx, screen, { parse_mode: 'HTML', reply_markup: kb });
        } catch {
          await ctx.reply(screen, { parse_mode: 'HTML', reply_markup: kb });
        }
        return;
      }

      // Ensure entry exists
      await db.upsertGiveawayEntry(gwId, u.id);
      const entry0 = await db.getEntryStatus(gwId, u.id);
      const sponsors = await db.listGiveawaySponsors(gwId);

      // Instant feedback (perceived speed)
      await ctx.answerCallbackQuery({ text: '⏳ Проверяю…' });
      try {
        const text0 = renderParticipantScreen(g, entry0, { checking: true, sponsors });
        await safeEditOrReply(ctx, text0, { parse_mode: 'HTML', reply_markup: participantKb(gwId, entry0, { pub: isPub }) });
      } catch {
        // ignore edit errors
      }

      const check = await doEligibilityCheck(ctx, gwId, ctx.from.id);
      await db.setEntryEligibility(gwId, u.id, check.isEligible);
      await db.auditGiveaway(gwId, g.workspace_id, u.id, 'gw.checked', { isEligible: check.isEligible, unknown: check.unknown, results: check.results });

      try {
        const entry = await db.getEntryStatus(gwId, u.id);
        const text1 = renderParticipantScreen(g, entry, { hint: true, sponsors, elig: check });
        await safeEditOrReply(ctx, text1, { parse_mode: 'HTML', reply_markup: participantKb(gwId, entry, { pub: isPub, blocker: check.firstBlocker, firstBlockerHandle: check.firstBlockerHandle }) });
      } catch {
        const msg = check.isEligible ? '✅ Участие подтверждено!' : '⚠️ Пока не подтверждено.';
        await ctx.reply(msg + (check.unknown ? '\n\n💡 Если бот не может проверить — попроси админа добавить бота в канал-спонсор.' : ''));
      }
      return;
    }

    // Reminder
    if (p.a === 'a:gw_remind_q') {
      const gwId = Number(p.i);
      const g = await db.getGiveawayForOwner(gwId, u.id);
      if (!g) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      if (['ENDED','WINNERS_DRAWN','RESULTS_PUBLISHED','CANCELLED'].includes(gwEffectiveStatusValue(g))) return ctx.answerCallbackQuery({ text: 'Уже завершен.' });

      const kb = new InlineKeyboard()
        .text('✅ Да, отправить', `a:gw_remind_send|i:${gwId}`)
        .text('❌ Отмена', `a:gw_open|i:${gwId}`);

      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, '📣 Отправить напоминание в канал конкурса?\n\nЭто поднимет Eligible %.', { reply_markup: kb });
      return;
    }

    if (p.a === 'a:gw_remind_send') {
      const gwId = Number(p.i);
      const g = await db.getGiveawayForOwner(gwId, u.id);
      if (!g) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      if (!g.published_chat_id) return ctx.answerCallbackQuery({ text: 'Конкурс не опубликован?' });
      if (['ENDED','WINNERS_DRAWN','RESULTS_PUBLISHED','CANCELLED'].includes(gwEffectiveStatusValue(g))) return ctx.answerCallbackQuery({ text: 'Уже завершен.' });

      const rlKey = k(['rl', 'gw_remind', gwId]);
      const ok = await redis.set(rlKey, '1', { nx: true, ex: 30 * 60 });
      if (!ok) return ctx.answerCallbackQuery({ text: 'Уже отправляли недавно.' });

      const sponsors = await db.listGiveawaySponsors(gwId);
      const hasSponsors = Array.isArray(sponsors) && sponsors.length > 0;

      // Use a direct "check" deep-link so the channel button always works and takes the user straight to eligibility check.
      const link = `https://t.me/${CFG.BOT_USERNAME}?start=gw_${gwId}`;
      const line1 = hasSponsors
        ? '1) Подпишись на канал конкурса (этот канал) и на все каналы-спонсоры'
        : '1) Подпишись на канал конкурса (этот канал)';
      const text =
`📣 <b>Напоминание участникам</b>\n\nЧтобы участие засчиталось ✅\n${line1}\n2) Открой бота и нажми <b>«Проверить»</b>\n\n🤖 Бот: ${escapeHtml(link)}`;

      try {
        const replyParams = g.published_message_id ? { reply_parameters: { message_id: Number(g.published_message_id), allow_sending_without_reply: true } } : {};
        const sent = await ctx.api.sendMessage(Number(g.published_chat_id), text, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: { inline_keyboard: [[{ text: '🤖 Открыть бота', url: link }]] },
          ...replyParams
        });
        await db.auditGiveaway(gwId, g.workspace_id, u.id, 'gw.reminder_posted', { chat_id: g.published_chat_id, message_id: sent.message_id });
        await ctx.answerCallbackQuery({ text: 'Отправлено ✅' });
        // Go back to the giveaway card to avoid leaving a "success" message hanging in the chat.
        await renderGwOpen(ctx, u.id, gwId);
      } catch (e) {
        await redis.del(rlKey);
        await ctx.answerCallbackQuery({ text: 'Не удалось.' });
        await safeEditOrReply(ctx, `⚠️ Ошибка отправки: ${escapeHtml(String(e?.message || e))}`, { parse_mode: 'HTML', reply_markup: navKb(`a:gw_open|i:${gwId}`) });
      }
      return;
    }

    // End now
    if (p.a === 'a:gw_end_now') {
      const gwId = Number(p.i);
      const g = await db.getGiveawayForOwner(gwId, u.id);
      if (!g) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      const kb = new InlineKeyboard()
        .text('✅ Завершить', `a:gw_end_do|i:${gwId}`)
        .text('❌ Отмена', `a:gw_open|i:${gwId}`);
      await ctx.answerCallbackQuery();
      await safeEditOrReply(ctx, '🏁 Завершить конкурс сейчас?', { reply_markup: kb });
      return;
    }

    if (p.a === 'a:gw_end_do') {
      const gwId = Number(p.i);
      const g = await db.getGiveawayForOwner(gwId, u.id);
      if (!g) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });
      const prevStatus = String(g.status || '').toUpperCase();
      await db.updateGiveaway(gwId, { status: 'ENDED' });
      await db.auditGiveaway(gwId, g.workspace_id, u.id, 'gw.ended', { manual: true });

      // Optional: post a compact “contest ended” notice into the published channel (reply to original post).
      // Owner DM is skipped (owner already in bot flow).
      try {
        if (prevStatus !== 'ENDED' && prevStatus !== 'WINNERS_DRAWN' && prevStatus !== 'RESULTS_PUBLISHED') {
          await notifyGiveawayEnded({ api: ctx.api, db, g, reason: 'manual_end', skipOwner: true });
        }
      } catch {
        // ignore
      }
      await ctx.answerCallbackQuery({ text: 'Завершен' });
      await renderGwOpen(ctx, u.id, gwId);
      return;
    }

    if (p.a === 'a:gw_wv') {
      const gwId = Number(p.i);
      await ctx.answerCallbackQuery();
      await renderGwWinnersView(ctx, u.id, gwId);
      return;
    }


    // Draw winners (manual, deterministic)
    if (p.a === 'a:gw_draw_now') {
      const gwId = Number(p.i);
      const g = await db.getGiveawayForOwner(gwId, u.id);
      if (!g) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      const effSt = gwEffectiveStatusValue(g);
      const rawSt = String(g.status || '').toUpperCase();
      const already = rawSt === 'WINNERS_DRAWN' || rawSt === 'RESULTS_PUBLISHED' || !!g.winners_drawn_at;

      await ctx.answerCallbackQuery();

      if (already) {
        await safeEditOrReply(ctx, '🏆 Победители уже выбраны.', { reply_markup: navKb(`a:gw_open|i:${gwId}`) });
        return;
      }

      if (effSt !== 'ENDED') {
        const kb = new InlineKeyboard()
          .text('🏁 Завершить', `a:gw_end_now|i:${gwId}`)
          .row()
          .text('⬅️ Назад', `a:gw_open|i:${gwId}`)
          .row()
          .text('📋 Меню', 'a:menu')
          .text('🏠 Home', 'a:home');
        await safeEditOrReply(
          ctx,
          `⛔️ Сначала нужно <b>завершить</b> конкурс (🏁) или дождаться дедлайна.

После завершения появится кнопка <b>«🏆 Выбрать победителей»</b>.`,
          { parse_mode: 'HTML', reply_markup: kb }
        );
        return;
      }

      const kb = new InlineKeyboard()
        .text('🏆 Выбрать', `a:gw_draw_do|i:${gwId}`)
        .text('❌ Отмена', `a:gw_open|i:${gwId}`)
        .row()
        .text('🧾 Лог', `a:gw_log|i:${gwId}`)
        .row()
        .text('📋 Меню', 'a:menu')
        .text('🏠 Home', 'a:home');

      await safeEditOrReply(
        ctx,
        `🏆 <b>Выбрать победителей?</b>

Как выбираем:
• сначала из <b>eligible</b> (кто прошёл проверку)
• если eligible мало — добираем из всех участников
• выбор <b>детерминирован</b> (seed от конкурса + дедлайна), чтобы было честно и повторяемо

Дальше можно будет нажать <b>«📣 Опубликовать итоги»</b>.`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
      return;
    }

    if (p.a === 'a:gw_draw_do') {
      const gwId = Number(p.i);
      const g0 = await db.getGiveawayForOwner(gwId, u.id);
      if (!g0) return ctx.answerCallbackQuery({ text: 'Нет доступа.' });

      // Idempotency lock per giveaway
      const lockKey = k(['lock', 'gw_draw', gwId]);
      const locked = await redis.set(lockKey, { by: u.id }, { nx: true, ex: 30 });
      if (!locked) {
        await ctx.answerCallbackQuery({ text: 'Секунду… уже выбираю.' });
        return;
      }

      try {
        // Re-fetch (fresh)
        const g = await db.getGiveawayForOwner(gwId, u.id);
        if (!g) {
          await ctx.answerCallbackQuery({ text: 'Нет доступа.' });
          return;
        }

        const rawSt = String(g.status || '').toUpperCase();
        const effSt = gwEffectiveStatusValue(g);
        const already = rawSt === 'WINNERS_DRAWN' || rawSt === 'RESULTS_PUBLISHED' || !!g.winners_drawn_at;
        if (already) {
          await ctx.answerCallbackQuery({ text: 'Уже выбраны.' });
          await renderGwOpen(ctx, u.id, gwId);
          return;
        }

        // Ensure ENDED (Jobs-style: avoid surprises)
        if (effSt !== 'ENDED') {
          await ctx.answerCallbackQuery({ text: 'Сначала заверши конкурс.' });
          await renderGwOpen(ctx, u.id, gwId);
          return;
        }
        if (String(g.status || '').toUpperCase() !== 'ENDED') {
          try {
            await db.updateGiveaway(gwId, { status: 'ENDED' });
            await db.auditGiveaway(gwId, g.workspace_id, u.id, 'gw.ended_lazy', { by_time: true, manual_draw: true });
          } catch {}
        }

        // Prefer eligible participants. If not enough, fall back to all entries (transparent).
        const eligibleIds = await db.listEligibleUserIdsForGiveaway(gwId);
        let poolIds = eligibleIds;
        let fallback = false;
        if (!poolIds || poolIds.length === 0) {
          poolIds = await db.listAllUserIdsForGiveaway(gwId);
          fallback = true;
        }

        if (!poolIds || poolIds.length === 0) {
          await ctx.answerCallbackQuery({ text: 'Нет участников.' });
          await safeEditOrReply(ctx, '⛔️ У конкурса пока нет участников. Победителей выбрать нельзя.', { reply_markup: navKb(`a:gw_open|i:${gwId}`) });
          return;
        }

        const seedMode = g.ends_at ? 'ends_at' : 'now';
        const endsAtIso = g.ends_at ? new Date(g.ends_at).toISOString() : new Date().toISOString();
        const seedObj = makeSeed({ giveawayId: gwId, endsAtIso, eligibleUserIds: eligibleIds || [] });
        const { seedHash, eligibleHash } = seedObj;
        const rnd = makeXorShift32(seedObj.seed);

        const requested = Number(g.winners_count || 1) || 1;
        const count = Math.min(requested, poolIds.length);
        const winnersUserIds = sampleWithoutReplacement(poolIds, count, rnd);

        await db.setWinners(gwId, winnersUserIds.map((uid, idx) => ({ userId: uid, place: idx + 1 })));
        await db.updateGiveaway(gwId, { status: 'WINNERS_DRAWN', winners_drawn_at: new Date().toISOString() });
        await db.auditGiveaway(gwId, g.workspace_id, u.id, 'gw.winners_drawn', {
          manual: true,
          seedHash,
          eligibleHash,
          seed_mode: seedMode,
          winners: winnersUserIds.length,
          used_pool: fallback ? 'all_entries' : 'eligible',
          eligible_count: eligibleIds?.length || 0,
          entries_pool_count: poolIds.length,
          requested_winners: requested,
        });

        const toast = fallback ? 'Победители выбраны (есть добор) ✅' : 'Победители выбраны ✅';
        await ctx.answerCallbackQuery({ text: toast });
        await renderGwOpen(ctx, u.id, gwId);
      } catch (e) {
        await ctx.answerCallbackQuery({ text: 'Ошибка выбора.' });
      } finally {
        try { await redis.del(lockKey); } catch {}
      }
      return;
    }

    // Fallback for unknown/legacy callbacks: let dispatcher handle it
    return false;
  };

    await dispatchCallback(ctx, p, u, { legacy, logger, safeEditOrReply, isAdmin: (c) => isSuperAdminTg(c?.from?.id) });
    return;
  });

  BOT = bot;
  return bot;
  }


// -----------------------------
// Verification (feature-flag)
// -----------------------------

async function renderVerifyInfo(ctx) {
  const kb = new InlineKeyboard()
    .text('⬅️ Назад', 'a:verify_home')
    .text('📋 Меню', 'a:menu').text('🏠 Home', 'a:home');

  const text = `✅ <b>Верификация</b>

Зачем это нужно:
• ✅ знак повышает доверие в ленте
• брендам проще писать блогерам
• меньше спама и фейков

Как получить:
1) Подай заявку (1 сообщение)
2) Модератор проверит
3) Получишь ответ в этом чате`;

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
}

async function renderVerifyHome(ctx, userRow) {
  const v = await safeUserVerifications(() => db.getUserVerification(userRow.id), async () => null);
  const status = String(v?.status || 'NONE').toUpperCase();
  const kind = String(v?.kind || 'creator');

  const verifiedLimit = Math.max(0, Number(CFG.INTRO_DAILY_LIMIT || 0));
  const unverifiedLimit = Math.max(0, Number(CFG.INTRO_DAILY_LIMIT_UNVERIFIED || 0));
  const brandLimitLine = (verifiedLimit > unverifiedLimit && verifiedLimit > 0)
    ? `• Лимит интро в день: <b>${unverifiedLimit}</b> → <b>${verifiedLimit}</b>`
    : `• Более высокий лимит интро (после одобрения)`;
  const benefits = kind === 'brand'
    ? `

<b>Преимущества</b>:
${brandLimitLine}
• Больше доверия и выше шанс ответа
`
    : `

<b>Преимущества</b>:
• Бейдж ✅ рядом с каналом в ленте офферов и в диалогах
• Больше доверия со стороны брендов
`;

  let statusLine = '';
  if (status === 'APPROVED') statusLine = '✅ <b>Верифицирован(а)</b>';
  else if (status === 'PENDING') statusLine = '⏳ <b>На проверке</b>';
  else if (status === 'REJECTED') statusLine = '❌ <b>Отклонено</b>';
  else statusLine = '—';

  const kb = new InlineKeyboard();
  if (!v) {
    kb.text('🧑‍🎨 Я Creator', 'a:verify_kind|k:creator').row();
    kb.text('🏷 Я Brand', 'a:verify_kind|k:brand').row();
  } else if (status === 'REJECTED') {
    kb.text('🔁 Подать заново', `a:verify_kind|k:${kind}`).row();
  }
  kb.text('ℹ️ Как это работает', 'a:verify_info').row();
  kb.text('📋 Меню', 'a:menu');

  const reason = status === 'REJECTED' && v?.rejection_reason ? `

Причина:
${escapeHtml(v.rejection_reason)}` : '';
  const submitted = v?.submitted_at ? fmtTs(v.submitted_at) : null;
  const submittedLine = v ? `
Заявка: <tg-spoiler>${escapeHtml(submitted || '—')}</tg-spoiler>` : '';

  const text = `✅ <b>Верификация</b>

Статус: ${statusLine}
Тип: <b>${escapeHtml(kind)}</b>${submittedLine}${reason}

${benefits}
Чтобы отправить заявку — выбери роль и пришли 1 сообщение с пруфами.`;

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
}

// -----------------------------
// Admin helpers (payments + moderators)
// -----------------------------

async function renderAdminHome(ctx) {
  // Access is checked in the callback handler via isSuperAdminTg().

  let pending = 0;
  if (CFG.OFFICIAL_PUBLISH_ENABLED) {
    try {
      pending = await safeOfficialPosts(() => db.countOfficialPending(), async () => 0);
    } catch {
      pending = 0;
    }
  }

  let text = '👑 Админ-панель\n\n';
  text += '• Платежи: manual/apply\n';
  text += '• Метрики: DAU/MAU, конверсии, воронки\n';
  if (CFG.OFFICIAL_PUBLISH_ENABLED) text += `• Офиц.канал: очередь публикаций (${pending})\n`;

  const kb = new InlineKeyboard()
    .text('💰 Платежи', 'a:admin_payments')
    .row()
    .text('📈 Метрики', 'a:admin_metrics|d:14')
    .row();

  if (CFG.OFFICIAL_PUBLISH_ENABLED) {
    kb.text(`📣 Офиц.канал (${pending})`, 'a:off_queue|p:0').row();
  }

  kb.text('➕ Добавить модератора', 'a:admin_mod_add')
    .row()
    .text('📋 Модераторы', 'a:admin_mod_list')
    .row()
    .text('⬅️ Назад', 'a:menu');

  await safeEditOrReply(ctx, text, { reply_markup: kb });
}


async function renderAdminMetrics(ctx, days = 14) {
  const d = Math.max(1, Math.min(90, Number(days) || 14));
  const snap = await db.getAdminMetricsSnapshot(d);

  const usersTotal = snap?.users_total ?? '—';
  const wsTotal = snap?.workspaces_total ?? '—';
  const gwTotal = snap?.giveaways_total ?? '—';
  const gwActive = snap?.giveaways_active ?? '—';
  const offersTotal = snap?.offers_total ?? '—';
  const offersActive = snap?.offers_active ?? '—';

  let text = `📈 <b>Метрики</b> · окно <b>${d}д</b>

`;
  text += `👥 Пользователи: <b>${escapeHtml(String(usersTotal))}</b>
`;
  text += `📣 Каналы: <b>${escapeHtml(String(wsTotal))}</b>
`;
  text += `🎁 Конкурсы: <b>${escapeHtml(String(gwActive))}</b> активн. / <b>${escapeHtml(String(gwTotal))}</b> всего
`;
  text += `📦 Офферы: <b>${escapeHtml(String(offersActive))}</b> активн. / <b>${escapeHtml(String(offersTotal))}</b> всего
`;

  // Payments summary
  const pays = Array.isArray(snap?.payments) ? snap.payments : [];
  if (pays.length) {
    const byCurrency = new Map();
    for (const r of pays) {
      const cur = String(r.currency || '');
      const status = String(r.status || '');
      const key = `${status}::${cur}`;
      const prev = byCurrency.get(key) || { cnt: 0, amount_sum: 0 };
      byCurrency.set(key, { cnt: prev.cnt + Number(r.cnt || 0), amount_sum: prev.amount_sum + Number(r.amount_sum || 0) });
    }

    text += `
💳 <b>Payments</b> (за ${d}д)
`;
    for (const [key, v] of byCurrency.entries()) {
      const [status, cur] = key.split('::');
      text += `• ${escapeHtml(status)}: <b>${escapeHtml(String(v.cnt))}</b> / <b>${escapeHtml(String(v.amount_sum))} ${escapeHtml(cur)}</b>
`;
    }
  }

  // Optional analytics
  const topline = snap?.analytics_topline || null;
  if (topline) {
    text += `
📊 <b>Активность</b>
`;
    text += `DAU(24h): <b>${escapeHtml(String(topline.dau_24h ?? 0))}</b> · `;
    text += `WAU(7d): <b>${escapeHtml(String(topline.wau_7d ?? 0))}</b> · `;
    text += `MAU(30d): <b>${escapeHtml(String(topline.mau_30d ?? 0))}</b>
`;

    // Show last 7 days table (if available)
    const daily = Array.isArray(snap?.analytics_daily) ? snap.analytics_daily : [];
    if (daily.length) {
      const rows = daily.slice(0, 7);
      text += `
📅 Последние дни (MSK)
`;
      for (const r of rows) {
        const day = escapeHtml(String(r.day || '')); // already date
        text += `• ${day}: DAU ${escapeHtml(String(r.dau ?? 0))}, starts ${escapeHtml(String(r.starts ?? 0))}, ws ${escapeHtml(String(r.ws_created ?? 0))}, gw ${escapeHtml(String(r.gw_published ?? 0))}
`;
      }
    }
  } else {
    text += `
ℹ️ Analytics выключены (ANALYTICS_ENABLED=false) — показываю базовые счётчики.`;
  }

  const kb = new InlineKeyboard()
    .text('7д', 'a:admin_metrics|d:7')
    .text('14д', 'a:admin_metrics|d:14')
    .row()
    .text('30д', 'a:admin_metrics|d:30')
    .text('90д', 'a:admin_metrics|d:90')
    .row()
    .text('📋 Модераторы', 'a:admin_mod_list')
    .row()
    .text('⬅️ Админка', 'a:admin_home');

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
}

async function renderAdminModerators(ctx) {
  const rows = await db.listNetworkModerators();

  let text = `📋 <b>Модераторы</b>

`;
  if (!rows.length) {
    text += 'Пока нет модераторов.';
  } else {
    for (const r of rows) {
      const who = r.tg_username ? '@' + r.tg_username : 'id ' + r.tg_id;
      const when = r.created_at ? new Date(r.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }) : '—';
      text += `• <b>${escapeHtml(who)}</b> · ${escapeHtml(when)}
`;
    }
  }

  const kb = new InlineKeyboard()
    .text('➕ Добавить модератора', 'a:admin_mod_add')
    .row();

  // Remove buttons
  for (const r of rows) {
    const who = r.tg_username ? '@' + r.tg_username : 'id ' + r.tg_id;
    kb.text(`🗑 ${who}`, `a:admin_mod_rm|uid:${r.user_id}`).row();
  }

  kb.text('⬅️ Админка', 'a:admin_home');

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
}

async function renderAdminPayments(ctx, statusRaw = 'ORPHANED', page = 0) {
  const status = String(statusRaw || 'ORPHANED').toUpperCase();
  const limit = 10;
  const offset = Math.max(0, Number(page) || 0) * limit;

  const rows = await db.listPaymentsByStatus(status, limit, offset);
  const lines = rows
    .map((r) => {
      const when = new Date(r.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
      const who = r.username ? '@' + r.username : 'id ' + r.tg_id;
      return `#${r.id} • ${r.kind} • ${who} • ${r.total_amount} ${r.currency} • ${when}`;
    })
    .join('\n') || 'Платежей нет.';

  const kb = new InlineKeyboard();
  for (const r of rows) {
    kb.text(`#${r.id} • ${r.kind}`, `a:admin_pay_view|id:${r.id}|st:${status}|p:${Math.max(0, Number(page) || 0)}`).row();
  }
  if ((Number(page) || 0) > 0) kb.text('⬅️ Назад', `a:admin_payments|st:${status}|p:${Number(page) - 1}`);
  if (rows.length === limit) kb.text('➡️ Далее', `a:admin_payments|st:${status}|p:${Number(page) + 1}`);
    kb.row().text('⬅️ Админка', 'a:admin_home');

  await safeEditOrReply(ctx, 
    `💳 <b>Payments</b> • <b>${escapeHtml(status)}</b>

${escapeHtml(lines)}`,
    { parse_mode: 'HTML', reply_markup: kb }
  );
}

async function renderAdminPaymentView(ctx, paymentId, backStatus = 'ORPHANED', page = 0) {
  const p = await db.getPaymentById(Number(paymentId));
  if (!p) {
    await safeEditOrReply(ctx, '⚠️ Платеж не найден.', { reply_markup: navKb(`a:admin_payments|st:${backStatus}|p:${page}`) });
    return;
  }

  const payload = String(p.invoice_payload || '');
  const when = new Date(p.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  const who = p.username ? '@' + p.username : 'id ' + p.tg_id;
  const canApply = (p.status === 'ORPHANED' || p.status === 'ERROR' || p.status === 'RECEIVED') &&
    (payload.startsWith('pro_') || payload.startsWith('brand_') || payload.startsWith('bplan_') || payload.startsWith('offpub_'));

  const kb = new InlineKeyboard();
  if (canApply) kb.text('✅ Apply (manual)', `a:admin_pay_apply|id:${p.id}|st:${backStatus}|p:${page}`).row();
  kb.text('⬅️ К списку', `a:admin_payments|st:${backStatus}|p:${page}`).row();
  kb.text('⬅️ Админка', 'a:admin_home');

  const text = `💳 <b>Payment #${p.id}</b>

Status: <b>${escapeHtml(p.status)}</b>
Kind: <b>${escapeHtml(p.kind)}</b>
User: <b>${escapeHtml(who)}</b>
Amount: <b>${p.total_amount} ${escapeHtml(p.currency)}</b>
Created: <b>${escapeHtml(when)}</b>

Charge:
<tg-spoiler>${escapeHtml(String(p.telegram_payment_charge_id || '—'))}</tg-spoiler>

Payload:
<tg-spoiler>${escapeHtml(payload)}</tg-spoiler>

Note:
<tg-spoiler>${escapeHtml(String(p.note || '—'))}</tg-spoiler>`;

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
}

async function adminApplyPayment(ctx, adminUserRow, paymentId, backStatus = 'ORPHANED', page = 0) {
  const row = await db.getPaymentById(Number(paymentId));
  if (!row) {
    await ctx.answerCallbackQuery({ text: 'Платеж не найден.', show_alert: true });
    await renderAdminPayments(ctx, backStatus, page);
    return;
  }

  if (row.status === 'APPLIED') {
    await ctx.answerCallbackQuery({ text: 'Уже применён ✅', show_alert: true });
    await renderAdminPaymentView(ctx, row.id, backStatus, page);
    return;
  }

  const payload = String(row.invoice_payload || '');
  try {
    if (payload.startsWith('pro_')) {
      const parts = payload.split('_');
      const wsId = Number(parts[1]);
      if (!wsId) throw new Error('Bad wsId');
      await db.activateWorkspacePro(wsId, CFG.PRO_DURATION_DAYS);
      await db.auditWorkspace(wsId, adminUserRow.id, 'pro.activated.manual', {
        payment_id: row.id,
        telegram_payment_charge_id: row.telegram_payment_charge_id
      });
      await db.markPaymentApplied(row.id, adminUserRow.id, 'manual_apply_pro');
      await ctx.answerCallbackQuery({ text: 'PRO применён ✅', show_alert: true });
      await renderAdminPaymentView(ctx, row.id, backStatus, page);
      return;
    }

    if (payload.startsWith('brand_')) {
      const parts = payload.split('_');
      const userId = Number(parts[1]);
      const packId = Number(parts[2]);
      const pack = getBrandPack(packId);
      if (!userId || !pack) throw new Error('Bad userId/pack');
      await db.addBrandCredits(userId, Number(pack.credits));
      await db.markPaymentApplied(row.id, adminUserRow.id, `manual_apply_brand_pass:+${pack.credits}`);
      await ctx.answerCallbackQuery({ text: 'Brand Pass применён ✅', show_alert: true });
      await renderAdminPaymentView(ctx, row.id, backStatus, page);
      return;
    }

    if (payload.startsWith('bplan_')) {
      const parts = payload.split('_');
      const userId = Number(parts[1]);
      const plan = String(parts[2] || 'basic').toLowerCase();
      if (!userId) throw new Error('Bad userId');
      await db.activateBrandPlan(userId, plan, CFG.BRAND_PLAN_DURATION_DAYS);
      await db.markPaymentApplied(row.id, adminUserRow.id, `manual_apply_brand_plan:${plan}`);
      await ctx.answerCallbackQuery({ text: 'Brand Plan применён ✅', show_alert: true });
      await renderAdminPaymentView(ctx, row.id, backStatus, page);
      return;
    }

    if (payload.startsWith('offpub_')) {
      const parts = payload.split('_');
      const offerId = Number(parts[2]);
      const days = Number(parts[3] || CFG.OFFICIAL_MANUAL_DEFAULT_DAYS);
      if (!CFG.OFFICIAL_PUBLISH_ENABLED) throw new Error('Official publishing disabled');
      if (!offerId) throw new Error('Bad offerId');
      await publishOfferToOfficialChannel(ctx.api, offerId, {
        placementType: 'PAID',
        paymentId: row.id,
        days,
        publishedByUserId: adminUserRow.id,
        keepExpiry: false
      });
      await db.markPaymentApplied(row.id, adminUserRow.id, `manual_apply_official_publish:${offerId}:${days}d`);
      await ctx.answerCallbackQuery({ text: 'Опубликовано ✅', show_alert: true });
      await renderAdminPaymentView(ctx, row.id, backStatus, page);
      return;
    }

    // match/feat or unknown
    await ctx.answerCallbackQuery({ text: 'Эта услуга не поддерживает apply.', show_alert: true });
    await renderAdminPaymentView(ctx, row.id, backStatus, page);
    return;
  } catch (e) {
    const msg = String(e?.message || e);
    try {
      await db.setPaymentStatus(row.id, 'ERROR', `manual_apply_error: ${msg.slice(0, 160)}`);
    } catch {
      // ignore
    }
    await ctx.answerCallbackQuery({ text: `Ошибка apply: ${msg.slice(0, 64)}`, show_alert: true });
    await renderAdminPaymentView(ctx, row.id, backStatus, page);
  }
}

// -----------------------------
// Moderation render helpers (v1.0.0)
// -----------------------------

async function renderModHome(ctx) {
  const kb = new InlineKeyboard()
    .text('🚩 Жалобы/споры', 'a:mod_reports');

  if (CFG.VERIFICATION_ENABLED) {
    const pending = await safeUserVerifications(() => db.countPendingVerifications(), async () => 0);
    kb.row().text(`✅ Верификации (${pending})`, 'a:mod_verifs');
  }

  if (CFG.OFFICIAL_PUBLISH_ENABLED) {
    kb.row().text('📣 Офиц.канал', 'a:off_queue|p:0');
  }

  kb.row().text('📋 Меню', 'a:menu');
  await safeEditOrReply(ctx, '🛡 <b>Модерация</b>\n\nВыбери действие:', { parse_mode: 'HTML', reply_markup: kb });
}

async function renderModReports(ctx, page = 0) {
  const limit = 10;
  const offset = page * limit;
  const rows = await db.listOpenBarterReports(limit, offset);

  const lines = rows.map((r) => {
    const kind = r.thread_id ? 'thread' : 'offer';
    const who = r.reporter_username ? '@' + r.reporter_username : 'id ' + r.reporter_tg_id;
    const when = new Date(r.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    return `#${r.id} • ${kind} • ${who} • ${when}`;
  }).join('\n') || 'Пока нет открытых жалоб.';

  const kb = new InlineKeyboard();
  for (const r of rows) {
    kb.text(`#${r.id}`, `a:mod_report|r:${r.id}`).row();
  }
  if (page > 0) kb.text('⬅️ Назад', `a:mod_reports|p:${page - 1}`);
  if (rows.length === limit) kb.text('➡️ Далее', `a:mod_reports|p:${page + 1}`);
    kb.row().text('⬅️ Модерация', 'a:mod_home');

  await safeEditOrReply(ctx, `🚩 <b>Очередь жалоб</b>\n\n${escapeHtml(lines)}`, { parse_mode: 'HTML', reply_markup: kb });
}

async function renderModReportView(ctx, reportId) {
  const r = await db.getBarterReport(reportId);
  if (!r) {
    await safeEditOrReply(ctx, 'Жалоба не найдена.', { reply_markup: navKb('a:mod_reports') });
    return;
  }
  const who = r.reporter_username ? '@' + r.reporter_username : 'id ' + r.reporter_tg_id;
  const created = new Date(r.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });

  const kb = new InlineKeyboard();
  if (r.offer_id) kb.text('⛔️ Заморозить оффер', `a:mod_r_freeze|r:${r.id}`).row();
  if (r.thread_id) kb.text('🔒 Закрыть тред', `a:mod_r_close|r:${r.id}`).row();
  kb.text('✅ Закрыть жалобу', `a:mod_r_resolve|r:${r.id}`).row();
  kb.text('⬅️ К очереди', 'a:mod_reports').row();

  const text = `🚩 <b>Жалоба #${r.id}</b>\n\n` +
    `От: ${escapeHtml(who)}\n` +
    `Когда: ${escapeHtml(created)}\n` +
    `Статус: ${escapeHtml(r.status)}\n` +
    (r.offer_id ? `Оффер: #${r.offer_id}\n` : '') +
    (r.thread_id ? `Тред: #${r.thread_id}\n` : '') +
    `\nПричина:\n${escapeHtml(r.reason || '—')}`;

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
}


async function renderModVerifs(ctx, page = 0) {
  const limit = 10;
  const offset = page * limit;
  const rows = await safeUserVerifications(() => db.listPendingVerifications(limit, offset), async () => []);
  const total = await safeUserVerifications(() => db.countPendingVerifications(), async () => 0);

  const kb = new InlineKeyboard();
  for (const r of rows) {
    const who = r.tg_username ? '@' + r.tg_username : ('tg:' + r.tg_id);
    const kind = String(r.kind || 'creator');
    kb.text(`👀 ${who} · ${kind}`, `a:mod_verif_view|uid:${r.user_id}|p:${page}`).row();
  }

  const hasPrev = page > 0;
  const hasNext = offset + rows.length < total;
  if (hasPrev) kb.text('⬅️ Назад', `a:mod_verifs|p:${page - 1}`);
  if (hasNext) kb.text('➡️ Далее', `a:mod_verifs|p:${page + 1}`);
    kb.row().text('⬅️ Модерация', 'a:mod_home');

  const text = `✅ <b>Верификации</b>

Ожидают: <b>${total}</b>

` + (rows.length
    ? rows.map((r) => {
      const who = r.tg_username ? '@' + r.tg_username : ('tg:' + r.tg_id);
      const when = r.submitted_at ? fmtTs(r.submitted_at) : '—';
      const kind = String(r.kind || 'creator');
      return `• <b>${escapeHtml(who)}</b> · ${escapeHtml(kind)} · <tg-spoiler>${escapeHtml(when)}</tg-spoiler>`;
    }).join('\n')
    : 'Пока нет заявок.');

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
}

async function renderModVerifView(ctx, userId, page = 0) {
  const v = await safeUserVerifications(() => db.getUserVerification(userId), async () => null);
  if (!v) { try { await ctx.answerCallbackQuery({ text: 'Заявка не найдена.' }); } catch {} return; }

  const who = v.tg_username ? '@' + v.tg_username : ('tg:' + v.tg_id);
  const when = v.submitted_at ? fmtTs(v.submitted_at) : '—';
  const kind = String(v.kind || 'creator');
  const text = `✅ <b>Заявка на верификацию</b>

` +
    `Пользователь: <b>${escapeHtml(who)}</b>
` +
    `Тип: <b>${escapeHtml(kind)}</b>
` +
    `Когда: <tg-spoiler>${escapeHtml(when)}</tg-spoiler>

` +
    `<b>Текст заявки:</b>
${escapeHtml(v.submitted_text || '—')}`;

  const kb = new InlineKeyboard()
    .text('✅ Approve', `a:mod_verif_approve|uid:${userId}|p:${page}`)
    .text('❌ Reject', `a:mod_verif_reject|uid:${userId}|p:${page}`)
    .row()
    .text('⬅️ К очереди', `a:mod_verifs|p:${page}`)
    .text('⬅️ Модерация', 'a:mod_home');

  await safeEditOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb });
}
