import { CFG } from '../config.js';
import { pingDb } from '../../db/pool.js';
import { redis, k } from '../redis.js';

function nowIso() {
  return new Date().toISOString();
}

function makeService(state, label, hint = '') {
  return {
    state,
    label: String(label || ''),
    hint: String(hint || ''),
  };
}

function stateWeight(state) {
  switch (String(state || '').trim().toLowerCase()) {
    case 'missing':
      return 3;
    case 'degraded':
      return 2;
    case 'unknown':
      return 1;
    case 'ok':
    default:
      return 0;
  }
}

function deriveOverallState(states = []) {
  let worst = 'ok';
  for (const s of states) {
    if (stateWeight(s) > stateWeight(worst)) worst = s;
  }
  return worst;
}

function overallLabel(state) {
  switch (state) {
    case 'missing':
      return 'Нужна настройка';
    case 'degraded':
      return 'Нужна проверка';
    case 'unknown':
      return 'Статус неизвестен';
    case 'ok':
    default:
      return 'Система выглядит стабильно';
  }
}

function pushWarning(list, level, message, source = '') {
  list.push({ level, message: String(message || ''), source: String(source || '') });
}

function pushHint(list, kind, message) {
  list.push({ kind: String(kind || 'info'), message: String(message || '') });
}

function keyState(configured, { optional = false, enabled = true } = {}) {
  if (!enabled) return optional ? 'optional' : 'not_enabled';
  if (optional) return configured ? 'configured' : 'optional';
  return configured ? 'configured' : 'missing';
}

