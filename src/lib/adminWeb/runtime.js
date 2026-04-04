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

function semanticLabelForState(state) {
  const key = String(state || '').trim().toLowerCase();
  return ({
    ok: 'OK',
    degraded: 'Нужна проверка',
    missing: 'Не настроено',
    unknown: 'Справочно',
    warning: 'Нужна проверка',
    error: 'Не настроено',
  })[key] || (key || '—');
}

function actionabilityForState(state) {
  const key = String(state || '').trim().toLowerCase();
  if (key === 'ok' || key === 'configured') return 'none';
  if (key === 'missing' || key === 'error') return 'setup';
  if (key === 'degraded' || key === 'warning') return 'check';
  return 'info';
}

function actionabilityLabel(mode) {
  return ({
    none: 'Действие не нужно',
    check: 'Нужно проверить',
    setup: 'Нужна настройка',
    info: 'Справочно',
  })[String(mode || '').trim().toLowerCase()] || 'Справочно';
}

function defaultMeaningForState(state) {
  const key = String(state || '').trim().toLowerCase();
  if (key === 'ok' || key === 'configured') return 'Контур выглядит штатно и не просит отдельного ручного действия прямо сейчас.';
  if (key === 'missing' || key === 'error') return 'Контур не считается полноценно настроенным: это setup-gap, а не скрытый runtime баг.';
  if (key === 'degraded' || key === 'warning') return 'Есть сигнал, который стоит проверить вручную; это не всегда авария, но его нельзя игнорировать.';
  return 'Это справочный статус: данных или обязательной настройки недостаточно, но сам по себе он не равен поломке.';
}

function nextStepForSource(source, state) {
  const src = String(source || '').trim().toLowerCase();
  const key = String(state || '').trim().toLowerCase();
  if (key === 'ok' || key === 'configured') return 'Достаточно держать контур под обычным наблюдением и обновлять Runtime вручную по необходимости.';
  if (src === 'db') return 'Проверь DATABASE_URL, доступность Neon/PG и свежий /api/health?full=1.';
  if (src === 'redis') return key === 'missing'
    ? 'Добавь Upstash env, если нужен operator/runtime слой; иначе считай этот сигнал осознанным ограничением.'
    : 'Проверь UPSTASH_REDIS_REST_URL / TOKEN и сетевой доступ до Upstash.';
  if (src === 'qstash') return key === 'missing'
    ? 'Добавь QStash env, если нужен publish/retry контур; для чистого read-admin это не авария.'
    : 'Проверь delivery/retry контур и соседние QStash сигналы.';
  if (src === 'payments') return 'Сверь payments fallback / HMAC guard и последние payment warnings, потом верни режим в норму.';
  if (src === 'admin_web' || src === 'controls') return key === 'missing'
    ? 'Проверь ADMIN_WEB_* env и PUBLIC_BASE_URL; paused toggle сам по себе не означает баг авторизации.'
    : 'Сверь control surface и пойми, почему этот режим всё ещё нужен оператору.';
  if (src === 'config') return 'Проверь core env baseline: BOT / PUBLIC_BASE_URL / admin-web config.';
  if (src === 'runtime') return key === 'unknown'
    ? 'Пока ничего не чинить: просто держи это в уме и сверяй соседние сигналы.'
    : 'Обнови Runtime вручную и смотри соседние сигналы по тому же контуру.';
  return key === 'missing'
    ? 'Донастрой контур и обнови Runtime, чтобы убедиться, что сигнал ушёл.'
    : (key === 'degraded' || key === 'warning'
      ? 'Проверь этот контур и соседние сигналы вручную.'
      : 'Пока достаточно ручного обновления и визуального smoke-pass.');
}

