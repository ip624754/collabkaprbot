import { CFG } from '../config.js';
import { pingDb } from '../../db/pool.js';
import { redis, k } from '../redis.js';
import { getOperatorControlSnapshot } from '../operatorControls.js';

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

function warningWeight(level) {
  switch (String(level || '').trim().toLowerCase()) {
    case 'error':
      return 3;
    case 'warning':
      return 2;
    case 'info':
    default:
      return 1;
  }
}

function sourceLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return ({
    db: 'DB',
    redis: 'Redis',
    qstash: 'QStash',
    payments: 'Платежи',
    admin_web: 'Web-admin',
    config: 'Конфигурация',
    runtime: 'Runtime',
    controls: 'Control plane',
  })[key] || (value || 'runtime');
}

function deriveIncidentStrip({ warnings = [], hints = [], controlSurface = null, updatedAt = null } = {}) {
  const actionableWarnings = (Array.isArray(warnings) ? warnings : []).filter((item) => String(item?.message || '') !== 'Явных предупреждений нет');
  const pausedControls = Array.isArray(controlSurface?.items)
    ? controlSurface.items.filter((item) => item?.kind === 'toggle' && item?.value === false)
    : [];
  const fallbackIncident = Array.isArray(controlSurface?.items)
    ? controlSurface.items.find((item) => item?.id === 'payments_fallback' && item?.value)
    : null;

  const candidates = [
    ...actionableWarnings.map((item) => ({
      kind: 'warning',
      weight: warningWeight(item?.level),
      level: String(item?.level || 'info'),
      source: String(item?.source || 'runtime'),
      title: '',
      message: String(item?.message || ''),
    })),
    ...pausedControls.map((item) => ({
      kind: 'control',
      weight: 2,
      level: 'warning',
      source: 'controls',
      title: `${String(item?.label || item?.shortLabel || 'Control')} paused`,
      message: 'Оператор временно выключил часть runtime-потока. Это не ошибка, но состояние стоит помнить при разборе инцидентов.',
    })),
    ...(fallbackIncident ? [{
      kind: 'control',
      weight: 2,
      level: 'warning',
      source: 'payments',
      title: 'Payments fallback override активен',
      message: 'Инцидентный fallback mode сейчас включён. После разбора инцидента его стоит вернуть в обычный режим.',
    }] : []),
  ];

  if (!candidates.length) {
    return {
      state: 'ok',
      tone: 'info',
      title: 'Явных инцидентов сейчас не видно',
      message: 'Базовый infra/config слой и control plane выглядят стабильно для ручной операторской работы.',
      source: 'runtime',
      sourceLabel: 'Runtime',
      action: 'Достаточно ручного обновления и короткого визуального смоука.',
      updatedAt,
      feed: [
        {
          level: 'info',
          title: 'Система выглядит стабильно',
          source: 'runtime',
          sourceLabel: 'Runtime',
          message: 'Нет явных degraded / missing / paused сигналов, требующих немедленного действия.',
        },
      ],
    };
  }

  const primary = [...candidates].sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return String(a.source || '').localeCompare(String(b.source || ''));
  })[0];

  const state = primary.weight >= 3 ? 'error' : (primary.weight >= 2 ? 'warning' : 'info');
  const source = String(primary.source || 'runtime');
  const title = String(primary.title || primary.message || 'Нужна проверка');

  let action = 'Обнови Runtime вручную и смотри соседние сигналы по тому же контуру.';
  if (source === 'db') action = 'Проверь DATABASE_URL, доступность Neon/PG и свежий /api/health?full=1.';
  else if (source === 'redis') action = 'Проверь Upstash env и сетевой доступ; degraded Redis влияет на control plane и часть operator state.';
  else if (source === 'admin_web' || source === 'controls') action = 'Проверь control surface и auth/login настройки; paused toggle — это осознанное runtime-состояние, а не silent bug.';
  else if (source === 'payments') action = 'Сверь payments fallback / HMAC guard и последние payment warnings, потом верни режим в норму.';
  else if (source === 'qstash') action = 'Сверь QStash env и delivery/retry контур; без него publish/retry surfaces будут ограничены.';
  else if (source === 'config') action = 'Проверь core env baseline: BOT / PUBLIC_BASE_URL / admin-web config.';
  else if (Array.isArray(hints) && hints.length) action = String(hints[0]?.message || action);

  return {
    state,
    tone: state,
    title,
    message: String(primary.message || title),
    source,
    sourceLabel: sourceLabel(source),
    action,
    updatedAt,
    feed: candidates.slice(0, 4).map((item) => ({
      level: String(item.level || 'info'),
      title: String(item.title || item.message || '—'),
      source: String(item.source || 'runtime'),
      sourceLabel: sourceLabel(item.source || 'runtime'),
      message: String(item.message || item.title || ''),
    })),
  };
}

