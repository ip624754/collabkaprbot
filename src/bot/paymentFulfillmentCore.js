import crypto from 'crypto';

const FULFILLMENT_VERSION = 'STEP588X1_v1';
const APPLYING_STALE_AFTER_MS = 20 * 60 * 1000;

function safeUpper(s) {
  return String(s || '').trim().toUpperCase();
}

function safeLower(s) {
  return String(s || '').trim().toLowerCase();
}

function isHexLower(s) {
  return /^[0-9a-f]+$/.test(String(s || ''));
}

function clampSigLen(cfg = {}) {
  const n = Number(cfg.PAYMENTS_PAYLOAD_HMAC_LEN || 10) || 10;
  return Math.max(6, Math.min(n, 16));
}

function verifyPayloadHmac(payload, cfg = {}) {
  const key = String(cfg.PAYMENTS_PAYLOAD_HMAC_KEY || '').trim();
  const p = String(payload || '');
  if (!key) return { ok: true, signed: false, payloadNoSig: p, mode: 'no_key' };

  const sigLen = clampSigLen(cfg);
  const last = p.lastIndexOf('_');
  if (last < 0) return { ok: false, reason: 'bad_payload_format' };

  const prefix = p.slice(0, last + 1);
  const tokenWithSig = p.slice(last + 1);
  if (!tokenWithSig || tokenWithSig.length <= sigLen) {
    if (cfg.PAYMENTS_FALLBACK_ALLOW_UNSIGNED) return { ok: true, signed: false, payloadNoSig: p, mode: 'unsigned_allowed' };
    return { ok: false, reason: 'unsigned_payload' };
  }

  const sig = tokenWithSig.slice(-sigLen).toLowerCase();
  const token = tokenWithSig.slice(0, -sigLen);
  if (!token || !isHexLower(sig)) {
    if (cfg.PAYMENTS_FALLBACK_ALLOW_UNSIGNED) return { ok: true, signed: false, payloadNoSig: p, mode: 'unsigned_allowed' };
    return { ok: false, reason: 'unsigned_payload' };
  }

  let expected = '';
  try {
    expected = crypto.createHmac('sha256', key).update(`${prefix}${token}`).digest('hex').slice(0, sigLen).toLowerCase();
  } catch {
    return { ok: false, reason: 'hmac_error' };
  }

  const expectedBuf = Buffer.from(expected, 'utf8');
  const sigBuf = Buffer.from(sig, 'utf8');
  if (expectedBuf.length !== sigBuf.length || !crypto.timingSafeEqual(expectedBuf, sigBuf)) {
    return { ok: false, reason: 'bad_sig' };
  }

  return { ok: true, signed: true, payloadNoSig: `${prefix}${token}`, mode: 'signed_ok' };
}

function isPgLockNotAvailable(err) {
  return String(err?.code || '') === '55P03';
}

function isSchemaNotReady(err) {
  const code = String(err?.code || '');
  return code === '42P01' || code === '42703' || code === '23514';
}

function normalizePayloadNoSigForCompare(rawPayload, cfg = {}) {
  const p = String(rawPayload || '');
  if (!p) return '';
  try {
    const hv = verifyPayloadHmac(p, cfg);
    if (hv && hv.ok) return String(hv.payloadNoSig || p);
  } catch {
    // ignore and compare raw payload
  }
  return p;
}

function paymentKindFromPayload(payload) {
  const p = String(payload || '');
  if (p.startsWith('pro_')) return 'pro';
  if (p.startsWith('brand_')) return 'brand_pass';
  if (p.startsWith('bplan_')) return 'brand_plan';
  if (p.startsWith('match_')) return 'matching';
  if (p.startsWith('feat_')) return 'featured';
  if (p.startsWith('founder_')) return 'founder';
  if (p.startsWith('offpub_')) return 'official_publish';
  return 'unknown';
}

function sanitizeContext(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const numericKeys = new Set(['wsId', 'ownerUserId', 'userId', 'offerId', 'page', 'durationDays', 'credits', 'days', 'count']);
  const textKeys = new Set(['ret', 'bpr', 'productId', 'packId', 'plan', 'tierId', 'sessionType', 'validatedKind']);
  const out = {};
  for (const key of numericKeys) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    const n = Number(raw[key]);
    if (Number.isFinite(n)) out[key] = Math.trunc(n);
  }
  for (const key of textKeys) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    const v = String(raw[key] || '').slice(0, 160);
    if (v) out[key] = v;
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'validatedExpected')) {
    const n = Number(raw.validatedExpected);
    if (Number.isFinite(n) && n > 0) out.validatedExpected = Math.trunc(n);
  }
  return out;
}