function decorateRuntimeItem(item = {}, { source = '', meaning = '', nextStep = '', actionability = '' } = {}) {
  const state = String(item?.state || 'unknown');
  const mode = actionability || actionabilityForState(state);
  return {
    ...item,
    semanticLabel: semanticLabelForState(state),
    actionability: mode,
    actionLabel: actionabilityLabel(mode),
    meaning: String(meaning || item?.meaning || defaultMeaningForState(state)),
    nextStep: String(nextStep || item?.nextStep || nextStepForSource(source || item?.id || item?.source, state)),
  };
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
      message: 'Оператор временно выключил часть runtime-потока. Это не silent bug, но состояние стоит перепроверять при каждом разборе.',
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
      semanticLabel: semanticLabelForState('ok'),
      actionability: 'none',
      actionLabel: actionabilityLabel('none'),
      title: 'Явных инцидентов сейчас не видно',
      message: 'Базовый infra/config слой и control plane выглядят стабильно для ручной операторской работы.',
      source: 'runtime',
      sourceLabel: 'Runtime',
      action: 'Достаточно ручного обновления и короткого визуального смоука.',
      updatedAt,
      feed: [
        decorateRuntimeItem({
          level: 'info',
          state: 'ok',
          title: 'Система выглядит стабильно',
          source: 'runtime',
          sourceLabel: 'Runtime',
          message: 'Нет явных degraded / missing / paused сигналов, требующих немедленного действия.',
        }, {
          source: 'runtime',
          meaning: 'Ключевые runtime-контуры сейчас не спорят друг с другом и не показывают аварийную картину.',
          nextStep: 'Достаточно ручного обновления и короткого визуального smoke-pass.',
          actionability: 'none',
        }),
      ],
    };
  }

  const primary = [...candidates].sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return String(a.source || '').localeCompare(String(b.source || ''));
  })[0];

  const state = primary.weight >= 3 ? 'missing' : (primary.weight >= 2 ? 'degraded' : 'unknown');
  const source = String(primary.source || 'runtime');
  const title = String(primary.title || primary.message || 'Нужна проверка');

  let action = nextStepForSource(source, state);
  if (Array.isArray(hints) && hints.length && source === 'runtime') action = String(hints[0]?.message || action);

  return {
    state,
    tone: state === 'missing' ? 'error' : (state === 'degraded' ? 'warning' : 'info'),
    semanticLabel: semanticLabelForState(state),
    actionability: actionabilityForState(state),
    actionLabel: actionabilityLabel(actionabilityForState(state)),
    title,
    message: String(primary.message || title),
    source,
    sourceLabel: sourceLabel(source),
    action,
    updatedAt,
    feed: candidates.slice(0, 4).map((item) => decorateRuntimeItem({
      level: String(item.level || 'info'),
      state: item.weight >= 3 ? 'missing' : (item.weight >= 2 ? 'degraded' : 'unknown'),
      title: String(item.title || item.message || '—'),
      source: String(item.source || 'runtime'),
      sourceLabel: sourceLabel(item.source || 'runtime'),
      message: String(item.message || item.title || ''),
    }, {
      source: item.source || 'runtime',
      meaning: String(item.message || item.title || ''),
    })),
  };
}

function buildStatusHierarchy({ services = {}, controlSurface = null } = {}) {
  const authToggleOn = !!controlSurface?.byId?.admin_web_login?.value;
  const fallbackActive = !!controlSurface?.byId?.payments_fallback?.value;
  const items = [
    {
      id: 'db',
      label: 'DB',
      state: String(services.db?.state || 'unknown'),
      summary: String(services.db?.label || 'Данные пока недоступны'),
      hint: 'источник данных',
      meaning: String(services.db?.hint || ''),
    },
    {
      id: 'redis',
      label: 'Redis',
      state: String(services.redis?.state || 'unknown'),
      summary: String(services.redis?.label || 'Данные пока недоступны'),
      hint: 'locks / runtime state',
      meaning: String(services.redis?.hint || ''),
    },
    {
      id: 'qstash',
      label: 'Delivery',
      state: String(services.qstash?.state || 'unknown'),
      summary: String(services.qstash?.label || 'Данные пока недоступны'),
      hint: 'publish / retry',
      meaning: String(services.qstash?.hint || ''),
    },
    {
      id: 'payments',
      label: 'Платежи',
      state: fallbackActive && services.payments?.state === 'ok' ? 'degraded' : String(services.payments?.state || 'unknown'),
      summary: fallbackActive ? 'Fallback runtime override активен' : String(services.payments?.label || 'Данные пока недоступны'),
      hint: fallbackActive ? 'incident mode' : 'apply / fallback',
      meaning: fallbackActive
        ? 'Активен осознанный incident fallback режим. Это не silent failure, но его нельзя держать включённым бесконечно.'
        : String(services.payments?.hint || ''),
    },
    {
      id: 'admin_web',
      label: 'Web-admin',
      state: !authToggleOn && services.adminWeb?.state === 'ok' ? 'degraded' : String(services.adminWeb?.state || 'unknown'),
      summary: !authToggleOn ? 'Новые login запросы paused' : String(services.adminWeb?.label || 'Данные пока недоступны'),
      hint: 'auth / session',
      meaning: !authToggleOn
        ? 'Входной контур paused оператором. Это не баг авторизации, а сознательный control-plane режим.'
        : String(services.adminWeb?.hint || ''),
    },
    {
      id: 'config',
      label: 'Config',
      state: String(services.config?.state || 'unknown'),
      summary: String(services.config?.label || 'Данные пока недоступны'),
      hint: 'core env baseline',
      meaning: String(services.config?.hint || ''),
    },
  ];
  return items.map((item) => decorateRuntimeItem(item, {
    source: item.id,
    meaning: item.meaning,
  }));
}