export async function getRuntimeSummary() {
  const updatedAt = nowIso();
  const out = {
    updatedAt,
    overall: { state: 'unknown', label: overallLabel('unknown') },
    services: {},
    configPresence: [],
    warnings: [],
    hints: [],
    recentRuntimeEvents: [],
  };

  const publicBaseUrlConfigured = !!String(CFG.PUBLIC_BASE_URL || '').trim();
  const botTokenConfigured = !!String(CFG.BOT_TOKEN || '').trim();
  const botUsernameConfigured = !!String(CFG.BOT_USERNAME || '').trim();
  const redisConfigured = !!(CFG.UPSTASH_REDIS_REST_URL && CFG.UPSTASH_REDIS_REST_TOKEN);
  const adminWebEnabled = !!CFG.ADMIN_WEB_ENABLED;
  const adminSecretConfigured = !!String(CFG.ADMIN_WEB_SECRET || '').trim();
  const adminSessionConfigured = !!String(CFG.ADMIN_WEB_SESSION_SECRET || '').trim();
  const adminApproversConfigured = Array.isArray(CFG.ADMIN_WEB_APPROVER_TG_IDS) && CFG.ADMIN_WEB_APPROVER_TG_IDS.length > 0;
  const qstashConfigured = !!String(CFG.QSTASH_TOKEN || CFG.QSTASH_CURRENT_SIGNING_KEY || '').trim();
  const paymentsHmacConfigured = !!String(CFG.PAYMENTS_PAYLOAD_HMAC_KEY || '').trim();
  const paymentsFallbackEnabled = !!CFG.PAYMENTS_FALLBACK_APPLY_ENABLED;

  let dbOk = false;
  try {
    dbOk = await pingDb();
  } catch {
    dbOk = false;
  }

  let redisOk = false;
  if (redisConfigured) {
    try {
      const probeKey = k(['admin_web_runtime_probe']);
      await redis.set(probeKey, '1', { ex: 30 });
      const value = await redis.get(probeKey);
      redisOk = String(value || '') === '1';
    } catch {
      redisOk = false;
    }
  }

  const dbState = dbOk ? 'ok' : 'degraded';
  const redisState = !redisConfigured ? 'missing' : (redisOk ? 'ok' : 'degraded');
  const qstashState = qstashConfigured ? 'ok' : 'missing';
  const paymentsState = paymentsFallbackEnabled && !paymentsHmacConfigured
    ? 'degraded'
    : (paymentsHmacConfigured || !paymentsFallbackEnabled ? 'ok' : 'unknown');
  const adminWebState = !adminWebEnabled
    ? 'unknown'
    : (adminSecretConfigured && adminSessionConfigured && adminApproversConfigured && publicBaseUrlConfigured ? 'ok' : 'missing');
  const configState = publicBaseUrlConfigured && botTokenConfigured && botUsernameConfigured
    ? 'ok'
    : 'missing';

  out.env = String(CFG.APP_ENV || 'dev');
  out.publicBaseUrl = publicBaseUrlConfigured;
  out.botConfigured = botTokenConfigured && botUsernameConfigured;
  out.superAdminsConfigured = adminApproversConfigured;
  out.adminWebEnabled = adminWebEnabled;
  out.adminWebConfigured = adminSecretConfigured && adminSessionConfigured;
  out.db = { ok: dbOk };
  out.redis = { configured: redisConfigured, ok: redisOk };
  out.qstash = { configured: qstashConfigured };

  out.services = {
    db: makeService(dbState, dbOk ? 'DB configured' : 'DB ping failed', dbOk ? 'Соединение выглядит рабочим.' : 'Проверь DATABASE_URL / доступность DB.'),
    redis: makeService(redisState, !redisConfigured ? 'Redis not configured' : (redisOk ? 'Redis configured' : 'Redis probe failed'), !redisConfigured ? 'Redis не обязателен для каждой поверхности, но нужен для части operator/runtime сценариев.' : (redisOk ? 'Redis выглядит рабочим.' : 'Проверь Upstash env / сеть.')),
    qstash: makeService(qstashState, qstashConfigured ? 'QStash configured' : 'QStash not configured', qstashConfigured ? 'Фоновая доставка может работать.' : 'Для admin v1 это не блокер, но publish/retry surfaces будут ограничены.'),
    payments: makeService(paymentsState, paymentsFallbackEnabled ? (paymentsHmacConfigured ? 'Payments fallback guarded' : 'Payments fallback lacks HMAC guard') : 'Payments fallback disabled', paymentsFallbackEnabled ? (paymentsHmacConfigured ? 'Fallback path защищён HMAC ключом.' : 'Проверь PAYMENTS_PAYLOAD_HMAC_KEY.') : 'Fallback path сейчас не активен.'),
    config: makeService(configState, configState === 'ok' ? 'Core config present' : 'Core config incomplete', configState === 'ok' ? 'Базовый env layer выглядит собранным.' : 'Проверь BOT / PUBLIC_BASE_URL env baseline.'),
    adminWeb: makeService(adminWebState, !adminWebEnabled ? 'Admin web disabled' : (adminWebState === 'ok' ? 'Admin web auth configured' : 'Admin web auth incomplete'), !adminWebEnabled ? 'Web admin выключен env-флагом.' : (adminWebState === 'ok' ? 'Secret / session / approvers настроены.' : 'Проверь ADMIN_WEB_* env и PUBLIC_BASE_URL.')),
  };

  out.configPresence = [
    { key: 'BOT_TOKEN', state: keyState(botTokenConfigured) },
    { key: 'BOT_USERNAME', state: keyState(botUsernameConfigured) },
    { key: 'PUBLIC_BASE_URL', state: keyState(publicBaseUrlConfigured) },
    { key: 'UPSTASH_REDIS_REST_URL', state: keyState(!!String(CFG.UPSTASH_REDIS_REST_URL || '').trim()) },
    { key: 'UPSTASH_REDIS_REST_TOKEN', state: keyState(!!String(CFG.UPSTASH_REDIS_REST_TOKEN || '').trim()) },
    { key: 'ADMIN_WEB_ENABLED', state: adminWebEnabled ? 'configured' : 'not_enabled' },
    { key: 'ADMIN_WEB_SECRET', state: keyState(adminSecretConfigured, { enabled: adminWebEnabled }) },
    { key: 'ADMIN_WEB_SESSION_SECRET', state: keyState(adminSessionConfigured, { enabled: adminWebEnabled }) },
    { key: 'ADMIN_WEB_APPROVER_TG_IDS', state: keyState(adminApproversConfigured, { enabled: adminWebEnabled }) },
    { key: 'QSTASH_TOKEN / QSTASH_CURRENT_SIGNING_KEY', state: keyState(qstashConfigured, { optional: true }) },
    { key: 'PAYMENTS_PAYLOAD_HMAC_KEY', state: keyState(paymentsHmacConfigured, { optional: !paymentsFallbackEnabled }) },
  ];

  if (!publicBaseUrlConfigured) {
    pushWarning(out.warnings, 'warning', 'PUBLIC_BASE_URL не задан', 'config');
    pushHint(out.hints, 'warning', 'Без PUBLIC_BASE_URL approve/code ссылки и часть share/runtime сценариев будут неполными.');
  }
  if (!dbOk) {
    pushWarning(out.warnings, 'error', 'DB ping failed', 'db');
    pushHint(out.hints, 'warning', 'Проверь DATABASE_URL, доступность Neon/PG и network path.');
  }
  if (!redisConfigured) {
    pushWarning(out.warnings, 'warning', 'Redis не настроен', 'redis');
    pushHint(out.hints, 'info', 'Часть admin/runtime сценариев останется в degraded режиме без Redis.');
  } else if (!redisOk) {
    pushWarning(out.warnings, 'warning', 'Redis probe failed', 'redis');
    pushHint(out.hints, 'warning', 'Проверь UPSTASH_REDIS_REST_URL / TOKEN и сетевой доступ до Upstash.');
  }
  if (adminWebEnabled && (!adminSecretConfigured || !adminSessionConfigured || !adminApproversConfigured)) {
    pushWarning(out.warnings, 'warning', 'Admin web auth настроен не полностью', 'admin_web');
    pushHint(out.hints, 'warning', 'Для web-admin нужны ADMIN_WEB_SECRET, ADMIN_WEB_SESSION_SECRET и approver TG IDs.');
  }
  if (!qstashConfigured) {
    pushWarning(out.warnings, 'info', 'QStash не настроен', 'qstash');
    pushHint(out.hints, 'info', 'Для admin v1 это не блокер, но publish/retry/runtime surfaces будут ограничены.');
  }
  if (paymentsFallbackEnabled && !paymentsHmacConfigured) {
    pushWarning(out.warnings, 'warning', 'Payments fallback без HMAC key', 'payments');
    pushHint(out.hints, 'warning', 'Добавь PAYMENTS_PAYLOAD_HMAC_KEY, если fallback path должен быть защищён от forged payloads.');
  }

  if (!out.warnings.length) {
    pushWarning(out.warnings, 'info', 'Явных предупреждений нет', 'runtime');
    pushHint(out.hints, 'info', 'Базовый infra/config слой выглядит собранным.');
  }

  out.notes = out.warnings.map((item) => String(item.message || '')).filter(Boolean);

  out.recentRuntimeEvents = out.warnings.slice(0, 5).map((item) => ({
    kind: String(item.level || 'info'),
    source: String(item.source || 'runtime'),
    message: String(item.message || ''),
    at: updatedAt,
  }));

  const overallState = deriveOverallState([
    dbState,
    redisState,
    qstashState,
    paymentsState,
    adminWebState,
    configState,
  ]);
  out.overall = {
    state: overallState,
    label: overallLabel(overallState),
  };

  return out;
}
