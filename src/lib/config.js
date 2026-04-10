import 'dotenv/config'; 

function parseIntSafe(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function parseBoolSafe(v, d = false) {
  if (v === undefined || v === null || v === '') return d;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
  return d;
}

function parseCsvNums(v) {
  if (!v) return [];
  return String(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function parseCsvStr(v) {
  if (!v) return [];
  return String(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseEncKey32(input) {
  const s = String(input || '').trim();
  if (!s) return { key: null, kind: 'missing' };

  // 32 bytes hex (64 chars)
  if (/^[0-9a-fA-F]{64}$/.test(s)) {
    return { key: Buffer.from(s, 'hex'), kind: 'hex64' };
  }

  // base64/base64url (>=32 bytes)
  try {
    // Normalize base64url -> base64
    let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if missing
    const pad = b64.length % 4;
    if (pad) b64 = b64 + '='.repeat(4 - pad);
    const b = Buffer.from(b64, 'base64');
    if (b.length >= 32) return { key: b.subarray(0, 32), kind: 'base64' };
  } catch {
    // ignore
  }

  return { key: null, kind: 'invalid' };
}


const DEFAULT_SUPER_ADMINS = '';

const IG_ENC = parseEncKey32(process.env.IG_TOKEN_ENC_KEY || '');

const PAYMENT_SESSION_TTL_MIN = (() => {
  const m = parseIntSafe(process.env.PAYMENT_SESSION_TTL_MIN, 360); // default: 6h
  return Math.max(10, Math.min(m, 24 * 60)); // 10 min .. 24h
})();

// Ops alerts: summarize noisy alerts in a digest every N minutes.
const OPS_ALERT_SUMMARY_MIN = (() => {
  const m = parseIntSafe(process.env.OPS_ALERT_SUMMARY_MIN, 10);
  return Math.max(1, Math.min(m, 60)); // 1..60 min
})();

// Ops alerts: "silent" mode — only send alerts for failures/errors (no info/warn noise).
// Default ON: current code mostly emits only error-level alerts, so this is safe.
const OPS_ALERT_SILENT = parseBoolSafe(process.env.OPS_ALERT_SILENT, true);

// expectText (text input mode): cap the total lifetime to avoid “stuck forever” UX.
const EXPECT_TEXT_MAX_LIFETIME_SEC = (() => {
  const n = parseIntSafe(process.env.EXPECT_TEXT_MAX_LIFETIME_SEC, 2 * 60 * 60); // default: 2h
  return Math.max(5 * 60, Math.min(n, 24 * 60 * 60)); // 5min..24h
})();

export const CFG = {
  APP_ENV: process.env.APP_ENV || 'dev',

  // Variant (for copy+paste deployments on one core)
  BOT_VARIANT: process.env.BOT_VARIANT || 'collab_girls',

  // Telegram bot
  BOT_TOKEN: process.env.BOT_TOKEN || '',
  BOT_USERNAME: (process.env.BOT_USERNAME || '').replace(/^@/, ''),
  BOT_ID: process.env.BOT_ID ? Number(process.env.BOT_ID) : 0,

  // Support / feedback routing (optional). Set to a Telegram group/chat id to collect feedback.
  SUPPORT_CHAT_ID: process.env.SUPPORT_CHAT_ID || '',

  // Ops alerts / operator chat (support chat is also used for ops alerts).
  OPS_ALERT_SUMMARY_MIN,
  OPS_ALERT_SUMMARY_SEC: OPS_ALERT_SUMMARY_MIN * 60,
  OPS_ALERT_BUFFER_MAX: parseIntSafe(process.env.OPS_ALERT_BUFFER_MAX, 200),
  OPS_ALERT_SILENT,

  // expectText (text input mode): total lifetime cap (seconds)
  EXPECT_TEXT_MAX_LIFETIME_SEC,

  // Security
  WEBHOOK_SECRET_TOKEN: process.env.WEBHOOK_SECRET_TOKEN || '',
  CRON_SECRET: process.env.CRON_SECRET || '',

  // DB
  DATABASE_URL: process.env.DATABASE_URL || '',

  // Access checks
  TG_ACCESS_CHECK_CONCURRENCY: parseIntSafe(process.env.TG_ACCESS_CHECK_CONCURRENCY, 4),

  // Barters
  BARTER_FEED_PAGE_SIZE: parseIntSafe(process.env.BARTER_FEED_PAGE_SIZE, 5),
  BARTER_INBOX_PAGE_SIZE: parseIntSafe(process.env.BARTER_INBOX_PAGE_SIZE, 10),

  // Backwards compat (v0.9.x)
  BARTER_BUMP_COOLDOWN_HOURS: parseIntSafe(process.env.BARTER_BUMP_COOLDOWN_HOURS, 6),

  // Free / Pro tuning
  BARTER_MAX_ACTIVE_OFFERS_FREE: parseIntSafe(process.env.BARTER_MAX_ACTIVE_OFFERS_FREE, 3),
  BARTER_MAX_ACTIVE_OFFERS_PRO: parseIntSafe(process.env.BARTER_MAX_ACTIVE_OFFERS_PRO, 10),
  BARTER_BUMP_COOLDOWN_HOURS_FREE: parseIntSafe(process.env.BARTER_BUMP_COOLDOWN_HOURS_FREE, 24),
  BARTER_BUMP_COOLDOWN_HOURS_PRO: parseIntSafe(process.env.BARTER_BUMP_COOLDOWN_HOURS_PRO, 6),

  // Monetization (microbloggers)
  PRO_STARS_PRICE: parseIntSafe(process.env.PRO_STARS_PRICE, 500),
  PRO_DURATION_DAYS: parseIntSafe(process.env.PRO_DURATION_DAYS, 30),
  PRO_PAYMENT_URL: process.env.PRO_PAYMENT_URL || '',
  PAY_SUPPORT_TEXT: process.env.PAY_SUPPORT_TEXT || '',

  // Monetization (brands) — unified Brand Plan
  BRAND_PLAN_START_PRICE: parseIntSafe(process.env.BRAND_PLAN_START_PRICE, 250),
  BRAND_PLAN_START_CREDITS: parseIntSafe(process.env.BRAND_PLAN_START_CREDITS, 10),
  BRAND_PLAN_PRO_PRICE: parseIntSafe(process.env.BRAND_PLAN_PRO_PRICE, 1000),
  BRAND_PLAN_PRO_CREDITS: parseIntSafe(process.env.BRAND_PLAN_PRO_CREDITS, 50),
  BRAND_PLAN_PRO_MATCH: parseIntSafe(process.env.BRAND_PLAN_PRO_MATCH, 10),
  BRAND_PLAN_PRO_FEATURED_DAYS: parseIntSafe(process.env.BRAND_PLAN_PRO_FEATURED_DAYS, 7),
  BRAND_PLAN_DURATION_DAYS: parseIntSafe(process.env.BRAND_PLAN_DURATION_DAYS, 30),

  // Founder Sale (limited time promo; UI-only, no migrations)
  FOUNDER_SALE_ENABLED: parseBoolSafe(process.env.FOUNDER_SALE_ENABLED, false),
  FOUNDER_SALE_DEADLINE: process.env.FOUNDER_SALE_DEADLINE || '',
  FOUNDER_BRAND_3M_PRICE: parseIntSafe(process.env.FOUNDER_BRAND_3M_PRICE, 0),
  FOUNDER_BRAND_12M_PRICE: parseIntSafe(process.env.FOUNDER_BRAND_12M_PRICE, 0),
  FOUNDER_CREATOR_12M_PRICE: parseIntSafe(process.env.FOUNDER_CREATOR_12M_PRICE, 0),
  FOUNDER_BRAND_3M_CREDITS: parseIntSafe(process.env.FOUNDER_BRAND_3M_CREDITS, 0),
  FOUNDER_BRAND_12M_CREDITS: parseIntSafe(process.env.FOUNDER_BRAND_12M_CREDITS, 0),

  // Legacy compat (kept for existing env vars)
  BRAND_PLAN_BASIC_PRICE: parseIntSafe(process.env.BRAND_PLAN_BASIC_PRICE, 250),
  BRAND_PLAN_MAX_PRICE: parseIntSafe(process.env.BRAND_PLAN_MAX_PRICE, 1000),

  // Credit top-up packs (aligned to TG Stars denominations)
  BRAND_TOPUP_S_PRICE: parseIntSafe(process.env.BRAND_TOPUP_S_PRICE, 100),
  BRAND_TOPUP_S_CREDITS: parseIntSafe(process.env.BRAND_TOPUP_S_CREDITS, 10),
  BRAND_TOPUP_M_PRICE: parseIntSafe(process.env.BRAND_TOPUP_M_PRICE, 250),
  BRAND_TOPUP_M_CREDITS: parseIntSafe(process.env.BRAND_TOPUP_M_CREDITS, 30),
  BRAND_TOPUP_L_PRICE: parseIntSafe(process.env.BRAND_TOPUP_L_PRICE, 750),
  BRAND_TOPUP_L_CREDITS: parseIntSafe(process.env.BRAND_TOPUP_L_CREDITS, 100),

  MATCH_S_PRICE: parseIntSafe(process.env.MATCH_S_PRICE, 699),
  MATCH_M_PRICE: parseIntSafe(process.env.MATCH_M_PRICE, 1499),
  MATCH_L_PRICE: parseIntSafe(process.env.MATCH_L_PRICE, 2999),
  MATCH_S_COUNT: parseIntSafe(process.env.MATCH_S_COUNT, 10),
  MATCH_M_COUNT: parseIntSafe(process.env.MATCH_M_COUNT, 30),
  MATCH_L_COUNT: parseIntSafe(process.env.MATCH_L_COUNT, 75),

  FEATURED_1D_PRICE: parseIntSafe(process.env.FEATURED_1D_PRICE, 399),
  FEATURED_7D_PRICE: parseIntSafe(process.env.FEATURED_7D_PRICE, 999),
  FEATURED_30D_PRICE: parseIntSafe(process.env.FEATURED_30D_PRICE, 2999),
  FEATURED_MAX_SLOTS: parseIntSafe(process.env.FEATURED_MAX_SLOTS, 5),

  // Official channel publishing
  OFFICIAL_PUBLISH_ENABLED: parseBoolSafe(process.env.OFFICIAL_PUBLISH_ENABLED, false),
  OFFICIAL_PUBLISH_MODE: String(process.env.OFFICIAL_PUBLISH_MODE || 'manual').trim().toLowerCase(), // manual | paid | mixed
  OFFICIAL_CHANNEL_ID: process.env.OFFICIAL_CHANNEL_ID || '',
  OFFICIAL_CHANNEL_USERNAME: (process.env.OFFICIAL_CHANNEL_USERNAME || '').replace(/^@/, ''),
  OFFICIAL_MANUAL_DEFAULT_DAYS: parseIntSafe(process.env.OFFICIAL_MANUAL_DEFAULT_DAYS, 3),
  OFFICIAL_1D_PRICE: parseIntSafe(process.env.OFFICIAL_1D_PRICE, 199),
  OFFICIAL_7D_PRICE: parseIntSafe(process.env.OFFICIAL_7D_PRICE, 499),
  OFFICIAL_30D_PRICE: parseIntSafe(process.env.OFFICIAL_30D_PRICE, 1299),

  // Intro credits & anti-spam
  // 1-time bonus credits for brands on the first intro attempts (trial).
  INTRO_TRIAL_CREDITS: parseIntSafe(process.env.INTRO_TRIAL_CREDITS, 3),
  INTRO_COST_PER_INTRO: parseIntSafe(process.env.INTRO_COST_PER_INTRO, 1),
  INTRO_DAILY_LIMIT: parseIntSafe(process.env.INTRO_DAILY_LIMIT, 20),
  INTRO_DAILY_LIMIT_UNVERIFIED: parseIntSafe(process.env.INTRO_DAILY_LIMIT_UNVERIFIED, 10),
  // Intro retry credits (fairness): no reply → retry credit
  INTRO_RETRY_ENABLED: parseBoolSafe(process.env.INTRO_RETRY_ENABLED, false),
  INTRO_RETRY_AFTER_HOURS: parseIntSafe(process.env.INTRO_RETRY_AFTER_HOURS, 24),
  INTRO_RETRY_EXPIRES_DAYS: parseIntSafe(process.env.INTRO_RETRY_EXPIRES_DAYS, 7),
  INTRO_RETRY_NOTIFY: parseBoolSafe(process.env.INTRO_RETRY_NOTIFY, true),

  // Acquisition counters (Redis-only): TTL for "total" buckets.
  // - Default: 365 days (bounded memory)
  // - Set to 0 to keep totals forever
  ACQ_TOTAL_TTL_DAYS: (() => {
    const n = parseIntSafe(process.env.ACQ_TOTAL_TTL_DAYS, 365);
    if (!Number.isFinite(n) || n < 0) return 365;
    return Math.max(0, Math.min(n, 3650)); // 0..10y
  })(),


  // Giveaways
  GIVEAWAY_SPONSORS_MAX_FREE: parseIntSafe(process.env.GIVEAWAY_SPONSORS_MAX_FREE, 10),
  GIVEAWAY_SPONSORS_MAX_PRO: parseIntSafe(process.env.GIVEAWAY_SPONSORS_MAX_PRO, 30),

  // Giveaways: optional auto-notifications
  // Jobs-style defaults: notify owner in DM; channel notify is opt-in.
  GIVEAWAY_NOTIFY_OWNER_ON_END: parseBoolSafe(process.env.GIVEAWAY_NOTIFY_OWNER_ON_END, true),
  GIVEAWAY_NOTIFY_OWNER_ON_WINNERS: parseBoolSafe(process.env.GIVEAWAY_NOTIFY_OWNER_ON_WINNERS, true),
  GIVEAWAY_NOTIFY_CHANNEL_ON_END: parseBoolSafe(process.env.GIVEAWAY_NOTIFY_CHANNEL_ON_END, false),
  GIVEAWAY_NOTIFY_CHANNEL_ON_WINNERS: parseBoolSafe(process.env.GIVEAWAY_NOTIFY_CHANNEL_ON_WINNERS, false),

  // Workspace channel folders
  WORKSPACE_FOLDER_MAX_ITEMS_FREE: parseIntSafe(process.env.WORKSPACE_FOLDER_MAX_ITEMS_FREE, 10),
  WORKSPACE_FOLDER_MAX_ITEMS_PRO: parseIntSafe(process.env.WORKSPACE_FOLDER_MAX_ITEMS_PRO, 30),
  WORKSPACE_EDITOR_INVITE_TTL_MIN: parseIntSafe(process.env.WORKSPACE_EDITOR_INVITE_TTL_MIN, 10),

  // Workspace curators (team)
  WORKSPACE_CURATORS_MAX_FREE: parseIntSafe(process.env.WORKSPACE_CURATORS_MAX_FREE, 1),
  WORKSPACE_CURATORS_MAX_PRO: parseIntSafe(process.env.WORKSPACE_CURATORS_MAX_PRO, 5),

  // Payments toggles (runtime override via admin → stored in Redis)
  PAYMENTS_ACCEPT_DEFAULT: parseBoolSafe(process.env.PAYMENTS_ACCEPT_DEFAULT, true),
  PAYMENTS_AUTO_APPLY_DEFAULT: parseBoolSafe(process.env.PAYMENTS_AUTO_APPLY_DEFAULT, true),
  // Payments: fulfill based on invoice payload even if Redis pay_* session expired.
  // Helps eliminate ORPHANED: missing_session.
  PAYMENTS_FALLBACK_APPLY_ENABLED: parseBoolSafe(process.env.PAYMENTS_FALLBACK_APPLY_ENABLED, false),
  // Payments: HMAC-sign invoice payload token to prevent forged/foreign payloads in fallback.
  // If key is set, new invoices include token+sig (hex). Fallback verifies signature.
  PAYMENTS_PAYLOAD_HMAC_KEY: String(process.env.PAYMENTS_PAYLOAD_HMAC_KEY || '').trim(),
  PAYMENTS_PAYLOAD_HMAC_LEN: (() => {
    const n = parseIntSafe(process.env.PAYMENTS_PAYLOAD_HMAC_LEN, 10);
    return Math.max(6, Math.min(n, 16));
  })(),
  // Allow unsigned legacy payloads in fallback when HMAC key is configured.
  // Keep disabled by default; enable temporarily only if you must process old invoices without signature.
  PAYMENTS_FALLBACK_ALLOW_UNSIGNED: parseBoolSafe(process.env.PAYMENTS_FALLBACK_ALLOW_UNSIGNED, false),


  // Payments: auto-heal ORPHANED payments with note=missing_session (cron + admin action).
  PAYMENTS_ORPHANED_AUTOHEAL_ENABLED: parseBoolSafe(process.env.PAYMENTS_ORPHANED_AUTOHEAL_ENABLED, true),
  PAYMENTS_ORPHANED_AUTOHEAL_BATCH: (() => {
    const n = parseIntSafe(process.env.PAYMENTS_ORPHANED_AUTOHEAL_BATCH, 20);
    return Math.max(0, Math.min(n, 100));
  })(),
  PAYMENTS_ORPHANED_AUTOHEAL_MIN_AGE_SEC: (() => {
    const n = parseIntSafe(process.env.PAYMENTS_ORPHANED_AUTOHEAL_MIN_AGE_SEC, 300);
    return Math.max(0, Math.min(n, 3600)); // 0..3600 sec
  })(),
  PAYMENTS_ORPHANED_AUTOHEAL_CHAIN_MAX: (() => {
    const n = parseIntSafe(process.env.PAYMENTS_ORPHANED_AUTOHEAL_CHAIN_MAX, 3);
    return Math.max(0, Math.min(n, 12));
  })(),
  // Smart Matching / Featured paid add-ons: allow full auto-apply on successful Stars payment
  // When disabled, paid match/feat payments are marked ORPHANED and require admin processing.
  MATCH_FEAT_AUTO_APPLY_ENABLED: parseBoolSafe(process.env.MATCH_FEAT_AUTO_APPLY_ENABLED, false),

  // Payments: link Stars invoice payloads to UI context (Redis pay_* tokens).
  // Increase to reduce ORPHANED due to expired session; keep bounded.
  PAYMENT_SESSION_TTL_MIN: PAYMENT_SESSION_TTL_MIN,
  PAYMENT_SESSION_TTL_SEC: PAYMENT_SESSION_TTL_MIN * 60,

  // Feature flags
  ANALYTICS_ENABLED: parseBoolSafe(process.env.ANALYTICS_ENABLED, false),

  // Public base URL (needed for signed webhooks / QStash delivery URLs)
  // Prefer explicit env. Fallback to Vercel provided hostname.
  PUBLIC_BASE_URL:
    process.env.PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : ''),

  // Invite layer (optional): cached Telegram photo for inline/card sharing.
  INVITE_PHOTO_FILE_ID: process.env.INVITE_PHOTO_FILE_ID || '',

  // Admin web sidecar (optional, owner/operator only)
  ADMIN_WEB_ENABLED: parseBoolSafe(process.env.ADMIN_WEB_ENABLED, false),
  ADMIN_WEB_SECRET: process.env.ADMIN_WEB_SECRET || '',
  ADMIN_WEB_SESSION_SECRET: process.env.ADMIN_WEB_SESSION_SECRET || '',
  ADMIN_WEB_APPROVER_TG_IDS: parseCsvNums(process.env.ADMIN_WEB_APPROVER_TG_IDS || process.env.SUPER_ADMIN_TG_IDS || DEFAULT_SUPER_ADMINS),
  ADMIN_WEB_LOGIN_TTL_SEC: (() => {
    const n = parseIntSafe(process.env.ADMIN_WEB_LOGIN_TTL_SEC, 300);
    return Math.max(60, Math.min(n, 1800));
  })(),
  ADMIN_WEB_SESSION_TTL_SEC: (() => {
    const n = parseIntSafe(process.env.ADMIN_WEB_SESSION_TTL_SEC, 8 * 60 * 60);
    return Math.max(600, Math.min(n, 24 * 60 * 60));
  })(),
  ADMIN_WEB_IDLE_TIMEOUT_SEC: (() => {
    const n = parseIntSafe(process.env.ADMIN_WEB_IDLE_TIMEOUT_SEC, 30 * 60);
    return Math.max(300, Math.min(n, 8 * 60 * 60));
  })(),

  // QStash (optional): delivery/retry/publish queues in serverless-safe way
  QSTASH_URL: process.env.QSTASH_URL || '',
  QSTASH_TOKEN: process.env.QSTASH_TOKEN || '',
  QSTASH_CURRENT_SIGNING_KEY: process.env.QSTASH_CURRENT_SIGNING_KEY || '',
  QSTASH_NEXT_SIGNING_KEY: process.env.QSTASH_NEXT_SIGNING_KEY || '',

  // QStash (optional): broadcast fan-out in serverless-safe way
  QSTASH_BROADCAST_PARALLELISM: (() => {
    const n = parseIntSafe(process.env.QSTASH_BROADCAST_PARALLELISM, 8);
    return Math.max(1, Math.min(n, 50));
  })(),
  QSTASH_BROADCAST_RATE_PER_SEC: (() => {
    const n = parseIntSafe(process.env.QSTASH_BROADCAST_RATE_PER_SEC, 20);
    return Math.max(1, Math.min(n, 200));
  })(),
  QSTASH_BROADCAST_RETRIES: (() => {
    const n = parseIntSafe(process.env.QSTASH_BROADCAST_RETRIES, 10);
    return Math.max(0, Math.min(n, 30));
  })(),
  QSTASH_BROADCAST_PAUSE_DELAY_SEC: (() => {
    const n = parseIntSafe(process.env.QSTASH_BROADCAST_PAUSE_DELAY_SEC, 60);
    return Math.max(10, Math.min(n, 3600));
  })(),

  // Instagram verification (Level B comment-code) — optional cron.
  IG_VERIFY_TICK_ENABLED: parseBoolSafe(process.env.IG_VERIFY_TICK_ENABLED, false),
  IG_VERIFY_ACCESS_TOKEN: process.env.IG_VERIFY_ACCESS_TOKEN || '',
  IG_VERIFY_MEDIA_ID: process.env.IG_VERIFY_MEDIA_ID || '',
  IG_VERIFY_COMMENTS_LIMIT: (() => {
    const n = parseIntSafe(process.env.IG_VERIFY_COMMENTS_LIMIT, 50);
    return Math.max(5, Math.min(n, 200));
  })(),
  // Instagram OAuth (Level A, OAuth-only). FREE for creators (badge + connect).
  IG_OAUTH_ENABLED: parseBoolSafe(process.env.IG_OAUTH_ENABLED, false),
  // UX switch: show/hide IG OAuth connect UI in creator profile.
  // Default OFF (safe): enable later when Meta side is stable.
  IG_OAUTH_UI_ENABLED: parseBoolSafe(process.env.IG_OAUTH_UI_ENABLED, false),
  // Server kill-switch: close the entire IG API surface (/api/ig/* and IG cron) even if routes exist.
  // Default: follow IG_OAUTH_UI_ENABLED, unless explicitly overridden.
  IG_ROUTES_ENABLED: (() => {
    if (typeof process.env.IG_ROUTES_ENABLED !== 'undefined') {
      return parseBoolSafe(process.env.IG_ROUTES_ENABLED, false);
    }
    return parseBoolSafe(process.env.IG_OAUTH_UI_ENABLED, false);
  })(),
  IG_OAUTH_CLIENT_ID: process.env.IG_OAUTH_CLIENT_ID || '',
  IG_OAUTH_CLIENT_SECRET: process.env.IG_OAUTH_CLIENT_SECRET || '',
  IG_OAUTH_SCOPES: process.env.IG_OAUTH_SCOPES || 'instagram_basic,pages_show_list,pages_read_engagement',
  IG_OAUTH_GRAPH_VERSION: process.env.IG_OAUTH_GRAPH_VERSION || 'v25.0',
  IG_TOKEN_ENC_KEY: process.env.IG_TOKEN_ENC_KEY || '',
  // Strict: accept only 32-byte key provided as hex64 or base64/base64url (>=32 bytes).
  // No sha256("weak key") fallback.
  IG_TOKEN_ENC_KEY_BYTES: IG_ENC.key,
  IG_TOKEN_ENC_KEY_VALID: Boolean(IG_ENC.key),
  IG_TOKEN_ENC_KEY_KIND: IG_ENC.kind,

  // Derived: IG OAuth is "ready" only when UI+routes are enabled AND required envs are present.
  IG_OAUTH_READY: (() => {
    if (!parseBoolSafe(process.env.IG_OAUTH_ENABLED, false)) return false;
    if (!parseBoolSafe(process.env.IG_OAUTH_UI_ENABLED, false)) return false;
    // Kill-switch: if routes are closed, treat as not ready.
    const routesEnabled = (() => {
      if (typeof process.env.IG_ROUTES_ENABLED !== 'undefined') {
        return parseBoolSafe(process.env.IG_ROUTES_ENABLED, false);
      }
      return parseBoolSafe(process.env.IG_OAUTH_UI_ENABLED, false);
    })();
    if (!routesEnabled) return false;
    if (!(process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL)) return false;
    if (!String(process.env.IG_OAUTH_CLIENT_ID || '').trim()) return false;
    if (!String(process.env.IG_OAUTH_CLIENT_SECRET || '').trim()) return false;
    if (!IG_ENC.key) return false;
    return true;
  })(),


  // Audit logs (Postgres)
  AUDIT_DB_ENABLED: parseBoolSafe(process.env.AUDIT_DB_ENABLED, true),
  // Optional write-shedding for noisy actions (reduces Neon CU; no UX impact)
  AUDIT_DB_THROTTLE_ENABLED: parseBoolSafe(process.env.AUDIT_DB_THROTTLE_ENABLED, false),
  AUDIT_DB_THROTTLE_LIMIT: parseIntSafe(process.env.AUDIT_DB_THROTTLE_LIMIT, 60),
  AUDIT_DB_THROTTLE_WINDOW_SEC: parseIntSafe(process.env.AUDIT_DB_THROTTLE_WINDOW_SEC, 60),
  AUDIT_DB_THROTTLE_PREFIXES: parseCsvStr(process.env.AUDIT_DB_THROTTLE_PREFIXES || 'lead.,folders.,ws.profile_,deal.,inbox.'),

  // Audit buffering (Redis list -> batch flush to Postgres)
  // Goal: when AUDIT_DB_THROTTLE suppresses inserts (or DB is flaky), do not lose audit events.
  // Default: follow AUDIT_DB_THROTTLE_ENABLED unless explicitly overridden.
  AUDIT_BUFFER_ENABLED: (() => {
    if (typeof process.env.AUDIT_BUFFER_ENABLED !== 'undefined') {
      return parseBoolSafe(process.env.AUDIT_BUFFER_ENABLED, false);
    }
    return parseBoolSafe(process.env.AUDIT_DB_THROTTLE_ENABLED, false);
  })(),
  AUDIT_BUFFER_ON_DB_ERROR: parseBoolSafe(process.env.AUDIT_BUFFER_ON_DB_ERROR, true),
  AUDIT_BUFFER_MAX_LEN: (() => {
    const n = parseIntSafe(process.env.AUDIT_BUFFER_MAX_LEN, 5000);
    return Math.max(200, Math.min(n, 20000));
  })(),
  AUDIT_BUFFER_TTL_SEC: (() => {
    const n = parseIntSafe(process.env.AUDIT_BUFFER_TTL_SEC, 7 * 86400);
    return Math.max(3600, Math.min(n, 60 * 86400)); // 1h..60d
  })(),
  AUDIT_BUFFER_FLUSH_BATCH: (() => {
    const n = parseIntSafe(process.env.AUDIT_BUFFER_FLUSH_BATCH, 250);
    return Math.max(10, Math.min(n, 1000));
  })(),
  AUDIT_BUFFER_FLUSH_MAX_MS: (() => {
    const n = parseIntSafe(process.env.AUDIT_BUFFER_FLUSH_MAX_MS, 4500);
    return Math.max(250, Math.min(n, 9000));
  })(),

  AUDIT_BUFFER_FLUSH_LOCK_TTL_SEC: (() => {
    const n = parseIntSafe(process.env.AUDIT_BUFFER_FLUSH_LOCK_TTL_SEC, 15);
    return Math.max(5, Math.min(n, 60));
  })(),
  AUDIT_BUFFER_INFLIGHT_TIMEOUT_SEC: (() => {
    const n = parseIntSafe(process.env.AUDIT_BUFFER_INFLIGHT_TIMEOUT_SEC, 180);
    return Math.max(30, Math.min(n, 1800)); // 30s..30m
  })(),

  // When DB is down, avoid hammering audit flush every minute.
  // After a requeue or DB failure, set a short cooldown key and skip flush until it expires.
  // 0 disables.
  AUDIT_BUFFER_REQUEUE_COOLDOWN_SEC: (() => {
    const n = parseIntSafe(process.env.AUDIT_BUFFER_REQUEUE_COOLDOWN_SEC, 120);
    return Math.max(0, Math.min(n, 1800)); // 0..30m
  })(),


  // Onboarding v2
  ONBOARDING_V2_ENABLED: parseBoolSafe(process.env.ONBOARDING_V2_ENABLED, false),

  // Rate limiting
  RATE_LIMIT_ENABLED: parseBoolSafe(process.env.RATE_LIMIT_ENABLED, false),
  BX_MSG_RATE_LIMIT: parseIntSafe(process.env.BX_MSG_RATE_LIMIT, 12),
  BX_MSG_RATE_WINDOW_SEC: parseIntSafe(process.env.BX_MSG_RATE_WINDOW_SEC, 60),
  INTRO_RATE_LIMIT: parseIntSafe(process.env.INTRO_RATE_LIMIT, 6),
  INTRO_RATE_WINDOW_SEC: parseIntSafe(process.env.INTRO_RATE_WINDOW_SEC, 3600),
  BRAND_LEAD_RATE_LIMIT: parseIntSafe(process.env.BRAND_LEAD_RATE_LIMIT, 1),
  BRAND_LEAD_RATE_WINDOW_SEC: parseIntSafe(process.env.BRAND_LEAD_RATE_WINDOW_SEC, 600),
  CREATOR_BRAND_APPLY_RATE_LIMIT: parseIntSafe(process.env.CREATOR_BRAND_APPLY_RATE_LIMIT, 1),
  CREATOR_BRAND_APPLY_RATE_WINDOW_SEC: parseIntSafe(process.env.CREATOR_BRAND_APPLY_RATE_WINDOW_SEC, 600),
  CREATOR_BRAND_APPLY_DAILY_LIMIT: parseIntSafe(process.env.CREATOR_BRAND_APPLY_DAILY_LIMIT, 5),
  CREATOR_BRAND_APPLY_DAILY_WINDOW_SEC: parseIntSafe(process.env.CREATOR_BRAND_APPLY_DAILY_WINDOW_SEC, 86400),

  VERIFICATION_ENABLED: parseBoolSafe(process.env.VERIFICATION_ENABLED, false),
  // Brand profile (Brand Mode)
  BRAND_PROFILE_REQUIRED: parseBoolSafe(process.env.BRAND_PROFILE_REQUIRED, true),
  BRAND_VERIFY_REQUIRES_EXTENDED: parseBoolSafe(process.env.BRAND_VERIFY_REQUIRES_EXTENDED, true),


  // Moderation
  SUPER_ADMIN_TG_IDS: parseCsvNums(process.env.SUPER_ADMIN_TG_IDS || DEFAULT_SUPER_ADMINS),
  BRAND_APP_SUPERADMIN_COPY_ENABLED: parseBoolSafe(process.env.BRAND_APP_SUPERADMIN_COPY_ENABLED, true),

  // Upstash Redis REST
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || '',
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || '',

  // Fault injection (staging/dev only)
  SIMULATE_REDIS_DOWN: parseBoolSafe(process.env.SIMULATE_REDIS_DOWN, false),



  // UI banners (optional)
  MENU_BANNER_FILE_ID: process.env.MENU_BANNER_FILE_ID || '',
  GUIDE_BANNER_FILE_ID: process.env.GUIDE_BANNER_FILE_ID || '',
  BRAND_BANNER_FILE_ID: process.env.BRAND_BANNER_FILE_ID || '',
  GIVEAWAY_BANNER_FILE_ID: process.env.GIVEAWAY_BANNER_FILE_ID || '',
  BANNER_COOLDOWN_HOURS: parseIntSafe(process.env.BANNER_COOLDOWN_HOURS, 24),

};

export function assertEnv() {
  const missing = [];
  if (!CFG.BOT_TOKEN) missing.push('BOT_TOKEN');
  if (!CFG.BOT_USERNAME) missing.push('BOT_USERNAME');
  if (!CFG.DATABASE_URL) missing.push('DATABASE_URL');
  if (!CFG.UPSTASH_REDIS_REST_URL) missing.push('UPSTASH_REDIS_REST_URL');
  if (!CFG.UPSTASH_REDIS_REST_TOKEN) missing.push('UPSTASH_REDIS_REST_TOKEN');

  if (CFG.OFFICIAL_PUBLISH_ENABLED) {
    if (!CFG.OFFICIAL_CHANNEL_ID) missing.push('OFFICIAL_CHANNEL_ID');
  }

  // Fail-fast safety in prod
  if (CFG.APP_ENV === 'prod') {
    if (!CFG.WEBHOOK_SECRET_TOKEN) missing.push('WEBHOOK_SECRET_TOKEN');
    if (!CFG.CRON_SECRET) missing.push('CRON_SECRET');
    if (!CFG.SUPER_ADMIN_TG_IDS?.length) missing.push('SUPER_ADMIN_TG_IDS');
  }
  // IG OAuth must not block prod while UI/routes are hidden.
  // Fail-fast only when IG OAuth is publicly enabled (UI+routes).
  const igPublicEnabled = Boolean(CFG.IG_OAUTH_ENABLED && CFG.IG_OAUTH_UI_ENABLED && CFG.IG_ROUTES_ENABLED);
  if (igPublicEnabled) {
    if (!CFG.PUBLIC_BASE_URL) missing.push('PUBLIC_BASE_URL');
    if (!CFG.IG_OAUTH_CLIENT_ID) missing.push('IG_OAUTH_CLIENT_ID');
    if (!CFG.IG_OAUTH_CLIENT_SECRET) missing.push('IG_OAUTH_CLIENT_SECRET');
    if (!CFG.IG_TOKEN_ENC_KEY_VALID) missing.push('IG_TOKEN_ENC_KEY (hex64 or base64>=32 bytes)');
  }

  if (CFG.ADMIN_WEB_ENABLED) {
    if (!CFG.PUBLIC_BASE_URL) missing.push('PUBLIC_BASE_URL');
    if (!CFG.ADMIN_WEB_SECRET) missing.push('ADMIN_WEB_SECRET');
    if (!CFG.ADMIN_WEB_SESSION_SECRET) missing.push('ADMIN_WEB_SESSION_SECRET');
    if (!CFG.ADMIN_WEB_APPROVER_TG_IDS?.length) missing.push('ADMIN_WEB_APPROVER_TG_IDS or SUPER_ADMIN_TG_IDS');
  }

  if (missing.length) {
    throw new Error(`Missing env: ${missing.join(', ')}`);
  }
}