function buildControlSnapshot(controlSurface = null) {
  const items = Array.isArray(controlSurface?.items) ? controlSurface.items : [];
  const toggles = items.filter((item) => item?.kind === 'toggle');
  const pausedCount = toggles.filter((item) => !item.value).length;
  const incidentModes = items.filter((item) => item?.kind === 'runtime_override' && item?.value).length;
  return {
    pausedCount,
    incidentModes,
    items: items.map((item) => {
      const isRuntimeOverride = item?.kind === 'runtime_override';
      const isActive = !!item?.value;
      const state = isRuntimeOverride
        ? (isActive ? 'degraded' : 'ok')
        : (isActive ? 'ok' : 'degraded');
      const meaning = isRuntimeOverride
        ? (isActive
          ? 'Инцидентный режим включён оператором. Это не поломка само по себе, а осознанный override до завершения разбора.'
          : 'Override сейчас не активен, контур идёт в штатном режиме.')
        : (isActive
          ? 'Тумблер выглядит штатно включённым.'
          : 'Контур paused оператором. Это не silent bug, но стоит понять, нужна ли пауза до сих пор.');
      const nextStep = isRuntimeOverride
        ? (isActive
          ? 'Проверь, нужен ли override до сих пор, и после инцидента верни контур в обычный режим.'
          : 'Действие не нужно: просто держи override под наблюдением.')
        : (isActive
          ? 'Действие не нужно, если этот тумблер и должен быть включён.'
          : 'Сверь, что пауза поставлена сознательно, и не забывай про её операционные последствия.');
      const actionability = isRuntimeOverride && isActive ? 'check' : (!isRuntimeOverride && !isActive ? 'check' : 'none');
      return decorateRuntimeItem({
        id: String(item?.id || 'unknown'),
        label: String(item?.shortLabel || item?.label || 'Control'),
        state,
        stateLabel: String(item?.stateLabel || (isActive ? 'ON' : 'OFF')),
        hint: isRuntimeOverride
          ? (item?.runtimeLabel ? `runtime ${String(item.runtimeLabel)}` : 'incident override')
          : (item?.changedBy && item?.changedBy !== '—' ? `последний change: ${String(item.changedBy)}` : 'без явного override'),
        changedAt: item?.changedAt || null,
      }, {
        source: 'controls',
        meaning,
        nextStep,
        actionability,
      });
    }),
    lastAudit: Array.isArray(controlSurface?.audit) ? controlSurface.audit[0] || null : null,
  };
}

function buildConfigSummary(configPresence = []) {
  const items = Array.isArray(configPresence) ? configPresence : [];
  return {
    configured: items.filter((item) => item?.state === 'configured').length,
    missing: items.filter((item) => item?.state === 'missing').length,
    optional: items.filter((item) => item?.state === 'optional' || item?.state === 'not_enabled').length,
    infoOnly: items.filter((item) => item?.toneState === 'unknown').length,
  };
}