function buildStatusHierarchy({ services = {}, controlSurface = null } = {}) {
  const authToggleOn = !!controlSurface?.byId?.admin_web_login?.value;
  const fallbackActive = !!controlSurface?.byId?.payments_fallback?.value;
  return [
    {
      id: 'db',
      label: 'DB',
      state: String(services.db?.state || 'unknown'),
      summary: String(services.db?.label || 'Данные пока недоступны'),
      hint: 'источник данных',
    },
    {
      id: 'redis',
      label: 'Redis',
      state: String(services.redis?.state || 'unknown'),
      summary: String(services.redis?.label || 'Данные пока недоступны'),
      hint: 'locks / runtime state',
    },
    {
      id: 'qstash',
      label: 'Delivery',
      state: String(services.qstash?.state || 'unknown'),
      summary: String(services.qstash?.label || 'Данные пока недоступны'),
      hint: 'publish / retry',
    },
    {
      id: 'payments',
      label: 'Платежи',
      state: fallbackActive && services.payments?.state === 'ok' ? 'degraded' : String(services.payments?.state || 'unknown'),
      summary: fallbackActive ? 'Fallback runtime override активен' : String(services.payments?.label || 'Данные пока недоступны'),
      hint: fallbackActive ? 'incident mode' : 'apply / fallback',
    },
    {
      id: 'admin_web',
      label: 'Web-admin',
      state: !authToggleOn && services.adminWeb?.state === 'ok' ? 'degraded' : String(services.adminWeb?.state || 'unknown'),
      summary: !authToggleOn ? 'Новые login запросы paused' : String(services.adminWeb?.label || 'Данные пока недоступны'),
      hint: 'auth / session',
    },
    {
      id: 'config',
      label: 'Config',
      state: String(services.config?.state || 'unknown'),
      summary: String(services.config?.label || 'Данные пока недоступны'),
      hint: 'core env baseline',
    },
  ];
}

function buildControlSnapshot(controlSurface = null) {
  const items = Array.isArray(controlSurface?.items) ? controlSurface.items : [];
  const toggles = items.filter((item) => item?.kind === 'toggle');
  const pausedCount = toggles.filter((item) => !item.value).length;
  const incidentModes = items.filter((item) => item?.kind === 'runtime_override' && item?.value).length;
  return {
    pausedCount,
    incidentModes,
    items: items.map((item) => ({
      id: String(item?.id || 'unknown'),
      label: String(item?.shortLabel || item?.label || 'Control'),
      state: item?.kind === 'runtime_override'
        ? (item?.value ? 'warning' : 'ok')
        : (item?.value ? 'ok' : 'degraded'),
      stateLabel: String(item?.stateLabel || (item?.value ? 'ON' : 'OFF')),
      hint: item?.kind === 'runtime_override'
        ? (item?.runtimeLabel ? `runtime ${String(item.runtimeLabel)}` : 'incident override')
        : (item?.changedBy && item?.changedBy !== '—' ? `последний change: ${String(item.changedBy)}` : 'без явного override'),
      changedAt: item?.changedAt || null,
    })),
    lastAudit: Array.isArray(controlSurface?.audit) ? controlSurface.audit[0] || null : null,
  };
}

function buildConfigSummary(configPresence = []) {
  const items = Array.isArray(configPresence) ? configPresence : [];
  return {
    configured: items.filter((item) => item?.state === 'configured').length,
    missing: items.filter((item) => item?.state === 'missing').length,
    optional: items.filter((item) => item?.state === 'optional' || item?.state === 'not_enabled').length,
  };
}


function dayKey() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

async function readMany(keys = []) {
  return Promise.all((Array.isArray(keys) ? keys : []).map(async (kk) => {
    try { return await redis.get(kk); } catch { return null; }
  }));
}