function normalizeValidationSnapshot(validation, payload, totalAmount, currency) {
  if (!validation || validation.ok !== true) return null;
  const expected = Number(validation.expected || 0);
  const paid = Number(totalAmount || 0);
  const kind = String(validation.kind || paymentKindFromPayload(payload));
  if (!expected || expected <= 0 || expected !== paid) return null;
  if (safeUpper(currency || 'XTR') !== 'XTR') return null;
  if (kind !== paymentKindFromPayload(payload)) return null;
  return {
    validatedKind: kind,
    validatedExpected: expected,
    ...(validation.meta && typeof validation.meta === 'object' ? sanitizeContext(validation.meta) : {}),
  };
}

async function persistFulfillmentContext({ dbPool, paymentId, context }) {
  const safe = sanitizeContext(context);
  if (!Object.keys(safe).length) return { ok: true, context: {} };
  try {
    const r = await dbPool.query(
      `update payments
          set fulfillment_context = $2::jsonb || coalesce(fulfillment_context, '{}'::jsonb),
              fulfillment_version = coalesce(fulfillment_version, $3),
              updated_at = now()
        where id = $1
          and status <> 'APPLIED'
        returning fulfillment_context`,
      [Number(paymentId), JSON.stringify(safe), FULFILLMENT_VERSION]
    );
    if (r.rowCount <= 0) {
      const existing = await dbPool.query(`select status, fulfillment_context from payments where id=$1 limit 1`, [Number(paymentId)]);
      const row = existing.rows[0] || null;
      if (row && String(row.status || '').toUpperCase() === 'APPLIED') {
        return { ok: true, context: row.fulfillment_context || {} };
      }
      return { ok: false, reason: row ? 'payment_not_mutable' : 'no_payment_row' };
    }
    return { ok: true, context: r.rows[0]?.fulfillment_context || safe };
  } catch (e) {
    return { ok: false, reason: isSchemaNotReady(e) ? 'schema_not_ready' : 'context_persist_failed', errorCode: String(e?.code || '') };
  }
}

function parseProPayload(payload) {
  const parts = String(payload || '').split('_');
  const wsId = Number(parts[1] || 0);
  let payUserId = 0;
  if (parts.length >= 4 && /^\d+$/.test(String(parts[2] || ''))) payUserId = Number(parts[2] || 0);
  return { wsId, payUserId };
}

function parseBrandTopupPayload(payload) {
  const parts = String(payload || '').split('_');
  return { userId: Number(parts[1] || 0), packIdRaw: String(parts[2] || '').trim(), packId: safeUpper(parts[2]) };
}

function parseBrandPlanPayload(payload) {
  const parts = String(payload || '').split('_');
  return { userId: Number(parts[1] || 0), plan: safeLower(parts[2] || 'start') };
}

function parseFounderPayload(payload) {
  const parts = String(payload || '').split('_');
  return { productId: parts.slice(0, 3).join('_'), userId: Number(parts[3] || 0) };
}

function parseMatchingPayload(payload) {
  const parts = String(payload || '').split('_');
  return { userId: Number(parts[1] || 0), tierId: safeUpper(parts[2] || 'S') };
}

function parseFeaturedPayload(payload) {
  const parts = String(payload || '').split('_');
  return { userId: Number(parts[1] || 0), days: Number(parts[2] || 0) };
}

function brandPackCredits(packId, packIdRaw = '', cfg = {}) {
  const id = safeUpper(packId);
  if (id === 'S') return Number(cfg.BRAND_TOPUP_S_CREDITS || 0);
  if (id === 'M') return Number(cfg.BRAND_TOPUP_M_CREDITS || 0);
  if (id === 'L') return Number(cfg.BRAND_TOPUP_L_CREDITS || 0);
  if (/^\d+$/.test(String(packIdRaw || ''))) {
    const n = Number(packIdRaw);
    if ([cfg.BRAND_TOPUP_S_CREDITS, cfg.BRAND_TOPUP_M_CREDITS, cfg.BRAND_TOPUP_L_CREDITS].map(Number).includes(n)) return n;
  }
  return 0;
}

