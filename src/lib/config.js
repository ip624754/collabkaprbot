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


const DEFAULT_SUPER_ADMINS = '';

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
  PAYMENTS_FALLBACK_APPLY_ENABLED: parseBoolSafe(process.env.PAYMENTS_FALLBACK_APPLY_ENABLED, true),

  // Payments: auto-heal ORPHANED payments with note=missing_session (cron + admin action).
  PAYMENTS_ORPHANED_AUTOHEAL_ENABLED: parseBoolSafe(process.env.PAYMENTS_ORPHANED_AUTOHEAL_ENABLED, true),
  PAYMENTS_ORPHANED_AUTOHEAL_BATCH: (() => {
    const n = parseIntSafe(process.env.PAYMENTS_ORPHANED_AUTOHEAL_BATCH, 20);
    return Math.max(0, Math.min(n, 100));
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
  IG_OAUTH_CLIENT_ID: process.env.IG_OAUTH_CLIENT_ID || '',
  IG_OAUTH_CLIENT_SECRET: process.env.IG_OAUTH_CLIENT_SECRET || '',
  IG_OAUTH_SCOPES: process.env.IG_OAUTH_SCOPES || 'instagram_basic,pages_show_list,pages_read_engagement',
  IG_OAUTH_GRAPH_VERSION: process.env.IG_OAUTH_GRAPH_VERSION || 'v25.0',
  IG_TOKEN_ENC_KEY: process.env.IG_TOKEN_ENC_KEY || '',


  // Audit logs (Postgres)
  AUDIT_DB_ENABLED: parseBoolSafe(process.env.AUDIT_DB_ENABLED, true),
  // Optional write-shedding for noisy actions (reduces Neon CU; no UX impact)
  AUDIT_DB_THROTTLE_ENABLED: parseBoolSafe(process.env.AUDIT_DB_THROTTLE_ENABLED, false),
  AUDIT_DB_THROTTLE_LIMIT: parseIntSafe(process.env.AUDIT_DB_THROTTLE_LIMIT, 60),
  AUDIT_DB_THROTTLE_WINDOW_SEC: parseIntSafe(process.env.AUDIT_DB_THROTTLE_WINDOW_SEC, 60),
  AUDIT_DB_THROTTLE_PREFIXES: parseCsvStr(process.env.AUDIT_DB_THROTTLE_PREFIXES || 'lead.,folders.,ws.profile_'),


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

  // Upstash Redis REST
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || '',
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || '',


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
  if (CFG.IG_OAUTH_ENABLED) {
    if (!CFG.PUBLIC_BASE_URL) missing.push('PUBLIC_BASE_URL');
    if (!CFG.IG_OAUTH_CLIENT_ID) missing.push('IG_OAUTH_CLIENT_ID');
    if (!CFG.IG_OAUTH_CLIENT_SECRET) missing.push('IG_OAUTH_CLIENT_SECRET');
    if (!CFG.IG_TOKEN_ENC_KEY) missing.push('IG_TOKEN_ENC_KEY');
  }


  if (missing.length) {
    throw new Error(`Missing env: ${missing.join(', ')}`);
  }
}
