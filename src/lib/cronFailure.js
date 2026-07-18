import { getDbErrorContext } from '../db/errorClassification.js';

const CRON_JOB_FAILURE_HANDLED = Symbol.for('collabka.cron_job_failure_handled');

function safeJob(job) {
  return String(job || 'unknown-job').trim().slice(0, 80) || 'unknown-job';
}

export function markCronJobFailureHandled(error, metadata = {}) {
  if (!error || (typeof error !== 'object' && typeof error !== 'function')) return error;
  try {
    Object.defineProperty(error, CRON_JOB_FAILURE_HANDLED, {
      value: { ...metadata, handled: true },
      configurable: true,
      enumerable: false,
      writable: true,
    });
  } catch {
    try { error[CRON_JOB_FAILURE_HANDLED] = { ...metadata, handled: true }; } catch {}
  }
  return error;
}

export function getCronJobFailureHandled(error) {
  try { return error?.[CRON_JOB_FAILURE_HANDLED] || null; } catch { return null; }
}

export function isCronJobFailureHandled(error) {
  return !!getCronJobFailureHandled(error)?.handled;
}

export function buildCronFailureAlert(job, error) {
  const j = safeJob(job);
  const hasDbEvidence = !!(
    error?.dbErrorClass ||
    error?.dbPhase ||
    error?.code ||
    /postgres|pg_|connection terminated|statement timeout|canceling statement/i.test(String(error?.message || ''))
  );
  const db = hasDbEvidence
    ? getDbErrorContext(error, { phase: error?.dbPhase || 'query' })
    : {
        error_class: 'cron_job_failed',
        phase: 'job',
        retry_attempted: false,
        retry_count: 0,
        code: null,
      };
  const errorClass = db.error_class;
  const payloadParts = [
    `job=${j}`,
    `error_class=${errorClass}`,
    `phase=${db.phase}`,
    `retry_count=${db.retry_count || 0}`,
  ];

  return {
    group: 'ops',
    reason: 'cron_failed',
    title: `${j} не выполнен · ${errorClass}`,
    kind: 'cron',
    payload: payloadParts.join(' '),
    extra: [
      db.code ? `code=${db.code}` : '',
      `${String(error?.name || 'Error')}: ${String(error?.message || error).slice(0, 180)}`,
    ].filter(Boolean),
    dedupId: `cron_failed:${j}:${errorClass}`,
    metadata: {
      job: j,
      error_class: errorClass,
      phase: db.phase,
      retry_count: db.retry_count,
      retry_attempted: db.retry_attempted,
    },
  };
}

export async function reportCronJobFailure({ job, error, beforeQueue, queueAlert } = {}) {
  const alert = buildCronFailureAlert(job, error);
  markCronJobFailureHandled(error, alert.metadata);
  if (typeof beforeQueue === 'function') {
    try { await beforeQueue(alert); } catch {}
  }
  if (typeof queueAlert === 'function') {
    try { await queueAlert(alert); } catch {}
  }
  return alert;
}