function brandPlanCredits(plan, cfg = {}) {
  const p = normalizeBrandPlanId(plan);
  if (p === 'start') return Number(cfg.BRAND_PLAN_START_CREDITS || 0);
  if (p === 'pro') return Number(cfg.BRAND_PLAN_PRO_CREDITS || 0);
  return 0;
}

function normalizeBrandPlanId(plan) {
  const p = safeLower(plan);
  if (p === 'basic') return 'start';
  if (p === 'max') return 'pro';
  if (p === 'start' || p === 'pro') return p;
  return '';
}

function founderBrandCredits(productId, cfg = {}) {
  if (productId === 'founder_brand_3m') return Number(cfg.FOUNDER_BRAND_3M_CREDITS || 0);
  if (productId === 'founder_brand_12m') return Number(cfg.FOUNDER_BRAND_12M_CREDITS || 0);
  return 0;
}

function founderDurationDays(productId) {
  if (productId === 'founder_brand_3m') return 90;
  if (productId === 'founder_brand_12m' || productId === 'founder_creator_12m') return 365;
  return 0;
}

function matchingCount(tierId, cfg = {}) {
  const t = safeUpper(tierId);
  if (t === 'S') return Number(cfg.MATCH_S_COUNT || 0);
  if (t === 'M') return Number(cfg.MATCH_M_COUNT || 0);
  if (t === 'L') return Number(cfg.MATCH_L_COUNT || 0);
  return 0;
}

function mergeResult(base, extra) {
  const out = { ...base };
  if (extra && typeof extra === 'object') {
    for (const [key, value] of Object.entries(extra)) {
      if (key !== 'ok') out[key] = value;
    }
  }
  return out;
}

async function reconcileCommittedFulfillment(dbPool, paymentId) {
  try {
    const r = await dbPool.query(
      `select p.status,
              p.fulfillment_result,
              f.product_kind,
              f.result as receipt_result
         from payments p
         left join payment_fulfillments f on f.payment_id = p.id
        where p.id = $1
        limit 1`,
      [Number(paymentId)]
    );
    const row = r.rows[0] || null;
    if (!row || String(row.status || '').toUpperCase() !== 'APPLIED' || !row.product_kind) return null;
    const result = row.fulfillment_result && typeof row.fulfillment_result === 'object'
      ? row.fulfillment_result
      : (row.receipt_result && typeof row.receipt_result === 'object' ? row.receipt_result : {});
    return mergeResult({ applied: true, commitReconciled: true, kind: String(row.product_kind) }, result);
  } catch {
    return null;
  }
}