function decorateConfigPresence(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const state = String(item?.state || 'unknown');
    const toneState = state === 'configured' ? 'ok' : (state === 'missing' ? 'missing' : 'unknown');
    const meaning = state === 'configured'
      ? 'Env найден и считается присутствующим.'
      : (state === 'missing'
        ? 'Required env отсутствует: это setup-gap, а не runtime деградация уже работающего контура.'
        : (state === 'not_enabled'
          ? 'Контур сейчас выключен флагом и поэтому не обязан иметь все env-ключи.'
          : 'Опциональный env сейчас не является обязательным для базового read-admin режима.'));
    const nextStep = state === 'configured'
      ? 'Действие не нужно.'
      : (state === 'missing'
        ? 'Добавь env и после деплоя обнови Runtime.'
        : (state === 'not_enabled'
          ? 'Если хочешь включить этот контур, сначала подними флаг и связанные env.'
          : 'Ничего не чинить срочно: просто помни, что соответствующий контур будет ограничен.'));
    return {
      ...item,
      toneState,
      semanticLabel: state === 'configured' ? 'OK' : (state === 'missing' ? 'Не настроено' : 'Справочно'),
      meaning,
      nextStep,
    };
  });
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
    decorateRuntimeItem({
      id: 'ops_digest',
      label: 'Ops digest',
      state: queueLaneState({ enabled: true, configured: redisConfigured, backlog: opsPending }),
      summary: redisConfigured ? (opsPending > 0 ? `${opsPending} pending в буфере alert-ов` : 'pending очереди сейчас нет') : 'без Redis pending очередь недоступна',
      detail: ops?.last_sent_at ? `last sent ${ops.last_sent_at}` : 'last sent пока не зафиксирован',
      hint: opsPending > 0 ? 'накопился ops buffer' : 'alert buffer тихий',
      backlog: opsPending,
    }, {
      source: 'runtime',
      meaning: redisConfigured
        ? (opsPending > 0 ? 'Буфер ops alert-ов не пуст: это повод проверить, не висит ли digest-фан-аут.' : 'Ops digest выглядит спокойно и не копит хвост.')
        : 'Без Redis эта очередь остаётся только справочным ограничением: read-admin жив, но ops buffer не наблюдаем полноценно.',
      nextStep: redisConfigured
        ? (opsPending > 0 ? 'Сверь, почему ops buffer не опустел, и проверь соседние delivery/retry сигналы.' : 'Действие не нужно.')
        : 'Добавь Redis, если нужен полноценный контроль ops buffer поверх read-admin.',
    }),
    decorateRuntimeItem({
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
    }, {
      source: 'runtime',
      meaning: audit?.buffer?.enabled
        ? (auditWarning
          ? 'Audit inflight висит слишком долго: это уже не просто фон, а сигнал проверить buffer/requeue механику.'
          : ((auditBacklog + auditInflight) > 0 || auditCooldown > 0)
            ? 'Buffer не пуст или стоит в cooldown: это деградация по throughput, но не обязательно авария.'
            : 'Audit buffer выглядит спокойно.')
        : 'Audit buffer сейчас выключен: это не авария, а просто отсутствие этого вспомогательного контура.',
      nextStep: audit?.buffer?.enabled
        ? (auditWarning
          ? 'Проверь inflight age, last flush и requeue cooldown, чтобы понять, где застрял buffer.'
          : ((auditBacklog + auditInflight) > 0 || auditCooldown > 0)
            ? 'Сверь backlog, inflight и cooldown; если хвост не уходит, смотри Redis и соседние очереди.'
            : 'Действие не нужно.')
        : 'Ничего срочно не чинить: просто помни, что текущий runtime не опирается на audit buffer.',
      actionability: audit?.buffer?.enabled ? '' : 'info',
    }),
    decorateRuntimeItem({
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
    }, {
      source: 'qstash',
      meaning: (!redisConfigured || !qstashConfigured)
        ? 'Контур delivery ограничен настройкой: read-admin ещё жив, но publish/retry слой не считается полностью рабочим.'
        : (pendingDeliveries > 0
          ? 'Есть backlog по доставке: это повод проверить, почему fan-out не разгребает хвост.'
          : (retryAfter > 0
            ? 'Сейчас активен retry cooldown: это операторски важно, но не равняется silent failure.'
            : 'Delivery lane выглядит спокойно.')),
      nextStep: (!redisConfigured || !qstashConfigured)
        ? 'Донастрой Redis/QStash, если этот delivery контур должен быть полноценно рабочим.'
        : (pendingDeliveries > 0
          ? 'Проверь pending snapshot, last 429 и delivery timestamps, чтобы понять источник хвоста.'
          : (retryAfter > 0
            ? 'Дождись окна retry или сверь, почему cooldown держится дольше обычного.'
            : 'Действие не нужно.')),
    }),
    decorateRuntimeItem({
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
    }, {
      source: 'qstash',
      meaning: retryWarning
        ? 'Последний retry выглядит проблемным: это уже не просто шум, а повод разобрать error/status сигнал.'
        : (qstashWarning
          ? 'Есть stuck/reschedule_failed сигналы: delivery контур не полностью чист.'
          : (mon?.retry?.last_at
            ? 'Retry monitor жив и последний сигнал не выглядит аварийным.'
            : 'Справочно: явной retry-активности пока просто не видно.')),
      nextStep: retryWarning
        ? 'Сверь last retry action/status/error и соседние QStash сигналы.'
        : (qstashWarning
          ? 'Разбери stuck/reschedule_failed причины и посмотри, не повторяются ли они сегодня.'
          : (mon?.retry?.last_at
            ? 'Действие не нужно.'
            : 'Ничего срочно не чинить: это информационная пустота, а не падение ретраев.')),
    }),
  ];

  const retrySignals = [
    decorateRuntimeItem({
      id: 'retry_last',
      label: 'Последний retry',
      state: retryWarning ? 'degraded' : (mon?.retry?.last_at ? 'ok' : 'unknown'),
      summary: mon?.retry?.last_status ? String(mon.retry.last_status) : 'нет данных',
      detail: mon?.retry?.last_at ? `${mon.retry.last_at}${mon?.retry?.last_action ? ` · ${mon.retry.last_action}` : ''}` : 'runtime retry signal пока пуст',
      note: retryError || '',
    }, {
      source: 'qstash',
      meaning: retryWarning
        ? 'Последний retry вернул problem-signal и требует ручной проверки.'
        : (mon?.retry?.last_at ? 'Последний retry виден и сейчас не выглядит аварийным.' : 'Сигнал пустой: это справочная пустота, а не ошибка сама по себе.'),
      nextStep: retryWarning ? 'Проверь последний retry error/status и соседние delivery сигналы.' : (mon?.retry?.last_at ? 'Действие не нужно.' : 'Ничего не чинить срочно: просто держать это в уме.'),
    }),
    decorateRuntimeItem({
      id: 'reschedule_failed',
      label: 'QStash reschedule_failed',
      state: rescheduleFailedCount > 0 ? 'degraded' : 'ok',
      summary: `${rescheduleFailedCount}`,
      detail: qstash?.reschedule_failed?.last_at ? `${qstash.reschedule_failed.last_at}${qstash?.reschedule_failed?.last_where ? ` · ${qstash.reschedule_failed.last_where}` : ''}` : 'сегодня не фиксировалось',
      note: qstash?.reschedule_failed?.last_payload ? String(qstash.reschedule_failed.last_payload).slice(0, 120) : '',
    }, {
      source: 'qstash',
      meaning: rescheduleFailedCount > 0
        ? 'Сегодня уже были reschedule_failed сигналы: delivery path стоит разобрать предметно.'
        : 'Сегодня этот тип сбоя не фиксировался.',
      nextStep: rescheduleFailedCount > 0 ? 'Проверь last_where / payload и оцени, повторяется ли причина.' : 'Действие не нужно.',
    }),
    decorateRuntimeItem({
      id: 'official_publish_stuck',
      label: 'Official publish stuck',
      state: officialPublishStuckCount > 0 ? 'degraded' : 'ok',
      summary: `${officialPublishStuckCount}`,
      detail: qstash?.official_publish_stuck?.last_at ? `${qstash.official_publish_stuck.last_at}${qstash?.official_publish_stuck?.last_offer_id ? ` · offer ${qstash.official_publish_stuck.last_offer_id}` : ''}` : 'сегодня не фиксировалось',
      note: qstash?.official_publish_stuck?.last_age_sec ? `age ${formatRuntimeAgeLabel(qstash.official_publish_stuck.last_age_sec)}` : '',
    }, {
      source: 'qstash',
      meaning: officialPublishStuckCount > 0
        ? 'Есть stuck publish сигналы: это повод проверить publish-lock / delivery path.'
        : 'Сегодня stuck publish не фиксировался.',
      nextStep: officialPublishStuckCount > 0 ? 'Сверь stuck age, offer id и соседние publish/retry сигналы.' : 'Действие не нужно.',
    }),
  ];

  const activeBacklog = lanes.reduce((sum, item) => sum + (Number(item?.backlog || 0) || 0), 0);
  const retryProblems = retrySignals.filter((item) => item.state === 'degraded').length;
  const coolingWindows = [auditCooldown > 0 ? 1 : 0, retryAfter > 0 ? 1 : 0].reduce((a, b) => a + b, 0);
  const overallState = deriveOverallState(lanes.map((item) => item.state));
  const summaryCards = {
    activeBacklog,
    retryProblems,
    coolingWindows,
    infoOnly: lanes.filter((item) => item.state === 'unknown').length,
  };

  return {
    updatedAt,
    overall: { state: overallState, label: overallLabel(overallState) },
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
  const qstashState = qstashConfigured ? 'ok' : 'unknown';
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
    qstash: makeService(qstashState, qstashConfigured ? 'QStash configured' : 'QStash not configured', qstashConfigured ? 'Фоновая доставка может работать.' : 'Для admin v1 это не блокер: publish/retry поверхности будут ограничены, но core web-admin остаётся рабочим.'),
    payments: makeService(paymentsState, paymentsFallbackEnabled ? (paymentsHmacConfigured ? 'Payments fallback guarded' : 'Payments fallback lacks HMAC guard') : 'Payments fallback disabled', paymentsFallbackEnabled ? (paymentsHmacConfigured ? 'Fallback path защищён HMAC ключом.' : 'Проверь PAYMENTS_PAYLOAD_HMAC_KEY.') : 'Fallback path сейчас не активен.'),
    config: makeService(configState, configState === 'ok' ? 'Core config present' : 'Core config incomplete', configState === 'ok' ? 'Базовый env layer выглядит собранным.' : 'Проверь BOT / PUBLIC_BASE_URL env baseline.'),
    adminWeb: makeService(adminWebState, !adminWebEnabled ? 'Admin web disabled' : (adminWebState === 'ok' ? 'Admin web auth configured' : 'Admin web auth incomplete'), !adminWebEnabled ? 'Web admin выключен env-флагом.' : (adminWebState === 'ok' ? 'Secret / session / approvers настроены.' : 'Проверь ADMIN_WEB_* env и PUBLIC_BASE_URL.')),
  };

  out.configPresence = decorateConfigPresence([
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
  ]);

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
        k(['ops', 'reasons', 'qstash_reschedule_failed', 'd', day]),
        k(['ops', 'reasons', 'qstash_reschedule_failed', 'last_at']),
        k(['ops', 'reasons', 'qstash_reschedule_failed', 'last_where']),
        k(['ops', 'reasons', 'qstash_reschedule_failed', 'last_payload']),
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
    ok: out.statusHierarchy.filter((item) => item.state === 'ok').length,
    check: out.statusHierarchy.filter((item) => item.state === 'degraded').length,
    setup: out.statusHierarchy.filter((item) => item.state === 'missing').length,
    info: out.statusHierarchy.filter((item) => item.state === 'unknown').length,
    warnings: out.warnings.filter((item) => String(item?.message || '') !== 'Явных предупреждений нет').length,
    pausedControls: Number(out.controlSnapshot?.pausedCount || 0),
    incidentModes: Number(out.controlSnapshot?.incidentModes || 0),
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
