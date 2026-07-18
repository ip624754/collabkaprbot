const TIMEOUT_CODES = new Set(['ETIMEDOUT', 'ETIME']);
const TERMINATED_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'ENETDOWN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EAI_AGAIN',
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
]);

function errorChain(err, maxDepth = 5) {
  const out = [];
  const seen = new Set();
  let cur = err;
  while (cur && out.length < maxDepth && !seen.has(cur)) {
    seen.add(cur);
    out.push(cur);
    cur = cur.cause;
  }
  return out;
}

function chainCodes(err) {
  return errorChain(err)
    .map((e) => String(e?.code || '').trim().toUpperCase())
    .filter(Boolean);
}

function chainMessage(err) {
  return errorChain(err)
    .map((e) => String(e?.message || e || ''))
    .join(' | ')
    .toLowerCase();
}

export function classifyDbError(err, { phase = '' } = {}) {
  if (err?.dbErrorClass) return String(err.dbErrorClass);

  const codes = chainCodes(err);
  const msg = chainMessage(err);
  const p = String(phase || err?.dbPhase || '').toLowerCase();

  if (codes.includes('57014') || msg.includes('statement timeout') || msg.includes('canceling statement')) {
    return 'pg_statement_timeout';
  }

  if (
    codes.some((code) => TIMEOUT_CODES.has(code)) ||
    msg.includes('connection timeout') ||
    msg.includes('connect timeout') ||
    msg.includes('timeout acquiring a client')
  ) {
    return 'pg_connect_timeout';
  }

  if (
    codes.some((code) => TERMINATED_CODES.has(code)) ||
    msg.includes('connection terminated unexpectedly') ||
    msg.includes('connection terminated') ||
    msg.includes('server closed the connection unexpectedly') ||
    msg.includes('socket hang up')
  ) {
    return 'pg_connection_terminated';
  }

  if (p === 'connect' || p === 'session_init') return 'pg_connect_failed';
  return 'pg_query_failed';
}

export function annotateDbError(err, {
  phase = '',
  retryAttempted = false,
  retryCount = 0,
} = {}) {
  const out = err instanceof Error ? err : new Error(String(err || 'database error'));
  const normalizedPhase = String(phase || out.dbPhase || 'query');
  const errorClass = classifyDbError(out, { phase: normalizedPhase });

  try { out.dbErrorClass = errorClass; } catch {}
  try { out.dbPhase = normalizedPhase; } catch {}
  try { out.dbRetryAttempted = !!retryAttempted; } catch {}
  try { out.dbRetryCount = Math.max(0, Number(retryCount) || 0); } catch {}
  return out;
}

export function getDbErrorContext(err, { phase = '' } = {}) {
  const p = String(err?.dbPhase || phase || 'query');
  return {
    error_class: classifyDbError(err, { phase: p }),
    phase: p,
    retry_attempted: !!err?.dbRetryAttempted,
    retry_count: Math.max(0, Number(err?.dbRetryCount) || 0),
    code: String(err?.code || err?.cause?.code || '').slice(0, 32) || null,
    message: String(err?.message || err || 'database error').slice(0, 180),
  };
}

export function isTransientDbConnectError(err, { phase = '' } = {}) {
  const p = String(err?.dbPhase || phase || '').toLowerCase();
  if (p !== 'connect' && p !== 'session_init') return false;
  const c = classifyDbError(err, { phase: p });
  return c === 'pg_connect_timeout' || c === 'pg_connection_terminated';
}

export function shouldDestroyClientAfterDbError(err) {
  const c = classifyDbError(err, { phase: err?.dbPhase || 'query' });
  return c === 'pg_connect_timeout' || c === 'pg_connection_terminated';
}