async function applyPaymentAtomicTx({
  dbPool,
  cfg,
  paymentId,
  paymentUserId,
  appliedByUserId,
  telegramPaymentChargeId,
  payloadNoSig,
  note,
  productKind,
  expectedAmount,
  expectedCurrency,
  applyTx,
}) {
  const pid = Number(paymentId);
  const uid = Number(paymentUserId);
  const appliedBy = Number(appliedByUserId || paymentUserId);

  let client;
  try {
    client = await dbPool.connect();
  } catch (e) {
    return { applied: false, reason: 'ledger_unavailable', errorCode: String(e?.code || '') };
  }

  let commitAttempted = false;
  try {
    await client.query('begin');

    let payRow;
    try {
      const r = await client.query(`select * from payments where id=$1 for update nowait`, [pid]);
      payRow = r.rows[0] || null;
    } catch (e) {
      if (isPgLockNotAvailable(e)) {
        await client.query('rollback');
        return { applied: false, reason: 'locked' };
      }
      throw e;
    }

    if (!payRow) {
      await client.query('rollback');
      return { applied: false, reason: 'no_payment_row' };
    }
    if (Number(payRow.user_id) !== uid) {
      await client.query('rollback');
      return { applied: false, reason: 'payment_user_mismatch' };
    }
    if (Number(payRow.total_amount || 0) !== Number(expectedAmount || 0)) {
      await client.query('rollback');
      return { applied: false, reason: 'ledger_amount_mismatch' };
    }
    if (safeUpper(payRow.currency || '') !== safeUpper(expectedCurrency || 'XTR')) {
      await client.query('rollback');
      return { applied: false, reason: 'ledger_currency_mismatch' };
    }
    if (String(payRow.kind || paymentKindFromPayload(payRow.invoice_payload)) !== String(productKind)) {
      await client.query('rollback');
      return { applied: false, reason: 'ledger_kind_mismatch' };
    }

    if (String(payRow.status || '').toUpperCase() === 'APPLIED') {
      await client.query('rollback');
      return mergeResult({ applied: false, reason: 'already_applied', alreadyApplied: true }, payRow.fulfillment_result || {});
    }

    if (String(payRow.status || '').toUpperCase() === 'APPLYING') {
      const applyingAtMs = payRow.applying_at ? new Date(payRow.applying_at).getTime() : 0;
      const isFreshOrUnknown = !Number.isFinite(applyingAtMs) || applyingAtMs <= 0 || (Date.now() - applyingAtMs) < APPLYING_STALE_AFTER_MS;
      if (isFreshOrUnknown) {
        await client.query('rollback');
        return { applied: false, reason: 'applying_in_progress' };
      }
    }

    const cidDb = String(payRow.telegram_payment_charge_id || '');
    const cidIn = String(telegramPaymentChargeId || '');
    if (cidDb && cidIn && cidDb !== cidIn) {
      await client.query('rollback');
      return { applied: false, reason: 'charge_id_mismatch' };
    }

    const dbPayload = normalizePayloadNoSigForCompare(payRow.invoice_payload, cfg);
    if (!dbPayload || String(dbPayload) !== String(payloadNoSig || '')) {
      await client.query('rollback');
      return { applied: false, reason: 'payload_mismatch' };
    }

    const receipt = await client.query(`select product_kind, result from payment_fulfillments where payment_id=$1 limit 1`, [pid]);
    if (receipt.rowCount > 0) {
      await client.query('rollback');
      return { applied: false, reason: 'receipt_without_applied' };
    }

    await client.query(
      `update payments
          set status='APPLYING',
              applying_by_user_id=$2,
              applying_at=now(),
              fulfillment_version=$3,
              updated_at=now()
        where id=$1`,
      [pid, appliedBy || null, FULFILLMENT_VERSION]
    );

    const context = payRow.fulfillment_context && typeof payRow.fulfillment_context === 'object'
      ? payRow.fulfillment_context
      : {};
    const rApply = await applyTx(client, payRow, context);
    if (!rApply || rApply.ok === false) {
      await client.query('rollback');
      return { applied: false, reason: rApply?.reason || 'apply_rejected' };
    }

    const result = mergeResult({ kind: productKind }, rApply);
    const resultJson = JSON.stringify(result);

    const rReceipt = await client.query(
      `insert into payment_fulfillments
         (payment_id, product_kind, result, applied_by_user_id, fulfillment_version)
       values ($1,$2,$3::jsonb,$4,$5)
       returning payment_id`,
      [pid, productKind, resultJson, appliedBy || null, FULFILLMENT_VERSION]
    );
    if (rReceipt.rowCount <= 0) throw new Error('fulfillment_receipt_failed');

    const rMark = await client.query(
      `update payments
          set status='APPLIED',
              applied_by_user_id=$2,
              applied_at=now(),
              note=coalesce($3, note),
              fulfillment_result=$4::jsonb,
              fulfillment_version=$5,
              updated_at=now()
        where id=$1
        returning id`,
      [pid, appliedBy || null, note || null, resultJson, FULFILLMENT_VERSION]
    );
    if (rMark.rowCount <= 0) throw new Error('mark_applied_failed');

    commitAttempted = true;
    await client.query('commit');
    return mergeResult({ applied: true }, result);
  } catch (e) {
    try { await client.query('rollback'); } catch {}
    if (commitAttempted) {
      const reconciled = await reconcileCommittedFulfillment(dbPool, pid);
      if (reconciled) return reconciled;
      return {
        applied: false,
        reason: 'commit_unknown',
        errorCode: String(e?.code || ''),
      };
    }
    return {
      applied: false,
      reason: isSchemaNotReady(e) ? 'schema_not_ready' : 'db_tx_failed',
      errorCode: String(e?.code || ''),
    };
  } finally {
    try { client.release(); } catch {}
  }
}

/**
 * Canonical Stars fulfillment service.
 * Product mutation, durable fulfillment receipt and payment=APPLIED commit in one DB transaction.
 * Redis/session cleanup and user messaging are deliberately post-commit caller responsibilities.
 */
