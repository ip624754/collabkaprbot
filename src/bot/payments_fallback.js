import { CFG } from '../lib/config.js';
import { pool } from '../db/pool.js';
import { recordPaymentsPayloadIssue } from '../lib/paymentsOps.js';
import {
  applyPaymentFulfillmentAtomic as applyPaymentFulfillmentCore,
  __paymentFulfillmentTestables,
} from './paymentFulfillmentCore.js';

/**
 * Production adapter for the dependency-injected canonical fulfillment core.
 * Product mutation, durable receipt and payment=APPLIED are committed by the core
 * in one PostgreSQL transaction. Redis/session cleanup remains post-commit.
 */
export async function applyPaymentFulfillmentAtomic(args, overrides = {}) {
  return applyPaymentFulfillmentCore(args, {
    pool: overrides.pool || pool,
    cfg: overrides.cfg || CFG,
    recordPaymentsPayloadIssue: overrides.recordPaymentsPayloadIssue || recordPaymentsPayloadIssue,
  });
}

// Backward-compatible name used by direct, cron, admin and QStash recovery paths.
export async function applyPaymentFallbackNoSession(args, overrides = {}) {
  return applyPaymentFulfillmentAtomic(args, overrides);
}

export { __paymentFulfillmentTestables };
