export const CRITICAL_SPINE_VERSION = 'STEP588X7_v1';

export const PORTABLE_SUITES = Object.freeze([
  { id: 'payments', script: 'scripts/test-payment-fulfillment-critical.js', roots: ['P1-2', 'P1-3', 'P1-4'] },
  { id: 'giveaways', script: 'scripts/test-giveaway-draw-critical.js', roots: ['P1-1', 'P1-6'] },
  { id: 'broadcast', script: 'scripts/test-broadcast-delivery-unknown-critical.js', roots: ['P1-5'] },
  { id: 'admin_auth', script: 'scripts/test-admin-web-auth-critical.js', roots: ['P1-7', 'P1-8'] },
  { id: 'health_privacy', script: 'scripts/test-health-privacy-readiness-critical.js', roots: ['P2-health', 'P2-privacy'] },
  { id: 'bounded_safety', script: 'scripts/test-bounded-safety-hardening.js', roots: ['P2-replay', 'P2-sql', 'P2-body', 'P2-config'] },
]);

export const INTEGRATION_CAPABILITIES = Object.freeze({
  postgres: {
    env: ['CRITICAL_TEST_DATABASE_URL', 'CRITICAL_TEST_CONFIRM_ISOLATED'],
    purpose: 'real PostgreSQL transaction, rollback, lock and ambiguous-receipt proof',
  },
  redis: {
    env: ['CRITICAL_TEST_REDIS_REST_URL', 'CRITICAL_TEST_REDIS_REST_TOKEN', 'CRITICAL_TEST_CONFIRM_ISOLATED'],
    purpose: 'real Redis SET NX/XX and Lua atomicity proof',
  },
});

export const P1_ROOTS = Object.freeze([
  'P1-1', 'P1-2', 'P1-3', 'P1-4', 'P1-5', 'P1-6', 'P1-7', 'P1-8',
]);