export async function applyPaymentFulfillmentAtomic({
  paymentId,
  paymentUserId,
  invoicePayload,
  appliedByUserId,
  totalAmount = 0,
  currency = 'XTR',
  telegramPaymentChargeId = '',
  fulfillmentContext = null,
  validation = null,
  allowLegacyUnsignedValidated = false,
}, overrides = {}) {
  const dbPool = overrides.pool;
  const cfg = overrides.cfg || {};
  const recordIssue = overrides.recordPaymentsPayloadIssue || (async () => {});
  if (!dbPool || typeof dbPool.query !== 'function' || typeof dbPool.connect !== 'function') {
    return { applied: false, reason: 'ledger_unavailable' };
  }
  const payloadRaw = String(invoicePayload || '');

  if (!paymentId || !paymentUserId || !payloadRaw) return { applied: false, reason: 'bad_input' };
  if (payloadRaw.startsWith('offpub_')) return { applied: false, reason: 'manual_only' };

  const validationSnapshot = normalizeValidationSnapshot(validation, payloadRaw, totalAmount, currency);
  if (!validationSnapshot) return { applied: false, reason: 'validation_required' };
  if (validation?.meta?.userId && Number(validation.meta.userId) !== Number(paymentUserId)) {
    return { applied: false, reason: 'user_mismatch' };
  }

  let hv = verifyPayloadHmac(payloadRaw, cfg);
  const rawKind = paymentKindFromPayload(payloadRaw);
  if (!hv.ok && hv.reason === 'unsigned_payload' && allowLegacyUnsignedValidated && (rawKind === 'matching' || rawKind === 'featured')) {
    hv = { ok: true, signed: false, payloadNoSig: payloadRaw, mode: 'legacy_direct_validated' };
  }
  if (!hv.ok) {
    try {
      await recordIssue({
        issue: hv.reason || 'bad_sig', paymentId, userId: paymentUserId,
        tgId: appliedByUserId, kind: 'fulfillment', payload: payloadRaw,
      });
    } catch {}
    return { applied: false, reason: hv.reason || 'bad_sig' };
  }

  if (!hv.signed) {
    try {
      await recordIssue({
        issue: 'unsigned_payload', paymentId, userId: paymentUserId,
        tgId: appliedByUserId, kind: 'fulfillment', payload: payloadRaw,
        extra: [String(hv.mode || 'unsigned')],
      });
    } catch {}
  }

  const payload = String(hv.payloadNoSig || payloadRaw);
  const sigTag = hv.signed ? 'hmac' : 'unsigned';
  const productKind = paymentKindFromPayload(payload);
  if (productKind === 'unknown' || productKind === 'official_publish') {
    return { applied: false, reason: productKind === 'official_publish' ? 'manual_only' : 'unsupported_payload' };
  }

  const contextToPersist = {
    ...sanitizeContext(fulfillmentContext || {}),
    ...validationSnapshot,
  };
  const persisted = await persistFulfillmentContext({ dbPool, paymentId, context: contextToPersist });
  if (!persisted.ok) return { applied: false, reason: persisted.reason, errorCode: persisted.errorCode || '' };

  const common = {
    dbPool, cfg, paymentId, paymentUserId, appliedByUserId,
    telegramPaymentChargeId, payloadNoSig: payload, productKind,
    expectedAmount: validationSnapshot.validatedExpected,
    expectedCurrency: safeUpper(currency || 'XTR'),
  };

  if (productKind === 'pro') {
    const { wsId, payUserId } = parseProPayload(payload);
    if (!wsId) return { applied: false, reason: 'missing_wsid' };
    if (payUserId && Number(payUserId) !== Number(paymentUserId)) return { applied: false, reason: 'user_mismatch' };
    const days = Number(cfg.PRO_DURATION_DAYS || 30) || 30;
    return await applyPaymentAtomicTx({
      ...common,
      note: `atomic_apply_pro:${sigTag}`,
      applyTx: async (client) => {
        const okWs = await client.query(`select 1 from workspaces where id=$1 and owner_user_id=$2 limit 1`, [wsId, Number(paymentUserId)]);
        if (okWs.rowCount <= 0) return { ok: false, reason: 'no_ws_access' };
        const r = await client.query(
          `insert into workspace_settings (workspace_id, plan, pro_until, updated_at)
           values ($1, 'pro', now() + ($2::int || ' days')::interval, now())
           on conflict (workspace_id) do update
              set plan='pro',
                  pro_until = (case when workspace_settings.pro_until is null or workspace_settings.pro_until < now() then now() else workspace_settings.pro_until end) + ($2::int || ' days')::interval,
                  updated_at=now()
           returning workspace_id, pro_until`,
          [wsId, days]
        );
        if (r.rowCount <= 0) return { ok: false, reason: 'workspace_update_failed' };
        return { ok: true, kind: 'pro', wsId, days };
      },
    });
  }

  if (productKind === 'brand_pass') {
    const { userId, packId, packIdRaw } = parseBrandTopupPayload(payload);
    if (!userId || Number(userId) !== Number(paymentUserId)) return { applied: false, reason: 'user_mismatch' };
    const credits = brandPackCredits(packId, packIdRaw, cfg);
    if (!credits) return { applied: false, reason: 'bad_pack' };
    return await applyPaymentAtomicTx({
      ...common,
      note: `atomic_apply_brand_pass:${sigTag}:+${credits}`,
      applyTx: async (client) => {
        const r = await client.query(
          `update users set brand_credits=brand_credits+$2, brand_credits_updated_at=now(), updated_at=now()
            where id=$1 returning brand_credits`,
          [Number(paymentUserId), credits]
        );
        if (r.rowCount <= 0) return { ok: false, reason: 'no_user_row' };
        return { ok: true, kind: 'brand_pass', credits, brandCreditsBalance: Number(r.rows[0]?.brand_credits || 0) };
      },
    });
  }

  if (productKind === 'brand_plan') {
    const { userId, plan } = parseBrandPlanPayload(payload);
    if (!userId || Number(userId) !== Number(paymentUserId)) return { applied: false, reason: 'user_mismatch' };
    const planId = normalizeBrandPlanId(plan);
    if (!planId) return { applied: false, reason: 'bad_plan' };
    const days = Number(cfg.BRAND_PLAN_DURATION_DAYS || 30) || 30;
    const credits = Math.max(0, brandPlanCredits(planId, cfg));
    return await applyPaymentAtomicTx({
      ...common,
      note: `atomic_apply_brand_plan:${sigTag}:${planId}${credits ? `:+${credits}cr` : ''}`,
      applyTx: async (client) => {
        const rPlan = await client.query(
          `update users
              set brand_plan=$2,
                  brand_plan_until=(case when brand_plan_until is null or brand_plan_until < now() then now() else brand_plan_until end) + ($3::int || ' days')::interval,
                  brand_plan_updated_at=now(), updated_at=now()
            where id=$1 returning brand_plan, brand_plan_until, brand_credits`,
          [Number(paymentUserId), planId, days]
        );
        if (rPlan.rowCount <= 0) return { ok: false, reason: 'no_user_row' };
        let balance = Number(rPlan.rows[0]?.brand_credits || 0);
        if (credits > 0) {
          const rCr = await client.query(
            `update users set brand_credits=brand_credits+$2, brand_credits_updated_at=now(), updated_at=now()
              where id=$1 returning brand_credits`,
            [Number(paymentUserId), credits]
          );
          if (rCr.rowCount <= 0) return { ok: false, reason: 'no_user_row' };
          balance = Number(rCr.rows[0]?.brand_credits || 0);
        }
        return { ok: true, kind: 'brand_plan', plan: planId, days, credits, brandCreditsBalance: balance };
      },
    });
  }

  if (productKind === 'matching') {
    const { userId, tierId } = parseMatchingPayload(payload);
    if (!userId || Number(userId) !== Number(paymentUserId)) return { applied: false, reason: 'user_mismatch' };
    const count = matchingCount(tierId, cfg);
    if (!count) return { applied: false, reason: 'bad_tier' };
    return await applyPaymentAtomicTx({
      ...common,
      note: `atomic_apply_matching:${sigTag}:${tierId}`,
      applyTx: async (client) => {
        const r = await client.query(
          `insert into matching_requests (user_id, tier, stars_paid, status)
           values ($1,$2,$3,'PAID') returning id`,
          [Number(paymentUserId), tierId, Number(totalAmount || 0)]
        );
        if (r.rowCount <= 0) return { ok: false, reason: 'matching_create_failed' };
        return { ok: true, kind: 'matching', requestId: Number(r.rows[0].id), tierId, count };
      },
    });
  }

  if (productKind === 'featured') {
    const { userId, days } = parseFeaturedPayload(payload);
    if (!userId || Number(userId) !== Number(paymentUserId)) return { applied: false, reason: 'user_mismatch' };
    if (![1, 7, 30].includes(Number(days))) return { applied: false, reason: 'bad_duration' };
    return await applyPaymentAtomicTx({
      ...common,
      note: `atomic_apply_featured:${sigTag}:${days}d`,
      applyTx: async (client) => {
        const r = await client.query(
          `insert into featured_placements (user_id, duration_days, stars_paid, status)
           values ($1,$2,$3,'WAIT_CONTENT') returning id`,
          [Number(paymentUserId), Number(days), Number(totalAmount || 0)]
        );
        if (r.rowCount <= 0) return { ok: false, reason: 'featured_create_failed' };
        return { ok: true, kind: 'featured', featuredId: Number(r.rows[0].id), days: Number(days) };
      },
    });
  }

  if (productKind === 'founder') {
    const { productId, userId } = parseFounderPayload(payload);
    if (!userId || Number(userId) !== Number(paymentUserId)) return { applied: false, reason: 'user_mismatch' };
    const fallbackDays = founderDurationDays(productId);
    if (!fallbackDays) return { applied: false, reason: 'unsupported_founder_product' };

    return await applyPaymentAtomicTx({
      ...common,
      note: `atomic_apply_founder:${sigTag}:${productId}`,
      applyTx: async (client, _payRow, context) => {
        const days = Number(context.durationDays || fallbackDays) || fallbackDays;
        if (productId === 'founder_creator_12m') {
          const wsId = Number(context.wsId || 0);
          if (!wsId) return { ok: false, reason: 'missing_context' };
          const okWs = await client.query(`select 1 from workspaces where id=$1 and owner_user_id=$2 limit 1`, [wsId, Number(paymentUserId)]);
          if (okWs.rowCount <= 0) return { ok: false, reason: 'no_ws_access' };
          const r = await client.query(
            `insert into workspace_settings (workspace_id, plan, pro_until, updated_at)
             values ($1, 'pro', now() + ($2::int || ' days')::interval, now())
             on conflict (workspace_id) do update
                set plan='pro',
                    pro_until=(case when workspace_settings.pro_until is null or workspace_settings.pro_until < now() then now() else workspace_settings.pro_until end) + ($2::int || ' days')::interval,
                    updated_at=now()
             returning workspace_id`,
            [wsId, days]
          );
          if (r.rowCount <= 0) return { ok: false, reason: 'workspace_update_failed' };
          return { ok: true, kind: 'founder_creator', productId, wsId, days };
        }

        const credits = Math.max(0, Number(context.credits ?? founderBrandCredits(productId, cfg)) || 0);
        const rPlan = await client.query(
          `update users
              set brand_plan='pro',
                  brand_plan_until=(case when brand_plan_until is null or brand_plan_until < now() then now() else brand_plan_until end) + ($2::int || ' days')::interval,
                  brand_plan_updated_at=now(), updated_at=now()
            where id=$1 returning brand_credits`,
          [Number(paymentUserId), days]
        );
        if (rPlan.rowCount <= 0) return { ok: false, reason: 'no_user_row' };
        let balance = Number(rPlan.rows[0]?.brand_credits || 0);
        if (credits > 0) {
          const rCr = await client.query(
            `update users set brand_credits=brand_credits+$2, brand_credits_updated_at=now(), updated_at=now()
              where id=$1 returning brand_credits`,
            [Number(paymentUserId), credits]
          );
          if (rCr.rowCount <= 0) return { ok: false, reason: 'no_user_row' };
          balance = Number(rCr.rows[0]?.brand_credits || 0);
        }
        return { ok: true, kind: 'founder_brand', productId, days, credits, brandCreditsBalance: balance };
      },
    });
  }

  return { applied: false, reason: 'unsupported_payload' };
}

// Backward-compatible name used by cron/admin/QStash recovery paths.
export async function applyPaymentFallbackNoSession(args, overrides = {}) {
  return applyPaymentFulfillmentAtomic(args, overrides);
}

export const __paymentFulfillmentTestables = {
  FULFILLMENT_VERSION,
  APPLYING_STALE_AFTER_MS,
  paymentKindFromPayload,
  sanitizeContext,
  normalizeValidationSnapshot,
  verifyPayloadHmac,
};