function queueLaneState({ enabled = true, configured = true, backlog = 0, inflight = 0, stalled = false, cooldown = false, warning = false, unknown = false } = {}) {
  if (!enabled) return 'unknown';
  if (!configured) return 'missing';
  if (stalled || warning) return 'degraded';
  if (cooldown || backlog > 0 || inflight > 0) return 'degraded';
  if (unknown) return 'unknown';
  return 'ok';
}

function formatRuntimeAgeLabel(seconds) {
  const sec = Number(seconds);
  if (!Number.isFinite(sec) || sec < 0) return '—';
  if (sec < 60) return `${Math.round(sec)}с`;
  if (sec < 3600) return `${Math.round(sec / 60)}м`;
  if (sec < 86400) return `${Math.round(sec / 3600)}ч`;
  return `${Math.round(sec / 86400)}д`;
}

function buildQueueClarity({
  ops = {},
  audit = {},
  broadcast = {},
  mon = {},
  qstash = {},
  redisConfigured = false,
  qstashConfigured = false,
  updatedAt = null,
} = {}) {
  const opsPending = Number(ops?.pending?.ops || 0) || 0;
  const auditBuffer = audit?.buffer || {};
  const auditBacklog = Number(auditBuffer?.queue_len || 0) || 0;
  const auditInflight = Number(auditBuffer?.inflight_len || 0) || 0;
  const auditCooldown = Number(auditBuffer?.requeue_cooldown_ttl_sec || 0) || 0;
  const auditInflightAge = Number(auditBuffer?.inflight_age_sec || 0) || 0;
  const auditWarning = auditInflight > 0 && auditInflightAge >= 900;

  const pendingDeliveries = Number(broadcast?.pending_deliveries?.pending_count || 0) || 0;
  const retryAfter = Number(broadcast?.retry_after_sec || 0) || 0;
  const broadcastWarning = pendingDeliveries > 0 || retryAfter > 0 || !!broadcast?.last_429_at;

  const retryStatus = String(mon?.retry?.last_status || '').trim().toLowerCase();
  const retryError = String(mon?.retry?.last_error || '').trim();
  const retryWarning = ['error', 'failed', 'fail', 'panic'].some((token) => retryStatus.includes(token)) || !!retryError;

  const rescheduleFailedCount = Number(qstash?.reschedule_failed?.today_count || 0) || 0;
  const officialPublishStuckCount = Number(qstash?.official_publish_stuck?.today_count || 0) || 0;
  const qstashWarning = rescheduleFailedCount > 0 || officialPublishStuckCount > 0;

  const lanes = [
    {
      id: 'ops_digest',
      label: 'Ops digest',
      state: queueLaneState({ enabled: true, configured: redisConfigured, backlog: opsPending }),
      summary: redisConfigured ? (opsPending > 0 ? `${opsPending} pending в буфере alert-ов` : 'pending очереди сейчас нет') : 'без Redis pending очередь недоступна',
      detail: ops?.last_sent_at ? `last sent ${ops.last_sent_at}` : 'last sent пока не зафиксирован',
      hint: opsPending > 0 ? 'накопился ops buffer' : 'alert buffer тихий',
      backlog: opsPending,
    },
    {
      id: 'audit_buffer',
      label: 'Audit buffer',
      state: queueLaneState({
        enabled: !!audit?.buffer?.enabled,
        configured: redisConfigured,
        backlog: auditBacklog,
        inflight: auditInflight,
        cooldown: auditCooldown > 0,
        warning: auditWarning,
        unknown: !audit?.buffer?.enabled,
      }),
      summary: audit?.buffer?.enabled
        ? `queue ${auditBacklog} · inflight ${auditInflight}`
        : 'audit buffer выключен',
      detail: audit?.buffer?.enabled
        ? `cooldown ${auditCooldown > 0 ? formatRuntimeAgeLabel(auditCooldown) : '—'} · last flush ${auditBuffer?.last_flush || '—'}`
        : 'текущий runtime не использует audit buffer',
      hint: auditWarning ? 'inflight висит слишком долго' : (auditCooldown > 0 ? 'requeue cooldown активен' : 'buffer выглядит спокойно'),
      backlog: auditBacklog + auditInflight,
    },
    {
      id: 'broadcast_delivery',
      label: 'Broadcast / delivery',
      state: queueLaneState({
        enabled: true,
        configured: redisConfigured && qstashConfigured,
        backlog: pendingDeliveries,
        cooldown: retryAfter > 0,
        warning: broadcastWarning && pendingDeliveries > 0,
        unknown: !redisConfigured,
      }),
      summary: pendingDeliveries > 0
        ? `${pendingDeliveries} pending deliver${pendingDeliveries === 1 ? 'y' : 'ies'}`
        : (retryAfter > 0 ? `retry after ${formatRuntimeAgeLabel(retryAfter)}` : 'явного delivery backlog нет'),
      detail: broadcast?.qstash_last_delivery_at
        ? `last deliver ${broadcast.qstash_last_delivery_at}`
        : (broadcast?.last_429_at ? `last 429 ${broadcast.last_429_at}` : 'последняя доставка не зафиксирована'),
      hint: pendingDeliveries > 0 ? 'смотри pending snapshot и retry cooldown' : 'fan-out выглядит спокойно',
      backlog: pendingDeliveries,
    },
    {
      id: 'retry_monitor',
      label: 'Retry monitor',
      state: queueLaneState({
        enabled: true,
        configured: redisConfigured,
        warning: retryWarning || qstashWarning,
        unknown: !mon?.retry?.last_at && !rescheduleFailedCount && !officialPublishStuckCount,
      }),
      summary: retryWarning
        ? `last retry ${retryStatus || 'error'}`
        : (mon?.retry?.last_at ? `last retry ${mon.retry.last_status || 'ok'}` : 'retry activity пока не видно'),
      detail: mon?.retry?.last_at
        ? `${mon.retry.last_at}${mon?.retry?.last_action ? ` · ${mon.retry.last_action}` : ''}`
        : `reschedule_failed ${rescheduleFailedCount} · stuck ${officialPublishStuckCount}`,
      hint: retryError ? retryError : (officialPublishStuckCount > 0 ? 'есть stuck publish сигналы' : 'retry сигналов нет'),
      backlog: rescheduleFailedCount + officialPublishStuckCount,
    },
  ];

  const retrySignals = [
    {
      id: 'retry_last',
      label: 'Последний retry',
      state: retryWarning ? 'degraded' : (mon?.retry?.last_at ? 'ok' : 'unknown'),
      summary: mon?.retry?.last_status ? String(mon.retry.last_status) : 'нет данных',
      detail: mon?.retry?.last_at ? `${mon.retry.last_at}${mon?.retry?.last_action ? ` · ${mon.retry.last_action}` : ''}` : 'runtime retry signal пока пуст',
      note: retryError || '',
    },
    {
      id: 'reschedule_failed',
      label: 'QStash reschedule_failed',
      state: rescheduleFailedCount > 0 ? 'degraded' : 'ok',
      summary: `${rescheduleFailedCount}`,
      detail: qstash?.reschedule_failed?.last_at ? `${qstash.reschedule_failed.last_at}${qstash?.reschedule_failed?.last_where ? ` · ${qstash.reschedule_failed.last_where}` : ''}` : 'сегодня не фиксировалось',
      note: qstash?.reschedule_failed?.last_payload ? String(qstash.reschedule_failed.last_payload).slice(0, 120) : '',
    },
    {
      id: 'official_publish_stuck',
      label: 'Official publish stuck',
      state: officialPublishStuckCount > 0 ? 'degraded' : 'ok',
      summary: `${officialPublishStuckCount}`,
      detail: qstash?.official_publish_stuck?.last_at ? `${qstash.official_publish_stuck.last_at}${qstash?.official_publish_stuck?.last_offer_id ? ` · offer ${qstash.official_publish_stuck.last_offer_id}` : ''}` : 'сегодня не фиксировалось',
      note: qstash?.official_publish_stuck?.last_age_sec ? `age ${formatRuntimeAgeLabel(qstash.official_publish_stuck.last_age_sec)}` : '',
    },
  ];

  const activeBacklog = lanes.reduce((sum, item) => sum + (Number(item?.backlog || 0) || 0), 0);
  const retryProblems = retrySignals.filter((item) => item.state === 'degraded').length;
  const coolingWindows = [auditCooldown > 0 ? 1 : 0, retryAfter > 0 ? 1 : 0].reduce((a, b) => a + b, 0);
  const summaryCards = {
    activeBacklog,
    retryProblems,
    coolingWindows,
    pausedOrUnknown: lanes.filter((item) => item.state === 'unknown' || item.state === 'missing').length,
  };

  return {
    updatedAt,
    summaryCards,
    lanes,
    retrySignals,
  };
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

  out.controlSurface = await getOperatorControlSnapshot({ limit: 12 });
  if (out.controlSurface?.byId?.admin_web_login && !out.controlSurface.byId.admin_web_login.value) {
    pushWarning(out.warnings, 'warning', 'Новые web-admin login запросы paused оператором', 'admin_web');
    pushHint(out.hints, 'info', 'Вход в web-admin можно быстро вернуть через Telegram → Админка → Система.');
  }
  if (out.controlSurface?.byId?.payments_fallback?.value) {
    pushWarning(out.warnings, 'info', 'Payments fallback runtime override сейчас активен', 'payments');
    pushHint(out.hints, 'info', 'Fallback mode стоит держать временным и отключать после инцидента.');
  }

  if (!out.warnings.length) {
    pushWarning(out.warnings, 'info', 'Явных предупреждений нет', 'runtime');
    pushHint(out.hints, 'info', 'Базовый infra/config слой выглядит собранным.');
  }

  out.notes = out.warnings.map((item) => String(item.message || '')).filter(Boolean);

  out.ops = { pending: null, last_sent_at: null };
  out.mon = { retry: { last_at: null, last_action: null, last_status: null, last_error: null } };
  out.qstashRuntime = {
    reschedule_failed: { day: dayKey(), today_count: 0, last_at: null, last_where: null, last_payload: null },
    official_publish_stuck: { day: dayKey(), today_count: 0, last_at: null, last_offer_id: null, last_age_sec: null, last_via: null },
  };
  out.broadcastRuntime = { pending_deliveries: null, retry_after_sec: null, last_429_at: null, qstash_last_delivery_at: null };
  out.auditRuntime = {
    buffer: {
      enabled: !!CFG.AUDIT_BUFFER_ENABLED,
      day: dayKey(),
      len: null,
      queue_len: null,
      inflight_len: null,
      inflight_age_sec: null,
      requeue_cooldown_ttl_sec: null,
      enqueued_today_total: null,
      flushed_today_total: null,
      requeued_today_total: null,
      last_flush: null,
    },
  };

  if (redisConfigured) {
    const day = dayKey();
    try {
      out.ops.pending = { ops: Number(await redis.llen(k(['ops', 'alerts', 'ops', 'd', day]))) || 0 };
    } catch {
      out.ops.pending = { ops: 0 };
    }
    try {
      const lastSentRaw = await redis.get(k(['ops', 'alerts', 'ops', 'last_sent']));
      const sec = Number(lastSentRaw) || 0;
      out.ops.last_sent_at = sec > 0 ? new Date(sec * 1000).toISOString() : null;
    } catch {
      out.ops.last_sent_at = null;
    }

    try {
      const [lastAt, lastAction, lastStatus, lastError] = await readMany([
        k(['mon', 'retry', 'last_at']),
        k(['mon', 'retry', 'last_action']),
        k(['mon', 'retry', 'last_status']),
        k(['mon', 'retry', 'last_error']),
      ]);
      out.mon.retry = {
        last_at: lastAt || null,
        last_action: lastAction || null,
        last_status: lastStatus || null,
        last_error: lastError || null,
      };
    } catch {
      // ignore
    }

    try {
      const [cntRaw, lastAt, lastWhere, lastPayload] = await readMany([
        k(['ops', 'reasons', 'reschedule_failed', 'd', day]),
        k(['ops', 'reasons', 'reschedule_failed', 'last_at']),
        k(['ops', 'reasons', 'reschedule_failed', 'last_where']),
        k(['ops', 'reasons', 'reschedule_failed', 'last_payload']),
      ]);
      out.qstashRuntime.reschedule_failed = {
        day,
        today_count: Number(cntRaw) || 0,
        last_at: lastAt || null,
        last_where: lastWhere || null,
        last_payload: lastPayload || null,
      };
    } catch {
      // ignore
    }

    try {
      const [cntRaw, lastAt, lastOfferId, lastAgeSec, lastVia] = await readMany([
        k(['ops', 'reasons', 'official_publish_stuck', 'd', day]),
        k(['ops', 'reasons', 'official_publish_stuck', 'last_at']),
        k(['ops', 'reasons', 'official_publish_stuck', 'last_offer_id']),
        k(['ops', 'reasons', 'official_publish_stuck', 'last_age_sec']),
        k(['ops', 'reasons', 'official_publish_stuck', 'last_via']),
      ]);
      out.qstashRuntime.official_publish_stuck = {
        day,
        today_count: Number(cntRaw) || 0,
        last_at: lastAt || null,
        last_offer_id: lastOfferId || null,
        last_age_sec: lastAgeSec !== null && lastAgeSec !== undefined ? Number(lastAgeSec) || 0 : null,
        last_via: lastVia || null,
      };
    } catch {
      // ignore
    }

    try {
      const [last429At, last429Reason, qstashLastAt] = await readMany([
        k(['broadcast', 'last_429_at']),
        k(['broadcast', 'last_429_reason']),
        k(['qstash', 'broadcast_deliver', 'last_at']),
      ]);
      out.broadcastRuntime.last_429_at = last429At || null;
      out.broadcastRuntime.last_429_reason = last429Reason || null;
      out.broadcastRuntime.qstash_last_delivery_at = qstashLastAt || null;

      try {
        const snapRaw = await redis.get(k(['broadcast', 'pending_deliveries']));
        let snap = snapRaw;
        if (typeof snapRaw === 'string') {
          try { snap = JSON.parse(snapRaw); } catch { snap = null; }
        }
        if (snap && typeof snap === 'object') {
          out.broadcastRuntime.pending_deliveries = {
            ts: snap.ts || null,
            broadcast_id: Number(snap.broadcast_id ?? snap.broadcastId) || null,
            pending_count: Number(snap.pending_count ?? snap.pendingCount ?? snap.pending) || 0,
          };
        }
      } catch {
        out.broadcastRuntime.pending_deliveries = null;
      }

      try {
        const untilRaw = await redis.get(k(['broadcast', 'cooldown_until']));
        const untilMs = Number(untilRaw) || 0;
        out.broadcastRuntime.retry_after_sec = untilMs > Date.now() ? Math.max(0, Math.ceil((untilMs - Date.now()) / 1000)) : null;
      } catch {
        out.broadcastRuntime.retry_after_sec = null;
      }
    } catch {
      // ignore
    }

    if (CFG.AUDIT_BUFFER_ENABLED) {
      try {
        const nowS = Math.floor(Date.now() / 1000);
        const [qLenRaw, iLenRaw, sinceRaw, cooldownTtlRaw, enqRaw, flRaw, rqRaw, lastFlush] = await Promise.all([
          redis.llen(k(['audit', 'buffer', 'ws'])),
          redis.llen(k(['audit', 'buffer', 'ws', 'inflight'])),
          redis.get(k(['audit', 'buffer', 'ws', 'inflight_since'])),
          redis.ttl(k(['audit', 'buffer', 'ws', 'requeue_cooldown'])),
          redis.get(k(['audit', 'buffer', 'enqueued', day])),
          redis.get(k(['audit', 'buffer', 'flushed', day])),
          redis.get(k(['audit', 'buffer', 'requeued', day])),
          redis.get(k(['audit', 'buffer', 'last_flush'])),
        ]);
        const queue_len = Number(qLenRaw) || 0;
        const inflight_len = Number(iLenRaw) || 0;
        const since = Number(sinceRaw) || 0;
        const inflight_age_sec = inflight_len > 0 && since > 0 ? Math.max(0, nowS - since) : null;
        out.auditRuntime.buffer = {
          ...out.auditRuntime.buffer,
          day,
          len: queue_len + inflight_len,
          queue_len,
          inflight_len,
          inflight_age_sec,
          requeue_cooldown_ttl_sec: Number(cooldownTtlRaw) > 0 ? Number(cooldownTtlRaw) : null,
          enqueued_today_total: Number(enqRaw) || 0,
          flushed_today_total: Number(flRaw) || 0,
          requeued_today_total: Number(rqRaw) || 0,
          last_flush: lastFlush || null,
        };
      } catch {
        // ignore
      }
    }
  }

  if ((Number(out.ops?.pending?.ops || 0) || 0) > 0) {
    pushWarning(out.warnings, 'info', `Ops digest buffer pending: ${Number(out.ops.pending.ops || 0)}`, 'runtime');
  }
  if ((Number(out.auditRuntime?.buffer?.queue_len || 0) || 0) > 0 || (Number(out.auditRuntime?.buffer?.inflight_len || 0) || 0) > 0) {
    pushWarning(out.warnings, 'info', `Audit buffer active: queue ${Number(out.auditRuntime.buffer.queue_len || 0)} · inflight ${Number(out.auditRuntime.buffer.inflight_len || 0)}`, 'runtime');
  }
  if ((Number(out.auditRuntime?.buffer?.inflight_age_sec || 0) || 0) >= 900) {
    pushWarning(out.warnings, 'warning', `Audit inflight висит ${formatRuntimeAgeLabel(out.auditRuntime.buffer.inflight_age_sec)}`, 'runtime');
  }
  if ((Number(out.broadcastRuntime?.pending_deliveries?.pending_count || 0) || 0) > 0) {
    pushWarning(out.warnings, 'warning', `Broadcast pending deliveries: ${Number(out.broadcastRuntime.pending_deliveries.pending_count || 0)}`, 'qstash');
  }
  if ((Number(out.broadcastRuntime?.retry_after_sec || 0) || 0) > 0) {
    pushWarning(out.warnings, 'info', `Broadcast retry cooldown: ${formatRuntimeAgeLabel(out.broadcastRuntime.retry_after_sec)}`, 'qstash');
  }
  if (String(out.mon?.retry?.last_error || '').trim()) {
    pushWarning(out.warnings, 'warning', `Последний retry вернул ошибку: ${String(out.mon.retry.last_error).slice(0, 140)}`, 'runtime');
  }
  if ((Number(out.qstashRuntime?.reschedule_failed?.today_count || 0) || 0) > 0) {
    pushWarning(out.warnings, 'warning', `QStash reschedule_failed сегодня: ${Number(out.qstashRuntime.reschedule_failed.today_count || 0)}`, 'qstash');
  }
  if ((Number(out.qstashRuntime?.official_publish_stuck?.today_count || 0) || 0) > 0) {
    pushWarning(out.warnings, 'warning', `Official publish stuck сегодня: ${Number(out.qstashRuntime.official_publish_stuck.today_count || 0)}`, 'qstash');
  }

  const controlAuditEvents = Array.isArray(out.controlSurface?.audit)
    ? out.controlSurface.audit.slice(0, 3).map((item) => ({
      kind: 'info',
      source: 'controls',
      message: `${String(item?.label || item?.controlId || 'Control')}: ${String(item?.nextValue === true ? 'ON' : (item?.nextValue === false ? 'OFF' : item?.action || 'updated'))}`,
      at: item?.ts || updatedAt,
    }))
    : [];

  out.recentRuntimeEvents = [
    ...out.warnings.slice(0, 5).map((item) => ({
      kind: String(item.level || 'info'),
      source: String(item.source || 'runtime'),
      message: String(item.message || ''),
      at: updatedAt,
    })),
    ...controlAuditEvents,
  ].slice(0, 6);

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

  out.statusHierarchy = buildStatusHierarchy({ services: out.services, controlSurface: out.controlSurface });
  out.controlSnapshot = buildControlSnapshot(out.controlSurface);
  out.configSummary = buildConfigSummary(out.configPresence);
  out.incidentStrip = deriveIncidentStrip({
    warnings: out.warnings,
    hints: out.hints,
    controlSurface: out.controlSurface,
    updatedAt,
  });
  out.summaryCards = {
    healthyServices: out.statusHierarchy.filter((item) => item.state === 'ok').length,
    needsAction: out.statusHierarchy.filter((item) => item.state !== 'ok').length,
    warnings: out.warnings.filter((item) => String(item?.message || '') !== 'Явных предупреждений нет').length,
    pausedControls: Number(out.controlSnapshot?.pausedCount || 0),
  };
  out.queueClarity = buildQueueClarity({
    ops: out.ops,
    audit: out.auditRuntime,
    broadcast: out.broadcastRuntime,
    mon: out.mon,
    qstash: out.qstashRuntime,
    redisConfigured,
    qstashConfigured,
    updatedAt,
  });

  return out;
}
